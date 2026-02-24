import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";
import Link from "next/link";
import { SearchBar } from "@/components/search-bar";
import { WatchlistCard } from "@/components/watchlist-card";
import { WatchlistForm } from "@/components/watchlist-form";
import { DigestToggle } from "@/components/digest-toggle";
import { createWatchlist, updateWatchlist, deleteWatchlist, updateDigestPreference } from "./actions";
import type { Watchlist, Profile } from "@/types";
import { Activity, ArrowUpRight, BookOpen, ChevronRight, Clock3, Sparkles } from "lucide-react";

export default async function DashboardPage() {
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

  const typedWatchlists = (watchlists ?? []) as Watchlist[];
  const profile = profileData as Profile | null;
  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Researcher";

  // Get time of day for greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const totalKeywords = typedWatchlists.reduce((sum, w) => sum + w.keywords.length, 0);
  const hasWatchlists = typedWatchlists.length > 0;
  const digestEnabled = profile?.digest_enabled ?? true;

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
        </div>
      </section>
    </div>
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
