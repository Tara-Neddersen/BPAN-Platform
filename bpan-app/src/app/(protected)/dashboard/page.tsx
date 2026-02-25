import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";
import Link from "next/link";
import { SearchBar } from "@/components/search-bar";
import { WatchlistCard } from "@/components/watchlist-card";
import { WatchlistForm } from "@/components/watchlist-form";
import { DigestToggle } from "@/components/digest-toggle";
import {
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  updateDigestPreference,
  resyncMeetingActionTasks,
  backfillStarterExperimentTimepoints,
  rebuildWorkspaceBackstageGraph,
} from "./actions";
import type { Watchlist, Profile } from "@/types";
import { Activity, AlertTriangle, ArrowUpRight, BookOpen, ChevronRight, Clock3, ExternalLink, Sparkles } from "lucide-react";
import type { ActivityKindFilter, ActivityWindowFilter, MissingDataAlert } from "@/lib/workspace-integration";
import {
  buildWorkspaceActivityFeed,
  buildMissingDataAlerts,
  filterWorkspaceActivityFeed,
  getIndexedWorkspaceActivityFeed,
  getWorkspaceBackstageIndexStats,
} from "@/lib/workspace-integration";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ activityKind?: string; activityWindow?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: watchlists }, { data: profileData }] = await Promise.all([
    supabase
      .from("watchlists")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user!.id)
      .single(),
  ]);

  const [
    { count: pendingTasksCount },
    { count: notesCount },
    { count: meetingsCount },
    { count: savedPapersCount },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .in("status", ["pending", "in_progress"]),
    supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id),
    supabase
      .from("meeting_notes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id),
    supabase
      .from("saved_papers")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id),
  ]);

  const [
    { data: recentTasks },
    { data: recentMeetings },
    { data: recentNotes },
    { data: recentExperiments },
    { data: recentDatasets },
    { data: recentAnalyses },
    { data: recentFigures },
    { data: recentPapers },
    { data: allExperimentsForChecks },
    { data: experimentTimepointsForChecks },
    { data: datasetsForChecks },
    { data: analysesForChecks },
    { data: figuresForChecks },
    { data: meetingNotesForChecks },
    { data: meetingActionTasksForChecks },
  ] = await Promise.all([
    supabase.from("tasks").select("id,title,status,updated_at,source_type").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(6),
    supabase.from("meeting_notes").select("id,title,updated_at,meeting_date").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(6),
    supabase.from("notes").select("id,content,updated_at,note_type,paper_id").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(6),
    supabase.from("experiments").select("id,title,status,updated_at").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(6),
    supabase.from("datasets").select("id,name,experiment_id,updated_at,row_count").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(6),
    supabase.from("analyses").select("id,name,dataset_id,created_at,test_type").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("figures").select("id,name,dataset_id,analysis_id,updated_at,chart_type").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(6),
    supabase.from("saved_papers").select("id,title,created_at,journal").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("experiments").select("id,title,status,start_date,end_date").eq("user_id", user!.id),
    supabase.from("experiment_timepoints").select("id,experiment_id,scheduled_at,completed_at").eq("user_id", user!.id),
    supabase.from("datasets").select("id,name,experiment_id,row_count,updated_at").eq("user_id", user!.id),
    supabase.from("analyses").select("id,name,dataset_id,created_at").eq("user_id", user!.id),
    supabase.from("figures").select("id,name,dataset_id,analysis_id,updated_at").eq("user_id", user!.id),
    supabase.from("meeting_notes").select("id,title,action_items,updated_at").eq("user_id", user!.id),
    supabase.from("tasks").select("id,source_id,source_type").eq("user_id", user!.id).eq("source_type", "meeting_action"),
  ]);

  const [indexedActivityFeed, backstageIndexStats] = await Promise.all([
    getIndexedWorkspaceActivityFeed(supabase, user!.id, 50),
    getWorkspaceBackstageIndexStats(supabase, user!.id),
  ]);

  const typedWatchlists = (watchlists ?? []) as Watchlist[];
  const profile = profileData as Profile | null;
  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Researcher";

  // Get time of day for greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const totalKeywords = typedWatchlists.reduce((sum, w) => sum + w.keywords.length, 0);
  const hasWatchlists = typedWatchlists.length > 0;
  const digestEnabled = profile?.digest_enabled ?? true;

  const allActivityFeed = indexedActivityFeed ?? buildWorkspaceActivityFeed({
    tasks: recentTasks ?? [],
    meetings: recentMeetings ?? [],
    notes: recentNotes ?? [],
    experiments: recentExperiments ?? [],
    datasets: recentDatasets ?? [],
    analyses: recentAnalyses ?? [],
    figures: recentFigures ?? [],
    papers: recentPapers ?? [],
  });

  const missingDataAlerts = buildMissingDataAlerts({
    experiments: allExperimentsForChecks ?? [],
    timepoints: experimentTimepointsForChecks ?? [],
    datasets: datasetsForChecks ?? [],
    analyses: analysesForChecks ?? [],
    figures: figuresForChecks ?? [],
    meetings: meetingNotesForChecks ?? [],
    meetingActionTasks: meetingActionTasksForChecks ?? [],
  });
  const activityKindFilter = (params?.activityKind || "all") as ActivityKindFilter;
  const activityWindowFilter = (params?.activityWindow || "7d") as ActivityWindowFilter;
  const activityFeed = filterWorkspaceActivityFeed(allActivityFeed, activityKindFilter, activityWindowFilter);

  const focusItems = [
    {
      title: "Literature scan",
      detail: hasWatchlists
        ? `${typedWatchlists.length} watchlist${typedWatchlists.length === 1 ? "" : "s"} • ${savedPapersCount ?? 0} saved paper${(savedPapersCount ?? 0) === 1 ? "" : "s"}`
        : "No watchlists yet — create one to start tracking literature",
      href: hasWatchlists ? "/dashboard" : "/dashboard",
      actionLabel: hasWatchlists ? "Open search" : "Create watchlist",
      tone: "cyan" as const,
    },
    {
      title: "Digest settings",
      detail: digestEnabled
        ? `Email digest is enabled${profile?.last_digest_at ? ` • last sent ${new Date(profile.last_digest_at).toLocaleDateString()}` : ""}`
        : "Email digest is paused",
      href: "#digest-settings",
      actionLabel: "Review digest",
      tone: "amber" as const,
    },
    {
      title: "Workspace rhythm",
      detail: `${pendingTasksCount ?? 0} active task${(pendingTasksCount ?? 0) === 1 ? "" : "s"} • ${notesCount ?? 0} notes • ${meetingsCount ?? 0} meetings`,
      href: (pendingTasksCount ?? 0) > 0 ? "/tasks" : (notesCount ?? 0) > 0 ? "/notes" : "/meetings",
      actionLabel: (pendingTasksCount ?? 0) > 0 ? "Open tasks" : "Open notes",
      tone: "emerald" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/80 px-5 py-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.32)] backdrop-blur-sm sm:px-7 sm:py-7">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyan-100/70 blur-2xl" />
        <div className="absolute right-10 top-8 h-20 w-20 rounded-full border border-cyan-200/70 bg-white/50" />
        <div className="absolute bottom-0 right-0 h-28 w-56 bg-gradient-to-l from-amber-100/45 to-transparent" />

        <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">
              <span className="inline-block h-2 w-2 rounded-full bg-cyan-500" />
              Workspace Overview
            </div>
            <p className="mb-1 text-sm font-medium text-cyan-800/80">{greeting},</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Search literature, track watchlists, and review AI-assisted updates in a cleaner, calmer research workflow.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={<BookOpen className="h-4 w-4" />}
                label="Watchlists"
                value={String(typedWatchlists.length)}
                tone="cyan"
              />
              <MetricCard
                icon={<Activity className="h-4 w-4" />}
                label="Keywords"
                value={String(totalKeywords)}
                tone="emerald"
              />
              <MetricCard
                icon={<Sparkles className="h-4 w-4" />}
                label="AI Status"
                value="Ready"
                tone="amber"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.28)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Today&apos;s focus</p>
              <Clock3 className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-2">
              {focusItems.map((item) => (
                <FocusActionCard
                  key={item.title}
                  title={item.title}
                  detail={item.detail}
                  href={item.href}
                  actionLabel={item.actionLabel}
                  tone={item.tone}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.26)] backdrop-blur-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Search</p>
            <p className="text-sm text-slate-700">Start with PubMed and your saved watchlists</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 sm:flex">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Research flow
          </div>
        </div>
        <SearchBar />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.24)] sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Your Watchlists</h2>
                <p className="text-sm text-slate-600">
                  {hasWatchlists ? "Track active topics and review incoming literature" : "Create a watchlist to start monitoring keywords"}
                </p>
              </div>
              <WatchlistForm action={createWatchlist} />
            </div>

            {hasWatchlists ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {typedWatchlists.map((watchlist) => (
                  <WatchlistCard
                    key={watchlist.id}
                    watchlist={watchlist}
                    updateAction={updateWatchlist}
                    deleteAction={deleteWatchlist}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/35 p-10 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200 bg-white text-cyan-700">
                  <BookOpen className="h-5 w-5" />
                </div>
                <p className="font-medium text-slate-900">No watchlists yet</p>
                <p className="mt-1 text-sm text-slate-600">
                  Create one to start tracking keywords across PubMed and receiving AI summaries.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div id="digest-settings" className="scroll-mt-24 rounded-3xl border border-white/80 bg-white/80 p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.24)] sm:p-5">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Digest</p>
              <p className="text-sm text-slate-700">Control your research update cadence</p>
            </div>
            <DigestToggle
              enabled={profile?.digest_enabled ?? true}
              updateAction={updateDigestPreference}
            />
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.24)] sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Missing Data Detector</p>
                <p className="text-sm text-slate-700">Find incomplete links before they break your workflow</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            {missingDataAlerts.length === 0 ? (
              <p className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-800">
                No obvious data gaps detected right now.
              </p>
            ) : (
              <div className="space-y-2">
                {missingDataAlerts.map((alert) => (
                  <div
                    key={alert.key}
                    className={`rounded-2xl border px-3 py-2 ${
                      alert.severity === "warn"
                        ? "border-amber-200 bg-amber-50/45"
                        : "border-slate-200 bg-slate-50/45"
                    }`}
                  >
                    <Link href={alert.href} className="block">
                      <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-600">{alert.detail}</p>
                    </Link>
                    {alert.fix && (
                      <div className="mt-2">
                        <MissingDataFixButton alert={alert} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.24)] sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Activity Feed</p>
            <p className="text-sm text-slate-700">Cross-module changes across notes, meetings, tasks, experiments, and results</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
            <Activity className="h-3.5 w-3.5" />
            Live from workspace tables
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <form action={rebuildWorkspaceBackstageGraph}>
            <button
              type="submit"
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Rebuild Backstage Graph Index
            </button>
          </form>
          <div className="text-[11px] text-slate-500">
            {backstageIndexStats
              ? `Indexed: ${backstageIndexStats.links} links • ${backstageIndexStats.events} events${backstageIndexStats.latestEventAt ? ` • refreshed ${formatRelativeWorkspaceTime(backstageIndexStats.latestEventAt)}` : ""}`
              : "Backstage index tables not initialized yet (run migration 025)"}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ActivityFilterPill label="All" active={activityKindFilter === "all"} href={buildDashboardQueryHref({ kind: "all", window: activityWindowFilter })} />
          <ActivityFilterPill label="Tasks" active={activityKindFilter === "task"} href={buildDashboardQueryHref({ kind: "task", window: activityWindowFilter })} />
          <ActivityFilterPill label="Meetings" active={activityKindFilter === "meeting"} href={buildDashboardQueryHref({ kind: "meeting", window: activityWindowFilter })} />
          <ActivityFilterPill label="Notes" active={activityKindFilter === "note"} href={buildDashboardQueryHref({ kind: "note", window: activityWindowFilter })} />
          <ActivityFilterPill label="Results" active={activityKindFilter === "results"} href={buildDashboardQueryHref({ kind: "results", window: activityWindowFilter })} />
          <div className="mx-1 h-4 w-px bg-slate-200" />
          <ActivityFilterPill label="24h" active={activityWindowFilter === "24h"} href={buildDashboardQueryHref({ kind: activityKindFilter, window: "24h" })} />
          <ActivityFilterPill label="7d" active={activityWindowFilter === "7d"} href={buildDashboardQueryHref({ kind: activityKindFilter, window: "7d" })} />
          <ActivityFilterPill label="30d" active={activityWindowFilter === "30d"} href={buildDashboardQueryHref({ kind: activityKindFilter, window: "30d" })} />
        </div>
        {activityFeed.length === 0 ? (
          <p className="text-sm text-slate-600">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activityFeed.map((item) => (
              <Link key={`${item.kind}-${item.id}`} href={item.href} className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2.5 hover:border-cyan-200">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {item.kind}
                    </span>
                    <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-600">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{formatRelativeWorkspaceTime(item.timestamp)}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function buildDashboardQueryHref({ kind, window }: { kind: ActivityKindFilter; window: ActivityWindowFilter }) {
  const qs = new URLSearchParams();
  if (kind !== "all") qs.set("activityKind", kind);
  if (window !== "7d") qs.set("activityWindow", window);
  const q = qs.toString();
  return q ? `/dashboard?${q}` : "/dashboard";
}

function formatRelativeWorkspaceTime(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function ActivityFilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-cyan-200 bg-cyan-50 text-cyan-800"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

async function MissingDataFixButton({ alert }: { alert: MissingDataAlert }) {
  const action = alert.fix === "resync_meeting_tasks" ? resyncMeetingActionTasks : backfillStarterExperimentTimepoints;
  const label = alert.fix === "resync_meeting_tasks" ? "Auto-fix: Resync tasks" : "Auto-fix: Create starter timepoints";
  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
      >
        {label}
      </button>
    </form>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "cyan" | "emerald" | "amber";
}) {
  const toneClasses = {
    cyan: "border-cyan-200/70 bg-cyan-50/55 text-cyan-800",
    emerald: "border-emerald-200/70 bg-emerald-50/55 text-emerald-800",
    amber: "border-amber-200/70 bg-amber-50/55 text-amber-800",
  } as const;

  return (
    <div className="rounded-2xl border border-white/90 bg-white/80 p-3 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.28)]">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl border ${toneClasses[tone]}`}>
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FocusActionCard({
  title,
  detail,
  href,
  actionLabel,
  tone,
}: {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: "cyan" | "amber" | "emerald";
}) {
  const tones = {
    cyan: "border-cyan-200/70 hover:border-cyan-300/80",
    amber: "border-amber-200/70 hover:border-amber-300/80",
    emerald: "border-emerald-200/70 hover:border-emerald-300/80",
  } as const;

  const content = (
    <div className={`group rounded-2xl border bg-white/70 px-3 py-3 transition-colors ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{detail}</p>
        </div>
        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
          <span>{actionLabel}</span>
          <ChevronRight className="h-3 w-3 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </div>
  );

  if (href.startsWith("#")) {
    return <a href={href} className="block">{content}</a>;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
