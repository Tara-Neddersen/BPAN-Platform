"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

type SaveColonyAnalysisRevisionPayload = {
  analysisId?: string | null;
  name: string;
  description?: string | null;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  summaryText?: string | null;
};

const COLONY_ANALYSIS_TAG = "system:colony-analysis";

export async function saveColonyAnalysisRevision(payload: SaveColonyAnalysisRevisionPayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const trimmedName = payload.name.trim();
  if (!trimmedName) throw new Error("Analysis name is required.");

  let datasetId = payload.analysisId || null;

  if (!datasetId) {
    const { data: dataset, error: datasetError } = await supabase
      .from("datasets")
      .insert({
        user_id: user.id,
        name: trimmedName,
        description: payload.description || "Saved Colony Analysis",
        experiment_id: null,
        columns: [],
        data: [],
        row_count: 0,
        source: "colony_analysis",
        tags: [COLONY_ANALYSIS_TAG],
      })
      .select("id")
      .single();

    if (datasetError) throw new Error(datasetError.message);
    datasetId = dataset.id;
  } else {
    const { error: datasetError } = await supabase
      .from("datasets")
      .update({
        name: trimmedName,
        description: payload.description || "Saved Colony Analysis",
        source: "colony_analysis",
        tags: [COLONY_ANALYSIS_TAG],
      })
      .eq("id", datasetId)
      .eq("user_id", user.id);
    if (datasetError) throw new Error(datasetError.message);
  }

  if (!datasetId) {
    throw new Error("Failed to resolve analysis dataset.");
  }

  const { data: existingAnalyses, error: existingError } = await supabase
    .from("analyses")
    .select("id,config,created_at")
    .eq("user_id", user.id)
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: true });
  if (existingError) throw new Error(existingError.message);

  const revisionNumber =
    (existingAnalyses || []).reduce((max, row) => {
      const current =
        typeof row.config === "object" &&
        row.config !== null &&
        typeof (row.config as Record<string, unknown>).revision_number === "number"
          ? Number((row.config as Record<string, unknown>).revision_number)
          : 0;
      return Math.max(max, current);
    }, 0) + 1;

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      dataset_id: datasetId,
      name: trimmedName,
      test_type:
        typeof payload.results.test === "string"
          ? payload.results.test
          : typeof payload.config === "object" && payload.config !== null && typeof payload.config.testType === "string"
          ? payload.config.testType
          : "descriptive",
      config: {
        kind: "colony_analysis",
        revision_number: revisionNumber,
        ...payload.config,
      },
      results: payload.results,
      ai_interpretation: payload.summaryText || null,
    })
    .select("id")
    .single();

  if (analysisError) throw new Error(analysisError.message);

  revalidatePath("/colony");
  revalidatePath("/colony/analysis");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);

  return { success: true, analysisId: datasetId, revisionId: analysis.id as string, revisionNumber };
}

export async function deleteColonyAnalysis(analysisId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("datasets").delete().eq("id", analysisId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/colony");
  revalidatePath("/colony/analysis");
  revalidatePath("/results");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function updateColonyAnalysisRevisionMetadata(args: {
  revisionId: string;
  configPatch?: Record<string, unknown>;
  summaryText?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: existing, error: existingError } = await supabase
    .from("analyses")
    .select("id,config,dataset_id")
    .eq("id", args.revisionId)
    .eq("user_id", user.id)
    .single();
  if (existingError || !existing) throw new Error(existingError?.message || "Revision not found.");

  const nextConfig = {
    ...((existing.config as Record<string, unknown>) || {}),
    ...(args.configPatch || {}),
  };

  const { error } = await supabase
    .from("analyses")
    .update({
      config: nextConfig,
      ...(args.summaryText !== undefined ? { ai_interpretation: args.summaryText } : {}),
    })
    .eq("id", args.revisionId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/colony");
  revalidatePath("/colony/analysis");
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}
