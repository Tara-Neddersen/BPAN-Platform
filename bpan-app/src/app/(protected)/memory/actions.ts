"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

export async function createMemory(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("ai_memory").insert({
    user_id: user.id,
    category: formData.get("category") as string,
    content: formData.get("content") as string,
    confidence: (formData.get("confidence") as string) || "confirmed",
    tags: ((formData.get("tags") as string) || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean),
    is_auto: false,
    is_pinned: formData.get("is_pinned") === "true",
    source: "user_manual",
  });

  if (error) return { error: error.message };
  revalidatePath("/memory");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function updateMemory(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const updates: Record<string, unknown> = {};
  const content = formData.get("content") as string;
  if (content) updates.content = content;
  const category = formData.get("category") as string;
  if (category) updates.category = category;
  const confidence = formData.get("confidence") as string;
  if (confidence) updates.confidence = confidence;
  const tags = formData.get("tags") as string;
  if (tags !== null) updates.tags = tags.split(",").map(t => t.trim()).filter(Boolean);
  const isPinned = formData.get("is_pinned");
  if (isPinned !== null) updates.is_pinned = isPinned === "true";

  const { error } = await supabase
    .from("ai_memory")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/memory");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteMemory(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("ai_memory")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/memory");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function togglePin(id: string, pinned: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("ai_memory")
    .update({ is_pinned: pinned })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/memory");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}
