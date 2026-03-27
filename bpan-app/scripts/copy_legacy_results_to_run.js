#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function loadLocalEnv() {
  const raw = fs.readFileSync(".env.local", "utf8");
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

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const runId = process.argv[2];
  if (!runId) {
    throw new Error("Usage: node scripts/copy_legacy_results_to_run.js <run_id>");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: timepoints, error: timepointsError } = await supabase
    .from("run_timepoints")
    .select("*")
    .eq("experiment_run_id", runId);
  if (timepointsError) throw timepointsError;

  const timepointIds = (timepoints || []).map((timepoint) => timepoint.id);
  const { data: experiments, error: experimentsError } = await supabase
    .from("run_timepoint_experiments")
    .select("*")
    .in("run_timepoint_id", timepointIds);
  if (experimentsError) throw experimentsError;

  const experimentByLegacyKey = new Map();
  for (const timepoint of timepoints || []) {
    for (const experiment of (experiments || []).filter((row) => row.run_timepoint_id === timepoint.id)) {
      experimentByLegacyKey.set(`${timepoint.target_age_days}::${experiment.experiment_key}`, {
        run_timepoint_id: timepoint.id,
        run_timepoint_experiment_id: experiment.id,
        target_age_days: timepoint.target_age_days,
        experiment_key: experiment.experiment_key,
      });
    }
  }

  const { data: legacyRows, error: legacyError } = await supabase
    .from("colony_results")
    .select("user_id,animal_id,timepoint_age_days,experiment_type,measures,notes,recorded_at")
    .is("experiment_run_id", null);
  if (legacyError) throw legacyError;

  const rowsToCopy = [];
  for (const row of legacyRows || []) {
    const match = experimentByLegacyKey.get(`${row.timepoint_age_days}::${row.experiment_type}`);
    if (!match) continue;

    rowsToCopy.push({
      user_id: row.user_id,
      animal_id: row.animal_id,
      experiment_run_id: runId,
      run_timepoint_id: match.run_timepoint_id,
      run_timepoint_experiment_id: match.run_timepoint_experiment_id,
      timepoint_age_days: row.timepoint_age_days,
      experiment_type: row.experiment_type,
      measures: row.measures || {},
      notes: row.notes || null,
      recorded_at: row.recorded_at || new Date().toISOString(),
    });
  }

  if (rowsToCopy.length === 0) {
    console.log(JSON.stringify({ copied: 0, message: "No matching legacy rows found." }, null, 2));
    return;
  }

  const animalIds = [...new Set(rowsToCopy.map((row) => row.animal_id))];
  const runExperimentIds = [...new Set(rowsToCopy.map((row) => row.run_timepoint_experiment_id))];
  const { data: existingRows, error: existingRowsError } = await supabase
    .from("colony_results")
    .select("id,animal_id,run_timepoint_experiment_id")
    .eq("experiment_run_id", runId)
    .in("animal_id", animalIds)
    .in("run_timepoint_experiment_id", runExperimentIds);
  if (existingRowsError) throw existingRowsError;

  const existingByKey = new Map(
    (existingRows || []).map((row) => [`${row.animal_id}::${row.run_timepoint_experiment_id}`, row.id]),
  );

  const updates = [];
  const inserts = [];
  for (const row of rowsToCopy) {
    const key = `${row.animal_id}::${row.run_timepoint_experiment_id}`;
    const existingId = existingByKey.get(key);
    if (existingId) {
      updates.push({ id: existingId, ...row });
    } else {
      inserts.push(row);
    }
  }

  for (const row of updates) {
    const { id, ...payload } = row;
    const { error } = await supabase.from("colony_results").update(payload).eq("id", id);
    if (error) throw error;
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("colony_results").insert(inserts);
    if (error) throw error;
  }

  const grouped = rowsToCopy.reduce((acc, row) => {
    const key = `${row.timepoint_age_days}::${row.experiment_type}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        copied: rowsToCopy.length,
        inserted: inserts.length,
        updated: updates.length,
        groups: Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, count]) => ({ key, count })),
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
