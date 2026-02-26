"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

function parseFileLinks(formData: FormData) {
  const raw = (formData.get("file_links") as string) || "";
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

// ─── Experiments ─────────────────────────────────────────────────────────────

export async function createExperiment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "planned";
  const priority = (formData.get("priority") as string) || "medium";
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;
  const aim = (formData.get("aim") as string) || null;
  const protocolId = (formData.get("protocol_id") as string) || null;
  const tagsRaw = (formData.get("tags") as string) || "";
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const dependsOnRaw = (formData.get("depends_on") as string) || "";
  const dependsOn = dependsOnRaw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const { error } = await supabase.from("experiments").insert({
    user_id: user.id,
    title,
    description,
    status,
    priority,
    start_date: startDate || null,
    end_date: endDate || null,
    aim,
    protocol_id: protocolId || null,
    tags,
    depends_on: dependsOn,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function updateExperiment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "planned";
  const priority = (formData.get("priority") as string) || "medium";
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;
  const aim = (formData.get("aim") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const protocolId = (formData.get("protocol_id") as string) || null;
  const tagsRaw = (formData.get("tags") as string) || "";
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const dependsOnRaw = (formData.get("depends_on") as string) || "";
  const dependsOn = dependsOnRaw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("experiments")
    .update({
      title,
      description,
      status,
      priority,
      start_date: startDate || null,
      end_date: endDate || null,
      aim,
      notes,
      protocol_id: protocolId || null,
      tags,
      depends_on: dependsOn,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteExperiment(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("experiments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function updateExperimentStatus(id: string, status: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("experiments")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

// ─── Timepoints ──────────────────────────────────────────────────────────────

export async function createTimepoint(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const experimentId = formData.get("experiment_id") as string;
  const label = formData.get("label") as string;
  const scheduledAt = formData.get("scheduled_at") as string;
  const notes = (formData.get("notes") as string) || null;

  const { error } = await supabase.from("experiment_timepoints").insert({
    experiment_id: experimentId,
    user_id: user.id,
    label,
    scheduled_at: scheduledAt,
    notes,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function completeTimepoint(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("experiment_timepoints")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteTimepoint(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("experiment_timepoints")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

// ─── Protocols ───────────────────────────────────────────────────────────────

export async function createProtocol(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const category = (formData.get("category") as string) || null;
  const stepsJson = (formData.get("steps") as string) || "[]";
  const fileLinks = parseFileLinks(formData);

  let steps;
  try {
    steps = JSON.parse(stepsJson);
  } catch {
    steps = [];
  }

  const { error } = await supabase.from("protocols").insert({
    user_id: user.id,
    title,
    description,
    category,
    steps,
    file_links: fileLinks,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function updateProtocol(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const category = (formData.get("category") as string) || null;
  const stepsJson = (formData.get("steps") as string) || "[]";
  const fileLinks = parseFileLinks(formData);

  let steps;
  try {
    steps = JSON.parse(stepsJson);
  } catch {
    steps = [];
  }

  const { error } = await supabase
    .from("protocols")
    .update({ title, description, category, steps, file_links: fileLinks })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteProtocol(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("protocols")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

// ─── Reagents ────────────────────────────────────────────────────────────────

export async function createReagent(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = formData.get("name") as string;
  const catalogNumber = (formData.get("catalog_number") as string) || null;
  const supplier = (formData.get("supplier") as string) || null;
  const lotNumber = (formData.get("lot_number") as string) || null;
  const quantityStr = formData.get("quantity") as string;
  const quantity = quantityStr ? parseFloat(quantityStr) : null;
  const unit = (formData.get("unit") as string) || null;
  const expirationDate = (formData.get("expiration_date") as string) || null;
  const storageLocation = (formData.get("storage_location") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const { error } = await supabase.from("reagents").insert({
    user_id: user.id,
    name,
    catalog_number: catalogNumber,
    supplier,
    lot_number: lotNumber,
    quantity,
    unit,
    expiration_date: expirationDate || null,
    storage_location: storageLocation,
    notes,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function updateReagent(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const catalogNumber = (formData.get("catalog_number") as string) || null;
  const supplier = (formData.get("supplier") as string) || null;
  const lotNumber = (formData.get("lot_number") as string) || null;
  const quantityStr = formData.get("quantity") as string;
  const quantity = quantityStr ? parseFloat(quantityStr) : null;
  const unit = (formData.get("unit") as string) || null;
  const expirationDate = (formData.get("expiration_date") as string) || null;
  const storageLocation = (formData.get("storage_location") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const { error } = await supabase
    .from("reagents")
    .update({
      name,
      catalog_number: catalogNumber,
      supplier,
      lot_number: lotNumber,
      quantity,
      unit,
      expiration_date: expirationDate || null,
      storage_location: storageLocation,
      notes,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function deleteReagent(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("reagents")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}
