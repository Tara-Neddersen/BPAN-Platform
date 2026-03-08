"use client";

import { startTransition, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  FlaskConical,
  History,
  ListTodo,
  Megaphone,
  MessageSquare,
  NotebookPen,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  addLabMemberByEmail,
  createLab,
  deactivateLabMember,
  setActiveLabContext,
  updateLabMemberDisplayName,
  updateLabMemberRole,
  updateLabPolicies,
} from "@/app/(protected)/labs/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HelpHint } from "@/components/ui/help-hint";
import { cn } from "@/lib/utils";
import {
  canDeactivateLabMembers,
  canManageLabMembers,
  canManageLabPolicies,
  type LabMembershipWithLab,
} from "@/lib/labs";
import type { LabMember, PlatformLabRole } from "@/types";

type LabMemberWithIdentity = LabMember & {
  profile: {
    displayName: string | null;
    email: string | null;
  } | null;
};

type LabWorkspaceRecord = {
  membership: LabMembershipWithLab;
  members: LabMemberWithIdentity[];
  membersWarning: string | null;
  membersFeatureUnavailable: boolean;
};

type LocalActivityEvent = {
  id: string;
  type: "added" | "renamed" | "role_changed" | "deactivated";
  memberLabel: string;
  detail: string;
  createdAt: string;
};

type InviteHistoryEntry = {
  id: string;
  email: string;
  role: PlatformLabRole;
  outcome: "submitted" | "added" | "already_member" | "user_not_found" | "failed";
  actor: string;
  createdAt: string;
};

type AddMemberDraft = {
  email: string;
  role: PlatformLabRole;
  displayTitle: string;
};

type RoleHistoryEntry = {
  id: string;
  memberLabel: string;
  fromRole: PlatformLabRole;
  toRole: PlatformLabRole;
  actor: string;
  note: string | null;
  createdAt: string;
};

type ManagerMemberProfile = {
  focusArea: string;
  contact: string;
  notes: string;
};

type AnnouncementEntry = {
  id: string;
  type: "inspection" | "general";
  title: string;
  body: string;
  author: string;
  createdAt: string;
};

type SharedTaskEntry = {
  id: string;
  listType: "inspection" | "general";
  title: string;
  details: string;
  assigneeMemberId: string | null;
  assigneeLabel: string;
  done: boolean;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
};

type SharedTaskEditDraft = {
  title: string;
  details: string;
};

type InventorySyncStatus = {
  lastSyncAt: string | null;
  fetched: number | null;
  matched: number | null;
  inserted: number | null;
  source: "quartzy_stock_events" | "placeholder";
  hint: string;
};

interface LabsClientProps {
  currentUserId: string;
  shellWarning: string | null;
  featureUnavailable: boolean;
  selectedLabId: string | null;
  initialPanel?: string | null;
  operationsReagentsPanel?: ReactNode;
  operationsEquipmentPanel?: ReactNode;
  labChatPanel?: ReactNode;
  syncStatusByLab?: Record<string, InventorySyncStatus>;
  workspaces: LabWorkspaceRecord[];
}

type LabHubSection =
  | "reagents"
  | "chat"
  | "announcements"
  | "inspection_tasks"
  | "general_tasks"
  | "equipment_booking";

const ROLE_LABELS: Record<PlatformLabRole, string> = {
  member: "Member",
  manager: "Manager",
  admin: "Admin",
};

const EDIT_POLICY_LABELS = {
  manager_controlled: "Managers approve edits",
  open_edit: "Any member can edit",
} as const;

const LAB_HOME_SHORTCUTS = [
  {
    key: "reagents" as const,
    title: "Reagents",
    description: "Track stock and reorder needs.",
    actionLabel: "Open section",
    icon: FlaskConical,
  },
  {
    key: "chat" as const,
    title: "Lab chat",
    description: "Post daily lab updates.",
    actionLabel: "Open section",
    icon: MessageSquare,
  },
  {
    key: "announcements" as const,
    title: "Announcements",
    description: "Share inspection notices.",
    actionLabel: "Open section",
    icon: Megaphone,
  },
  {
    key: "inspection_tasks" as const,
    title: "Shared inspection tasks",
    description: "Review inspection follow-ups.",
    actionLabel: "Open section",
    icon: ClipboardCheck,
  },
  {
    key: "general_tasks" as const,
    title: "Shared general tasks",
    description: "Track team to-dos.",
    actionLabel: "Open section",
    icon: ListTodo,
  },
  {
    key: "equipment_booking" as const,
    title: "Equipment booking",
    description: "Book and manage equipment time.",
    actionLabel: "Open section",
    icon: CalendarClock,
  },
] as const;

const HUB_SECTION_LABELS: Record<LabHubSection, string> = {
  reagents: "Reagents",
  chat: "Lab chat",
  announcements: "Announcements",
  inspection_tasks: "Shared inspection tasks",
  general_tasks: "Shared general tasks",
  equipment_booking: "Equipment booking",
};

const OPS_TAB_STORAGE_PREFIX = "labs:ops-tab:";

function normalizeIncomingPanel(panel: string | null | undefined): LabHubSection | null {
  if (!panel) return null;
  const normalized = panel.trim().toLowerCase();
  if (normalized === "reagents" || normalized === "inventory") return "reagents";
  if (normalized === "chat" || normalized === "lab-chat") return "chat";
  if (normalized === "announcements") return "announcements";
  if (normalized === "inspection" || normalized === "inspection-tasks" || normalized === "inspection_tasks") return "inspection_tasks";
  if (normalized === "tasks" || normalized === "general-tasks" || normalized === "general_tasks") return "general_tasks";
  if (normalized === "booking" || normalized === "bookings" || normalized === "equipment" || normalized === "equipment-booking" || normalized === "equipment_booking") {
    return "equipment_booking";
  }
  return null;
}

function getMemberPrimaryLabel(member: LabMemberWithIdentity) {
  return (
    member.display_title ||
    member.profile?.displayName ||
    member.profile?.email ||
    "Lab member"
  );
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "just now";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function roleRank(role: PlatformLabRole) {
  if (role === "admin") return 3;
  if (role === "manager") return 2;
  return 1;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatSyncTimestamp(timestamp: string | null) {
  if (!timestamp) return "No sync marker yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

export function LabsClient({
  currentUserId,
  shellWarning,
  featureUnavailable,
  selectedLabId,
  initialPanel = null,
  operationsReagentsPanel,
  operationsEquipmentPanel,
  labChatPanel,
  syncStatusByLab = {},
  workspaces,
}: LabsClientProps) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [memberAddFeedbackByLab, setMemberAddFeedbackByLab] = useState<
    Record<string, { tone: "success" | "warning" | "error"; message: string }>
  >({});
  const [localActivityByLab, setLocalActivityByLab] = useState<Record<string, LocalActivityEvent[]>>({});
  const [inviteHistoryByLab, setInviteHistoryByLab] = useState<Record<string, InviteHistoryEntry[]>>({});
  const [roleHistoryByLab, setRoleHistoryByLab] = useState<Record<string, RoleHistoryEntry[]>>({});
  const [roleAuditNoteByMember, setRoleAuditNoteByMember] = useState<Record<string, string>>({});
  const [lastAddDraftByLab, setLastAddDraftByLab] = useState<Record<string, AddMemberDraft>>({});
  const [managerProfileByLab, setManagerProfileByLab] = useState<Record<string, Record<string, ManagerMemberProfile>>>({});
  const [announcementsByLab, setAnnouncementsByLab] = useState<Record<string, AnnouncementEntry[]>>({});
  const [sharedTasksByLab, setSharedTasksByLab] = useState<Record<string, SharedTaskEntry[]>>({});
  const [sharedTaskEditById, setSharedTaskEditById] = useState<Record<string, SharedTaskEditDraft>>({});
  const [teamTargetLabId, setTeamTargetLabId] = useState<string | null>(null);
  const [openTeamPoliciesByLab, setOpenTeamPoliciesByLab] = useState<Record<string, boolean>>({});
  const [pendingTeamTarget, setPendingTeamTarget] = useState<{ labId: string; target: "members" | "policies" } | null>(null);
  const [opsTabByLab, setOpsTabByLab] = useState<Record<string, LabHubSection>>({});
  const [advancedPanelByLab, setAdvancedPanelByLab] = useState<Record<string, Partial<Record<LabHubSection, boolean>>>>({});
  const [pendingActiveLabId, setPendingActiveLabId] = useState<string | null>(null);
  const [opsPanelPulseKey, setOpsPanelPulseKey] = useState<string | null>(null);
  const effectiveActiveLabId = pendingActiveLabId ?? selectedLabId;
  const normalizedInitialPanel = normalizeIncomingPanel(initialPanel);

  function readStoredEvents<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as T[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getActivityEntries(labId: string) {
    return localActivityByLab[labId] ?? readStoredEvents<LocalActivityEvent>(`labs:activity:${labId}`);
  }

  function getInviteEntries(labId: string) {
    return inviteHistoryByLab[labId] ?? readStoredEvents<InviteHistoryEntry>(`labs:invite-history:${labId}`);
  }

  function getRoleHistoryEntries(labId: string) {
    return roleHistoryByLab[labId] ?? readStoredEvents<RoleHistoryEntry>(`labs:role-history:${labId}`);
  }

  function getAnnouncementEntries(labId: string) {
    return announcementsByLab[labId] ?? readStoredEvents<AnnouncementEntry>(`labs:announcements:${labId}`);
  }

  function getSharedTaskEntries(labId: string) {
    return sharedTasksByLab[labId] ?? readStoredEvents<SharedTaskEntry>(`labs:shared-tasks:${labId}`);
  }

  function getManagerProfile(labId: string, memberId: string): ManagerMemberProfile {
    const fromState = managerProfileByLab[labId]?.[memberId];
    if (fromState) return fromState;
    const persisted = readStoredEvents<[string, ManagerMemberProfile]>(`labs:member-profile:${labId}`);
    const map: Record<string, ManagerMemberProfile> = {};
    for (const item of persisted) {
      if (!Array.isArray(item) || item.length !== 2) continue;
      const [key, value] = item;
      if (typeof key !== "string" || !value || typeof value !== "object") continue;
      map[key] = {
        focusArea: typeof value.focusArea === "string" ? value.focusArea : "",
        contact: typeof value.contact === "string" ? value.contact : "",
        notes: typeof value.notes === "string" ? value.notes : "",
      };
    }
    return map[memberId] ?? { focusArea: "", contact: "", notes: "" };
  }

  function appendLocalActivity(labId: string, event: Omit<LocalActivityEvent, "id" | "createdAt">) {
    setLocalActivityByLab((current) => {
      const next = [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...event,
        },
        ...(current[labId] ?? []),
      ].slice(0, 25);
      localStorage.setItem(`labs:activity:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
  }

  function appendInviteHistory(labId: string, entry: Omit<InviteHistoryEntry, "id" | "createdAt">) {
    setInviteHistoryByLab((current) => {
      const next = [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...entry,
        },
        ...(current[labId] ?? []),
      ].slice(0, 25);
      localStorage.setItem(`labs:invite-history:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
  }

  function appendRoleHistory(labId: string, entry: Omit<RoleHistoryEntry, "id" | "createdAt">) {
    setRoleHistoryByLab((current) => {
      const next = [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...entry,
        },
        ...(current[labId] ?? []),
      ].slice(0, 40);
      localStorage.setItem(`labs:role-history:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
  }

  function appendAnnouncement(labId: string, entry: Omit<AnnouncementEntry, "id" | "createdAt">) {
    setAnnouncementsByLab((current) => {
      const next = [
        { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...entry },
        ...(current[labId] ?? []),
      ].slice(0, 60);
      localStorage.setItem(`labs:announcements:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
  }

  function appendSharedTask(labId: string, entry: Omit<SharedTaskEntry, "id" | "createdAt" | "completedAt">) {
    setSharedTasksByLab((current) => {
      const next = [
        { id: crypto.randomUUID(), createdAt: new Date().toISOString(), completedAt: null, ...entry },
        ...(current[labId] ?? []),
      ].slice(0, 120);
      localStorage.setItem(`labs:shared-tasks:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
  }

  function updateSharedTask(labId: string, taskId: string, updater: (task: SharedTaskEntry) => SharedTaskEntry) {
    setSharedTasksByLab((current) => {
      const source = current[labId] ?? readStoredEvents<SharedTaskEntry>(`labs:shared-tasks:${labId}`);
      const next = source.map((task) => (task.id === taskId ? updater(task) : task));
      localStorage.setItem(`labs:shared-tasks:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
  }

  function removeSharedTask(labId: string, taskId: string) {
    setSharedTasksByLab((current) => {
      const source = current[labId] ?? readStoredEvents<SharedTaskEntry>(`labs:shared-tasks:${labId}`);
      const next = source.filter((task) => task.id !== taskId);
      localStorage.setItem(`labs:shared-tasks:${labId}`, JSON.stringify(next));
      return { ...current, [labId]: next };
    });
    setSharedTaskEditById((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function startSharedTaskEdit(task: SharedTaskEntry) {
    setSharedTaskEditById((current) => ({
      ...current,
      [task.id]: {
        title: task.title,
        details: task.details,
      },
    }));
  }

  function cancelSharedTaskEdit(taskId: string) {
    setSharedTaskEditById((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function saveManagerProfile(labId: string, memberId: string, profile: ManagerMemberProfile) {
    setManagerProfileByLab((current) => {
      const nextForLab = { ...(current[labId] ?? {}), [memberId]: profile };
      const next = { ...current, [labId]: nextForLab };
      const serialized = Object.entries(nextForLab);
      localStorage.setItem(`labs:member-profile:${labId}`, JSON.stringify(serialized));
      return next;
    });
  }

  function runAction(
    key: string,
    action: (formData: FormData) => Promise<unknown>,
    formData: FormData,
    successMessage: string,
    onSuccess?: () => void,
    onError?: () => void,
  ) {
    setBusyKey(key);

    startTransition(() => {
      void action(formData)
        .then(() => {
          toast.success(successMessage);
          onSuccess?.();
          router.refresh();
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Something went wrong.");
          onError?.();
        })
        .finally(() => {
          setBusyKey((current) => (current === key ? null : current));
        });
    });
  }

  function getStoredOpsTab(labId: string): LabHubSection {
    if (typeof window === "undefined") return "announcements";
    const raw = window.localStorage.getItem(`${OPS_TAB_STORAGE_PREFIX}${labId}`);
    if (!raw) return "announcements";
    if (
      raw === "reagents" ||
      raw === "chat" ||
      raw === "announcements" ||
      raw === "inspection_tasks" ||
      raw === "general_tasks" ||
      raw === "equipment_booking"
    ) {
      return raw;
    }
    return "announcements";
  }

  function getActiveOpsTab(labId: string): LabHubSection {
    return opsTabByLab[labId] ?? normalizedInitialPanel ?? getStoredOpsTab(labId);
  }

  function setOpsTab(labId: string, section: LabHubSection) {
    setOpsTabByLab((current) => ({ ...current, [labId]: section }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${OPS_TAB_STORAGE_PREFIX}${labId}`, section);
    }
  }

  function getOpsHubId(labId: string) {
    return `lab-${labId}-ops-hub`;
  }

  function getOpsPanelId(labId: string, section: LabHubSection) {
    return `lab-${labId}-ops-panel-${section}`;
  }

  function openOpsSection(labId: string, section: LabHubSection) {
    setOpsTab(labId, section);
    const pulseKey = `${labId}:${section}`;
    setOpsPanelPulseKey(pulseKey);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const panel = document.getElementById(getOpsPanelId(labId, section));
        const fallback = document.getElementById(getOpsHubId(labId));
        const target = panel ?? fallback;
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      window.setTimeout(() => {
        setOpsPanelPulseKey((current) => (current === pulseKey ? null : current));
      }, 700);
    }
  }

  function toggleAdvancedPanel(labId: string, section: LabHubSection) {
    setAdvancedPanelByLab((current) => ({
      ...current,
      [labId]: {
        ...(current[labId] ?? {}),
        [section]: !(current[labId]?.[section] ?? false),
      },
    }));
  }

  function isAdvancedPanelOpen(labId: string, section: LabHubSection) {
    return advancedPanelByLab[labId]?.[section] ?? false;
  }

  function getTeamTargetId(labId: string, target: "members" | "policies") {
    return `lab-${labId}-team-${target}`;
  }

  function getTeamDetailsId(labId: string) {
    return `lab-${labId}-team-policies`;
  }

  function focusTeamTarget(labId: string, target: "members" | "policies") {
    setOpenTeamPoliciesByLab((current) => ({ ...current, [labId]: true }));
    const targetId = getTeamTargetId(labId, target);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const details = document.getElementById(getTeamDetailsId(labId));
        if (details instanceof HTMLDetailsElement) {
          details.open = true;
        }
        const element = document.getElementById(targetId) as HTMLElement | null;
        if (!element) {
          toast.error("Could not open that section. Try setting the target lab active first.");
          return;
        }
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        element.focus();
        toast.success(target === "members" ? "Opened member invite section." : "Opened policy and role section.");
      });
    }
  }

  const hasActiveLab = Boolean(effectiveActiveLabId);
  const manageableLabs = workspaces.filter(
    (workspace) =>
      canManageLabMembers(workspace.membership.role) || canManageLabPolicies(workspace.membership.role),
  );
  const defaultTeamTargetLabId =
    manageableLabs.find((workspace) => workspace.membership.lab.id === effectiveActiveLabId)?.membership.lab.id ??
    manageableLabs[0]?.membership.lab.id ??
    null;
  const resolvedTeamTargetLabId =
    teamTargetLabId && manageableLabs.some((workspace) => workspace.membership.lab.id === teamTargetLabId)
      ? teamTargetLabId
      : defaultTeamTargetLabId;
  const resolvedTeamTargetLab = manageableLabs.find(
    (workspace) => workspace.membership.lab.id === resolvedTeamTargetLabId,
  );
  const targetLabNeedsActivation =
    Boolean(resolvedTeamTargetLabId) && effectiveActiveLabId !== resolvedTeamTargetLabId;
  const canRunMemberAction = resolvedTeamTargetLab ? canManageLabMembers(resolvedTeamTargetLab.membership.role) : false;
  const canRunPolicyAction = resolvedTeamTargetLab ? canManageLabPolicies(resolvedTeamTargetLab.membership.role) : false;
  const canViewSyncStatus = resolvedTeamTargetLab ? roleRank(resolvedTeamTargetLab.membership.role) >= 2 : false;
  const syncStatus = resolvedTeamTargetLabId ? syncStatusByLab[resolvedTeamTargetLabId] : undefined;

  return (
    <div className="page-shell">
      <section className="section-card card-density-comfy">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lab operations hub</h1>
              <HelpHint text="Start daily lab work from one place." />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Open reagents, chat, announcements, shared tasks, and equipment booking first. Settings stay available below.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            {workspaces.length} lab{workspaces.length === 1 ? "" : "s"} available
          </div>
        </div>

        {shellWarning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {shellWarning}
          </div>
        ) : null}
      </section>

      <section className="section-card card-density-comfy">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Daily operations</h2>
          <HelpHint text="Quick links to the core shared lab workflows." />
        </div>
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${hasActiveLab ? "" : "opacity-60"}`}>
          {LAB_HOME_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon;
            const isActiveShortcut =
              effectiveActiveLabId ? shortcut.key === getActiveOpsTab(effectiveActiveLabId) : shortcut.key === "announcements";
            return (
              <Card
                key={shortcut.title}
                role="button"
                tabIndex={hasActiveLab ? 0 : -1}
                onClick={() => {
                  if (!effectiveActiveLabId) {
                    toast.info("Switch to a lab to use shared operations.");
                    return;
                  }
                  openOpsSection(effectiveActiveLabId, shortcut.key);
                }}
                onKeyDown={(event) => {
                  if (!hasActiveLab) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (!effectiveActiveLabId) return;
                  openOpsSection(effectiveActiveLabId, shortcut.key);
                }}
                className={`border-slate-200/80 bg-white/90 shadow-none transition-all duration-200 ${isActiveShortcut ? "ring-2 ring-cyan-200" : ""} ${hasActiveLab ? "cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/40" : ""}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-cyan-700" />
                    {shortcut.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600">{shortcut.description}</p>
                  <Button
                    type="button"
                    size="default"
                    variant={isActiveShortcut ? "default" : "outline"}
                    className="h-10 w-full justify-center"
                    disabled={!hasActiveLab}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!effectiveActiveLabId) {
                        toast.info("Switch to a lab to use shared operations.");
                        return;
                      }
                      openOpsSection(effectiveActiveLabId, shortcut.key);
                    }}
                  >
                    {hasActiveLab ? shortcut.actionLabel : "Switch to lab to use"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="section-card card-density-comfy">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Team & policies</h2>
          <HelpHint text="Member invitations, roles, and sharing policy controls." />
        </div>
      <details className="rounded-2xl border border-slate-200/80 bg-white/85 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Open team and policy controls</summary>
        <p className="mt-1 text-sm text-slate-600">Manage lab setup, invitations, roles, and sharing policies.</p>
        <div className="mt-3 space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Target lab</span>
            <select
              value={resolvedTeamTargetLabId ?? ""}
              onChange={(event) => {
                setTeamTargetLabId(event.target.value || null);
                setPendingTeamTarget(null);
              }}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none"
            >
              {manageableLabs.length === 0 ? (
                <option value="">No manageable labs available</option>
              ) : (
                manageableLabs.map((workspace) => (
                  <option key={`team-target-${workspace.membership.lab.id}`} value={workspace.membership.lab.id}>
                    {workspace.membership.lab.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!resolvedTeamTargetLabId || !canRunMemberAction}
            onClick={() => {
              if (!resolvedTeamTargetLabId) {
                toast.error("Select a target lab first.");
                return;
              }
              if (effectiveActiveLabId !== resolvedTeamTargetLabId) {
                setPendingTeamTarget({ labId: resolvedTeamTargetLabId, target: "members" });
                toast.info("Set target as active, then we will open member invite.");
                return;
              }
              focusTeamTarget(resolvedTeamTargetLabId, "members");
            }}
          >
            Add or invite members
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!resolvedTeamTargetLabId || !canRunPolicyAction}
            onClick={() => {
              if (!resolvedTeamTargetLabId) {
                toast.error("Select a target lab first.");
                return;
              }
              if (effectiveActiveLabId !== resolvedTeamTargetLabId) {
                setPendingTeamTarget({ labId: resolvedTeamTargetLabId, target: "policies" });
                toast.info("Set target as active, then we will open policy and role controls.");
                return;
              }
              focusTeamTarget(resolvedTeamTargetLabId, "policies");
            }}
          >
            Edit roles and policies
          </Button>
          {targetLabNeedsActivation && resolvedTeamTargetLabId ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPendingActiveLabId(resolvedTeamTargetLabId);
                const formData = new FormData();
                formData.set("lab_id", resolvedTeamTargetLabId);
                runAction(
                  `active-${resolvedTeamTargetLabId}`,
                  setActiveLabContext,
                  formData,
                  `${resolvedTeamTargetLab?.membership.lab.name ?? "Target lab"} is now active.`,
                  () => {
                    setPendingActiveLabId(resolvedTeamTargetLabId);
                    if (pendingTeamTarget?.labId === resolvedTeamTargetLabId) {
                      focusTeamTarget(resolvedTeamTargetLabId, pendingTeamTarget.target);
                      setPendingTeamTarget(null);
                    }
                  },
                  () => {
                    toast.error("Could not set target lab as active.");
                  },
                );
              }}
            >
              Set target as active
            </Button>
          ) : null}
          </div>
          {!resolvedTeamTargetLabId ? (
            <p className="text-xs text-slate-600">Select a target lab to enable team and policy actions.</p>
          ) : null}
          {resolvedTeamTargetLabId && (!canRunMemberAction || !canRunPolicyAction) ? (
            <p className="text-xs text-slate-600">
              {canRunMemberAction && !canRunPolicyAction
                ? "You can invite members for this lab, but policy editing requires higher access."
                : !canRunMemberAction && canRunPolicyAction
                  ? "You can edit policies for this lab, but member invites require manager/admin member access."
                  : "You do not have team or policy management access for this lab."}
            </p>
          ) : null}
        </div>
        {canViewSyncStatus && resolvedTeamTargetLabId ? (
          <Card className="mt-3 border-white/80 bg-white/85 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inventory sync status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-700">
                Last sync: <span className="font-medium">{formatSyncTimestamp(syncStatus?.lastSyncAt ?? null)}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Fetched</p>
                  <p className="text-sm font-semibold text-slate-900">{syncStatus?.fetched ?? "N/A"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Matched</p>
                  <p className="text-sm font-semibold text-slate-900">{syncStatus?.matched ?? "N/A"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Inserted</p>
                  <p className="text-sm font-semibold text-slate-900">{syncStatus?.inserted ?? "N/A"}</p>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                {syncStatus?.hint ?? "Sync summary is not available yet for this lab."}
              </p>
              <p className="text-xs text-slate-600">
                Manual check: run <code>node scripts/quartzy_sync_orders.mjs --dry-run</code> (or <code>--apply</code>) and review cron/job logs for summary output.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card className="mt-3 border-white/80 bg-white/85 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-cyan-700" />
              Create a lab
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 lg:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                runAction(
                  "create-lab",
                  createLab,
                  new FormData(event.currentTarget),
                  "Lab workspace created.",
                );
              }}
            >
            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Lab name</span>
              <Input name="name" placeholder="Neurobehavior Core" required />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Slug</span>
              <Input name="slug" placeholder="neurobehavior-core" />
            </label>

            <label className="space-y-2 text-sm text-slate-700 lg:col-span-2">
              <span className="font-medium">Description</span>
              <Textarea
                name="description"
                placeholder="What this lab shares, who it supports, and what should stay private."
                rows={3}
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Timezone</span>
              <Input name="timezone" defaultValue="America/Los_Angeles" />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Shared template editing</span>
              <select
                name="shared_template_edit_policy"
                defaultValue="manager_controlled"
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"
              >
                <option value="manager_controlled">{EDIT_POLICY_LABELS.manager_controlled}</option>
                <option value="open_edit">{EDIT_POLICY_LABELS.open_edit}</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Shared protocol editing</span>
              <select
                name="shared_protocol_edit_policy"
                defaultValue="manager_controlled"
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"
              >
                <option value="manager_controlled">{EDIT_POLICY_LABELS.manager_controlled}</option>
                <option value="open_edit">{EDIT_POLICY_LABELS.open_edit}</option>
              </select>
            </label>

              <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <p>Owner role</p>
                  <HelpHint text="You are added as the first admin when you create a lab." />
                </div>
                <Button type="submit" disabled={busyKey === "create-lab"}>
                  {busyKey === "create-lab" ? "Creating..." : "Create lab"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </details>
      </section>

      {workspaces.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white/75">
          <CardContent className="flex flex-col gap-3 p-6 text-sm text-slate-600">
            <p className="font-medium text-slate-900">No labs yet.</p>
            <div className="flex items-center gap-1.5">
              <p>Create one to invite members.</p>
              <HelpHint text="Labs keep member roles and shared records in one place." />
            </div>
          </CardContent>
        </Card>
      ) : (
        workspaces.map((workspace) => {
          const isSelected = effectiveActiveLabId === workspace.membership.lab.id;
          const canManageMembers = canManageLabMembers(workspace.membership.role);
          const canManagePolicies = canManageLabPolicies(workspace.membership.role);
          const canDeactivate = canDeactivateLabMembers(workspace.membership.role);
          const requiresActiveLab = !isSelected;
          const activityEntries = getActivityEntries(workspace.membership.lab.id);
          const inviteEntries = getInviteEntries(workspace.membership.lab.id);
          const roleHistoryEntries = getRoleHistoryEntries(workspace.membership.lab.id);
          const announcementEntries = safeArray(getAnnouncementEntries(workspace.membership.lab.id));
          const sharedTaskEntries = safeArray(getSharedTaskEntries(workspace.membership.lab.id));
          const inspectionTasks = sharedTaskEntries.filter((task) => task.listType === "inspection");
          const generalTasks = sharedTaskEntries.filter((task) => task.listType === "general");
          const activeMembers = safeArray(workspace.members).filter((member) => member.is_active);
          const activeOpsTab = getActiveOpsTab(workspace.membership.lab.id);
          const showAdvanced = isAdvancedPanelOpen(workspace.membership.lab.id, activeOpsTab);
          const usesEmbeddedSurface =
            activeOpsTab === "reagents"
            || activeOpsTab === "chat"
            || activeOpsTab === "equipment_booking";

          return (
            <Card
              key={workspace.membership.lab.id}
              id={`lab-${workspace.membership.lab.id}`}
              className={`border-white/80 bg-white/85 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] ${
                isSelected ? "ring-2 ring-cyan-200" : ""
              }`}
            >
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{workspace.membership.lab.name}</CardTitle>
                      <Badge variant="secondary">{ROLE_LABELS[workspace.membership.role]}</Badge>
                      <Badge variant="outline">Private + Lab Shared</Badge>
                      {effectiveActiveLabId === workspace.membership.lab.id ? (
                        <Badge className="bg-cyan-600 text-white">Active lab</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {workspace.membership.lab.description || "No lab description yet."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">Visibility boundary</p>
                      <HelpHint text="Private records stay personal. Shared records follow this lab's rules." />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant={effectiveActiveLabId === workspace.membership.lab.id ? "secondary" : "outline"}
                    disabled={busyKey === `active-${workspace.membership.lab.id}`}
                    onClick={() => {
                      setPendingActiveLabId(workspace.membership.lab.id);
                      const formData = new FormData();
                      formData.set("lab_id", workspace.membership.lab.id);
                      runAction(
                        `active-${workspace.membership.lab.id}`,
                        setActiveLabContext,
                        formData,
                        `${workspace.membership.lab.name} is now active.`,
                        () => setPendingActiveLabId(workspace.membership.lab.id),
                        () => setPendingActiveLabId(null),
                      );
                    }}
                  >
                    {effectiveActiveLabId === workspace.membership.lab.id ? "Active lab" : "Set as active"}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={canManageMembers ? "secondary" : "outline"}>
                    {canManageMembers ? "Can invite + edit members" : "Member list view-only"}
                  </Badge>
                  <Badge variant={canManagePolicies ? "secondary" : "outline"}>
                    {canManagePolicies ? "Can edit policies" : "Policy view-only"}
                  </Badge>
                  <Badge variant={canDeactivate ? "secondary" : "outline"}>
                    {canDeactivate ? "Can deactivate members" : "No deactivation access"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {isSelected ? (
                <section
                  id={getOpsHubId(workspace.membership.lab.id)}
                  className="space-y-4 rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-slate-900">Operations hub</h3>
                        <HelpHint text="Shared announcements and tasks for this lab." />
                      </div>
                      <p className="text-xs text-slate-600">Inspection workflows and general team tasks.</p>
                    </div>
                  </div>

                  <div
                    className={
                      usesEmbeddedSurface
                        ? "min-w-0 space-y-2 overflow-x-hidden"
                        : "rounded-2xl border border-slate-200 bg-white p-4"
                    }
                    role="tabpanel"
                    id={getOpsPanelId(workspace.membership.lab.id, activeOpsTab)}
                  >
                    {usesEmbeddedSurface ? null : (
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{HUB_SECTION_LABELS[activeOpsTab]}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAdvancedPanel(workspace.membership.lab.id, activeOpsTab)}
                        >
                          {showAdvanced ? "Hide advanced" : "Show advanced"}
                        </Button>
                      </div>
                    )}

                    {activeOpsTab === "reagents" ? (
                      <div
                        id={getOpsPanelId(workspace.membership.lab.id, "reagents")}
                        className={cn(
                          "min-w-0 overflow-x-hidden",
                          opsPanelPulseKey === `${workspace.membership.lab.id}:reagents`
                            ? "rounded-xl ring-2 ring-cyan-200/70 transition-all duration-200"
                            : "",
                        )}
                      >
                        {operationsReagentsPanel ? operationsReagentsPanel : (
                          <p className="text-sm text-slate-600">Set this lab as active to load reagent operations.</p>
                        )}
                      </div>
                    ) : null}

                    {activeOpsTab === "chat" ? (
                      <div
                        id={getOpsPanelId(workspace.membership.lab.id, "chat")}
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:chat` ? "rounded-xl ring-2 ring-cyan-200/70 transition-all duration-200" : ""}
                      >
                        {labChatPanel ? labChatPanel : (
                          <p className="text-sm text-slate-600">Set this lab as active to load lab chat.</p>
                        )}
                      </div>
                    ) : null}

                    {activeOpsTab === "announcements" ? (
                      <div
                        id={getOpsPanelId(workspace.membership.lab.id, "announcements")}
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:announcements` ? "space-y-3 rounded-xl ring-2 ring-cyan-200/70 transition-all duration-200" : "space-y-3"}
                      >
                        <form
                          className="grid max-w-2xl gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const typeRaw = String(formData.get("announcement_type") ?? "general");
                            const title = String(formData.get("title") ?? "").trim();
                            const body = String(formData.get("body") ?? "").trim();
                            if (!title || !body) return;
                            appendAnnouncement(workspace.membership.lab.id, {
                              type: typeRaw === "inspection" ? "inspection" : "general",
                              title,
                              body,
                              author: "You",
                            });
                            event.currentTarget.reset();
                          }}
                        >
                          {showAdvanced ? (
                            <select
                              name="announcement_type"
                              defaultValue="general"
                              disabled={!canManageMembers || requiresActiveLab}
                              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="inspection">Inspection notice</option>
                              <option value="general">General notice</option>
                            </select>
                          ) : (
                            <input type="hidden" name="announcement_type" value="general" />
                          )}
                          <Input
                            name="title"
                            placeholder="Announcement title"
                            disabled={!canManageMembers || requiresActiveLab}
                            required
                          />
                          <Textarea
                            name="body"
                            rows={2}
                            placeholder="Share a lab update."
                            disabled={!canManageMembers || requiresActiveLab}
                            required
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            className="w-full sm:w-fit"
                            disabled={!canManageMembers || requiresActiveLab}
                          >
                            Post announcement
                          </Button>
                        </form>
                        <div className="space-y-2">
                          {announcementEntries.length === 0 ? (
                            <p className="text-sm text-slate-500">No announcements yet.</p>
                          ) : (
                            (showAdvanced ? announcementEntries : announcementEntries.slice(0, 5)).map((entry) => (
                              <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-medium text-slate-900">{entry.title}</p>
                                  <Badge variant={entry.type === "inspection" ? "secondary" : "outline"}>
                                    {entry.type === "inspection" ? "Inspection" : "General"}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-slate-700">{entry.body}</p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {entry.author} · {formatRelativeTime(entry.createdAt)}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}

                    {activeOpsTab === "inspection_tasks" ? (
                      <div
                        id={getOpsPanelId(workspace.membership.lab.id, "inspection_tasks")}
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:inspection_tasks` ? "space-y-3 rounded-xl ring-2 ring-cyan-200/70 transition-all duration-200" : "space-y-3"}
                      >
                        <form
                          className="grid max-w-2xl gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const title = String(formData.get("title") ?? "").trim();
                            const details = String(formData.get("details") ?? "").trim();
                            const assigneeMemberIdRaw = String(formData.get("assignee_member_id") ?? "").trim();
                            const assigneeMember = activeMembers.find((member) => member.id === assigneeMemberIdRaw);
                            if (!title) return;
                            appendSharedTask(workspace.membership.lab.id, {
                              listType: "inspection",
                              title,
                              details,
                              assigneeMemberId: assigneeMember?.id ?? null,
                              assigneeLabel: assigneeMember ? getMemberPrimaryLabel(assigneeMember) : "Unassigned",
                              done: false,
                              createdBy: "You",
                            });
                            event.currentTarget.reset();
                          }}
                        >
                          <Input
                            name="title"
                            placeholder="Add inspection task"
                            disabled={!canManageMembers || requiresActiveLab}
                            required
                          />
                          {showAdvanced ? (
                            <>
                              <Input
                                name="details"
                                placeholder="Task details"
                                disabled={!canManageMembers || requiresActiveLab}
                              />
                              <select
                                name="assignee_member_id"
                                defaultValue=""
                                disabled={!canManageMembers || requiresActiveLab}
                                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="">Unassigned</option>
                                {activeMembers.map((member) => (
                                  <option key={`inspect-assignee-${member.id}`} value={member.id}>
                                    {getMemberPrimaryLabel(member)}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : null}
                          <Button type="submit" variant="outline" className="w-full sm:w-fit" disabled={!canManageMembers || requiresActiveLab}>
                            Add inspection task
                          </Button>
                        </form>
                        <div className="space-y-2">
                          {inspectionTasks.length === 0 ? (
                            <p className="text-sm text-slate-500">No shared inspection tasks yet.</p>
                          ) : (
                            (showAdvanced ? inspectionTasks : inspectionTasks.slice(0, 6)).map((task) => (
                              <div key={task.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                {sharedTaskEditById[task.id] ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={sharedTaskEditById[task.id].title}
                                      onChange={(event) =>
                                        setSharedTaskEditById((current) => ({
                                          ...current,
                                          [task.id]: {
                                            ...(current[task.id] ?? { title: task.title, details: task.details }),
                                            title: event.target.value,
                                          },
                                        }))
                                      }
                                      disabled={!canManageMembers || requiresActiveLab}
                                    />
                                    <Textarea
                                      rows={2}
                                      value={sharedTaskEditById[task.id].details}
                                      onChange={(event) =>
                                        setSharedTaskEditById((current) => ({
                                          ...current,
                                          [task.id]: {
                                            ...(current[task.id] ?? { title: task.title, details: task.details }),
                                            details: event.target.value,
                                          },
                                        }))
                                      }
                                      disabled={!canManageMembers || requiresActiveLab}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className={`text-sm font-medium ${task.done ? "text-slate-500 line-through" : "text-slate-900"}`}>
                                        {task.title}
                                      </p>
                                      {task.details ? <p className="mt-1 text-xs text-slate-600">{task.details}</p> : null}
                                    </div>
                                    <Badge variant={task.done ? "secondary" : "outline"}>{task.done ? "Done" : "Open"}</Badge>
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={task.assigneeMemberId ?? ""}
                                    onChange={(event) => {
                                      const assigneeMemberIdRaw = event.target.value;
                                      const assigneeMember = activeMembers.find((member) => member.id === assigneeMemberIdRaw);
                                      updateSharedTask(workspace.membership.lab.id, task.id, (current) => ({
                                        ...current,
                                        assigneeMemberId: assigneeMember?.id ?? null,
                                        assigneeLabel: assigneeMember ? getMemberPrimaryLabel(assigneeMember) : "Unassigned",
                                      }));
                                    }}
                                    disabled={!canManageMembers || requiresActiveLab}
                                    className="h-9 min-w-40 rounded-md border border-input bg-white px-3 text-xs shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="">Unassigned</option>
                                    {activeMembers.map((member) => (
                                      <option key={`inspect-edit-assignee-${task.id}-${member.id}`} value={member.id}>
                                        {getMemberPrimaryLabel(member)}
                                      </option>
                                    ))}
                                  </select>
                                  {sharedTaskEditById[task.id] ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab || !sharedTaskEditById[task.id].title.trim()}
                                        onClick={() => {
                                          const draft = sharedTaskEditById[task.id];
                                          updateSharedTask(workspace.membership.lab.id, task.id, (current) => ({
                                            ...current,
                                            title: draft.title.trim(),
                                            details: draft.details.trim(),
                                          }));
                                          cancelSharedTaskEdit(task.id);
                                        }}
                                      >
                                        Save
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" onClick={() => cancelSharedTaskEdit(task.id)}>
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab}
                                        onClick={() => startSharedTaskEdit(task)}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab}
                                        onClick={() => {
                                          updateSharedTask(workspace.membership.lab.id, task.id, (current) => ({
                                            ...current,
                                            done: !current.done,
                                            completedAt: !current.done ? new Date().toISOString() : null,
                                          }));
                                        }}
                                      >
                                        {task.done ? "Mark open" : "Mark done"}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab}
                                        onClick={() => removeSharedTask(workspace.membership.lab.id, task.id)}
                                      >
                                        Delete
                                      </Button>
                                    </>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500">{task.assigneeLabel} · {formatRelativeTime(task.createdAt)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}

                    {activeOpsTab === "general_tasks" ? (
                      <div
                        id={getOpsPanelId(workspace.membership.lab.id, "general_tasks")}
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:general_tasks` ? "space-y-3 rounded-xl ring-2 ring-cyan-200/70 transition-all duration-200" : "space-y-3"}
                      >
                        <form
                          className="grid max-w-2xl gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const title = String(formData.get("title") ?? "").trim();
                            const details = String(formData.get("details") ?? "").trim();
                            const assigneeMemberIdRaw = String(formData.get("assignee_member_id") ?? "").trim();
                            const assigneeMember = activeMembers.find((member) => member.id === assigneeMemberIdRaw);
                            if (!title) return;
                            appendSharedTask(workspace.membership.lab.id, {
                              listType: "general",
                              title,
                              details,
                              assigneeMemberId: assigneeMember?.id ?? null,
                              assigneeLabel: assigneeMember ? getMemberPrimaryLabel(assigneeMember) : "Unassigned",
                              done: false,
                              createdBy: "You",
                            });
                            event.currentTarget.reset();
                          }}
                        >
                          <Input
                            name="title"
                            placeholder="Add shared task"
                            disabled={!canManageMembers || requiresActiveLab}
                            required
                          />
                          {showAdvanced ? (
                            <>
                              <Input
                                name="details"
                                placeholder="Task details"
                                disabled={!canManageMembers || requiresActiveLab}
                              />
                              <select
                                name="assignee_member_id"
                                defaultValue=""
                                disabled={!canManageMembers || requiresActiveLab}
                                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="">Unassigned</option>
                                {activeMembers.map((member) => (
                                  <option key={`general-assignee-${member.id}`} value={member.id}>
                                    {getMemberPrimaryLabel(member)}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : null}
                          <Button type="submit" variant="outline" className="w-full sm:w-fit" disabled={!canManageMembers || requiresActiveLab}>
                            Add general task
                          </Button>
                        </form>
                        <div className="space-y-2">
                          {generalTasks.length === 0 ? (
                            <p className="text-sm text-slate-500">No shared general tasks yet.</p>
                          ) : (
                            (showAdvanced ? generalTasks : generalTasks.slice(0, 6)).map((task) => (
                              <div key={task.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                {sharedTaskEditById[task.id] ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={sharedTaskEditById[task.id].title}
                                      onChange={(event) =>
                                        setSharedTaskEditById((current) => ({
                                          ...current,
                                          [task.id]: {
                                            ...(current[task.id] ?? { title: task.title, details: task.details }),
                                            title: event.target.value,
                                          },
                                        }))
                                      }
                                      disabled={!canManageMembers || requiresActiveLab}
                                    />
                                    <Textarea
                                      rows={2}
                                      value={sharedTaskEditById[task.id].details}
                                      onChange={(event) =>
                                        setSharedTaskEditById((current) => ({
                                          ...current,
                                          [task.id]: {
                                            ...(current[task.id] ?? { title: task.title, details: task.details }),
                                            details: event.target.value,
                                          },
                                        }))
                                      }
                                      disabled={!canManageMembers || requiresActiveLab}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className={`text-sm font-medium ${task.done ? "text-slate-500 line-through" : "text-slate-900"}`}>
                                        {task.title}
                                      </p>
                                      {task.details ? <p className="mt-1 text-xs text-slate-600">{task.details}</p> : null}
                                    </div>
                                    <Badge variant={task.done ? "secondary" : "outline"}>{task.done ? "Done" : "Open"}</Badge>
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={task.assigneeMemberId ?? ""}
                                    onChange={(event) => {
                                      const assigneeMemberIdRaw = event.target.value;
                                      const assigneeMember = activeMembers.find((member) => member.id === assigneeMemberIdRaw);
                                      updateSharedTask(workspace.membership.lab.id, task.id, (current) => ({
                                        ...current,
                                        assigneeMemberId: assigneeMember?.id ?? null,
                                        assigneeLabel: assigneeMember ? getMemberPrimaryLabel(assigneeMember) : "Unassigned",
                                      }));
                                    }}
                                    disabled={!canManageMembers || requiresActiveLab}
                                    className="h-9 min-w-40 rounded-md border border-input bg-white px-3 text-xs shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="">Unassigned</option>
                                    {activeMembers.map((member) => (
                                      <option key={`general-edit-assignee-${task.id}-${member.id}`} value={member.id}>
                                        {getMemberPrimaryLabel(member)}
                                      </option>
                                    ))}
                                  </select>
                                  {sharedTaskEditById[task.id] ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab || !sharedTaskEditById[task.id].title.trim()}
                                        onClick={() => {
                                          const draft = sharedTaskEditById[task.id];
                                          updateSharedTask(workspace.membership.lab.id, task.id, (current) => ({
                                            ...current,
                                            title: draft.title.trim(),
                                            details: draft.details.trim(),
                                          }));
                                          cancelSharedTaskEdit(task.id);
                                        }}
                                      >
                                        Save
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" onClick={() => cancelSharedTaskEdit(task.id)}>
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab}
                                        onClick={() => startSharedTaskEdit(task)}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab}
                                        onClick={() => {
                                          updateSharedTask(workspace.membership.lab.id, task.id, (current) => ({
                                            ...current,
                                            done: !current.done,
                                            completedAt: !current.done ? new Date().toISOString() : null,
                                          }));
                                        }}
                                      >
                                        {task.done ? "Mark open" : "Mark done"}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!canManageMembers || requiresActiveLab}
                                        onClick={() => removeSharedTask(workspace.membership.lab.id, task.id)}
                                      >
                                        Delete
                                      </Button>
                                    </>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500">{task.assigneeLabel} · {formatRelativeTime(task.createdAt)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}

                    {activeOpsTab === "equipment_booking" ? (
                      <div
                        id={getOpsPanelId(workspace.membership.lab.id, "equipment_booking")}
                        className={cn(
                          "min-w-0 overflow-x-hidden",
                          opsPanelPulseKey === `${workspace.membership.lab.id}:equipment_booking`
                            ? "rounded-xl ring-2 ring-cyan-200/70 transition-all duration-200"
                            : "",
                        )}
                      >
                        {operationsEquipmentPanel ? operationsEquipmentPanel : (
                          <p className="text-sm text-slate-600">Set this lab as active to load equipment booking operations.</p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {(activeOpsTab === "announcements" || activeOpsTab === "inspection_tasks" || activeOpsTab === "general_tasks")
                    && (!canManageMembers || requiresActiveLab) ? (
                    <p className="text-xs text-slate-500">
                      {requiresActiveLab
                        ? "Set this lab as active before posting announcements or updating tasks."
                        : "Manager or admin role required to edit announcements and shared tasks."}
                    </p>
                  ) : null}
                </section>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                    Shared operations are hidden for non-active labs to reduce clutter. Set this lab as active to open chat,
                    announcements, shared tasks, and equipment booking.
                  </div>
                )}

                <details
                  id={getTeamDetailsId(workspace.membership.lab.id)}
                  open={openTeamPoliciesByLab[workspace.membership.lab.id] ?? false}
                  onToggle={(event) => {
                    const detailsElement = event.currentTarget as HTMLDetailsElement;
                    setOpenTeamPoliciesByLab((current) => ({
                      ...current,
                      [workspace.membership.lab.id]: detailsElement.open,
                    }));
                  }}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4"
                >
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Team & policies</summary>
                  <p className="mt-1 text-sm text-slate-600">Roles, member access, and policy controls.</p>
                  <div className="mt-4 space-y-5">
                    <form
                  id={getTeamTargetId(workspace.membership.lab.id, "policies")}
                  tabIndex={-1}
                  className="grid gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 lg:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runAction(
                      `policies-${workspace.membership.lab.id}`,
                      updateLabPolicies,
                      new FormData(event.currentTarget),
                      "Lab sharing policies updated.",
                    );
                  }}
                >
                  <input type="hidden" name="lab_id" value={workspace.membership.lab.id} />
                  <input type="hidden" name="active_lab_id" value={effectiveActiveLabId ?? ""} />

                  <label className="space-y-2 text-sm text-slate-700">
                    <span className="font-medium">Shared template edits</span>
                    <select
                      name="shared_template_edit_policy"
                      defaultValue={workspace.membership.lab.shared_template_edit_policy}
                      disabled={!canManagePolicies || featureUnavailable || requiresActiveLab}
                      className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="manager_controlled">{EDIT_POLICY_LABELS.manager_controlled}</option>
                      <option value="open_edit">{EDIT_POLICY_LABELS.open_edit}</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-slate-700">
                    <span className="font-medium">Shared protocol edits</span>
                    <select
                      name="shared_protocol_edit_policy"
                      defaultValue={workspace.membership.lab.shared_protocol_edit_policy}
                      disabled={!canManagePolicies || featureUnavailable || requiresActiveLab}
                      className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="manager_controlled">{EDIT_POLICY_LABELS.manager_controlled}</option>
                      <option value="open_edit">{EDIT_POLICY_LABELS.open_edit}</option>
                    </select>
                  </label>

                  <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <p>{canManagePolicies ? "Policy access: edit" : "Policy access: view only"}</p>
                      <HelpHint text="Managers and admins can change policy settings." />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!canManagePolicies || featureUnavailable || requiresActiveLab || busyKey === `policies-${workspace.membership.lab.id}`}
                    >
                      {busyKey === `policies-${workspace.membership.lab.id}` ? "Saving..." : "Save rules"}
                    </Button>
                  </div>
                    </form>

                    <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-slate-900">Member roles</h3>
                        <HelpHint text="Managers and admins can edit roles. Only admins can remove access." />
                      </div>
                    </div>
                    <Badge variant="outline">{workspace.members.length} member{workspace.members.length === 1 ? "" : "s"}</Badge>
                  </div>

                  {workspace.membersWarning ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {workspace.membersWarning}
                    </div>
                  ) : null}

                  <form
                    id={getTeamTargetId(workspace.membership.lab.id, "members")}
                    tabIndex={-1}
                    className="grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 md:grid-cols-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formElement = event.currentTarget;
                      const formData = new FormData(formElement);
                      const email = String(formData.get("email") ?? "").trim().toLowerCase();
                      const role = (String(formData.get("role") ?? "member") as PlatformLabRole) || "member";
                      const displayTitle = String(formData.get("display_title") ?? "").trim();
                      setLastAddDraftByLab((current) => ({
                        ...current,
                        [workspace.membership.lab.id]: {
                          email,
                          role,
                          displayTitle,
                        },
                      }));
                      appendInviteHistory(workspace.membership.lab.id, {
                        email,
                        role,
                        outcome: "submitted",
                        actor: "You",
                      });
                      setMemberAddFeedbackByLab((current) => ({
                        ...current,
                        [workspace.membership.lab.id]: {
                          tone: "success",
                          message: "Submitting member request...",
                        },
                      }));
                      setBusyKey(`add-${workspace.membership.lab.id}`);
                      startTransition(() => {
                        void addLabMemberByEmail(formData)
                          .then((result) => {
                            if (result.status === "already_member") {
                              toast.info("That person is already a lab member.");
                              appendInviteHistory(workspace.membership.lab.id, {
                                email,
                                role,
                                outcome: "already_member",
                                actor: "You",
                              });
                              setMemberAddFeedbackByLab((current) => ({
                                ...current,
                                [workspace.membership.lab.id]: {
                                  tone: "warning",
                                  message: "No change made: this user is already an active member of the lab.",
                                },
                              }));
                            } else if (result.status === "user_not_found") {
                              toast.error("No account found with that email.");
                              appendInviteHistory(workspace.membership.lab.id, {
                                email,
                                role,
                                outcome: "user_not_found",
                                actor: "You",
                              });
                              setMemberAddFeedbackByLab((current) => ({
                                ...current,
                                [workspace.membership.lab.id]: {
                                  tone: "error",
                                  message: "No BPAN account matches that email address.",
                                },
                              }));
                            } else {
                              toast.success("Member added.");
                              appendInviteHistory(workspace.membership.lab.id, {
                                email,
                                role,
                                outcome: "added",
                                actor: "You",
                              });
                              appendLocalActivity(workspace.membership.lab.id, {
                                type: "added",
                                memberLabel: email || "Lab member",
                                detail: `Added as ${role}.`,
                              });
                              setMemberAddFeedbackByLab((current) => ({
                                ...current,
                                [workspace.membership.lab.id]: {
                                  tone: "success",
                                  message: "Member added successfully.",
                                },
                              }));
                              formElement.reset();
                              setLastAddDraftByLab((current) => ({
                                ...current,
                                [workspace.membership.lab.id]: {
                                  email: "",
                                  role: "member",
                                  displayTitle: "",
                                },
                              }));
                              router.refresh();
                            }
                          })
                          .catch((error) => {
                            toast.error(error instanceof Error ? error.message : "Unable to add member.");
                            appendInviteHistory(workspace.membership.lab.id, {
                              email,
                              role,
                              outcome: "failed",
                              actor: "You",
                            });
                            setMemberAddFeedbackByLab((current) => ({
                              ...current,
                              [workspace.membership.lab.id]: {
                                tone: "error",
                                message: error instanceof Error ? error.message : "Unable to add member.",
                              },
                            }));
                          })
                          .finally(() => {
                            setBusyKey((current) => (current === `add-${workspace.membership.lab.id}` ? null : current));
                          });
                      });
                    }}
                  >
                    <input type="hidden" name="lab_id" value={workspace.membership.lab.id} />
                    <input type="hidden" name="active_lab_id" value={effectiveActiveLabId ?? ""} />
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Email</span>
                      <Input
                        name="email"
                        type="email"
                        placeholder="teammate@lab.org"
                        required
                        defaultValue={lastAddDraftByLab[workspace.membership.lab.id]?.email ?? ""}
                        disabled={!canManageMembers || workspace.membersFeatureUnavailable || requiresActiveLab || busyKey === `add-${workspace.membership.lab.id}`}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Role</span>
                      <select
                        name="role"
                        defaultValue={lastAddDraftByLab[workspace.membership.lab.id]?.role ?? "member"}
                        disabled={!canManageMembers || workspace.membersFeatureUnavailable || requiresActiveLab || busyKey === `add-${workspace.membership.lab.id}`}
                        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <div className="flex items-end">
                      <Button
                        type="submit"
                        className="w-full gap-1"
                        disabled={!canManageMembers || workspace.membersFeatureUnavailable || requiresActiveLab || busyKey === `add-${workspace.membership.lab.id}`}
                      >
                        <UserPlus className="h-4 w-4" />
                        {busyKey === `add-${workspace.membership.lab.id}` ? "Adding..." : "Add member"}
                      </Button>
                    </div>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Display name (optional)</span>
                      <Input
                        name="display_title"
                        placeholder="Behavior Specialist"
                        defaultValue={lastAddDraftByLab[workspace.membership.lab.id]?.displayTitle ?? ""}
                        disabled={!canManageMembers || workspace.membersFeatureUnavailable || requiresActiveLab || busyKey === `add-${workspace.membership.lab.id}`}
                      />
                    </label>
                  </form>
                  {memberAddFeedbackByLab[workspace.membership.lab.id] ? (
                    <div className="space-y-2">
                      <div
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          memberAddFeedbackByLab[workspace.membership.lab.id].tone === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : memberAddFeedbackByLab[workspace.membership.lab.id].tone === "warning"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-rose-200 bg-rose-50 text-rose-800"
                        }`}
                      >
                        {memberAddFeedbackByLab[workspace.membership.lab.id].message}
                      </div>
                      {memberAddFeedbackByLab[workspace.membership.lab.id].tone !== "success" &&
                      lastAddDraftByLab[workspace.membership.lab.id]?.email ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canManageMembers || workspace.membersFeatureUnavailable || requiresActiveLab || busyKey === `add-${workspace.membership.lab.id}`}
                          onClick={() => {
                            const draft = lastAddDraftByLab[workspace.membership.lab.id];
                            if (!draft?.email) return;
                            const retryData = new FormData();
                            retryData.set("lab_id", workspace.membership.lab.id);
                            retryData.set("active_lab_id", effectiveActiveLabId ?? "");
                            retryData.set("email", draft.email);
                            retryData.set("role", draft.role);
                            if (draft.displayTitle) {
                              retryData.set("display_title", draft.displayTitle);
                            }
                            setBusyKey(`add-${workspace.membership.lab.id}`);
                            startTransition(() => {
                              void addLabMemberByEmail(retryData)
                                .then((result) => {
                                  if (result.status === "added") {
                                    toast.success("Member added.");
                                    appendInviteHistory(workspace.membership.lab.id, {
                                      email: draft.email,
                                      role: draft.role,
                                      outcome: "added",
                                      actor: "You",
                                    });
                                    appendLocalActivity(workspace.membership.lab.id, {
                                      type: "added",
                                      memberLabel: draft.email,
                                      detail: `Added as ${draft.role}.`,
                                    });
                                    setMemberAddFeedbackByLab((current) => ({
                                      ...current,
                                      [workspace.membership.lab.id]: {
                                        tone: "success",
                                        message: "Member added successfully.",
                                      },
                                    }));
                                    router.refresh();
                                  } else if (result.status === "already_member") {
                                    toast.info("That person is already a lab member.");
                                    setMemberAddFeedbackByLab((current) => ({
                                      ...current,
                                      [workspace.membership.lab.id]: {
                                        tone: "warning",
                                        message: "No change made: this user is already an active member of the lab.",
                                      },
                                    }));
                                  } else {
                                    toast.error("No account found with that email.");
                                    setMemberAddFeedbackByLab((current) => ({
                                      ...current,
                                      [workspace.membership.lab.id]: {
                                        tone: "error",
                                        message: "No BPAN account matches that email address.",
                                      },
                                    }));
                                  }
                                })
                                .catch((error) => {
                                  toast.error(error instanceof Error ? error.message : "Unable to add member.");
                                  setMemberAddFeedbackByLab((current) => ({
                                    ...current,
                                    [workspace.membership.lab.id]: {
                                      tone: "error",
                                      message: error instanceof Error ? error.message : "Unable to add member.",
                                    },
                                  }));
                                })
                                .finally(() => {
                                  setBusyKey((current) => (current === `add-${workspace.membership.lab.id}` ? null : current));
                                });
                            });
                          }}
                        >
                          Retry add
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {!canManageMembers || requiresActiveLab ? (
                    <p className="text-xs text-slate-500">
                      {requiresActiveLab
                        ? "Set this lab as active before editing members or policies."
                        : "Manager or admin role required to add or edit members."}
                    </p>
                  ) : null}

                  <div className="space-y-3">
                    {workspace.members.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                        No members found yet.
                      </div>
                    ) : (
                      workspace.members.map((member) => {
                        const roleDisabled =
                          !canManageMembers || workspace.membersFeatureUnavailable || requiresActiveLab || !member.is_active;
                        const deactivateDisabled =
                          !canDeactivate ||
                          workspace.membersFeatureUnavailable ||
                          requiresActiveLab ||
                          !member.is_active ||
                          member.user_id === currentUserId;
                        const managerProfile = getManagerProfile(workspace.membership.lab.id, member.id);

                        return (
                          <div
                            key={member.id}
                            className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-4"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {getMemberPrimaryLabel(member)}
                                </p>
                                <Badge variant={member.is_active ? "secondary" : "outline"}>
                                  {member.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{member.profile?.email || "No email on profile"}</p>
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <Input
                                  value={managerProfile.focusArea}
                                  onChange={(event) =>
                                    saveManagerProfile(workspace.membership.lab.id, member.id, {
                                      ...managerProfile,
                                      focusArea: event.target.value,
                                    })
                                  }
                                  placeholder="Focus area"
                                  className="h-8 text-xs"
                                  disabled={!canManageMembers || requiresActiveLab}
                                />
                                <Input
                                  value={managerProfile.contact}
                                  onChange={(event) =>
                                    saveManagerProfile(workspace.membership.lab.id, member.id, {
                                      ...managerProfile,
                                      contact: event.target.value,
                                    })
                                  }
                                  placeholder="Contact handle"
                                  className="h-8 text-xs"
                                  disabled={!canManageMembers || requiresActiveLab}
                                />
                                <Input
                                  value={managerProfile.notes}
                                  onChange={(event) =>
                                    saveManagerProfile(workspace.membership.lab.id, member.id, {
                                      ...managerProfile,
                                      notes: event.target.value,
                                    })
                                  }
                                  placeholder="Manager note"
                                  className="h-8 text-xs"
                                  disabled={!canManageMembers || requiresActiveLab}
                                />
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 lg:items-end">
                              <form
                                className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:justify-end"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const label = getMemberPrimaryLabel(member);
                                  runAction(
                                    `name-${member.id}`,
                                    updateLabMemberDisplayName,
                                    new FormData(event.currentTarget),
                                    "Display name updated.",
                                    () => {
                                      appendLocalActivity(workspace.membership.lab.id, {
                                        type: "renamed",
                                        memberLabel: label,
                                        detail: "Updated display name.",
                                      });
                                    },
                                  );
                                }}
                              >
                                <input type="hidden" name="lab_id" value={workspace.membership.lab.id} />
                                <input type="hidden" name="active_lab_id" value={effectiveActiveLabId ?? ""} />
                                <input type="hidden" name="member_id" value={member.id} />
                                <Input
                                  name="display_title"
                                  defaultValue={member.display_title || ""}
                                  placeholder="Display name"
                                  disabled={roleDisabled}
                                  className="w-full sm:min-w-48"
                                />
                                <Button
                                  type="submit"
                                  variant="outline"
                                  disabled={roleDisabled || busyKey === `name-${member.id}`}
                                >
                                  {busyKey === `name-${member.id}` ? "Saving..." : "Save name"}
                                </Button>
                              </form>

                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <form
                                  className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const formData = new FormData(event.currentTarget);
                                    const nextRole = String(formData.get("role") ?? "member");
                                    const destructiveRoleChange =
                                      roleRank(nextRole as PlatformLabRole) < roleRank(member.role) ||
                                      (nextRole as PlatformLabRole) === "admin";
                                    if (destructiveRoleChange) {
                                      const confirmed = window.confirm(
                                        `Confirm role change for ${getMemberPrimaryLabel(member)} to ${nextRole}?`,
                                      );
                                      if (!confirmed) return;
                                    }
                                    const auditNote = roleAuditNoteByMember[member.id]?.trim();
                                    runAction(
                                      `role-${member.id}`,
                                      updateLabMemberRole,
                                      formData,
                                      "Member role updated.",
                                      () => {
                                        appendLocalActivity(workspace.membership.lab.id, {
                                          type: "role_changed",
                                          memberLabel: getMemberPrimaryLabel(member),
                                          detail: auditNote
                                            ? `Role set to ${nextRole}. Note: ${auditNote}`
                                            : `Role set to ${nextRole}.`,
                                        });
                                        appendRoleHistory(workspace.membership.lab.id, {
                                          memberLabel: getMemberPrimaryLabel(member),
                                          fromRole: member.role,
                                          toRole: nextRole as PlatformLabRole,
                                          actor: "You",
                                          note: auditNote ?? null,
                                        });
                                        setRoleAuditNoteByMember((current) => ({
                                          ...current,
                                          [member.id]: "",
                                        }));
                                      },
                                    );
                                  }}
                                >
                                  <input type="hidden" name="lab_id" value={workspace.membership.lab.id} />
                                  <input type="hidden" name="active_lab_id" value={effectiveActiveLabId ?? ""} />
                                  <input type="hidden" name="member_id" value={member.id} />
                                  <select
                                    name="role"
                                    defaultValue={member.role}
                                    disabled={roleDisabled}
                                    className="h-10 w-full min-w-36 rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                                  >
                                    <option value="member">Member</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  <Button
                                    type="submit"
                                    variant="outline"
                                    disabled={roleDisabled || busyKey === `role-${member.id}`}
                                  >
                                    {busyKey === `role-${member.id}` ? "Saving..." : "Save role"}
                                  </Button>
                                </form>
                                <Input
                                  value={roleAuditNoteByMember[member.id] ?? ""}
                                  onChange={(event) =>
                                    setRoleAuditNoteByMember((current) => ({
                                      ...current,
                                      [member.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Optional role-change audit note"
                                  className="w-full sm:min-w-56"
                                  disabled={roleDisabled}
                                />

                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const confirmed = window.confirm(
                                      `Deactivate access for ${getMemberPrimaryLabel(member)}?`,
                                    );
                                    if (!confirmed) return;
                                    runAction(
                                      `deactivate-${member.id}`,
                                      deactivateLabMember,
                                      new FormData(event.currentTarget),
                                      "Member access removed.",
                                      () => {
                                        appendLocalActivity(workspace.membership.lab.id, {
                                          type: "deactivated",
                                          memberLabel: getMemberPrimaryLabel(member),
                                          detail: "Access deactivated.",
                                        });
                                      },
                                    );
                                  }}
                                >
                                  <input type="hidden" name="lab_id" value={workspace.membership.lab.id} />
                                  <input type="hidden" name="active_lab_id" value={effectiveActiveLabId ?? ""} />
                                  <input type="hidden" name="member_id" value={member.id} />
                                  <input type="hidden" name="member_user_id" value={member.user_id} />
                                  <Button
                                    type="submit"
                                    variant="ghost"
                                    className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                    disabled={deactivateDisabled || busyKey === `deactivate-${member.id}`}
                                  >
                                    {busyKey === `deactivate-${member.id}` ? "Removing..." : "Deactivate"}
                                  </Button>
                                </form>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <details className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Activity and history</summary>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <History className="h-4 w-4 text-slate-600" />
                          <p className="text-sm font-semibold text-slate-900">Member activity feed</p>
                        </div>
                        <div className="space-y-2">
                          {activityEntries.length === 0 ? (
                            <p className="text-sm text-slate-500">No recent member activity yet.</p>
                          ) : (
                            activityEntries.map((event) => (
                              <div key={event.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <p className="text-sm font-medium text-slate-900">{event.memberLabel}</p>
                                <p className="text-xs text-slate-600">{event.detail}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(event.createdAt)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <NotebookPen className="h-4 w-4 text-slate-600" />
                          <p className="text-sm font-semibold text-slate-900">Invite/add history</p>
                        </div>
                        <div className="space-y-2">
                          {inviteEntries.length === 0 ? (
                            <p className="text-sm text-slate-500">No invite attempts yet.</p>
                          ) : (
                            inviteEntries.map((entry) => (
                              <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-medium text-slate-900">{entry.email || "Unknown email"}</p>
                                  <Badge
                                    className={
                                      entry.outcome === "submitted"
                                        ? "bg-slate-100 text-slate-800"
                                        : entry.outcome === "added"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : entry.outcome === "already_member"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-rose-100 text-rose-800"
                                    }
                                  >
                                    {entry.outcome === "already_member"
                                      ? "Already member"
                                      : entry.outcome === "user_not_found"
                                        ? "User not found"
                                      : entry.outcome === "submitted"
                                          ? "Submitted"
                                        : entry.outcome === "added"
                                          ? "Added"
                                          : "Failed"}
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-600">Requested role: {entry.role} · actor: {entry.actor || "Unknown"}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(entry.createdAt)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <History className="h-4 w-4 text-slate-600" />
                        <p className="text-sm font-semibold text-slate-900">Role history timeline</p>
                      </div>
                      <div className="space-y-2">
                        {roleHistoryEntries.length === 0 ? (
                          <p className="text-sm text-slate-500">No role changes recorded yet.</p>
                        ) : (
                          roleHistoryEntries.map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium text-slate-900">{entry.memberLabel}</p>
                                <Badge variant="outline">{entry.actor}</Badge>
                              </div>
                              <p className="text-xs text-slate-600">
                                {entry.fromRole} → {entry.toRole}
                                {entry.note ? ` · ${entry.note}` : ""}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(entry.createdAt)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </details>
                  </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
