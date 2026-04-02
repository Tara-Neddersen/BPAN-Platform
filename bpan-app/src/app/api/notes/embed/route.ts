import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai";
import {
  hasEmbeddingProviderConfigured,
  isEmbeddingsUnavailableError,
  type NotesSemanticErrorCode,
} from "@/lib/notes-semantic";

function notesEmbedError(status: number, errorCode: NotesSemanticErrorCode, error: string) {
  return NextResponse.json({ errorCode, error }, { status });
}

/**
 * POST /api/notes/embed
 * Generate and store embeddings for notes that don't have them yet.
 * Called after note creation or on-demand to backfill.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return notesEmbedError(401, "unauthorized", "Unauthorized");
    }

    const { noteId, backfill } = await request.json();

    if (!hasEmbeddingProviderConfigured()) {
      return notesEmbedError(
        503,
        "embeddings_unavailable",
        "Embeddings are not configured for this deployment, so note backfill is unavailable right now."
      );
    }

    if (backfill) {
      // Backfill all notes without embeddings
      const { data: notes, error } = await supabase
        .from("notes")
        .select("id, content, highlight_text")
        .eq("user_id", user.id)
        .is("embedding", null);

      if (error) {
        return notesEmbedError(500, "backfill_failed", error.message);
      }

      let embedded = 0;
      for (const note of notes || []) {
        try {
          const textToEmbed = [note.content, note.highlight_text]
            .filter(Boolean)
            .join("\n\n");
          const embedding = await generateEmbedding(textToEmbed);

          await supabase
            .from("notes")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", note.id);

          embedded++;
        } catch (err) {
          console.warn(`Failed to embed note ${note.id}:`, err);
        }
      }

      return NextResponse.json({
        message: `Embedded ${embedded} of ${(notes || []).length} notes`,
        embedded,
        total: (notes || []).length,
      });
    }

    // Single note embedding
    if (!noteId) {
      return notesEmbedError(400, "invalid_request", "noteId or backfill flag required");
    }

    const { data: note, error } = await supabase
      .from("notes")
      .select("id, content, highlight_text")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single();

    if (error || !note) {
      return notesEmbedError(404, "note_not_found", "Note not found");
    }

    const textToEmbed = [note.content, note.highlight_text]
      .filter(Boolean)
      .join("\n\n");
    const embedding = await generateEmbedding(textToEmbed);

    const { error: updateError } = await supabase
      .from("notes")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", note.id);

    if (updateError) {
      return notesEmbedError(500, "embed_failed", updateError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Embed error:", err);
    if (isEmbeddingsUnavailableError(err)) {
      return notesEmbedError(
        503,
        "embeddings_unavailable",
        "Embeddings are not configured for this deployment, so note backfill is unavailable right now."
      );
    }

    const message = err instanceof Error ? err.message : "Failed to generate embedding";
    return notesEmbedError(500, "embed_failed", message);
  }
}
