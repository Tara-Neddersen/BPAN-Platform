import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { reconcileDataWithSchemaSnapshot } from "@/lib/results-run-adapters";
import {
  fetchGoogleSheetRows,
  refreshGoogleSheetsToken,
} from "@/lib/google-sheets";
import {
  detectImportTarget,
  parseRowsToTabularPreview,
} from "@/lib/google-sheet-sync";
import {
  applyImportConfig,
  resolveColonyMapping,
  sanitizeImportConfig,
  type GoogleSheetImportConfig,
} from "@/lib/google-sheet-import-config";

type TokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

type LinkRow = {
  id: string;
  user_id: string;
  name: string;
  sheet_id: string;
  gid: string | null;
  sheet_title: string | null;
  target: "auto" | "dataset" | "colony_results";
  import_config?: GoogleSheetImportConfig;
  dataset_id: string | null;
  experiment_id: string | null;
  experiment_run_id: string | null;
};

type DatasetColumnLike = {
  name: string;
  type: "text" | "numeric" | "categorical" | "date";
  unit?: string;
};

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toMaybeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  return value;
}

async function updateLinkStatus(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  linkId: string,
  status: {
    ok: boolean;
    rowCount?: number;
    error?: string;
  }
) {
  const payload = status.ok
    ? {
        last_synced_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_error: null,
        last_row_count: status.rowCount ?? 0,
      }
    : {
        last_synced_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: status.error || "sync_failed",
      };

  await admin
    .from("google_sheet_links")
    .update(payload)
    .eq("id", linkId)
    .eq("user_id", userId);
}

async function syncIntoDataset(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  link: LinkRow,
  columns: DatasetColumnLike[],
  data: Record<string, unknown>[]
) {
  let resolvedColumns = columns;
  let resolvedData = data;

  let run: { id: string; result_schema_id: string | null; schema_snapshot: unknown; legacy_experiment_id: string | null } | null = null;
  if (link.experiment_run_id) {
    const { data: runData } = await admin
      .from("experiment_runs")
      .select("id,result_schema_id,schema_snapshot,legacy_experiment_id")
      .eq("id", link.experiment_run_id)
      .eq("owner_user_id", userId)
      .maybeSingle();
    run = runData || null;
  }

  if (run?.schema_snapshot) {
    const reconciled = reconcileDataWithSchemaSnapshot(columns, data, run.schema_snapshot);
    if (!reconciled.canImport) {
      const blocking = [
        ...reconciled.guardrails.missingRequiredColumnsWithoutDefault,
        ...reconciled.guardrails.missingRequiredValuesWithoutDefault,
      ];
      throw new Error(`Run schema requirements are missing data: ${blocking.join(", ")}`);
    }
    resolvedColumns = reconciled.columns;
    resolvedData = reconciled.data;
  }

  const payload = {
    user_id: userId,
    name: link.name,
    description: `Live sync from Google Sheet (${link.sheet_id})`,
    experiment_id: link.experiment_id || run?.legacy_experiment_id || null,
    experiment_run_id: run?.id || link.experiment_run_id || null,
    result_schema_id: run?.result_schema_id || null,
    schema_snapshot: run?.schema_snapshot || [],
    columns: resolvedColumns,
    data: resolvedData,
    row_count: resolvedData.length,
    source: "google_sheets",
    tags: ["google-sheets", "live-sync", `sheet-link:${link.id}`],
  };

  if (link.dataset_id) {
    const { data: updated, error } = await admin
      .from("datasets")
      .update(payload)
      .eq("id", link.dataset_id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (!error && updated) return { rowCount: resolvedData.length };
  }

  const { data: created, error: createErr } = await admin
    .from("datasets")
    .insert(payload)
    .select("id")
    .single();
  if (createErr) throw new Error(createErr.message);

  await admin
    .from("google_sheet_links")
    .update({ dataset_id: created.id })
    .eq("id", link.id)
    .eq("user_id", userId);

  return { rowCount: resolvedData.length };
}

async function syncIntoColony(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  linkId: string,
  config: GoogleSheetImportConfig,
  columns: DatasetColumnLike[],
  data: Record<string, unknown>[]
) {
  const mapping = resolveColonyMapping(columns, config);
  if (!mapping.animalKey || !mapping.timepointKey || !mapping.experimentKey) {
    throw new Error("Missing required colony columns: animal, timepoint, experiment.");
  }

  const rawAnimals = Array.from(
    new Set(
      data
        .map((row) => String(row[mapping.animalKey!] ?? "").trim())
        .filter(Boolean)
    )
  );

  const uuidValues = rawAnimals.filter(isUuidLike);
  const identifierValues = rawAnimals.filter((value) => !isUuidLike(value));

  const [byIdRes, byIdentifierRes] = await Promise.all([
    uuidValues.length
      ? admin.from("animals").select("id,identifier").eq("user_id", userId).in("id", uuidValues)
      : Promise.resolve({ data: [] as Array<{ id: string; identifier: string }> }),
    identifierValues.length
      ? admin.from("animals").select("id,identifier").eq("user_id", userId).in("identifier", identifierValues)
      : Promise.resolve({ data: [] as Array<{ id: string; identifier: string }> }),
  ]);

  const byId = new Map((byIdRes.data || []).map((a) => [a.id, a.id]));
  const byIdentifier = new Map((byIdentifierRes.data || []).map((a) => [a.identifier, a.id]));

  let synced = 0;
  let skipped = 0;

  for (const row of data) {
    const rawAnimal = String(row[mapping.animalKey] ?? "").trim();
    const animalId = byId.get(rawAnimal) || byIdentifier.get(rawAnimal) || null;
    const timepoint = Number(row[mapping.timepointKey]);
    const experimentType = String(row[mapping.experimentKey] ?? "").trim();

    if (!animalId || !Number.isFinite(timepoint) || !experimentType) {
      skipped++;
      continue;
    }

    const measures: Record<string, unknown> = {};
    for (const key of mapping.measureKeys) {
      measures[key] = toMaybeNumber(row[key]);
    }

    const notes = mapping.notesKey ? String(row[mapping.notesKey] ?? "").trim() || null : null;

    const { error } = await admin.from("colony_results").upsert(
      {
        user_id: userId,
        animal_id: animalId,
        timepoint_age_days: Math.round(timepoint),
        experiment_type: experimentType,
        measures,
        notes,
        source_sheet_link_id: linkId,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "animal_id,timepoint_age_days,experiment_type" }
    );
    if (error) throw new Error(error.message);

    await admin
      .from("animal_experiments")
      .update({
        status: "completed",
        completed_date: new Date().toISOString().slice(0, 10),
      })
      .eq("user_id", userId)
      .eq("animal_id", animalId)
      .eq("experiment_type", experimentType)
      .eq("timepoint_age_days", Math.round(timepoint));

    synced++;
  }

  return { rowCount: synced, skipped };
}

async function syncOneLink(
  admin: ReturnType<typeof createAdminClient>,
  token: TokenRow,
  link: LinkRow
) {
  const sanitizedConfig = sanitizeImportConfig(link.import_config);
  if (sanitizedConfig.syncMode === "mirror") {
    return { rowCount: 0, skipped: 0 };
  }
  let accessToken = token.access_token;
  if (new Date(token.expires_at).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshGoogleSheetsToken(token.refresh_token);
    accessToken = refreshed.access_token;
    await admin
      .from("google_sheets_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", token.user_id);
  }

  const fetched = await fetchGoogleSheetRows(accessToken, link.sheet_id, {
    gid: link.gid,
    sheetTitle: link.sheet_title,
    maxRows: 5000,
  });

  const preview = parseRowsToTabularPreview(fetched.rows);
  const config = sanitizedConfig;
  const filtered = applyImportConfig(preview.columns, preview.data, config);
  const target = detectImportTarget(filtered.columns, link.target);

  if (target === "colony_results") {
    const colony = await syncIntoColony(admin, token.user_id, link.id, config, filtered.columns, filtered.data);
    await updateLinkStatus(admin, token.user_id, link.id, { ok: true, rowCount: colony.rowCount });
    return { target, rowCount: colony.rowCount, skipped: colony.skipped };
  }

  const dataset = await syncIntoDataset(admin, token.user_id, link, filtered.columns, filtered.data);
  await updateLinkStatus(admin, token.user_id, link.id, { ok: true, rowCount: dataset.rowCount });
  return { target, rowCount: dataset.rowCount, skipped: 0 };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret =
    process.env.SHEETS_CRON_SECRET ||
    process.env.CRON_SECRET ||
    process.env.CALENDAR_CRON_SECRET ||
    process.env.DIGEST_CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [{ data: tokens, error: tokenError }, { data: links, error: linkError }] = await Promise.all([
    admin
      .from("google_sheets_tokens")
      .select("user_id,access_token,refresh_token,expires_at")
      .limit(500),
    admin
      .from("google_sheet_links")
      .select("id,user_id,name,sheet_id,gid,sheet_title,target,import_config,dataset_id,experiment_id,experiment_run_id")
      .eq("auto_sync_enabled", true)
      .limit(2000),
  ]);

  if (tokenError || linkError) {
    return NextResponse.json(
      { error: tokenError?.message || linkError?.message || "Failed to load sheets sync state" },
      { status: 500 }
    );
  }

  const tokenByUser = new Map<string, TokenRow>();
  for (const token of (tokens || []) as TokenRow[]) {
    tokenByUser.set(token.user_id, token);
  }

  const report = {
    users: 0,
    linksScanned: 0,
    linksSynced: 0,
    rowsSynced: 0,
    skippedRows: 0,
    failedLinks: 0,
    errors: [] as string[],
  };

  const touchedUsers = new Set<string>();

  for (const link of (links || []) as LinkRow[]) {
    report.linksScanned++;
    const token = tokenByUser.get(link.user_id);
    if (!token) {
      report.failedLinks++;
      report.errors.push(`No token for user ${link.user_id} (link ${link.name})`);
      await updateLinkStatus(admin, link.user_id, link.id, { ok: false, error: "Google token missing" });
      continue;
    }

    try {
      const result = await syncOneLink(admin, token, link);
      report.linksSynced++;
      report.rowsSynced += result.rowCount;
      report.skippedRows += result.skipped;
      touchedUsers.add(link.user_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync_failed";
      report.failedLinks++;
      report.errors.push(`${link.name}: ${message}`);
      await updateLinkStatus(admin, link.user_id, link.id, { ok: false, error: message });
    }
  }

  for (const userId of touchedUsers) {
    await refreshWorkspaceBackstageIndexBestEffort(admin, userId);
  }

  report.users = touchedUsers.size;

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    report: {
      ...report,
      errors: report.errors.slice(0, 50),
    },
  });
}
