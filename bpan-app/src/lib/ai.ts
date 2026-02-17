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

// Groq free tier models — very fast inference, generous free limits
const GROQ_FREE_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
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

/**
 * Call Groq API with automatic retry across multiple free models.
 * Groq offers very fast inference with generous free-tier limits.
 * Set GROQ_API_KEY in env to enable. Get free key at https://console.groq.com
 */
async function callGroqWithFallback(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 400
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const groq = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey,
  });

  for (const model of GROQ_FREE_MODELS) {
    try {
      console.log(`Trying Groq model: ${model}`);
      const completion = await groq.chat.completions.create({
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
      if (msg.includes("429") || msg.includes("rate limit")) {
        console.warn(`Groq model ${model} rate limited, trying next...`);
        await sleep(1000);
        continue;
      }
      console.warn(`Groq model ${model} failed:`, msg);
      continue;
    }
  }

  throw new Error("All Groq models failed");
}

/**
 * Universal AI call: tries Gemini → Groq → OpenRouter in order.
 * This is the preferred way to make AI calls — it automatically handles
 * rate limits and provider failures.
 */
export async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 400,
): Promise<string> {
  // 1. Try Gemini (free, good quality)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      return await callGeminiWithFallback(genAI, systemPrompt, userMessage);
    } catch {
      console.warn("Gemini failed, trying next provider...");
    }
  }

  // 2. Try Groq (free, very fast)
  if (process.env.GROQ_API_KEY) {
    try {
      return await callGroqWithFallback(process.env.GROQ_API_KEY, systemPrompt, userMessage, maxTokens);
    } catch {
      console.warn("Groq failed, trying next provider...");
    }
  }

  // 3. Try OpenRouter (free models)
  if (process.env.OPENROUTER_API_KEY) {
    return await callOpenRouterWithFallback(process.env.OPENROUTER_API_KEY, systemPrompt, userMessage, maxTokens);
  }

  throw new Error("No AI providers available. Please configure at least one API key.");
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a biomedical research assistant. Given a paper's title and abstract, provide a concise summary in 2-3 sentences that captures:
1. The key finding or conclusion
2. The method or approach used
3. Why it matters (clinical or scientific relevance)

Be precise and use accessible scientific language. Do not start with "This paper" or "This study".`;

/**
 * Generate a short AI summary of a paper given its title and abstract.
 * Now uses unified callAI with Gemini → Groq → OpenRouter fallback chain.
 * Accepts optional research context for personalized summaries.
 */
export async function summarizePaper(
  title: string,
  abstract: string,
  researchContext?: string,
): Promise<string> {
  const contextAugmented = researchContext
    ? `${SYSTEM_PROMPT}\n\nThe student's research context:\n${researchContext}\n\nHighlight any relevance to their work if applicable.`
    : SYSTEM_PROMPT;

  return callAI(contextAugmented, `Title: ${title}\n\nAbstract: ${abstract}`, 250);
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
 * Now uses unified callAI and accepts optional research context.
 */
export async function structureNote(
  highlight: string,
  paperTitle: string,
  paperAbstract: string,
  authors?: string[],
  journal?: string,
  pubDate?: string,
  researchContext?: string,
): Promise<StructuredNote> {
  const authorStr = authors?.length ? authors.join(", ") : "Unknown authors";
  const journalStr = journal || "Unknown journal";
  const dateStr = pubDate || "";

  const userMessage = `Paper: "${paperTitle}"
Authors: ${authorStr}
Journal: ${journalStr} ${dateStr}

Abstract: ${paperAbstract}

Highlighted text: "${highlight}"`;

  const systemPrompt = researchContext
    ? `${NOTE_SYSTEM_PROMPT}\n\nStudent's research context:\n${researchContext}\n\nIncorporate relevant connections to their work in the note.`
    : NOTE_SYSTEM_PROMPT;

  const text = await callAI(systemPrompt, userMessage, 300);
  return JSON.parse(extractJSON(text)) as StructuredNote;
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
 * Now uses unified callAI with Gemini → Groq → OpenRouter chain.
 */
export async function extractMethods(
  highlight: string,
  paperTitle: string,
  paperAbstract: string,
  researchContext?: string,
): Promise<ExtractedMethods> {
  const userMessage = `Paper: "${paperTitle}"

Abstract: ${paperAbstract}

Highlighted text to extract methods from: "${highlight}"`;

  const systemPrompt = researchContext
    ? `${METHODS_SYSTEM_PROMPT}\n\nStudent's research context:\n${researchContext}\n\nNote any relevance to their model systems or techniques.`
    : METHODS_SYSTEM_PROMPT;

  const text = await callAI(systemPrompt, userMessage, 500);
  return JSON.parse(extractJSON(text)) as ExtractedMethods;
}

// ─── Extract Action Items from Meeting Notes ────────────────────────────────

export async function extractActionItems(notes: string, researchContext?: string): Promise<string[]> {
  const systemInstruction = researchContext
    ? `You are a research assistant helping a biomedical PhD student extract action items from advisor meeting notes.\n\nStudent's research context:\n${researchContext}\n\nUse this context to better understand abbreviations and project-specific terms in the notes.`
    : "You are a research assistant helping a biomedical PhD student extract action items from advisor meeting notes.";

  const prompt = `Read the following meeting notes and extract ALL action items, tasks, to-dos, follow-ups, and things that need to be done. Each action item should be a short, clear, actionable sentence.

Return ONLY a JSON array of strings, nothing else. Example: ["Order more antibodies", "Email Dr. Smith about timeline", "Run Western blot on sample 3"]

If there are no action items, return an empty array: []

MEETING NOTES:
${notes}`;

  const raw = await callAI(systemInstruction, prompt, 600);

  // Parse the JSON array from the AI response
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    return raw
      .split("\n")
      .map((l) => l.replace(/^[-•*\d.)\]]+\s*/, "").trim())
      .filter((l) => l.length > 3);
  }
  return [];
}

// ─── Meeting Notes Summary ──────────────────────────────────────────────────

export async function summarizeMeetingNotes(
  notes: string,
  actionItems: string,
  researchContext?: string,
): Promise<string> {
  const systemInstruction = researchContext
    ? `You are a research assistant helping a biomedical PhD student. Summarize their advisor meeting notes into a clear, concise summary.\n\nStudent's research context:\n${researchContext}\n\nUse this context to better understand project-specific terms and connect discussion points to their research.`
    : "You are a research assistant helping a biomedical PhD student. Summarize their advisor meeting notes into a clear, concise summary.";

  const prompt = `Summarize the following meeting notes into a structured summary with these sections:

## Key Discussion Points
- (bullet points of what was discussed)

## Decisions Made
- (any decisions or agreements reached)

## Action Items
- (list of things to do, who's responsible if mentioned)

## Notes for Next Meeting
- (topics to follow up on)

Keep it concise but don't miss important details. Use the action items list to inform the summary.

MEETING NOTES:
${notes}

${actionItems ? `ACTION ITEMS:\n${actionItems}` : ""}`;

  return callAI(systemInstruction, prompt, 800);
}

// ─── AI Literature Scout Analysis ────────────────────────────────────────────

export interface ScoutAnalysis {
  summary: string;
  relevance: string;
  ideas: string;
  relevance_score: number;
}

/**
 * AI reads a paper abstract and explains it to the user as a research assistant,
 * relating it to their research interests (BPAN / neurodegeneration / iron / mouse models).
 */
export async function scoutAnalyzePaper(
  title: string,
  abstract: string,
  matchedKeyword: string,
  researchContext?: string,
): Promise<ScoutAnalysis> {
  const systemInstruction = `You are an AI research assistant for a PhD student studying BPAN (Beta-propeller Protein-Associated Neurodegeneration), a rare neurological disorder. Their research involves mouse models, iron metabolism, neurodegeneration, EEG, behavior experiments, and translational medicine.

${researchContext ? `Additional research context:\n${researchContext}` : ""}

Analyze the following paper and provide:
1. A 2-3 sentence summary of what the paper found (written plainly, as if explaining to a colleague)
2. Why this paper is relevant to the student's BPAN research
3. Creative brainstorm: what experiments or ideas could the student pursue based on this paper?
4. A relevance score from 0-100 (100 = directly about BPAN or their exact model, 50 = related field, 0 = unrelated)

Respond with ONLY valid JSON:
{
  "summary": "...",
  "relevance": "...",
  "ideas": "...",
  "relevance_score": 50
}`;

  const prompt = `Paper matched keyword: "${matchedKeyword}"
Title: ${title}
Abstract: ${abstract || "No abstract available."}`;

  const text = await callAI(systemInstruction, prompt, 500);

  try {
    const json = JSON.parse(extractJSON(text));
    return {
      summary: json.summary || "Could not generate summary.",
      relevance: json.relevance || "Could not assess relevance.",
      ideas: json.ideas || "No ideas generated.",
      relevance_score: typeof json.relevance_score === "number" ? json.relevance_score : 50,
    };
  } catch {
    return {
      summary: text.slice(0, 300),
      relevance: "AI returned non-JSON response.",
      ideas: "",
      relevance_score: 50,
    };
  }
}

