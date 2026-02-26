"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

/**
 * Cursor-based pagination: fetch ALL rows from a table using id > lastId.
 * More reliable than .range() or RPC pagination.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: any, table: string, userId: string, extraFilters?: Record<string, unknown>): Promise<any[]> {
  const PAGE = 900;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let lastId: string | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(PAGE);

    if (lastId) query = query.gt("id", lastId);

    // Apply extra filters (e.g. .in("animal_id", [...]))
    if (extraFilters) {
      for (const [key, value] of Object.entries(extraFilters)) {
        if (key.startsWith("in:")) {
          query = query.in(key.slice(3), value as string[]);
        } else {
          query = query.eq(key, value);
        }
      }
    }

    const { data, error } = await query;
    if (error) { console.error(`fetchAllRows ${table} error:`, error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE) break;
  }
  return all;
}

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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteBreederCage(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("breeder_cages").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

// ─── Cohorts ────────────────────────────────────────────────────────────

export async function createCohort(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const birthDate = formData.get("birth_date") as string;
  const cohortName = formData.get("name") as string;
  const litterSizeRaw = formData.get("litter_size") as string | null;

  const { data: cohort, error } = await supabase.from("cohorts").insert({
    user_id: user.id,
    breeder_cage_id: (formData.get("breeder_cage_id") as string) || null,
    name: cohortName,
    birth_date: birthDate,
    litter_size: litterSizeRaw ? parseInt(litterSizeRaw) : null,
    notes: (formData.get("notes") as string) || null,
  }).select("id, name, birth_date").single();
  if (error) return { error: error.message };

  // Auto-create litter follow-up reminders (default on) so you can enter minimal info now and fill details later.
  const createFollowups = formData.get("create_followup_tasks") === "true";
  if (createFollowups && cohort?.birth_date) {
    const birth = new Date(cohort.birth_date);
    if (!Number.isNaN(birth.getTime())) {
      const addDays = (d: Date, days: number) => {
        const next = new Date(d);
        next.setDate(next.getDate() + days);
        return next.toISOString().split("T")[0];
      };
      const day21 = addDays(birth, 21);
      const day30 = addDays(birth, 30);
      const day35 = addDays(birth, 35);

      const sourceLabel = `Cohort follow-up: ${cohort.name}`;
      const followupTasks = [
        {
          user_id: user.id,
          title: `Cohort details check-in (${cohort.name})`,
          description: "Enter/confirm pup count, sex breakdown, weaning status, and any notes once pups are old enough.",
          due_date: day21,
          priority: "high" as const,
          status: "pending" as const,
          source_type: "cohort_followup" as const,
          source_id: cohort.id,
          source_label: sourceLabel,
          tags: ["colony", "cohort", "weaning"],
        },
        {
          user_id: user.id,
          title: `Genotyping follow-up (${cohort.name})`,
          description: `Genotyping usually lands around day 30–35. Start checking at day 30 and finalize genotype entry by day 35 (${day35}).`,
          due_date: day30,
          priority: "high" as const,
          status: "pending" as const,
          source_type: "cohort_followup" as const,
          source_id: cohort.id,
          source_label: sourceLabel,
          tags: ["colony", "cohort", "genotyping"],
        },
      ];
      await supabase.from("tasks").insert(followupTasks);

      // Add calendar reminders too when the workspace calendar table exists.
      await supabase.from("workspace_calendar_events").insert([
        {
          user_id: user.id,
          title: `Cohort details check-in (${cohort.name})`,
          category: "colony",
          status: "planned",
          start_at: `${day21}T09:00:00`,
          end_at: `${day21}T09:30:00`,
          source_type: "cohort",
          source_id: cohort.id,
          source_label: cohort.name,
        },
        {
          user_id: user.id,
          title: `Genotyping follow-up (${cohort.name})`,
          category: "colony",
          status: "planned",
          start_at: `${day30}T09:00:00`,
          end_at: `${day30}T09:30:00`,
          source_type: "cohort",
          source_id: cohort.id,
          source_label: cohort.name,
        },
      ]);
    }
  }
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function updateCohort(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const newBirthDate = formData.get("birth_date") as string;

  // Get old birth_date to detect change
  const { data: oldCohort } = await supabase
    .from("cohorts")
    .select("birth_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("cohorts")
    .update({
      breeder_cage_id: (formData.get("breeder_cage_id") as string) || null,
      name: formData.get("name") as string,
      birth_date: newBirthDate,
      litter_size: formData.get("litter_size") ? parseInt(formData.get("litter_size") as string) : null,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // CASCADE: If birth_date changed, update all animals in this cohort + reschedule their experiments
  if (oldCohort && oldCohort.birth_date !== newBirthDate && newBirthDate) {
    // Update all animals' birth_date
    const { data: cohortAnimals } = await supabase
      .from("animals")
      .select("id")
      .eq("cohort_id", id)
      .eq("user_id", user.id);

    if (cohortAnimals && cohortAnimals.length > 0) {
      const animalIds = cohortAnimals.map((a: { id: string }) => a.id);

      // Update birth_date on all animals
      for (let i = 0; i < animalIds.length; i += 100) {
        const batch = animalIds.slice(i, i + 100);
        await supabase
          .from("animals")
          .update({ birth_date: newBirthDate })
          .in("id", batch);
      }

      // Reschedule non-completed experiments for all animals in this cohort
      const allExps = await fetchAllRows(supabase, "animal_experiments", user.id, { "in:animal_id": animalIds });
      const pendingExps = allExps.filter(
        (e: { status: string }) => e.status === "scheduled" || e.status === "pending" || e.status === "in_progress"
      );
      for (const exp of pendingExps) {
        if (exp.timepoint_age_days != null) {
          const d = new Date(newBirthDate);
          d.setDate(d.getDate() + exp.timepoint_age_days);
          const newScheduledDate = d.toISOString().split("T")[0];
          await supabase
            .from("animal_experiments")
            .update({ scheduled_date: newScheduledDate })
            .eq("id", exp.id);
        }
      }
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteCohort(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("cohorts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, id: data.id };
}

export async function updateAnimal(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const newBirthDate = formData.get("birth_date") as string;
  const newStatus = formData.get("status") as string;

  // Get old values to detect changes
  const { data: oldAnimal } = await supabase
    .from("animals")
    .select("birth_date, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("animals")
    .update({
      cohort_id: formData.get("cohort_id") as string,
      identifier: formData.get("identifier") as string,
      sex: formData.get("sex") as string,
      genotype: formData.get("genotype") as string,
      ear_tag: (formData.get("ear_tag") as string) || null,
      birth_date: newBirthDate,
      cage_number: (formData.get("cage_number") as string) || null,
      status: newStatus,
      eeg_implanted: formData.get("eeg_implanted") === "true",
      eeg_implant_date: (formData.get("eeg_implant_date") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // CASCADE: If birth_date changed, reschedule all non-completed experiments
  if (oldAnimal && oldAnimal.birth_date !== newBirthDate && newBirthDate) {
    const allExps = await fetchAllRows(supabase, "animal_experiments", user.id, { animal_id: id });
    const pendingExps = allExps.filter(
      (e: { status: string }) => e.status === "scheduled" || e.status === "pending" || e.status === "in_progress"
    );
    for (const exp of pendingExps) {
      if (exp.timepoint_age_days != null) {
        const d = new Date(newBirthDate);
        d.setDate(d.getDate() + exp.timepoint_age_days);
        const newScheduledDate = d.toISOString().split("T")[0];
        await supabase
          .from("animal_experiments")
          .update({ scheduled_date: newScheduledDate })
          .eq("id", exp.id);
      }
    }
  }

  // CASCADE: If status changed to inactive/deceased/sacrificed/transferred, skip all scheduled experiments
  if (
    oldAnimal &&
    oldAnimal.status === "active" &&
    newStatus !== "active" &&
    ["sacrificed", "transferred", "deceased"].includes(newStatus)
  ) {
    const allExps = await fetchAllRows(supabase, "animal_experiments", user.id, { animal_id: id });
    const scheduledExps = allExps.filter(
      (e: { status: string }) => e.status === "scheduled" || e.status === "pending"
    );
    const expIds = scheduledExps.map((e: { id: string }) => e.id);
    for (let i = 0; i < expIds.length; i += 100) {
      const batch = expIds.slice(i, i + 100);
      await supabase
        .from("animal_experiments")
        .update({ status: "skipped", notes: `Auto-skipped: animal marked as ${newStatus}` })
        .in("id", batch);
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteAnimal(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("animals").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
    eeg_implant_timing: ((formData.get("eeg_implant_timing") as string) || "after"),
    eeg_recovery_days: parseInt(formData.get("eeg_recovery_days") as string) || 7,
    eeg_recording_days: parseInt(formData.get("eeg_recording_days") as string) || 3,
    grace_period_days: parseInt(formData.get("grace_period_days") as string) || 30,
    sort_order: parseInt(formData.get("sort_order") as string) || 0,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
      eeg_implant_timing: ((formData.get("eeg_implant_timing") as string) || "after"),
      eeg_recovery_days: parseInt(formData.get("eeg_recovery_days") as string) || 7,
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
    // Fetch all affected experiments using cursor-based pagination
    const allExpsRaw = await fetchAllRows(supabase, "animal_experiments", user.id);
    const affectedExps = (allExpsRaw as { id: string; animal_id: string; timepoint_age_days: number }[])
      .filter(e => e.timepoint_age_days === oldAgeDays);

    if (affectedExps.length > 0) {
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteColonyTimepoint(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get the timepoint's age_days before deleting
  const { data: tp } = await supabase
    .from("colony_timepoints")
    .select("age_days")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase.from("colony_timepoints").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  // CASCADE: Delete all experiments and results for this timepoint's age_days
  if (tp) {
    // Delete experiments in batches
    const allExps = await fetchAllRows(supabase, "animal_experiments", user.id, { timepoint_age_days: tp.age_days });
    const expIds = allExps.map((e: { id: string }) => e.id);
    for (let i = 0; i < expIds.length; i += 100) {
      const batch = expIds.slice(i, i + 100);
      await supabase.from("animal_experiments").delete().in("id", batch);
    }

    // Delete results in batches
    const allResults = await fetchAllRows(supabase, "colony_results", user.id, { timepoint_age_days: tp.age_days });
    const resultIds = allResults.map((r: { id: string }) => r.id);
    for (let i = 0; i < resultIds.length; i += 100) {
      const batch = resultIds.slice(i, i + 100);
      await supabase.from("colony_results").delete().in("id", batch);
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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

  // AUTO-SET: If marking as completed but no completed_date provided, set it to today
  if (update.status === "completed" && !update.completed_date) {
    update.completed_date = new Date().toISOString().split("T")[0];
  }
  // AUTO-CLEAR: If reverting from completed, clear completed_date
  if (update.status && update.status !== "completed" && !formData.has("completed_date")) {
    update.completed_date = null;
  }

  const { error } = await supabase
    .from("animal_experiments")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function batchUpdateAnimalExperimentStatusByIds(
  ids: string[],
  newStatus: "scheduled" | "pending" | "in_progress" | "completed" | "skipped"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  if (!ids.length) return { error: "No experiments selected" };

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "completed") update.completed_date = new Date().toISOString().split("T")[0];
  if (newStatus !== "completed") update.completed_date = null;

  const { error } = await supabase
    .from("animal_experiments")
    .update(update)
    .in("id", ids)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/colony");
  revalidatePath("/experiments");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, updated: ids.length };
}

/**
 * Simple reschedule: move a single experiment to a new date.
 * Used by the calendar drag-and-drop feature.
 */
export async function rescheduleExperimentDate(id: string, newDate: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("animal_experiments")
    .update({ scheduled_date: newDate })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  revalidatePath("/experiments");
  return { success: true };
}

/**
 * Batch reschedule: move multiple experiments (a whole group) to a new date.
 * Used when dragging an experiment group chip on the calendar.
 */
export async function rescheduleExperimentDates(ids: string[], newDate: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("animal_experiments")
    .update({ scheduled_date: newDate })
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  revalidatePath("/experiments");
  return { success: true };
}

/**
 * Schedule a single experiment type for multiple animals at once.
 * Used by the Batch Schedule modal.
 */
export async function batchScheduleSingleExperiment(
  animalIds: string[],
  expType: string,
  date: string,
  timepointAgeDays: number | null
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const rows = animalIds.map((animalId) => ({
    user_id: user.id,
    animal_id: animalId,
    experiment_type: expType,
    scheduled_date: date,
    timepoint_age_days: timepointAgeDays,
    status: "scheduled",
  }));

  // Upsert (conflict on animal_id + experiment_type + timepoint_age_days)
  const { error } = await supabase
    .from("animal_experiments")
    .upsert(rows, { onConflict: "animal_id,experiment_type,timepoint_age_days", ignoreDuplicates: false });

  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  revalidatePath("/experiments");
  return { success: true };
}

/**
 * Batch update experiment status — supports multiple cohorts, timepoints, and experiment types.
 * e.g. "Mark all marble+nesting @ 30d+120d for BPAN 3+BPAN 5 as skipped"
 */
export async function batchUpdateExperimentStatus(
  cohortIds: string[],      // empty = all cohorts
  timepointAgeDays: number[], // which timepoints
  experimentTypes: string[],  // which experiment types
  newStatus: string,
  notes?: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  if (timepointAgeDays.length === 0 || experimentTypes.length === 0) {
    return { error: "Select at least one timepoint and one experiment." };
  }

  // Step 1: Get animal IDs (optionally filtered by cohorts)
  let animalQuery = supabase.from("animals").select("id").eq("user_id", user.id);
  if (cohortIds.length > 0) animalQuery = animalQuery.in("cohort_id", cohortIds);
  const { data: animals, error: animalErr } = await animalQuery;
  if (animalErr) return { error: `Animal fetch: ${animalErr.message}` };
  if (!animals || animals.length === 0) return { error: "No animals found." };

  const animalIds = animals.map(a => a.id);

  // Step 2: For each combination of tp × expType, query matching experiment IDs
  let allMatchingIds: string[] = [];
  for (const tp of timepointAgeDays) {
    for (const expType of experimentTypes) {
      for (let i = 0; i < animalIds.length; i += 50) {
        const batch = animalIds.slice(i, i + 50);
        const { data: exps, error: expErr } = await supabase
          .from("animal_experiments")
          .select("id")
          .eq("user_id", user.id)
          .eq("experiment_type", expType)
          .eq("timepoint_age_days", tp)
          .in("animal_id", batch);
        if (expErr) return { error: `Experiment fetch: ${expErr.message}` };
        if (exps) allMatchingIds = allMatchingIds.concat(exps.map(e => e.id));
      }
    }
  }

  if (allMatchingIds.length === 0) {
    return { error: `No matching experiments found (${animalIds.length} animals, ${experimentTypes.length} types, ${timepointAgeDays.length} timepoints).` };
  }

  // Step 3: Build update payload
  const today = new Date().toISOString().split("T")[0];
  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "completed") update.completed_date = today;
  if (newStatus === "scheduled" || newStatus === "pending") update.completed_date = null;
  if (notes) update.notes = notes;

  // Step 4: Update in batches
  for (let i = 0; i < allMatchingIds.length; i += 100) {
    const batch = allMatchingIds.slice(i, i + 100);
    const { error } = await supabase.from("animal_experiments").update(update).in("id", batch);
    if (error) return { error: error.message };
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, updated: allMatchingIds.length };
}

export async function deleteAnimalExperiment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("animal_experiments").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
//   Day 9    : Rotarod Recovery Day (calendar planning only; no tracker completion)
//   Day 10   : Stamina Test (10 RPM / 60m cap)
//   Day 11+  : Plasma Collection is scheduled dynamically (+7d after last behavior,
//              or +7d after EEG recording window ends when EEG is present)
// EEG implant / recovery / recording are also scheduled dynamically.

const PROTOCOL_SCHEDULE: { type: string; dayOffset: number; notes?: string }[] = [
  { type: "handling",          dayOffset: -5, notes: "5 days: Transport → 1hr rest → 2 min handling" },
  { type: "y_maze",            dayOffset: 0,  notes: "Day 1 AM — Anxiety Baseline (Group Housed)" },
  { type: "marble",            dayOffset: 0,  notes: "Day 1 PM — Marble Burying" },
  { type: "ldb",               dayOffset: 1,  notes: "Day 2 AM — Light-Dark Box" },
  { type: "nesting",           dayOffset: 1,  notes: "Day 2 PM — Overnight Nesting (Isolation)" },
  { type: "data_collection",   dayOffset: 2,  notes: "Day 3 — Data Collection & Move to Core" },
  { type: "core_acclimation",  dayOffset: 3,  notes: "Day 4–5 — 48hr Mandatory Core Acclimation" },
  { type: "catwalk",           dayOffset: 5,  notes: "Day 6 — CatWalk Gait Analysis" },
  { type: "rotarod_hab",       dayOffset: 5,  notes: "Day 6 — Rotarod Habituation (Day 1 of 4)" },
  { type: "rotarod_test1",     dayOffset: 6,  notes: "Day 7 — Rotarod Test 1 (Day 2 of 4)" },
  { type: "rotarod_test2",     dayOffset: 7,  notes: "Day 8 — Rotarod Test 2 (Day 3 of 4)" },
  { type: "stamina",           dayOffset: 9,  notes: "Day 10 — Rotarod Stamina (Day 4 of 4, 10 RPM / 60m Cap)" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_BEHAVIOR_OFFSET = 9; // stamina day
const EEG_RECORDING_GAP_AFTER_BEHAVIOR_DAYS = 1; // recording starts next day after battery
const PLASMA_GAP_AFTER_RECORDING_END_DAYS = 7;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

type EegTimingConfig = {
  includes_eeg_implant?: boolean;
  eeg_implant_timing?: "before" | "after";
  eeg_recovery_days?: number;
  eeg_recording_days?: number;
};

function computeColonyTimelineAnchors(experimentStart: Date, tp: EegTimingConfig) {
  const recoveryDays = tp.eeg_recovery_days ?? 7;
  const recordingDays = tp.eeg_recording_days ?? 3;
  const implantTiming = tp.eeg_implant_timing || "after";

  const behaviorStart = new Date(experimentStart);
  let implantDate: Date | null = null;

  if (tp.includes_eeg_implant && implantTiming === "before") {
    implantDate = new Date(experimentStart);
    behaviorStart.setDate(behaviorStart.getDate() + recoveryDays);
  }

  const lastBehaviorDate = new Date(behaviorStart.getTime() + LAST_BEHAVIOR_OFFSET * DAY_MS);
  if (tp.includes_eeg_implant && implantTiming === "after") {
    implantDate = new Date(lastBehaviorDate.getTime() + DAY_MS);
  }
  const baselineRecordingStart = new Date(lastBehaviorDate.getTime() + EEG_RECORDING_GAP_AFTER_BEHAVIOR_DAYS * DAY_MS);
  const effectiveRecordingStart =
    implantDate && implantTiming === "after"
      ? new Date(implantDate.getTime() + recoveryDays * DAY_MS)
      : baselineRecordingStart;
  const effectiveRecordingEnd = new Date(effectiveRecordingStart.getTime() + recordingDays * DAY_MS);
  const plasmaDate = new Date(effectiveRecordingEnd.getTime() + PLASMA_GAP_AFTER_RECORDING_END_DAYS * DAY_MS);
  const plasmaWithoutEegDate = new Date(lastBehaviorDate.getTime() + PLASMA_GAP_AFTER_RECORDING_END_DAYS * DAY_MS);

  return {
    implantTiming,
    recoveryDays,
    recordingDays,
    behaviorStart,
    lastBehaviorDate,
    implantDate,
    baselineRecordingStart,
    recordingStart: effectiveRecordingStart,
    recordingEnd: effectiveRecordingEnd,
    plasmaDate,
    plasmaWithoutEegDate,
  };
}

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

  // Get all timepoints (sort by sort_order, then age_days as fallback)
  const { data: allTimepointsRaw } = await supabase
    .from("colony_timepoints")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })
    .order("age_days", { ascending: true });
  const allTimepoints = allTimepointsRaw;

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
    .select("id, experiment_type, timepoint_age_days, status")
    .eq("animal_id", animalId)
    .eq("user_id", user.id);

  // Build a set of "type::timepoint" keys that already exist and are NOT skipped
  // Skipped experiments should be re-scheduled when explicitly requested
  const activeKeys = new Set(
    (existingExps || [])
      .filter(e => e.status !== "skipped")
      .map(e => `${e.experiment_type}::${e.timepoint_age_days}`)
  );
  // Track skipped experiments so we can reset them to "scheduled"
  const skippedExps = (existingExps || []).filter(e => e.status === "skipped");
  const skippedKeys = new Set(
    skippedExps.map(e => `${e.experiment_type}::${e.timepoint_age_days}`)
  );
  const skippedIdMap = new Map<string, string>();
  for (const e of skippedExps) {
    skippedIdMap.set(`${e.experiment_type}::${e.timepoint_age_days}`, e.id);
  }

  const birth = new Date(birthDate);
  const DAY = 24 * 60 * 60 * 1000;
  const records: Record<string, unknown>[] = [];
  const skippedIdsToReschedule: { id: string; scheduled_date: string; notes?: string }[] = [];

  // Track whether EEG implant surgery has been scheduled (only once, at first timepoint)
  // Only count non-skipped EEG implants as "already scheduled"
  let eegImplantScheduled = (existingExps || []).some(
    e => e.experiment_type === "eeg_implant" && e.status !== "skipped"
  );
  // If ANY timepoint (across ALL, not just filtered) has includes_eeg_implant, schedule EEG
  const anyTimepointHasEeg = allTimepoints.some(tp => tp.includes_eeg_implant);
  const eegTpConfigForAnimal = allTimepoints.find(t => t.includes_eeg_implant) || timepoints[0];

  for (const tp of timepoints) {
    const experimentStart = new Date(birth.getTime() + tp.age_days * DAY);
    const timeline = computeColonyTimelineAnchors(experimentStart, tp);
    const behaviorAnchor = timeline.behaviorStart;
    const shouldScheduleEegRecording =
      anyTimepointHasEeg && (eegImplantScheduled || tp.age_days >= (eegTpConfigForAnimal?.age_days ?? tp.age_days));

    // Schedule EVERY experiment in the protocol — no filtering by tp.experiments
    for (const step of PROTOCOL_SCHEDULE) {
      const key = `${step.type}::${tp.age_days}`;

      // Skip if already exists with an active status (scheduled, in_progress, completed)
      if (activeKeys.has(key)) continue;

      if (step.type === "handling") {
        if (tp.handling_days_before > 0) {
          const handlingStart = new Date(behaviorAnchor.getTime() - tp.handling_days_before * DAY);
          if (skippedKeys.has(key)) {
            // Re-schedule the skipped experiment
            skippedIdsToReschedule.push({
              id: skippedIdMap.get(key)!,
              scheduled_date: handlingStart.toISOString().split("T")[0],
              notes: step.notes,
            });
          } else {
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
        }
        continue;
      }

      const expDate = new Date(behaviorAnchor.getTime() + step.dayOffset * DAY);
      if (skippedKeys.has(key)) {
        // Re-schedule the skipped experiment
        skippedIdsToReschedule.push({
          id: skippedIdMap.get(key)!,
          scheduled_date: expDate.toISOString().split("T")[0],
          notes: step.notes,
        });
      } else {
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
    }

    // EEG / plasma:
    // - Implant happens once on the designated timepoint (if configured) with before/after behavior timing.
    // - Recording happens at the end of the behavior battery on each eligible timepoint.
    // - Plasma is +7d after recording window ends when EEG is present, otherwise +7d after last behavior.
    if (anyTimepointHasEeg) {
      const eegTpConfig = eegTpConfigForAnimal;
      const isImplantTimepoint = tp.includes_eeg_implant && !eegImplantScheduled;
      if (isImplantTimepoint && timeline.implantDate) {
        eegImplantScheduled = true;
        const implantKey = `eeg_implant::${tp.age_days}`;
        if (!activeKeys.has(implantKey)) {
          const implantDate = isoDate(timeline.implantDate);
          const implantTimingLabel = tp.eeg_implant_timing || "after";
          if (skippedKeys.has(implantKey)) {
            skippedIdsToReschedule.push({
              id: skippedIdMap.get(implantKey)!,
              scheduled_date: implantDate,
              notes: `EEG implant surgery (one-time, ${implantTimingLabel} behavior battery)`,
            });
          } else {
            records.push({
              user_id: user.id, animal_id: animalId,
              experiment_type: "eeg_implant", timepoint_age_days: tp.age_days,
              scheduled_date: implantDate, status: "scheduled",
              notes: `EEG implant surgery (one-time, ${implantTimingLabel} behavior battery)`,
            });
          }
        }
      }

      if (shouldScheduleEegRecording) {
        const recKey = `eeg_recording::${tp.age_days}`;
        if (!activeKeys.has(recKey)) {
          const recDate = isoDate(timeline.recordingStart);
          const recNotes = isImplantTimepoint && timeline.implantDate
            ? `EEG recording (${eegTpConfig.eeg_recording_days}d) after ${timeline.recoveryDays}d ${timeline.implantTiming}-behavior implant recovery`
            : `EEG recording (${eegTpConfig.eeg_recording_days}d) after behavior battery`;
          if (skippedKeys.has(recKey)) {
            skippedIdsToReschedule.push({ id: skippedIdMap.get(recKey)!, scheduled_date: recDate, notes: recNotes });
          } else {
            records.push({
              user_id: user.id, animal_id: animalId,
              experiment_type: "eeg_recording", timepoint_age_days: tp.age_days,
              scheduled_date: recDate,
              status: "scheduled",
              notes: recNotes,
            });
          }
        }
      }
    }

    // Plasma collection (blood_draw) always scheduled for tracker.
    const bloodKey = `blood_draw::${tp.age_days}`;
    if (!activeKeys.has(bloodKey)) {
      const bloodDate = anyTimepointHasEeg && shouldScheduleEegRecording ? isoDate(timeline.plasmaDate) : isoDate(timeline.plasmaWithoutEegDate);
      const bloodNotes = anyTimepointHasEeg && shouldScheduleEegRecording
        ? `Plasma collection (+${PLASMA_GAP_AFTER_RECORDING_END_DAYS}d after ${timeline.recordingDays}d EEG recording)`
        : `Plasma collection (+${PLASMA_GAP_AFTER_RECORDING_END_DAYS}d after last behavior test)`;
      if (skippedKeys.has(bloodKey)) {
        skippedIdsToReschedule.push({ id: skippedIdMap.get(bloodKey)!, scheduled_date: bloodDate, notes: bloodNotes });
      } else {
        records.push({
          user_id: user.id,
          animal_id: animalId,
          experiment_type: "blood_draw",
          timepoint_age_days: tp.age_days,
          scheduled_date: bloodDate,
          status: "scheduled",
          notes: bloodNotes,
        });
      }
    }
  }

  // Re-schedule skipped experiments (update status back to "scheduled")
  if (skippedIdsToReschedule.length > 0) {
    for (const item of skippedIdsToReschedule) {
      await supabase
        .from("animal_experiments")
        .update({ status: "scheduled", scheduled_date: item.scheduled_date, notes: item.notes })
        .eq("id", item.id);
    }
  }

  if (records.length > 0) {
    // Insert in batches of 50 to avoid Supabase payload limits
    for (let i = 0; i < records.length; i += 50) {
      const batch = records.slice(i, i + 50);
      const { error } = await supabase.from("animal_experiments").insert(batch);
      if (error) return { error: `Batch insert failed: ${error.message}` };
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, count: records.length + skippedIdsToReschedule.length, rescheduled: skippedIdsToReschedule.length };
}

// ─── Cohort-Level Auto-Schedule ─────────────────────────────────────────

/**
 * Auto-schedule experiments for ALL animals in a given cohort.
 * Optimized: fetches all data in 3 queries, computes in memory, batch inserts.
 * @param onlyTimepointAgeDays - optional array of timepoint age_days to limit scheduling
 */
export async function scheduleExperimentsForCohort(
  cohortId: string,
  onlyTimepointAgeDays?: number[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // ── 1. Fetch all needed data in parallel ──
  const [cohortRes, animalsRes, timepointsRes] = await Promise.all([
    supabase.from("cohorts").select("*").eq("id", cohortId).eq("user_id", user.id).single(),
    supabase.from("animals").select("id, birth_date").eq("cohort_id", cohortId).eq("user_id", user.id).in("status", ["active", "eeg_implanted"]),
    supabase.from("colony_timepoints").select("*").eq("user_id", user.id).order("sort_order", { ascending: true }).order("age_days", { ascending: true }),
  ]);

  const cohort = cohortRes.data;
  if (!cohort) return { error: "Cohort not found." };

  const cohortAnimals = animalsRes.data;
  if (!cohortAnimals || cohortAnimals.length === 0) return { error: "No active animals in this cohort." };

  const allTimepoints = timepointsRes.data;
  if (!allTimepoints || allTimepoints.length === 0) return { error: "No timepoints configured." };

  const timepoints = onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0
    ? allTimepoints.filter(tp => onlyTimepointAgeDays.includes(tp.age_days))
    : allTimepoints;

  if (timepoints.length === 0) return { error: "No matching timepoints found." };

  // ── 2. Fetch ALL existing experiments for ALL animals in this cohort (cursor-based pagination) ──
  const animalIds = cohortAnimals.map(a => a.id);
  const allExistingRaw = await fetchAllRows(supabase, "animal_experiments", user.id, { "in:animal_id": animalIds });
  const allExisting = allExistingRaw as { id: string; animal_id: string; experiment_type: string; timepoint_age_days: number; status: string }[];

  // Build a set of "animalId::type::tp" keys for NON-skipped experiments
  const activeSet = new Set(
    allExisting
      .filter(e => e.status !== "skipped")
      .map(e => `${e.animal_id}::${e.experiment_type}::${e.timepoint_age_days}`)
  );
  // Build a map for skipped experiments so we can re-schedule them
  const skippedMap = new Map<string, string>(); // key → id
  for (const e of allExisting) {
    if (e.status === "skipped") {
      skippedMap.set(`${e.animal_id}::${e.experiment_type}::${e.timepoint_age_days}`, e.id);
    }
  }
  // Track if EEG implant exists per animal (only non-skipped)
  const animalHasEegImplant = new Set(
    allExisting.filter(e => e.experiment_type === "eeg_implant" && e.status !== "skipped").map(e => e.animal_id)
  );

  // ── 3. Compute all records in memory ──
  const DAY = 24 * 60 * 60 * 1000;
  const allRecords: Record<string, unknown>[] = [];
  const skippedIdsToReschedule: { id: string; scheduled_date: string; notes?: string }[] = [];
  let animalsScheduled = 0;
  // If ANY timepoint (across ALL, not just filtered) has includes_eeg_implant, schedule EEG
  const anyTimepointHasEeg = allTimepoints.some(tp => tp.includes_eeg_implant);
  const eegTpConfig = allTimepoints.find(t => t.includes_eeg_implant) || timepoints[0];

  for (const animal of cohortAnimals) {
    const birthDate = animal.birth_date || cohort.birth_date;
    const birth = new Date(birthDate);
    let animalRecords = 0;
    let eegImplantScheduled = animalHasEegImplant.has(animal.id);

    for (const tp of timepoints) {
      const experimentStart = new Date(birth.getTime() + tp.age_days * DAY);
      const timeline = computeColonyTimelineAnchors(experimentStart, tp);
      const behaviorAnchor = timeline.behaviorStart;
      const shouldScheduleEegRecording =
        anyTimepointHasEeg && (eegImplantScheduled || tp.age_days >= (eegTpConfig?.age_days ?? tp.age_days));

      // Schedule EVERY experiment in the protocol
      for (const step of PROTOCOL_SCHEDULE) {
        const key = `${animal.id}::${step.type}::${tp.age_days}`;

        // Skip if already active (scheduled, in_progress, completed)
        if (activeSet.has(key)) continue;

        if (step.type === "handling") {
          if (tp.handling_days_before > 0) {
            const handlingStart = new Date(behaviorAnchor.getTime() - tp.handling_days_before * DAY);
            const date = handlingStart.toISOString().split("T")[0];
            if (skippedMap.has(key)) {
              skippedIdsToReschedule.push({ id: skippedMap.get(key)!, scheduled_date: date, notes: step.notes });
              skippedMap.delete(key);
            } else {
              allRecords.push({
                user_id: user.id, animal_id: animal.id,
                experiment_type: "handling", timepoint_age_days: tp.age_days,
                scheduled_date: date, status: "scheduled", notes: step.notes,
              });
            }
            activeSet.add(key);
            animalRecords++;
          }
          continue;
        }

        const expDate = new Date(behaviorAnchor.getTime() + step.dayOffset * DAY);
        const date = expDate.toISOString().split("T")[0];
        if (skippedMap.has(key)) {
          skippedIdsToReschedule.push({ id: skippedMap.get(key)!, scheduled_date: date, notes: step.notes });
          skippedMap.delete(key);
        } else {
          allRecords.push({
            user_id: user.id, animal_id: animal.id,
            experiment_type: step.type, timepoint_age_days: tp.age_days,
            scheduled_date: date, status: "scheduled", notes: step.notes,
          });
        }
        activeSet.add(key);
        animalRecords++;
      }

      // EEG / plasma scheduling mirrors the single-animal scheduler.
      if (anyTimepointHasEeg) {
        const isImplantTimepoint = tp.includes_eeg_implant && !eegImplantScheduled;
        if (isImplantTimepoint && timeline.implantDate) {
          eegImplantScheduled = true;
          const implantKey = `${animal.id}::eeg_implant::${tp.age_days}`;
          if (!activeSet.has(implantKey)) {
            const implantDate = isoDate(timeline.implantDate);
            const implantTimingLabel = tp.eeg_implant_timing || "after";
            if (skippedMap.has(implantKey)) {
              skippedIdsToReschedule.push({ id: skippedMap.get(implantKey)!, scheduled_date: implantDate, notes: `EEG implant surgery (one-time, ${implantTimingLabel} behavior battery)` });
              skippedMap.delete(implantKey);
            } else {
              allRecords.push({
                user_id: user.id, animal_id: animal.id,
                experiment_type: "eeg_implant", timepoint_age_days: tp.age_days,
                scheduled_date: implantDate, status: "scheduled", notes: `EEG implant surgery (one-time, ${implantTimingLabel} behavior battery)`,
              });
            }
            activeSet.add(implantKey);
            animalRecords++;
          }
        }
        if (shouldScheduleEegRecording) {
          const recKey = `${animal.id}::eeg_recording::${tp.age_days}`;
          if (!activeSet.has(recKey)) {
            const recDate = isoDate(timeline.recordingStart);
            const recNotes = isImplantTimepoint && timeline.implantDate
              ? `EEG recording (${timeline.recordingDays}d) after ${timeline.recoveryDays}d ${timeline.implantTiming}-behavior implant recovery`
              : `EEG recording (${timeline.recordingDays}d) after behavior battery`;
            if (skippedMap.has(recKey)) {
              skippedIdsToReschedule.push({ id: skippedMap.get(recKey)!, scheduled_date: recDate, notes: recNotes });
              skippedMap.delete(recKey);
            } else {
              allRecords.push({
                user_id: user.id, animal_id: animal.id,
                experiment_type: "eeg_recording", timepoint_age_days: tp.age_days,
                scheduled_date: recDate, status: "scheduled", notes: recNotes,
              });
            }
            activeSet.add(recKey);
            animalRecords++;
          }
        }
      }

      const bloodKey = `${animal.id}::blood_draw::${tp.age_days}`;
      if (!activeSet.has(bloodKey)) {
        const bloodDate = anyTimepointHasEeg && shouldScheduleEegRecording ? isoDate(timeline.plasmaDate) : isoDate(timeline.plasmaWithoutEegDate);
        const bloodNotes = anyTimepointHasEeg && shouldScheduleEegRecording
          ? `Plasma collection (+${PLASMA_GAP_AFTER_RECORDING_END_DAYS}d after ${timeline.recordingDays}d EEG recording)`
          : `Plasma collection (+${PLASMA_GAP_AFTER_RECORDING_END_DAYS}d after last behavior test)`;
        if (skippedMap.has(bloodKey)) {
          skippedIdsToReschedule.push({ id: skippedMap.get(bloodKey)!, scheduled_date: bloodDate, notes: bloodNotes });
          skippedMap.delete(bloodKey);
        } else {
          allRecords.push({
            user_id: user.id, animal_id: animal.id,
            experiment_type: "blood_draw", timepoint_age_days: tp.age_days,
            scheduled_date: bloodDate, status: "scheduled", notes: bloodNotes,
          });
        }
        activeSet.add(bloodKey);
        animalRecords++;
      }
    }

    if (animalRecords > 0) animalsScheduled++;
  }

  // ── 4a. Re-schedule skipped experiments ──
  if (skippedIdsToReschedule.length > 0) {
    for (let i = 0; i < skippedIdsToReschedule.length; i += 50) {
      const batch = skippedIdsToReschedule.slice(i, i + 50);
      for (const item of batch) {
        await supabase
          .from("animal_experiments")
          .update({ status: "scheduled", scheduled_date: item.scheduled_date, notes: item.notes })
          .eq("id", item.id);
      }
    }
  }

  // ── 4b. Batch insert new records ──
  if (allRecords.length > 0) {
    for (let i = 0; i < allRecords.length; i += 200) {
      const batch = allRecords.slice(i, i + 200);
      const { error } = await supabase.from("animal_experiments").insert(batch);
      if (error) return { error: `Insert failed at batch ${Math.floor(i / 200) + 1}: ${error.message}` };
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);

  const totalChanged = allRecords.length + skippedIdsToReschedule.length;
  if (totalChanged === 0) {
    return { error: `All experiments for all ${cohortAnimals.length} animals are already scheduled. Nothing new to add.` };
  }

  return { success: true, scheduled: animalsScheduled, total: totalChanged, rescheduled: skippedIdsToReschedule.length };
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

  // Get IDs of experiments to delete
  let idsQuery = supabase
    .from("animal_experiments")
    .select("id")
    .eq("animal_id", animalId)
    .eq("user_id", user.id);

  // Only filter by timepoint if explicitly provided (empty array = no filter = all)
  if (onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0) {
    idsQuery = idsQuery.in("timepoint_age_days", onlyTimepointAgeDays);
  }
  if (onlyStatuses && onlyStatuses.length > 0) {
    idsQuery = idsQuery.in("status", onlyStatuses);
  }

  const { data: rows, error: selectError } = await idsQuery;
  if (selectError) return { error: selectError.message };

  const deleteCount = rows?.length ?? 0;

  if (rows && rows.length > 0) {
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, deleted: deleteCount };
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

  // Get experiments to delete using cursor-based pagination + in-memory filtering
  const allExpsRaw = await fetchAllRows(supabase, "animal_experiments", user.id, { "in:animal_id": animalIds });
  const allIds = (allExpsRaw as { id: string; timepoint_age_days: number; status: string }[])
    .filter(e => {
      if (onlyTimepointAgeDays && onlyTimepointAgeDays.length > 0 && !onlyTimepointAgeDays.includes(e.timepoint_age_days)) return false;
      if (onlyStatuses && onlyStatuses.length > 0 && !onlyStatuses.includes(e.status)) return false;
      return true;
    })
    .map(e => e.id);

  if (allIds.length > 0) {
    for (let i = 0; i < allIds.length; i += 100) {
      const batch = allIds.slice(i, i + 100);
      const { error } = await supabase
        .from("animal_experiments")
        .delete()
        .in("id", batch);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, deleted: allIds.length, animals: cohortAnimals.length };
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

  // Build the offset map from PROTOCOL_SCHEDULE + dynamic EEG/plasma timing
  const offsetMap = new Map<string, number>();
  for (const step of PROTOCOL_SCHEDULE) {
    offsetMap.set(step.type, step.dayOffset);
  }
  offsetMap.set("handling", -(tp.handling_days_before ?? 5));

  const expsIncludeEegRecording = exps.some((e) => e.experiment_type === "eeg_recording");
  const recoveryDays = tp.eeg_recovery_days ?? 7;
  const recordingDays = tp.eeg_recording_days ?? 3;
  const implantTiming = tp.eeg_implant_timing || "after";
  let eegImplantOffset: number | null = null;
  if (exps.some((e) => e.experiment_type === "eeg_implant")) {
    eegImplantOffset = implantTiming === "before" ? 0 : LAST_BEHAVIOR_OFFSET + 1;
    offsetMap.set("eeg_implant", eegImplantOffset);
  }
  let eegRecordingOffset = LAST_BEHAVIOR_OFFSET + EEG_RECORDING_GAP_AFTER_BEHAVIOR_DAYS;
  if (expsIncludeEegRecording) {
    if (eegImplantOffset !== null && implantTiming === "after") {
      eegRecordingOffset = eegImplantOffset + recoveryDays;
    } else if (eegImplantOffset !== null && implantTiming === "before") {
      eegRecordingOffset = recoveryDays + LAST_BEHAVIOR_OFFSET + EEG_RECORDING_GAP_AFTER_BEHAVIOR_DAYS;
    }
    offsetMap.set("eeg_recording", eegRecordingOffset);
  }
  offsetMap.set(
    "blood_draw",
    expsIncludeEegRecording
      ? eegRecordingOffset + recordingDays + PLASMA_GAP_AFTER_RECORDING_END_DAYS
      : LAST_BEHAVIOR_OFFSET + PLASMA_GAP_AFTER_RECORDING_END_DAYS
  );

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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, token: data.token };
}

export async function deleteAdvisorAccess(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("advisor_portal").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteCageChange(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("cage_changes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteColonyPhoto(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("colony_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
    cage_id: (formData.get("cage_id") as string) || null,
    location: (formData.get("location") as string) || null,
    max_occupancy: parseInt(formData.get("max_occupancy") as string) || 5,
    cage_type: (formData.get("cage_type") as string) || "standard",
    notes: (formData.get("notes") as string) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
      cage_id: (formData.get("cage_id") as string) || null,
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteHousingCage(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("housing_cages").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/colony");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
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
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}
