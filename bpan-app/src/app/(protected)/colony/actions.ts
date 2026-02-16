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
  const DAY = 24 * 60 * 60 * 1000;
  const records: Record<string, unknown>[] = [];

  for (const tp of timepoints) {
    const experimentStart = new Date(birth.getTime() + tp.age_days * DAY);
    const selectedExps = new Set((tp.experiments as string[]) || []);

    // Schedule each experiment in the protocol that the user selected
    for (const step of PROTOCOL_SCHEDULE) {
      // "handling" is always included if handling_days_before > 0
      if (step.type === "handling") {
        if (tp.handling_days_before > 0) {
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

    // EEG implant + recovery + recording (after experiment window)
    if (tp.includes_eeg_implant) {
      const implantDate = new Date(experimentStart.getTime() + 10 * DAY); // after Day 10
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: "eeg_implant",
        timepoint_age_days: tp.age_days,
        scheduled_date: implantDate.toISOString().split("T")[0],
        status: "scheduled",
        notes: "EEG implant surgery",
      });

      const recordingStart = new Date(implantDate.getTime() + tp.eeg_recovery_days * DAY);
      records.push({
        user_id: user.id,
        animal_id: animalId,
        experiment_type: "eeg_recording",
        timepoint_age_days: tp.age_days,
        scheduled_date: recordingStart.toISOString().split("T")[0],
        status: "scheduled",
        notes: `EEG recording (${tp.eeg_recording_days} days) after ${tp.eeg_recovery_days}d recovery`,
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

