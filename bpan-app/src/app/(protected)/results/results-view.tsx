import { createClient } from "@/lib/supabase/server";
import { ResultsClient } from "@/components/results-client";
import type { Dataset, Analysis, Figure, Experiment, Animal, Cohort, RunAssignment, RunScheduleBlock } from "@/types";

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

export type ResultsSearchParams = {
  dataset?: string;
  run?: string;
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
};

export async function renderResultsView(params?: ResultsSearchParams) {
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
    { data: animals },
    { data: cohorts },
    { data: runAssignments },
    { data: runScheduleBlocks },
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
    supabase
      .from("animals")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("identifier"),
    supabase
      .from("cohorts")
      .select("*")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("run_assignments")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("run_schedule_blocks")
      .select("*")
      .order("day_index", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <ResultsClient
      initialDatasets={(datasets as ResultsDatasetRecord[]) || []}
      initialAnalyses={(analyses as Analysis[]) || []}
      initialFigures={(figures as Figure[]) || []}
      experiments={(experiments as Pick<Experiment, "id" | "title">[]) || []}
      runs={(runs as ExperimentRunOption[]) || []}
      animals={(animals as Animal[]) || []}
      cohorts={(cohorts as Cohort[]) || []}
      runAssignments={(runAssignments as RunAssignment[]) || []}
      runScheduleBlocks={(runScheduleBlocks as RunScheduleBlock[]) || []}
      initialDatasetId={params?.dataset ?? null}
      initialScopeRunId={params?.run ?? null}
      initialTab={
        params?.tab === "visualize"
          ? "visualize"
          : "data"
      }
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
