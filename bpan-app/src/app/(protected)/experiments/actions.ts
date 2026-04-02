"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { notifyProtocolChange, notifyReagentStock } from "@/lib/automation-workflows";
import { inferExperimentTypeFromTitle, normalizeExperimentType } from "@/lib/experiment-types";

function parseFileLinks(formData: FormData) {
  const raw = (formData.get("file_links") as string) || "";
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

function parseFigureLinks(formData: FormData) {
  const raw = (formData.get("figure_links") as string) || "";
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

type BatteryWindowSyncInput = {
  label: string;
  minAgeDays: number;
  maxAgeDays: number;
  sortOrder: number;
  experiments: Array<{ name: string; category?: string }>;
};

function inferWindowExperimentTypes(experiments: BatteryWindowSyncInput["experiments"]) {
  return Array.from(
    new Set(
      experiments
        .flatMap((experiment) => {
          const candidates = [
            inferExperimentTypeFromTitle(experiment.name),
            normalizeExperimentType(experiment.category),
            inferExperimentTypeFromTitle(experiment.category),
          ];
          return candidates.filter((value): value is NonNullable<typeof value> => Boolean(value));
        }),
    ),
  );
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

  const { data, error } = await supabase
    .from("experiments")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { id: data?.id as string | undefined };
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

  const { data, error } = await supabase
    .from("experiment_timepoints")
    .insert({
      experiment_id: experimentId,
      user_id: user.id,
      label,
      scheduled_at: scheduledAt,
      notes,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { id: data?.id as string | undefined };
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

export async function replaceExperimentTimepoints(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const experimentId = formData.get("experiment_id") as string;
  const windowsJson = (formData.get("windows") as string) || "[]";

  if (!experimentId?.trim()) {
    throw new Error("Experiment id is required.");
  }

  let windows: Array<{ label?: unknown; scheduled_at?: unknown; notes?: unknown }> = [];
  try {
    const parsed = JSON.parse(windowsJson);
    if (Array.isArray(parsed)) {
      windows = parsed;
    }
  } catch {
    windows = [];
  }

  const normalizedWindows = windows
    .map((window) => ({
      label: typeof window.label === "string" ? window.label.trim() : "",
      scheduled_at: typeof window.scheduled_at === "string" ? window.scheduled_at.trim() : "",
      notes: typeof window.notes === "string" ? window.notes.trim() : "",
    }))
    .filter((window) => window.label.length > 0 && window.scheduled_at.length > 0);

  const { error: deleteError } = await supabase
    .from("experiment_timepoints")
    .delete()
    .eq("experiment_id", experimentId)
    .eq("user_id", user.id);

  if (deleteError) throw new Error(deleteError.message);

  if (normalizedWindows.length > 0) {
    const { error: insertError } = await supabase.from("experiment_timepoints").insert(
      normalizedWindows.map((window) => ({
        experiment_id: experimentId,
        user_id: user.id,
        label: window.label,
        scheduled_at: window.scheduled_at,
        notes: window.notes || null,
      })),
    );

    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
}

export async function syncBatteryWindowsToColonyTimepoints(args: {
  batteryName: string;
  windows: BatteryWindowSyncInput[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const normalizedWindows = Array.isArray(args.windows)
    ? args.windows.flatMap((window, index) => {
        const label = String(window?.label || "").trim();
        const minAgeDays = Number(window?.minAgeDays);
        const maxAgeDaysRaw = Number(window?.maxAgeDays);
        if (!label || !Number.isFinite(minAgeDays)) return [];
        const maxAgeDays = Number.isFinite(maxAgeDaysRaw) ? maxAgeDaysRaw : minAgeDays;
        const experiments = Array.isArray(window?.experiments)
          ? window.experiments
              .map((experiment) => ({
                name: String(experiment?.name || "").trim(),
                category: String(experiment?.category || "").trim(),
              }))
              .filter((experiment) => experiment.name)
          : [];
        return [{
          label,
          minAgeDays,
          maxAgeDays,
          sortOrder: Number.isFinite(Number(window?.sortOrder)) ? Number(window.sortOrder) : index,
          experiments,
        } satisfies BatteryWindowSyncInput];
      })
    : [];

  if (normalizedWindows.length === 0) {
    return { success: true, synced: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("colony_timepoints")
    .select(
      "id,name,age_days,experiments,handling_days_before,duration_days,includes_eeg_implant,eeg_implant_timing,eeg_recovery_days,eeg_recording_days,grace_period_days,sort_order,notes",
    )
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (existingError) throw new Error(existingError.message);

  let synced = 0;

  for (const window of normalizedWindows) {
    const experimentTypes = inferWindowExperimentTypes(window.experiments);
    if (experimentTypes.length === 0) continue;

    const existing = (existingRows || []).find((row) => row.name.trim().toLowerCase() === window.label.toLowerCase()) ||
      (existingRows || []).find((row) => row.age_days === window.minAgeDays) ||
      null;
    const mergedExperiments = Array.from(
      new Set([...(Array.isArray(existing?.experiments) ? existing.experiments : []), ...experimentTypes]),
    );
    const durationDays = Math.max(1, window.maxAgeDays - window.minAgeDays + 1);
    const rangeNote =
      window.maxAgeDays > window.minAgeDays
        ? `${window.minAgeDays}-${window.maxAgeDays} days`
        : `${window.minAgeDays} days`;
    const nextPayload = {
      user_id: user.id,
      name: window.label,
      age_days: window.minAgeDays,
      experiments: mergedExperiments,
      handling_days_before: existing?.handling_days_before ?? 3,
      duration_days: existing?.duration_days && existing.duration_days > 0 ? existing.duration_days : durationDays,
      includes_eeg_implant: Boolean(existing?.includes_eeg_implant) || experimentTypes.includes("eeg_implant"),
      eeg_implant_timing: existing?.eeg_implant_timing || "after",
      eeg_recovery_days: existing?.eeg_recovery_days ?? 7,
      eeg_recording_days: existing?.eeg_recording_days ?? (experimentTypes.includes("eeg_recording") ? 3 : 0),
      grace_period_days: existing?.grace_period_days ?? 30,
      sort_order: typeof existing?.sort_order === "number" ? existing.sort_order : window.sortOrder,
      notes: existing?.notes || `${rangeNote} • synced from ${args.batteryName}`,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("colony_timepoints")
        .update(nextPayload)
        .eq("id", existing.id)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("colony_timepoints").insert(nextPayload);
      if (error) throw new Error(error.message);
    }

    synced += 1;
  }

  revalidatePath("/experiments");
  revalidatePath("/colony");
  revalidatePath("/colony/tracker");
  revalidatePath("/colony/results");
  revalidatePath("/colony/analysis");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);

  return { success: true, synced };
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
  const figureLinks = parseFigureLinks(formData);
  const fileLinks = parseFileLinks(formData);

  let steps;
  try {
    steps = JSON.parse(stepsJson);
  } catch {
    steps = [];
  }

  const { data, error } = await supabase
    .from("protocols")
    .insert({
      user_id: user.id,
      title,
      description,
      category,
      steps,
      figure_links: figureLinks,
      file_links: fileLinks,
    })
    .select("id,user_id,title,description,category,steps,file_links,version,parent_id,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return data;
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
  const figureLinks = parseFigureLinks(formData);
  const fileLinks = parseFileLinks(formData);

  let steps;
  try {
    steps = JSON.parse(stepsJson);
  } catch {
    steps = [];
  }

  const { data: existingProtocol, error: existingProtocolError } = await supabase
    .from("protocols")
    .select("title,description,category,steps")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (existingProtocolError) throw new Error(existingProtocolError.message);

  const { error } = await supabase
    .from("protocols")
    .update({ title, description, category, steps, figure_links: figureLinks, file_links: fileLinks })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  await notifyProtocolChange({
    supabase,
    userId: user.id,
    protocolId: id,
    previous: {
      title: String(existingProtocol?.title || ""),
      description: (existingProtocol?.description as string | null) || null,
      category: (existingProtocol?.category as string | null) || null,
      steps: existingProtocol?.steps ?? [],
    },
    next: {
      title,
      description,
      category,
      steps,
    },
  });
  revalidatePath("/experiments");
  revalidatePath("/tasks");
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

  const { data, error } = await supabase
    .from("reagents")
    .insert({
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
    })
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(error?.message || "Failed to create reagent.");
  await notifyReagentStock({
    supabase,
    userId: user.id,
    reagentId: String(data.id),
    name,
    quantity,
    reorderThreshold: null,
  });
  revalidatePath("/experiments");
  revalidatePath("/tasks");
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

  const { data: existingReagent, error: existingReagentError } = await supabase
    .from("reagents")
    .select("name,quantity")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (existingReagentError) throw new Error(existingReagentError.message);

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
  await notifyReagentStock({
    supabase,
    userId: user.id,
    reagentId: id,
    name,
    quantity,
    previousQuantity: typeof existingReagent?.quantity === "number" ? existingReagent.quantity : null,
    reorderThreshold: null,
  });
  revalidatePath("/experiments");
  revalidatePath("/tasks");
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
