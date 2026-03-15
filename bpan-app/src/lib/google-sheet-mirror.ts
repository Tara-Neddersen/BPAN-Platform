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
  fetchGoogleSheetTabs,
  deleteGoogleSpreadsheetTabs,
  ensureGoogleSpreadsheetTabs,
  getUsableGoogleSheetsAccessToken,
  writeGoogleSpreadsheetTabs,
} from "@/lib/google-sheets";
import { parseRowsToTabularPreview } from "@/lib/google-sheet-sync";

type ResultsDatasetRecord = Dataset & {
  experiment_run_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
};

export type MirrorTarget = "results_workspace" | "colony_results";
type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

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
  supabase: SupabaseLike,
  userId: string
) {
  return getUsableGoogleSheetsAccessToken(supabase, userId);
}

async function loadMirrorSheets(
  supabase: SupabaseLike,
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
  supabase: SupabaseLike,
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

function toStringArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

async function pullResultsWorkspaceFromMirror(
  supabase: SupabaseLike,
  userId: string,
  link: MirrorLink,
  accessToken: string
) {
  const tabTitles = link.import_config?.managedTabTitles || [];
  const rowsByTitle = await fetchGoogleSheetTabs(
    accessToken,
    link.sheet_id,
    tabTitles,
    5000
  );

  const datasetsIndexRows = parseRowsToTabularPreview(rowsByTitle.get("Datasets Index") || []).data;
  const analysesRows = parseRowsToTabularPreview(rowsByTitle.get("Analyses") || []).data;
  const figuresRows = parseRowsToTabularPreview(rowsByTitle.get("Figures") || []).data;

  const existingDatasetsRes = await supabase.from("datasets").select("id").eq("user_id", userId);
  const existingAnalysesRes = await supabase.from("analyses").select("id").eq("user_id", userId);
  const existingFiguresRes = await supabase.from("figures").select("id").eq("user_id", userId);

  const desiredDatasetIds = new Set<string>();
  for (const row of datasetsIndexRows) {
    const datasetId = String(row.dataset_id || "").trim() || crypto.randomUUID();
    const sheetTitle = String(row.sheet_title || "").trim();
    if (!sheetTitle) continue;
    const datasetTabRows = parseRowsToTabularPreview(rowsByTitle.get(sheetTitle) || []);
    const data = datasetTabRows.data.map((dataRow) => {
      const next = { ...dataRow };
      delete next.row_number;
      return next;
    });
    const payload = {
      id: datasetId,
      user_id: userId,
      name: String(row.name || "Imported dataset"),
      description: String(row.description || "") || null,
      experiment_id: String(row.experiment_id || "") || null,
      columns: datasetTabRows.columns.filter((column) => column.name !== "row_number"),
      data,
      row_count: data.length,
      source: String(row.source || "google_sheets"),
      tags: toStringArray(row.tags),
    };
    desiredDatasetIds.add(datasetId);
    await supabase.from("datasets").upsert(payload);
  }

  for (const datasetId of (existingDatasetsRes.data || []).map((row) => row.id as string)) {
    if (!desiredDatasetIds.has(datasetId)) {
      await supabase.from("datasets").delete().eq("id", datasetId).eq("user_id", userId);
    }
  }

  const desiredAnalysisIds = new Set<string>();
  for (const row of analysesRows) {
    const analysisId = String(row.analysis_id || "").trim() || crypto.randomUUID();
    const datasetId = String(row.dataset_id || "").trim();
    if (!datasetId) continue;
    desiredAnalysisIds.add(analysisId);
    await supabase.from("analyses").upsert({
      id: analysisId,
      user_id: userId,
      dataset_id: datasetId,
      name: String(row.name || "Analysis"),
      test_type: String(row.test_type || "descriptive"),
      ai_interpretation: String(row.ai_interpretation || "") || null,
      config: typeof row.config_json === "string" && row.config_json ? JSON.parse(String(row.config_json)) : {},
      results: typeof row.results_json === "string" && row.results_json ? JSON.parse(String(row.results_json)) : {},
    });
  }

  for (const analysisId of (existingAnalysesRes.data || []).map((row) => row.id as string)) {
    if (!desiredAnalysisIds.has(analysisId)) {
      await supabase.from("analyses").delete().eq("id", analysisId).eq("user_id", userId);
    }
  }

  const desiredFigureIds = new Set<string>();
  for (const row of figuresRows) {
    const figureId = String(row.figure_id || "").trim() || crypto.randomUUID();
    const datasetId = String(row.dataset_id || "").trim();
    if (!datasetId) continue;
    desiredFigureIds.add(figureId);
    await supabase.from("figures").upsert({
      id: figureId,
      user_id: userId,
      dataset_id: datasetId,
      analysis_id: String(row.analysis_id || "") || null,
      name: String(row.name || "Figure"),
      chart_type: String(row.chart_type || "bar"),
      config: typeof row.config_json === "string" && row.config_json ? JSON.parse(String(row.config_json)) : {},
    });
  }

  for (const figureId of (existingFiguresRes.data || []).map((row) => row.id as string)) {
    if (!desiredFigureIds.has(figureId)) {
      await supabase.from("figures").delete().eq("id", figureId).eq("user_id", userId);
    }
  }
}

async function pullColonyResultsFromMirror(
  supabase: SupabaseLike,
  userId: string,
  link: MirrorLink,
  accessToken: string
) {
  const canonicalTitle = "All Colony Results";
  const rowsByTitle = await fetchGoogleSheetTabs(
    accessToken,
    link.sheet_id,
    [canonicalTitle],
    5000
  );
  const parsed = parseRowsToTabularPreview(rowsByTitle.get(canonicalTitle) || []);

  const animalLookup = new Map<string, string>();
  const { data: animals } = await supabase.from("animals").select("id,identifier").eq("user_id", userId);
  for (const animal of animals || []) {
    animalLookup.set(String(animal.id), String(animal.id));
    animalLookup.set(String(animal.identifier), String(animal.id));
  }

  const desiredKeys = new Set<string>();
  for (const row of parsed.data) {
    const rawAnimalId = String(row.animal_id || "").trim();
    const rawIdentifier = String(row.animal_identifier || "").trim();
    const animalId = animalLookup.get(rawAnimalId) || animalLookup.get(rawIdentifier);
    const timepoint = Number(row.timepoint_age_days);
    const experimentType = String(row.experiment_type || "").trim();
    if (!animalId || !Number.isFinite(timepoint) || !experimentType) continue;

    const reserved = new Set([
      "result_id",
      "animal_id",
      "animal_identifier",
      "ear_tag",
      "cohort",
      "genotype",
      "sex",
      "timepoint_age_days",
      "experiment_type",
      "notes",
      "recorded_at",
      "created_at",
      "updated_at",
    ]);
    const measures = Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !reserved.has(key))
        .map(([key, value]) => [key, value === "" ? null : value])
    );
    desiredKeys.add(`${animalId}::${Math.round(timepoint)}::${experimentType}`);
    await supabase.from("colony_results").upsert(
      {
        user_id: userId,
        animal_id: animalId,
        timepoint_age_days: Math.round(timepoint),
        experiment_type: experimentType,
        measures,
        notes: String(row.notes || "") || null,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "animal_id,timepoint_age_days,experiment_type" }
    );
  }

  const { data: existing } = await supabase
    .from("colony_results")
    .select("id,animal_id,timepoint_age_days,experiment_type")
    .eq("user_id", userId);

  for (const row of existing || []) {
    const key = `${row.animal_id}::${row.timepoint_age_days}::${row.experiment_type}`;
    if (!desiredKeys.has(key)) {
      await supabase.from("colony_results").delete().eq("id", row.id).eq("user_id", userId);
    }
  }
}

export async function pullManagedGoogleSheetMirrorLinkForUser(userId: string, linkId: string) {
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

  if (target === "results_workspace") {
    await pullResultsWorkspaceFromMirror(supabase, userId, typedLink, accessToken);
  } else {
    await pullColonyResultsFromMirror(supabase, userId, typedLink, accessToken);
  }

  await supabase
    .from("google_sheet_links")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_error: null,
    })
    .eq("id", typedLink.id)
    .eq("user_id", userId);
}

export async function pullManagedGoogleSheetMirrorLinkWithClient(
  supabase: SupabaseLike,
  userId: string,
  link: MirrorLink,
  accessToken: string
) {
  const target = link.import_config?.mirrorTarget;
  if (link.import_config?.syncMode !== "mirror" || (target !== "results_workspace" && target !== "colony_results")) {
    throw new Error("Link is not a managed mirror");
  }

  if (target === "results_workspace") {
    await pullResultsWorkspaceFromMirror(supabase, userId, link, accessToken);
  } else {
    await pullColonyResultsFromMirror(supabase, userId, link, accessToken);
  }
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
