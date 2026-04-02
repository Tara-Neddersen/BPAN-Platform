"use client";

import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  BookText,
  FlaskConical,
  MessageSquare,
  Microscope,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type WorkspaceEmptyStateIcon =
  | "notes"
  | "library"
  | "pi-access"
  | "results"
  | "analysis"
  | "labs"
  | "chat";

type WorkspaceEmptyStateAction = {
  label: string;
  href: string;
};

interface WorkspaceEmptyStateProps {
  title: string;
  description: string;
  primaryAction: WorkspaceEmptyStateAction;
  secondaryAction?: WorkspaceEmptyStateAction;
  icon: WorkspaceEmptyStateIcon;
}

const ICON_MAP = {
  notes: BookText,
  library: BookOpen,
  "pi-access": ShieldCheck,
  results: BarChart3,
  analysis: Microscope,
  labs: FlaskConical,
  chat: MessageSquare,
} as const;

export function WorkspaceEmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  icon,
}: WorkspaceEmptyStateProps) {
  const Icon = ICON_MAP[icon];

  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-[0_12px_30px_-26px_rgba(15,23,42,0.34)] sm:p-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <div className="mx-auto mt-5 max-w-xl space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Button asChild className="min-w-40 rounded-xl">
          <Link href={primaryAction.href}>{primaryAction.label}</Link>
        </Button>
        {secondaryAction ? (
          <Button asChild variant="outline" className="min-w-40 rounded-xl">
            <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
