"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

// ─── Ideas ───────────────────────────────────────────────────────────────────

export async function createIdea(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const source = (formData.get("source") as string) || "manual";
  const priority = (formData.get("priority") as string) || "medium";
  const aim = (formData.get("aim") as string) || null;
  const tagsRaw = (formData.get("tags") as string) || "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  const { data, error } = await supabase
    .from("research_ideas")
    .insert({
      user_id: user.id,
      title,
      description,
      source,
      priority,
      aim,
      tags,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return data.id;
}

export async function updateIdea(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "exploring";
  const priority = (formData.get("priority") as string) || "medium";
  const aim = (formData.get("aim") as string) || null;
  const tagsRaw = (formData.get("tags") as string) || "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  const { error } = await supabase
    .from("research_ideas")
    .update({ title, description, status, priority, aim, tags })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function updateIdeaStatus(id: string, status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("research_ideas")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteIdea(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("research_ideas")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function linkPaperToIdea(ideaId: string, paperId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: idea } = await supabase
    .from("research_ideas")
    .select("linked_paper_ids")
    .eq("id", ideaId)
    .eq("user_id", user.id)
    .single();

  if (!idea) throw new Error("Idea not found");

  const existing = (idea.linked_paper_ids as string[]) || [];
  if (existing.includes(paperId)) return;

  const { error } = await supabase
    .from("research_ideas")
    .update({ linked_paper_ids: [...existing, paperId] })
    .eq("id", ideaId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function unlinkPaperFromIdea(ideaId: string, paperId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: idea } = await supabase
    .from("research_ideas")
    .select("linked_paper_ids")
    .eq("id", ideaId)
    .eq("user_id", user.id)
    .single();

  if (!idea) throw new Error("Idea not found");

  const updated = ((idea.linked_paper_ids as string[]) || []).filter((id) => id !== paperId);

  const { error } = await supabase
    .from("research_ideas")
    .update({ linked_paper_ids: updated })
    .eq("id", ideaId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

// ─── Idea Entries ────────────────────────────────────────────────────────────

export async function addIdeaEntry(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const ideaId = formData.get("idea_id") as string;
  const content = formData.get("content") as string;
  const entryType = (formData.get("entry_type") as string) || "finding";
  const sourcePaperId = (formData.get("source_paper_id") as string) || null;
  const sourceNoteId = (formData.get("source_note_id") as string) || null;

  const { error } = await supabase.from("idea_entries").insert({
    idea_id: ideaId,
    user_id: user.id,
    content,
    entry_type: entryType,
    source_paper_id: sourcePaperId || null,
    source_note_id: sourceNoteId || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteIdeaEntry(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("idea_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/ideas");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}
