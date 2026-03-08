import { createClient } from "@/lib/supabase/server";
import { ResultsClient } from "@/components/results-client";
import type { Dataset, Analysis, Figure, Experiment } from "@/types";

type ResultsDatasetRecord = Dataset & {
  experiment_run_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
};

type ExperimentRunOption = {
  id: string;
  name: string;
  legacy_experiment_id: string | null;
  result_schema_id: string | null;
  schema_snapshot: unknown;
  status: string;
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    dataset?: string;
    tab?: string;
    analysis?: string;
    figure?: string;
    prefill_title?: string;
    prefill_chart?: string;
    prefill_prompt?: string;
    open_import?: string;
    prefill_run_id?: string;
    prefill_dataset_name?: string;
    prefill_dataset_description?: string;
    prefill_experiment_id?: string;
    prefill_starter_analyses?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [
    { data: datasets },
    { data: analyses },
    { data: figures },
    { data: experiments },
    { data: runs },
  ] = await Promise.all([
    supabase
      .from("datasets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("analyses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("figures")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("experiments")
      .select("id, title")
      .eq("user_id", user.id)
      .order("title"),
    supabase
      .from("experiment_runs")
      .select("id,name,legacy_experiment_id,result_schema_id,schema_snapshot,status")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ResultsClient
      initialDatasets={(datasets as ResultsDatasetRecord[]) || []}
      initialAnalyses={(analyses as Analysis[]) || []}
      initialFigures={(figures as Figure[]) || []}
      experiments={(experiments as Pick<Experiment, "id" | "title">[]) || []}
      runs={(runs as ExperimentRunOption[]) || []}
      initialDatasetId={params?.dataset ?? null}
      initialTab={(params?.tab as "data" | "analyze" | "visualize" | undefined) ?? undefined}
      initialAnalysisId={params?.analysis ?? null}
      initialFigureId={params?.figure ?? null}
      initialPrefillTitle={params?.prefill_title ?? null}
      initialPrefillChartType={params?.prefill_chart ?? null}
      initialPrefillPrompt={params?.prefill_prompt ?? null}
      initialOpenImport={params?.open_import === "1"}
      initialPrefillRunId={params?.prefill_run_id ?? null}
      initialPrefillDatasetName={params?.prefill_dataset_name ?? null}
      initialPrefillDatasetDescription={params?.prefill_dataset_description ?? null}
      initialPrefillExperimentId={params?.prefill_experiment_id ?? null}
      initialPrefillStarterAnalyses={params?.prefill_starter_analyses === "1"}
    />
  );
}
