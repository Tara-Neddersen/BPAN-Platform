import { NextResponse } from "next/server";
import { summarizePaper } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { buildLightContext } from "@/lib/ai-context";

export async function POST(request: Request) {
  try {
    const { title, abstract } = await request.json();

    if (!title || !abstract) {
      return NextResponse.json(
        { error: "Title and abstract are required" },
        { status: 400 }
      );
    }

    // Get user context for personalized summaries
    let researchContext: string | undefined;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        researchContext = await buildLightContext(user.id);
      }
    } catch {
      // If context fetch fails, proceed without it
    }

    const summary = await summarizePaper(title, abstract, researchContext);
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Summarize error:", err);
    const message = err instanceof Error ? err.message : "Failed to summarize";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
