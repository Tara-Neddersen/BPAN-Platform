import { GoogleGenerativeAI } from "@google/generative-ai";

// Free models on OpenRouter — we try multiple to avoid single-model rate limits
// Avoid "thinking" models (DeepSeek R1) as they wrap output in <think> tags
const OPENROUTER_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-4b:free",
  "nvidia/nemotron-nano-9b-v2:free",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract JSON from AI response text, handling markdown fences,
 * thinking tags, and other wrapping that models may add.
 */
function extractJSON(text: string): string {
  // Remove <think>...</think> blocks (DeepSeek R1 style)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  // Try to find first { and last } to extract JSON object
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

// Gemini models to try in order — each has its own separate quota
// supportsSystemInstruction: false for Gemma models (they 400 on systemInstruction)
const GEMINI_MODELS: { name: string; supportsSystemInstruction: boolean }[] = [
  { name: "gemini-2.0-flash", supportsSystemInstruction: true },
  { name: "gemma-3-27b-it", supportsSystemInstruction: false },
];

/**
 * Call Gemini, trying multiple models if the first is rate-limited.
 * For models that don't support systemInstruction, it's prepended to the prompt.
 */
async function callGeminiWithFallback(
  genAI: GoogleGenerativeAI,
  systemInstruction: string | undefined,
  prompt: string
): Promise<string> {
  for (const { name: modelName, supportsSystemInstruction } of GEMINI_MODELS) {
    try {
      const useSystemInstruction = systemInstruction && supportsSystemInstruction;
      const model = genAI.getGenerativeModel({
        model: modelName,
        ...(useSystemInstruction ? { systemInstruction } : {}),
      });

      // For models without system instruction support, prepend it to the prompt
      const finalPrompt = !supportsSystemInstruction && systemInstruction
        ? `${systemInstruction}\n\n${prompt}`
        : prompt;

      const result = await model.generateContent(finalPrompt);
      console.log(`✅ Gemini model ${modelName} succeeded`);
      return result.response.text().trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const isRateLimit = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");

      if (isRateLimit) {
        console.warn(`Gemini model ${modelName} rate limited, trying next...`);
        continue;
      }
      console.warn(`Gemini model ${modelName} error:`, msg.slice(0, 100));
      continue; // try next model on any error
    }
  }
  throw new Error("All Gemini models failed");
}

/**
 * Call OpenRouter with automatic retry across multiple free models.
 * If one model is rate-limited, tries the next one.
 */
async function callOpenRouterWithFallback(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 400
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      console.log(`Trying OpenRouter model: ${model}`);
      const completion = await openrouter.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const isRateLimit = msg.includes("429") || msg.includes("rate limit");

      if (isRateLimit) {
        console.warn(`OpenRouter model ${model} rate limited, trying next...`);
        await sleep(2000); // brief pause before trying next model
        continue;
      }
      console.warn(`OpenRouter model ${model} failed:`, msg);
      continue; // try next model on any error
    }
  }

  throw new Error(
    "All AI models are currently rate-limited. Please wait a minute and try again."
  );
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a biomedical research assistant. Given a paper's title and abstract, provide a concise summary in 2-3 sentences that captures:
1. The key finding or conclusion
2. The method or approach used
3. Why it matters (clinical or scientific relevance)

Be precise and use accessible scientific language. Do not start with "This paper" or "This study".`;

/**
 * Generate a short AI summary of a paper given its title and abstract.
 * Uses Google Gemini (free tier) by default, falls back to OpenRouter if needed.
 */
export async function summarizePaper(
  title: string,
  abstract: string
): Promise<string> {
  // Try Gemini first (free tier, with retry on rate limits)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const summary = await callGeminiWithFallback(
        genAI,
        SYSTEM_PROMPT,
        `Title: ${title}\n\nAbstract: ${abstract}`
      );
      if (summary) return summary;
    } catch (err) {
      console.warn("Gemini failed, trying OpenRouter fallback:", err);
    }
  }

  // Fallback to OpenRouter free models
  if (process.env.OPENROUTER_API_KEY) {
    return callOpenRouterWithFallback(
      process.env.OPENROUTER_API_KEY,
      SYSTEM_PROMPT,
      `Title: ${title}\n\nAbstract: ${abstract}`,
      200
    );
  }

  throw new Error(
    "AI unavailable — Gemini quota exhausted and no OPENROUTER_API_KEY set."
  );
}

const NOTE_SYSTEM_PROMPT = `You are a biomedical research assistant helping a PhD student take structured notes on papers.

Given a highlighted text excerpt from a paper, along with the paper's title, authors, journal, and abstract for context, create a STANDALONE research note.

The note MUST make complete sense on its own — if the student reads this note weeks later without the paper in front of them, they should fully understand the key point.

Respond with a JSON object containing:
- "content": A clear, self-contained note (2-4 sentences). Start with context (e.g. "In a study of X using Y model..."), then state the key finding/method/observation. Do NOT use phrases like "the paper states" or "according to the authors". Write it as the student's own research note that captures the insight.
- "noteType": One of "finding", "method", "limitation", or "general" — classify what the highlight represents.
- "suggestedTags": An array of 1-3 short topic tags relevant to this note (e.g. "iron metabolism", "Western blot", "mouse model").

Respond with ONLY valid JSON, no markdown formatting.`;

export interface StructuredNote {
  content: string;
  noteType: string;
  suggestedTags: string[];
}

/**
 * Generate a structured note from a highlight using AI.
 */
export async function structureNote(
  highlight: string,
  paperTitle: string,
  paperAbstract: string,
  authors?: string[],
  journal?: string,
  pubDate?: string
): Promise<StructuredNote> {
  const authorStr = authors?.length ? authors.join(", ") : "Unknown authors";
  const journalStr = journal || "Unknown journal";
  const dateStr = pubDate || "";

  const userMessage = `Paper: "${paperTitle}"
Authors: ${authorStr}
Journal: ${journalStr} ${dateStr}

Abstract: ${paperAbstract}

Highlighted text: "${highlight}"`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const text = await callGeminiWithFallback(
        genAI,
        NOTE_SYSTEM_PROMPT,
        userMessage
      );
      return JSON.parse(extractJSON(text)) as StructuredNote;
    } catch (err) {
      console.warn("Gemini note structuring failed:", err);
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    const text = await callOpenRouterWithFallback(
      process.env.OPENROUTER_API_KEY,
      NOTE_SYSTEM_PROMPT,
      userMessage,
      300
    );
    return JSON.parse(extractJSON(text)) as StructuredNote;
  }

  throw new Error(
    "AI unavailable — Gemini quota exhausted and no OPENROUTER_API_KEY set."
  );
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a piece of text using Gemini's
 * gemini-embedding-001 model (free tier, 3072 dimensions).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY required for embeddings");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ─── Methods Extractor ───────────────────────────────────────────────────────

const METHODS_SYSTEM_PROMPT = `You are a biomedical research assistant specializing in extracting experimental protocol details from scientific papers.

Given a highlighted text excerpt from a paper, extract structured protocol/methods information.

Respond with a JSON object containing:
- "protocol_summary": A concise 1-2 sentence summary of the method/protocol described.
- "model_system": The model system used (e.g. "C57BL/6 mice", "HeLa cells", "patient cohort", "in silico") or null if not mentioned.
- "key_reagents": Array of reagents/antibodies/drugs mentioned with concentrations if given (e.g. ["rapamycin (10 nM)", "anti-WDR45 antibody (1:1000)"]).
- "timepoints": Array of timepoints or durations mentioned (e.g. ["24 hours", "7 days post-injection"]).
- "sample_size": Sample size or N if mentioned (e.g. "n=6 per group") or null.
- "technique": The primary technique (e.g. "Western blot", "qPCR", "flow cytometry", "behavioral assay").
- "key_parameters": Array of other important parameters (e.g. ["4°C overnight incubation", "300g centrifugation", "PVDF membrane"]).
- "statistical_method": Statistical test used if mentioned (e.g. "two-tailed t-test") or null.
- "suggestedTags": Array of 2-4 topic tags for this methods note.

If a field is not mentioned in the text, use null for strings or empty array for arrays.
Respond with ONLY valid JSON, no markdown formatting.`;

export interface ExtractedMethods {
  protocol_summary: string;
  model_system: string | null;
  key_reagents: string[];
  timepoints: string[];
  sample_size: string | null;
  technique: string | null;
  key_parameters: string[];
  statistical_method: string | null;
  suggestedTags: string[];
}

/**
 * Extract structured protocol/methods details from highlighted text.
 */
export async function extractMethods(
  highlight: string,
  paperTitle: string,
  paperAbstract: string
): Promise<ExtractedMethods> {
  const userMessage = `Paper: "${paperTitle}"

Abstract: ${paperAbstract}

Highlighted text to extract methods from: "${highlight}"`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const text = await callGeminiWithFallback(
        genAI,
        METHODS_SYSTEM_PROMPT,
        userMessage
      );
      return JSON.parse(extractJSON(text)) as ExtractedMethods;
    } catch (err) {
      console.warn("Gemini methods extraction failed:", err);
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    const text = await callOpenRouterWithFallback(
      process.env.OPENROUTER_API_KEY,
      METHODS_SYSTEM_PROMPT,
      userMessage,
      500
    );
    return JSON.parse(extractJSON(text)) as ExtractedMethods;
  }

  throw new Error(
    "AI unavailable — Gemini quota exhausted and no OPENROUTER_API_KEY set."
  );
}

