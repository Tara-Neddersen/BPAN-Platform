"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  Database,
  FlaskConical,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const headingFont = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });
const monoFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"] });

type Feature = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  capabilities: { title: string; detail: string }[];
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  mockTitle: string;
  mockRows: string[];
};

const featureDeck: Feature[] = [
  {
    id: "ops",
    eyebrow: "Lab Operations",
    title: "Run colony, scheduling, and inventory from one command center",
    description:
      "Move planning, execution, and status tracking into a single workflow so no handoff depends on scattered spreadsheets.",
    bullets: [
      "Timeline-aware experiment scheduling",
      "Cage and cohort lifecycle tracking",
      "Task lanes with role ownership",
    ],
    capabilities: [
      { title: "Constraint-safe scheduling", detail: "Prevents collisions across staff, rooms, and equipment." },
      { title: "Protocol rollouts", detail: "Pushes new procedures across active cohorts in minutes." },
      { title: "Execution visibility", detail: "Shows blockers and handoffs before they delay studies." },
      { title: "Ops audit trail", detail: "Captures every timeline and status change automatically." },
    ],
    icon: Workflow,
    accent: "from-cyan-300/40 via-teal-200/30 to-sky-100/30",
    mockTitle: "Operations Window",
    mockRows: ["12 active cohorts", "4 schedule conflicts auto-resolved", "89% protocol completion"],
  },
  {
    id: "intelligence",
    eyebrow: "AI Intelligence",
    title: "Convert raw activity into recommendations your team can act on",
    description:
      "Surface anomalies, summarize trends, and generate structured outputs for meetings without digging through disconnected logs.",
    bullets: [
      "Automated experiment recap generation",
      "Signal anomaly highlights with context",
      "Cross-study trend comparisons",
      "Auto-generated plots from connected data (no copy/paste)",
      "Presentation-ready slide drafts (coming soon)",
    ],
    capabilities: [
      { title: "Auto brief generation", detail: "Converts notes and results into PI-ready summaries." },
      { title: "Anomaly detection", detail: "Highlights unusual behavior with source-linked evidence." },
      { title: "Trend synthesis", detail: "Compares cohorts and flags meaningful divergence." },
      { title: "Hands-free plotting", detail: "Builds analysis charts automatically from synced experiment data." },
      { title: "Action drafting", detail: "Suggests next tasks based on current lab state." },
      { title: "Presentation autopilot (Soon)", detail: "Builds meeting slides from live experiment updates and key decisions." },
    ],
    icon: BrainCircuit,
    accent: "from-amber-200/45 via-orange-200/30 to-rose-100/25",
    mockTitle: "Insights Window",
    mockRows: ["Spike detected in Rotarod recovery", "7-day trend confidence: 94%", "Ready-to-share PI brief"],
  },
  {
    id: "collaboration",
    eyebrow: "Cross-Lab Collaboration",
    title: "Give every lab member a shared real-time source of truth",
    description:
      "From PI to technician, everyone sees the same state, comments in context, and works from synced protocols and results.",
    bullets: [
      "Role-based access and activity logs",
      "Shared notebook, chat, and decisions",
      "Advisor and collaborator portals",
    ],
    capabilities: [
      { title: "Shared workspace context", detail: "Everyone sees the same real-time experiment state." },
      { title: "Role-scoped permissions", detail: "Control who can edit, review, or publish updates." },
      { title: "External collaborator views", detail: "Give advisors clean read-only windows into progress." },
      { title: "Decision memory", detail: "Keeps comments, rationale, and outcomes linked to work." },
    ],
    icon: Users,
    accent: "from-violet-200/40 via-indigo-200/30 to-cyan-100/25",
    mockTitle: "Collaboration Window",
    mockRows: ["23 contributors online", "5 review notes resolved today", "2 external advisors with read-only access"],
  },
];

const quickStats = [
  {
    label: "Protocol Autopilot",
    value: "Auto-builds study timelines from your milestones, constraints, and cohort details.",
    icon: Network,
  },
  {
    label: "AI Lab Copilot",
    value: "Summarizes notes, flags anomalies, and drafts next actions directly from live lab activity.",
    icon: Activity,
  },
  {
    label: "Cross-Lab Collaboration",
    value: "Shared task lanes, role-based access, and advisor portals keep every stakeholder aligned.",
    icon: ShieldCheck,
  },
  {
    label: "Unified Data Layer",
    value: "Combines colony, experiment, and operations data in one searchable, analysis-ready workspace.",
    icon: Database,
  },
];

const roadmapCards = [
  {
    title: "Protocol-aware planner",
    body: "Auto-generate milestone schedules with timing constraints and dependency checks.",
    icon: CalendarClock,
  },
  {
    title: "Experiment analytics",
    body: "Bring result capture, benchmarking, and cohort comparisons into one continuous view with automatic plot generation.",
    icon: FlaskConical,
  },
  {
    title: "AI research copilot",
    body: "Get summaries, action drafts, and clear next steps across tasks, notes, and results.",
    icon: Sparkles,
  },
  {
    title: "Presentation autopilot (Soon)",
    body: "Generate lab meeting slide decks automatically from your latest results, notes, and timeline changes.",
    icon: BrainCircuit,
  },
];

export default function DashboardPreviewPage() {
  const [activeFeatureId, setActiveFeatureId] = useState(featureDeck[0].id);

  useEffect(() => {
    const sections = featureDeck
      .map((feature) => document.getElementById(`feature-${feature.id}`))
      .filter(Boolean) as HTMLElement[];

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveFeatureId(visible.target.id.replace("feature-", ""));
        }
      },
      {
        root: null,
        threshold: [0.35, 0.5, 0.75],
        rootMargin: "-10% 0px -20% 0px",
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const activeFeature = useMemo(
    () => featureDeck.find((feature) => feature.id === activeFeatureId) ?? featureDeck[0],
    [activeFeatureId]
  );

  return (
    <div className="native-preview min-h-screen text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/72 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-9 w-9 rounded-xl" alt="Platform logo" />
            <div>
              <p className={`${monoFont.className} text-[11px] uppercase tracking-[0.2em] text-slate-500`}>
                Research Ops Platform
              </p>
              <p className="text-sm font-medium text-slate-700">Built for modern labs, not one team.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="rounded-full border border-white/80 bg-white/84 px-4 py-2 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] transition hover:bg-white"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-1 rounded-full border border-primary/70 bg-primary px-4 py-2 text-sm font-medium text-white shadow-[0_14px_30px_-22px_color-mix(in_oklch,var(--primary)_70%,black)] transition hover:bg-primary/92"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/75 bg-white/76 p-7 shadow-[0_34px_70px_-46px_rgba(12,34,54,0.44)] backdrop-blur-xl sm:p-10">
          <div className="absolute -left-12 top-[-64px] h-56 w-56 rounded-full bg-blue-200/30 blur-2xl" />
          <div className="absolute -right-16 bottom-[-70px] h-64 w-64 rounded-full bg-sky-200/30 blur-2xl" />
          <div className="relative">
            <p className={`${monoFont.className} text-xs uppercase tracking-[0.2em] text-cyan-800`}>
              LABS OS PREVIEW
            </p>
            <h1 className={`${headingFont.className} mt-3 max-w-4xl text-4xl leading-tight sm:text-5xl`}>
              One platform for every lab workflow: operations, experiments, and intelligence.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
              Replace fragmented tooling with a single system that coordinates tasks, captures results, and ships AI-powered insight across your whole team.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              {quickStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <article
                    key={stat.label}
                    className="rounded-2xl border border-slate-200/90 bg-white/85 p-4 shadow-[0_18px_30px_-28px_rgba(26,60,88,0.6)]"
                  >
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className={`${headingFont.className} mt-3 text-base leading-tight text-slate-900`}>{stat.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{stat.value}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-8">
            {featureDeck.map((feature) => {
              const Icon = feature.icon;
              const isActive = feature.id === activeFeatureId;

              return (
                <article
                  key={feature.id}
                  id={`feature-${feature.id}`}
                  className={`rounded-3xl border p-6 transition-all duration-500 sm:p-7 ${
                    isActive
                      ? "border-slate-900/20 bg-white shadow-[0_28px_50px_-35px_rgba(12,35,54,0.45)]"
                      : "border-white/70 bg-white/70 shadow-[0_15px_30px_-30px_rgba(12,35,54,0.35)]"
                  }`}
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className={`${monoFont.className} mt-4 text-xs uppercase tracking-[0.18em] text-slate-500`}>
                    {feature.eyebrow}
                  </p>
                  <h2 className={`${headingFont.className} mt-2 text-2xl leading-tight text-slate-900`}>
                    {feature.title}
                  </h2>
                  <p className="mt-3 text-slate-600">{feature.description}</p>
                  <ul className="mt-4 space-y-2">
                    {feature.bullets.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-[0.42rem] h-1.5 w-1.5 rounded-full bg-slate-900" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white/90 shadow-[0_34px_70px_-38px_rgba(21,47,71,0.45)]">
              <div className={`h-3.5 bg-gradient-to-r ${activeFeature.accent}`} />
              <div className="border-b border-slate-200/80 px-5 py-4">
                <p className={`${monoFont.className} text-[11px] uppercase tracking-[0.16em] text-slate-500`}>Live Product Window</p>
                <h3 className={`${headingFont.className} mt-1 text-xl text-slate-900`}>{activeFeature.mockTitle}</h3>
              </div>
              <div className="space-y-3 p-5">
                {activeFeature.mockRows.map((row) => (
                  <div
                    key={row}
                    className="rounded-2xl border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(243,249,252,0.88))] p-4"
                  >
                    <p className="text-sm text-slate-700">{row}</p>
                  </div>
                ))}
                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  {activeFeature.capabilities.map((capability) => (
                    <div key={capability.title} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">{capability.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{capability.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className={`${monoFont.className} text-xs uppercase tracking-[0.16em] text-slate-500`}>
                Why teams switch
              </p>
              <h2 className={`${headingFont.className} mt-1 text-3xl`}>Introduce every core feature in a few scrolls</h2>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {roadmapCards.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.title}
                  className="group rounded-3xl border border-white/80 bg-white/85 p-5 shadow-[0_20px_35px_-30px_rgba(18,46,62,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_44px_-28px_rgba(18,46,62,0.5)]"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={`${headingFont.className} mt-4 text-xl text-slate-900`}>{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
