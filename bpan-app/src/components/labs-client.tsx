"use client";

import { cloneElement, isValidElement, startTransition, useState, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ClipboardCheck,
  FlaskConical,
  History,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  addLabMemberByEmail,
  deactivateLabMember,
  updateLabMemberDisplayName,
  updateLabMemberRole,
  updateLabPolicies,
  setLabOutlookSyncOwner,
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
  labId: string;
  type: "inspection" | "general";
  title: string;
  body: string;
  createdByUserId: string | null;
  createdAt: string;
};

type SharedTaskEntry = {
  id: string;
  labId: string;
  listType: "inspection" | "general";
  title: string;
  details: string;
  assigneeMemberId: string | null;
  done: boolean;
  createdByUserId: string | null;
  createdAt: string;
  completedAt: string | null;
};

type SharedTaskEditDraft = {
  title: string;
  details: string;
};

type AnnouncementRecord = {
  id: string;
  lab_id: string;
  type: "inspection" | "general";
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type SharedTaskRecord = {
  id: string;
  lab_id: string;
  list_type: "inspection" | "general";
  title: string;
  details: string;
  assignee_member_id: string | null;
  done: boolean;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  labsAssistantPanel?: ReactNode;
  labChatPanel?: ReactNode;
  labMeetingsPanel?: ReactNode;
  initialAnnouncementsByLab?: Record<string, AnnouncementRecord[]>;
  initialSharedTasksByLab?: Record<string, SharedTaskRecord[]>;
  announcementActions: {
    createAnnouncement: (formData: FormData) => Promise<unknown>;
    deleteAnnouncement: (formData: FormData) => Promise<unknown>;
  };
  sharedTaskActions: {
    createTask: (formData: FormData) => Promise<unknown>;
    updateTask: (formData: FormData) => Promise<unknown>;
    deleteTask: (formData: FormData) => Promise<unknown>;
  };
  syncStatusByLab?: Record<string, InventorySyncStatus>;
  workspaces: LabWorkspaceRecord[];
}

type LabHubSection =
  | "reagents"
  | "chat"
  | "meetings"
  | "announcements"
  | "inspection_tasks"
  | "equipment_booking";
type LabsViewMode = "operations" | "administration";

type OperationsReagentsPanelProps = {
  inventoryEntryMode?: "default" | "add" | "search" | "chat";
  inventoryOnBack?: (() => void) | null;
};

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
    key: "announcements" as const,
    title: "Announcements",
    description: "Share inspection notices.",
    actionLabel: "Open section",
    icon: Megaphone,
  },
  {
    key: "reagents" as const,
    title: "Reagents",
    description: "Track stock and reorder needs.",
    actionLabel: "Open section",
    icon: FlaskConical,
  },
  {
    key: "equipment_booking" as const,
    title: "Equipment booking",
    description: "Book and manage equipment time.",
    actionLabel: "Open section",
    icon: CalendarClock,
  },
  {
    key: "meetings" as const,
    title: "Lab meetings",
    description: "Transcribe meetings and extract team action items.",
    actionLabel: "Open section",
    icon: NotebookPen,
  },
  {
    key: "chat" as const,
    title: "Lab chat",
    description: "Post daily lab updates.",
    actionLabel: "Open section",
    icon: MessageSquare,
  },
  {
    key: "inspection_tasks" as const,
    title: "Shared inspection tasks",
    description: "Review inspection follow-ups.",
    actionLabel: "Open section",
    icon: ClipboardCheck,
  },
] as const;

const SHORTCUT_THEME: Record<string, { active: string; idle: string; icon: string; iconBg: string }> = {
  reagents: {
    active: "border-emerald-300/70 bg-emerald-50 text-slate-900",
    idle: "border-white/80 bg-white/86 text-slate-700 hover:bg-white",
    icon: "text-emerald-700",
    iconBg: "bg-emerald-100/70",
  },
  chat: {
    active: "border-violet-300/70 bg-violet-50 text-slate-900",
    idle: "border-white/80 bg-white/86 text-slate-700 hover:bg-white",
    icon: "text-violet-700",
    iconBg: "bg-violet-100/75",
  },
  meetings: {
    active: "border-amber-300/70 bg-amber-50 text-slate-900",
    idle: "border-white/80 bg-white/86 text-slate-700 hover:bg-white",
    icon: "text-amber-700",
    iconBg: "bg-amber-100/70",
  },
  announcements: {
    active: "border-sky-300/70 bg-sky-50 text-slate-900",
    idle: "border-white/80 bg-white/86 text-slate-700 hover:bg-white",
    icon: "text-sky-700",
    iconBg: "bg-sky-100/75",
  },
  inspection_tasks: {
    active: "border-rose-300/70 bg-rose-50 text-slate-900",
    idle: "border-white/80 bg-white/86 text-slate-700 hover:bg-white",
    icon: "text-rose-700",
    iconBg: "bg-rose-100/70",
  },
  equipment_booking: {
    active: "border-indigo-300/70 bg-indigo-50 text-slate-900",
    idle: "border-white/80 bg-white/86 text-slate-700 hover:bg-white",
    icon: "text-indigo-700",
    iconBg: "bg-indigo-100/75",
  },
};

const HUB_SECTION_LABELS: Record<LabHubSection, string> = {
  reagents: "Reagents",
  chat: "Lab chat",
  meetings: "Lab meetings",
  announcements: "Announcements",
  inspection_tasks: "Shared inspection tasks",
  equipment_booking: "Equipment booking",
};

const OPS_TAB_STORAGE_PREFIX = "labs:ops-tab:";

function normalizeIncomingPanel(panel: string | null | undefined): LabHubSection | null {
  if (!panel) return null;
  const normalized = panel.trim().toLowerCase();
  if (normalized === "reagents" || normalized === "inventory") return "reagents";
  if (normalized === "chat" || normalized === "lab-chat") return "chat";
  if (normalized === "meetings" || normalized === "meeting" || normalized === "lab-meetings" || normalized === "lab_meetings") return "meetings";
  if (normalized === "announcements") return "announcements";
  if (normalized === "inspection" || normalized === "inspection-tasks" || normalized === "inspection_tasks") return "inspection_tasks";
  if (normalized === "tasks" || normalized === "general-tasks" || normalized === "general_tasks") return "meetings";
  if (normalized === "booking" || normalized === "bookings" || normalized === "equipment" || normalized === "equipment-booking" || normalized === "equipment_booking") {
    return "equipment_booking";
  }
  return null;
}

function normalizeIncomingView(panel: string | null | undefined): LabsViewMode {
  if (!panel) return "operations";
  const normalized = panel.trim().toLowerCase();
  if (
    normalized === "administration"
    || normalized === "admin"
    || normalized === "lab-administration"
    || normalized === "lab_administration"
    || normalized === "team"
  ) {
    return "administration";
  }
  return "operations";
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

function toAnnouncementEntry(entry: AnnouncementRecord): AnnouncementEntry {
  return {
    id: entry.id,
    labId: entry.lab_id,
    type: entry.type === "inspection" ? "inspection" : "general",
    title: entry.title,
    body: entry.body,
    createdByUserId: entry.created_by,
    createdAt: entry.created_at,
  };
}

function toSharedTaskEntry(entry: SharedTaskRecord): SharedTaskEntry {
  return {
    id: entry.id,
    labId: entry.lab_id,
    listType: entry.list_type === "inspection" ? "inspection" : "general",
    title: entry.title,
    details: entry.details ?? "",
    assigneeMemberId: entry.assignee_member_id,
    done: Boolean(entry.done),
    createdByUserId: entry.created_by,
    createdAt: entry.created_at,
    completedAt: entry.completed_at,
  };
}

export function LabsClient({
  currentUserId,
  shellWarning,
  featureUnavailable,
  selectedLabId,
  initialPanel = null,
  operationsReagentsPanel,
  operationsEquipmentPanel,
  labsAssistantPanel,
  labChatPanel,
  labMeetingsPanel,
  initialAnnouncementsByLab = {},
  initialSharedTasksByLab = {},
  announcementActions,
  sharedTaskActions,
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
  const [sharedTaskEditById, setSharedTaskEditById] = useState<Record<string, SharedTaskEditDraft>>({});
  const [openTeamPoliciesByLab, setOpenTeamPoliciesByLab] = useState<Record<string, boolean>>({});
  const [opsTabByLab, setOpsTabByLab] = useState<Record<string, LabHubSection>>({});
  const [advancedPanelByLab, setAdvancedPanelByLab] = useState<Record<string, Partial<Record<LabHubSection, boolean>>>>({});
  const [reagentViewByLab, setReagentViewByLab] = useState<Record<string, "chooser" | "workspace">>({});
  const [reagentEntryModeByLab, setReagentEntryModeByLab] = useState<Record<string, "default" | "add" | "search" | "chat">>({});
  const [reagentSlideDirByLab, setReagentSlideDirByLab] = useState<Record<string, "forward" | "back">>({});
  const [announcementViewByLab, setAnnouncementViewByLab] = useState<Record<string, "chooser" | "browse" | "create">>({});
  const [announcementSlideDirByLab, setAnnouncementSlideDirByLab] = useState<Record<string, "forward" | "back">>({});
  const [inspectionViewByLab, setInspectionViewByLab] = useState<Record<string, "chooser" | "board" | "create">>({});
  const [inspectionSlideDirByLab, setInspectionSlideDirByLab] = useState<Record<string, "forward" | "back">>({});
  const [selectedAnnouncementIdByLab, setSelectedAnnouncementIdByLab] = useState<Record<string, string>>({});
  const [selectedInspectionTaskIdByLab, setSelectedInspectionTaskIdByLab] = useState<Record<string, string>>({});
  const [opsPanelPulseKey, setOpsPanelPulseKey] = useState<string | null>(null);
  const effectiveActiveLabId = selectedLabId ?? workspaces[0]?.membership.lab.id ?? null;
  const labsView = normalizeIncomingView(initialPanel);
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
    return safeArray(initialAnnouncementsByLab[labId]).map(toAnnouncementEntry);
  }

  function getSharedTaskEntries(labId: string) {
    return safeArray(initialSharedTasksByLab[labId]).map(toSharedTaskEntry);
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

  function removeSharedTask(taskId: string) {
    setSharedTaskEditById((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function submitSharedTaskUpdate(
    labId: string,
    task: SharedTaskEntry,
    overrides: Partial<Pick<SharedTaskEntry, "title" | "details" | "listType" | "assigneeMemberId" | "done">>,
    successMessage = "Shared task updated.",
    onSuccess?: () => void,
  ) {
    const nextTitle = (overrides.title ?? task.title).trim();
    if (!nextTitle) return;
    const nextDetails = (overrides.details ?? task.details).trim();
    const nextListType = overrides.listType ?? task.listType;
    const nextAssigneeMemberId = overrides.assigneeMemberId ?? task.assigneeMemberId;
    const nextDone = overrides.done ?? task.done;

    runAction(
      `shared-task-update-${labId}-${task.id}`,
      sharedTaskActions.updateTask,
      withLabContext(labId, [
        ["task_id", task.id],
        ["title", nextTitle],
        ["details", nextDetails],
        ["list_type", nextListType],
        ["assignee_member_id", nextAssigneeMemberId ?? ""],
        ["done", nextDone ? "true" : "false"],
      ]),
      successMessage,
      onSuccess,
    );
  }

  function submitSharedTaskDelete(labId: string, taskId: string) {
    runAction(
      `shared-task-delete-${labId}-${taskId}`,
      sharedTaskActions.deleteTask,
      withLabContext(labId, [["task_id", taskId]]),
      "Shared task deleted.",
      () => removeSharedTask(taskId),
    );
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

  function withLabContext(labId: string, fields: Array<[string, string]>) {
    const formData = new FormData();
    formData.set("lab_id", labId);
    formData.set("active_lab_id", labId);
    for (const [key, value] of fields) {
      formData.set(key, value);
    }
    return formData;
  }

  function getActiveOpsTab(labId: string): LabHubSection {
    return opsTabByLab[labId] ?? normalizedInitialPanel ?? "announcements";
  }

  function getReagentView(labId: string) {
    return reagentViewByLab[labId] ?? "chooser";
  }

  function reagentSlideClass(labId: string) {
    return reagentSlideDirByLab[labId] === "back" ? "ops-slide-card-back" : "ops-slide-card-forward";
  }

  function getAnnouncementView(labId: string) {
    return announcementViewByLab[labId] ?? "chooser";
  }

  function announcementSlideClass(labId: string) {
    return announcementSlideDirByLab[labId] === "back" ? "ops-slide-card-back" : "ops-slide-card-forward";
  }

  function getInspectionView(labId: string) {
    return inspectionViewByLab[labId] ?? "chooser";
  }

  function inspectionSlideClass(labId: string) {
    return inspectionSlideDirByLab[labId] === "back" ? "ops-slide-card-back" : "ops-slide-card-forward";
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
    if (section === "reagents") {
      setReagentViewByLab((current) => ({ ...current, [labId]: "chooser" }));
    }
    if (section === "announcements") {
      setAnnouncementViewByLab((current) => ({ ...current, [labId]: "chooser" }));
    }
    if (section === "inspection_tasks") {
      setInspectionViewByLab((current) => ({ ...current, [labId]: "chooser" }));
    }
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

  function getTeamDetailsId(labId: string) {
    return `lab-${labId}-team-policies`;
  }

  function getTeamTargetId(labId: string, target: "members" | "policies") {
    return `lab-${labId}-team-${target}`;
  }

  const hasActiveLab = Boolean(effectiveActiveLabId);
  const visibleWorkspaces = effectiveActiveLabId
    ? workspaces.filter((workspace) => workspace.membership.lab.id === effectiveActiveLabId)
    : workspaces;
  const activeShortcutKey = effectiveActiveLabId ? getActiveOpsTab(effectiveActiveLabId) : "announcements";
  const activeShortcut = LAB_HOME_SHORTCUTS.find((item) => item.key === activeShortcutKey) ?? LAB_HOME_SHORTCUTS[0];
  const activeShortcutTheme = SHORTCUT_THEME[activeShortcut.key] ?? SHORTCUT_THEME.equipment_booking;

  function switchWorkspace(labId: string) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (labId) {
      params.set("lab_id", labId);
    } else {
      params.delete("lab_id");
    }
    const query = params.toString();
    router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }

  return (
    <div
      className="page-shell labs-native overflow-x-hidden"
    >
      <div className="flex items-center justify-end">
        <select
          value={effectiveActiveLabId ?? ""}
          onChange={(event) => switchWorkspace(event.target.value)}
          className="h-10 max-w-[13rem] rounded-lg border border-white/80 bg-white/84 px-3 text-[15px] text-slate-700 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.82)] sm:h-9 sm:max-w-[12rem] sm:px-2.5 sm:text-sm"
          aria-label="Select lab workspace"
          title={shellWarning ?? undefined}
        >
          {workspaces.map((workspace) => (
            <option key={`workspace-select-${workspace.membership.lab.id}`} value={workspace.membership.lab.id}>
              {workspace.membership.lab.name}
            </option>
          ))}
        </select>
      </div>

      {labsAssistantPanel ? (
        <section className="section-card card-density-comfy">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-slate-900 sm:text-sm">Lab AI assistant</h2>
            <HelpHint text="Ask inventory, equipment, booking, and operations questions for the active lab." />
          </div>
          {labsAssistantPanel}
        </section>
      ) : null}

      {labsView === "operations" ? (
      <section className="section-card card-density-comfy labs-shortcuts border-white/80 bg-white/82">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-slate-900 sm:text-sm">Daily operations</h2>
          <HelpHint text="Quick links to the core shared lab workflows." />
        </div>
        <div
          className={`labs-tool-strip flex flex-wrap gap-2 overflow-x-auto sm:flex-nowrap ${hasActiveLab ? "" : "opacity-60"}`}
          role="tablist"
          aria-label="Lab tools"
        >
          {LAB_HOME_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon;
            const theme = SHORTCUT_THEME[shortcut.key] ?? SHORTCUT_THEME.equipment_booking;
            const isActiveShortcut =
              effectiveActiveLabId ? shortcut.key === getActiveOpsTab(effectiveActiveLabId) : shortcut.key === "announcements";
            return (
              <button
                key={shortcut.title}
                type="button"
                role="tab"
                aria-selected={isActiveShortcut}
                disabled={!hasActiveLab}
                onClick={() => {
                  if (!effectiveActiveLabId) {
                    toast.info("Create a lab to use shared operations.");
                    return;
                  }
                  openOpsSection(effectiveActiveLabId, shortcut.key);
                }}
                className={`labs-tool-tab inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-[0_6px_16px_-12px_rgba(15,23,42,0.45)] transition ${
                  isActiveShortcut ? theme.active : theme.idle
                } ${
                  hasActiveLab ? "" : "cursor-not-allowed"
                }`}
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${theme.iconBg}`}>
                  <Icon className={`h-4 w-4 ${theme.icon}`} />
                </span>
                <span className="text-[15px] font-medium sm:text-sm">{shortcut.title}</span>
              </button>
            );
          })}
        </div>
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-xs sm:text-sm ${
            activeShortcutKey === "announcements"
              ? "border-amber-300/80 bg-amber-50/85 text-amber-950 shadow-[0_10px_24px_-18px_rgba(180,83,9,0.44)]"
              : activeShortcutTheme.active
          }`}
        >
          <span className="font-semibold">{activeShortcut.title}:</span> {activeShortcut.description}
        </div>
      </section>
      ) : null}

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
        visibleWorkspaces.map((workspace) => {
          const isSelected = effectiveActiveLabId === workspace.membership.lab.id;
          const canManageMembers = canManageLabMembers(workspace.membership.role);
          const canManagePolicies = canManageLabPolicies(workspace.membership.role);
          const canDeactivate = canDeactivateLabMembers(workspace.membership.role);
          const requiresActiveLab = false;
          const activityEntries = getActivityEntries(workspace.membership.lab.id);
          const inviteEntries = getInviteEntries(workspace.membership.lab.id);
          const roleHistoryEntries = getRoleHistoryEntries(workspace.membership.lab.id);
          const announcementEntries = safeArray(getAnnouncementEntries(workspace.membership.lab.id));
          const sharedTaskEntries = safeArray(getSharedTaskEntries(workspace.membership.lab.id));
          const inspectionTasks = sharedTaskEntries.filter((task) => task.listType === "inspection");
          const activeMembers = safeArray(workspace.members).filter((member) => member.is_active);
          const memberLabelByUserId = new Map(activeMembers.map((member) => [member.user_id, getMemberPrimaryLabel(member)]));
          const memberLabelByMembershipId = new Map(activeMembers.map((member) => [member.id, getMemberPrimaryLabel(member)]));
          const activeOpsTab = getActiveOpsTab(workspace.membership.lab.id);
          const showAdvanced = isAdvancedPanelOpen(workspace.membership.lab.id, activeOpsTab);
          const usesEmbeddedSurface =
            activeOpsTab === "reagents"
            || activeOpsTab === "chat"
            || activeOpsTab === "meetings"
            || activeOpsTab === "equipment_booking";

          return (
            <Card
              key={workspace.membership.lab.id}
              id={`lab-${workspace.membership.lab.id}`}
              className={`labs-workspace-card relative overflow-hidden border-white/80 bg-white/90 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] ${
                isSelected ? "ring-2 ring-primary/25" : ""
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-300/90 via-indigo-300/80 to-emerald-300/85" />
              <CardHeader className="gap-3 pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{workspace.membership.lab.name}</CardTitle>
                      <Badge className={
                        workspace.membership.role === "admin"
                          ? "bg-emerald-100 text-emerald-800"
                          : workspace.membership.role === "manager"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-slate-100 text-slate-700"
                      }>
                        {ROLE_LABELS[workspace.membership.role]}
                      </Badge>
                      {isSelected ? (
                        <Badge className="bg-primary text-white">Active lab</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {labsView === "operations" ? (
                <section
                  id={getOpsHubId(workspace.membership.lab.id)}
                  className="labs-ops-surface space-y-3 rounded-2xl border border-white/80 bg-white/74 p-4 backdrop-blur-xl"
                >
                  <div
                        className={
                          usesEmbeddedSurface
                            ? "min-w-0 space-y-2 overflow-x-hidden"
                            : "labs-content-panel rounded-2xl border border-white/80 bg-white/84 p-4"
                        }
                    role="tabpanel"
                    id={getOpsPanelId(workspace.membership.lab.id, activeOpsTab)}
                    aria-labelledby={`ops-tab-${workspace.membership.lab.id}-${activeOpsTab}`}
                  >
                    {usesEmbeddedSurface ? null : (
                      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-slate-900">{HUB_SECTION_LABELS[activeOpsTab]}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => toggleAdvancedPanel(workspace.membership.lab.id, activeOpsTab)}
                        >
                          {showAdvanced ? "Hide advanced" : "Show advanced"}
                        </Button>
                      </div>
                    )}

                    {activeOpsTab === "reagents" ? (
                      <div
                        className={cn(
                          "min-w-0 overflow-x-hidden",
                          opsPanelPulseKey === `${workspace.membership.lab.id}:reagents`
                            ? "rounded-xl ring-2 ring-primary/25 transition-all duration-200"
                            : "",
                        )}
                      >
                        {getReagentView(workspace.membership.lab.id) === "chooser" ? (
                          <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", reagentSlideClass(workspace.membership.lab.id))}>
                            <p className="text-sm text-slate-600">
                              Choose what you want to do first.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                className="bg-slate-900 text-white hover:bg-slate-800"
                                onClick={() => {
                                  const labId = workspace.membership.lab.id;
                                  setReagentEntryModeByLab((current) => ({ ...current, [labId]: "add" }));
                                  setReagentSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                  setReagentViewByLab((current) => ({
                                    ...current,
                                    [labId]: "workspace",
                                  }));
                                }}
                              >
                                Add reagents
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="border-slate-200"
                                onClick={() => {
                                  const labId = workspace.membership.lab.id;
                                  setReagentEntryModeByLab((current) => ({ ...current, [labId]: "search" }));
                                  setReagentSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                  setReagentViewByLab((current) => ({
                                    ...current,
                                    [labId]: "workspace",
                                  }));
                                }}
                              >
                                Search reagents
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="border-slate-200"
                                onClick={() => {
                                  const labId = workspace.membership.lab.id;
                                  setReagentEntryModeByLab((current) => ({ ...current, [labId]: "chat" }));
                                  setReagentSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                  setReagentViewByLab((current) => ({
                                    ...current,
                                    [labId]: "workspace",
                                  }));
                                }}
                              >
                                Reagent chat room
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className={cn("ops-slide-card", reagentSlideClass(workspace.membership.lab.id))}>
                            {operationsReagentsPanel
                              ? (
                                <div className="labs-subtab-theme">
                                  {isValidElement(operationsReagentsPanel)
                                    ? cloneElement(operationsReagentsPanel as ReactElement<OperationsReagentsPanelProps>, {
                                      key: `ops-reagents-${workspace.membership.lab.id}`,
                                      inventoryEntryMode: reagentEntryModeByLab[workspace.membership.lab.id] ?? "default",
                                      inventoryOnBack: () => {
                                        const labId = workspace.membership.lab.id;
                                        setReagentEntryModeByLab((current) => ({ ...current, [labId]: "default" }));
                                        setReagentSlideDirByLab((current) => ({ ...current, [labId]: "back" }));
                                        setReagentViewByLab((current) => ({
                                          ...current,
                                          [labId]: "chooser",
                                        }));
                                      },
                                    })
                                    : operationsReagentsPanel}
                                </div>
                              )
                              : (
                              <p className="text-sm text-slate-600">Reagent operations are not available for this lab yet.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {activeOpsTab === "chat" ? (
                      <div
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:chat` ? "rounded-xl ring-2 ring-primary/25 transition-all duration-200" : ""}
                      >
                        {labChatPanel
                          ? (
                            <div className="labs-subtab-theme">
                              {isValidElement(labChatPanel)
                                ? cloneElement(labChatPanel, { key: `ops-chat-${workspace.membership.lab.id}` })
                                : labChatPanel}
                            </div>
                          )
                          : (
                          <p className="text-sm text-slate-600">Lab chat is not available for this lab yet.</p>
                        )}
                      </div>
                    ) : null}

                    {activeOpsTab === "meetings" ? (
                      <div
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:meetings` ? "rounded-xl ring-2 ring-primary/25 transition-all duration-200" : ""}
                      >
                        {labMeetingsPanel
                          ? (
                            <div className="labs-subtab-theme">
                              {isValidElement(labMeetingsPanel)
                                ? cloneElement(labMeetingsPanel, { key: `ops-meetings-${workspace.membership.lab.id}` })
                                : labMeetingsPanel}
                            </div>
                          )
                          : (
                          <p className="text-sm text-slate-600">Lab meetings are not available for this lab yet.</p>
                        )}
                      </div>
                    ) : null}

                    {activeOpsTab === "announcements" ? (
                      <div
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:announcements` ? "space-y-3 rounded-xl ring-2 ring-primary/25 transition-all duration-200" : "space-y-3"}
                      >
                        {(() => {
                          const labId = workspace.membership.lab.id;
                          const announcementView = getAnnouncementView(labId);
                          const selectedAnnouncementId = selectedAnnouncementIdByLab[labId] ?? announcementEntries[0]?.id ?? "";
                          const selectedAnnouncement =
                            announcementEntries.find((entry) => entry.id === selectedAnnouncementId) ?? announcementEntries[0] ?? null;

                          if (announcementView === "chooser") {
                            return (
                              <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", announcementSlideClass(labId))}>
                                <p className="text-sm text-slate-600">Choose one action to continue.</p>
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                                  <Button
                                    type="button"
                                    className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                                    onClick={() => {
                                      setAnnouncementSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                      setAnnouncementViewByLab((current) => ({ ...current, [labId]: "browse" }));
                                    }}
                                  >
                                    Browse announcements
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full border-slate-200 sm:w-auto"
                                    onClick={() => {
                                      setAnnouncementSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                      setAnnouncementViewByLab((current) => ({ ...current, [labId]: "create" }));
                                    }}
                                  >
                                    Create announcement
                                  </Button>
                                </div>
                              </div>
                            );
                          }

                          if (announcementView === "create") {
                            return (
                              <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", announcementSlideClass(labId))}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-slate-200"
                                    onClick={() => {
                                      setAnnouncementSlideDirByLab((current) => ({ ...current, [labId]: "back" }));
                                      setAnnouncementViewByLab((current) => ({ ...current, [labId]: "chooser" }));
                                    }}
                                  >
                                    Back
                                  </Button>
                                  <p className="text-sm font-medium text-slate-900">Create announcement</p>
                                </div>
                                <form
                                  className="grid max-w-2xl gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const formData = new FormData(event.currentTarget);
                                    const typeRaw = String(formData.get("announcement_type") ?? "general");
                                    const title = String(formData.get("title") ?? "").trim();
                                    const body = String(formData.get("body") ?? "").trim();
                                    if (!title || !body) return;
                                    runAction(
                                      `announcement-create-${labId}`,
                                      announcementActions.createAnnouncement,
                                      withLabContext(labId, [
                                        ["announcement_type", typeRaw === "inspection" ? "inspection" : "general"],
                                        ["title", title],
                                        ["body", body],
                                      ]),
                                      "Announcement posted.",
                                      () => event.currentTarget.reset(),
                                    );
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
                                    rows={3}
                                    placeholder="Share a lab update."
                                    disabled={!canManageMembers || requiresActiveLab}
                                    required
                                  />
                                  <Button
                                    type="submit"
                                    className="w-full sm:w-fit bg-slate-900 text-white hover:bg-slate-800"
                                    disabled={!canManageMembers || requiresActiveLab || busyKey === `announcement-create-${labId}`}
                                  >
                                    {busyKey === `announcement-create-${labId}` ? "Posting..." : "Post announcement"}
                                  </Button>
                                </form>
                              </div>
                            );
                          }

                          return (
                            <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", announcementSlideClass(labId))}>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200"
                                  onClick={() => {
                                    setAnnouncementSlideDirByLab((current) => ({ ...current, [labId]: "back" }));
                                    setAnnouncementViewByLab((current) => ({ ...current, [labId]: "chooser" }));
                                  }}
                                >
                                  Back
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200"
                                  onClick={() => {
                                    setAnnouncementSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                    setAnnouncementViewByLab((current) => ({ ...current, [labId]: "create" }));
                                  }}
                                >
                                  New announcement
                                </Button>
                              </div>
                              {announcementEntries.length === 0 ? (
                                <p className="text-sm text-slate-500">No announcements yet.</p>
                              ) : (
                                <div className="grid gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
                                  <div className="space-y-2">
                                    {(showAdvanced ? announcementEntries : announcementEntries.slice(0, 7)).map((entry) => (
                                      <button
                                        key={entry.id}
                                        type="button"
                                        className={cn(
                                          "w-full rounded-xl border px-3 py-2 text-left",
                                          selectedAnnouncement?.id === entry.id
                                            ? "border-primary/30 bg-primary/10"
                                            : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                                        )}
                                        onClick={() => setSelectedAnnouncementIdByLab((current) => ({ ...current, [labId]: entry.id }))}
                                      >
                                        <p className="truncate text-sm font-medium text-slate-900">{entry.title}</p>
                                        <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(entry.createdAt)}</p>
                                      </button>
                                    ))}
                                  </div>
                                  {selectedAnnouncement ? (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-slate-900">{selectedAnnouncement.title}</p>
                                        <Badge variant={selectedAnnouncement.type === "inspection" ? "secondary" : "outline"}>
                                          {selectedAnnouncement.type === "inspection" ? "Inspection" : "General"}
                                        </Badge>
                                      </div>
                                      <p className="mt-2 text-sm text-slate-700">{selectedAnnouncement.body}</p>
                                      <p className="mt-2 text-xs text-slate-500">
                                        {selectedAnnouncement.createdByUserId === currentUserId
                                          ? "You"
                                          : (selectedAnnouncement.createdByUserId
                                            ? memberLabelByUserId.get(selectedAnnouncement.createdByUserId)
                                            : null) ?? "Lab manager"} · {formatRelativeTime(selectedAnnouncement.createdAt)}
                                      </p>
                                      {canManageMembers ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="mt-3 border-red-200 text-red-700 hover:bg-red-50"
                                          onClick={() =>
                                            runAction(
                                              `announcement-delete-${labId}-${selectedAnnouncement.id}`,
                                              announcementActions.deleteAnnouncement,
                                              withLabContext(labId, [["announcement_id", selectedAnnouncement.id]]),
                                              "Announcement deleted.",
                                            )
                                          }
                                          disabled={requiresActiveLab || busyKey === `announcement-delete-${labId}-${selectedAnnouncement.id}`}
                                        >
                                          <Trash2 className="mr-1.5 h-4 w-4" />
                                          Delete announcement
                                        </Button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}

                    {activeOpsTab === "inspection_tasks" ? (
                      <div
                        className={opsPanelPulseKey === `${workspace.membership.lab.id}:inspection_tasks` ? "space-y-3 rounded-xl ring-2 ring-primary/25 transition-all duration-200" : "space-y-3"}
                      >
                        {(() => {
                          const labId = workspace.membership.lab.id;
                          const inspectionView = getInspectionView(labId);
                          const selectedTaskId = selectedInspectionTaskIdByLab[labId] ?? inspectionTasks[0]?.id ?? "";
                          const selectedTask = inspectionTasks.find((task) => task.id === selectedTaskId) ?? inspectionTasks[0] ?? null;

                          if (inspectionView === "chooser") {
                            return (
                              <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", inspectionSlideClass(labId))}>
                                <p className="text-sm text-slate-600">Choose one inspection task action.</p>
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                                  <Button
                                    type="button"
                                    className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                                    onClick={() => {
                                      setInspectionSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                      setInspectionViewByLab((current) => ({ ...current, [labId]: "board" }));
                                    }}
                                  >
                                    Open task board
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full border-slate-200 sm:w-auto"
                                    onClick={() => {
                                      setInspectionSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                      setInspectionViewByLab((current) => ({ ...current, [labId]: "create" }));
                                    }}
                                  >
                                    Create task
                                  </Button>
                                </div>
                              </div>
                            );
                          }

                          if (inspectionView === "create") {
                            return (
                              <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", inspectionSlideClass(labId))}>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-slate-200"
                                    onClick={() => {
                                      setInspectionSlideDirByLab((current) => ({ ...current, [labId]: "back" }));
                                      setInspectionViewByLab((current) => ({ ...current, [labId]: "chooser" }));
                                    }}
                                  >
                                    Back
                                  </Button>
                                  <p className="text-sm font-medium text-slate-900">Create inspection task</p>
                                </div>
                                <form
                                  className="grid max-w-2xl gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const formData = new FormData(event.currentTarget);
                                    const title = String(formData.get("title") ?? "").trim();
                                    const details = String(formData.get("details") ?? "").trim();
                                    const assigneeMemberIdRaw = String(formData.get("assignee_member_id") ?? "").trim();
                                    if (!title) return;
                                    runAction(
                                      `shared-task-create-${labId}-inspection`,
                                      sharedTaskActions.createTask,
                                      withLabContext(labId, [
                                        ["title", title],
                                        ["details", details],
                                        ["list_type", "inspection"],
                                        ["assignee_member_id", assigneeMemberIdRaw],
                                      ]),
                                      "Inspection task added.",
                                      () => event.currentTarget.reset(),
                                    );
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
                                  <Button
                                    type="submit"
                                    className="w-full sm:w-fit bg-slate-900 text-white hover:bg-slate-800"
                                    disabled={!canManageMembers || requiresActiveLab || busyKey === `shared-task-create-${labId}-inspection`}
                                  >
                                    {busyKey === `shared-task-create-${labId}-inspection` ? "Adding..." : "Add inspection task"}
                                  </Button>
                                </form>
                              </div>
                            );
                          }

                          return (
                            <div className={cn("ops-slide-card space-y-3 rounded-xl border border-slate-200 bg-white p-4", inspectionSlideClass(labId))}>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200"
                                  onClick={() => {
                                    setInspectionSlideDirByLab((current) => ({ ...current, [labId]: "back" }));
                                    setInspectionViewByLab((current) => ({ ...current, [labId]: "chooser" }));
                                  }}
                                >
                                  Back
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200"
                                  onClick={() => {
                                    setInspectionSlideDirByLab((current) => ({ ...current, [labId]: "forward" }));
                                    setInspectionViewByLab((current) => ({ ...current, [labId]: "create" }));
                                  }}
                                >
                                  New task
                                </Button>
                              </div>
                              {inspectionTasks.length === 0 ? (
                                <p className="text-sm text-slate-500">No shared inspection tasks yet.</p>
                              ) : (
                                <div className="grid gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
                                  <div className="space-y-2">
                                    {(showAdvanced ? inspectionTasks : inspectionTasks.slice(0, 8)).map((task) => (
                                      <button
                                        key={task.id}
                                        type="button"
                                        className={cn(
                                          "w-full rounded-xl border px-3 py-2 text-left",
                                          selectedTask?.id === task.id
                                            ? "border-primary/30 bg-primary/10"
                                            : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                                        )}
                                        onClick={() => setSelectedInspectionTaskIdByLab((current) => ({ ...current, [labId]: task.id }))}
                                      >
                                        <p className={cn("truncate text-sm font-medium", task.done ? "text-slate-500 line-through" : "text-slate-900")}>
                                          {task.title}
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-500">
                                          {(task.assigneeMemberId ? memberLabelByMembershipId.get(task.assigneeMemberId) : null) ?? "Unassigned"} · {formatRelativeTime(task.createdAt)}
                                        </p>
                                      </button>
                                    ))}
                                  </div>
                                  {selectedTask ? (
                                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      {sharedTaskEditById[selectedTask.id] ? (
                                        <div className="space-y-2">
                                          <Input
                                            value={sharedTaskEditById[selectedTask.id].title}
                                            onChange={(event) =>
                                              setSharedTaskEditById((current) => ({
                                                ...current,
                                                [selectedTask.id]: {
                                                  ...(current[selectedTask.id] ?? { title: selectedTask.title, details: selectedTask.details }),
                                                  title: event.target.value,
                                                },
                                              }))
                                            }
                                            disabled={!canManageMembers || requiresActiveLab}
                                          />
                                          <Textarea
                                            rows={3}
                                            value={sharedTaskEditById[selectedTask.id].details}
                                            onChange={(event) =>
                                              setSharedTaskEditById((current) => ({
                                                ...current,
                                                [selectedTask.id]: {
                                                  ...(current[selectedTask.id] ?? { title: selectedTask.title, details: selectedTask.details }),
                                                  details: event.target.value,
                                                },
                                              }))
                                            }
                                            disabled={!canManageMembers || requiresActiveLab}
                                          />
                                        </div>
                                      ) : (
                                        <div>
                                          <div className="flex items-center justify-between gap-2">
                                            <p className={cn("text-sm font-semibold", selectedTask.done ? "text-slate-500 line-through" : "text-slate-900")}>
                                              {selectedTask.title}
                                            </p>
                                            <Badge variant={selectedTask.done ? "secondary" : "outline"}>{selectedTask.done ? "Done" : "Open"}</Badge>
                                          </div>
                                          {selectedTask.details ? <p className="mt-2 text-sm text-slate-700">{selectedTask.details}</p> : null}
                                        </div>
                                      )}
                                      <select
                                        value={selectedTask.assigneeMemberId ?? ""}
                                        onChange={(event) => {
                                          const assigneeMemberIdRaw = event.target.value;
                                          submitSharedTaskUpdate(
                                            labId,
                                            selectedTask,
                                            { assigneeMemberId: assigneeMemberIdRaw || null },
                                            "Task assignee updated.",
                                          );
                                        }}
                                        disabled={!canManageMembers || requiresActiveLab}
                                        className="h-9 min-w-40 rounded-md border border-input bg-white px-3 text-xs shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        <option value="">Unassigned</option>
                                        {activeMembers.map((member) => (
                                          <option key={`inspect-edit-assignee-${selectedTask.id}-${member.id}`} value={member.id}>
                                            {getMemberPrimaryLabel(member)}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {sharedTaskEditById[selectedTask.id] ? (
                                          <>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="border-slate-200"
                                              disabled={!canManageMembers || requiresActiveLab || !sharedTaskEditById[selectedTask.id].title.trim()}
                                              onClick={() => {
                                                const draft = sharedTaskEditById[selectedTask.id];
                                                submitSharedTaskUpdate(
                                                  labId,
                                                  selectedTask,
                                                  {
                                                    title: draft.title.trim(),
                                                    details: draft.details.trim(),
                                                  },
                                                  "Task updated.",
                                                  () => cancelSharedTaskEdit(selectedTask.id),
                                                );
                                              }}
                                            >
                                              Save
                                            </Button>
                                            <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => cancelSharedTaskEdit(selectedTask.id)}>
                                              Cancel
                                            </Button>
                                          </>
                                        ) : (
                                          <>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="border-slate-200"
                                              disabled={!canManageMembers || requiresActiveLab}
                                              onClick={() => startSharedTaskEdit(selectedTask)}
                                            >
                                              Edit
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="border-slate-200"
                                              disabled={!canManageMembers || requiresActiveLab}
                                              onClick={() => {
                                                submitSharedTaskUpdate(
                                                  labId,
                                                  selectedTask,
                                                  { done: !selectedTask.done },
                                                  selectedTask.done ? "Task marked open." : "Task marked done.",
                                                );
                                              }}
                                            >
                                              {selectedTask.done ? "Mark open" : "Mark done"}
                                            </Button>
                                          </>
                                        )}
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="border-red-200 text-red-700 hover:bg-red-50"
                                          disabled={!canManageMembers || requiresActiveLab}
                                          onClick={() => submitSharedTaskDelete(labId, selectedTask.id)}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}

                    {activeOpsTab === "equipment_booking" ? (
                      <div
                        className={cn(
                          "min-w-0 overflow-x-hidden",
                          opsPanelPulseKey === `${workspace.membership.lab.id}:equipment_booking`
                            ? "rounded-xl ring-2 ring-primary/25 transition-all duration-200"
                            : "",
                        )}
                      >
                        {operationsEquipmentPanel ? (
                          <div className="labs-subtab-theme">{operationsEquipmentPanel}</div>
                        ) : (
                          <p className="text-sm text-slate-600">Equipment booking is not available for this lab yet.</p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {(activeOpsTab === "announcements" || activeOpsTab === "inspection_tasks")
                    && (!canManageMembers || requiresActiveLab) ? (
                    <p className="text-xs text-slate-500">
                      Manager or admin role required to edit announcements and shared tasks.
                    </p>
                  ) : null}
                </section>
                ) : null}

                {labsView === "administration" ? (
                <details
                  id={getTeamDetailsId(workspace.membership.lab.id)}
                  open={labsView === "administration" || (openTeamPoliciesByLab[workspace.membership.lab.id] ?? false)}
                  onToggle={(event) => {
                    const detailsElement = event.currentTarget as HTMLDetailsElement;
                    setOpenTeamPoliciesByLab((current) => ({
                      ...current,
                      [workspace.membership.lab.id]: detailsElement.open,
                    }));
                  }}
                  className="labs-content-panel rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4"
                >
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Lab administration</summary>
                  <p className="mt-1 text-sm text-slate-600">Roles, access control, and sharing rules.</p>
                  <div className="mt-4 space-y-5">
                    <form
                  id={getTeamTargetId(workspace.membership.lab.id, "policies")}
                  tabIndex={-1}
                  className="grid gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 lg:grid-cols-2 labs-subtle-block"
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
                  <input type="hidden" name="active_lab_id" value={workspace.membership.lab.id} />

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

                  <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Equipment Outlook sync account</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Use one stable connected Outlook account for all equipment calendars in this lab.
                        </p>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          runAction(
                            `outlook-sync-owner-${workspace.membership.lab.id}`,
                            setLabOutlookSyncOwner,
                            new FormData(event.currentTarget),
                            "Lab Outlook sync account updated.",
                          );
                        }}
                      >
                        <input type="hidden" name="lab_id" value={workspace.membership.lab.id} />
                        <input type="hidden" name="active_lab_id" value={workspace.membership.lab.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          disabled={!canManageMembers || featureUnavailable || requiresActiveLab || busyKey === `outlook-sync-owner-${workspace.membership.lab.id}`}
                        >
                          {busyKey === `outlook-sync-owner-${workspace.membership.lab.id}` ? "Saving..." : "Use my connected Outlook"}
                        </Button>
                      </form>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Current mode: one connected Outlook account routes bookings into each equipment calendar by its calendar ID.
                    </p>
                  </div>

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
                    className="grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 md:grid-cols-4 labs-subtle-block"
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
                                  message: "No LabLynx account matches that email address.",
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
                    <input type="hidden" name="active_lab_id" value={workspace.membership.lab.id} />
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
                            retryData.set("active_lab_id", workspace.membership.lab.id);
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
                                        message: "No LabLynx account matches that email address.",
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
                      Manager or admin role required to add or edit members.
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
                          <div key={member.id} className="labs-member-row flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
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
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                                  Manager fields
                                </summary>
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
                              </details>
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
                                <input type="hidden" name="active_lab_id" value={workspace.membership.lab.id} />
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
                                  <input type="hidden" name="active_lab_id" value={workspace.membership.lab.id} />
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
                                  <input type="hidden" name="active_lab_id" value={workspace.membership.lab.id} />
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

                  <details className="labs-content-panel rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Activity and history</summary>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="labs-subtle-block rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <History className="h-4 w-4 text-slate-600" />
                          <p className="text-sm font-semibold text-slate-900">Member activity feed</p>
                        </div>
                        <div className="space-y-2">
                          {activityEntries.length === 0 ? (
                            <p className="text-sm text-slate-500">No recent member activity yet.</p>
                          ) : (
                            activityEntries.map((event) => (
                              <div key={event.id} className="labs-list-item rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <p className="text-sm font-medium text-slate-900">{event.memberLabel}</p>
                                <p className="text-xs text-slate-600">{event.detail}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(event.createdAt)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="labs-subtle-block rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <NotebookPen className="h-4 w-4 text-slate-600" />
                          <p className="text-sm font-semibold text-slate-900">Invite/add history</p>
                        </div>
                        <div className="space-y-2">
                          {inviteEntries.length === 0 ? (
                            <p className="text-sm text-slate-500">No invite attempts yet.</p>
                          ) : (
                            inviteEntries.map((entry) => (
                              <div key={entry.id} className="labs-list-item rounded-xl border border-slate-200 bg-white px-3 py-2">
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
                    <div className="labs-subtle-block mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <History className="h-4 w-4 text-slate-600" />
                        <p className="text-sm font-semibold text-slate-900">Role history timeline</p>
                      </div>
                      <div className="space-y-2">
                        {roleHistoryEntries.length === 0 ? (
                          <p className="text-sm text-slate-500">No role changes recorded yet.</p>
                        ) : (
                          roleHistoryEntries.map((entry) => (
                            <div key={entry.id} className="labs-list-item rounded-xl border border-slate-200 bg-white px-3 py-2">
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
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
