import { GoogleGenerativeAI } from "@google/generative-ai";

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
  // Try Gemini first (free tier)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        systemInstruction: SYSTEM_PROMPT,
      });

      const result = await model.generateContent(
        `Title: ${title}\n\nAbstract: ${abstract}`
      );
      const summary = result.response.text().trim();
      
      if (summary) return summary;
    } catch (err) {
      console.warn("Gemini failed, trying OpenRouter fallback:", err);
    }
  }

  // Fallback to OpenRouter if Gemini fails or isn't configured
  if (process.env.OPENROUTER_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const completion = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Title: ${title}\n\nAbstract: ${abstract}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (summary) return summary;
  }

  throw new Error("No AI provider configured (GEMINI_API_KEY or OPENROUTER_API_KEY required)");
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
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: NOTE_SYSTEM_PROMPT,
      });

      const result = await model.generateContent(userMessage);
      const text = result.response.text().trim();
      const cleaned = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned) as StructuredNote;
    } catch (err) {
      console.warn("Gemini note structuring failed:", err);
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const completion = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: NOTE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (text) {
      const cleaned = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned) as StructuredNote;
    }
  }

  throw new Error("No AI provider configured");
}
