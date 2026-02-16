"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Datasets ────────────────────────────────────────────────────────────────

export async function createDataset(payload: {
  name: string;
  description?: string;
  experiment_id?: string;
  columns: { name: string; type: string; unit?: string }[];
  data: Record<string, unknown>[];
  source: string;
  tags?: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("datasets")
    .insert({
      user_id: user.id,
      name: payload.name,
      description: payload.description || null,
      experiment_id: payload.experiment_id || null,
      columns: payload.columns,
      data: payload.data,
      row_count: payload.data.length,
      source: payload.source,
      tags: payload.tags || [],
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/results");
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
}

