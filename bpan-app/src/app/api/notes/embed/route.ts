import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { noteId, backfill } = await request.json();

    if (backfill) {
      // Backfill all notes without embeddings
      const { data: notes, error } = await supabase
        .from("notes")
        .select("id, content, highlight_text")
        .eq("user_id", user.id)
        .is("embedding", null);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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
      return NextResponse.json(
        { error: "noteId or backfill flag required" },
        { status: 400 }
      );
    }

    const { data: note, error } = await supabase
      .from("notes")
      .select("id, content, highlight_text")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single();

    if (error || !note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
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
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Embed error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate embedding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

