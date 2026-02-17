import { createClient } from "@/lib/supabase/server";
import { ScoutClient } from "@/components/scout-client";
import type { ScoutFinding, ScoutRun } from "@/types";
import {
  updateScoutStatus,
  updateScoutNotes,
  deleteScoutFinding,
  saveFindingToPapers,
} from "./actions";

export default async function ScoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get all scout findings, most recent first
  const { data: findings } = await supabase
    .from("scout_findings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Get recent scout runs
  const { data: runs } = await supabase
    .from("scout_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("last_run_at", { ascending: false })
    .limit(20);

  // Get watchlist keywords for display
  const { data: watchlists } = await supabase
    .from("watchlists")
    .select("keywords")
    .eq("user_id", user.id);

  let keywords: string[] = [];
  if (watchlists) {
    for (const w of watchlists) {
      if (Array.isArray(w.keywords)) {
        keywords = keywords.concat(w.keywords);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Literature Scout</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your AI assistant reads ~10 new papers from your research area, summarizes the interesting ones, 
          and brainstorms ideas for your research. Completely free.
        </p>
      </div>

      <ScoutClient
        findings={(findings || []) as ScoutFinding[]}
        runs={(runs || []) as ScoutRun[]}
        watchlistKeywords={keywords}
        actions={{
          updateStatus: updateScoutStatus,
          updateNotes: updateScoutNotes,
          deleteFinding: deleteScoutFinding,
          saveToPapers: saveFindingToPapers,
        }}
      />
    </div>
  );
}

