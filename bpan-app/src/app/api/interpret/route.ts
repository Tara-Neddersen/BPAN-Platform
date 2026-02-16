import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { test_type, results, dataset_name, column_names } = await req.json();

    const prompt = `You are a biostatistics expert helping a biomedical researcher interpret their results.

Dataset: "${dataset_name || "Untitled"}"
Test performed: ${test_type}
Variables: ${column_names?.join(", ") || "Not specified"}

Results:
${JSON.stringify(results, null, 2)}

Provide a clear, plain-English interpretation in 3-5 sentences. Include:
1. What the test found (significant or not, with the actual numbers)
2. The practical meaning / effect size interpretation
3. Any caveats or recommendations (e.g. sample size concerns, assumptions)

Write for a PhD student — be precise but avoid jargon walls. Use numbers from the results.`;

    let interpretation = "";

    // Try Gemini first
    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });
        const result = await model.generateContent(prompt);
        interpretation = result.response.text();
      } catch (e) {
        console.warn("Gemini interpretation failed, trying OpenRouter:", e);
      }
    }

    // Fallback to OpenRouter
    if (!interpretation && process.env.OPENROUTER_API_KEY) {
      try {
        const openrouter = new OpenAI({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
        });
        const res = await openrouter.chat.completions.create({
          model: "google/gemma-3-27b-it:free",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
        });
        interpretation = res.choices[0]?.message?.content || "";
      } catch (e) {
        console.warn("OpenRouter interpretation failed:", e);
      }
    }

    if (!interpretation) {
      interpretation =
        "AI interpretation unavailable. Please check your API keys.";
    }

    return NextResponse.json({ interpretation });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

