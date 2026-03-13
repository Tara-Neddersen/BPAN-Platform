import { createClient } from "@/lib/supabase/server";
import type { Analysis, Dataset, Figure, Animal, Cohort, ColonyResult } from "@/types";
import type { GoogleSheetImportConfig } from "@/lib/google-sheet-import-config";
import {
  buildColonyResultsSheets,
  buildResultsWorkspaceSheets,
  type ExportSheet,
} from "@/lib/results-export";
import {
  clearGoogleSpreadsheetTabs,
  createGoogleSpreadsheet,
  deleteGoogleSpreadsheetTabs,
  ensureGoogleSpreadsheetTabs,
  refreshGoogleSheetsToken,
  writeGoogleSpreadsheetTabs,
} from "@/lib/google-sheets";

type ResultsDatasetRecord = Dataset & {
  experiment_run_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
};

export type MirrorTarget = "results_workspace" | "colony_results";

type MirrorLink = {
  id: string;
  user_id: string;
  name: string;
  sheet_id: string;
  sheet_url: string;
  target: "auto" | "dataset" | "colony_results";
  auto_sync_enabled: boolean;
  import_config?: GoogleSheetImportConfig;
};

function sheetRowsToValues(sheet: ExportSheet) {
  if (sheet.rows.length === 0) return [[""]];
  const headers = Object.keys(sheet.rows[0]);
  return [
    headers,
    ...sheet.rows.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
        return JSON.stringify(value);
      })
    ),
  ];
}

async function getFreshAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: tokenRow, error } = await supabase
    .from("google_sheets_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !tokenRow) throw new Error("Google Sheets not connected");

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
      .eq("user_id", userId);
  }

  return accessToken;
}

async function loadMirrorSheets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  target: MirrorTarget
) {
  if (target === "results_workspace") {
    const [
      { data: datasets, error: datasetsError },
      { data: analyses, error: analysesError },
      { data: figures, error: figuresError },
    ] = await Promise.all([
      supabase.from("datasets").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("analyses").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("figures").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    if (datasetsError || analysesError || figuresError) {
      throw new Error(datasetsError?.message || analysesError?.message || figuresError?.message || "Failed to load results workspace");
    }
    return buildResultsWorkspaceSheets(
      (datasets || []) as ResultsDatasetRecord[],
      (analyses || []) as Analysis[],
      (figures || []) as Figure[]
    );
  }

  const [
    { data: animals, error: animalsError },
    { data: cohorts, error: cohortsError },
    { data: colonyResults, error: colonyResultsError },
  ] = await Promise.all([
    supabase.from("animals").select("*").eq("user_id", userId).order("identifier"),
    supabase.from("cohorts").select("*").eq("user_id", userId).order("name"),
    supabase.from("colony_results").select("*").eq("user_id", userId).order("recorded_at", { ascending: false }),
  ]);
  if (animalsError || cohortsError || colonyResultsError) {
    throw new Error(animalsError?.message || cohortsError?.message || colonyResultsError?.message || "Failed to load colony results");
  }
  return buildColonyResultsSheets(
    (colonyResults || []) as ColonyResult[],
    (animals || []) as Animal[],
    (cohorts || []) as Cohort[]
  );
}

async function writeMirrorToLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accessToken: string,
  link: MirrorLink,
  target: MirrorTarget
) {
  const sheets = await loadMirrorSheets(supabase, link.user_id, target);
  const desiredTitles = sheets.map((sheet) => sheet.title);
  const previousTitles = link.import_config?.managedTabTitles || [];
  const staleTitles = previousTitles.filter((title) => !desiredTitles.includes(title));

  await ensureGoogleSpreadsheetTabs(accessToken, link.sheet_id, desiredTitles);
  if (staleTitles.length > 0) {
    await deleteGoogleSpreadsheetTabs(accessToken, link.sheet_id, staleTitles);
  }
  await clearGoogleSpreadsheetTabs(accessToken, link.sheet_id, desiredTitles);
  await writeGoogleSpreadsheetTabs(
    accessToken,
    link.sheet_id,
    sheets.map((sheet) => ({ title: sheet.title, values: sheetRowsToValues(sheet) }))
  );

  await supabase
    .from("google_sheet_links")
    .update({
      import_config: {
        ...(link.import_config || {}),
        syncMode: "mirror",
        mirrorTarget: target,
        managedTabTitles: desiredTitles,
      },
      last_synced_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_error: null,
      last_row_count: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
    })
    .eq("id", link.id)
    .eq("user_id", link.user_id);
}

export async function syncManagedGoogleSheetMirrorsForUser(userId: string, target: MirrorTarget) {
  const supabase = await createClient();
  const accessToken = await getFreshAccessToken(supabase, userId);
  const { data: links, error } = await supabase
    .from("google_sheet_links")
    .select("id,user_id,name,sheet_id,sheet_url,target,auto_sync_enabled,import_config")
    .eq("user_id", userId)
    .eq("auto_sync_enabled", true)
    .eq("target", target === "results_workspace" ? "dataset" : "colony_results");

  if (error) throw new Error(error.message);

  const mirrorLinks = ((links || []) as MirrorLink[]).filter(
    (link) =>
      link.import_config?.syncMode === "mirror" &&
      link.import_config?.mirrorTarget === target
  );

  for (const link of mirrorLinks) {
    try {
      await writeMirrorToLink(supabase, accessToken, link, target);
    } catch (err) {
      await supabase
        .from("google_sheet_links")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: err instanceof Error ? err.message : "mirror_sync_failed",
        })
        .eq("id", link.id)
        .eq("user_id", userId);
    }
  }
}

export async function syncManagedGoogleSheetMirrorLinkForUser(userId: string, linkId: string) {
  const supabase = await createClient();
  const accessToken = await getFreshAccessToken(supabase, userId);
  const { data: link, error } = await supabase
    .from("google_sheet_links")
    .select("id,user_id,name,sheet_id,sheet_url,target,auto_sync_enabled,import_config")
    .eq("user_id", userId)
    .eq("id", linkId)
    .single();

  if (error || !link) throw new Error(error?.message || "Mirror link not found");

  const typedLink = link as MirrorLink;
  const target = typedLink.import_config?.mirrorTarget;
  if (typedLink.import_config?.syncMode !== "mirror" || (target !== "results_workspace" && target !== "colony_results")) {
    throw new Error("Link is not a managed mirror");
  }

  await writeMirrorToLink(supabase, accessToken, typedLink, target);
}

export async function createManagedGoogleSheetMirrorForUser(userId: string, target: MirrorTarget) {
  const supabase = await createClient();
  const accessToken = await getFreshAccessToken(supabase, userId);
  const sheets = await loadMirrorSheets(supabase, userId, target);
  const title =
    target === "results_workspace"
      ? `BPAN Results Live Sync ${new Date().toISOString().slice(0, 10)}`
      : `BPAN Colony Results Live Sync ${new Date().toISOString().slice(0, 10)}`;

  const created = await createGoogleSpreadsheet(accessToken, title, sheets.map((sheet) => sheet.title));
  await writeGoogleSpreadsheetTabs(
    accessToken,
    created.spreadsheetId,
    sheets.map((sheet) => ({ title: sheet.title, values: sheetRowsToValues(sheet) }))
  );

  const targetValue = target === "results_workspace" ? "dataset" : "colony_results";
  const linkName = target === "results_workspace" ? "Results live sync" : "Colony results live sync";
  const { data: inserted, error } = await supabase
    .from("google_sheet_links")
    .insert({
      user_id: userId,
      name: linkName,
      sheet_url: created.spreadsheetUrl,
      sheet_id: created.spreadsheetId,
      target: targetValue,
      auto_sync_enabled: true,
      import_config: {
        syncMode: "mirror",
        mirrorTarget: target,
        managedTabTitles: sheets.map((sheet) => sheet.title),
      },
      last_synced_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_error: null,
      last_row_count: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
    })
    .select("id,name,sheet_url,sheet_id,target,auto_sync_enabled,import_config")
    .single();

  if (error) throw new Error(error.message);

  return { link: inserted, spreadsheetUrl: created.spreadsheetUrl };
}
