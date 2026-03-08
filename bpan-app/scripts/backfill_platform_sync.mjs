#!/usr/bin/env node

/**
 * Idempotent backfill runner for run/template/lab-aware migration sync.
 *
 * Usage:
 *   node scripts/backfill_platform_sync.mjs              # dry-run (default)
 *   node scripts/backfill_platform_sync.mjs --dry-run    # explicit dry-run
 *   node scripts/backfill_platform_sync.mjs --apply      # execute writes
 *   node scripts/backfill_platform_sync.mjs --apply --sample-limit 50
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  let dryRun = true;
  let sampleLimit = 25;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--sample-limit") {
      const value = argv[index + 1];
      const parsed = Number.parseInt(value ?? "", 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("Invalid --sample-limit value. Expected a non-negative integer.");
      }
      sampleLimit = parsed;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, dryRun, sampleLimit };
}

function printHelp() {
  console.log("Backfill platform sync runner");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/backfill_platform_sync.mjs");
  console.log("  node scripts/backfill_platform_sync.mjs --apply");
  console.log("  node scripts/backfill_platform_sync.mjs --apply --sample-limit 50");
}

async function main() {
  const { help, dryRun, sampleLimit } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("backfill_platform_sync", {
    dry_run: dryRun,
    sample_limit: sampleLimit,
  });

  if (error) {
    throw new Error(`backfill_platform_sync RPC failed: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
