import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai";
import {
  classifySemanticSearchFailure,
  hasEmbeddingProviderConfigured,
  isEmbeddingsUnavailableError,
  type NotesSemanticErrorCode,
} from "@/lib/notes-semantic";

function notesSearchError(status: number, errorCode: NotesSemanticErrorCode, error: string) {
  return NextResponse.json({ errorCode, error }, { status });
}

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
      return notesSearchError(401, "unauthorized", "Unauthorized");
    }

    const { query, limit = 20 } = await request.json();

    if (!query || typeof query !== "string") {
      return notesSearchError(400, "invalid_request", "Search query is required");
    }

    if (!hasEmbeddingProviderConfigured()) {
      return notesSearchError(
        503,
        "embeddings_unavailable",
        "Semantic search is unavailable because embeddings are not configured for this deployment."
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
      const failure = classifySemanticSearchFailure(error.message);
      return notesSearchError(failure.status, failure.errorCode, failure.error);
    }

    // Fetch paper info for each note
    const paperIds = [...new Set((notes || []).map((n: { paper_id: string }) => n.paper_id))];
    const papersMap: Record<string, { title: string; pmid: string; journal: string | null }> = {};

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
    if (isEmbeddingsUnavailableError(err)) {
      return notesSearchError(
        503,
        "embeddings_unavailable",
        "Semantic search is unavailable because embeddings are not configured for this deployment."
      );
    }

    const message = err instanceof Error ? err.message : "Failed to perform semantic search";
    return notesSearchError(500, "semantic_search_unavailable", message);
  }
}
