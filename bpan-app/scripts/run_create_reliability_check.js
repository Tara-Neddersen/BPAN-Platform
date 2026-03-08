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

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const ownerUserId = process.env.RUN_RELIABILITY_USER_ID || process.argv[2];
  const templateId = process.env.RUN_RELIABILITY_TEMPLATE_ID || process.argv[3];
  if (!ownerUserId || !templateId) {
    throw new Error(
      "Usage: node scripts/run_create_reliability_check.js <owner_user_id> <template_id> (or set RUN_RELIABILITY_USER_ID / RUN_RELIABILITY_TEMPLATE_ID).",
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runName = `Run reliability check ${Date.now()}`;
  const { data: created, error: createError } = await supabase
    .from("experiment_runs")
    .insert({
      template_id: templateId,
      owner_user_id: ownerUserId,
      owner_lab_id: null,
      visibility: "private",
      name: runName,
      description: "Automated reliability check for run create + reload",
      status: "planned",
      selected_protocol_id: null,
      result_schema_id: null,
      schema_snapshot: [],
      schedule_template_id: null,
      start_anchor_date: null,
      notes: null,
      created_by: ownerUserId,
    })
    .select("id,name,schedule_template_id,created_at")
    .single();

  if (createError || !created?.id) {
    throw new Error(`Create failed: ${createError?.message || "unknown"}`);
  }

  const immediateList = await supabase
    .from("experiment_runs")
    .select("id,name")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (immediateList.error) {
    throw new Error(`Immediate list failed: ${immediateList.error.message}`);
  }

  const firstReload = await supabase
    .from("experiment_runs")
    .select("id,name,schedule_template_id,updated_at")
    .eq("id", created.id)
    .single();
  if (firstReload.error) {
    throw new Error(`Reload-by-id failed: ${firstReload.error.message}`);
  }

  const secondReloadList = await supabase
    .from("experiment_runs")
    .select("id,name")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (secondReloadList.error) {
    throw new Error(`Reload list failed: ${secondReloadList.error.message}`);
  }

  const immediateVisible = (immediateList.data || []).some((row) => row.id === created.id);
  const reloadVisible = (secondReloadList.data || []).some((row) => row.id === created.id);
  if (!immediateVisible || !reloadVisible) {
    throw new Error(
      `Reliability check failed: immediateVisible=${String(immediateVisible)} reloadVisible=${String(reloadVisible)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        run_id: created.id,
        schedule_template_id: created.schedule_template_id,
        immediate_visible: immediateVisible,
        reload_visible: reloadVisible,
        reloaded_row: firstReload.data,
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
