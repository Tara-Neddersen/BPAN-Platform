import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

type LinkRow = {
  id: string;
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

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toMaybeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  return value;
}

async function withFreshToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_sheets_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single();

  if (tokenErr || !tokenRow) {
    return { error: "Google Sheets not connected", status: 400 as const };
  }

  let accessToken = String(tokenRow.access_token);
  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshGoogleSheetsToken(String(tokenRow.refresh_token));
    accessToken = refreshed.access_token;
    await supabase
      .from("google_sheets_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", user.id);
  }

  return { supabase, userId: user.id, accessToken };
}

async function updateLinkStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

  await supabase
    .from("google_sheet_links")
    .update(payload)
    .eq("id", linkId)
    .eq("user_id", userId);
}

async function syncIntoDataset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  link: LinkRow,
  columns: Array<{ name: string; type: "text" | "numeric" | "categorical" | "date"; unit?: string }>,
  data: Record<string, unknown>[]
) {
  let resolvedColumns = columns;
  let resolvedData = data;

  let run: { id: string; result_schema_id: string | null; schema_snapshot: unknown; legacy_experiment_id: string | null } | null = null;
  if (link.experiment_run_id) {
    const { data: runData } = await supabase
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

  const insertPayload = {
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
    const { data: updated, error } = await supabase
      .from("datasets")
      .update(insertPayload)
      .eq("id", link.dataset_id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (!error && updated) {
      return { dataset: updated, rowCount: resolvedData.length };
    }
  }

  const { data: created, error: createErr } = await supabase
    .from("datasets")
    .insert(insertPayload)
    .select("*")
    .single();
  if (createErr) throw new Error(createErr.message);

  await supabase
    .from("google_sheet_links")
    .update({ dataset_id: created.id })
    .eq("id", link.id)
    .eq("user_id", userId);

  return { dataset: created, rowCount: resolvedData.length };
}

async function syncIntoColony(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  linkId: string,
  config: GoogleSheetImportConfig,
  columns: Array<{ name: string; type: "text" | "numeric" | "categorical" | "date"; unit?: string }>,
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
      ? supabase
          .from("animals")
          .select("id,identifier")
          .eq("user_id", userId)
          .in("id", uuidValues)
      : Promise.resolve({ data: [] as Array<{ id: string; identifier: string }> }),
    identifierValues.length
      ? supabase
          .from("animals")
          .select("id,identifier")
          .eq("user_id", userId)
          .in("identifier", identifierValues)
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

    const { error } = await supabase.from("colony_results").upsert(
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
      {
        onConflict: "animal_id,timepoint_age_days,experiment_type",
      }
    );
    if (error) throw new Error(error.message);

    await supabase
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accessToken: string,
  link: LinkRow
) {
  const fetched = await fetchGoogleSheetRows(accessToken, link.sheet_id, {
    gid: link.gid,
    sheetTitle: link.sheet_title,
    maxRows: 5000,
  });
  const preview = parseRowsToTabularPreview(fetched.rows);
  const config = sanitizeImportConfig(link.import_config);
  const filtered = applyImportConfig(preview.columns, preview.data, config);
  const target = detectImportTarget(filtered.columns, link.target);

  if (target === "colony_results") {
    const colony = await syncIntoColony(supabase, userId, link.id, config, filtered.columns, filtered.data);
    await updateLinkStatus(supabase, userId, link.id, { ok: true, rowCount: colony.rowCount });
    return {
      linkId: link.id,
      linkName: link.name,
      target,
      rowCount: colony.rowCount,
      skipped: colony.skipped,
    };
  }

  const dataset = await syncIntoDataset(supabase, userId, link, filtered.columns, filtered.data);
  await updateLinkStatus(supabase, userId, link.id, { ok: true, rowCount: dataset.rowCount });
  return {
    linkId: link.id,
    linkName: link.name,
    target,
    rowCount: dataset.rowCount,
    dataset: dataset.dataset,
  };
}

export async function POST(req: Request) {
  const auth = await withFreshToken();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const linkId = body?.linkId ? String(body.linkId) : null;

  const linksQuery = auth.supabase
    .from("google_sheet_links")
    .select("id,name,sheet_id,gid,sheet_title,target,import_config,dataset_id,experiment_id,experiment_run_id")
    .eq("user_id", auth.userId);

  const { data: links, error: linksError } = linkId
    ? await linksQuery.eq("id", linkId)
    : await linksQuery.eq("auto_sync_enabled", true);

  if (linksError) {
    return NextResponse.json({ error: linksError.message }, { status: 500 });
  }

  const linkRows = (links || []) as LinkRow[];
  if (linkRows.length === 0) {
    return NextResponse.json({ success: true, synced: [], errors: [] });
  }

  const synced: Array<Record<string, unknown>> = [];
  const errors: Array<{ linkId: string; linkName: string; error: string }> = [];

  for (const link of linkRows) {
    try {
      const result = await syncOneLink(auth.supabase, auth.userId, auth.accessToken, link);
      synced.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync_failed";
      errors.push({ linkId: link.id, linkName: link.name, error: message });
      await updateLinkStatus(auth.supabase, auth.userId, link.id, { ok: false, error: message });
    }
  }

  await refreshWorkspaceBackstageIndexBestEffort(auth.supabase, auth.userId);

  return NextResponse.json({
    success: true,
    synced,
    errors,
  });
}
