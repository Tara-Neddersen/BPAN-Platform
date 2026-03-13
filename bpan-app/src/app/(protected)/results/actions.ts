"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { reconcileDataWithSchemaSnapshot } from "@/lib/results-run-adapters";
import { syncManagedGoogleSheetMirrorsForUser } from "@/lib/google-sheet-mirror";
import type { DatasetColumn } from "@/types";

async function syncResultsMirrorsBestEffort(userId: string) {
  try {
    await syncManagedGoogleSheetMirrorsForUser(userId, "results_workspace");
  } catch (error) {
    console.error("results mirror sync failed", error);
  }
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
