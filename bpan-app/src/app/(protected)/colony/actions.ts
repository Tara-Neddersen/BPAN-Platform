"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// ─── Breeder Cages ─────────────────────────────────────────────────────

export async function createBreederCage(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("breeder_cages").insert({
    user_id: user.id,
    name: formData.get("name") as string,
    strain: (formData.get("strain") as string) || null,
    location: (formData.get("location") as string) || null,
    breeding_start: (formData.get("breeding_start") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function updateBreederCage(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("breeder_cages")
    .update({
      name: formData.get("name") as string,
      strain: (formData.get("strain") as string) || null,
      location: (formData.get("location") as string) || null,
      breeding_start: (formData.get("breeding_start") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteBreederCage(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("breeder_cages").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Cohorts ────────────────────────────────────────────────────────────

export async function createCohort(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("cohorts").insert({
    user_id: user.id,
    breeder_cage_id: (formData.get("breeder_cage_id") as string) || null,
    name: formData.get("name") as string,
    birth_date: formData.get("birth_date") as string,
    litter_size: formData.get("litter_size") ? parseInt(formData.get("litter_size") as string) : null,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function updateCohort(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("cohorts")
    .update({
      breeder_cage_id: (formData.get("breeder_cage_id") as string) || null,
      name: formData.get("name") as string,
      birth_date: formData.get("birth_date") as string,
      litter_size: formData.get("litter_size") ? parseInt(formData.get("litter_size") as string) : null,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteCohort(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("cohorts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Animals ────────────────────────────────────────────────────────────

export async function createAnimal(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data, error } = await supabase
    .from("animals")
    .insert({
      user_id: user.id,
      cohort_id: formData.get("cohort_id") as string,
      identifier: formData.get("identifier") as string,
      sex: formData.get("sex") as string,
      genotype: formData.get("genotype") as string,
      ear_tag: (formData.get("ear_tag") as string) || null,
      birth_date: formData.get("birth_date") as string,
      cage_number: (formData.get("cage_number") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true, id: data.id };
}

export async function updateAnimal(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("animals")
    .update({
      cohort_id: formData.get("cohort_id") as string,
      identifier: formData.get("identifier") as string,
      sex: formData.get("sex") as string,
      genotype: formData.get("genotype") as string,
      ear_tag: (formData.get("ear_tag") as string) || null,
      birth_date: formData.get("birth_date") as string,
      cage_number: (formData.get("cage_number") as string) || null,
      status: formData.get("status") as string,
      eeg_implanted: formData.get("eeg_implanted") === "true",
      eeg_implant_date: (formData.get("eeg_implant_date") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteAnimal(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("animals").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Colony Timepoints ──────────────────────────────────────────────────

export async function createColonyTimepoint(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const experiments = formData.getAll("experiments") as string[];

  const { error } = await supabase.from("colony_timepoints").insert({
    user_id: user.id,
    name: formData.get("name") as string,
    age_days: parseInt(formData.get("age_days") as string),
    experiments,
    handling_days_before: parseInt(formData.get("handling_days_before") as string) || 3,
    duration_days: parseInt(formData.get("duration_days") as string) || 21,
    includes_eeg_implant: formData.get("includes_eeg_implant") === "true",
    eeg_recovery_days: parseInt(formData.get("eeg_recovery_days") as string) || 14,
    eeg_recording_days: parseInt(formData.get("eeg_recording_days") as string) || 3,
    sort_order: parseInt(formData.get("sort_order") as string) || 0,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function updateColonyTimepoint(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const experiments = formData.getAll("experiments") as string[];

  const { error } = await supabase
    .from("colony_timepoints")
    .update({
      name: formData.get("name") as string,
      age_days: parseInt(formData.get("age_days") as string),
      experiments,
      handling_days_before: parseInt(formData.get("handling_days_before") as string) || 3,
      duration_days: parseInt(formData.get("duration_days") as string) || 21,
      includes_eeg_implant: formData.get("includes_eeg_implant") === "true",
      eeg_recovery_days: parseInt(formData.get("eeg_recovery_days") as string) || 14,
      eeg_recording_days: parseInt(formData.get("eeg_recording_days") as string) || 3,
      sort_order: parseInt(formData.get("sort_order") as string) || 0,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteColonyTimepoint(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("colony_timepoints").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Animal Experiments ─────────────────────────────────────────────────

export async function createAnimalExperiment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("animal_experiments").insert({
    user_id: user.id,
    animal_id: formData.get("animal_id") as string,
    experiment_type: formData.get("experiment_type") as string,
    timepoint_age_days: formData.get("timepoint_age_days") ? parseInt(formData.get("timepoint_age_days") as string) : null,
    scheduled_date: (formData.get("scheduled_date") as string) || null,
    status: (formData.get("status") as string) || "scheduled",
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function updateAnimalExperiment(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const update: Record<string, unknown> = {};
  if (formData.has("status")) update.status = formData.get("status");
  if (formData.has("completed_date")) update.completed_date = formData.get("completed_date") || null;
  if (formData.has("scheduled_date")) update.scheduled_date = formData.get("scheduled_date") || null;
  if (formData.has("results_drive_url")) update.results_drive_url = formData.get("results_drive_url") || null;
  if (formData.has("results_notes")) update.results_notes = formData.get("results_notes") || null;
  if (formData.has("notes")) update.notes = formData.get("notes") || null;

  const { error } = await supabase
    .from("animal_experiments")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteAnimalExperiment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("animal_experiments").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Schedule Experiments for an Animal ─────────────────────────────────

export async function scheduleExperimentsForAnimal(animalId: string, birthDate: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get all timepoints
  const { data: timepoints } = await supabase
    .from("colony_timepoints")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (!timepoints || timepoints.length === 0) {
    return { error: "No timepoints configured. Add timepoints first." };
  }

  const birth = new Date(birthDate);
  const records: Record<string, unknown>[] = [];

  for (const tp of timepoints) {
    const ageMs = tp.age_days * 24 * 60 * 60 * 1000;
    const experimentStart = new Date(birth.getTime() + ageMs);

    // Handling
    if (tp.handling_days_before > 0) {
      const handlingStart = new Date(experimentStart.getTime() - tp.handling_days_before * 24 * 60 * 60 * 1000);
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: "handling",
        timepoint_age_days: tp.age_days,
        scheduled_date: handlingStart.toISOString().split("T")[0],
        status: "scheduled",
      });
    }

    // Each experiment in the timepoint
    const experiments = (tp.experiments as string[]) || [];
    let dayOffset = 0;
    for (const exp of experiments) {
      const expDate = new Date(experimentStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: exp,
        timepoint_age_days: tp.age_days,
        scheduled_date: expDate.toISOString().split("T")[0],
        status: "scheduled",
      });
      // Space experiments ~2–3 days apart within the window
      dayOffset += Math.max(1, Math.floor(tp.duration_days / Math.max(experiments.length, 1)));
    }

    // EEG implant + recovery + recording
    if (tp.includes_eeg_implant) {
      const implantDate = new Date(experimentStart.getTime() + tp.duration_days * 24 * 60 * 60 * 1000);
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: "eeg_implant",
        timepoint_age_days: tp.age_days,
        scheduled_date: implantDate.toISOString().split("T")[0],
        status: "scheduled",
      });

      const recordingStart = new Date(implantDate.getTime() + tp.eeg_recovery_days * 24 * 60 * 60 * 1000);
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: "eeg_recording",
        timepoint_age_days: tp.age_days,
        scheduled_date: recordingStart.toISOString().split("T")[0],
        status: "scheduled",
      });
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from("animal_experiments").insert(records);
    if (error) return { error: error.message };
  }

  revalidatePath("/colony");
  return { success: true, count: records.length };
}

// ─── Advisor Portal ─────────────────────────────────────────────────────

export async function createAdvisorAccess(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const canSee = formData.getAll("can_see") as string[];

  const { data, error } = await supabase
    .from("advisor_portal")
    .insert({
      user_id: user.id,
      advisor_name: formData.get("advisor_name") as string,
      advisor_email: (formData.get("advisor_email") as string) || null,
      can_see: canSee.length > 0 ? canSee : ["experiments", "animals", "results", "timeline"],
    })
    .select("token")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true, token: data.token };
}

export async function deleteAdvisorAccess(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("advisor_portal").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

