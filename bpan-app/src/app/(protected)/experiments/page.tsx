import { createClient } from "@/lib/supabase/server";
import { ExperimentsClient } from "@/components/experiments-client";
import type { Experiment, ExperimentTimepoint, Protocol, Reagent } from "@/types";

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
  ]);

  return (
    <ExperimentsClient
      experiments={(experiments as Experiment[]) || []}
      timepoints={(timepoints as ExperimentTimepoint[]) || []}
      protocols={(protocols as Protocol[]) || []}
      reagents={(reagents as Reagent[]) || []}
    />
  );
}

