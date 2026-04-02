#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function getMetadataString(metadata, key) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

const RESULT_EXPERIMENT_LABELS = {
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

const SCHEDULE_ONLY_EXPERIMENTS = new Set(["handling", "data_collection", "core_acclimation", "eeg_implant"]);

async function loadSchemaByTemplateId(supabase, templateIds) {
  if (!templateIds.length) return new Map();

  const { data: schemas, error: schemasError } = await supabase
    .from("result_schemas")
    .select("id,template_id")
    .in("template_id", templateIds)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (schemasError) throw schemasError;

  const latestSchemaByTemplateId = new Map();
  for (const schema of schemas || []) {
    const templateId = String(schema.template_id || "");
    if (!templateId || latestSchemaByTemplateId.has(templateId)) continue;
    latestSchemaByTemplateId.set(templateId, { id: String(schema.id), template_id: templateId });
  }

  const schemaIds = Array.from(latestSchemaByTemplateId.values()).map((schema) => schema.id);
  if (!schemaIds.length) return new Map();

  const { data: columns, error: columnsError } = await supabase
    .from("result_schema_columns")
    .select("schema_id,key,label,column_type,required,default_value,options,unit,help_text,group_key,sort_order,is_system_default,is_enabled")
    .in("schema_id", schemaIds)
    .order("sort_order", { ascending: true });

  if (columnsError) throw columnsError;

  const columnsBySchemaId = new Map();
  for (const column of columns || []) {
    const schemaId = String(column.schema_id || "");
    if (!schemaId) continue;
    if (!columnsBySchemaId.has(schemaId)) columnsBySchemaId.set(schemaId, []);
    columnsBySchemaId.get(schemaId).push({
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

  const schemaByTemplateId = new Map();
  for (const [templateId, schema] of latestSchemaByTemplateId.entries()) {
    schemaByTemplateId.set(templateId, {
      id: schema.id,
      snapshot: columnsBySchemaId.get(schema.id) || [],
    });
  }
  return schemaByTemplateId;
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const targetRunId = process.argv[2] || null;
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let runQuery = supabase
    .from("experiment_runs")
    .select("id,name,result_schema_id,schema_snapshot")
    .order("updated_at", { ascending: false });

  if (targetRunId) {
    runQuery = runQuery.eq("id", targetRunId);
  }

  const { data: runs, error: runsError } = await runQuery;
  if (runsError) throw runsError;

  const summary = [];

  for (const run of runs || []) {
    const { data: blocks, error: blocksError } = await supabase
      .from("run_schedule_blocks")
      .select("id,day_index,slot_kind,slot_label,scheduled_time,sort_order,title,notes,metadata,experiment_template_id")
      .eq("experiment_run_id", run.id)
      .order("day_index", { ascending: true })
      .order("sort_order", { ascending: true });

    if (blocksError) throw blocksError;

    const resultBlocks = (blocks || []).flatMap((block) => {
      const metadata = block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
        ? block.metadata
        : {};
      const experimentKey = getMetadataString(metadata, "experimentType");
      const timepointKey = getMetadataString(metadata, "timepointWindowName");
      const age = Number(timepointKey || metadata.targetAgeDays || metadata.minAgeDays || 0);

      if (!experimentKey || !timepointKey || !Number.isFinite(age) || age <= 0) return [];
      if (SCHEDULE_ONLY_EXPERIMENTS.has(experimentKey)) return [];

      return [{
        id: block.id,
        day_index: block.day_index,
        slot_kind: block.slot_kind,
        slot_label: block.slot_label,
        scheduled_time: block.scheduled_time,
        sort_order: block.sort_order,
        title: block.title,
        notes: block.notes,
        timepointKey,
        age,
        experimentKey,
        experimentTemplateId: typeof block.experiment_template_id === "string" ? block.experiment_template_id : null,
      }];
    });

    const timepointMap = new Map();
    for (const block of resultBlocks) {
      if (!timepointMap.has(block.timepointKey)) {
        timepointMap.set(block.timepointKey, {
          key: block.timepointKey,
          label: `${block.age} Day`,
          target_age_days: block.age,
          sort_order: block.age,
        });
      }
    }

    const timepoints = Array.from(timepointMap.values()).sort((a, b) => a.target_age_days - b.target_age_days);

    const experimentMap = new Map();
    for (const timepoint of timepoints) {
      const rows = resultBlocks
        .filter((block) => block.timepointKey === timepoint.key)
        .sort((a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order);
      let experimentSort = 0;
      for (const block of rows) {
        const experimentCompositeKey = `${timepoint.key}::${block.experimentKey}`;
        if (experimentMap.has(experimentCompositeKey)) continue;
        experimentMap.set(experimentCompositeKey, {
          timepointKey: timepoint.key,
          experiment_key: block.experimentKey,
          experiment_template_id: block.experimentTemplateId,
          label: RESULT_EXPERIMENT_LABELS[block.experimentKey] || block.title || block.experimentKey,
          sort_order: experimentSort,
        });
        experimentSort += 1;
      }
    }

    const experiments = Array.from(experimentMap.values());
    const singleExperimentSnapshot =
      experiments.length === 1 && Array.isArray(run.schema_snapshot) ? run.schema_snapshot : [];
    const experimentTemplateIds = [...new Set(experiments.map((experiment) => experiment.experiment_template_id).filter(Boolean))];
    const schemaByTemplateId = await loadSchemaByTemplateId(supabase, experimentTemplateIds);

    const { data: existingTimepoints, error: existingTimepointsError } = await supabase
      .from("run_timepoints")
      .select("id")
      .eq("experiment_run_id", run.id);
    if (existingTimepointsError) throw existingTimepointsError;

    const existingTimepointIds = (existingTimepoints || []).map((row) => row.id);
    const existingExperimentIds = [];
    if (existingTimepointIds.length > 0) {
      const { data: existingExperiments, error: existingExperimentsError } = await supabase
        .from("run_timepoint_experiments")
        .select("id")
        .in("run_timepoint_id", existingTimepointIds);
      if (existingExperimentsError) throw existingExperimentsError;
      existingExperimentIds.push(...(existingExperiments || []).map((row) => row.id));
    }

    if (existingExperimentIds.length > 0) {
      const { error: deleteStepsError } = await supabase
        .from("run_experiment_schedule_steps")
        .delete()
        .in("run_timepoint_experiment_id", existingExperimentIds);
      if (deleteStepsError) throw deleteStepsError;
    }

    if (existingTimepointIds.length > 0) {
      const { error: deleteExperimentsError } = await supabase
        .from("run_timepoint_experiments")
        .delete()
        .in("run_timepoint_id", existingTimepointIds);
      if (deleteExperimentsError) throw deleteExperimentsError;
    }

    const { error: deleteTimepointsError } = await supabase
      .from("run_timepoints")
      .delete()
      .eq("experiment_run_id", run.id);
    if (deleteTimepointsError) throw deleteTimepointsError;

    let insertedTimepoints = [];
    if (timepoints.length > 0) {
      const { data, error } = await supabase
        .from("run_timepoints")
        .insert(
          timepoints.map((timepoint, index) => ({
            experiment_run_id: run.id,
            key: timepoint.key,
            label: timepoint.label,
            target_age_days: timepoint.target_age_days,
            sort_order: index,
            notes: null,
          }))
        )
        .select("*");
      if (error) throw error;
      insertedTimepoints = data || [];
    }

    const timepointIdByKey = new Map(insertedTimepoints.map((timepoint) => [timepoint.key, timepoint.id]));

    let insertedExperiments = [];
    if (experiments.length > 0) {
      const { data, error } = await supabase
        .from("run_timepoint_experiments")
        .insert(
          experiments.map((experiment) => ({
            run_timepoint_id: timepointIdByKey.get(experiment.timepointKey),
            experiment_key: experiment.experiment_key,
            label: experiment.label,
            sort_order: experiment.sort_order,
            result_schema_id:
              (experiment.experiment_template_id && schemaByTemplateId.get(experiment.experiment_template_id)?.id) ||
              (experiments.length === 1 ? run.result_schema_id : null),
            schema_snapshot:
              (experiment.experiment_template_id && schemaByTemplateId.get(experiment.experiment_template_id)?.snapshot) ||
              (experiments.length === 1 ? singleExperimentSnapshot : []),
            notes: null,
          }))
        )
        .select("*");
      if (error) throw error;
      insertedExperiments = data || [];
    }

    const experimentIdByCompositeKey = new Map(
      insertedExperiments.map((experiment) => [
        `${insertedTimepoints.find((timepoint) => timepoint.id === experiment.run_timepoint_id)?.key}::${experiment.experiment_key}`,
        experiment.id,
      ])
    );

    const scheduleSteps = resultBlocks
      .map((block) => ({
        run_timepoint_experiment_id: experimentIdByCompositeKey.get(`${block.timepointKey}::${block.experimentKey}`),
        relative_day: block.day_index,
        slot_kind: block.slot_kind,
        slot_label: block.slot_label,
        scheduled_time: block.scheduled_time,
        sort_order: block.sort_order,
        task_type: "experiment",
        notes: block.notes || null,
      }))
      .filter((step) => Boolean(step.run_timepoint_experiment_id));

    if (scheduleSteps.length > 0) {
      const { error } = await supabase.from("run_experiment_schedule_steps").insert(scheduleSteps);
      if (error) throw error;
    }

    summary.push({
      run_id: run.id,
      run_name: run.name,
      timepoints: timepoints.length,
      experiments: experiments.length,
      schedule_steps: scheduleSteps.length,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
