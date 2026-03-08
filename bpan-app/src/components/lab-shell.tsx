import Link from "next/link";
import { Building2, LockKeyhole, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LabMembershipWithLab, LabShellSummary } from "@/lib/labs";

interface LabShellProps {
  summary: LabShellSummary | null;
  activeLab: LabMembershipWithLab | null;
  hasInvalidSelection: boolean;
}

export function LabShell({ summary, activeLab, hasInvalidSelection }: LabShellProps) {
  const memberships = summary?.memberships ?? [];
  const warning = summary?.warning ?? null;

  return (
    <section className="mb-6 rounded-3xl border border-white/80 bg-white/70 px-4 py-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.24)] backdrop-blur-xl sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-800">
              <Building2 className="h-3 w-3" />
              Labs
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <LockKeyhole className="h-3 w-3" />
              Personal workspace active
            </Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">
              {activeLab
                ? `Active lab: ${activeLab.lab.name}`
                : "Personal workspace is currently active"}
            </p>
            <p className="text-sm text-slate-600">
              {activeLab
                ? `You have ${activeLab.role} access in this lab.`
                : memberships.length > 0
                  ? "Choose an active lab from the switcher to work with shared resources."
                  : "Create a lab to collaborate with your team."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {memberships.length} lab{memberships.length === 1 ? "" : "s"}
          </Badge>
          <Link
            href="/labs"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Manage labs
          </Link>
        </div>
      </div>

      {warning ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </div>
      ) : null}
      {hasInvalidSelection ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your previous lab selection is no longer available. Choose another lab from the switcher.
        </div>
      ) : null}
    </section>
  );
}
