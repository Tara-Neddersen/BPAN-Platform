import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSuggestions } from "@/lib/advisor";
import type { AdvisorContext } from "@/lib/advisor";
import type {
  ResearchContext,
  Hypothesis,
  NoteWithPaper,
  SavedPaper,
} from "@/types";

/**
 * GET /api/advisor/suggestions
 * Get proactive research suggestions based on user's context.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch context
    const [
      { data: researchContext },
      { data: hypotheses },
      { data: recentNotes },
      { data: savedPapers },
    ] = await Promise.all([
      supabase
        .from("research_context")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("hypotheses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("*, saved_papers(title, pmid, journal)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("saved_papers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const context: AdvisorContext = {
      researchContext: (researchContext as ResearchContext) || null,
      recentNotes: (recentNotes as NoteWithPaper[]) || [],
      savedPapers: (savedPapers as SavedPaper[]) || [],
      hypotheses: (hypotheses as Hypothesis[]) || [],
    };

    // Check that there's enough context to make suggestions
    if (!context.researchContext && context.recentNotes.length === 0 && context.hypotheses.length === 0) {
      return NextResponse.json({
        suggestions: [],
        message: "Set up your research context first to get personalized suggestions.",
      });
    }

    const suggestions = await generateSuggestions(context);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("Suggestions error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate suggestions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

