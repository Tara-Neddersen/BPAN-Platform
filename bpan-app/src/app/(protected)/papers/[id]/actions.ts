"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    paper_id: paperId,
    content,
    note_type: noteType,
    highlight_text: highlightText,
    page_number: pageNumber,
    tags,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${paperId}`);
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
}
