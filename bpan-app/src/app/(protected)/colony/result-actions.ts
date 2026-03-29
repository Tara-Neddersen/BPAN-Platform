"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { syncManagedGoogleSheetMirrorsForUser } from "@/lib/google-sheet-mirror";
import { redirect } from "next/navigation";

async function syncColonyMirrorsBestEffort(userId: string) {
  try {
    await syncManagedGoogleSheetMirrorsForUser(userId, "colony_results");
  } catch (error) {
    console.error("colony mirror sync failed", error);
  }
}

/**
 * Helper: when results are saved for an animal+timepoint+experiment,
 * automatically mark the matching animal_experiment row as "completed".
 * If no matching experiment row exists, create one with status "completed".
 */
async function markExperimentCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  animalId: string,
  timepointAgeDays: number,
  experimentType: string
) {
  // Find ANY matching experiment row for this animal+timepoint+type
  const { data: exp } = await supabase
    .from("animal_experiments")
    .select("id, status")
    .eq("user_id", userId)
    .eq("animal_id", animalId)
    .eq("experiment_type", experimentType)
    .eq("timepoint_age_days", timepointAgeDays)
    .maybeSingle();

  if (exp) {
    // Only update if not already completed
    if (exp.status !== "completed") {
      await supabase
        .from("animal_experiments")
        .update({
          status: "completed",
          completed_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", exp.id);
    }
  } else {
    // No experiment row exists — create one as completed
    await supabase.from("animal_experiments").insert({
      user_id: userId,
      animal_id: animalId,
      experiment_type: experimentType,
      timepoint_age_days: timepointAgeDays,
      // Preserve tracker sync without injecting fake schedule dates into calendar.
      scheduled_date: null,
      completed_date: new Date().toISOString().split("T")[0],
      status: "completed",
    });
  }
}

async function markExperimentSkipped(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  animalId: string,
  timepointAgeDays: number,
  experimentType: string
) {
  const { data: exp } = await supabase
    .from("animal_experiments")
    .select("id, status")
    .eq("user_id", userId)
    .eq("animal_id", animalId)
    .eq("experiment_type", experimentType)
    .eq("timepoint_age_days", timepointAgeDays)
    .maybeSingle();

  if (!exp) return;
  if (exp.status === "skipped") return;

  await supabase
    .from("animal_experiments")
    .update({
      status: "skipped",
      completed_date: null,
    })
    .eq("id", exp.id);
}

async function markExperimentWithStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  animalId: string,
  timepointAgeDays: number,
  experimentType: string,
  status: "skipped" | "pending" | "scheduled" | "leave"
) {
  if (status === "leave") return;

  const { data: exp } = await supabase
    .from("animal_experiments")
    .select("id, status")
    .eq("user_id", userId)
    .eq("animal_id", animalId)
    .eq("experiment_type", experimentType)
    .eq("timepoint_age_days", timepointAgeDays)
    .maybeSingle();

  if (!exp) return;
  if (exp.status === status) return;

  await supabase
    .from("animal_experiments")
    .update({
      status,
      completed_date: null,
    })
    .eq("id", exp.id);
}

function hasMeaningfulMeasures(measures: Record<string, string | number | boolean | null | string[]> | null | undefined) {
  if (!measures) return false;
  return Object.values(measures).some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== "" && v !== undefined;
  });
}

/**
 * Upsert a colony result for a specific animal / timepoint / experiment.
 * Uses the unique index to insert or update.
 * Also auto-marks the matching animal_experiment as completed.
 */
export async function upsertColonyResult(
  animalId: string,
  timepointAgeDays: number,
  experimentType: string,
  measures: Record<string, string | number | boolean | null | string[]>,
  notes?: string,
  options?: {
    experimentRunId?: string | null;
    runTimepointId?: string | null;
    runTimepointExperimentId?: string | null;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Check if row exists
  let existingQuery = supabase
    .from("colony_results")
    .select("id")
    .eq("animal_id", animalId);

  if (options?.experimentRunId && options?.runTimepointExperimentId) {
    existingQuery = existingQuery
      .eq("experiment_run_id", options.experimentRunId)
      .eq("run_timepoint_experiment_id", options.runTimepointExperimentId);
  } else {
    existingQuery = existingQuery
      .eq("timepoint_age_days", timepointAgeDays)
      .eq("experiment_type", experimentType);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("colony_results")
      .update({
        measures,
        notes: notes || null,
        recorded_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("colony_results").insert({
      user_id: user.id,
      animal_id: animalId,
      experiment_run_id: options?.experimentRunId || null,
      run_timepoint_id: options?.runTimepointId || null,
      run_timepoint_experiment_id: options?.runTimepointExperimentId || null,
      timepoint_age_days: timepointAgeDays,
      experiment_type: experimentType,
      measures,
      notes: notes || null,
    });
    if (error) return { error: error.message };
  }

  // Auto-mark the matching experiment as completed — only if there's real data
  const hasRealData = hasMeaningfulMeasures(measures);
  if (hasRealData) {
    await markExperimentCompleted(supabase, user.id, animalId, timepointAgeDays, experimentType);
  } else {
    await markExperimentSkipped(supabase, user.id, animalId, timepointAgeDays, experimentType);
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncColonyMirrorsBestEffort(user.id);
  return { success: true };
}

/**
 * Batch upsert results for multiple animals at once (same timepoint + experiment).
 * Also auto-marks matching animal_experiments as completed.
 */
export async function batchUpsertColonyResults(
  timepointAgeDays: number,
  experimentType: string,
  entries: {
    animalId: string;
    measures: Record<string, string | number | boolean | null | string[]>;
    notes?: string;
  }[],
  options?: {
    emptyResultStatus?: "skipped" | "pending" | "scheduled" | "leave";
    experimentRunId?: string | null;
    runTimepointId?: string | null;
    runTimepointExperimentId?: string | null;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  let successCount = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    // Check if row exists
    let existingQuery = supabase
      .from("colony_results")
      .select("id")
      .eq("animal_id", entry.animalId);

    if (options?.experimentRunId && options?.runTimepointExperimentId) {
      existingQuery = existingQuery
        .eq("experiment_run_id", options.experimentRunId)
        .eq("run_timepoint_experiment_id", options.runTimepointExperimentId);
    } else {
      existingQuery = existingQuery
        .eq("timepoint_age_days", timepointAgeDays)
        .eq("experiment_type", experimentType);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("colony_results")
        .update({
          measures: entry.measures,
          notes: entry.notes || null,
          recorded_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("user_id", user.id);
      if (error) errors.push(`${entry.animalId}: ${error.message}`);
      else successCount++;
    } else {
      const { error } = await supabase.from("colony_results").insert({
        user_id: user.id,
        animal_id: entry.animalId,
        experiment_run_id: options?.experimentRunId || null,
        run_timepoint_id: options?.runTimepointId || null,
        run_timepoint_experiment_id: options?.runTimepointExperimentId || null,
        timepoint_age_days: timepointAgeDays,
        experiment_type: experimentType,
        measures: entry.measures,
        notes: entry.notes || null,
      });
      if (error) errors.push(`${entry.animalId}: ${error.message}`);
      else successCount++;
    }

    // Auto-mark the matching experiment as completed — only if there's real data
    const hasRealData = hasMeaningfulMeasures(entry.measures);
    if (hasRealData) {
      await markExperimentCompleted(supabase, user.id, entry.animalId, timepointAgeDays, experimentType);
    } else {
      const emptyStatus = options?.emptyResultStatus ?? "skipped";
      if (emptyStatus === "skipped") {
        await markExperimentSkipped(supabase, user.id, entry.animalId, timepointAgeDays, experimentType);
      } else {
        await markExperimentWithStatus(
          supabase,
          user.id,
          entry.animalId,
          timepointAgeDays,
          experimentType,
          emptyStatus
        );
      }
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncColonyMirrorsBestEffort(user.id);
  if (errors.length > 0)
    return { success: true, saved: successCount, errors };
  return { success: true, saved: successCount };
}

/**
 * Delete a colony result row.
 * CASCADE: Reverts the matching experiment status from "completed" back to "scheduled".
 */
export async function deleteColonyResult(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get result details before deleting so we can revert the experiment
  const { data: result } = await supabase
    .from("colony_results")
    .select("animal_id, timepoint_age_days, experiment_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("colony_results")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // CASCADE: Revert matching experiment from "completed" back to "scheduled"
  if (result) {
    const { data: exp } = await supabase
      .from("animal_experiments")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("animal_id", result.animal_id)
      .eq("experiment_type", result.experiment_type)
      .eq("timepoint_age_days", result.timepoint_age_days)
      .eq("status", "completed")
      .maybeSingle();

    if (exp) {
      await supabase
        .from("animal_experiments")
        .update({ status: "scheduled", completed_date: null })
        .eq("id", exp.id);
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncColonyMirrorsBestEffort(user.id);
  return { success: true };
}

/**
 * Reconcile tracker statuses from existing colony_results rows.
 * Useful for historical data entered before auto-sync rules existed.
 *
 * Rules:
 * - Rows with meaningful measures => tracker marked/completed (create if missing)
 * - Rows without meaningful measures => ignored (no destructive updates)
 */
export async function reconcileTrackerFromExistingColonyResults() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: rows, error } = await supabase
    .from("colony_results")
    .select("animal_id, timepoint_age_days, experiment_type, measures")
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  let completed = 0;
  let ignored = 0;

  for (const row of rows || []) {
    const hasData = hasMeaningfulMeasures(
      (row.measures || {}) as Record<string, string | number | boolean | null | string[]>
    );
    if (!hasData) {
      ignored++;
      continue;
    }

    await markExperimentCompleted(
      supabase,
      user.id,
      row.animal_id,
      row.timepoint_age_days,
      row.experiment_type
    );
    completed++;
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncColonyMirrorsBestEffort(user.id);
  return { success: true, completed, ignored };
}

/**
 * Delete a measure key (column) from colony result rows for the current experiment/timepoint.
 * This removes stored values from `measures` JSON across matching rows.
 */
export async function deleteColonyResultMeasureColumn(
  timepointAgeDays: number,
  experimentType: string,
  fieldKey: string,
  options?: {
    experimentRunId?: string | null;
    runTimepointId?: string | null;
    runTimepointExperimentId?: string | null;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const safeFieldKey = String(fieldKey || "").trim();
  if (!safeFieldKey) return { error: "Field key is required" };

  let query = supabase
    .from("colony_results")
    .select("id, measures")
    .eq("user_id", user.id);

  if (options?.experimentRunId && options?.runTimepointExperimentId) {
    query = query
      .eq("experiment_run_id", options.experimentRunId)
      .eq("run_timepoint_experiment_id", options.runTimepointExperimentId);
  } else {
    query = query
      .eq("timepoint_age_days", timepointAgeDays)
      .eq("experiment_type", experimentType);
  }

  const { data: rows, error } = await query;

  if (error) return { error: error.message };

  let updated = 0;
  for (const row of rows || []) {
    const measures = ((row.measures || {}) as Record<string, unknown>);
    if (!(safeFieldKey in measures)) continue;
    const nextMeasures = { ...measures };
    delete nextMeasures[safeFieldKey];

    const { error: updateErr } = await supabase
      .from("colony_results")
      .update({
        measures: nextMeasures,
        recorded_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (updateErr) return { error: updateErr.message };
    updated++;
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncColonyMirrorsBestEffort(user.id);
  return { success: true, updated };
}

export async function bulkDeleteColonyResults(args: {
  timepointAgeDays: number;
  experimentType: string;
  animalIds?: string[];
  statusAfterDelete?: "skipped" | "pending" | "scheduled" | "completed" | "leave";
  options?: {
    experimentRunId?: string | null;
    runTimepointId?: string | null;
    runTimepointExperimentId?: string | null;
  };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const animalIds = Array.from(new Set((args.animalIds || []).map((value) => String(value).trim()).filter(Boolean)));
  const statusAfterDelete = args.statusAfterDelete || "scheduled";

  let query = supabase
    .from("colony_results")
    .select("id, animal_id, timepoint_age_days, experiment_type")
    .eq("user_id", user.id);

  if (args.options?.experimentRunId && args.options?.runTimepointExperimentId) {
    query = query
      .eq("experiment_run_id", args.options.experimentRunId)
      .eq("run_timepoint_experiment_id", args.options.runTimepointExperimentId);
  } else {
    query = query
      .eq("timepoint_age_days", args.timepointAgeDays)
      .eq("experiment_type", args.experimentType);
  }

  if (animalIds.length > 0) {
    query = query.in("animal_id", animalIds);
  }

  const { data: rows, error } = await query;
  if (error) return { error: error.message };

  const typedRows = rows || [];
  if (typedRows.length === 0) {
    return { success: true, deleted: 0, affectedAnimals: 0 };
  }

  const idsToDelete = typedRows.map((row) => row.id);
  const { error: deleteError } = await supabase
    .from("colony_results")
    .delete()
    .in("id", idsToDelete)
    .eq("user_id", user.id);
  if (deleteError) return { error: deleteError.message };

  const affectedPairs = new Map<string, { animalId: string; timepointAgeDays: number; experimentType: string }>();
  for (const row of typedRows) {
    affectedPairs.set(
      `${row.animal_id}-${row.timepoint_age_days}-${row.experiment_type}`,
      {
        animalId: row.animal_id,
        timepointAgeDays: row.timepoint_age_days,
        experimentType: row.experiment_type,
      }
    );
  }

  if (statusAfterDelete !== "leave") {
    for (const pair of affectedPairs.values()) {
      if (statusAfterDelete === "completed") {
        await markExperimentCompleted(
          supabase,
          user.id,
          pair.animalId,
          pair.timepointAgeDays,
          pair.experimentType
        );
      } else if (statusAfterDelete === "skipped") {
        await markExperimentSkipped(
          supabase,
          user.id,
          pair.animalId,
          pair.timepointAgeDays,
          pair.experimentType
        );
      } else {
        await markExperimentWithStatus(
          supabase,
          user.id,
          pair.animalId,
          pair.timepointAgeDays,
          pair.experimentType,
          statusAfterDelete
        );
      }
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncColonyMirrorsBestEffort(user.id);
  return {
    success: true,
    deleted: typedRows.length,
    affectedAnimals: new Set(typedRows.map((row) => row.animal_id)).size,
  };
}
