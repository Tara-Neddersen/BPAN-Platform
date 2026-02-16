import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai";

/**
 * POST /api/notes/search
 * Semantic search across all user notes using pgvector similarity.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query, limit = 20 } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);

    // Use the match_notes function for similarity search
    const { data: notes, error } = await supabase.rpc("match_notes", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_user_id: user.id,
      match_count: limit,
      match_threshold: 0.55,
    });

    if (error) {
      console.error("Semantic search error:", error);
      return NextResponse.json(
        { error: "Semantic search failed. Have you run migration 005?" },
        { status: 500 }
      );
    }

    // Fetch paper info for each note
    const paperIds = [...new Set((notes || []).map((n: { paper_id: string }) => n.paper_id))];
    let papersMap: Record<string, { title: string; pmid: string; journal: string | null }> = {};

    if (paperIds.length > 0) {
      const { data: papers } = await supabase
        .from("saved_papers")
        .select("id, title, pmid, journal")
        .in("id", paperIds);

      if (papers) {
        for (const p of papers) {
          papersMap[p.id] = { title: p.title, pmid: p.pmid, journal: p.journal };
        }
      }
    }

    // Enrich notes with paper data
    const enrichedNotes = (notes || []).map((note: Record<string, unknown>) => ({
      ...note,
      saved_papers: papersMap[note.paper_id as string] || {
        title: "Unknown",
        pmid: "",
        journal: null,
      },
    }));

    return NextResponse.json({ notes: enrichedNotes });
  } catch (err) {
    console.error("Semantic search error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to perform semantic search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

