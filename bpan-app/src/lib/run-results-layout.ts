import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExperimentType, PlatformSlotKind } from "@/types";
import { deriveRunBlockExperimentKey, deriveRunWindowAge } from "@/lib/run-timepoint-derivation";

const RESULT_EXPERIMENT_LABELS: Partial<Record<ExperimentType, string>> = {
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Overnight Nesting",
  social_interaction: "Social Interaction",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Habituation",
  rotarod_test1: "Rotarod Test 1",
  rotarod_test2: "Rotarod Test 2",
  rotarod: "Rotarod Testing",
  stamina: "Stamina Test",
  blood_draw: "Plasma Collection",
  eeg_recording: "EEG Recording",
};

const SCHEDULE_ONLY_EXPERIMENTS = new Set<string>([
  "handling",
  "data_collection",
  "core_acclimation",
  "eeg_implant",
]);

function withRunSchemaGuidance(message: string) {
  return `${message} If the Phase 2 run scheduling migration is unavailable, keep this flow in draft mode until the tables are applied.`;
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const raw = getMetadataString(metadata, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadSchemaByTemplateId(supabase: SupabaseClient, templateIds: string[]) {
  if (templateIds.length === 0) return new Map<string, { id: string; snapshot: unknown[] }>();

  const { data: schemas, error: schemasError } = await supabase
    .from("result_schemas")
    .select("id,template_id")
    .in("template_id", templateIds)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (schemasError) {
    throw new Error(withRunSchemaGuidance(schemasError.message));
  }

  const latestSchemaByTemplateId = new Map<string, { id: string; template_id: string }>();
  for (const schema of schemas || []) {
    const templateId = typeof schema.template_id === "string" ? schema.template_id : "";
    if (!templateId || latestSchemaByTemplateId.has(templateId)) continue;
    latestSchemaByTemplateId.set(templateId, {
      id: String(schema.id),
      template_id: templateId,
    });
  }

  const schemaIds = Array.from(latestSchemaByTemplateId.values()).map((schema) => schema.id);
  if (schemaIds.length === 0) return new Map<string, { id: string; snapshot: unknown[] }>();

  const { data: columns, error: columnsError } = await supabase
    .from("result_schema_columns")
    .select(
      "schema_id,key,label,column_type,required,default_value,options,unit,help_text,group_key,sort_order,is_system_default,is_enabled",
    )
    .in("schema_id", schemaIds)
    .order("sort_order", { ascending: true });

  if (columnsError) {
    throw new Error(withRunSchemaGuidance(columnsError.message));
  }

  const columnsBySchemaId = new Map<string, unknown[]>();
  for (const column of columns || []) {
    const schemaId = typeof column.schema_id === "string" ? column.schema_id : "";
    if (!schemaId) continue;
    if (!columnsBySchemaId.has(schemaId)) columnsBySchemaId.set(schemaId, []);
    columnsBySchemaId.get(schemaId)?.push({
      key: column.key,
      label: column.label,
      column_type: column.column_type,
      required: column.required,
      default_value: column.default_value,
      options: column.options,
      unit: column.unit,
      help_text: column.help_text,
      group_key: column.group_key,
      sort_order: column.sort_order,
      is_system_default: column.is_system_default,
      is_enabled: column.is_enabled,
    });
  }

  const schemaByTemplateId = new Map<string, { id: string; snapshot: unknown[] }>();
  for (const [templateId, schema] of latestSchemaByTemplateId.entries()) {
    schemaByTemplateId.set(templateId, {
      id: schema.id,
      snapshot: columnsBySchemaId.get(schema.id) || [],
    });
  }

  return schemaByTemplateId;
}

export async function syncRunResultsLayoutFromScheduleBlocks(supabase: SupabaseClient, runId: string) {
  const [{ data: run, error: runError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabase.from("experiment_runs").select("id,result_schema_id,schema_snapshot").eq("id", runId).single(),
    supabase
      .from("run_schedule_blocks")
      .select("id,day_index,slot_kind,slot_label,scheduled_time,sort_order,title,notes,metadata,experiment_template_id")
      .eq("experiment_run_id", runId)
      .order("day_index", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (runError || !run?.id) {
    throw new Error(withRunSchemaGuidance(runError?.message || "Run not found."));
  }
  if (blocksError) {
    throw new Error(withRunSchemaGuidance(blocksError.message));
  }

  const resultBlocks = (blocks || []).flatMap((block: Record<string, unknown>) => {
    const metadata =
      block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
        ? (block.metadata as Record<string, unknown>)
        : {};
    const experimentKey = deriveRunBlockExperimentKey(
      getMetadataString(metadata, "experimentType"),
      typeof block.title === "string" ? block.title : "",
    );
    const timepointKey = getMetadataString(metadata, "timepointWindowName");
    const age = deriveRunWindowAge(
      timepointKey,
      getMetadataNumber(metadata, "targetAgeDays") ?? getMetadataNumber(metadata, "minAgeDays") ?? null,
    );

    if (!experimentKey || !timepointKey || !Number.isFinite(age) || age <= 0) return [];
    if (SCHEDULE_ONLY_EXPERIMENTS.has(experimentKey)) return [];

    return [
      {
        id: String(block.id),
        day_index: Number(block.day_index) || 1,
        slot_kind: block.slot_kind as PlatformSlotKind,
        slot_label: typeof block.slot_label === "string" ? block.slot_label : null,
        scheduled_time: typeof block.scheduled_time === "string" ? block.scheduled_time : null,
        sort_order: Number(block.sort_order) || 0,
        title: typeof block.title === "string" ? block.title : "",
        notes: typeof block.notes === "string" ? block.notes : null,
        timepointKey,
        age,
        experimentKey,
        experimentTemplateId:
          typeof block.experiment_template_id === "string" && block.experiment_template_id.trim()
            ? block.experiment_template_id
            : null,
      },
    ];
  });

  const timepointMap = new Map<string, { key: string; label: string; target_age_days: number; sort_order: number }>();
  for (const block of resultBlocks) {
    if (timepointMap.has(block.timepointKey)) continue;
    timepointMap.set(block.timepointKey, {
      key: block.timepointKey,
      label: `${block.age} Day`,
      target_age_days: block.age,
      sort_order: block.age,
    });
  }
  const timepoints = Array.from(timepointMap.values()).sort((a, b) => a.target_age_days - b.target_age_days);

  const experimentMap = new Map<
    string,
    {
      timepointKey: string;
      experiment_key: string;
      experiment_template_id: string | null;
      label: string;
      sort_order: number;
    }
  >();
  for (const timepoint of timepoints) {
    const rows = resultBlocks
      .filter((block) => block.timepointKey === timepoint.key)
      .sort((a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order);
    let experimentSort = 0;
    for (const block of rows) {
      const compositeKey = `${timepoint.key}::${block.experimentKey}`;
      if (experimentMap.has(compositeKey)) continue;
      experimentMap.set(compositeKey, {
        timepointKey: timepoint.key,
        experiment_key: block.experimentKey,
        experiment_template_id: block.experimentTemplateId,
        label:
          RESULT_EXPERIMENT_LABELS[block.experimentKey as ExperimentType] ||
          block.title ||
          block.experimentKey,
        sort_order: experimentSort,
      });
      experimentSort += 1;
    }
  }

  const experiments = Array.from(experimentMap.values());
  const templateIds = [
    ...new Set(
      experiments
        .map((experiment) => experiment.experiment_template_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const schemaByTemplateId = await loadSchemaByTemplateId(supabase, templateIds);
  const singleExperimentSnapshot =
    experiments.length === 1 && Array.isArray(run.schema_snapshot) ? run.schema_snapshot : [];

  // ── ID-stable re-materialization ────────────────────────────────────────────
  // Re-syncing a run must NOT recreate run_timepoints / run_timepoint_experiments
  // with fresh UUIDs: colony_results links to them via ON DELETE SET NULL FKs
  // (migration 068), so delete+recreate would NULL recorded-data links and cause
  // duplicate inserts on the next save. Instead we upsert in place — update rows
  // matched by their natural key, insert only genuinely-new keys, and delete only
  // keys no longer desired (re-pointing any surviving colony_results first).
  const { data: existingTimepoints, error: existingTimepointsError } = await supabase
    .from("run_timepoints")
    .select("id,key")
    .eq("experiment_run_id", runId);

  if (existingTimepointsError) {
    throw new Error(withRunSchemaGuidance(existingTimepointsError.message));
  }

  const existingTimepointRows = (existingTimepoints || []) as Array<{ id: string; key: string }>;
  const existingTimepointIdByKey = new Map(
    existingTimepointRows.map((row) => [String(row.key), String(row.id)]),
  );
  const existingTimepointKeyById = new Map(
    existingTimepointRows.map((row) => [String(row.id), String(row.key)]),
  );
  const existingTimepointIds = existingTimepointRows.map((row) => String(row.id));

  let existingExperimentRows: Array<{ id: string; run_timepoint_id: string; experiment_key: string }> = [];
  if (existingTimepointIds.length > 0) {
    const { data: existingExperiments, error: existingExperimentsError } = await supabase
      .from("run_timepoint_experiments")
      .select("id,run_timepoint_id,experiment_key")
      .in("run_timepoint_id", existingTimepointIds);

    if (existingExperimentsError) {
      throw new Error(withRunSchemaGuidance(existingExperimentsError.message));
    }
    existingExperimentRows = (existingExperiments || []) as Array<{
      id: string;
      run_timepoint_id: string;
      experiment_key: string;
    }>;
  }

  // Map existing experiments by composite (timepointKey::experimentKey) so we can
  // match them to the desired set regardless of their stored UUID.
  const existingExperimentIdByCompositeKey = new Map<string, string>();
  for (const row of existingExperimentRows) {
    const tpKey = existingTimepointKeyById.get(String(row.run_timepoint_id));
    if (!tpKey) continue;
    existingExperimentIdByCompositeKey.set(`${tpKey}::${row.experiment_key}`, String(row.id));
  }

  // ── run_timepoints: update matched-by-key in place, insert new, delete removed ──
  const desiredTimepointKeys = new Set(timepoints.map((timepoint) => timepoint.key));
  const timepointIdByKey = new Map<string, string>();

  // Update rows whose key still exists in the desired set (keep their id).
  for (let index = 0; index < timepoints.length; index += 1) {
    const timepoint = timepoints[index];
    const existingId = existingTimepointIdByKey.get(timepoint.key);
    if (!existingId) continue;
    timepointIdByKey.set(timepoint.key, existingId);
    const { error } = await supabase
      .from("run_timepoints")
      .update({
        label: timepoint.label,
        target_age_days: timepoint.target_age_days,
        sort_order: index,
      })
      .eq("id", existingId);
    if (error) {
      throw new Error(withRunSchemaGuidance(error.message));
    }
  }

  // Insert genuinely-new timepoint keys.
  const newTimepointInserts = timepoints
    .map((timepoint, index) => ({ timepoint, index }))
    .filter(({ timepoint }) => !existingTimepointIdByKey.has(timepoint.key))
    .map(({ timepoint, index }) => ({
      experiment_run_id: runId,
      key: timepoint.key,
      label: timepoint.label,
      target_age_days: timepoint.target_age_days,
      sort_order: index,
      notes: null,
    }));

  if (newTimepointInserts.length > 0) {
    const { data, error } = await supabase
      .from("run_timepoints")
      .insert(newTimepointInserts)
      .select("id,key");
    if (error) {
      throw new Error(withRunSchemaGuidance(error.message));
    }
    for (const row of (data || []) as Array<{ id: string; key: string }>) {
      timepointIdByKey.set(String(row.key), String(row.id));
    }
  }

  // ── run_timepoint_experiments: update matched in place, insert new, delete removed ──
  const desiredExperimentCompositeKeys = new Set(
    experiments.map((experiment) => `${experiment.timepointKey}::${experiment.experiment_key}`),
  );
  const experimentIdByCompositeKey = new Map<string, string>();

  const experimentInserts: Array<Record<string, unknown>> = [];
  for (const experiment of experiments) {
    const compositeKey = `${experiment.timepointKey}::${experiment.experiment_key}`;
    const runTimepointId = timepointIdByKey.get(experiment.timepointKey);
    if (!runTimepointId) continue;
    const resultSchemaId =
      (experiment.experiment_template_id && schemaByTemplateId.get(experiment.experiment_template_id)?.id) ||
      (experiments.length === 1 ? run.result_schema_id : null);
    const schemaSnapshot =
      (experiment.experiment_template_id && schemaByTemplateId.get(experiment.experiment_template_id)?.snapshot) ||
      (experiments.length === 1 ? singleExperimentSnapshot : []);

    const existingId = existingExperimentIdByCompositeKey.get(compositeKey);
    if (existingId) {
      // Update in place so colony_results links (run_timepoint_experiment_id) survive.
      experimentIdByCompositeKey.set(compositeKey, existingId);
      const { error } = await supabase
        .from("run_timepoint_experiments")
        .update({
          run_timepoint_id: runTimepointId,
          label: experiment.label,
          sort_order: experiment.sort_order,
          result_schema_id: resultSchemaId,
          schema_snapshot: schemaSnapshot,
        })
        .eq("id", existingId);
      if (error) {
        throw new Error(withRunSchemaGuidance(error.message));
      }
    } else {
      experimentInserts.push({
        __compositeKey: compositeKey,
        run_timepoint_id: runTimepointId,
        experiment_key: experiment.experiment_key,
        label: experiment.label,
        sort_order: experiment.sort_order,
        result_schema_id: resultSchemaId,
        schema_snapshot: schemaSnapshot,
        notes: null,
      });
    }
  }

  if (experimentInserts.length > 0) {
    const insertPayload = experimentInserts.map(({ __compositeKey, ...rest }) => {
      void __compositeKey;
      return rest;
    });
    const { data, error } = await supabase
      .from("run_timepoint_experiments")
      .insert(insertPayload)
      .select("id,run_timepoint_id,experiment_key");
    if (error) {
      throw new Error(withRunSchemaGuidance(error.message));
    }
    // Re-derive composite keys for inserted rows via their timepoint id.
    const insertedRows = (data || []) as Array<{
      id: string;
      run_timepoint_id: string;
      experiment_key: string;
    }>;
    const timepointKeyByIdAll = new Map<string, string>();
    for (const [key, id] of timepointIdByKey.entries()) timepointKeyByIdAll.set(id, key);
    for (const row of insertedRows) {
      const tpKey = timepointKeyByIdAll.get(String(row.run_timepoint_id));
      if (!tpKey) continue;
      experimentIdByCompositeKey.set(`${tpKey}::${row.experiment_key}`, String(row.id));
    }
  }

  // ── Delete genuinely-removed run_timepoint_experiments (re-point survivors first) ──
  // A removed experiment has no surviving same-key replacement, so re-pointing only
  // applies when a colony_results row could move to an existing survivor. We attempt
  // the re-point defensively; otherwise the ON DELETE SET NULL FK handles cleanup for
  // experiments truly dropped from the battery. CASCADE removes their schedule steps.
  const experimentIdsToDelete = existingExperimentRows
    .map((row) => {
      const tpKey = existingTimepointKeyById.get(String(row.run_timepoint_id));
      const compositeKey = tpKey ? `${tpKey}::${row.experiment_key}` : null;
      return { id: String(row.id), compositeKey };
    })
    .filter(({ compositeKey }) => !compositeKey || !desiredExperimentCompositeKeys.has(compositeKey));

  for (const { id, compositeKey } of experimentIdsToDelete) {
    const survivorId = compositeKey ? experimentIdByCompositeKey.get(compositeKey) : undefined;
    if (survivorId && survivorId !== id) {
      // The (timepoint, experiment_key) still exists under a different id — move any
      // recorded colony_results onto the survivor so links are preserved.
      const { error: repointError } = await supabase
        .from("colony_results")
        .update({ run_timepoint_experiment_id: survivorId })
        .eq("run_timepoint_experiment_id", id);
      if (repointError) {
        throw new Error(withRunSchemaGuidance(repointError.message));
      }
    }
  }

  const experimentIdsToDeleteList = experimentIdsToDelete.map(({ id }) => id);
  if (experimentIdsToDeleteList.length > 0) {
    const { error: deleteExperimentsError } = await supabase
      .from("run_timepoint_experiments")
      .delete()
      .in("id", experimentIdsToDeleteList);
    if (deleteExperimentsError) {
      throw new Error(withRunSchemaGuidance(deleteExperimentsError.message));
    }
  }

  // ── Delete genuinely-removed run_timepoints (re-point survivors first) ──
  const timepointIdsToDelete = existingTimepointRows
    .map((row) => ({ id: String(row.id), key: String(row.key) }))
    .filter(({ key }) => !desiredTimepointKeys.has(key));

  for (const { id, key } of timepointIdsToDelete) {
    const survivorId = timepointIdByKey.get(key);
    if (survivorId && survivorId !== id) {
      const { error: repointTimepointError } = await supabase
        .from("colony_results")
        .update({ run_timepoint_id: survivorId })
        .eq("run_timepoint_id", id);
      if (repointTimepointError) {
        throw new Error(withRunSchemaGuidance(repointTimepointError.message));
      }
    }
  }

  const timepointIdsToDeleteList = timepointIdsToDelete.map(({ id }) => id);
  if (timepointIdsToDeleteList.length > 0) {
    const { error: deleteTimepointsError } = await supabase
      .from("run_timepoints")
      .delete()
      .in("id", timepointIdsToDeleteList);
    if (deleteTimepointsError) {
      throw new Error(withRunSchemaGuidance(deleteTimepointsError.message));
    }
  }

  // ── run_experiment_schedule_steps: rebuild for surviving experiments ──
  // Steps carry no colony data, so a delete+reinsert here is safe. We scope the
  // delete to the surviving experiment ids (steps for deleted experiments were
  // already removed via CASCADE), then re-insert from the current schedule blocks.
  const survivingExperimentIds = Array.from(new Set(experimentIdByCompositeKey.values()));
  if (survivingExperimentIds.length > 0) {
    const { error: deleteStepsError } = await supabase
      .from("run_experiment_schedule_steps")
      .delete()
      .in("run_timepoint_experiment_id", survivingExperimentIds);
    if (deleteStepsError) {
      throw new Error(withRunSchemaGuidance(deleteStepsError.message));
    }
  }

  const scheduleSteps = resultBlocks
    .map((block) => ({
      run_timepoint_experiment_id: experimentIdByCompositeKey.get(`${block.timepointKey}::${block.experimentKey}`),
      relative_day: block.day_index,
      slot_kind: block.slot_kind,
      slot_label: block.slot_label,
      scheduled_time: block.scheduled_time,
      sort_order: block.sort_order,
      task_type: "experiment" as const,
      notes: block.notes || null,
    }))
    .filter((step) => Boolean(step.run_timepoint_experiment_id));

  if (scheduleSteps.length > 0) {
    const { error } = await supabase.from("run_experiment_schedule_steps").insert(scheduleSteps);
    if (error) {
      throw new Error(withRunSchemaGuidance(error.message));
    }
  }
}

export async function syncRunsForTemplateId(supabase: SupabaseClient, templateId: string) {
  if (!templateId) return;

  const { data: blocks, error } = await supabase
    .from("run_schedule_blocks")
    .select("experiment_run_id")
    .eq("experiment_template_id", templateId);

  if (error) {
    throw new Error(withRunSchemaGuidance(error.message));
  }

  const runIds = [
    ...new Set(
      (blocks || [])
        .map((row: { experiment_run_id: string | null }) =>
          typeof row.experiment_run_id === "string" ? row.experiment_run_id : "",
        )
        .filter(Boolean),
    ),
  ];
  for (const runId of runIds) {
    await syncRunResultsLayoutFromScheduleBlocks(supabase, runId);
  }
}
