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

const VALID_EXPERIMENT_TYPES = new Set([
  "y_maze",
  "ldb",
  "marble",
  "nesting",
  "social_interaction",
  "catwalk",
  "rotarod_hab",
  "rotarod_test1",
  "rotarod_test2",
  "rotarod",
  "stamina",
  "blood_draw",
  "data_collection",
  "core_acclimation",
  "eeg_implant",
  "eeg_recording",
  "handling",
]);

function getMetadataString(metadata, key) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function getMetadataStringArray(metadata, key) {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeExperimentType(value) {
  return VALID_EXPERIMENT_TYPES.has(value) ? value : null;
}

function inferExperimentTypeFromTitle(title) {
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases = {
    y_maze: "y_maze",
    ymmaze: "y_maze",
    light_dark_box: "ldb",
    ldb: "ldb",
    marble_burying: "marble",
    nesting: "nesting",
    si: "social_interaction",
    social_interaction: "social_interaction",
    catwalk: "catwalk",
    rr_hab: "rotarod_hab",
    rotarod_hab: "rotarod_hab",
    rotarod_habituation: "rotarod_hab",
    rr_1: "rotarod_test1",
    rotarod_test_1: "rotarod_test1",
    rotarod_test1: "rotarod_test1",
    rr_2: "rotarod_test2",
    rotarod_test_2: "rotarod_test2",
    rotarod_test2: "rotarod_test2",
    rr_stamina: "stamina",
    rotarod: "rotarod",
    stamina: "stamina",
    blood_draw: "blood_draw",
    plasma: "blood_draw",
    plasma_collection: "blood_draw",
    eeg_implant: "eeg_implant",
    eeg_surgery: "eeg_implant",
    eeg_recording: "eeg_recording",
    handling: "handling",
    transport: "data_collection",
    rest_day: "core_acclimation",
    data_collection: "data_collection",
    core_acclimation: "core_acclimation",
  };

  return aliases[slug] || normalizeExperimentType(slug);
}

function buildNormalizedRunBlockMetadata(metadata, title) {
  const explicitExperimentType = normalizeExperimentType(getMetadataString(metadata, "experimentType"));
  const inferredExperimentType = explicitExperimentType || inferExperimentTypeFromTitle(title);
  const singleWindowName = getMetadataString(metadata, "timepointWindowName");
  const windowNames = getMetadataStringArray(metadata, "timepointWindowNames");
  const normalizedWindowNames = windowNames.length > 0 ? windowNames : singleWindowName ? [singleWindowName] : [];
  const baseMetadata = { ...metadata };

  if (inferredExperimentType) {
    baseMetadata.experimentType = inferredExperimentType;
  }

  const expansions = normalizedWindowNames.length > 0 ? normalizedWindowNames : [singleWindowName || ""];

  return expansions.map((windowName) => {
    const nextMetadata = { ...baseMetadata };
    if (windowName) {
      nextMetadata.timepointWindowName = windowName;
      nextMetadata.timepointWindowNames = [windowName];
      if (
        (nextMetadata.targetAgeDays === undefined ||
          nextMetadata.targetAgeDays === null ||
          nextMetadata.targetAgeDays === "") &&
        !Number.isNaN(Number(windowName))
      ) {
        nextMetadata.targetAgeDays = String(Number(windowName));
      }
    }
    return nextMetadata;
  });
}

async function fetchScheduledBlocksForTemplateSchedule(supabase, scheduleTemplateId) {
  const { data: scheduleDays, error: daysError } = await supabase
    .from("schedule_days")
    .select("*")
    .eq("schedule_template_id", scheduleTemplateId)
    .order("day_index", { ascending: true });

  if (daysError) throw daysError;
  const dayRows = scheduleDays || [];
  const dayIds = dayRows.map((day) => String(day.id));
  if (dayIds.length === 0) return [];

  const { data: scheduleSlots, error: slotsError } = await supabase
    .from("schedule_slots")
    .select("*")
    .in("schedule_day_id", dayIds)
    .order("sort_order", { ascending: true });

  if (slotsError) throw slotsError;
  const slotRows = scheduleSlots || [];
  const slotIds = slotRows.map((slot) => String(slot.id));
  if (slotIds.length === 0) return [];

  const { data: scheduledBlocks, error: blocksError } = await supabase
    .from("scheduled_blocks")
    .select("*")
    .in("schedule_slot_id", slotIds)
    .order("sort_order", { ascending: true });

  if (blocksError) throw blocksError;

  const dayById = new Map(dayRows.map((day) => [String(day.id), day]));
  const slotById = new Map(slotRows.map((slot) => [String(slot.id), slot]));

  return (scheduledBlocks || []).flatMap((block) => {
    const slot = slotById.get(String(block.schedule_slot_id));
    if (!slot) return [];
    const day = dayById.get(String(slot.schedule_day_id));
    if (!day) return [];

    return [
      {
        block,
        day_index: Number(day.day_index),
        slot_kind: slot.slot_kind,
        slot_label: slot.label || null,
        scheduled_time: slot.start_time || null,
        slot_sort_order: Number(slot.sort_order) || 0,
      },
    ];
  });
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const runId = process.argv[2];
  if (!runId) {
    throw new Error("Usage: node scripts/repair_run_schedule_blocks.js <run_id>");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: run, error: runError } = await supabase
    .from("experiment_runs")
    .select("id,name,schedule_template_id")
    .eq("id", runId)
    .single();

  if (runError) throw runError;
  if (!run?.schedule_template_id) {
    throw new Error(`Run ${runId} has no schedule_template_id.`);
  }

  const sourceBlocks = await fetchScheduledBlocksForTemplateSchedule(supabase, run.schedule_template_id);
  const templateIds = [
    ...new Set(sourceBlocks.map((entry) => String(entry.block.experiment_template_id || "")).filter(Boolean)),
  ];

  const { data: templateTitles, error: templateTitlesError } = await supabase
    .from("experiment_templates")
    .select("id,title")
    .in("id", templateIds);

  if (templateTitlesError) throw templateTitlesError;

  const titleByTemplateId = new Map(
    (templateTitles || []).map((template) => [String(template.id), String(template.title || "Untitled template")]),
  );

  let dayCursor = -1;
  let daySort = 0;
  const dedupeKeys = new Set();
  const runBlocks = sourceBlocks
    .sort((a, b) => {
      if (a.day_index !== b.day_index) return a.day_index - b.day_index;
      if (a.slot_sort_order !== b.slot_sort_order) return a.slot_sort_order - b.slot_sort_order;
      return a.block.sort_order - b.block.sort_order;
    })
    .flatMap((entry) => {
      if (entry.day_index !== dayCursor) {
        dayCursor = entry.day_index;
        daySort = 0;
      }

      const title =
        String(entry.block.title_override || "").trim() ||
        titleByTemplateId.get(String(entry.block.experiment_template_id || "")) ||
        "Untitled block";

      const rawMetadata =
        entry.block.metadata && typeof entry.block.metadata === "object" && !Array.isArray(entry.block.metadata)
          ? entry.block.metadata
          : {};

      return buildNormalizedRunBlockMetadata(rawMetadata, title).flatMap((normalizedMetadata) => {
        const dedupeKey = [
          entry.day_index,
          title,
          getMetadataString(normalizedMetadata, "timepointWindowName") || "__none__",
          getMetadataString(normalizedMetadata, "experimentType") || "__none__",
        ].join("::");

        if (dedupeKeys.has(dedupeKey)) {
          return [];
        }
        dedupeKeys.add(dedupeKey);

        const next = {
          experiment_run_id: run.id,
          source_scheduled_block_id: entry.block.id,
          day_index: entry.day_index,
          slot_kind: entry.slot_kind,
          slot_label: entry.slot_kind === "custom" || entry.slot_kind === "exact_time" ? entry.slot_label : null,
          scheduled_time: entry.slot_kind === "exact_time" ? entry.scheduled_time : null,
          sort_order: daySort,
          experiment_template_id: entry.block.experiment_template_id,
          protocol_id: entry.block.protocol_id,
          title,
          notes: entry.block.notes,
          status: "planned",
          metadata: normalizedMetadata,
        };
        daySort += 1;
        return [next];
      });
    });

  const { error: deleteError } = await supabase
    .from("run_schedule_blocks")
    .delete()
    .eq("experiment_run_id", run.id);

  if (deleteError) throw deleteError;

  if (runBlocks.length > 0) {
    const { error: insertError } = await supabase.from("run_schedule_blocks").insert(runBlocks);
    if (insertError) throw insertError;
  }

  const summary = new Map();
  for (const block of runBlocks) {
    const metadata = block.metadata || {};
    const timepoint = getMetadataString(metadata, "timepointWindowName") || "general";
    const experimentType = getMetadataString(metadata, "experimentType") || "untyped";
    const key = `${timepoint}::${experimentType}`;
    summary.set(key, (summary.get(key) || 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        run_id: run.id,
        run_name: run.name,
        schedule_template_id: run.schedule_template_id,
        repaired_block_count: runBlocks.length,
        groups: Array.from(summary.entries())
          .map(([key, count]) => {
            const [timepoint, experimentType] = key.split("::");
            return { timepoint, experimentType, count };
          })
          .sort((a, b) => Number(a.timepoint) - Number(b.timepoint) || a.experimentType.localeCompare(b.experimentType)),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
