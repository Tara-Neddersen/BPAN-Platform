"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { reconcileDataWithSchemaSnapshot } from "@/lib/results-run-adapters";
import { syncManagedGoogleSheetMirrorsForUser } from "@/lib/google-sheet-mirror";
import type { DatasetColumn } from "@/types";
import { normalizeSchemaSnapshot } from "@/lib/results-run-adapters";

async function syncResultsMirrorsBestEffort(userId: string) {
  try {
    await syncManagedGoogleSheetMirrorsForUser(userId, "results_workspace");
  } catch (error) {
    console.error("results mirror sync failed", error);
  }
}

function normalizeLooseKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function serializeDatasetCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function buildRunCaptureDatasetTag(runId: string, blockId: string) {
  return `run_capture:${runId}:${blockId}`;
}

function isAnimalIdentityColumn(columnName: string) {
  const key = normalizeLooseKey(columnName);
  return [
    "__animalid",
    "animal",
    "animalid",
    "animalnumber",
    "animalno",
    "animalidentifier",
    "bpananimalnumber",
    "identifier",
    "mouse",
    "mouseid",
    "mousenumber",
    "eartag",
  ].includes(key);
}

function isCohortIdentityColumn(columnName: string) {
  const key = normalizeLooseKey(columnName);
  return [
    "cohort",
    "cohortid",
    "cohortname",
    "cohortnumber",
    "bpancohort",
    "bpancohortnumber",
  ].includes(key);
}

function extractNumericTokens(value: string) {
  const matches = value.match(/\d+/g) || [];
  return matches.map((entry) => entry.trim()).filter(Boolean);
}

function getImportedRowIdentityValues(row: Record<string, unknown>) {
  const animalValues: string[] = [];
  const cohortValues: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    const serialized = serializeDatasetCellValue(value).trim();
    if (!serialized) continue;
    if (isAnimalIdentityColumn(key)) animalValues.push(serialized);
    if (isCohortIdentityColumn(key)) cohortValues.push(serialized);
  }
  return { animalValues, cohortValues };
}

function buildLookupTokens(values: Array<string | null | undefined>) {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const serialized = String(value).trim();
    if (!serialized) continue;
    tokens.add(normalizeLooseKey(serialized));
    extractNumericTokens(serialized).forEach((token) => tokens.add(normalizeLooseKey(token)));
  }
  return tokens;
}

type SyncableRunField = {
  name: string;
  type: DatasetColumn["type"];
  unit?: string;
  aliases: string[];
};

function mapSnapshotColumnTypeToDatasetType(rawType: string | null | undefined): DatasetColumn["type"] {
  switch (rawType) {
    case "number":
    case "integer":
      return "numeric";
    case "select":
    case "multi_select":
    case "boolean":
    case "animal_ref":
    case "cohort_ref":
    case "batch_ref":
      return "categorical";
    case "date":
    case "datetime":
    case "time":
      return "date";
    default:
      return "text";
  }
}

function buildSyncableRunFields(snapshot: unknown): SyncableRunField[] {
  return normalizeSchemaSnapshot(snapshot)
    .filter((column) => column.is_enabled !== false && column.isEnabled !== false)
    .map((column) => {
      const aliasCandidates = [
        column.label,
        column.name,
        column.key,
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      return {
        name: column.label || column.name || column.key || "Field",
        type: mapSnapshotColumnTypeToDatasetType(column.column_type || column.columnType || column.type),
        unit: typeof column.unit === "string" && column.unit.trim() ? column.unit : undefined,
        aliases: Array.from(new Set(aliasCandidates)),
      };
    });
}

// ─── Datasets ────────────────────────────────────────────────────────────────

function shouldRetryLegacyDatasetInsert(message: string) {
  return ["experiment_run_id", "result_schema_id", "schema_snapshot"].some((field) =>
    message.includes(field)
  );
}

export async function createDataset(payload: {
  name: string;
  description?: string;
  experiment_id?: string;
  experiment_run_id?: string;
  result_schema_id?: string;
  schema_snapshot?: unknown;
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  source: string;
  tags?: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const shouldApplyRunSnapshot =
    Boolean(payload.experiment_run_id) || Boolean(payload.result_schema_id) || Boolean(payload.schema_snapshot);

  const reconciliation = shouldApplyRunSnapshot
    ? reconcileDataWithSchemaSnapshot(payload.columns, payload.data, payload.schema_snapshot)
    : null;

  if (reconciliation && !reconciliation.canImport) {
    const blockingColumns = [
      ...reconciliation.guardrails.missingRequiredColumnsWithoutDefault,
      ...reconciliation.guardrails.missingRequiredValuesWithoutDefault,
    ];
    throw new Error(
      `Run schema requirements are missing data with no default: ${blockingColumns.join(", ")}`
    );
  }

  const resolvedColumns = reconciliation?.columns || payload.columns;
  const resolvedData = reconciliation?.data || payload.data;

  const baseInsert = {
    user_id: user.id,
    name: payload.name,
    description: payload.description || null,
    experiment_id: payload.experiment_id || null,
    columns: resolvedColumns,
    data: resolvedData,
    row_count: resolvedData.length,
    source: payload.source,
    tags: payload.tags || [],
  };

  const runAwareInsert = {
    ...baseInsert,
    experiment_run_id: payload.experiment_run_id || null,
    result_schema_id: payload.result_schema_id || null,
    schema_snapshot: Array.isArray(payload.schema_snapshot) ? payload.schema_snapshot : payload.schema_snapshot || [],
  };

  let data: { id: string } | null = null;

  if (payload.experiment_run_id || payload.result_schema_id || payload.schema_snapshot) {
    const runAwareResult = await supabase
      .from("datasets")
      .insert(runAwareInsert)
      .select("id")
      .single();

    if (runAwareResult.error && !shouldRetryLegacyDatasetInsert(runAwareResult.error.message)) {
      throw new Error(runAwareResult.error.message);
    }

    if (!runAwareResult.error) {
      data = runAwareResult.data;
    }
  }

  if (!data) {
    const legacyResult = await supabase
      .from("datasets")
      .insert(baseInsert)
      .select("id")
      .single();

    if (legacyResult.error) throw new Error(legacyResult.error.message);
    data = legacyResult.data;
  }

  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
  return data.id;
}

export async function updateDatasetContent(payload: {
  id: string;
  name: string;
  description?: string;
  experiment_id?: string;
  experiment_run_id?: string;
  result_schema_id?: string;
  schema_snapshot?: unknown;
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  source: string;
  tags?: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const shouldApplyRunSnapshot =
    Boolean(payload.experiment_run_id) || Boolean(payload.result_schema_id) || Boolean(payload.schema_snapshot);

  const reconciliation = shouldApplyRunSnapshot
    ? reconcileDataWithSchemaSnapshot(payload.columns, payload.data, payload.schema_snapshot)
    : null;

  if (reconciliation && !reconciliation.canImport) {
    const blockingColumns = [
      ...reconciliation.guardrails.missingRequiredColumnsWithoutDefault,
      ...reconciliation.guardrails.missingRequiredValuesWithoutDefault,
    ];
    throw new Error(
      `Run schema requirements are missing data with no default: ${blockingColumns.join(", ")}`
    );
  }

  const resolvedColumns = reconciliation?.columns || payload.columns;
  const resolvedData = reconciliation?.data || payload.data;

  const baseUpdate = {
    name: payload.name,
    description: payload.description || null,
    experiment_id: payload.experiment_id || null,
    columns: resolvedColumns,
    data: resolvedData,
    row_count: resolvedData.length,
    source: payload.source,
    tags: payload.tags || [],
  };

  const runAwareUpdate = {
    ...baseUpdate,
    experiment_run_id: payload.experiment_run_id || null,
    result_schema_id: payload.result_schema_id || null,
    schema_snapshot: Array.isArray(payload.schema_snapshot) ? payload.schema_snapshot : payload.schema_snapshot || [],
  };

  let errorMessage: string | null = null;

  if (payload.experiment_run_id || payload.result_schema_id || payload.schema_snapshot) {
    const runAwareResult = await supabase
      .from("datasets")
      .update(runAwareUpdate)
      .eq("id", payload.id)
      .eq("user_id", user.id);

    if (runAwareResult.error && !shouldRetryLegacyDatasetInsert(runAwareResult.error.message)) {
      throw new Error(runAwareResult.error.message);
    }

    if (!runAwareResult.error) {
      revalidatePath("/results");
      await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
      await syncResultsMirrorsBestEffort(user.id);
      return payload.id;
    }

    errorMessage = runAwareResult.error?.message || null;
  }

  const legacyResult = await supabase
    .from("datasets")
    .update(baseUpdate)
    .eq("id", payload.id)
    .eq("user_id", user.id);

  if (legacyResult.error) throw new Error(legacyResult.error.message || errorMessage || "Failed to update dataset.");
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
  return payload.id;
}

export async function deleteDataset(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("datasets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
}

export async function syncImportedDatasetToRunCapture(payload: {
  experiment_run_id: string;
  block_id: string;
  schema_snapshot?: unknown;
  result_schema_id?: string | null;
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  source?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [{ data: run, error: runError }, { data: block, error: blockError }] = await Promise.all([
    supabase
      .from("experiment_runs")
      .select("id,name,legacy_experiment_id,result_schema_id,schema_snapshot")
      .eq("id", payload.experiment_run_id)
      .eq("owner_user_id", user.id)
      .single(),
    supabase
      .from("run_schedule_blocks")
      .select("id,title,day_index,experiment_run_id")
      .eq("id", payload.block_id)
      .eq("experiment_run_id", payload.experiment_run_id)
      .single(),
  ]);

  if (runError || !run) throw new Error(runError?.message || "Run not found.");
  if (blockError || !block) throw new Error(blockError?.message || "Run section not found.");

  const [{ data: assignmentRows }, { data: animalRows }, { data: cohortRows }, { data: datasetRows }] = await Promise.all([
    supabase
      .from("run_assignments")
      .select("*")
      .eq("experiment_run_id", payload.experiment_run_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("animals")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("identifier"),
    supabase
      .from("cohorts")
      .select("*")
      .eq("user_id", user.id),
    supabase
      .from("datasets")
      .select("*")
      .eq("user_id", user.id)
      .eq("experiment_run_id", payload.experiment_run_id),
  ]);

  const primaryAssignment = (assignmentRows || [])[0] as {
    scope_type?: string | null;
    cohort_id?: string | null;
    animal_id?: string | null;
  } | undefined;

  const assignedAnimals = ((animalRows || []) as Array<{
    id: string;
    cohort_id: string | null;
    identifier: string;
    sex: string | null;
    genotype: string | null;
    ear_tag: string | null;
  }>).filter((animal) => {
    if (!primaryAssignment) return true;
    if (primaryAssignment.scope_type === "animal" && primaryAssignment.animal_id) {
      return animal.id === primaryAssignment.animal_id;
    }
    if (primaryAssignment.scope_type === "cohort" && primaryAssignment.cohort_id) {
      return animal.cohort_id === primaryAssignment.cohort_id;
    }
    return true;
  });

  const cohortsById = new Map(
    ((cohortRows || []) as Array<{ id: string; name: string }>).map((cohort) => [cohort.id, cohort.name])
  );

  const runCaptureTag = buildRunCaptureDatasetTag(payload.experiment_run_id, payload.block_id);
  const existingManagedDataset = ((datasetRows || []) as Array<{
    id: string;
    name: string;
    description?: string | null;
    columns: DatasetColumn[];
    data: Record<string, unknown>[];
    tags?: string[] | null;
  }>).find((dataset) => Array.isArray(dataset.tags) && dataset.tags.includes(runCaptureTag)) || null;

  const selectedSchemaSnapshot = payload.schema_snapshot ?? run.schema_snapshot;
  const schemaFields = buildSyncableRunFields(selectedSchemaSnapshot);
  const schemaFieldKeys = new Set(schemaFields.map((field) => normalizeLooseKey(field.name)));
  const fixedColumnKeys = new Set(["animal", "cohort", "sex", "gt"]);

  const existingExtraFields: SyncableRunField[] = (existingManagedDataset?.columns || [])
    .filter((column) => {
      const key = normalizeLooseKey(column.name);
      return !fixedColumnKeys.has(key) && !schemaFieldKeys.has(key);
    })
    .map((column) => ({
      name: column.name,
      type: column.type,
      unit: column.unit,
      aliases: [column.name],
    }));

  const importedExtraFields: SyncableRunField[] = payload.columns
    .filter((column) => {
      const key = normalizeLooseKey(column.name);
      return !fixedColumnKeys.has(key) && !schemaFieldKeys.has(key) && !isAnimalIdentityColumn(column.name);
    })
    .map((column) => ({
      name: column.name,
      type: column.type,
      unit: column.unit,
      aliases: [column.name],
    }));

  const mergedFields = [...schemaFields, ...existingExtraFields, ...importedExtraFields].reduce<SyncableRunField[]>(
    (acc, field) => {
      const key = normalizeLooseKey(field.name);
      if (acc.some((entry) => normalizeLooseKey(entry.name) === key)) return acc;
      acc.push(field);
      return acc;
    },
    []
  );

  const importedRowsWithIdentity = payload.data.map((row) => {
    const identities = getImportedRowIdentityValues(row);
    return {
      row,
      animalTokens: buildLookupTokens(identities.animalValues),
      cohortTokens: buildLookupTokens(identities.cohortValues),
    };
  });

  const importedColumnByAlias = new Map<string, string>();
  for (const column of payload.columns) {
    importedColumnByAlias.set(normalizeLooseKey(column.name), column.name);
  }

  const existingRows = existingManagedDataset?.data || [];
  const existingRowsByAnimalId = new Map(
    existingRows
      .map((row) => [serializeDatasetCellValue(row.__animal_id), row] as const)
      .filter(([animalId]) => Boolean(animalId))
  );

  let matchedAnimals = 0;
  const mergedData = assignedAnimals.map((animal) => {
    const existingRow = existingRowsByAnimalId.get(animal.id) || null;
    const cohortName = animal.cohort_id ? cohortsById.get(animal.cohort_id) || "" : "";
    const animalTokens = buildLookupTokens([animal.id, animal.identifier, animal.ear_tag]);
    const cohortTokens = buildLookupTokens([cohortName]);
    const importedMatch = importedRowsWithIdentity.find((entry) => {
      const animalMatch = Array.from(animalTokens).some((token) => entry.animalTokens.has(token));
      if (!animalMatch) return false;
      if (entry.cohortTokens.size === 0) return true;
      return Array.from(cohortTokens).some((token) => entry.cohortTokens.has(token));
    });
    const importedRow = importedMatch?.row || null;

    if (importedRow) matchedAnimals += 1;

    const mergedValues = Object.fromEntries(
      mergedFields.map((field) => {
        const importedColumnName = field.aliases
          .map((alias) => importedColumnByAlias.get(normalizeLooseKey(alias)) || null)
          .find(Boolean);
        const importedValue =
          importedRow && importedColumnName ? importedRow[importedColumnName] : undefined;
        const existingValue = existingRow?.[field.name];

        return [
          field.name,
          serializeDatasetCellValue(importedValue !== undefined ? importedValue : existingValue),
        ];
      })
    );

    return {
      __animal_id: animal.id,
      Animal: animal.identifier,
      Cohort: animal.cohort_id ? cohortsById.get(animal.cohort_id) || "Unassigned" : "Unassigned",
      Sex: animal.sex || "",
      GT: animal.genotype || "",
      ...mergedValues,
    };
  });

  const managedColumns: DatasetColumn[] = [
    { name: "Animal", type: "text" },
    { name: "Cohort", type: "text" },
    { name: "Sex", type: "categorical" },
    { name: "GT", type: "categorical" },
    ...mergedFields.map((field) => ({
      name: field.name,
      type: field.type,
      unit: field.unit,
    })),
  ];

  const managedTags = [
    "run_capture",
    `run_id:${run.id}`,
    runCaptureTag,
    `run_day:${block.day_index}`,
  ];

  const datasetPayload = {
    name: `${run.name} — ${block.title}`,
    description: `Managed run capture for ${block.title}`,
    experiment_id: run.legacy_experiment_id || undefined,
    experiment_run_id: run.id,
    result_schema_id: payload.result_schema_id || run.result_schema_id || undefined,
    schema_snapshot: selectedSchemaSnapshot,
    columns: managedColumns,
    data: mergedData,
    source: payload.source || "csv",
    tags: managedTags,
  };

  const datasetId = existingManagedDataset?.id
    ? await updateDatasetContent({
        id: existingManagedDataset.id,
        ...datasetPayload,
      })
    : await createDataset(datasetPayload);

  return {
    datasetId,
    matchedAnimals,
    totalAnimals: assignedAnimals.length,
  };
}

// ─── Analyses ────────────────────────────────────────────────────────────────

export async function saveAnalysis(payload: {
  dataset_id: string;
  name: string;
  test_type: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  ai_interpretation?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      dataset_id: payload.dataset_id,
      name: payload.name,
      test_type: payload.test_type,
      config: payload.config,
      results: payload.results,
      ai_interpretation: payload.ai_interpretation || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
  return data.id;
}

export async function deleteAnalysis(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
}

// ─── Figures ─────────────────────────────────────────────────────────────────

export async function saveFigure(payload: {
  dataset_id: string;
  analysis_id?: string;
  name: string;
  chart_type: string;
  config: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("figures")
    .insert({
      user_id: user.id,
      dataset_id: payload.dataset_id,
      analysis_id: payload.analysis_id || null,
      name: payload.name,
      chart_type: payload.chart_type,
      config: payload.config,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
  return data.id;
}

export async function deleteFigure(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("figures")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  await syncResultsMirrorsBestEffort(user.id);
}
