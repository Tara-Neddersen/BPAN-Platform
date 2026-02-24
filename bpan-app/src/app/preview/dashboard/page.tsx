import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, BookOpen, Brain, FlaskConical, Sparkles } from "lucide-react";

const mockWatchlists = [
  { id: "1", name: "BPAN sleep architecture", keywords: ["EEG", "sleep spindle", "BPAN"], updates: 12 },
  { id: "2", name: "Neuroplasticity interventions", keywords: ["training", "rehab", "synaptic"], updates: 8 },
  { id: "3", name: "Caregiver outcomes", keywords: ["quality of life", "burden", "support"], updates: 5 },
];

export default function DashboardPreviewPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(156,209,225,0.18),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(246,214,180,0.18),transparent_40%),linear-gradient(180deg,#f8faf8,#f3f7f8)]">
      <header className="sticky top-0 z-10 border-b border-white/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6fb4c8,#4d8fa4)] text-sm font-bold text-white">
              B
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">BPAN Platform</p>
              <p className="text-sm text-slate-700">Dashboard Preview (Local)</p>
            </div>
          </div>
          <Link
            href="/auth/login"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/80 p-6 shadow-[0_18px_40px_-26px_rgba(34,62,77,0.35)] backdrop-blur-sm sm:p-8">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-100/70" />
          <div className="absolute bottom-0 right-12 h-20 w-20 rounded-full bg-amber-100/70" />
          <div className="relative">
            <p className="text-sm font-medium text-cyan-700">Dashboard preview</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Care, signals, and research in one workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              This is a local mock view so you can review design/layout before wiring up Supabase auth and live data.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">Local only</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">No deployment required</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">Mock data</span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<BookOpen className="h-4 w-4" />} label="Watchlists" value="3" tone="cyan" />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Tracked Keywords" value="9" tone="emerald" />
          <StatCard icon={<Brain className="h-4 w-4" />} label="Neuro Notes" value="18" tone="amber" />
          <StatCard icon={<Sparkles className="h-4 w-4" />} label="AI Summaries" value="Ready" tone="slate" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-[0_18px_40px_-28px_rgba(34,62,77,0.28)] backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Watchlists</h2>
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
                Add watchlist
              </button>
            </div>
            <div className="space-y-3">
              {mockWatchlists.map((w) => (
                <div key={w.id} className="rounded-2xl border border-slate-200/80 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">{w.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {w.keywords.map((keyword) => (
                          <span key={keyword} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-cyan-50 px-3 py-2 text-right">
                      <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">Updates</p>
                      <p className="text-lg font-semibold text-cyan-900">{w.updates}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <PanelCard
              title="Signal Review"
              subtitle="Mouse illustrations will appear here once copied to /public/illustrations"
              bodyClassName="grid grid-cols-2 gap-3"
            >
              <PreviewTile label="Monitoring" />
              <PreviewTile label="EEG setup" />
              <PreviewTile label="Outcomes" />
              <PreviewTile label="Neuroplasticity" />
            </PanelCard>

            <PanelCard
              title="Today"
              subtitle="Mock tasks for layout review"
              bodyClassName="space-y-3"
            >
              <TaskRow label="Review overnight EEG notes" />
              <TaskRow label="Update caregiver summary draft" />
              <TaskRow label="Compare sleep spindle trends" />
            </PanelCard>

            <PanelCard title="Research Assistant" subtitle="Preview state" bodyClassName="space-y-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                AI summary panel and advisor sidebar will populate once Supabase auth and data are connected.
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <FlaskConical className="h-4 w-4" />
                Local preview mode enabled
              </div>
            </PanelCard>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "cyan" | "emerald" | "amber" | "slate";
}) {
  const tones = {
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  } as const;

  return (
    <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-[0_10px_20px_-16px_rgba(34,62,77,0.24)]">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${tones[tone]}`}>{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PanelCard({
  title,
  subtitle,
  children,
  bodyClassName,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-[0_18px_40px_-28px_rgba(34,62,77,0.28)] backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function PreviewTile({ label }: { label: string }) {
  return (
    <div className="flex aspect-square items-center justify-center rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_20%_20%,rgba(149,201,227,0.18),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(244,203,170,0.2),transparent_55%),white] p-3 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
    </div>
  );
}

function TaskRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
      <p className="text-sm text-slate-700">{label}</p>
    </div>
  );
}
