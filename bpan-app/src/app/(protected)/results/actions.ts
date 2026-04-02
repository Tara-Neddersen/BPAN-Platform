"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { reconcileDataWithSchemaSnapshot } from "@/lib/results-run-adapters";
import { syncManagedGoogleSheetMirrorsForUser } from "@/lib/google-sheet-mirror";
import type { DatasetColumn } from "@/types";
import {
  buildColonyMeasuresFromImportedRow,
  buildImportedColumnAliasMap,
  buildImportedRowsWithIdentity,
  buildSyncableRunFields,
  findImportedColumnName,
  findImportedRowForAnimal,
  isAnimalIdentityColumn,
  normalizeLooseKey,
  serializeDatasetCellValue,
  type SyncableRunField,
} from "@/lib/results-run-import-sync";

async function syncResultsMirrorsBestEffort(userId: string) {
  try {
    await syncManagedGoogleSheetMirrorsForUser(userId, "results_workspace");
  } catch (error) {
    console.error("results mirror sync failed", error);
  }
}

async function syncColonyMirrorsBestEffort(userId: string) {
  try {
    await syncManagedGoogleSheetMirrorsForUser(userId, "colony_results");
  } catch (error) {
    console.error("colony mirror sync failed", error);
  }
}

function buildRunCaptureDatasetTag(runId: string, blockId: string) {
  return `run_capture:${runId}:${blockId}`;
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
  experiment_type?: string | null;
  timepoint_age_days?: number | null;
  run_timepoint_id?: string | null;
  run_timepoint_experiment_id?: string | null;
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

  const [{ data: assignmentRows }, { data: animalRows }, { data: cohortRows }, { data: datasetRows }, { data: colonyResultRows }] = await Promise.all([
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
    supabase
      .from("colony_results")
      .select("id,animal_id,measures,notes,experiment_run_id,run_timepoint_id,run_timepoint_experiment_id,timepoint_age_days,experiment_type")
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
      key: column.name,
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
      key: column.name,
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

  const importedRowsWithIdentity = buildImportedRowsWithIdentity(payload.data);
  const importedColumnByAlias = buildImportedColumnAliasMap(payload.columns);

  const existingRows = existingManagedDataset?.data || [];
  const existingRowsByAnimalId = new Map(
    existingRows
      .map((row) => [serializeDatasetCellValue(row.__animal_id), row] as const)
      .filter(([animalId]) => Boolean(animalId))
  );
  const existingColonyRows = ((colonyResultRows || []) as Array<{
    id: string;
    animal_id: string;
    measures: Record<string, unknown> | null;
    notes: string | null;
    experiment_run_id: string | null;
    run_timepoint_id: string | null;
    run_timepoint_experiment_id: string | null;
    timepoint_age_days: number;
    experiment_type: string;
  }>).filter((row) => {
    if (payload.run_timepoint_experiment_id) {
      return row.run_timepoint_experiment_id === payload.run_timepoint_experiment_id;
    }
    return (
      Boolean(payload.experiment_type) &&
      Number(row.timepoint_age_days) === Number(payload.timepoint_age_days || 0) &&
      row.experiment_type === payload.experiment_type
    );
  });
  const existingColonyRowsByAnimalId = new Map(existingColonyRows.map((row) => [row.animal_id, row] as const));

  const colonyUpserts: Array<{
    id?: string;
    user_id: string;
    animal_id: string;
    experiment_run_id: string;
    run_timepoint_id: string | null;
    run_timepoint_experiment_id: string | null;
    timepoint_age_days: number;
    experiment_type: string;
    measures: Record<string, string | number | boolean | null | string[]>;
    notes: string | null;
    recorded_at: string;
  }> = [];

  let matchedAnimals = 0;
  const mergedData = assignedAnimals.map((animal) => {
    const existingRow = existingRowsByAnimalId.get(animal.id) || null;
    const cohortName = animal.cohort_id ? cohortsById.get(animal.cohort_id) || "" : "";
    const importedRow = findImportedRowForAnimal(
      importedRowsWithIdentity,
      [animal.id, animal.identifier, animal.ear_tag],
      [cohortName]
    );

    if (importedRow) matchedAnimals += 1;

    const mergedValues = Object.fromEntries(
      mergedFields.map((field) => {
        const importedColumnName = findImportedColumnName(field, importedColumnByAlias);
        const importedValue =
          importedRow && importedColumnName ? importedRow[importedColumnName] : undefined;
        const existingValue = existingRow?.[field.name];

        return [
          field.name,
          serializeDatasetCellValue(importedValue !== undefined ? importedValue : existingValue),
        ];
      })
    );

    if (importedRow && payload.experiment_type) {
      const existingColonyRow = existingColonyRowsByAnimalId.get(animal.id) || null;
      const { measures, notes } = buildColonyMeasuresFromImportedRow({
        fields: mergedFields,
        importedRow,
        importedColumnByAlias,
        existingMeasures: (existingColonyRow?.measures || {}) as Record<string, string | number | boolean | null | string[]>,
        existingNotes: existingColonyRow?.notes || null,
      });

      colonyUpserts.push({
        ...(existingColonyRow?.id ? { id: existingColonyRow.id } : {}),
        user_id: user.id,
        animal_id: animal.id,
        experiment_run_id: payload.experiment_run_id,
        run_timepoint_id: payload.run_timepoint_id || null,
        run_timepoint_experiment_id: payload.run_timepoint_experiment_id || null,
        timepoint_age_days: Number(payload.timepoint_age_days || 0),
        experiment_type: payload.experiment_type,
        measures,
        notes,
        recorded_at: new Date().toISOString(),
      });
    }

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

  if (colonyUpserts.length > 0) {
    const { error: colonyError } = await supabase.from("colony_results").upsert(colonyUpserts, { onConflict: "id" });
    if (colonyError) throw new Error(colonyError.message);
    revalidatePath("/colony");
    await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
    await syncColonyMirrorsBestEffort(user.id);
  }

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
