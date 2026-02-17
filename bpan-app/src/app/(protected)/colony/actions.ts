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
    is_pregnant: formData.get("is_pregnant") === "true",
    pregnancy_start_date: (formData.get("pregnancy_start_date") as string) || null,
    expected_birth_date: (formData.get("expected_birth_date") as string) || null,
    last_check_date: (formData.get("last_check_date") as string) || null,
    check_interval_days: parseInt(formData.get("check_interval_days") as string) || 7,
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
      is_pregnant: formData.get("is_pregnant") === "true",
      pregnancy_start_date: (formData.get("pregnancy_start_date") as string) || null,
      expected_birth_date: (formData.get("expected_birth_date") as string) || null,
      last_check_date: (formData.get("last_check_date") as string) || null,
      check_interval_days: parseInt(formData.get("check_interval_days") as string) || 7,
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
    grace_period_days: parseInt(formData.get("grace_period_days") as string) || 30,
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

  const newAgeDays = parseInt(formData.get("age_days") as string);
  const experiments = formData.getAll("experiments") as string[];

  // Get old timepoint to detect age_days change
  const { data: oldTP } = await supabase
    .from("colony_timepoints")
    .select("age_days")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const oldAgeDays = oldTP?.age_days;

  const { error } = await supabase
    .from("colony_timepoints")
    .update({
      name: formData.get("name") as string,
      age_days: newAgeDays,
      experiments,
      handling_days_before: parseInt(formData.get("handling_days_before") as string) || 3,
      duration_days: parseInt(formData.get("duration_days") as string) || 21,
      includes_eeg_implant: formData.get("includes_eeg_implant") === "true",
      eeg_recovery_days: parseInt(formData.get("eeg_recovery_days") as string) || 14,
      eeg_recording_days: parseInt(formData.get("eeg_recording_days") as string) || 3,
      grace_period_days: parseInt(formData.get("grace_period_days") as string) || 30,
      sort_order: parseInt(formData.get("sort_order") as string) || 0,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // If age_days changed, cascade to animal_experiments and colony_results
  if (oldAgeDays != null && oldAgeDays !== newAgeDays) {
    // Update animal_experiments timepoint_age_days
    const { data: affectedExps } = await supabase
      .from("animal_experiments")
      .select("id, animal_id")
      .eq("user_id", user.id)
      .eq("timepoint_age_days", oldAgeDays);

    if (affectedExps && affectedExps.length > 0) {
      // Get birth dates for all affected animals to recalculate scheduled_date
      const animalIds = [...new Set(affectedExps.map(e => e.animal_id))];
      const { data: animalData } = await supabase
        .from("animals")
        .select("id, birth_date")
        .in("id", animalIds);

      const birthDateMap = new Map((animalData || []).map(a => [a.id, a.birth_date]));

      // Update each experiment: new timepoint_age_days + recalculated scheduled_date
      for (const exp of affectedExps) {
        const birthDate = birthDateMap.get(exp.animal_id);
        let newScheduledDate: string | undefined;
        if (birthDate) {
          const d = new Date(birthDate);
          d.setDate(d.getDate() + newAgeDays);
          newScheduledDate = d.toISOString().split("T")[0];
        }
        await supabase
          .from("animal_experiments")
          .update({
            timepoint_age_days: newAgeDays,
            ...(newScheduledDate ? { scheduled_date: newScheduledDate } : {}),
          })
          .eq("id", exp.id);
      }
    }

    // Update colony_results timepoint_age_days
    await supabase
      .from("colony_results")
      .update({ timepoint_age_days: newAgeDays })
      .eq("user_id", user.id)
      .eq("timepoint_age_days", oldAgeDays);
  }

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
//
// Matches the Stanford "2-Week Mouse Behavior Experiment" protocol:
//   Week 0   : 5 days handling (Mon–Fri before Day 1)
//   Day 1    : Y-Maze (AM) + Marble Burying (PM)
//   Day 2    : Light-Dark Box (AM) + Overnight Nesting
//   Day 3    : Data Collection & Move to Core
//   Day 4–5  : 48hr Core Acclimation (no testing)
//   Day 6    : CatWalk Gait Analysis + Rotarod Habituation
//   Day 7–8  : Rotarod Testing (Acceleration)
//   Day 9    : Stamina Test (10 RPM / 60m cap)
//   Day 10   : Plasma Collection (Blood Draw)
// Then optionally: EEG implant → recovery → recording

const PROTOCOL_SCHEDULE: { type: string; dayOffset: number; notes?: string }[] = [
  { type: "handling",          dayOffset: -5, notes: "5 days: Transport → 1hr rest → 2 min handling" },
  { type: "y_maze",            dayOffset: 0,  notes: "Day 1 AM — Anxiety Baseline (Group Housed)" },
  { type: "marble",            dayOffset: 0,  notes: "Day 1 PM — Marble Burying" },
  { type: "ldb",               dayOffset: 1,  notes: "Day 2 AM — Light-Dark Box" },
  { type: "nesting",           dayOffset: 1,  notes: "Day 2 PM — Overnight Nesting (Isolation)" },
  { type: "data_collection",   dayOffset: 2,  notes: "Day 3 — Data Collection & Move to Core" },
  { type: "core_acclimation",  dayOffset: 3,  notes: "Day 4–5 — 48hr Mandatory Core Acclimation" },
  { type: "catwalk",           dayOffset: 5,  notes: "Day 6 — CatWalk Gait Analysis" },
  { type: "rotarod_hab",       dayOffset: 5,  notes: "Day 6 — Rotarod Habituation" },
  { type: "rotarod",           dayOffset: 6,  notes: "Day 7–8 — Rotarod Testing (Acceleration)" },
  { type: "stamina",           dayOffset: 8,  notes: "Day 9 — Stamina Test (10 RPM / 60m Cap)" },
  { type: "blood_draw",        dayOffset: 9,  notes: "Day 10 — Plasma Collection (10:00–13:00)" },
];

/**
 * Schedule experiments for an animal.
 * @param onlyTimepointAgeDays - optional array of timepoint age_days to limit scheduling to
 */
export async function scheduleExperimentsForAnimal(
  animalId: string,
  birthDate: string,
  onlyTimepointAgeDays?: number[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get all timepoints
  const { data: allTimepoints } = await supabase
    .from("colony_timepoints")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (!allTimepoints || allTimepoints.length === 0) {
    return { error: "No timepoints configured. Add timepoints first." };
  }

  // Filter to requested timepoints if specified
  const timepoints = onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0
    ? allTimepoints.filter(tp => onlyTimepointAgeDays.includes(tp.age_days))
    : allTimepoints;

  if (timepoints.length === 0) {
    return { error: "No matching timepoints found." };
  }

  // Get existing experiments for this animal to avoid duplicates
  const { data: existingExps } = await supabase
    .from("animal_experiments")
    .select("experiment_type, timepoint_age_days")
    .eq("animal_id", animalId)
    .eq("user_id", user.id);

  // Build a set of "type::timepoint" keys that already exist
  const existingKeys = new Set(
    (existingExps || []).map(e => `${e.experiment_type}::${e.timepoint_age_days}`)
  );

  const birth = new Date(birthDate);
  const DAY = 24 * 60 * 60 * 1000;
  const records: Record<string, unknown>[] = [];

  // Track whether EEG implant surgery has been scheduled (only once, at first timepoint)
  // Check if one already exists in the DB or is being created for an earlier timepoint
  let eegImplantScheduled = (existingExps || []).some(e => e.experiment_type === "eeg_implant");

  for (const tp of timepoints) {
    const experimentStart = new Date(birth.getTime() + tp.age_days * DAY);
    const selectedExps = new Set((tp.experiments as string[]) || []);

    // Schedule each experiment in the protocol that the user selected
    for (const step of PROTOCOL_SCHEDULE) {
      const key = `${step.type}::${tp.age_days}`;

      // "handling" is always included if handling_days_before > 0
      if (step.type === "handling") {
        if (tp.handling_days_before > 0 && !existingKeys.has(key)) {
          const handlingStart = new Date(experimentStart.getTime() - tp.handling_days_before * DAY);
          records.push({
            user_id: user.id,
            animal_id: animalId,
            experiment_type: "handling",
            timepoint_age_days: tp.age_days,
            scheduled_date: handlingStart.toISOString().split("T")[0],
            status: "scheduled",
            notes: step.notes,
          });
        }
        continue;
      }

      // Only schedule experiments the user selected in their timepoint config
      if (!selectedExps.has(step.type)) continue;

      // Skip if already exists
      if (existingKeys.has(key)) continue;

      const expDate = new Date(experimentStart.getTime() + step.dayOffset * DAY);
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: step.type,
        timepoint_age_days: tp.age_days,
        scheduled_date: expDate.toISOString().split("T")[0],
        status: "scheduled",
        notes: step.notes,
      });
    }

    // EEG: implant surgery happens ONCE (first EEG timepoint only),
    // then recording-only at subsequent timepoints.
    //
    // Protocol:
    //   1st EEG TP (e.g. 60d): experiments (10d) → implant surgery → 7d recovery → 3d recording
    //   Later TPs (120d, 180d): experiments (10d) → 7d rest → 3d recording (no surgery)
    if (tp.includes_eeg_implant) {
      const afterExperimentsDate = new Date(experimentStart.getTime() + 10 * DAY);

      if (!eegImplantScheduled) {
        // First timepoint with EEG: schedule surgery + recovery + recording
        eegImplantScheduled = true;

        if (!existingKeys.has(`eeg_implant::${tp.age_days}`)) {
          records.push({
            user_id: user.id,
            animal_id: animalId,
            experiment_type: "eeg_implant",
            timepoint_age_days: tp.age_days,
            scheduled_date: afterExperimentsDate.toISOString().split("T")[0],
            status: "scheduled",
            notes: "EEG implant surgery (one-time)",
          });
        }

        if (!existingKeys.has(`eeg_recording::${tp.age_days}`)) {
          const recordingStart = new Date(afterExperimentsDate.getTime() + tp.eeg_recovery_days * DAY);
          records.push({
            user_id: user.id,
            animal_id: animalId,
            experiment_type: "eeg_recording",
            timepoint_age_days: tp.age_days,
            scheduled_date: recordingStart.toISOString().split("T")[0],
            status: "scheduled",
            notes: `EEG recording (${tp.eeg_recording_days}d) after ${tp.eeg_recovery_days}d post-surgery recovery`,
          });
        }
      } else {
        // Subsequent timepoints: recording only (7d rest after experiments, no surgery)
        if (!existingKeys.has(`eeg_recording::${tp.age_days}`)) {
          const recordingStart = new Date(afterExperimentsDate.getTime() + 7 * DAY);
          records.push({
            user_id: user.id,
            animal_id: animalId,
            experiment_type: "eeg_recording",
            timepoint_age_days: tp.age_days,
            scheduled_date: recordingStart.toISOString().split("T")[0],
            status: "scheduled",
            notes: `EEG recording (${tp.eeg_recording_days}d) — 7d rest after experiments (no surgery needed)`,
          });
        }
      }
    }
  }

  if (records.length > 0) {
    const { error } = await supabase.from("animal_experiments").insert(records);
    if (error) return { error: error.message };
  }

  revalidatePath("/colony");
  return { success: true, count: records.length };
}

// ─── Cohort-Level Auto-Schedule ─────────────────────────────────────────

/**
 * Auto-schedule experiments for ALL animals in a given cohort.
 * @param onlyTimepointAgeDays - optional array of timepoint age_days to limit scheduling
 */
export async function scheduleExperimentsForCohort(
  cohortId: string,
  onlyTimepointAgeDays?: number[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get the cohort
  const { data: cohort } = await supabase
    .from("cohorts")
    .select("*")
    .eq("id", cohortId)
    .eq("user_id", user.id)
    .single();

  if (!cohort) return { error: "Cohort not found." };

  // Get all active animals in this cohort
  const { data: cohortAnimals } = await supabase
    .from("animals")
    .select("id, birth_date")
    .eq("cohort_id", cohortId)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!cohortAnimals || cohortAnimals.length === 0) {
    return { error: "No active animals in this cohort." };
  }

  let totalCount = 0;
  let animalsScheduled = 0;
  const errors: string[] = [];

  for (const animal of cohortAnimals) {
    const birthDate = animal.birth_date || cohort.birth_date;
    const result = await scheduleExperimentsForAnimal(animal.id, birthDate, onlyTimepointAgeDays);
    if (result.error) {
      errors.push(`Animal ${animal.id}: ${result.error}`);
    } else if ((result.count || 0) > 0) {
      totalCount += result.count || 0;
      animalsScheduled++;
    }
  }

  revalidatePath("/colony");

  if (totalCount === 0 && errors.length === 0) {
    return { error: `All experiments for all ${cohortAnimals.length} animals are already scheduled. Nothing new to add.` };
  }

  if (errors.length > 0) {
    return { success: true, scheduled: animalsScheduled, total: totalCount, errors };
  }
  return { success: true, scheduled: animalsScheduled, total: totalCount };
}

// ─── Mass Delete Experiments ────────────────────────────────────────────

/**
 * Delete experiments for a single animal.
 * @param onlyTimepointAgeDays — if provided, only delete experiments at these timepoints
 * @param onlyStatuses — if provided, only delete experiments with these statuses
 */
export async function deleteExperimentsForAnimal(
  animalId: string,
  onlyTimepointAgeDays?: number[],
  onlyStatuses?: string[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // First count what we're about to delete
  let countQuery = supabase
    .from("animal_experiments")
    .select("id", { count: "exact", head: true })
    .eq("animal_id", animalId)
    .eq("user_id", user.id);

  if (onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0) {
    countQuery = countQuery.in("timepoint_age_days", onlyTimepointAgeDays);
  }
  if (onlyStatuses && onlyStatuses.length > 0) {
    countQuery = countQuery.in("status", onlyStatuses);
  }

  const { count } = await countQuery;

  // Now delete — build fresh query to avoid type issues
  // We need to get the IDs first, then delete by IDs
  let idsQuery = supabase
    .from("animal_experiments")
    .select("id")
    .eq("animal_id", animalId)
    .eq("user_id", user.id);

  if (onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0) {
    idsQuery = idsQuery.in("timepoint_age_days", onlyTimepointAgeDays);
  }
  if (onlyStatuses && onlyStatuses.length > 0) {
    idsQuery = idsQuery.in("status", onlyStatuses);
  }

  const { data: rows } = await idsQuery;
  if (rows && rows.length > 0) {
    const ids = rows.map(r => r.id);
    const { error } = await supabase
      .from("animal_experiments")
      .delete()
      .in("id", ids);
    if (error) return { error: error.message };
  }

  revalidatePath("/colony");
  return { success: true, deleted: count ?? 0 };
}

/**
 * Delete experiments for ALL animals in a cohort.
 * @param onlyTimepointAgeDays — if provided, only delete at these timepoints
 * @param onlyStatuses — if provided, only delete experiments with these statuses
 */
export async function deleteExperimentsForCohort(
  cohortId: string,
  onlyTimepointAgeDays?: number[],
  onlyStatuses?: string[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get all animals in this cohort
  const { data: cohortAnimals } = await supabase
    .from("animals")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("user_id", user.id);

  if (!cohortAnimals || cohortAnimals.length === 0) {
    return { error: "No animals in this cohort." };
  }

  const animalIds = cohortAnimals.map(a => a.id);

  // Get IDs of experiments to delete
  let idsQuery = supabase
    .from("animal_experiments")
    .select("id")
    .in("animal_id", animalIds)
    .eq("user_id", user.id);

  if (onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0) {
    idsQuery = idsQuery.in("timepoint_age_days", onlyTimepointAgeDays);
  }
  if (onlyStatuses && onlyStatuses.length > 0) {
    idsQuery = idsQuery.in("status", onlyStatuses);
  }

  const { data: rows } = await idsQuery;
  const deleteCount = rows?.length ?? 0;

  if (rows && rows.length > 0) {
    // Delete in batches of 100 to avoid query size limits
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100).map(r => r.id);
      const { error } = await supabase
        .from("animal_experiments")
        .delete()
        .in("id", batch);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/colony");
  return { success: true, deleted: deleteCount, animals: cohortAnimals.length };
}

// ─── Grace Period / Reschedule ──────────────────────────────────────────

/**
 * Reschedule remaining experiments for an animal at a specific timepoint.
 * When experiments fall behind, this shifts all incomplete experiments forward
 * so they run in sequence starting from `newStartDate`.
 *
 * Rules:
 *  - Grace period is AFTER the timepoint only (e.g. 60-day TP → must finish by day 90 if grace=30)
 *  - Completed/skipped experiments are not moved
 *  - Only incomplete (pending/scheduled/in_progress) experiments are shifted
 */
export async function rescheduleTimepointExperiments(
  animalId: string,
  timepointAgeDays: number,
  newStartDate: string,
  birthDate: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get the timepoint config to check grace period
  const { data: tp } = await supabase
    .from("colony_timepoints")
    .select("*")
    .eq("user_id", user.id)
    .eq("age_days", timepointAgeDays)
    .single();

  if (!tp) return { error: "Timepoint not found" };

  const graceDays = tp.grace_period_days ?? 30;
  const birth = new Date(birthDate);
  const DAY = 24 * 60 * 60 * 1000;

  // Hard deadline = birth + age_days + grace_period_days
  const deadline = new Date(birth.getTime() + (timepointAgeDays + graceDays) * DAY);
  const newStart = new Date(newStartDate);

  // Get all incomplete experiments for this animal + timepoint
  const { data: exps } = await supabase
    .from("animal_experiments")
    .select("*")
    .eq("animal_id", animalId)
    .eq("user_id", user.id)
    .eq("timepoint_age_days", timepointAgeDays)
    .in("status", ["pending", "scheduled", "in_progress"])
    .order("scheduled_date", { ascending: true });

  if (!exps || exps.length === 0) return { success: true, message: "No experiments to reschedule" };

  // Build the offset map from PROTOCOL_SCHEDULE
  const offsetMap = new Map<string, number>();
  for (const step of PROTOCOL_SCHEDULE) {
    offsetMap.set(step.type, step.dayOffset);
  }

  // Sort experiments by their protocol order (dayOffset)
  const sorted = [...exps].sort((a, b) => {
    const oa = offsetMap.get(a.experiment_type) ?? 99;
    const ob = offsetMap.get(b.experiment_type) ?? 99;
    return oa - ob;
  });

  // Reschedule: sequential from newStartDate, maintaining relative offsets
  const firstOffset = offsetMap.get(sorted[0].experiment_type) ?? 0;
  const updates: { id: string; scheduled_date: string }[] = [];
  let lastDate = newStart;

  for (const exp of sorted) {
    const origOffset = offsetMap.get(exp.experiment_type) ?? 0;
    // Days after the first incomplete experiment in the original protocol
    const relOffset = origOffset - firstOffset;
    const newDate = new Date(newStart.getTime() + Math.max(0, relOffset) * DAY);

    // Check against deadline
    if (newDate > deadline) {
      return {
        error: `Cannot reschedule — "${exp.experiment_type.replace(/_/g, " ")}" would fall on ${newDate.toISOString().split("T")[0]}, past the grace deadline of ${deadline.toISOString().split("T")[0]} (${timepointAgeDays}d + ${graceDays}d grace).`,
      };
    }

    updates.push({ id: exp.id, scheduled_date: newDate.toISOString().split("T")[0] });
    lastDate = newDate;
  }

  // Apply all updates
  for (const u of updates) {
    await supabase
      .from("animal_experiments")
      .update({ scheduled_date: u.scheduled_date, status: "scheduled" })
      .eq("id", u.id)
      .eq("user_id", user.id);
  }

  revalidatePath("/colony");
  return { success: true, rescheduled: updates.length, lastDate: lastDate.toISOString().split("T")[0] };
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

// ─── Meeting Notes ──────────────────────────────────────────────────────

export async function createMeetingNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const attendeesRaw = (formData.get("attendees") as string) || "";
  const attendees = attendeesRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const { error } = await supabase.from("meeting_notes").insert({
    user_id: user.id,
    title: formData.get("title") as string,
    meeting_date: formData.get("meeting_date") as string,
    attendees,
    content: (formData.get("content") as string) || "",
    tags: [],
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  revalidatePath("/meetings");
  return { success: true };
}

export async function updateMeetingNote(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const update: Record<string, unknown> = {};
  if (formData.has("title")) update.title = formData.get("title");
  if (formData.has("content")) update.content = formData.get("content");
  if (formData.has("meeting_date")) update.meeting_date = formData.get("meeting_date");
  if (formData.has("attendees")) {
    const raw = (formData.get("attendees") as string) || "";
    update.attendees = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (formData.has("action_items")) {
    try { update.action_items = JSON.parse(formData.get("action_items") as string); } catch { /* ignore */ }
  }
  if (formData.has("ai_summary")) update.ai_summary = formData.get("ai_summary");

  const { error } = await supabase.from("meeting_notes").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  revalidatePath("/meetings");
  return { success: true };
}

export async function deleteMeetingNote(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("meeting_notes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  revalidatePath("/meetings");
  return { success: true };
}

// ─── Cage Changes ───────────────────────────────────────────────────────

export async function generateCageChanges(startDateStr: string, count: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const DAY = 24 * 60 * 60 * 1000;
  const start = new Date(startDateStr);
  const records = [];

  for (let i = 0; i < count; i++) {
    const scheduledDate = new Date(start.getTime() + i * 14 * DAY);
    records.push({
      user_id: user.id,
      scheduled_date: scheduledDate.toISOString().split("T")[0],
      is_completed: false,
    });
  }

  const { error } = await supabase.from("cage_changes").insert(records);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true, count: records.length };
}

export async function toggleCageChange(id: string, completed: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("cage_changes")
    .update({
      is_completed: completed,
      completed_date: completed ? new Date().toISOString().split("T")[0] : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteCageChange(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("cage_changes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Colony Photos ──────────────────────────────────────────────────────

export async function addColonyPhoto(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("colony_photos").insert({
    user_id: user.id,
    image_url: formData.get("image_url") as string,
    caption: (formData.get("caption") as string) || null,
    animal_id: (formData.get("animal_id") as string) || null,
    experiment_type: (formData.get("experiment_type") as string) || null,
    taken_date: (formData.get("taken_date") as string) || null,
    show_in_portal: formData.get("show_in_portal") !== "false",
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteColonyPhoto(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("colony_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

// ─── Housing Cages ──────────────────────────────────────────────────────

export async function createHousingCage(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("housing_cages").insert({
    user_id: user.id,
    cage_label: formData.get("cage_label") as string,
    location: (formData.get("location") as string) || null,
    max_occupancy: parseInt(formData.get("max_occupancy") as string) || 5,
    cage_type: (formData.get("cage_type") as string) || "standard",
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function updateHousingCage(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("housing_cages")
    .update({
      cage_label: formData.get("cage_label") as string,
      location: (formData.get("location") as string) || null,
      max_occupancy: parseInt(formData.get("max_occupancy") as string) || 5,
      cage_type: (formData.get("cage_type") as string) || "standard",
      notes: (formData.get("notes") as string) || null,
      is_active: formData.get("is_active") === "true",
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function deleteHousingCage(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("housing_cages").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

export async function assignAnimalToCage(animalId: string, housingCageId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // If assigning to a cage, check occupancy
  if (housingCageId) {
    const { data: cage } = await supabase
      .from("housing_cages")
      .select("max_occupancy")
      .eq("id", housingCageId)
      .eq("user_id", user.id)
      .single();

    const { count } = await supabase
      .from("animals")
      .select("*", { count: "exact", head: true })
      .eq("housing_cage_id", housingCageId)
      .eq("user_id", user.id)
      .neq("id", animalId);

    if (cage && count !== null && count >= cage.max_occupancy) {
      return { error: `Cage is full (${count}/${cage.max_occupancy} mice). Remove an animal first.` };
    }
  }

  const { error } = await supabase
    .from("animals")
    .update({ housing_cage_id: housingCageId })
    .eq("id", animalId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/colony");
  return { success: true };
}

