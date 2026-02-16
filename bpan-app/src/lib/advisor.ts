import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  ResearchContext,
  Hypothesis,
  NoteWithPaper,
  SavedPaper,
} from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AdvisorContext {
  researchContext: ResearchContext | null;
  recentNotes: NoteWithPaper[];
  savedPapers: SavedPaper[];
  hypotheses: Hypothesis[];
  currentPage?: string; // e.g. "paper:uuid", "notes", "dashboard"
}

// ─── System Prompt Builder ───────────────────────────────────────────────────

function buildSystemPrompt(ctx: AdvisorContext): string {
  const parts: string[] = [];

  parts.push(`You are an AI research advisor for a PhD student studying BPAN (Beta-Propeller Protein-Associated Neurodegeneration), a rare neurodegenerative disease caused by WDR45 gene mutations.

Your role is to:
1. Answer questions about their research, papers, and experiments
2. Suggest next steps and identify gaps in their research
3. Play devil's advocate — question assumptions, suggest controls, identify confounders
4. Connect findings across papers and experiments
5. Help troubleshoot experimental issues
6. Help with experimental design and statistical approaches

Be concise but thorough. Use specific details from their research context when relevant.
When suggesting papers or methods, be specific — cite techniques, model systems, and approaches.
If you don't know something, say so clearly rather than guessing.`);

  // Research context
  if (ctx.researchContext) {
    const rc = ctx.researchContext;
    const contextParts: string[] = [];
    if (rc.thesis_title) contextParts.push(`Thesis: "${rc.thesis_title}"`);
    if (rc.thesis_summary) contextParts.push(`Summary: ${rc.thesis_summary}`);
    if (rc.aims.length) contextParts.push(`Specific Aims:\n${rc.aims.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}`);
    if (rc.key_questions.length) contextParts.push(`Open Questions:\n${rc.key_questions.map((q) => `  - ${q}`).join("\n")}`);
    if (rc.model_systems.length) contextParts.push(`Model Systems: ${rc.model_systems.join(", ")}`);
    if (rc.key_techniques.length) contextParts.push(`Key Techniques: ${rc.key_techniques.join(", ")}`);

    if (contextParts.length) {
      parts.push(`\n--- STUDENT'S RESEARCH CONTEXT ---\n${contextParts.join("\n")}`);
    }
  }

  // Hypotheses
  if (ctx.hypotheses.length) {
    const hypoText = ctx.hypotheses.map((h) => {
      let line = `• [${h.status.toUpperCase()}] ${h.title}`;
      if (h.description) line += ` — ${h.description}`;
      if (h.aim) line += ` (Aim: ${h.aim})`;
      if (h.evidence_for.length) line += `\n    Evidence for: ${h.evidence_for.join("; ")}`;
      if (h.evidence_against.length) line += `\n    Evidence against: ${h.evidence_against.join("; ")}`;
      return line;
    }).join("\n");
    parts.push(`\n--- ACTIVE HYPOTHESES ---\n${hypoText}`);
  }

  // Recent notes (last 15 for context window management)
  if (ctx.recentNotes.length) {
    const notesText = ctx.recentNotes.slice(0, 15).map((n) => {
      let line = `• [${n.note_type}] ${n.content}`;
      if (n.tags.length) line += ` (tags: ${n.tags.join(", ")})`;
      line += ` — from "${n.saved_papers.title}"`;
      return line;
    }).join("\n");
    parts.push(`\n--- RECENT RESEARCH NOTES (${ctx.recentNotes.length} total) ---\n${notesText}`);
  }

  // Papers in library
  if (ctx.savedPapers.length) {
    const papersText = ctx.savedPapers.slice(0, 20).map((p) => {
      const authors = p.authors.length > 2
        ? `${p.authors[0]} et al.`
        : p.authors.join(", ");
      return `• "${p.title}" — ${authors}, ${p.journal || "Unknown journal"} (${p.pub_date || "n.d."})`;
    }).join("\n");
    parts.push(`\n--- PAPER LIBRARY (${ctx.savedPapers.length} papers) ---\n${papersText}`);
  }

  return parts.join("\n");
}

// ─── Chat Completion ─────────────────────────────────────────────────────────

const OPENROUTER_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-4b:free",
  "nvidia/nemotron-nano-9b-v2:free",
];

const GEMINI_MODELS: { name: string; supportsSystemInstruction: boolean }[] = [
  { name: "gemini-2.0-flash", supportsSystemInstruction: true },
  { name: "gemma-3-27b-it", supportsSystemInstruction: false },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate an advisor response given conversation history and research context.
 * Tries Gemini first, then falls back to OpenRouter free models.
 */
export async function generateAdvisorResponse(
  messages: ChatMessage[],
  context: AdvisorContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      for (const { name: modelName, supportsSystemInstruction } of GEMINI_MODELS) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            ...(supportsSystemInstruction ? { systemInstruction: systemPrompt } : {}),
          });

          // Build chat history for Gemini
          const history = messages.slice(0, -1).map((m) => ({
            role: m.role === "assistant" ? ("model" as const) : ("user" as const),
            parts: [{ text: m.content }],
          }));

          const lastMessage = messages[messages.length - 1];
          const userPrompt = !supportsSystemInstruction
            ? `${systemPrompt}\n\n${lastMessage.content}`
            : lastMessage.content;

          const chat = model.startChat({ history });
          const result = await chat.sendMessage(userPrompt);
          console.log(`✅ Advisor: Gemini model ${modelName} succeeded`);
          return result.response.text().trim();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "";
          const isRateLimit = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
          if (isRateLimit) {
            console.warn(`Advisor: Gemini model ${modelName} rate limited, trying next...`);
            continue;
          }
          console.warn(`Advisor: Gemini model ${modelName} error:`, msg.slice(0, 100));
          continue;
        }
      }
    } catch (err) {
      console.warn("Advisor: All Gemini models failed, trying OpenRouter:", err);
    }
  }

  // Fallback to OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    for (const model of OPENROUTER_FREE_MODELS) {
      try {
        console.log(`Advisor: Trying OpenRouter model: ${model}`);
        const completion = await openrouter.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((m) => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
            })),
          ],
          max_tokens: 1000,
          temperature: 0.4,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        if (text) return text;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("429") || msg.includes("rate limit")) {
          console.warn(`Advisor: OpenRouter ${model} rate limited, trying next...`);
          await sleep(2000);
          continue;
        }
        console.warn(`Advisor: OpenRouter ${model} failed:`, msg);
        continue;
      }
    }
  }

  throw new Error(
    "All AI models are currently unavailable. Please wait a minute and try again."
  );
}

// ─── Proactive Suggestions ───────────────────────────────────────────────────

const SUGGESTION_PROMPT = `Based on the student's research context, recent notes, and hypotheses, generate 2-3 brief, actionable suggestions for what they should focus on next.

Each suggestion should be:
- Specific and actionable (not vague)
- Connected to their existing work (reference their notes, papers, or hypotheses)
- One of these types: "read" (paper to read), "experiment" (experiment to try), "question" (question to investigate), "gap" (research gap to fill)

Respond with a JSON array of objects, each with:
- "type": one of "read", "experiment", "question", "gap"
- "suggestion": the actionable suggestion (1-2 sentences)
- "rationale": why this is important (1 sentence)

Respond with ONLY valid JSON, no markdown formatting.`;

export interface ProactiveSuggestion {
  type: "read" | "experiment" | "question" | "gap";
  suggestion: string;
  rationale: string;
}

/**
 * Generate proactive research suggestions based on user's context.
 */
export async function generateSuggestions(
  context: AdvisorContext
): Promise<ProactiveSuggestion[]> {
  const systemPrompt = buildSystemPrompt(context);
  const fullPrompt = `${systemPrompt}\n\n${SUGGESTION_PROMPT}`;

  let responseText: string;

  // Try Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      for (const { name: modelName, supportsSystemInstruction } of GEMINI_MODELS) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            ...(supportsSystemInstruction ? { systemInstruction: systemPrompt } : {}),
          });
          const prompt = supportsSystemInstruction ? SUGGESTION_PROMPT : fullPrompt;
          const result = await model.generateContent(prompt);
          responseText = result.response.text().trim();

          // Clean and parse
          responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
          responseText = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          const firstBracket = responseText.indexOf("[");
          const lastBracket = responseText.lastIndexOf("]");
          if (firstBracket !== -1 && lastBracket !== -1) {
            responseText = responseText.slice(firstBracket, lastBracket + 1);
          }

          return JSON.parse(responseText) as ProactiveSuggestion[];
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "";
          if (msg.includes("429") || msg.includes("quota")) continue;
          continue;
        }
      }
    } catch {
      // fall through to OpenRouter
    }
  }

  // Fallback to OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    for (const model of OPENROUTER_FREE_MODELS) {
      try {
        const completion = await openrouter.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: SUGGESTION_PROMPT },
          ],
          max_tokens: 600,
          temperature: 0.5,
        });

        responseText = completion.choices[0]?.message?.content?.trim() || "";
        responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        responseText = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const firstBracket = responseText.indexOf("[");
        const lastBracket = responseText.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          responseText = responseText.slice(firstBracket, lastBracket + 1);
        }

        return JSON.parse(responseText) as ProactiveSuggestion[];
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("429")) {
          await sleep(2000);
          continue;
        }
        continue;
      }
    }
  }

  return [];
}

// ─── Auto-title Conversation ─────────────────────────────────────────────────

/**
 * Generate a short title for a conversation based on the first user message.
 */
export async function generateConversationTitle(firstMessage: string): Promise<string> {
  const prompt = `Given this research question/message, generate a very short title (3-6 words) that captures the topic. Reply with ONLY the title, nothing else.\n\nMessage: "${firstMessage.slice(0, 300)}"`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const title = result.response.text().trim().replace(/^["']|["']$/g, "");
      return title.slice(0, 60);
    } catch {
      // fall through
    }
  }

  // Simple fallback: first few words
  return firstMessage.split(/\s+/).slice(0, 5).join(" ").slice(0, 60) + "...";
}

