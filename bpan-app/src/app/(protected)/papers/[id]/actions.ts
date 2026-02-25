"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

export async function createNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const paperId = formData.get("paper_id") as string;
  const content = formData.get("content") as string;
  const noteType = formData.get("note_type") as string || "general";
  const highlightText = formData.get("highlight_text") as string || null;
  const pageNumber = formData.get("page_number") ? parseInt(formData.get("page_number") as string) : null;
  const tagsRaw = formData.get("tags") as string || "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  // Generate embedding for semantic search
  let embedding: number[] | null = null;
  try {
    const textToEmbed = [content, highlightText].filter(Boolean).join("\n\n");
    embedding = await generateEmbedding(textToEmbed);
  } catch (err) {
    // Non-blocking: note is still saved without embedding
    console.warn("Failed to generate embedding:", err);
  }

  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    paper_id: paperId,
    content,
    note_type: noteType,
    highlight_text: highlightText,
    page_number: pageNumber,
    tags,
    ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${paperId}`);
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function updateNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const noteId = formData.get("note_id") as string;
  const paperId = formData.get("paper_id") as string;
  const content = formData.get("content") as string;
  const noteType = formData.get("note_type") as string || "general";
  const tagsRaw = formData.get("tags") as string || "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  const { error } = await supabase
    .from("notes")
    .update({ content, note_type: noteType, tags })
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${paperId}`);
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const noteId = formData.get("note_id") as string;
  const paperId = formData.get("paper_id") as string;

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${paperId}`);
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}
