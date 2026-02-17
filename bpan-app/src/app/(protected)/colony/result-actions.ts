"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Upsert a colony result for a specific animal / timepoint / experiment.
 * Uses the unique index to insert or update.
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

  revalidatePath("/colony");
  return { success: true };
}

/**
 * Batch upsert results for multiple animals at once (same timepoint + experiment).
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
  }

  revalidatePath("/colony");
  if (errors.length > 0)
    return { success: true, saved: successCount, errors };
  return { success: true, saved: successCount };
}

/**
 * Delete a colony result row.
 */
export async function deleteColonyResult(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("colony_results")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

