"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PlatformAssignmentScope, PlatformRunStatus, PlatformSlotKind, ScheduledBlock } from "@/types";

type RunScheduleBlockInput = {
  day_index: number;
  slot_kind: PlatformSlotKind;
  slot_label: string | null;
  scheduled_time: string | null;
  sort_order: number;
  experiment_template_id: string | null;
  protocol_id: string | null;
  title: string;
  notes: string | null;
  status: PlatformRunStatus;
  metadata: Record<string, unknown>;
  source_scheduled_block_id: string | null;
};

type RunAssignmentInput = {
  scope_type: PlatformAssignmentScope;
  study_id: string | null;
  cohort_id: string | null;
  animal_id: string | null;
  sort_order: number;
};

function parseJsonField<T>(formData: FormData, key: string, fallback: T): T {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function withRunSchemaGuidance(message: string) {
  return `${message} If the Phase 2 run scheduling migration is unavailable, keep this flow in draft mode until the tables are applied.`;
}

function normalizeRunStatus(value: unknown): PlatformRunStatus {
  const runStatus = typeof value === "string" ? value : "";
  if (["draft", "planned", "in_progress", "completed", "cancelled"].includes(runStatus)) {
    return runStatus as PlatformRunStatus;
  }
  return "planned";
}

function normalizeRunScheduleBlocks(value: unknown): RunScheduleBlockInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const slotKind = typeof record.slot_kind === "string" ? record.slot_kind.trim() : "";
      if (!title || !["am", "pm", "midday", "evening", "custom", "exact_time"].includes(slotKind)) {
        return null;
      }

      return {
        day_index: typeof record.day_index === "number" ? record.day_index : 1,
        slot_kind: slotKind as PlatformSlotKind,
        slot_label: typeof record.slot_label === "string" && record.slot_label.trim() ? record.slot_label.trim() : null,
        scheduled_time:
          typeof record.scheduled_time === "string" && record.scheduled_time.trim() ? record.scheduled_time.trim() : null,
        sort_order: typeof record.sort_order === "number" ? record.sort_order : index,
        experiment_template_id:
          typeof record.experiment_template_id === "string" && record.experiment_template_id.trim()
            ? record.experiment_template_id.trim()
            : null,
        protocol_id: typeof record.protocol_id === "string" && record.protocol_id.trim() ? record.protocol_id.trim() : null,
        title,
        notes: typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : null,
        status: normalizeRunStatus(record.status),
        metadata:
          record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
            ? (record.metadata as Record<string, unknown>)
            : {},
        source_scheduled_block_id:
          typeof record.source_scheduled_block_id === "string" && record.source_scheduled_block_id.trim()
            ? record.source_scheduled_block_id.trim()
            : null,
      } satisfies RunScheduleBlockInput;
    })
    .filter((item): item is RunScheduleBlockInput => Boolean(item))
    .map((item, index) => ({
      ...item,
      day_index: item.day_index > 0 ? item.day_index : 1,
      sort_order: index,
    }));
}

function normalizeAssignmentInput(value: unknown): RunAssignmentInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const scopeType = typeof record.scope_type === "string" ? record.scope_type.trim() : "";
  if (!["study", "cohort", "animal"].includes(scopeType)) {
    return null;
  }

  const studyId = typeof record.study_id === "string" && record.study_id.trim() ? record.study_id.trim() : null;
  const cohortId = typeof record.cohort_id === "string" && record.cohort_id.trim() ? record.cohort_id.trim() : null;
  const animalId = typeof record.animal_id === "string" && record.animal_id.trim() ? record.animal_id.trim() : null;

  if (scopeType === "study" && !studyId) return null;
  if (scopeType === "cohort" && !cohortId) return null;
  if (scopeType === "animal" && !animalId) return null;

  return {
    scope_type: scopeType as PlatformAssignmentScope,
    study_id: scopeType === "study" ? studyId : null,
    cohort_id: scopeType === "cohort" ? cohortId : null,
    animal_id: scopeType === "animal" ? animalId : null,
    sort_order: 0,
  };
}

async function fetchScheduledBlocksForTemplateSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheduleTemplateId: string,
) {
  const { data: scheduleDays, error: daysError } = await supabase
    .from("schedule_days")
    .select("*")
    .eq("schedule_template_id", scheduleTemplateId)
    .order("sort_order", { ascending: true });

  if (daysError) {
    throw new Error(withRunSchemaGuidance(daysError.message));
  }

  const dayRows = scheduleDays || [];
  const dayIds = dayRows.map((day) => String(day.id));
  if (dayIds.length === 0) {
    return [] as Array<{
      block: ScheduledBlock;
      day_index: number;
      slot_kind: PlatformSlotKind;
      slot_label: string | null;
      scheduled_time: string | null;
      slot_sort_order: number;
    }>;
  }

  const { data: scheduleSlots, error: slotsError } = await supabase
    .from("schedule_slots")
    .select("*")
    .in("schedule_day_id", dayIds)
    .order("sort_order", { ascending: true });

  if (slotsError) {
    throw new Error(withRunSchemaGuidance(slotsError.message));
  }

  const slotRows = scheduleSlots || [];
  const slotIds = slotRows.map((slot) => String(slot.id));
  if (slotIds.length === 0) {
    return [];
  }

  const { data: scheduledBlocks, error: blocksError } = await supabase
    .from("scheduled_blocks")
    .select("*")
    .in("schedule_slot_id", slotIds)
    .order("sort_order", { ascending: true });

  if (blocksError) {
    throw new Error(withRunSchemaGuidance(blocksError.message));
  }

  const dayById = new Map(dayRows.map((day) => [String(day.id), day]));
  const slotById = new Map(slotRows.map((slot) => [String(slot.id), slot]));

  return (scheduledBlocks as ScheduledBlock[]).flatMap((block) => {
    const slot = slotById.get(block.schedule_slot_id);
    if (!slot) return [];
    const day = dayById.get(String(slot.schedule_day_id));
    if (!day) return [];

    return [
      {
        block,
        day_index: Number(day.day_index),
        slot_kind: slot.slot_kind as PlatformSlotKind,
        slot_label: (slot.label as string | null) || null,
        scheduled_time: (slot.start_time as string | null) || null,
        slot_sort_order: Number(slot.sort_order) || 0,
      },
    ];
  });
}

async function instantiateRunBlocksFromScheduleTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
  scheduleTemplateId: string,
) {
  const sourceBlocks = await fetchScheduledBlocksForTemplateSchedule(supabase, scheduleTemplateId);
  if (sourceBlocks.length === 0) {
    return;
  }

  const templateIds = [
    ...new Set(sourceBlocks.map((entry) => String(entry.block.experiment_template_id || "")).filter(Boolean)),
  ];
  const { data: templateTitles, error: templateTitlesError } = await supabase
    .from("experiment_templates")
    .select("id,title")
    .in("id", templateIds);

  if (templateTitlesError) {
    throw new Error(withRunSchemaGuidance(templateTitlesError.message));
  }

  const titleByTemplateId = new Map(
    (templateTitles || []).map((template) => [String(template.id), String(template.title || "Untitled template")]),
  );

  let dayCursor = -1;
  let daySort = 0;

  const runBlocks = sourceBlocks
    .sort((a, b) => {
      if (a.day_index !== b.day_index) return a.day_index - b.day_index;
      if (a.slot_sort_order !== b.slot_sort_order) return a.slot_sort_order - b.slot_sort_order;
      return a.block.sort_order - b.block.sort_order;
    })
    .map((entry) => {
      if (entry.day_index !== dayCursor) {
        dayCursor = entry.day_index;
        daySort = 0;
      }

      const title =
        (entry.block.title_override || "").trim() ||
        titleByTemplateId.get(entry.block.experiment_template_id) ||
        "Untitled block";

      const next = {
        experiment_run_id: runId,
        source_scheduled_block_id: entry.block.id,
        day_index: entry.day_index,
        slot_kind: entry.slot_kind,
        slot_label: entry.slot_kind === "custom" ? entry.slot_label : entry.slot_kind === "exact_time" ? entry.slot_label : null,
        scheduled_time: entry.slot_kind === "exact_time" ? entry.scheduled_time : null,
        sort_order: daySort,
        experiment_template_id: entry.block.experiment_template_id,
        protocol_id: entry.block.protocol_id,
        title,
        notes: entry.block.notes,
        status: "planned" as const,
        metadata:
          entry.block.metadata && typeof entry.block.metadata === "object" && !Array.isArray(entry.block.metadata)
            ? entry.block.metadata
            : {},
      };
      daySort += 1;
      return next;
    });

  const { error: runBlocksError } = await supabase.from("run_schedule_blocks").insert(runBlocks);
  if (runBlocksError) {
    throw new Error(withRunSchemaGuidance(runBlocksError.message));
  }
}

export async function createExperimentRunFromTemplate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const templateId = typeof formData.get("template_id") === "string" ? (formData.get("template_id") as string).trim() : "";
  const scheduleTemplateId =
    typeof formData.get("schedule_template_id") === "string" ? (formData.get("schedule_template_id") as string).trim() : "";
  const name = typeof formData.get("name") === "string" ? (formData.get("name") as string).trim() : "";
  const description = typeof formData.get("description") === "string" ? (formData.get("description") as string).trim() : "";
  const selectedProtocolId =
    typeof formData.get("selected_protocol_id") === "string" ? (formData.get("selected_protocol_id") as string).trim() : "";
  const status = normalizeRunStatus(formData.get("status"));
  const startAnchorDate =
    typeof formData.get("start_anchor_date") === "string" ? (formData.get("start_anchor_date") as string).trim() : "";
  const assignment = normalizeAssignmentInput(parseJsonField(formData, "assignment", null));

  if (!templateId) {
    throw new Error("Template is required.");
  }

  let resolvedScheduleTemplateId: string | null = null;
  if (scheduleTemplateId) {
    const { data: scheduleTemplateRow, error: scheduleTemplateError } = await supabase
      .from("schedule_templates")
      .select("id,template_id")
      .eq("id", scheduleTemplateId)
      .maybeSingle();

    if (scheduleTemplateError) {
      throw new Error(withRunSchemaGuidance(scheduleTemplateError.message));
    }

    if (scheduleTemplateRow && scheduleTemplateRow.template_id === templateId) {
      resolvedScheduleTemplateId = String(scheduleTemplateRow.id);
    }
  }

  const { data: activeSchema, error: schemaError } = await supabase
    .from("result_schemas")
    .select("id")
    .eq("template_id", templateId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (schemaError) {
    throw new Error(withRunSchemaGuidance(schemaError.message));
  }

  let schemaSnapshot: unknown[] = [];

  if (activeSchema?.id) {
    const { data: snapshotColumns, error: snapshotError } = await supabase
      .from("result_schema_columns")
      .select("key,label,column_type,required,default_value,options,unit,help_text,group_key,sort_order,is_system_default,is_enabled")
      .eq("schema_id", activeSchema.id)
      .order("sort_order", { ascending: true });

    if (snapshotError) {
      throw new Error(withRunSchemaGuidance(snapshotError.message));
    }

    schemaSnapshot = snapshotColumns || [];
  }

  const runId = crypto.randomUUID();

  const { error: runInsertError } = await supabase
    .from("experiment_runs")
    .insert({
      id: runId,
      template_id: templateId,
      owner_user_id: user.id,
      owner_lab_id: null,
      visibility: "private",
      name: name || "Untitled run",
      description: description || null,
      status,
      selected_protocol_id: selectedProtocolId || null,
      result_schema_id: activeSchema?.id || null,
      schema_snapshot: schemaSnapshot,
      schedule_template_id: resolvedScheduleTemplateId,
      start_anchor_date: startAnchorDate || null,
      notes: null,
      created_by: user.id,
    });

  if (runInsertError) {
    throw new Error(withRunSchemaGuidance(runInsertError.message || "Failed to create run."));
  }

  if (resolvedScheduleTemplateId) {
    await instantiateRunBlocksFromScheduleTemplate(supabase, runId, resolvedScheduleTemplateId);
  }

  if (assignment) {
    const { error: assignmentError } = await supabase.from("run_assignments").insert({
      experiment_run_id: runId,
      scope_type: assignment.scope_type,
      study_id: assignment.study_id,
      cohort_id: assignment.cohort_id,
      animal_id: assignment.animal_id,
      sort_order: assignment.sort_order,
    });

    if (assignmentError) {
      throw new Error(withRunSchemaGuidance(assignmentError.message));
    }
  }

  const { data: runRow, error: runSelectError } = await supabase
    .from("experiment_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runSelectError || !runRow?.id) {
    throw new Error(withRunSchemaGuidance(runSelectError?.message || "Run created but could not be loaded."));
  }

  revalidatePath("/experiments");

  return {
    run_id: runId,
    run: runRow,
  };
}

export async function saveRunScheduleBlocks(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const runId = typeof formData.get("run_id") === "string" ? (formData.get("run_id") as string).trim() : "";
  if (!runId) {
    throw new Error("Run id is required.");
  }

  const blocks = normalizeRunScheduleBlocks(parseJsonField(formData, "blocks", []));

  const { error: deleteError } = await supabase
    .from("run_schedule_blocks")
    .delete()
    .eq("experiment_run_id", runId);

  if (deleteError) {
    throw new Error(withRunSchemaGuidance(deleteError.message));
  }

  if (blocks.length > 0) {
    const { error: insertError } = await supabase.from("run_schedule_blocks").insert(
      blocks.map((block) => ({
        experiment_run_id: runId,
        source_scheduled_block_id: block.source_scheduled_block_id,
        day_index: block.day_index,
        slot_kind: block.slot_kind,
        slot_label: block.slot_label,
        scheduled_time: block.scheduled_time,
        sort_order: block.sort_order,
        experiment_template_id: block.experiment_template_id,
        protocol_id: block.protocol_id,
        title: block.title,
        notes: block.notes,
        status: block.status,
        metadata: block.metadata,
      })),
    );

    if (insertError) {
      throw new Error(withRunSchemaGuidance(insertError.message));
    }
  }

  revalidatePath("/experiments");
}

export async function resetRunToTemplateSchedule(runId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: run, error: runError } = await supabase
    .from("experiment_runs")
    .select("id,schedule_template_id")
    .eq("id", runId)
    .single();

  if (runError || !run?.id) {
    throw new Error(withRunSchemaGuidance(runError?.message || "Run not found."));
  }

  const scheduleTemplateId = typeof run.schedule_template_id === "string" ? run.schedule_template_id : "";
  if (!scheduleTemplateId) {
    throw new Error("This run has no linked schedule template to reset from.");
  }

  const { error: deleteError } = await supabase
    .from("run_schedule_blocks")
    .delete()
    .eq("experiment_run_id", runId);

  if (deleteError) {
    throw new Error(withRunSchemaGuidance(deleteError.message));
  }

  await instantiateRunBlocksFromScheduleTemplate(supabase, runId, scheduleTemplateId);
  revalidatePath("/experiments");
}

export async function updateExperimentRunStatus(runId: string, status: PlatformRunStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  if (!["draft", "planned", "in_progress", "completed", "cancelled"].includes(status)) {
    throw new Error("Invalid run status.");
  }

  const { error } = await supabase
    .from("experiment_runs")
    .update({ status })
    .eq("id", runId);

  if (error) {
    throw new Error(withRunSchemaGuidance(error.message));
  }

  revalidatePath("/experiments");
}

export async function cloneExperimentRun(runId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: sourceRun, error: sourceRunError } = await supabase
    .from("experiment_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (sourceRunError || !sourceRun?.id) {
    throw new Error(withRunSchemaGuidance(sourceRunError?.message || "Source run not found."));
  }

  const {
    data: newRun,
    error: newRunError,
  } = await supabase
    .from("experiment_runs")
    .insert({
      template_id: sourceRun.template_id,
      legacy_experiment_id: sourceRun.legacy_experiment_id,
      owner_user_id: sourceRun.owner_user_id,
      owner_lab_id: sourceRun.owner_lab_id,
      visibility: sourceRun.visibility,
      name: `${sourceRun.name} (Clone)`,
      description: sourceRun.description,
      status: "draft",
      selected_protocol_id: sourceRun.selected_protocol_id,
      result_schema_id: sourceRun.result_schema_id,
      schema_snapshot: sourceRun.schema_snapshot || [],
      schedule_template_id: sourceRun.schedule_template_id,
      start_anchor_date: sourceRun.start_anchor_date,
      notes: sourceRun.notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (newRunError || !newRun?.id) {
    throw new Error(withRunSchemaGuidance(newRunError?.message || "Failed to clone run."));
  }

  const newRunId = String(newRun.id);

  const [{ data: sourceBlocks, error: sourceBlocksError }, { data: sourceAssignments, error: sourceAssignmentsError }] =
    await Promise.all([
      supabase
        .from("run_schedule_blocks")
        .select("*")
        .eq("experiment_run_id", runId)
        .order("day_index", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("run_assignments")
        .select("*")
        .eq("experiment_run_id", runId)
        .order("sort_order", { ascending: true }),
    ]);

  if (sourceBlocksError || sourceAssignmentsError) {
    throw new Error(
      withRunSchemaGuidance(sourceBlocksError?.message || sourceAssignmentsError?.message || "Failed to load source run details."),
    );
  }

  if ((sourceBlocks || []).length > 0) {
    const { error: insertBlocksError } = await supabase.from("run_schedule_blocks").insert(
      (sourceBlocks || []).map((block) => ({
        experiment_run_id: newRunId,
        source_scheduled_block_id: block.source_scheduled_block_id,
        day_index: block.day_index,
        slot_kind: block.slot_kind,
        slot_label: block.slot_label,
        scheduled_time: block.scheduled_time,
        sort_order: block.sort_order,
        experiment_template_id: block.experiment_template_id,
        protocol_id: block.protocol_id,
        title: block.title,
        notes: block.notes,
        status: "draft",
        metadata: block.metadata || {},
      })),
    );

    if (insertBlocksError) {
      throw new Error(withRunSchemaGuidance(insertBlocksError.message));
    }
  }

  if ((sourceAssignments || []).length > 0) {
    const { error: insertAssignmentsError } = await supabase.from("run_assignments").insert(
      (sourceAssignments || []).map((assignment) => ({
        experiment_run_id: newRunId,
        scope_type: assignment.scope_type,
        study_id: assignment.study_id,
        cohort_id: assignment.cohort_id,
        animal_id: assignment.animal_id,
        sort_order: assignment.sort_order,
      })),
    );

    if (insertAssignmentsError) {
      throw new Error(withRunSchemaGuidance(insertAssignmentsError.message));
    }
  }

  revalidatePath("/experiments");
  return { run_id: newRunId };
}

export async function updateExperimentRunNotes(runId: string, notes: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const trimmed = notes.trim();
  const historyEntry = `[${new Date().toISOString()}] Notes updated by ${user.id}`;
  const nextNotes = trimmed.length > 0 ? `${trimmed}\n\n---\n${historyEntry}` : historyEntry;

  const { error } = await supabase
    .from("experiment_runs")
    .update({ notes: nextNotes })
    .eq("id", runId);

  if (error) {
    throw new Error(withRunSchemaGuidance(error.message));
  }

  revalidatePath("/experiments");
}

export async function saveRunAssignment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const runId = typeof formData.get("run_id") === "string" ? (formData.get("run_id") as string).trim() : "";
  if (!runId) {
    throw new Error("Run id is required.");
  }

  const assignment = normalizeAssignmentInput(parseJsonField(formData, "assignment", null));

  const { error: deleteError } = await supabase
    .from("run_assignments")
    .delete()
    .eq("experiment_run_id", runId);

  if (deleteError) {
    throw new Error(withRunSchemaGuidance(deleteError.message));
  }

  if (assignment) {
    const { error: insertError } = await supabase.from("run_assignments").insert({
      experiment_run_id: runId,
      scope_type: assignment.scope_type,
      study_id: assignment.study_id,
      cohort_id: assignment.cohort_id,
      animal_id: assignment.animal_id,
      sort_order: assignment.sort_order,
    });

    if (insertError) {
      throw new Error(withRunSchemaGuidance(insertError.message));
    }
  }

  revalidatePath("/experiments");
}
