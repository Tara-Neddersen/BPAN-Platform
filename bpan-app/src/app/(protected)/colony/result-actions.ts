"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { redirect } from "next/navigation";

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
      scheduled_date: new Date().toISOString().split("T")[0],
      completed_date: new Date().toISOString().split("T")[0],
      status: "completed",
    });
  }
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
  measures: Record<string, string | number | null>,
  notes?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Check if row exists
  const { data: existing } = await supabase
    .from("colony_results")
    .select("id")
    .eq("animal_id", animalId)
    .eq("timepoint_age_days", timepointAgeDays)
    .eq("experiment_type", experimentType)
    .maybeSingle();

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
      timepoint_age_days: timepointAgeDays,
      experiment_type: experimentType,
      measures,
      notes: notes || null,
    });
    if (error) return { error: error.message };
  }

  // Auto-mark the matching experiment as completed — only if there's real data
  const hasRealData = measures && Object.values(measures).some(
    v => v !== null && v !== "" && v !== undefined
  );
  if (hasRealData) {
    await markExperimentCompleted(supabase, user.id, animalId, timepointAgeDays, experimentType);
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
    measures: Record<string, string | number | null>;
    notes?: string;
  }[]
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
    const { data: existing } = await supabase
      .from("colony_results")
      .select("id")
      .eq("animal_id", entry.animalId)
      .eq("timepoint_age_days", timepointAgeDays)
      .eq("experiment_type", experimentType)
      .maybeSingle();

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
        timepoint_age_days: timepointAgeDays,
        experiment_type: experimentType,
        measures: entry.measures,
        notes: entry.notes || null,
      });
      if (error) errors.push(`${entry.animalId}: ${error.message}`);
      else successCount++;
    }

    // Auto-mark the matching experiment as completed — only if there's real data
    const hasRealData = entry.measures && Object.values(entry.measures).some(
      v => v !== null && v !== "" && v !== undefined
    );
    if (hasRealData) {
      await markExperimentCompleted(supabase, user.id, entry.animalId, timepointAgeDays, experimentType);
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  return { success: true };
}
