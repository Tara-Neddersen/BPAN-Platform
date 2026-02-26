"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncMeetingActionsToTasks } from "@/app/(protected)/tasks/actions";
import {
  rebuildWorkspaceBackstageIndex,
  refreshWorkspaceBackstageIndexBestEffort,
} from "@/lib/workspace-backstage";

export async function createWatchlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = formData.get("name") as string;
  const keywordsRaw = formData.get("keywords") as string;
  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!name || keywords.length === 0) {
    throw new Error("Name and at least one keyword are required");
  }

  const { error } = await supabase.from("watchlists").insert({
    user_id: user.id,
    name,
    keywords,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function updateWatchlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const keywordsRaw = formData.get("keywords") as string;
  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!name || keywords.length === 0) {
    throw new Error("Name and at least one keyword are required");
  }

  const { error } = await supabase
    .from("watchlists")
    .update({ name, keywords })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteWatchlist(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function updateDigestPreference(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const digestEnabled = formData.get("digest_enabled") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ digest_enabled: digestEnabled })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function resyncMeetingActionTasks() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: meetings, error } = await supabase
    .from("meeting_notes")
    .select("id,title,action_items")
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  let synced = 0;
  let removed = 0;
  let preserved = 0;
  for (const m of meetings || []) {
    const result = await syncMeetingActionsToTasks(m.id, m.title || "Meeting", Array.isArray(m.action_items) ? m.action_items : []);
    if (result?.error) throw new Error(result.error);
    synced += result?.synced || 0;
    removed += result?.removed || 0;
    preserved += result?.preserved || 0;
  }

  revalidatePath("/dashboard");
  revalidatePath("/meetings");
  revalidatePath("/tasks");
}

export async function backfillStarterExperimentTimepoints() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [{ data: experiments, error: expErr }, { data: timepoints, error: tpErr }] = await Promise.all([
    supabase.from("experiments").select("id,status,start_date,title").eq("user_id", user.id),
    supabase.from("experiment_timepoints").select("id,experiment_id").eq("user_id", user.id),
  ]);
  if (expErr) throw new Error(expErr.message);
  if (tpErr) throw new Error(tpErr.message);

  const hasTp = new Set((timepoints || []).map((tp) => tp.experiment_id));
  const today = new Date().toISOString();
  const inserts = (experiments || [])
    .filter((e) => ["planned", "in_progress"].includes(String(e.status)) && !hasTp.has(e.id))
    .map((e) => ({
      user_id: user.id,
      experiment_id: e.id,
      label: "Kickoff",
      scheduled_at: e.start_date ? `${e.start_date}T09:00:00.000Z` : today,
      notes: "Auto-generated starter timepoint from Missing Data Detector.",
    }));

  if (inserts.length > 0) {
    const { error } = await supabase.from("experiment_timepoints").insert(inserts);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/experiments");
  if (inserts.length > 0) {
    await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  }
}

export async function rebuildWorkspaceBackstageGraph() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await rebuildWorkspaceBackstageIndex(supabase, user.id);
  revalidatePath("/dashboard");
  revalidatePath("/experiments");
  revalidatePath("/results");
  revalidatePath("/tasks");
  revalidatePath("/meetings");
  revalidatePath("/notes");
}
