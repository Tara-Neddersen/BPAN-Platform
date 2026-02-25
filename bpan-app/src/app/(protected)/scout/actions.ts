"use server";

import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateScoutStatus(id: string, status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("scout_findings")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/scout");
  return { success: true };
}

export async function updateScoutNotes(id: string, notes: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("scout_findings")
    .update({ user_notes: notes })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/scout");
  return { success: true };
}

export async function deleteScoutFinding(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("scout_findings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/scout");
  return { success: true };
}

export async function saveFindingToPapers(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get the scout finding
  const { data: finding, error: findErr } = await supabase
    .from("scout_findings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (findErr || !finding) return { error: "Finding not found" };

  // Save to saved_papers
  const { error: saveErr } = await supabase.from("saved_papers").insert({
    user_id: user.id,
    pmid: finding.pmid,
    title: finding.title,
    authors: finding.authors,
    journal: finding.journal,
    pub_date: finding.pub_date,
    abstract: finding.abstract,
    doi: finding.doi,
    ai_summary: finding.ai_summary,
    source: "scout",
  });

  if (saveErr) {
    // Might already be saved
    if (saveErr.message.includes("duplicate")) {
      return { error: "Paper already saved to your library." };
    }
    return { error: saveErr.message };
  }

  // Mark as saved
  await supabase
    .from("scout_findings")
    .update({ status: "saved" })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/scout");
  revalidatePath("/papers");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}
