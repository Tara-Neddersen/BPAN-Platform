import { createClient } from "@/lib/supabase/server";
import { ExperimentsClient } from "@/components/experiments-client";
import type { Experiment, ExperimentTimepoint, Protocol, Reagent, AnimalExperiment, Animal, Cohort, ColonyTimepoint, WorkspaceCalendarEvent } from "@/types";
import Link from "next/link";
import { ArrowRight, FlaskConical, GitBranch, TestTube2 } from "lucide-react";
import type { ReactNode } from "react";
import { buildExperimentTraceabilityCards } from "@/lib/workspace-integration";

// Cursor-based pagination helper (same as colony)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: any, table: string, userId: string): Promise<any[]> {
  const PAGE = 900;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let lastId: string | null = null;
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
    { data: datasets },
    { data: analyses },
    { data: figures },
    { data: tasks },
    { data: workspaceCalendarEvents },
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
    supabase
      .from("datasets")
      .select("id,name,experiment_id,created_at,updated_at,row_count")
      .eq("user_id", user!.id),
    supabase
      .from("analyses")
      .select("id,name,dataset_id,created_at,test_type")
      .eq("user_id", user!.id),
    supabase
      .from("figures")
      .select("id,name,dataset_id,analysis_id,created_at,updated_at,chart_type")
      .eq("user_id", user!.id),
    supabase
      .from("tasks")
      .select("id,title,source_id,source_type,status,due_date,updated_at")
      .eq("user_id", user!.id)
      .eq("source_type", "experiment"),
    supabase
      .from("workspace_calendar_events")
      .select("*")
      .eq("user_id", user!.id)
      .order("start_at", { ascending: true }),
  ]);

  const traceCards = buildExperimentTraceabilityCards({
    experiments: (experiments as Experiment[]) || [],
    timepoints: (timepoints as ExperimentTimepoint[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    datasets: (datasets as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analyses: (analyses as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    figures: (figures as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tasks: (tasks as any[]) || [],
  });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.24)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Traceability Timeline</p>
            <p className="text-sm text-slate-700">Follow each experiment from plan -&gt; timepoints -&gt; datasets -&gt; analyses -&gt; figures</p>
          </div>
          <Link href="/results" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
            Open Results
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {traceCards.length === 0 ? (
          <p className="text-sm text-slate-600">No experiments yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {traceCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-slate-200/80 bg-white/75 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{card.title}</p>
                    <p className="text-xs text-slate-600">
                      {card.statusLabel} {card.lastEventAt ? `• updated ${formatTraceTime(card.lastEventAt)}` : ""}
                    </p>
                  </div>
                  <Link href="/experiments" className="text-xs text-cyan-700 hover:text-cyan-800">Open</Link>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <TraceMetric icon={<GitBranch className="h-3.5 w-3.5" />} label="Timepoints" value={`${card.timepointsCompleted}/${card.timepointsTotal}`} />
                  <TraceMetric icon={<TestTube2 className="h-3.5 w-3.5" />} label="Datasets" value={String(card.datasets)} />
                  <TraceMetric icon={<FlaskConical className="h-3.5 w-3.5" />} label="Analyses" value={String(card.analyses)} />
                  <TraceMetric icon={<FlaskConical className="h-3.5 w-3.5" />} label="Figures" value={String(card.figures)} />
                </div>

                <div className="mt-3 space-y-1.5">
                  {card.timeline.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-2.5 py-2 text-xs text-slate-500">
                      No linked downstream artifacts yet.
                    </p>
                  ) : (
                    card.timeline.map((event, idx) => (
                      <Link key={`${event.kind}-${idx}`} href={event.href || "/experiments"} className="flex items-start gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-slate-50">
                        <div className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-500" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{event.label}</p>
                          <p className="truncate text-slate-500">{event.meta}</p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ExperimentsClient
        experiments={(experiments as Experiment[]) || []}
        timepoints={(timepoints as ExperimentTimepoint[]) || []}
        protocols={(protocols as Protocol[]) || []}
        reagents={(reagents as Reagent[]) || []}
        animalExperiments={(animalExperiments as AnimalExperiment[]) || []}
        animals={(animals as Animal[]) || []}
        cohorts={(cohorts as Cohort[]) || []}
        colonyTimepoints={(colonyTimepoints as ColonyTimepoint[]) || []}
        workspaceCalendarEvents={(workspaceCalendarEvents as WorkspaceCalendarEvent[]) || []}
      />
    </div>
  );
}

function TraceMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1 text-slate-500">{icon}<span className="text-[10px] uppercase tracking-[0.12em]">{label}</span></div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatTraceTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffHrs = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
  if (diffHrs < 24) return diffHrs <= 0 ? "today" : `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
