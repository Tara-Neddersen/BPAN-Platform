import { createClient } from "@/lib/supabase/server";
import { ExperimentsClient } from "@/components/experiments-client";
import type { Experiment, ExperimentTimepoint, Protocol, Reagent, AnimalExperiment, Animal, Cohort, ColonyTimepoint } from "@/types";

// Cursor-based pagination helper (same as colony)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: any, table: string, userId: string): Promise<any[]> {
  const PAGE = 900;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let lastId: string | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select("*").eq("user_id", userId).order("id", { ascending: true }).limit(PAGE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) break;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE) break;
  }
  return all;
}

export default async function ExperimentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: experiments },
    { data: timepoints },
    { data: protocols },
    { data: reagents },
    animalExperiments,
    animals,
    { data: cohorts },
    { data: colonyTimepoints },
  ] = await Promise.all([
    supabase
      .from("experiments")
      .select("*")
      .eq("user_id", user!.id)
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("experiment_timepoints")
      .select("*")
      .eq("user_id", user!.id)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("protocols")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reagents")
      .select("*")
      .eq("user_id", user!.id)
      .order("name", { ascending: true }),
    fetchAllRows(supabase, "animal_experiments", user!.id),
    fetchAllRows(supabase, "animals", user!.id),
    supabase
      .from("cohorts")
      .select("*")
      .eq("user_id", user!.id)
      .order("name"),
    supabase
      .from("colony_timepoints")
      .select("*")
      .eq("user_id", user!.id)
      .order("sort_order"),
  ]);

  return (
    <ExperimentsClient
      experiments={(experiments as Experiment[]) || []}
      timepoints={(timepoints as ExperimentTimepoint[]) || []}
      protocols={(protocols as Protocol[]) || []}
      reagents={(reagents as Reagent[]) || []}
      animalExperiments={(animalExperiments as AnimalExperiment[]) || []}
      animals={(animals as Animal[]) || []}
      cohorts={(cohorts as Cohort[]) || []}
      colonyTimepoints={(colonyTimepoints as ColonyTimepoint[]) || []}
    />
  );
}
