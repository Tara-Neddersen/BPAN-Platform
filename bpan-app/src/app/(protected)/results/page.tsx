import { createClient } from "@/lib/supabase/server";
import { ResultsClient } from "@/components/results-client";
import type { Dataset, Analysis, Figure, Experiment } from "@/types";

export default async function ResultsPage() {
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
  ]);

  return (
    <ResultsClient
      initialDatasets={(datasets as Dataset[]) || []}
      initialAnalyses={(analyses as Analysis[]) || []}
      initialFigures={(figures as Figure[]) || []}
      experiments={(experiments as Pick<Experiment, "id" | "title">[]) || []}
    />
  );
}

