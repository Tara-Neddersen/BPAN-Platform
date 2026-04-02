"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  FlaskConical,
  Layers3,
  MessageSquare,
  PackagePlus,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { HelpHint } from "@/components/ui/help-hint";
import { cn } from "@/lib/utils";
import { UI_SURFACE_TITLES } from "@/lib/ui-copy";
import type {
  LabEquipmentBooking,
  LabReagentStockEvent,
  PlatformBookingStatus,
  PlatformInventoryEventType,
  PlatformLinkedObjectType,
} from "@/types";

type ActionResult = {
  success?: boolean;
  error?: string;
  message?: {
    id: string;
    body: string;
    created_at: string;
    linked_object_type: PlatformLinkedObjectType;
    linked_object_id: string;
  };
  equipment?: {
    id: string;
    name: string;
    description: string | null;
    location: string | null;
    booking_requires_approval: boolean;
    outlook_calendar_id: string | null;
    outlook_calendar_name: string | null;
    outlook_sync_owner_user_id: string | null;
    is_active: boolean;
  };
  booking?: {
    id: string;
    equipment_id: string;
    booked_by: string | null;
    title: string;
    starts_at: string;
    ends_at: string;
    status: PlatformBookingStatus;
    task_id: string | null;
    notes: string | null;
  };
};

type TaskOption = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
};

type MessageView = {
  id: string;
  authorLabel: string;
  body: string;
  timestamp: string;
};

type InventoryView = {
  id: string;
  name: string;
  catalogNumber: string | null;
  supplier: string | null;
  lotNumber: string | null;
  quantity: number;
  unit: string | null;
  reorderThreshold: number | null;
  needsReorder: boolean;
  lastOrderedAt: string | null;
  storageLocation: string | null;
  notes: string | null;
  stockEvents: LabReagentStockEvent[];
  linkedTaskIds: string[];
  messages: MessageView[];
};

type EquipmentOption = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  bookingRequiresApproval: boolean;
  outlookCalendarId: string | null;
  outlookCalendarName: string | null;
  outlookSyncOwnerUserId: string | null;
  isActive: boolean;
  linkedTaskIds: string[];
  messages: MessageView[];
};

type BookingView = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  location: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  status: LabEquipmentBooking["status"];
  bookedBy: string | null;
  bookedByLabel: string;
  taskId: string | null;
  notes: string | null;
  bookingRequiresApproval: boolean;
  linkedTaskIds: string[];
  messages: MessageView[];
};

type RunActionOptions = {
  successMessage: string;
  errorContext: string;
  lockKey: string;
  duplicateMessage?: string;
};

type InventoryStatusTone = {
  label: string;
  badge: string;
  bar: string;
  panel: string;
  dot: string;
};

type ReorderTimelineStep = {
  key: "needed" | "placed" | "received";
  label: string;
  timestamp: string | null;
  state: "done" | "current" | "pending";
};

type ReagentPreset = {
  label: string;
  name: string;
  supplier: string;
  unit: string;
  quantity: string;
  reorderThreshold: string;
  storageLocation: string;
};

type LabContextView = {
  currentUserId: string | null;
  labId: string | null;
  labName: string | null;
  role: string | null;
  featureUnavailable: boolean;
  warning: string | null;
};

interface LabOperationsClientProps {
  embedded?: boolean;
  initialTab?: "inventory" | "bookings" | "handoff";
  initialSelectedInventoryId?: string | null;
  inventoryEntryMode?: "default" | "add" | "search" | "chat";
  inventoryOnBack?: (() => void) | null;
  scanMode?: boolean;
  labContext: LabContextView;
  taskOptions: TaskOption[];
  inventory: InventoryView[];
  equipmentOptions: EquipmentOption[];
  bookings: BookingView[];
  approverLabels?: string[];
  actions: {
    createLabEquipment: (formData: FormData) => Promise<ActionResult>;
    createLabReagent: (formData: FormData) => Promise<ActionResult>;
    updateLabReagent: (formData: FormData) => Promise<ActionResult>;
    deleteLabReagent: (formData: FormData) => Promise<ActionResult>;
    updateLabEquipment: (formData: FormData) => Promise<ActionResult>;
    setLabEquipmentActive: (formData: FormData) => Promise<ActionResult>;
    deleteLabEquipment: (formData: FormData) => Promise<ActionResult>;
    createReagentStockEvent: (formData: FormData) => Promise<ActionResult>;
    createEquipmentBooking: (formData: FormData) => Promise<ActionResult>;
    deleteEquipmentBooking: (formData: FormData) => Promise<ActionResult>;
    updateEquipmentBooking: (formData: FormData) => Promise<ActionResult>;
    updateEquipmentBookingStatus: (
      bookingId: string,
      status: PlatformBookingStatus,
      activeLabId: string | null,
    ) => Promise<ActionResult>;
    createTaskLink: (formData: FormData) => Promise<ActionResult>;
    createObjectMessage: (input: {
      labId: string;
      linkedObjectType: PlatformLinkedObjectType;
      linkedObjectId: string;
      body: string;
      subject?: string | null;
    }) => Promise<ActionResult>;
  };
}

const REORDER_EVENT_MAP: Record<"request" | "placed" | "received", PlatformInventoryEventType> = {
  request: "reorder_request",
  placed: "reorder_placed",
  received: "reorder_received",
};

const REAGENT_PRESETS: ReagentPreset[] = [
  {
    label: "IHC Antibody",
    name: "Primary Antibody",
    supplier: "Cell Signaling",
    unit: "mL",
    quantity: "1",
    reorderThreshold: "0.25",
    storageLocation: "4C Antibody Rack",
  },
  {
    label: "Cell Culture Media",
    name: "DMEM High Glucose",
    supplier: "Gibco",
    unit: "L",
    quantity: "2",
    reorderThreshold: "1",
    storageLocation: "Cold Room Shelf A",
  },
  {
    label: "PCR Master Mix",
    name: "2x PCR Master Mix",
    supplier: "NEB",
    unit: "mL",
    quantity: "5",
    reorderThreshold: "1",
    storageLocation: "-20C Freezer Drawer 2",
  },
];

function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeLocalInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfCalendarGrid(date: Date) {
  const first = startOfMonth(date);
  return addDays(first, -first.getDay());
}

function endOfCalendarGrid(date: Date) {
  const last = endOfMonth(date);
  return addDays(last, 6 - last.getDay());
}

function formatBookingWindow(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return {
    date: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: `${start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })} - ${end.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })}`,
  };
}

function bookingTone(status: PlatformBookingStatus) {
  switch (status) {
    case "confirmed":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "in_use":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "completed":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function bookingStatusLabel(status: PlatformBookingStatus, bookingRequiresApproval: boolean) {
  if (status === "draft" && bookingRequiresApproval) return "Waiting for approval";
  if (status === "draft") return "Scheduled";
  if (status === "confirmed") return "Scheduled";
  return status.replace(/_/g, " ");
}

function stockTone(
  item: InventoryView,
  latestEventOverride?: PlatformInventoryEventType,
): InventoryStatusTone {
  const latestEvent = latestEventOverride ?? item.stockEvents[0]?.event_type;
  if (latestEvent === "reorder_placed") {
    return {
      badge: "bg-sky-100 text-sky-800 border-sky-200",
      bar: "bg-sky-500",
      panel: "border-sky-200 bg-sky-50/70",
      dot: "bg-sky-500",
      label: "Ordered",
    };
  }

  if (item.needsReorder) {
    return {
      badge: "bg-red-100 text-red-800 border-red-200",
      bar: "bg-red-500",
      panel: "border-red-200 bg-red-50/70",
      dot: "bg-red-500",
      label: "Reorder needed",
    };
  }

  return {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500",
    panel: "border-emerald-200 bg-emerald-50/70",
    dot: "bg-emerald-500",
    label: "In stock",
  };
}

function eventTone(type: PlatformInventoryEventType) {
  if (type.startsWith("reorder")) return "bg-sky-50 text-sky-700 border-sky-200";
  if (type === "receive") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "consume") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function toCsvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const csv = [headers.join(","), ...rows.map((row) => row.map(toCsvCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseBookingTimestamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  let normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  // If timestamp has no explicit timezone, treat it as UTC for deterministic comparisons.
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function bookingIntervalsOverlap(a: BookingView, b: BookingView) {
  const aStart = parseBookingTimestamp(a.startsAt);
  const aEnd = parseBookingTimestamp(a.endsAt);
  const bStart = parseBookingTimestamp(b.startsAt);
  const bEnd = parseBookingTimestamp(b.endsAt);
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(bStart) || !Number.isFinite(bEnd)) {
    return false;
  }
  // Invalid or zero-length windows should never be treated as conflicts.
  if (aEnd <= aStart || bEnd <= bStart) {
    return false;
  }
  return aStart < bEnd && aEnd > bStart;
}

function bookingsShareLocalStartDay(a: BookingView, b: BookingView) {
  return toLocalDateKey(a.startsAt) === toLocalDateKey(b.startsAt);
}

function equipmentTabLabel(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 18) return trimmed;
  return `${trimmed.slice(0, 16)}…`;
}

const OWNER_COLOR_SWATCHES = [
  { dot: "bg-blue-500", chip: "border-blue-200 bg-blue-50 text-blue-800" },
  { dot: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { dot: "bg-amber-500", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  { dot: "bg-fuchsia-500", chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800" },
  { dot: "bg-cyan-500", chip: "border-cyan-200 bg-cyan-50 text-cyan-800" },
  { dot: "bg-orange-500", chip: "border-orange-200 bg-orange-50 text-orange-800" },
];

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function ownerColor(ownerKey: string | null) {
  if (!ownerKey) {
    return { dot: "bg-slate-400", chip: "border-slate-200 bg-slate-100 text-slate-700" };
  }
  return OWNER_COLOR_SWATCHES[stableHash(ownerKey) % OWNER_COLOR_SWATCHES.length];
}

function calendarBookingTone(status: PlatformBookingStatus, hasConflict: boolean) {
  if (hasConflict) {
    return "border-red-300 bg-red-100 text-red-800";
  }
  if (status === "draft") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "in_use") return "border-violet-200 bg-violet-100 text-violet-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "border-slate-300 bg-slate-200 text-slate-700";
  return "border-sky-200 bg-sky-100 text-sky-800";
}

function ObjectLinksPanel({
  title,
  subtitle,
  linkedObjectId,
  linkedObjectType,
  labId,
  linkedTaskIds,
  taskOptions,
  messages,
  messageDraft,
  onMessageDraftChange,
  onCreateTaskLink,
  onPostMessage,
  disabled,
  busy,
}: {
  title: string;
  subtitle: string;
  linkedObjectId: string;
  linkedObjectType: PlatformLinkedObjectType;
  labId: string | null;
  linkedTaskIds: string[];
  taskOptions: TaskOption[];
  messages: MessageView[];
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  onCreateTaskLink: (taskId: string, objectType: PlatformLinkedObjectType, objectId: string) => Promise<void>;
  onPostMessage: (
    objectType: PlatformLinkedObjectType,
    objectId: string,
    body: string,
  ) => Promise<void>;
  disabled: boolean;
  busy: boolean;
}) {
  const objectLabel =
    linkedObjectType === "lab_reagent"
      ? "Reagent"
      : linkedObjectType === "lab_equipment"
        ? "Equipment"
      : linkedObjectType === "lab_equipment_booking"
        ? "Booking"
        : "Object";
  const linkedTasks = taskOptions.filter((task) => linkedTaskIds.includes(task.id));
  const availableTasks = taskOptions.filter((task) => !linkedTaskIds.includes(task.id));

  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base text-slate-900">{title}</CardTitle>
            <CardDescription className="mt-1 text-slate-600">{subtitle}</CardDescription>
          </div>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
            {objectLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <ClipboardList className="h-3.5 w-3.5" />
            Task Links
          </div>

          {linkedTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No linked tasks yet.
            </div>
          ) : (
            <div className="space-y-2">
              {linkedTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.status.replace("_", " ")} · {formatDueDate(task.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {availableTasks.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableTasks.slice(0, 4).map((task) => (
                <Button
                  key={task.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || busy}
                  className="h-auto rounded-full border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                  onClick={() => void onCreateTaskLink(task.id, linkedObjectType, linkedObjectId)}
                >
                  Link: {task.title}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <MessageSquare className="h-3.5 w-3.5" />
            Shared Thread
          </div>

          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" role="status">
              No thread messages yet.
            </div>
          ) : (
            <div className="space-y-2" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{message.authorLabel}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(message.timestamp)}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{message.body}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2">
            <Textarea
              value={messageDraft}
              onChange={(event) => onMessageDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void onPostMessage(linkedObjectType, linkedObjectId, messageDraft);
                }
              }}
              placeholder={
                labId
                  ? "Add a note to the shared thread..."
                  : "Shared lab context is required before posting messages."
              }
              disabled={disabled || busy}
              aria-label={`${objectLabel} shared thread note`}
              className="min-h-[92px] border-slate-200 bg-white"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={disabled || busy}
                className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                onClick={() => void onPostMessage(linkedObjectType, linkedObjectId, messageDraft)}
                aria-label={`Post note to ${objectLabel} thread`}
              >
                Post note
              </Button>
            </div>
            <p className="text-xs text-slate-500">Tip: press Cmd/Ctrl + Enter to post.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LabOperationsClient({
  embedded = false,
  initialTab = "inventory",
  initialSelectedInventoryId = null,
  inventoryEntryMode = "default",
  inventoryOnBack = null,
  scanMode = false,
  labContext,
  taskOptions,
  inventory,
  equipmentOptions,
  bookings,
  approverLabels = [],
  actions,
}: LabOperationsClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState(inventory[0]?.id ?? "");
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id ?? "");
  const [inventoryMessageDraft, setInventoryMessageDraft] = useState("");
  const [bookingMessageDraft, setBookingMessageDraft] = useState("");
  const [equipmentMessageDraft, setEquipmentMessageDraft] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [showAddReagentCard, setShowAddReagentCard] = useState(inventoryEntryMode !== "search");
  const [localInventory, setLocalInventory] = useState<InventoryView[]>(inventory);
  const [localMessagesByObjectKey, setLocalMessagesByObjectKey] = useState<Record<string, MessageView[]>>({});
  const [localLatestInventoryEventByReagentId, setLocalLatestInventoryEventByReagentId] =
    useState<Record<string, PlatformInventoryEventType>>({});
  const [localEquipmentOptions, setLocalEquipmentOptions] = useState<EquipmentOption[]>(equipmentOptions);
  const [localBookings, setLocalBookings] = useState<BookingView[]>(bookings);
  const [inventoryTab, setInventoryTab] = useState("all");
  const [inventoryGroups, setInventoryGroups] = useState<string[]>([]);
  const [bulkGroupTarget, setBulkGroupTarget] = useState("Ungrouped");
  const [selectedReagentIds, setSelectedReagentIds] = useState<string[]>([]);
  const [reagentGroupById, setReagentGroupById] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [groupToRename, setGroupToRename] = useState("");
  const [renameGroupName, setRenameGroupName] = useState("");
  const [calendarEquipmentId, setCalendarEquipmentId] = useState(equipmentOptions[0]?.id ?? "");
  const [calendarDateFilter, setCalendarDateFilter] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [isEditingReagent, setIsEditingReagent] = useState(false);
  const [reagentEditError, setReagentEditError] = useState<string | null>(null);
  const [reagentEditDraft, setReagentEditDraft] = useState({
    reagentId: "",
    name: "",
    supplier: "",
    catalogNumber: "",
    lotNumber: "",
    quantity: "0",
    unit: "",
    reorderThreshold: "",
    storageLocation: "",
    notes: "",
  });
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [bookingEditError, setBookingEditError] = useState<string | null>(null);
  const [bookingEditDraft, setBookingEditDraft] = useState({
    bookingId: "",
    equipmentId: "",
    title: "",
    startsAt: "",
    endsAt: "",
    status: "draft" as PlatformBookingStatus,
    taskId: "",
    notes: "",
  });
  const inFlightActionKeysRef = useRef<Set<string>>(new Set());
  const reagentFormRef = useRef<HTMLFormElement | null>(null);
  const inventorySearchInputRef = useRef<HTMLInputElement | null>(null);
  const reagentChatPanelRef = useRef<HTMLDivElement | null>(null);
  const bookingFormRef = useRef<HTMLFormElement | null>(null);
  const equipmentEditFormRef = useRef<HTMLFormElement | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(equipmentOptions[0]?.id ?? "");
  const [equipmentEditError, setEquipmentEditError] = useState<string | null>(null);
  const [equipmentTab, setEquipmentTab] = useState("all");
  const [equipmentSection, setEquipmentSection] = useState<"booking" | "calendar" | "equipment">("booking");
  const [mobileBookingView, setMobileBookingView] = useState<"equipment" | "list" | "detail">("equipment");
  const [mobileCalendarView, setMobileCalendarView] = useState<"calendar" | "chat">("calendar");
  const [calendarStatusDraftByBookingId, setCalendarStatusDraftByBookingId] = useState<Record<string, PlatformBookingStatus>>({});
  const [calendarView, setCalendarView] = useState<"week" | "month">("month");
  const [surfaceTab, setSurfaceTab] = useState<"inventory" | "bookings" | "handoff">(initialTab);
  const [handoffSection, setHandoffSection] = useState<"chooser" | "inventory" | "bookings" | "notes">("chooser");
  const [handoffSlideDirection, setHandoffSlideDirection] = useState<"forward" | "back">("forward");
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const [scanUsageAmount, setScanUsageAmount] = useState("1");
  const [reorderVendorInput, setReorderVendorInput] = useState("");
  const [reorderPoInput, setReorderPoInput] = useState("");
  const [reorderEtaInput, setReorderEtaInput] = useState("");
  const [inventoryDetailOpen, setInventoryDetailOpen] = useState(false);
  const activeSurfaceTab = embedded ? initialTab : surfaceTab;
  const reagentDetailRef = useRef<HTMLDivElement | null>(null);
  const handoffSlideClass = handoffSlideDirection === "back" ? "ops-slide-card-back" : "ops-slide-card-forward";
  const reagentSubtabMode = embedded && initialTab === "inventory" ? inventoryEntryMode : "default";
  const isInventorySearchMode = reagentSubtabMode === "search";
  const isInventoryAddMode = reagentSubtabMode === "add";
  const isInventoryChatMode = reagentSubtabMode === "chat";
  const showInventoryListCard = reagentSubtabMode === "default" || isInventorySearchMode;
  const showInventoryDetailCard = reagentSubtabMode === "default" || isInventorySearchMode;
  const showInventoryChatCard = isInventoryChatMode;
  const showInventoryAddCard = isInventoryAddMode || reagentSubtabMode === "default" || (isInventorySearchMode && showAddReagentCard);
  const showInventoryRightRail = showInventoryDetailCard || showInventoryChatCard;
  const shouldUseSlidingInventoryDetail = embedded && showInventoryDetailCard && !showInventoryChatCard;
  const showInlineInventoryRightRail = showInventoryRightRail && !shouldUseSlidingInventoryDetail;

  const selectInventory = useCallback((itemId: string, openDetailPanel = false) => {
    setSelectedInventoryId(itemId);
    if (shouldUseSlidingInventoryDetail && openDetailPanel) {
      setInventoryDetailOpen(true);
    }
  }, [shouldUseSlidingInventoryDetail]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsNarrowMobile(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setCalendarView(isNarrowMobile ? "week" : "month");
  }, [isNarrowMobile]);

  useEffect(() => {
    setLocalInventory(inventory);
  }, [inventory]);

  useEffect(() => {
    setLocalEquipmentOptions(equipmentOptions);
  }, [equipmentOptions]);

  useEffect(() => {
    setLocalBookings(bookings);
  }, [bookings]);

  useEffect(() => {
    if (!calendarEquipmentId && localEquipmentOptions.length > 0) {
      const firstActive = localEquipmentOptions.find((item) => item.isActive);
      setCalendarEquipmentId(firstActive?.id ?? localEquipmentOptions[0].id);
    }
  }, [calendarEquipmentId, localEquipmentOptions]);

  useEffect(() => {
    setSurfaceTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!initialSelectedInventoryId) return;
    if (!localInventory.some((item) => item.id === initialSelectedInventoryId)) return;
    selectInventory(initialSelectedInventoryId);
    setInventoryTab("all");
  }, [initialSelectedInventoryId, localInventory, selectInventory]);

  useEffect(() => {
    if (inventoryEntryMode === "search") {
      setShowAddReagentCard(false);
      return;
    }
    if (inventoryEntryMode === "add" || inventoryEntryMode === "default" || inventoryEntryMode === "chat") {
      setShowAddReagentCard(true);
    }
  }, [inventoryEntryMode]);

  useEffect(() => {
    if (initialTab !== "inventory") return;
    if (inventoryEntryMode === "default") return;

    if (inventoryEntryMode === "search") {
      inventorySearchInputRef.current?.focus();
      inventorySearchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (inventoryEntryMode === "add") {
      reagentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      const nameInput = reagentFormRef.current?.elements.namedItem("name");
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus();
      }
      return;
    }

    if (inventoryEntryMode === "chat") {
      if (!selectedInventoryId && localInventory.length > 0) {
        setSelectedInventoryId(localInventory[0].id);
      }
      reagentChatPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialTab, inventoryEntryMode, selectedInventoryId, localInventory]);

  function revealAddReagentCard() {
    setShowAddReagentCard(true);
    setTimeout(() => {
      reagentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      const nameInput = reagentFormRef.current?.elements.namedItem("name");
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus();
      }
    }, 0);
  }

  useEffect(() => {
    if (!labContext.labId) return;
    const groupsRaw = localStorage.getItem(`operations:groups:${labContext.labId}`);
    const mapRaw = localStorage.getItem(`operations:reagent-groups:${labContext.labId}`);
    const tabRaw = localStorage.getItem(`operations:inventory-tab:${labContext.labId}`);
    const equipmentTabRaw = localStorage.getItem(`operations:equipment-tab:${labContext.labId}`);
    const equipmentSectionRaw = localStorage.getItem(`operations:equipment-section:${labContext.labId}`);
    if (groupsRaw) {
      try {
        const parsed = JSON.parse(groupsRaw) as string[];
        if (Array.isArray(parsed)) {
          setInventoryGroups(parsed.filter((value) => typeof value === "string" && value.trim().length > 0));
        }
      } catch {
        // Ignore invalid local cache
      }
    }
    if (mapRaw) {
      try {
        const parsed = JSON.parse(mapRaw) as Record<string, string>;
        if (parsed && typeof parsed === "object") {
          setReagentGroupById(parsed);
        }
      } catch {
        // Ignore invalid local cache
      }
    }
    if (tabRaw && tabRaw.trim().length > 0) {
      setInventoryTab(tabRaw);
    }
    if (equipmentTabRaw && equipmentTabRaw.trim().length > 0) {
      setEquipmentTab(equipmentTabRaw);
    }
    if (
      equipmentSectionRaw === "booking"
      || equipmentSectionRaw === "calendar"
      || equipmentSectionRaw === "equipment"
    ) {
      setEquipmentSection(equipmentSectionRaw);
    }
  }, [labContext.labId]);

  useEffect(() => {
    if (!labContext.labId) return;
    localStorage.setItem(`operations:groups:${labContext.labId}`, JSON.stringify(inventoryGroups));
  }, [inventoryGroups, labContext.labId]);

  useEffect(() => {
    if (!labContext.labId) return;
    localStorage.setItem(`operations:reagent-groups:${labContext.labId}`, JSON.stringify(reagentGroupById));
  }, [reagentGroupById, labContext.labId]);

  useEffect(() => {
    if (!labContext.labId) return;
    localStorage.setItem(`operations:inventory-tab:${labContext.labId}`, inventoryTab);
  }, [inventoryTab, labContext.labId]);

  useEffect(() => {
    if (!labContext.labId) return;
    localStorage.setItem(`operations:equipment-tab:${labContext.labId}`, equipmentTab);
  }, [equipmentTab, labContext.labId]);

  useEffect(() => {
    if (!labContext.labId) return;
    localStorage.setItem(`operations:equipment-section:${labContext.labId}`, equipmentSection);
  }, [equipmentSection, labContext.labId]);

  const groupNameForReagent = (reagentId: string) => reagentGroupById[reagentId] ?? "Ungrouped";
  const reagentGroups = useMemo(() => {
    const derived = localInventory
      .map((item) => reagentGroupById[item.id] ?? "Ungrouped")
      .filter((group) => group !== "Ungrouped");
    return Array.from(new Set([...inventoryGroups, ...derived])).sort((a, b) => a.localeCompare(b));
  }, [localInventory, inventoryGroups, reagentGroupById]);

  useEffect(() => {
    if (inventoryTab !== "all" && !reagentGroups.includes(inventoryTab)) {
      setInventoryTab("all");
    }
    if (!groupToRename && reagentGroups.length > 0) {
      setGroupToRename(reagentGroups[0]);
      setRenameGroupName(reagentGroups[0]);
    }
    if (groupToRename && !reagentGroups.includes(groupToRename)) {
      const next = reagentGroups[0] ?? "";
      setGroupToRename(next);
      setRenameGroupName(next);
    }
  }, [groupToRename, inventoryTab, reagentGroups]);

  const selectedInventory = useMemo(
    () => localInventory.find((item) => item.id === selectedInventoryId) ?? localInventory[0] ?? null,
    [localInventory, selectedInventoryId],
  );
  useEffect(() => {
    if (!shouldUseSlidingInventoryDetail) return;
    if (!inventoryDetailOpen) return;
    if (selectedInventory) return;
    setInventoryDetailOpen(false);
  }, [inventoryDetailOpen, selectedInventory, shouldUseSlidingInventoryDetail]);
  const scopedBookings = useMemo(
    () => (equipmentTab === "all" ? localBookings : localBookings.filter((item) => item.equipmentId === equipmentTab)),
    [equipmentTab, localBookings],
  );
  const selectedBooking = useMemo(
    () => scopedBookings.find((item) => item.id === selectedBookingId) ?? scopedBookings[0] ?? null,
    [scopedBookings, selectedBookingId],
  );
  const activeEquipmentOptions = useMemo(
    () => localEquipmentOptions.filter((item) => item.isActive),
    [localEquipmentOptions],
  );
  const selectedEquipment = useMemo(
    () => localEquipmentOptions.find((item) => item.id === selectedEquipmentId) ?? localEquipmentOptions[0] ?? null,
    [localEquipmentOptions, selectedEquipmentId],
  );
  const selectedCalendarEquipment = useMemo(
    () => localEquipmentOptions.find((item) => item.id === calendarEquipmentId) ?? null,
    [calendarEquipmentId, localEquipmentOptions],
  );

  useEffect(() => {
    if (!selectedBooking) return;
    setBookingEditError(null);
    setIsEditingBooking(false);
    setBookingEditDraft({
      bookingId: selectedBooking.id,
      equipmentId: selectedBooking.equipmentId,
      title: selectedBooking.title,
      startsAt: formatDateTimeLocalInput(new Date(selectedBooking.startsAt)),
      endsAt: formatDateTimeLocalInput(new Date(selectedBooking.endsAt)),
      status: selectedBooking.status,
      taskId: selectedBooking.taskId ?? "",
      notes: selectedBooking.notes ?? "",
    });
  }, [selectedBooking]);

  useEffect(() => {
    if (!selectedInventory) return;
    setReagentEditError(null);
    setIsEditingReagent(false);
    setReagentEditDraft({
      reagentId: selectedInventory.id,
      name: selectedInventory.name,
      supplier: selectedInventory.supplier ?? "",
      catalogNumber: selectedInventory.catalogNumber ?? "",
      lotNumber: selectedInventory.lotNumber ?? "",
      quantity: String(selectedInventory.quantity),
      unit: selectedInventory.unit ?? "",
      reorderThreshold:
        selectedInventory.reorderThreshold === null ? "" : String(selectedInventory.reorderThreshold),
      storageLocation: selectedInventory.storageLocation ?? "",
      notes: selectedInventory.notes ?? "",
    });
  }, [selectedInventory]);

  useEffect(() => {
    if (!scanMode || !selectedInventory) return;
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      reagentDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [scanMode, selectedInventory]);

  useEffect(() => {
    if (!selectedEquipmentId && localEquipmentOptions.length > 0) {
      setSelectedEquipmentId(localEquipmentOptions[0].id);
    }
  }, [localEquipmentOptions, selectedEquipmentId]);

  useEffect(() => {
    if (!selectedBookingId && scopedBookings.length > 0) {
      setSelectedBookingId(scopedBookings[0].id);
      return;
    }
    if (selectedBookingId && scopedBookings.length > 0 && !scopedBookings.some((item) => item.id === selectedBookingId)) {
      setSelectedBookingId(scopedBookings[0].id);
      return;
    }
    if (scopedBookings.length === 0 && selectedBookingId) {
      setSelectedBookingId("");
    }
  }, [scopedBookings, selectedBookingId]);

  useEffect(() => {
    if (!isNarrowMobile || equipmentSection !== "booking") return;
    if (equipmentTab === "all") {
      setMobileBookingView("equipment");
      return;
    }
    if (selectedBooking && mobileBookingView === "detail") return;
    setMobileBookingView("list");
  }, [equipmentSection, equipmentTab, isNarrowMobile, mobileBookingView, selectedBooking]);

  useEffect(() => {
    if (!isNarrowMobile || equipmentSection !== "calendar") return;
    setMobileCalendarView("calendar");
  }, [equipmentSection, isNarrowMobile, calendarEquipmentId]);

  useEffect(() => {
    if (equipmentTab === "all") {
      if (!calendarEquipmentId) {
        const fallback = localEquipmentOptions.find((item) => item.isActive) ?? localEquipmentOptions[0];
        if (fallback) {
          setCalendarEquipmentId(fallback.id);
        }
      }
      return;
    }
    if (!localEquipmentOptions.some((item) => item.id === equipmentTab)) {
      setEquipmentTab("all");
      return;
    }
    setCalendarEquipmentId(equipmentTab);
    setSelectedEquipmentId(equipmentTab);
    setEquipmentSection("calendar");
  }, [calendarEquipmentId, embedded, equipmentSection, equipmentTab, localEquipmentOptions]);

  const bookingConflictMap = useMemo(() => {
    const map = new Map<string, BookingView[]>();
    const dedupedById = new Map<string, BookingView>();
    for (const booking of localBookings) dedupedById.set(booking.id, booking);

    // Guard against optimistic/server duplicate clones of the same booking window.
    const dedupedBySignature = new Map<string, BookingView>();
    for (const booking of dedupedById.values()) {
      const start = new Date(booking.startsAt);
      const end = new Date(booking.endsAt);
      const startKey = Number.isNaN(start.getTime()) ? booking.startsAt : start.toISOString();
      const endKey = Number.isNaN(end.getTime()) ? booking.endsAt : end.toISOString();
      const signature = [
        booking.equipmentId,
        booking.title.trim().toLowerCase(),
        startKey,
        endKey,
      ].join("|");
      const existing = dedupedBySignature.get(signature);
      if (!existing) {
        dedupedBySignature.set(signature, booking);
        continue;
      }
      const existingIsTemp = existing.id.startsWith("temp-booking-");
      const currentIsTemp = booking.id.startsWith("temp-booking-");
      if (existingIsTemp && !currentIsTemp) {
        dedupedBySignature.set(signature, booking);
      }
    }

    const actionable = [...dedupedBySignature.values()].filter((booking) => {
      const startMs = parseBookingTimestamp(booking.startsAt);
      const endMs = parseBookingTimestamp(booking.endsAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
      // Ignore zero/negative windows; they should not be treated as conflicts.
      if (endMs <= startMs) return false;
      return true;
    });
    for (const booking of actionable) {
      map.set(booking.id, []);
    }
    for (let index = 0; index < actionable.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < actionable.length; compareIndex += 1) {
        const a = actionable[index];
        const b = actionable[compareIndex];
        if (a.equipmentId !== b.equipmentId) continue;
        if (!bookingsShareLocalStartDay(a, b)) continue;
        if (!bookingIntervalsOverlap(a, b)) continue;
        map.set(a.id, [...(map.get(a.id) ?? []), b]);
        map.set(b.id, [...(map.get(b.id) ?? []), a]);
      }
    }
    return map;
  }, [localBookings]);

  const calendarConflictHeatmap = useMemo(() => {
    const relevant = localBookings
      .filter((booking) => booking.equipmentId === calendarEquipmentId)
      .filter((booking) => booking.status !== "cancelled");
    const dayBuckets = new Map<string, { total: number; conflicts: number }>();
    for (const booking of relevant) {
      const day = toLocalDateKey(booking.startsAt);
      const current = dayBuckets.get(day) ?? { total: 0, conflicts: 0 };
      current.total += 1;
      if ((bookingConflictMap.get(booking.id) ?? []).length > 0) {
        current.conflicts += 1;
      }
      dayBuckets.set(day, current);
    }
    return [...dayBuckets.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(0, 10);
  }, [bookingConflictMap, calendarEquipmentId, localBookings]);

  const filteredInventory = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    const byGroup = localInventory.filter((item) => {
      if (inventoryTab === "all") return true;
      return (reagentGroupById[item.id] ?? "Ungrouped") === inventoryTab;
    });

    if (!query) return byGroup;

    return byGroup.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        (item.supplier ?? "").toLowerCase().includes(query) ||
        (item.catalogNumber ?? "").toLowerCase().includes(query)
      );
    });
  }, [localInventory, inventorySearch, inventoryTab, reagentGroupById]);

  const areAllVisibleReagentsSelected =
    filteredInventory.length > 0 && filteredInventory.every((item) => selectedReagentIds.includes(item.id));

  function getTimelineSteps(
    item: InventoryView,
    latestEventOverride?: PlatformInventoryEventType,
  ): ReorderTimelineStep[] {
    const newestToOldest = item.stockEvents;
    const requestEvent = newestToOldest.find((event) => event.event_type === "reorder_request");
    const placedEvent = newestToOldest.find((event) => event.event_type === "reorder_placed");
    const receivedEvent = newestToOldest.find((event) => event.event_type === "reorder_received");
    const effectiveLatestEvent = latestEventOverride ?? newestToOldest[0]?.event_type ?? null;
    const overrideTime = new Date().toISOString();

    const neededTimestamp =
      requestEvent?.created_at
      ?? (item.needsReorder ? item.lastOrderedAt ?? overrideTime : null);
    const placedTimestamp =
      placedEvent?.created_at
      ?? (effectiveLatestEvent === "reorder_placed" ? overrideTime : null);
    const receivedTimestamp =
      receivedEvent?.created_at
      ?? (effectiveLatestEvent === "reorder_received" ? overrideTime : null);

    const steps: ReorderTimelineStep[] = [
      {
        key: "needed",
        label: "Needed",
        timestamp: neededTimestamp,
        state: neededTimestamp ? "done" : "pending",
      },
      {
        key: "placed",
        label: "Placed",
        timestamp: placedTimestamp,
        state: "pending",
      },
      {
        key: "received",
        label: "Received",
        timestamp: receivedTimestamp,
        state: "pending",
      },
    ];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step.timestamp) {
        step.state = "done";
        continue;
      }

      const hasPriorMissing = steps.slice(0, index).some((prior) => !prior.timestamp);
      step.state = hasPriorMissing ? "pending" : "current";
      break;
    }

    return steps;
  }

  async function applyBulkStatus(eventType: PlatformInventoryEventType) {
    if (selectedReagentIds.length === 0) {
      toast.info("Select at least one reagent row.");
      return;
    }
    for (const reagentId of selectedReagentIds) {
      const reagent = localInventory.find((item) => item.id === reagentId);
      if (!reagent) continue;
      let quantityDelta = 0;
      if (eventType === "reorder_received") {
        quantityDelta = Math.max(reagent.reorderThreshold ?? 1, 1);
      }
      // Sequential writes avoid duplicate state races in shared lock keys.
      await submitStockEvent(
        reagentId,
        eventType,
        quantityDelta,
        `Bulk ${eventType.replace(/_/g, " ")} update.`,
        reagent.unit,
      );
    }
    toast.success("Bulk status update completed.");
  }

  function applyBulkGroup() {
    if (selectedReagentIds.length === 0) {
      toast.info("Select at least one reagent row.");
      return;
    }
    setReagentGroupById((current) => {
      const next = { ...current };
      for (const reagentId of selectedReagentIds) {
        next[reagentId] = bulkGroupTarget;
      }
      return next;
    });
    toast.success("Bulk group update applied.");
  }

  function applyReagentPreset(preset: ReagentPreset) {
    const form = reagentFormRef.current;
    if (!form) return;

    const nameInput = form.elements.namedItem("name") as HTMLInputElement | null;
    const supplierInput = form.elements.namedItem("supplier") as HTMLInputElement | null;
    const unitInput = form.elements.namedItem("unit") as HTMLInputElement | null;
    const quantityInput = form.elements.namedItem("quantity") as HTMLInputElement | null;
    const thresholdInput = form.elements.namedItem("reorder_threshold") as HTMLInputElement | null;
    const storageInput = form.elements.namedItem("storage_location") as HTMLInputElement | null;

    if (nameInput) nameInput.value = preset.name;
    if (supplierInput) supplierInput.value = preset.supplier;
    if (unitInput) unitInput.value = preset.unit;
    if (quantityInput) quantityInput.value = preset.quantity;
    if (thresholdInput) thresholdInput.value = preset.reorderThreshold;
    if (storageInput) storageInput.value = preset.storageLocation;
    toast.success(`${preset.label} preset applied.`);
  }

  function exportReagentsCsv() {
    const rows = localInventory.map((item) => [
      item.name,
      groupNameForReagent(item.id),
      stockTone(item, localLatestInventoryEventByReagentId[item.id]).label,
      item.supplier,
      item.catalogNumber,
      item.quantity,
      item.unit,
      item.reorderThreshold,
      item.storageLocation,
      item.lastOrderedAt,
    ]);
    downloadCsv(
      `operations-reagents-${new Date().toISOString().slice(0, 10)}.csv`,
      ["name", "group", "status", "supplier", "catalog_number", "quantity", "unit", "reorder_threshold", "storage_location", "last_ordered_at"],
      rows,
    );
    toast.success("Reagent export downloaded.");
  }

  function exportBookingsCsv() {
    const source = equipmentTab === "all"
      ? localBookings
      : localBookings.filter((booking) => booking.equipmentId === equipmentTab);
    const rows = source.map((booking) => [
      booking.equipmentName,
      booking.title,
      booking.status,
      booking.startsAt,
      booking.endsAt,
      booking.location,
      (bookingConflictMap.get(booking.id) ?? []).length,
      booking.notes,
    ]);
    downloadCsv(
      `operations-bookings-${new Date().toISOString().slice(0, 10)}.csv`,
      ["equipment", "title", "status", "starts_at", "ends_at", "location", "overlap_count", "notes"],
      rows,
    );
    toast.success("Booking export downloaded.");
  }

  function buildReagentScanTargetUrl(reagentId: string) {
    if (!labContext.labId) return null;
    const params = new URLSearchParams({
      panel: "reagents",
      reagent_id: reagentId,
      scan: "1",
      lab_id: labContext.labId,
    });
    const relative = `/labs?${params.toString()}`;
    if (typeof window === "undefined") return relative;
    return `${window.location.origin}${relative}`;
  }

  function buildReagentQrImageUrl(reagentId: string) {
    const target = buildReagentScanTargetUrl(reagentId);
    if (!target) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(target)}`;
  }

  function storeReagentQrTarget(reagentId: string, targetUrl: string) {
    if (typeof window === "undefined" || !labContext.labId) return;
    localStorage.setItem(`operations:reagent-qr-target:${labContext.labId}:${reagentId}`, targetUrl);
  }

  function downloadReagentQr(reagent: InventoryView) {
    const targetUrl = buildReagentScanTargetUrl(reagent.id);
    const imageUrl = buildReagentQrImageUrl(reagent.id);
    if (!targetUrl || !imageUrl) {
      toast.error("Select an active lab before downloading QR.");
      return;
    }
    storeReagentQrTarget(reagent.id, targetUrl);
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `${reagent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR code download started.");
  }

  function printReagentQr(reagent: InventoryView) {
    const targetUrl = buildReagentScanTargetUrl(reagent.id);
    const imageUrl = buildReagentQrImageUrl(reagent.id);
    if (!targetUrl || !imageUrl) {
      toast.error("Select an active lab before printing QR.");
      return;
    }
    storeReagentQrTarget(reagent.id, targetUrl);
    const printWindow = window.open("", "_blank", "width=700,height=900");
    if (!printWindow) {
      toast.error("Allow popups to print QR.");
      return;
    }
    const escapedName = reagent.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedTarget = targetUrl.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    printWindow.document.write(`
      <html>
        <head>
          <title>${escapedName} QR</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; text-align: center; }
            img { width: 320px; height: 320px; }
            .name { margin-top: 16px; font-size: 20px; font-weight: 600; }
            .target { margin-top: 12px; font-size: 12px; color: #334155; word-break: break-all; }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" alt="Reagent QR code" />
          <div class="name">${escapedName}</div>
          <div class="target">${escapedTarget}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function runAction(
    options: RunActionOptions,
    callback: () => Promise<ActionResult>,
    onSuccess?: (result: ActionResult) => void,
  ): Promise<ActionResult | null> {
    if (inFlightActionKeysRef.current.has(options.lockKey)) {
      toast.info(options.duplicateMessage ?? "Request already in progress.");
      return null;
    }

    inFlightActionKeysRef.current.add(options.lockKey);
    setBusy(true);
    try {
      const result = await callback();
      if (result.error) {
        toast.error(`${options.errorContext}: ${result.error}`);
        return null;
      }
      if (!result.success) {
        toast.error(`${options.errorContext}: action did not complete.`);
        return null;
      }

      toast.success(options.successMessage);
      onSuccess?.(result);
      router.refresh();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast.error(`${options.errorContext}: ${message}`);
      return null;
    } finally {
      inFlightActionKeysRef.current.delete(options.lockKey);
      setBusy(false);
    }
  }

  async function submitCreateReagent(formData: FormData) {
    if (!labContext.labId || labContext.featureUnavailable) {
      toast.error("Lab operations are not available in this workspace yet.");
      return;
    }

    const tempId = `temp-reagent-${Date.now()}`;
    const optimisticName = String(formData.get("name") ?? "").trim() || "New reagent";
    const optimisticSupplier = String(formData.get("supplier") ?? "").trim() || null;
    const optimisticQuantity = Number(String(formData.get("quantity") ?? "0")) || 0;
    const optimisticUnit = String(formData.get("unit") ?? "").trim() || null;
    const optimisticThresholdRaw = String(formData.get("reorder_threshold") ?? "").trim();
    const optimisticThreshold = optimisticThresholdRaw ? Number(optimisticThresholdRaw) : null;
    const previousInventory = localInventory;

    setLocalInventory((current) => [
      {
        id: tempId,
        name: optimisticName,
        catalogNumber: null,
        supplier: optimisticSupplier,
        lotNumber: null,
        quantity: optimisticQuantity,
        unit: optimisticUnit,
        reorderThreshold: optimisticThreshold,
        needsReorder: optimisticThreshold !== null ? optimisticQuantity <= optimisticThreshold : false,
        lastOrderedAt: null,
        storageLocation: null,
        notes: null,
        stockEvents: [],
        linkedTaskIds: [],
        messages: [],
      },
      ...current,
    ]);
    setSelectedInventoryId(tempId);

    formData.set("lab_id", labContext.labId);
    formData.set("active_lab_id", labContext.labId);
    const result = await runAction(
      {
        successMessage: "Reagent saved.",
        errorContext: "Unable to save reagent",
        lockKey: "create-reagent",
        duplicateMessage: "Reagent save already in progress.",
      },
      () => actions.createLabReagent(formData),
    );

    if (!result?.success) {
      setLocalInventory(previousInventory);
      setSelectedInventoryId(previousInventory[0]?.id ?? "");
      return;
    }
  }

  async function submitStockEvent(
    labReagentId: string,
    eventType: PlatformInventoryEventType,
    quantityDelta: number,
    note: string,
    unit: string | null,
    options?: {
      vendor?: string | null;
      purchaseOrderNumber?: string | null;
      expectedArrivalAt?: string | null;
    },
  ) {
    if (!labContext.labId) {
      toast.error("Select an active lab before recording stock events.");
      return;
    }

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("lab_reagent_id", labReagentId);
    formData.set("event_type", eventType);
    formData.set("quantity_delta", String(quantityDelta));
    if (unit) {
      formData.set("unit", unit);
    }
    if (options?.vendor) formData.set("vendor", options.vendor);
    if (options?.purchaseOrderNumber) formData.set("purchase_order_number", options.purchaseOrderNumber);
    if (options?.expectedArrivalAt) formData.set("expected_arrival_at", options.expectedArrivalAt);
    formData.set("notes", note);

    const previousEvent = localLatestInventoryEventByReagentId[labReagentId];
    setLocalLatestInventoryEventByReagentId((current) => ({
      ...current,
      [labReagentId]: eventType,
    }));
    const result = await runAction(
      {
        successMessage: "Inventory updated.",
        errorContext: "Unable to update inventory",
        lockKey: `stock-event:${labReagentId}:${eventType}`,
        duplicateMessage: "Inventory update already in progress.",
      },
      () => actions.createReagentStockEvent(formData),
    );

    if (!result?.success) {
      setLocalLatestInventoryEventByReagentId((current) => {
        const next = { ...current };
        if (previousEvent) {
          next[labReagentId] = previousEvent;
        } else {
          delete next[labReagentId];
        }
        return next;
      });
    }
  }

  const selectedReagentPlacedEvent = useMemo(() => {
    if (!selectedInventory) return null;
    return selectedInventory.stockEvents.find((event) => event.event_type === "reorder_placed") ?? null;
  }, [selectedInventory]);

  const selectedReagentReceivedEvent = useMemo(() => {
    if (!selectedInventory) return null;
    return selectedInventory.stockEvents.find((event) => event.event_type === "reorder_received") ?? null;
  }, [selectedInventory]);

  const selectedReagentArrivalEta = useMemo(() => {
    if (selectedReagentReceivedEvent) return null;
    return selectedReagentPlacedEvent?.expected_arrival_at ?? null;
  }, [selectedReagentPlacedEvent, selectedReagentReceivedEvent]);

  async function submitUpdateReagent() {
    if (!labContext.labId || !selectedInventory) {
      setReagentEditError("Select an active lab and reagent before saving changes.");
      return;
    }

    setReagentEditError(null);
    const previous = localInventory;
    const quantity = Number(reagentEditDraft.quantity);
    const threshold =
      reagentEditDraft.reorderThreshold.trim().length > 0
        ? Number(reagentEditDraft.reorderThreshold)
        : null;

    setLocalInventory((current) =>
      current.map((item) =>
        item.id === selectedInventory.id
          ? {
              ...item,
              name: reagentEditDraft.name.trim(),
              supplier: reagentEditDraft.supplier.trim() || null,
              catalogNumber: reagentEditDraft.catalogNumber.trim() || null,
              lotNumber: reagentEditDraft.lotNumber.trim() || null,
              quantity: Number.isFinite(quantity) ? quantity : item.quantity,
              unit: reagentEditDraft.unit.trim() || null,
              reorderThreshold: threshold !== null && Number.isFinite(threshold) ? threshold : null,
              storageLocation: reagentEditDraft.storageLocation.trim() || null,
              notes: reagentEditDraft.notes.trim() || null,
              needsReorder:
                threshold !== null && Number.isFinite(threshold)
                  ? quantity <= threshold
                  : item.needsReorder,
            }
          : item,
      ),
    );

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("lab_reagent_id", selectedInventory.id);
    formData.set("name", reagentEditDraft.name);
    formData.set("supplier", reagentEditDraft.supplier);
    formData.set("catalog_number", reagentEditDraft.catalogNumber);
    formData.set("lot_number", reagentEditDraft.lotNumber);
    formData.set("quantity", reagentEditDraft.quantity);
    formData.set("unit", reagentEditDraft.unit);
    formData.set("reorder_threshold", reagentEditDraft.reorderThreshold);
    formData.set("storage_location", reagentEditDraft.storageLocation);
    formData.set("notes", reagentEditDraft.notes);

    const result = await runAction(
      {
        successMessage: "Reagent changes saved.",
        errorContext: "Unable to save reagent changes",
        lockKey: `reagent-edit:${selectedInventory.id}`,
      },
      () => actions.updateLabReagent(formData),
    );

    if (!result?.success) {
      setLocalInventory(previous);
      setReagentEditError(result?.error ?? "Reagent edit failed.");
      return;
    }

    setIsEditingReagent(false);
  }

  async function submitDeleteReagent() {
    if (!labContext.labId || !selectedInventory) {
      toast.error("Select an active lab and reagent before deleting.");
      return;
    }
    const confirmed = window.confirm(
      `Delete reagent "${selectedInventory.name}"? This removes its inventory record and cannot be undone.`,
    );
    if (!confirmed) return;

    const previous = localInventory;
    setLocalInventory((current) => current.filter((item) => item.id !== selectedInventory.id));
    setSelectedInventoryId((current) =>
      current === selectedInventory.id
        ? previous.find((item) => item.id !== selectedInventory.id)?.id ?? ""
        : current,
    );

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("lab_reagent_id", selectedInventory.id);
    const result = await runAction(
      {
        successMessage: "Reagent deleted.",
        errorContext: "Unable to delete reagent",
        lockKey: `reagent-delete:${selectedInventory.id}`,
      },
      () => actions.deleteLabReagent(formData),
    );

    if (!result?.success) {
      setLocalInventory(previous);
      setSelectedInventoryId(selectedInventory.id);
    }
  }

  async function submitCreateBooking(formData: FormData, onComplete?: () => void) {
    if (!labContext.labId || labContext.featureUnavailable) {
      toast.error("Lab operations are not available in this workspace yet.");
      return;
    }

    const equipmentId = String(formData.get("equipment_id") ?? "").trim();
    const startsAt = String(formData.get("starts_at") ?? "").trim();
    const endsAt = String(formData.get("ends_at") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim() || "New booking";
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const taskId = String(formData.get("task_id") ?? "").trim() || null;
    const equipment = localEquipmentOptions.find((item) => item.id === equipmentId);
    const optimisticStatus: PlatformBookingStatus =
      equipment?.bookingRequiresApproval ? "draft" : "confirmed";
    const tempId = `temp-booking-${Date.now()}`;
    const previousBookings = localBookings;

    if (equipmentId && startsAt && endsAt) {
      setLocalBookings((current) => [
        ...current,
        {
          id: tempId,
          equipmentId,
          equipmentName: equipment?.name ?? "Equipment",
          location: equipment?.location ?? null,
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          status: optimisticStatus,
          bookedBy: labContext.currentUserId,
          bookedByLabel: "You",
          taskId,
          notes,
          bookingRequiresApproval: equipment?.bookingRequiresApproval ?? false,
          linkedTaskIds: [],
          messages: [],
        },
      ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setSelectedBookingId(tempId);
      if (isNarrowMobile && equipmentSection === "booking") setMobileBookingView("detail");
    }

    formData.set("active_lab_id", labContext.labId);
    const result = await runAction(
      {
        successMessage: "Booking created.",
        errorContext: "Unable to create booking",
        lockKey: "create-booking",
        duplicateMessage: "Booking creation already in progress.",
      },
      () => actions.createEquipmentBooking(formData),
      (actionResult) => {
        if (!actionResult.booking) return;
        const savedEquipment = localEquipmentOptions.find((item) => item.id === actionResult.booking!.equipment_id);
        setLocalBookings((current) => {
          const withoutTemp = current.filter((booking) => booking.id !== tempId);
          const nextBooking: BookingView = {
            id: actionResult.booking!.id,
            equipmentId: actionResult.booking!.equipment_id,
            equipmentName: savedEquipment?.name ?? "Equipment",
            location: savedEquipment?.location ?? null,
            title: actionResult.booking!.title,
            startsAt: actionResult.booking!.starts_at,
            endsAt: actionResult.booking!.ends_at,
            status: actionResult.booking!.status,
            bookedBy: actionResult.booking!.booked_by,
            bookedByLabel:
              actionResult.booking!.booked_by && actionResult.booking!.booked_by === labContext.currentUserId
                ? "You"
                : "Lab member",
            taskId: actionResult.booking!.task_id,
            notes: actionResult.booking!.notes,
            bookingRequiresApproval: savedEquipment?.bookingRequiresApproval ?? false,
            linkedTaskIds: [],
            messages: [],
          };
          if (withoutTemp.some((booking) => booking.id === nextBooking.id)) {
            return withoutTemp;
          }
          return [...withoutTemp, nextBooking].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        });
        setSelectedBookingId(actionResult.booking.id);
        if (isNarrowMobile && equipmentSection === "booking") setMobileBookingView("detail");
        onComplete?.();
      },
    );

    if (!result?.success) {
      setLocalBookings(previousBookings);
      setSelectedBookingId(previousBookings[0]?.id ?? "");
      if (isNarrowMobile && previousBookings.length === 0) setMobileBookingView("list");
    }
  }

  async function submitCreateEquipment(formData: FormData, onComplete?: () => void) {
    if (!labContext.labId || labContext.featureUnavailable) {
      toast.error("Lab operations are not available in this workspace yet.");
      return;
    }

    const tempId = `temp-equipment-${Date.now()}`;
    const optimisticName = String(formData.get("name") ?? "").trim() || "New equipment";
    const optimisticLocation = String(formData.get("location") ?? "").trim() || null;
    const optimisticRequiresApproval = String(formData.get("booking_requires_approval") ?? "").trim() === "true";
    const optimisticOutlookCalendarId = String(formData.get("outlook_calendar_id") ?? "").trim() || null;
    const optimisticOutlookCalendarName = String(formData.get("outlook_calendar_name") ?? "").trim() || null;
    const previousEquipment = localEquipmentOptions;

    setLocalEquipmentOptions((current) =>
      [
        ...current,
        {
          id: tempId,
          name: optimisticName,
          description: null,
          location: optimisticLocation,
          bookingRequiresApproval: optimisticRequiresApproval,
          outlookCalendarId: optimisticOutlookCalendarId,
          outlookCalendarName: optimisticOutlookCalendarId ? (optimisticOutlookCalendarName ?? optimisticName) : null,
          outlookSyncOwnerUserId: null,
          isActive: true,
          linkedTaskIds: [],
          messages: [],
        },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setCalendarEquipmentId(tempId);

    formData.set("lab_id", labContext.labId);
    formData.set("active_lab_id", labContext.labId);
    const result = await runAction(
      {
        successMessage: "Equipment created.",
        errorContext: "Unable to create equipment",
        lockKey: "create-equipment",
        duplicateMessage: "Equipment creation already in progress.",
      },
      () => actions.createLabEquipment(formData),
      (actionResult) => {
        if (!actionResult.equipment) return;
        const equipment = actionResult.equipment;
        setLocalEquipmentOptions((current) => {
          const withoutTemp = current.filter((item) => item.id !== tempId);
          if (withoutTemp.some((item) => item.id === equipment.id)) {
            return withoutTemp;
          }
          return [...withoutTemp, {
            id: equipment.id,
            name: equipment.name,
            description: equipment.description,
            location: equipment.location,
            bookingRequiresApproval: equipment.booking_requires_approval,
            outlookCalendarId: equipment.outlook_calendar_id,
            outlookCalendarName: equipment.outlook_calendar_name,
            outlookSyncOwnerUserId: equipment.outlook_sync_owner_user_id,
            isActive: equipment.is_active,
            linkedTaskIds: [],
            messages: [],
          }].sort((a, b) => a.name.localeCompare(b.name));
        });
        setCalendarEquipmentId(equipment.id);
        setSelectedEquipmentId(equipment.id);
        onComplete?.();
      },
    );

    if (!result?.success) {
      setLocalEquipmentOptions(previousEquipment);
      setCalendarEquipmentId(previousEquipment[0]?.id ?? "");
      setSelectedEquipmentId(previousEquipment[0]?.id ?? "");
    }
  }

  async function submitUpdateEquipment(formData: FormData) {
    if (!labContext.labId || !selectedEquipment) {
      setEquipmentEditError("Select an active lab and equipment before saving changes.");
      return;
    }
    setEquipmentEditError(null);
    const previous = localEquipmentOptions;
    const name = String(formData.get("name") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const bookingRequiresApproval = String(formData.get("booking_requires_approval") ?? "").trim() === "true";
    const outlookCalendarId = String(formData.get("outlook_calendar_id") ?? "").trim() || null;
    const outlookCalendarName = String(formData.get("outlook_calendar_name") ?? "").trim() || null;

    setLocalEquipmentOptions((current) =>
      current.map((item) =>
        item.id === selectedEquipment.id
          ? {
              ...item,
              name: name || item.name,
              location,
              description,
              bookingRequiresApproval,
              outlookCalendarId,
              outlookCalendarName: outlookCalendarId ? (outlookCalendarName ?? name ?? item.name) : null,
              outlookSyncOwnerUserId: item.outlookSyncOwnerUserId,
            }
          : item,
      ),
    );

    formData.set("active_lab_id", labContext.labId);
    formData.set("equipment_id", selectedEquipment.id);
    const result = await runAction(
      {
        successMessage: "Equipment changes saved.",
        errorContext: "Unable to save equipment changes",
        lockKey: `equipment-edit:${selectedEquipment.id}`,
      },
      () => actions.updateLabEquipment(formData),
      (actionResult) => {
        if (!actionResult.equipment) return;
        setLocalEquipmentOptions((current) =>
          current
            .map((item) =>
              item.id === actionResult.equipment!.id
                ? {
                    ...item,
                    name: actionResult.equipment!.name,
                    description: actionResult.equipment!.description,
                    location: actionResult.equipment!.location,
                    bookingRequiresApproval: actionResult.equipment!.booking_requires_approval,
                    outlookCalendarId: actionResult.equipment!.outlook_calendar_id,
                    outlookCalendarName: actionResult.equipment!.outlook_calendar_name,
                    outlookSyncOwnerUserId: actionResult.equipment!.outlook_sync_owner_user_id,
                    isActive: actionResult.equipment!.is_active,
                  }
                : item,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
    );

    if (!result?.success) {
      setLocalEquipmentOptions(previous);
      setEquipmentEditError(result?.error ?? "Equipment edit failed.");
    }
  }

  async function submitSetEquipmentActive(equipmentId: string, isActive: boolean) {
    if (!labContext.labId) {
      toast.error("Select an active lab before updating equipment.");
      return;
    }
    const equipment = localEquipmentOptions.find((item) => item.id === equipmentId);
    if (!equipment) return;
    const actionLabel = isActive ? "reactivate" : "deactivate";
    const confirmed = window.confirm(
      `Confirm ${actionLabel} for equipment "${equipment.name}"? You can reverse this later.`,
    );
    if (!confirmed) return;

    const previous = localEquipmentOptions;
    setLocalEquipmentOptions((current) =>
      current.map((item) => (item.id === equipmentId ? { ...item, isActive } : item)),
    );

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("equipment_id", equipmentId);
    formData.set("is_active", String(isActive));
    const result = await runAction(
      {
        successMessage: `Equipment ${isActive ? "reactivated" : "deactivated"}.`,
        errorContext: "Unable to update equipment",
        lockKey: `equipment-active:${equipmentId}:${isActive ? "1" : "0"}`,
      },
      () => actions.setLabEquipmentActive(formData),
      (actionResult) => {
        if (!actionResult.equipment) return;
        setLocalEquipmentOptions((current) =>
          current
            .map((item) =>
              item.id === actionResult.equipment!.id
                ? {
                    ...item,
                    name: actionResult.equipment!.name,
                    description: actionResult.equipment!.description,
                    location: actionResult.equipment!.location,
                    bookingRequiresApproval: actionResult.equipment!.booking_requires_approval,
                    outlookCalendarId: actionResult.equipment!.outlook_calendar_id,
                    outlookCalendarName: actionResult.equipment!.outlook_calendar_name,
                    outlookSyncOwnerUserId: actionResult.equipment!.outlook_sync_owner_user_id,
                    isActive: actionResult.equipment!.is_active,
                  }
                : item,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
    );

    if (!result?.success) {
      setLocalEquipmentOptions(previous);
      return;
    }

    if (!isActive && calendarEquipmentId === equipmentId) {
      const fallback = previous.find((item) => item.isActive && item.id !== equipmentId);
      setCalendarEquipmentId(fallback?.id ?? "");
    }
  }

  async function submitDeleteEquipment(equipmentId: string) {
    if (!labContext.labId) {
      toast.error("Select an active lab before deleting equipment.");
      return;
    }
    const equipment = localEquipmentOptions.find((item) => item.id === equipmentId);
    if (!equipment) return;
    const confirmed = window.confirm(
      `Delete equipment "${equipment.name}"? This also removes its bookings.`,
    );
    if (!confirmed) return;

    const previousEquipment = localEquipmentOptions;
    const previousBookings = localBookings;
    setLocalEquipmentOptions((current) => current.filter((item) => item.id !== equipmentId));
    setLocalBookings((current) => current.filter((booking) => booking.equipmentId !== equipmentId));

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("equipment_id", equipmentId);

    const result = await runAction(
      {
        successMessage: "Equipment deleted.",
        errorContext: "Unable to delete equipment",
        lockKey: `equipment-delete:${equipmentId}`,
      },
      () => actions.deleteLabEquipment(formData),
    );

    if (!result?.success) {
      setLocalEquipmentOptions(previousEquipment);
      setLocalBookings(previousBookings);
      return;
    }

    if (selectedEquipmentId === equipmentId) {
      setSelectedEquipmentId(previousEquipment.find((item) => item.id !== equipmentId)?.id ?? "");
    }
    if (calendarEquipmentId === equipmentId) {
      setCalendarEquipmentId(previousEquipment.find((item) => item.id !== equipmentId && item.isActive)?.id ?? "");
    }
  }

  async function submitBookingStatus(bookingId: string, status: PlatformBookingStatus) {
    const previous = localBookings.find((booking) => booking.id === bookingId);
    setLocalBookings((current) =>
      current.map((booking) => (booking.id === bookingId ? { ...booking, status } : booking)),
    );
    const result = await runAction(
      {
        successMessage: "Booking updated.",
        errorContext: "Unable to update booking",
        lockKey: `booking-status:${bookingId}`,
        duplicateMessage: "Booking update already in progress.",
      },
      () => actions.updateEquipmentBookingStatus(bookingId, status, labContext.labId),
      (result) => {
      if (!result.booking) return;
      setLocalBookings((current) =>
        current.map((booking) =>
          booking.id === result.booking!.id
            ? {
                ...booking,
                status: result.booking!.status,
                bookedBy: result.booking!.booked_by,
                title: result.booking!.title,
                startsAt: result.booking!.starts_at,
                endsAt: result.booking!.ends_at,
                taskId: result.booking!.task_id,
                notes: result.booking!.notes,
              }
            : booking,
        ),
      );
      },
    );

    if (!result?.success && previous) {
      setLocalBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? previous : booking)),
      );
    }
  }

  async function submitUpdateBooking() {
    if (!labContext.labId || !selectedBooking) {
      setBookingEditError("Select an active lab and booking before saving changes.");
      return;
    }

    setBookingEditError(null);
    const previous = localBookings;
    const nextEquipment = localEquipmentOptions.find((item) => item.id === bookingEditDraft.equipmentId);

    setLocalBookings((current) =>
      current.map((booking) =>
        booking.id === selectedBooking.id
          ? {
              ...booking,
              equipmentId: bookingEditDraft.equipmentId,
              equipmentName: nextEquipment?.name ?? booking.equipmentName,
              location: nextEquipment?.location ?? booking.location,
              title: bookingEditDraft.title,
              startsAt: new Date(bookingEditDraft.startsAt).toISOString(),
              endsAt: new Date(bookingEditDraft.endsAt).toISOString(),
              status: bookingEditDraft.status,
              taskId: bookingEditDraft.taskId || null,
              notes: bookingEditDraft.notes || null,
            }
          : booking,
      ),
    );

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("booking_id", selectedBooking.id);
    formData.set("equipment_id", bookingEditDraft.equipmentId);
    formData.set("title", bookingEditDraft.title);
    formData.set("starts_at", bookingEditDraft.startsAt);
    formData.set("ends_at", bookingEditDraft.endsAt);
    formData.set("status", bookingEditDraft.status);
    if (bookingEditDraft.taskId.trim()) {
      formData.set("task_id", bookingEditDraft.taskId.trim());
    }
    if (bookingEditDraft.notes.trim()) {
      formData.set("notes", bookingEditDraft.notes.trim());
    }

    const result = await runAction(
      {
        successMessage: "Booking changes saved.",
        errorContext: "Unable to save booking changes",
        lockKey: `booking-edit:${selectedBooking.id}`,
        duplicateMessage: "Booking save already in progress.",
      },
      () => actions.updateEquipmentBooking(formData),
      (actionResult) => {
        if (!actionResult.booking) return;
        const savedEquipment = localEquipmentOptions.find((item) => item.id === actionResult.booking!.equipment_id);
        setLocalBookings((current) =>
          current.map((booking) =>
            booking.id === actionResult.booking!.id
              ? {
                  ...booking,
                  equipmentId: actionResult.booking!.equipment_id,
                  equipmentName: savedEquipment?.name ?? booking.equipmentName,
                  location: savedEquipment?.location ?? booking.location,
                  title: actionResult.booking!.title,
                  startsAt: actionResult.booking!.starts_at,
                  endsAt: actionResult.booking!.ends_at,
                  status: actionResult.booking!.status,
                  bookedBy: actionResult.booking!.booked_by,
                  taskId: actionResult.booking!.task_id,
                  notes: actionResult.booking!.notes,
                }
              : booking,
          ),
        );
      },
    );

    if (!result?.success) {
      setLocalBookings(previous);
      setBookingEditError(result?.error ?? "Booking edit was blocked. Check permissions and try again.");
      return;
    }

    setIsEditingBooking(false);
  }

  async function submitDeleteBooking(booking: BookingView) {
    if (!labContext.labId) {
      toast.error("Select an active lab before deleting bookings.");
      return;
    }

    const confirmed = window.confirm(
      `Delete booking "${booking.title}" on ${formatDate(booking.startsAt)}? This action can be recreated later if needed.`,
    );
    if (!confirmed) return;

    const previous = localBookings;
    setLocalBookings((current) => current.filter((item) => item.id !== booking.id));
    if (selectedBookingId === booking.id) {
      const fallback = previous.find((item) => item.id !== booking.id);
      setSelectedBookingId(fallback?.id ?? "");
      if (isNarrowMobile && equipmentSection === "booking" && !fallback) {
        setMobileBookingView("list");
      }
    }

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("booking_id", booking.id);

    const result = await runAction(
      {
        successMessage: "Booking deleted.",
        errorContext: "Unable to delete booking",
        lockKey: `booking-delete:${booking.id}`,
      },
      () => actions.deleteEquipmentBooking(formData),
    );

    if (!result?.success) {
      setLocalBookings(previous);
      if (selectedBookingId === booking.id) {
        setSelectedBookingId(booking.id);
      }
      setBookingEditError(result?.error ?? "Booking deletion failed.");
    }
  }

  async function submitTaskLink(
    taskId: string,
    linkedObjectType: PlatformLinkedObjectType,
    linkedObjectId: string,
  ) {
    if (!labContext.labId) {
      toast.error("Select an active lab first.");
      return;
    }

    const formData = new FormData();
    formData.set("active_lab_id", labContext.labId);
    formData.set("task_id", taskId);
    formData.set("linked_object_type", linkedObjectType);
    formData.set("linked_object_id", linkedObjectId);

    await runAction(
      {
        successMessage: "Task linked.",
        errorContext: "Unable to link task",
        lockKey: `task-link:${linkedObjectType}:${linkedObjectId}:${taskId}`,
        duplicateMessage: "Task link request already in progress.",
      },
      () => actions.createTaskLink(formData),
    );
  }

  async function submitMessage(
    linkedObjectType: PlatformLinkedObjectType,
    linkedObjectId: string,
    body: string,
  ) {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Message body is required.");
      return;
    }

    if (!labContext.labId) {
      toast.error("A shared lab context is required before posting messages.");
      return;
    }

    const objectKey = `${linkedObjectType}:${linkedObjectId}`;
    const tempMessageId = `temp-message-${Date.now()}`;
    const previousDraft = linkedObjectType === "lab_reagent"
      ? inventoryMessageDraft
      : linkedObjectType === "lab_equipment"
        ? equipmentMessageDraft
        : bookingMessageDraft;

    setLocalMessagesByObjectKey((current) => ({
      ...current,
      [objectKey]: [
        ...(current[objectKey] ?? []),
        {
          id: tempMessageId,
          authorLabel: "You",
          body: trimmed,
          timestamp: new Date().toISOString(),
        },
      ],
    }));
    if (linkedObjectType === "lab_reagent") {
      setInventoryMessageDraft("");
    } else if (linkedObjectType === "lab_equipment") {
      setEquipmentMessageDraft("");
    } else if (linkedObjectType === "lab_equipment_booking") {
      setBookingMessageDraft("");
    }

    const result = await runAction(
      {
        successMessage: "Note posted.",
        errorContext: "Unable to post note",
        lockKey: `thread-message:${objectKey}`,
        duplicateMessage: "Message post already in progress.",
      },
      () =>
        actions.createObjectMessage({
          labId: labContext.labId!,
          linkedObjectType,
          linkedObjectId,
          body: trimmed,
        }),
      (result) => {
        const createdMessage = result.message;

        if (createdMessage) {
          const savedObjectKey = `${createdMessage.linked_object_type}:${createdMessage.linked_object_id}`;
          setLocalMessagesByObjectKey((current) => {
            const existing = current[savedObjectKey] ?? [];
            const alreadyExists = existing.some((message) => message.id === createdMessage.id);
            if (alreadyExists) {
              return current;
            }

            return {
              ...current,
              [savedObjectKey]: [
                ...existing.filter((message) => message.id !== tempMessageId),
                {
                  id: createdMessage.id,
                  authorLabel: "You",
                  body: createdMessage.body,
                  timestamp: createdMessage.created_at,
                },
              ],
            };
          });
        }
      },
    );

    if (!result?.success) {
      setLocalMessagesByObjectKey((current) => ({
        ...current,
        [objectKey]: (current[objectKey] ?? []).filter((message) => message.id !== tempMessageId),
      }));
      if (linkedObjectType === "lab_reagent") {
        setInventoryMessageDraft(previousDraft);
      } else if (linkedObjectType === "lab_equipment") {
        setEquipmentMessageDraft(previousDraft);
      } else if (linkedObjectType === "lab_equipment_booking") {
        setBookingMessageDraft(previousDraft);
      }
      return;
    }
  }

  function createInventoryGroup() {
    const value = newGroupName.trim();
    if (!value) {
      toast.error("Group name is required.");
      return;
    }
    const existing = new Set(reagentGroups.map((group) => group.toLowerCase()));
    if (existing.has(value.toLowerCase())) {
      toast.error("That group already exists.");
      return;
    }
    setInventoryGroups((current) => [...current, value].sort((a, b) => a.localeCompare(b)));
    if (!groupToRename) {
      setGroupToRename(value);
      setRenameGroupName(value);
    }
    setNewGroupName("");
    toast.success("Group created.");
  }

  function renameInventoryGroup() {
    const from = groupToRename.trim();
    const to = renameGroupName.trim();
    if (!from || !to) {
      toast.error("Choose a group and enter a new name.");
      return;
    }
    if (from === to) {
      toast.info("Group name is unchanged.");
      return;
    }
    const existing = new Set(reagentGroups.map((group) => group.toLowerCase()));
    if (existing.has(to.toLowerCase())) {
      toast.error("That group name already exists.");
      return;
    }

    setInventoryGroups((current) =>
      current.map((group) => (group === from ? to : group)).sort((a, b) => a.localeCompare(b)),
    );
    setReagentGroupById((current) => {
      const next = { ...current };
      for (const [reagentId, group] of Object.entries(next)) {
        if (group === from) {
          next[reagentId] = to;
        }
      }
      return next;
    });
    if (inventoryTab === from) {
      setInventoryTab(to);
    }
    setGroupToRename(to);
    setRenameGroupName(to);
    toast.success("Group renamed.");
  }

  function deleteInventoryGroup() {
    const target = groupToRename.trim();
    if (!target) {
      toast.error("Choose a group to delete.");
      return;
    }
    const confirmed = window.confirm(
      `Delete group "${target}"? Reagents in this group will move to Ungrouped.`,
    );
    if (!confirmed) return;

    setInventoryGroups((current) => current.filter((group) => group !== target));
    setReagentGroupById((current) => {
      const next = { ...current };
      for (const [reagentId, group] of Object.entries(next)) {
        if (group === target) {
          delete next[reagentId];
        }
      }
      return next;
    });
    if (inventoryTab === target) {
      setInventoryTab("all");
    }
    const nextGroup = reagentGroups.find((group) => group !== target) ?? "";
    setGroupToRename(nextGroup);
    setRenameGroupName(nextGroup);
    toast.success("Group deleted.");
  }

  const draftReorders = localInventory.filter(
    (item) => stockTone(item, localLatestInventoryEventByReagentId[item.id]).label === "Reorder needed",
  ).length;
  const activeBookings = localBookings.filter(
    (item) => item.status === "confirmed" || item.status === "in_use",
  ).length;
  const canManageEquipment = labContext.role === "manager" || labContext.role === "admin";
  const canDeleteReagent = Boolean(labContext.role);
  const approverNamesText = approverLabels.length > 0
    ? approverLabels.join(", ")
    : "Lab managers and admins";
  const canEditBooking = (booking: BookingView) =>
    canManageEquipment || booking.bookedBy === labContext.currentUserId;
  const canEditSelectedBooking =
    selectedBooking
      ? canEditBooking(selectedBooking)
      : false;
  const equipmentCalendarBookings = useMemo(() => {
    const dayFilter = calendarDateFilter.trim();
    return localBookings
      .filter((booking) => booking.equipmentId === calendarEquipmentId)
      .filter((booking) => {
        if (!dayFilter) return true;
        return toLocalDateKey(booking.startsAt) === dayFilter;
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [calendarDateFilter, calendarEquipmentId, localBookings]);

  const monthGridDays = useMemo(() => {
    const start = startOfCalendarGrid(calendarMonth);
    const end = endOfCalendarGrid(calendarMonth);
    const days: Date[] = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [calendarMonth]);

  const calendarAnchorDate = useMemo(() => {
    if (calendarDateFilter) {
      const parsed = new Date(`${calendarDateFilter}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }, [calendarDateFilter]);

  const weekStartDate = useMemo(
    () => addDays(calendarAnchorDate, -calendarAnchorDate.getDay()),
    [calendarAnchorDate],
  );

  const weekGridDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate],
  );

  const visibleCalendarDays = calendarView === "week" ? weekGridDays : monthGridDays;

  const monthBookingsByDay = useMemo(() => {
    const map = new Map<string, BookingView[]>();
    for (const booking of localBookings) {
      if (booking.equipmentId !== calendarEquipmentId) continue;
      const dayKey = toLocalDateKey(booking.startsAt);
      map.set(dayKey, [...(map.get(dayKey) ?? []), booking]);
    }
    for (const [key, value] of map.entries()) {
      map.set(key, value.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    }
    return map;
  }, [calendarEquipmentId, localBookings]);

  const withLocalMessages = (objectType: PlatformLinkedObjectType, objectId: string, messages: MessageView[]) => {
    const objectKey = `${objectType}:${objectId}`;
    const localMessages = localMessagesByObjectKey[objectKey] ?? [];
    if (localMessages.length === 0) {
      return messages;
    }

    const merged = new Map<string, MessageView>();
    for (const message of messages) {
      merged.set(message.id, message);
    }
    for (const message of localMessages) {
      merged.set(message.id, message);
    }

    return [...merged.values()].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return aTime - bTime;
    });
  };

  function prefillBookingForDay(day: Date) {
    const form = bookingFormRef.current;
    if (!form || !calendarEquipmentId) return;

    const selectedDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
    const selectedDayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0);
    const equipmentInput = form.elements.namedItem("equipment_id") as HTMLInputElement | null;
    const startsAtInput = form.elements.namedItem("starts_at") as HTMLInputElement | null;
    const endsAtInput = form.elements.namedItem("ends_at") as HTMLInputElement | null;
    const titleInput = form.elements.namedItem("title") as HTMLInputElement | null;

    if (equipmentInput) equipmentInput.value = calendarEquipmentId;
    if (startsAtInput) startsAtInput.value = formatDateTimeLocalInput(selectedDay);
    if (endsAtInput) endsAtInput.value = formatDateTimeLocalInput(selectedDayEnd);
    setCalendarDateFilter(toLocalDateKey(day));
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    titleInput?.focus();
  }

  function handleSelectBooking(bookingId: string) {
    setSelectedBookingId(bookingId);
    if (isNarrowMobile && equipmentSection === "booking") {
      setMobileBookingView("detail");
    }
  }

  function handleSelectEquipmentForBookings(equipmentId: string) {
    setEquipmentTab(equipmentId);
    setSelectedEquipmentId(equipmentId);
    setCalendarEquipmentId(equipmentId);
    if (isNarrowMobile) {
      setMobileBookingView("list");
      setEquipmentSection("calendar");
      setMobileCalendarView("calendar");
    }
  }

  const equipmentCalendarCard = (
    <Card className="border-white/80 bg-white/90">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base text-slate-900">Equipment calendar</CardTitle>
            {embedded ? null : (
              <CardDescription className="text-slate-600">View bookings by equipment and date.</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isNarrowMobile ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-200"
                onClick={() => {
                  setEquipmentSection("booking");
                  setEquipmentTab("all");
                  setMobileBookingView("equipment");
                }}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Setups
              </Button>
            ) : null}
            {isNarrowMobile && selectedCalendarEquipment ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-200"
                onClick={() => setMobileCalendarView("chat")}
              >
                Open chatroom
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Equipment</Label>
          {equipmentTab === "all" ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {localEquipmentOptions.length === 0 ? (
                <p className="text-sm text-slate-600">No equipment available yet.</p>
              ) : (
                localEquipmentOptions.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={calendarEquipmentId === option.id ? "default" : "outline"}
                    className={cn(
                      "rounded-full whitespace-nowrap",
                      calendarEquipmentId === option.id
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "border-slate-200",
                    )}
                    onClick={() => setCalendarEquipmentId(option.id)}
                  >
                    {option.name}
                  </Button>
                ))
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {localEquipmentOptions.find((item) => item.id === equipmentTab)?.name ?? "Equipment"}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <Button
              type="button"
              size="sm"
              variant={calendarView === "week" ? "default" : "ghost"}
              className={cn(calendarView === "week" ? "bg-slate-900 text-white hover:bg-slate-800" : "text-slate-700")}
              onClick={() => setCalendarView("week")}
            >
              Week
            </Button>
            <Button
              type="button"
              size="sm"
              variant={calendarView === "month" ? "default" : "ghost"}
              className={cn(calendarView === "month" ? "bg-slate-900 text-white hover:bg-slate-800" : "text-slate-700")}
              onClick={() => setCalendarView("month")}
            >
              Month
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full"
              onClick={() => {
                if (calendarView === "week") {
                  const target = addDays(weekStartDate, -7);
                  setCalendarDateFilter(toLocalDateKey(target));
                } else {
                  setCalendarMonth((current) => addMonths(current, -1));
                }
              }}
              aria-label={calendarView === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full"
              onClick={() => {
                if (calendarView === "week") {
                  const target = addDays(weekStartDate, 7);
                  setCalendarDateFilter(toLocalDateKey(target));
                } else {
                  setCalendarMonth((current) => addMonths(current, 1));
                }
              }}
              aria-label={calendarView === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm font-semibold text-slate-900">
            {calendarView === "week"
              ? `${weekStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${addDays(weekStartDate, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-slate-200"
            onClick={() => {
              const today = new Date();
              setCalendarMonth(startOfMonth(today));
              setCalendarDateFilter(toLocalDateKey(today));
            }}
          >
            Today
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="rounded-md bg-slate-100 py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {visibleCalendarDays.map((day) => {
            const dayKey = toLocalDateKey(day);
            const bookingsForDay = monthBookingsByDay.get(dayKey) ?? [];
            const conflictCount = bookingsForDay.filter(
              (booking) => (bookingConflictMap.get(booking.id) ?? []).length > 0,
            ).length;
            const isCurrentMonth = calendarView === "week" ? true : day.getMonth() === calendarMonth.getMonth();
            const isToday = dayKey === toLocalDateKey(new Date());
            const isSelectedDay = calendarDateFilter === dayKey;

            return (
              <div
                key={dayKey}
                className={cn(
                  "min-h-[116px] rounded-lg border p-1.5",
                  isCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/70",
                  isSelectedDay ? "ring-2 ring-sky-200" : "",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs",
                      isToday ? "bg-slate-900 text-white" : "text-slate-700",
                    )}
                    onClick={() => prefillBookingForDay(day)}
                    title="Create booking on this date"
                  >
                    {day.getDate()}
                  </button>
                  {conflictCount > 0 ? (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                      {conflictCount}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {bookingsForDay.slice(0, 3).map((booking) => {
                    const conflicts = bookingConflictMap.get(booking.id) ?? [];
                    const hasConflict = conflicts.length > 0;
                    const bookingWindow = formatBookingWindow(booking.startsAt, booking.endsAt);
                    const ownerTone = ownerColor(booking.bookedBy ?? booking.bookedByLabel);
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        className={cn(
                          "group relative block w-full rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight",
                          calendarBookingTone(booking.status, hasConflict),
                        )}
                        onClick={() => {
                          setSelectedBookingId(booking.id);
                          setCalendarDateFilter(dayKey);
                        }}
                      >
                        <p className="truncate font-semibold">{bookingWindow.time.split(" - ")[0]}</p>
                        <p className="truncate">{booking.title}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 truncate">
                          <span className={cn("h-1.5 w-1.5 rounded-full", ownerTone.dot)} />
                          {booking.bookedByLabel}
                        </p>
                        <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-52 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg group-hover:block group-focus-within:block">
                          <span className="block font-semibold text-slate-900">{booking.title}</span>
                          <span className="mt-0.5 block">{bookingWindow.time}</span>
                          <span className="mt-0.5 block">Owner: {booking.bookedByLabel}</span>
                          <span className="mt-0.5 block">
                            Status: {bookingStatusLabel(booking.status, booking.bookingRequiresApproval)}
                          </span>
                          {hasConflict ? (
                            <span className="mt-0.5 block text-red-700">
                              Overlaps with {conflicts.length} booking{conflicts.length === 1 ? "" : "s"}.
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                  {bookingsForDay.length > 3 ? (
                    <p className="px-1 text-[10px] font-medium text-slate-500">
                      +{bookingsForDay.length - 3} more
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Conflict heatmap (next days)</p>
          {calendarConflictHeatmap.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No booking activity for this equipment yet.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {calendarConflictHeatmap.map((entry) => (
                <div
                  key={entry.day}
                  className={cn(
                    "rounded-xl border px-3 py-2",
                    entry.conflicts > 0
                      ? "border-red-200 bg-red-50"
                      : entry.total > 2
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50",
                  )}
                >
                  <p className="text-xs font-semibold text-slate-700">{formatDate(entry.day)}</p>
                  <p className="text-xs text-slate-600">
                    {entry.total} booking{entry.total === 1 ? "" : "s"} · {entry.conflicts} conflict{entry.conflicts === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Selected date</Label>
            <Input
              type="date"
              value={calendarDateFilter}
              onChange={(event) => setCalendarDateFilter(event.target.value)}
              className="mt-1 border-slate-200 bg-white"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-200"
              onClick={() => setCalendarDateFilter("")}
            >
              Clear date filter
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {equipmentCalendarBookings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No bookings for this equipment/date yet.
            </p>
          ) : (
            equipmentCalendarBookings.map((booking) => {
              const conflicts = bookingConflictMap.get(booking.id) ?? [];
              const hasConflict = conflicts.length > 0;
              const ownerTone = ownerColor(booking.bookedBy ?? booking.bookedByLabel);
              const canDelete = canEditBooking(booking);
              const canChangeStatus = canEditBooking(booking);
              const statusDraft = calendarStatusDraftByBookingId[booking.id] ?? booking.status;
              return (
                <div
                  key={booking.id}
                  className={cn(
                    "rounded-2xl border px-4 py-3",
                    hasConflict ? "border-red-200 bg-red-50/70" : "border-slate-200 bg-slate-50/70",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="text-sm font-medium text-slate-900"
                      onClick={() => handleSelectBooking(booking.id)}
                    >
                      {booking.title}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("border", bookingTone(booking.status))}>
                        {bookingStatusLabel(booking.status, booking.bookingRequiresApproval)}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        disabled={!canDelete || busy}
                        onClick={() => void submitDeleteBooking(booking)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {formatDate(booking.startsAt)} · {formatBookingWindow(booking.startsAt, booking.endsAt).time}
                  </p>
                  <p className="mt-1">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", ownerTone.chip)}>
                      <span className={cn("h-2 w-2 rounded-full", ownerTone.dot)} />
                      {booking.bookedByLabel}
                    </span>
                  </p>
                  {hasConflict ? (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      Overlaps with {conflicts.length} booking{conflicts.length === 1 ? "" : "s"}.
                    </p>
                  ) : null}
                  {canChangeStatus ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={statusDraft}
                        onChange={(event) =>
                          setCalendarStatusDraftByBookingId((current) => ({
                            ...current,
                            [booking.id]: event.target.value as PlatformBookingStatus,
                          }))
                        }
                        disabled={busy}
                        className="h-8 min-w-40 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                      >
                        <option value="draft">Waiting for approval</option>
                        <option value="confirmed">Scheduled (confirmed)</option>
                        <option value="in_use">In use</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-slate-200"
                        disabled={busy || statusDraft === booking.status}
                        onClick={() => void submitBookingStatus(booking.id, statusDraft)}
                      >
                        Apply
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className={cn(embedded ? "space-y-3 overflow-x-hidden" : "space-y-5", "min-w-0 ops-mobile-compact")} aria-busy={busy}>
      {embedded ? null : (
      <section className="overflow-hidden rounded-3xl border border-white/80 bg-[linear-gradient(135deg,#ecfeff_0%,#f8fafc_45%,#fff7ed_100%)] p-5 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.3)] sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full border-cyan-200 bg-cyan-50 text-cyan-800">
                {labContext.labName ? `Using ${labContext.labName}` : "No lab selected"}
              </Badge>
              {labContext.role ? (
                <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                  {labContext.role} access
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {UI_SURFACE_TITLES.operations}
            </h1>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
              <span>Inventory, reorders, and equipment bookings.</span>
              <HelpHint text="Track stock, manage reorders, and schedule shared equipment." />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <FlaskConical className="h-3.5 w-3.5" />
                Reagents tracked
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{localInventory.length}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <PackagePlus className="h-3.5 w-3.5" />
                Reorders needed
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{draftReorders}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" />
                Active bookings
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{activeBookings}</p>
            </div>
          </div>
        </div>

        {labContext.warning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {labContext.warning}
          </div>
        ) : null}
      </section>
      )}

      <Tabs
        value={activeSurfaceTab}
        onValueChange={(value) => {
          if (embedded) return;
          if (value === "inventory" || value === "bookings" || value === "handoff") {
            setSurfaceTab(value);
          }
        }}
        className="gap-4"
      >
        {embedded ? null : (
          <TabsList className="w-full justify-start rounded-2xl border border-white/80 bg-white/85 p-1">
            <TabsTrigger value="inventory" className="rounded-xl px-4">
              Inventory
            </TabsTrigger>
            <TabsTrigger value="bookings" className="rounded-xl px-4">
              Equipment
            </TabsTrigger>
            <TabsTrigger value="handoff" className="rounded-xl px-4">
              Summary
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="inventory" className={cn("min-w-0", embedded ? "space-y-5" : "space-y-4")}>
          {embedded && initialTab === "inventory" && inventoryOnBack ? (
            <div className="mb-1 flex justify-end">
              <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={inventoryOnBack}>
                Back
              </Button>
            </div>
          ) : null}
          <div
            className={cn(
              "grid min-w-0",
              showInventoryRightRail ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]" : "grid-cols-1",
              embedded ? "gap-5" : "gap-4",
            )}
          >
            <div className="min-w-0 space-y-4">
              {showInventoryListCard ? (
              <Card className={cn("bg-white/95", embedded ? "border-slate-200/70 shadow-none" : "border-white/80")}>
                <CardHeader className="pb-4">
                  <div className={cn("flex flex-col", embedded ? "gap-4" : "gap-3")}>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CardTitle className={cn("text-slate-900", embedded ? "text-lg" : "text-base")}>Shared reagent inventory</CardTitle>
                        <HelpHint text="Shows stock levels and reorder state for each item." />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        ref={inventorySearchInputRef}
                        value={inventorySearch}
                        onChange={(event) => setInventorySearch(event.target.value)}
                        placeholder="Search by name, supplier, or catalog"
                        aria-label="Filter reagents"
                        className="w-full border-slate-200 bg-white sm:flex-1"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-slate-200"
                          onClick={() =>
                            setSelectedReagentIds(
                              areAllVisibleReagentsSelected ? [] : filteredInventory.map((item) => item.id),
                            )
                          }
                        >
                          {areAllVisibleReagentsSelected ? "Clear visible" : "Select visible"}
                        </Button>
                        <Badge variant="outline" className="h-8 border-slate-200 bg-white px-2 text-slate-700">
                          {selectedReagentIds.length}
                        </Badge>
                      </div>
                    </div>
                    <Tabs value={inventoryTab} onValueChange={setInventoryTab} className="w-full">
                      <TabsList
                        className={cn(
                          "h-auto w-full justify-start rounded-xl border border-slate-200 bg-slate-50 p-1",
                          embedded ? "min-w-0 flex-wrap gap-1 overflow-x-hidden" : "overflow-x-auto",
                        )}
                      >
                        <TabsTrigger value="all" className="max-w-full whitespace-nowrap rounded-lg px-3 py-2">
                          All Reagents
                        </TabsTrigger>
                        {reagentGroups.map((group) => (
                          <TabsTrigger key={group} value={group} className="max-w-full truncate whitespace-nowrap rounded-lg px-3 py-2">
                            {group}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-800">
                        Advanced actions
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-slate-200"
                            onClick={exportReagentsCsv}
                            disabled={localInventory.length === 0}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Export
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={bulkGroupTarget}
                            onChange={(event) => setBulkGroupTarget(event.target.value)}
                            className="h-9 min-w-[10rem] rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                          >
                            <option value="Ungrouped">Ungrouped</option>
                            {reagentGroups.map((group) => (
                              <option key={group} value={group}>
                                {group}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-slate-200"
                            onClick={applyBulkGroup}
                            disabled={selectedReagentIds.length === 0 || busy}
                          >
                            <Layers3 className="mr-1.5 h-3.5 w-3.5" />
                            Apply group
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-slate-200"
                            onClick={() => void applyBulkStatus(REORDER_EVENT_MAP.request)}
                            disabled={selectedReagentIds.length === 0 || busy}
                          >
                            Mark needed
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-slate-200"
                            onClick={() => void applyBulkStatus(REORDER_EVENT_MAP.placed)}
                            disabled={selectedReagentIds.length === 0 || busy}
                          >
                            Mark placed
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => void applyBulkStatus(REORDER_EVENT_MAP.received)}
                            disabled={selectedReagentIds.length === 0 || busy}
                          >
                            Mark received
                          </Button>
                        </div>

                        <div className="rounded-lg bg-white/85 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Group manager</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                            <Input
                              value={newGroupName}
                              onChange={(event) => setNewGroupName(event.target.value)}
                              placeholder="New group name"
                              disabled={!canManageEquipment}
                              className="border-slate-200 bg-white"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={createInventoryGroup}
                              disabled={!canManageEquipment || busy}
                              className="border-slate-200"
                            >
                              Create group
                            </Button>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                            <select
                              value={groupToRename}
                              onChange={(event) => {
                                setGroupToRename(event.target.value);
                                setRenameGroupName(event.target.value);
                              }}
                              disabled={!canManageEquipment || reagentGroups.length === 0}
                              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                            >
                              <option value="" disabled>
                                Select group
                              </option>
                              {reagentGroups.map((group) => (
                                <option key={group} value={group}>
                                  {group}
                                </option>
                              ))}
                            </select>
                            <Input
                              value={renameGroupName}
                              onChange={(event) => setRenameGroupName(event.target.value)}
                              disabled={!canManageEquipment || !groupToRename}
                              placeholder="Rename group"
                              className="border-slate-200 bg-white"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="border-slate-200"
                              onClick={renameInventoryGroup}
                              disabled={!canManageEquipment || !groupToRename || busy}
                            >
                              Rename
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              onClick={deleteInventoryGroup}
                              disabled={!canManageEquipment || !groupToRename || busy}
                            >
                              Delete
                            </Button>
                          </div>
                          {!canManageEquipment ? (
                            <p className="mt-2 text-xs text-slate-500">Only lab managers and admins can manage groups.</p>
                          ) : null}
                        </div>
                      </div>
                    </details>
                  </div>
                </CardHeader>
                <CardContent className={cn(embedded ? "space-y-2" : "space-y-3")}>
                  {filteredInventory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      {localInventory.length === 0
                        ? "No reagents yet. Add your first reagent to start tracking inventory."
                        : inventoryTab === "all"
                          ? "No reagents match the current search."
                          : `No reagents in ${inventoryTab}.`}
                      {isInventorySearchMode ? (
                        <div className="mt-4">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            onClick={revealAddReagentCard}
                            disabled={busy || !labContext.labId || labContext.featureUnavailable}
                          >
                            <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                            Add reagent
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    filteredInventory.map((item) => {
                      const stock = stockTone(item, localLatestInventoryEventByReagentId[item.id]);
                      const groupName = groupNameForReagent(item.id);
                      const available = Math.max(item.quantity, 0);
                      const threshold = item.reorderThreshold ?? 0;
                      const meterWidth = Math.min((available / Math.max(threshold * 2 || 1, 1)) * 100, 100);

                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectInventory(item.id, true)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            selectInventory(item.id, true);
                          }}
                          className={cn(
                            "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                            selectedInventory?.id === item.id
                              ? "border-cyan-300 bg-cyan-50/70"
                              : `${stock.panel} hover:bg-slate-50`,
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <label
                              className="inline-flex items-center gap-2 text-xs text-slate-600"
                            >
                              <input
                                type="checkbox"
                                checked={selectedReagentIds.includes(item.id)}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  selectInventory(item.id);
                                  setSelectedReagentIds((current) => {
                                    if (checked) return [...new Set([...current, item.id])];
                                    return current.filter((id) => id !== item.id);
                                  });
                                }}
                              />
                              Select
                            </label>
                          </div>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {(item.supplier ?? "Unknown supplier")}
                                {item.catalogNumber ? ` · ${item.catalogNumber}` : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                {groupName}
                              </Badge>
                              <Badge variant="outline" className={cn("border", stock.badge)}>
                                {stock.label}
                              </Badge>
                            </div>
                          </div>

                          {embedded ? (
                            <details
                              className="mt-2 rounded-lg border border-slate-200 bg-white/90 p-2"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <summary
                                className="cursor-pointer text-xs font-medium text-slate-700"
                                onClick={(event) => event.stopPropagation()}
                              >
                                More
                              </summary>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-slate-200 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    downloadReagentQr(item);
                                  }}
                                >
                                  Download QR
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-slate-200 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    printReagentQr(item);
                                  }}
                                >
                                  Print QR
                                </Button>
                              </div>
                            </details>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-slate-200 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  downloadReagentQr(item);
                                }}
                              >
                                Download QR
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-slate-200 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  printReagentQr(item);
                                }}
                              >
                                Print QR
                              </Button>
                            </div>
                          )}

                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>
                                {available} {item.unit ?? "units"}
                              </span>
                              <span>
                                {item.reorderThreshold === null ? "No threshold" : `Threshold ${item.reorderThreshold}`}
                              </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={cn("h-full rounded-full", stock.bar)}
                                style={{ width: `${meterWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
              ) : null}

              {showInventoryAddCard ? (
              <Card className={cn("bg-white/95", embedded ? "border-slate-200/70 shadow-none" : "border-white/80")}>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base text-slate-900">Add reagent</CardTitle>
                  {embedded ? null : (
                    <CardDescription className="text-slate-600">Add a new reagent to the shared lab inventory.</CardDescription>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {REAGENT_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-slate-200 bg-white"
                        onClick={() => applyReagentPreset(preset)}
                        disabled={busy || !labContext.labId || labContext.featureUnavailable}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <form
                    ref={reagentFormRef}
                    className="grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitCreateReagent(new FormData(event.currentTarget));
                    }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          name="name"
                          required
                          aria-label="Reagent name"
                          disabled={busy || !labContext.labId || labContext.featureUnavailable}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Supplier</Label>
                        <Input name="supplier" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                      </div>
                    </div>
                        <div className={cn("grid gap-3", embedded ? "" : "sm:grid-cols-3")}>
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Input name="quantity" type="number" step="0.01" defaultValue="0" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                      </div>
                      <div>
                        <Label className="text-xs">Unit</Label>
                        <Input name="unit" placeholder="vials" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                      </div>
                      <div>
                        <Label className="text-xs">Reorder Threshold</Label>
                        <Input name="reorder_threshold" type="number" step="0.01" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Catalog Number</Label>
                        <Input name="catalog_number" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                      </div>
                      <div>
                        <Label className="text-xs">Lot Number</Label>
                        <Input name="lot_number" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Storage Location</Label>
                      <Input name="storage_location" disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                    </div>
                    <div>
                      <Label className="text-xs">Notes</Label>
                      <Textarea name="notes" rows={2} disabled={busy || !labContext.labId || labContext.featureUnavailable} />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={busy || !labContext.labId || labContext.featureUnavailable}
                        className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                      >
                        Save reagent
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
              ) : null}
            </div>

            {shouldUseSlidingInventoryDetail && inventoryDetailOpen ? (
              <button
                type="button"
                aria-label="Close reagent panel backdrop"
                className="fixed inset-0 z-40 bg-slate-900/25"
                onClick={() => setInventoryDetailOpen(false)}
              />
            ) : null}
            {showInlineInventoryRightRail ? (
            <div className="min-w-0 space-y-4">
              {showInventoryDetailCard ? (
              <Card className={cn("bg-white/95", embedded ? "border-slate-200/70 shadow-none" : "border-white/80")}>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base text-slate-900">
                    {selectedInventory ? selectedInventory.name : "Select a reagent"}
                  </CardTitle>
                  {embedded ? null : (
                    <CardDescription className="mt-1 text-slate-600">
                      Review stock levels and update reorder activity.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedInventory ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      Select a reagent to view details.
                    </div>
                  ) : (
                    <div ref={reagentDetailRef} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "border",
                            stockTone(
                              selectedInventory,
                              localLatestInventoryEventByReagentId[selectedInventory.id],
                            ).badge,
                          )}
                        >
                          {
                            stockTone(
                              selectedInventory,
                              localLatestInventoryEventByReagentId[selectedInventory.id],
                            ).label
                          }
                        </Badge>
                        <select
                          value={groupNameForReagent(selectedInventory.id)}
                          onChange={(event) =>
                            setReagentGroupById((current) => ({
                              ...current,
                              [selectedInventory.id]: event.target.value,
                            }))
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                        >
                          <option value="Ungrouped">Ungrouped</option>
                          {reagentGroups.map((group) => (
                            <option key={group} value={group}>
                              {group}
                            </option>
                          ))}
                        </select>
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                          onClick={() => {
                            setIsEditingReagent((current) => !current);
                            setReagentEditError(null);
                          }}
                        >
                          {isEditingReagent ? "Cancel edit" : "Edit reagent"}
                        </Button>
                      </div>
                      {embedded ? (
                        <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            More
                          </summary>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              disabled={!canDeleteReagent || busy}
                              onClick={() => void submitDeleteReagent()}
                            >
                              Delete
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-slate-200"
                              onClick={() => downloadReagentQr(selectedInventory)}
                            >
                              Download QR
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-slate-200"
                              onClick={() => printReagentQr(selectedInventory)}
                            >
                              Print QR
                            </Button>
                          </div>
                        </details>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                            disabled={!canDeleteReagent || busy}
                            onClick={() => void submitDeleteReagent()}
                          >
                            Delete
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-slate-200"
                            onClick={() => downloadReagentQr(selectedInventory)}
                          >
                            Download QR
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-slate-200"
                            onClick={() => printReagentQr(selectedInventory)}
                          >
                            Print QR
                          </Button>
                        </div>
                      )}
                      {!canDeleteReagent ? (
                        <p className="text-xs text-slate-500">Active lab membership is required to delete reagents.</p>
                      ) : null}
                      {reagentEditError ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                          {reagentEditError}
                        </p>
                      ) : null}

                      {isEditingReagent ? (
                        <form
                          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitUpdateReagent();
                          }}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs">Name</Label>
                              <Input
                                value={reagentEditDraft.name}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, name: event.target.value }))
                                }
                                required
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Supplier</Label>
                              <Input
                                value={reagentEditDraft.supplier}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, supplier: event.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs">Catalog number</Label>
                              <Input
                                value={reagentEditDraft.catalogNumber}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, catalogNumber: event.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Lot number</Label>
                              <Input
                                value={reagentEditDraft.lotNumber}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, lotNumber: event.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <Label className="text-xs">Quantity</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={reagentEditDraft.quantity}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, quantity: event.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Unit</Label>
                              <Input
                                value={reagentEditDraft.unit}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, unit: event.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Reorder threshold</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={reagentEditDraft.reorderThreshold}
                                onChange={(event) =>
                                  setReagentEditDraft((current) => ({ ...current, reorderThreshold: event.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Storage location</Label>
                            <Input
                              value={reagentEditDraft.storageLocation}
                              onChange={(event) =>
                                setReagentEditDraft((current) => ({ ...current, storageLocation: event.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Notes</Label>
                            <Textarea
                              rows={2}
                              value={reagentEditDraft.notes}
                              onChange={(event) =>
                                setReagentEditDraft((current) => ({ ...current, notes: event.target.value }))
                              }
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" className="border-slate-200" onClick={() => setIsEditingReagent(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" disabled={busy} className="bg-slate-900 text-white hover:bg-slate-800">
                              Save reagent changes
                            </Button>
                          </div>
                        </form>
                      ) : null}

                      {scanMode ? (
                        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-800">Quick scan actions</p>
                          <p className="mt-1 text-sm text-cyan-900">Use this panel for fast updates after scanning.</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_1fr]">
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={scanUsageAmount}
                              onChange={(event) => setScanUsageAmount(event.target.value)}
                              aria-label="Usage amount"
                              className="border-cyan-200 bg-white"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="border-cyan-300 bg-white"
                              disabled={busy || labContext.featureUnavailable}
                              onClick={() => {
                                const parsed = Number(scanUsageAmount);
                                if (!Number.isFinite(parsed) || parsed <= 0) {
                                  toast.error("Enter a usage amount greater than zero.");
                                  return;
                                }
                                void submitStockEvent(
                                  selectedInventory.id,
                                  "consume",
                                  -Math.abs(parsed),
                                  "Usage logged from scan.",
                                  selectedInventory.unit,
                                );
                              }}
                            >
                              Log usage
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-cyan-300 bg-white"
                              disabled={busy || labContext.featureUnavailable}
                              onClick={() => void submitStockEvent(
                                selectedInventory.id,
                                REORDER_EVENT_MAP.request,
                                0,
                                "Reorder requested from scan.",
                                selectedInventory.unit,
                              )}
                            >
                              Mark reorder needed
                            </Button>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="border-cyan-300 bg-white"
                              disabled={busy || labContext.featureUnavailable}
                              onClick={() => void submitStockEvent(
                                selectedInventory.id,
                                REORDER_EVENT_MAP.placed,
                                0,
                                "Order placed from scan.",
                                selectedInventory.unit,
                              )}
                            >
                              Mark placed
                            </Button>
                            <Button
                              type="button"
                              className="bg-cyan-700 text-white hover:bg-cyan-800"
                              disabled={busy || labContext.featureUnavailable}
                              onClick={() => void submitStockEvent(
                                selectedInventory.id,
                                REORDER_EVENT_MAP.received,
                                Math.max(selectedInventory.reorderThreshold ?? 1, 1),
                                "Order received from scan.",
                                selectedInventory.unit,
                              )}
                            >
                              Mark received
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div
                          className={cn(
                            "rounded-2xl border p-3",
                            stockTone(
                              selectedInventory,
                              localLatestInventoryEventByReagentId[selectedInventory.id],
                            ).panel,
                          )}
                        >
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Quantity</p>
                          <p className="mt-1 text-xl font-semibold text-slate-900">
                            {selectedInventory.quantity} {selectedInventory.unit ?? "units"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Last ordered</p>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {formatDateTime(selectedInventory.lastOrderedAt)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Expected arrival</p>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {selectedReagentArrivalEta ? formatDateTime(selectedReagentArrivalEta) : "Not recorded"}
                          </p>
                          {selectedReagentPlacedEvent?.purchase_order_number ? (
                            <p className="mt-1 text-xs text-slate-600">
                              PO: {selectedReagentPlacedEvent.purchase_order_number}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
                        <div>
                          <Label className="text-xs">Vendor</Label>
                          <Input
                            className="mt-1 border-slate-200 bg-white"
                            value={reorderVendorInput}
                            onChange={(event) => setReorderVendorInput(event.target.value)}
                            placeholder="e.g., Sigma"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">PO Number</Label>
                          <Input
                            className="mt-1 border-slate-200 bg-white"
                            value={reorderPoInput}
                            onChange={(event) => setReorderPoInput(event.target.value)}
                            placeholder="e.g., PO-2026-0142"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Expected Arrival</Label>
                          <Input
                            className="mt-1 border-slate-200 bg-white"
                            type="datetime-local"
                            value={reorderEtaInput}
                            onChange={(event) => setReorderEtaInput(event.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr))]">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || labContext.featureUnavailable}
                          className="h-auto min-h-11 rounded-2xl border-slate-200 bg-white px-3 py-2 text-left whitespace-normal"
                          onClick={() => void submitStockEvent(
                            selectedInventory.id,
                            REORDER_EVENT_MAP.request,
                            0,
                            "Reorder requested.",
                            selectedInventory.unit,
                          )}
                        >
                          <PackagePlus className="mr-2 h-4 w-4" />
                          Request reorder
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || labContext.featureUnavailable}
                          className="h-auto min-h-11 rounded-2xl border-slate-200 bg-white px-3 py-2 text-left whitespace-normal"
                          onClick={() => void submitStockEvent(
                            selectedInventory.id,
                            REORDER_EVENT_MAP.placed,
                            0,
                            "Order placed with vendor.",
                            selectedInventory.unit,
                            {
                              vendor: reorderVendorInput.trim() || null,
                              purchaseOrderNumber: reorderPoInput.trim() || null,
                              expectedArrivalAt: reorderEtaInput || null,
                            },
                          )}
                        >
                          <Wrench className="mr-2 h-4 w-4" />
                          Mark placed
                        </Button>
                        <Button
                          type="button"
                          disabled={busy || labContext.featureUnavailable}
                          className="h-auto min-h-11 rounded-2xl bg-slate-900 px-3 py-2 text-left whitespace-normal text-white hover:bg-slate-800"
                          onClick={() => void submitStockEvent(
                            selectedInventory.id,
                            REORDER_EVENT_MAP.received,
                            Math.max(selectedInventory.reorderThreshold ?? 1, 1),
                            "Order received and inventory updated.",
                            selectedInventory.unit,
                          )}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Mark received
                        </Button>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Reorder pipeline
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {getTimelineSteps(
                            selectedInventory,
                            localLatestInventoryEventByReagentId[selectedInventory.id],
                          ).map((step) => (
                            <div
                              key={step.key}
                              className={cn(
                                "rounded-xl border px-3 py-2",
                                step.state === "done"
                                  ? "border-emerald-200 bg-emerald-50"
                                  : step.state === "current"
                                    ? "border-sky-200 bg-sky-50"
                                    : "border-slate-200 bg-white",
                              )}
                            >
                              <p className="text-xs font-semibold text-slate-700">{step.label}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {step.timestamp ? formatDateTime(step.timestamp) : "Pending"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Recent stock events
                        </summary>
                        <div className="mt-3 space-y-2">
                          {selectedInventory.stockEvents.length === 0 ? (
                            <p className="text-sm text-slate-600">No stock events yet.</p>
                          ) : (
                            selectedInventory.stockEvents.slice(0, 6).map((event) => (
                              <div key={event.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Badge variant="outline" className={cn("border", eventTone(event.event_type))}>
                                    {event.event_type.replace(/_/g, " ")}
                                  </Badge>
                                  <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
                                </div>
                                  <p className="mt-2 text-xs text-slate-500">
                                    Delta {event.quantity_delta > 0 ? `+${event.quantity_delta}` : event.quantity_delta}
                                    {selectedInventory.unit ? ` ${selectedInventory.unit}` : ""}
                                  </p>
                                  {event.vendor ? (
                                    <p className="mt-1 text-xs text-slate-600">Vendor: {event.vendor}</p>
                                  ) : null}
                                  {event.purchase_order_number ? (
                                    <p className="mt-1 text-xs text-slate-600">PO: {event.purchase_order_number}</p>
                                  ) : null}
                                  {event.expected_arrival_at ? (
                                    <p className="mt-1 text-xs text-slate-600">
                                      ETA: {formatDateTime(event.expected_arrival_at)}
                                    </p>
                                  ) : null}
                                  {event.notes ? <p className="mt-1 text-sm text-slate-600">{event.notes}</p> : null}
                                </div>
                            ))
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </CardContent>
              </Card>
              ) : null}

              {showInventoryChatCard && selectedInventory ? (
                <div ref={reagentChatPanelRef}>
                  <ObjectLinksPanel
                    title="Reagent notes and links"
                    subtitle="Track discussion and related tasks for this reagent."
                    linkedObjectId={selectedInventory.id}
                    linkedObjectType="lab_reagent"
                    labId={labContext.labId}
                    linkedTaskIds={selectedInventory.linkedTaskIds}
                    taskOptions={taskOptions}
                    messages={withLocalMessages("lab_reagent", selectedInventory.id, selectedInventory.messages)}
                    messageDraft={inventoryMessageDraft}
                    onMessageDraftChange={setInventoryMessageDraft}
                    onCreateTaskLink={submitTaskLink}
                    onPostMessage={submitMessage}
                    disabled={labContext.featureUnavailable}
                    busy={busy}
                  />
                </div>
              ) : null}
              {showInventoryChatCard && !selectedInventory ? (
                <Card className={cn("bg-white/95", embedded ? "border-slate-200/70 shadow-none" : "border-white/80")}>
                  <CardContent className="py-8 text-sm text-slate-600">
                    Select a reagent to open the chat room.
                  </CardContent>
                </Card>
              ) : null}
            </div>
            ) : null}
            {shouldUseSlidingInventoryDetail ? (
              <div
                className={cn(
                  "fixed inset-y-0 right-0 z-50 w-[min(94vw,460px)] overflow-y-auto border-l border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-200 ease-out",
                  inventoryDetailOpen ? "translate-x-0" : "translate-x-full pointer-events-none",
                )}
              >
                <div className="mb-2 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200"
                    onClick={() => setInventoryDetailOpen(false)}
                  >
                    Close
                  </Button>
                </div>
                <div className="space-y-4">
                  {showInventoryDetailCard ? (
                    <Card className="border-slate-200/70 bg-white/95 shadow-none">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base text-slate-900">
                          {selectedInventory ? selectedInventory.name : "Select a reagent"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {!selectedInventory ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                            Select a reagent to view details.
                          </div>
                        ) : (
                          <div ref={reagentDetailRef} className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "border",
                                    stockTone(
                                      selectedInventory,
                                      localLatestInventoryEventByReagentId[selectedInventory.id],
                                    ).badge,
                                  )}
                                >
                                  {
                                    stockTone(
                                      selectedInventory,
                                      localLatestInventoryEventByReagentId[selectedInventory.id],
                                    ).label
                                  }
                                </Badge>
                                <select
                                  value={groupNameForReagent(selectedInventory.id)}
                                  onChange={(event) =>
                                    setReagentGroupById((current) => ({
                                      ...current,
                                      [selectedInventory.id]: event.target.value,
                                    }))
                                  }
                                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                                >
                                  <option value="Ungrouped">Ungrouped</option>
                                  {reagentGroups.map((group) => (
                                    <option key={group} value={group}>
                                      {group}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                                onClick={() => {
                                  setIsEditingReagent((current) => !current);
                                  setReagentEditError(null);
                                }}
                              >
                                {isEditingReagent ? "Cancel edit" : "Edit reagent"}
                              </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                                disabled={!canDeleteReagent || busy}
                                onClick={() => void submitDeleteReagent()}
                              >
                                Delete
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-slate-200"
                                onClick={() => downloadReagentQr(selectedInventory)}
                              >
                                Download QR
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-slate-200"
                                onClick={() => printReagentQr(selectedInventory)}
                              >
                                Print QR
                              </Button>
                            </div>
                            {!canDeleteReagent ? (
                              <p className="text-xs text-slate-500">Active lab membership is required to delete reagents.</p>
                            ) : null}
                            {reagentEditError ? (
                              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                                {reagentEditError}
                              </p>
                            ) : null}
                            {isEditingReagent ? (
                              <form
                                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void submitUpdateReagent();
                                }}
                              >
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <Label className="text-xs">Name</Label>
                                    <Input
                                      value={reagentEditDraft.name}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, name: event.target.value }))
                                      }
                                      required
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Supplier</Label>
                                    <Input
                                      value={reagentEditDraft.supplier}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, supplier: event.target.value }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <Label className="text-xs">Catalog number</Label>
                                    <Input
                                      value={reagentEditDraft.catalogNumber}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, catalogNumber: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Lot number</Label>
                                    <Input
                                      value={reagentEditDraft.lotNumber}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, lotNumber: event.target.value }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <div>
                                    <Label className="text-xs">Quantity</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={reagentEditDraft.quantity}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, quantity: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Unit</Label>
                                    <Input
                                      value={reagentEditDraft.unit}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, unit: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Reorder threshold</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={reagentEditDraft.reorderThreshold}
                                      onChange={(event) =>
                                        setReagentEditDraft((current) => ({ ...current, reorderThreshold: event.target.value }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs">Storage location</Label>
                                  <Input
                                    value={reagentEditDraft.storageLocation}
                                    onChange={(event) =>
                                      setReagentEditDraft((current) => ({ ...current, storageLocation: event.target.value }))
                                    }
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Notes</Label>
                                  <Textarea
                                    rows={2}
                                    value={reagentEditDraft.notes}
                                    onChange={(event) =>
                                      setReagentEditDraft((current) => ({ ...current, notes: event.target.value }))
                                    }
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" className="border-slate-200" onClick={() => setIsEditingReagent(false)}>
                                    Cancel
                                  </Button>
                                  <Button type="submit" disabled={busy} className="bg-slate-900 text-white hover:bg-slate-800">
                                    Save reagent changes
                                  </Button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4">
          {isNarrowMobile ? null : (
          <Card className="border-white/80 bg-white/90">
            <CardContent className="pt-4">
              <Tabs value={equipmentTab} onValueChange={setEquipmentTab} className="w-full">
                <TabsList
                  className={cn(
                    "h-auto w-full justify-start rounded-xl border border-slate-200 bg-slate-50 p-1",
                    embedded ? "overflow-x-auto" : "overflow-x-auto",
                  )}
                >
                  <TabsTrigger value="all" className="!flex-none max-w-full whitespace-nowrap rounded-lg px-3 py-2">
                    All Equipment
                  </TabsTrigger>
                  {localEquipmentOptions.map((item) => (
                    <TabsTrigger key={item.id} value={item.id} className="!flex-none max-w-full truncate whitespace-nowrap rounded-lg px-3 py-2">
                      {equipmentTabLabel(item.name)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {embedded ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">View:</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={equipmentSection === "booking" ? "default" : "outline"}
                    className={cn(
                      equipmentSection === "booking" ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200",
                    )}
                    onClick={() => setEquipmentSection("booking")}
                  >
                    Booking
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={equipmentSection === "calendar" ? "default" : "outline"}
                    className={cn(
                      equipmentSection === "calendar" ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200",
                    )}
                    onClick={() => setEquipmentSection("calendar")}
                  >
                    Calendar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={equipmentSection === "equipment" ? "default" : "outline"}
                    className={cn(
                      equipmentSection === "equipment" ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200",
                    )}
                    onClick={() => setEquipmentSection("equipment")}
                  >
                    Equipment
                  </Button>
                </div>
              ) : null}
              {embedded || (isNarrowMobile && equipmentSection === "booking") ? null : (
                <p className="mt-2 text-xs text-slate-500">
                  {equipmentTab === "all"
                    ? "Select an equipment tab for calendar-first focus."
                    : "Calendar is prioritized for this equipment tab."}
                </p>
              )}
            </CardContent>
          </Card>
          )}
          {embedded || isNarrowMobile ? null : (
          <Card className="border-white/80 bg-white/90">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={equipmentSection === "booking" ? "default" : "outline"}
                  className={cn(
                    equipmentSection === "booking" ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200",
                  )}
                  onClick={() => setEquipmentSection("booking")}
                >
                  Booking
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={equipmentSection === "calendar" ? "default" : "outline"}
                  className={cn(
                    equipmentSection === "calendar" ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200",
                  )}
                  onClick={() => setEquipmentSection("calendar")}
                >
                  Calendar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={equipmentSection === "equipment" ? "default" : "outline"}
                  className={cn(
                    equipmentSection === "equipment" ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200",
                  )}
                  onClick={() => setEquipmentSection("equipment")}
                >
                  Equipment
                </Button>
              </div>
            </CardContent>
          </Card>
          )}
          <div
            className={cn(
              "grid min-w-0 gap-4",
              equipmentSection === "calendar"
                ? "grid-cols-1"
                : "xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]",
            )}
          >
            {!(isNarrowMobile && equipmentSection === "booking" && mobileBookingView === "detail") ? (
            <div className={cn("min-w-0", isNarrowMobile ? "space-y-2" : "space-y-4")}>
              {equipmentSection === "booking" ? (
              isNarrowMobile && mobileBookingView === "equipment" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-sm font-semibold text-slate-900">Equipment setups</p>
                    {canManageEquipment ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-slate-200 px-3 text-xs font-medium text-slate-700"
                        onClick={() => setEquipmentSection("equipment")}
                        aria-label="Add equipment setup"
                      >
                        Add setup
                      </Button>
                    ) : null}
                  </div>
                  {localEquipmentOptions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600">
                      No equipment setups yet. Add one in Equipment.
                    </p>
                  ) : (
                    localEquipmentOptions.map((item) => {
                      const bookingCount = localBookings.filter((booking) => booking.equipmentId === item.id).length;
                      return (
                        <button
                          key={`mobile-setup-${item.id}`}
                          type="button"
                          onClick={() => handleSelectEquipmentForBookings(item.id)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
                        >
                          <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.location ?? "No location"} · {bookingCount} booking{bookingCount === 1 ? "" : "s"}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
              isNarrowMobile ? (
                <details className="ops-mobile-disclosure rounded-xl border border-slate-200 bg-white/90 p-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                    New booking
                  </summary>
                <Card className="mt-2 border-white/80 bg-white/90 shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm text-slate-900">Add booking</CardTitle>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-200"
                        onClick={() => {
                          setEquipmentTab("all");
                          setMobileBookingView("equipment");
                        }}
                      >
                        <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                        Setups
                      </Button>
                    </div>
                  </CardHeader>
                    <CardContent>
                      <form
                        ref={bookingFormRef}
                        className="grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const formElement = event.currentTarget;
                          void submitCreateBooking(new FormData(formElement), () => formElement.reset());
                        }}
                      >
                        <div>
                          <Label className="text-xs">Equipment</Label>
                          <select
                            key={`booking-equipment-mobile-${equipmentTab}`}
                            name="equipment_id"
                            required
                            aria-label="Booking equipment"
                            disabled={
                              busy
                              || activeEquipmentOptions.length === 0
                              || labContext.featureUnavailable
                              || equipmentTab !== "all"
                            }
                            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                            defaultValue={equipmentTab !== "all" ? equipmentTab : (activeEquipmentOptions[0]?.id ?? "")}
                          >
                            <option value="" disabled>
                              Select equipment
                            </option>
                            {activeEquipmentOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Title</Label>
                          <Input
                            name="title"
                            required
                            aria-label="Booking title"
                            disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs">Starts At</Label>
                            <Input
                              name="starts_at"
                              type="datetime-local"
                              required
                              aria-label="Booking start date and time"
                              disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Ends At</Label>
                            <Input
                              name="ends_at"
                              type="datetime-local"
                              required
                              aria-label="Booking end date and time"
                              disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                            className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                          >
                            Add booking
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                </details>
              ) : (
              <Card className="border-white/80 bg-white/90">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base text-slate-900">Equipment booking board</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-slate-200"
                      onClick={exportBookingsCsv}
                      disabled={scopedBookings.length === 0}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                  </div>
                  {embedded ? null : (
                    <CardDescription className="text-slate-600">Review upcoming bookings across lab equipment.</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {scopedBookings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      {equipmentTab === "all"
                        ? "No bookings yet. Create equipment, then schedule the first booking."
                        : "No bookings for this equipment yet."}
                    </div>
                  ) : (
                    scopedBookings.map((booking) => {
                      const bookingWindow = formatBookingWindow(booking.startsAt, booking.endsAt);
                      const conflicts = bookingConflictMap.get(booking.id) ?? [];
                      const hasConflict = conflicts.length > 0;
                      const ownerTone = ownerColor(booking.bookedBy ?? booking.bookedByLabel);
                      const canDelete = canEditBooking(booking);
                      return (
                        <div
                          key={booking.id}
                          className={cn(
                            "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                            selectedBooking?.id === booking.id
                              ? "border-cyan-300 bg-cyan-50/70"
                              : hasConflict
                                ? "border-red-200 bg-red-50/70 hover:bg-red-50"
                                : "border-slate-200 bg-slate-50/60 hover:bg-slate-50",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <button type="button" className="text-left" onClick={() => handleSelectBooking(booking.id)}>
                                <p className="truncate text-sm font-semibold text-slate-900">{booking.equipmentName}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {booking.title} · {bookingWindow.date}
                                </p>
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={cn("border", bookingTone(booking.status))}>
                                {bookingStatusLabel(booking.status, booking.bookingRequiresApproval)}
                              </Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-red-200 text-red-700 hover:bg-red-50"
                                disabled={!canDelete || busy}
                                onClick={() => void submitDeleteBooking(booking)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3.5 w-3.5" />
                              {bookingWindow.time}
                            </span>
                            {booking.location ? <span>{booking.location}</span> : null}
                            {booking.bookingRequiresApproval ? (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Approval required
                                <HelpHint text={`Approvers: ${approverNamesText}`} />
                              </span>
                            ) : null}
                            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", ownerTone.chip)}>
                              <span className={cn("h-2 w-2 rounded-full", ownerTone.dot)} />
                              {booking.bookedByLabel}
                            </span>
                            {hasConflict ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-red-800">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {conflicts.length} overlap{conflicts.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
              )
              )
              ) : null}

              {equipmentSection === "equipment" ? (
              isNarrowMobile ? (
                <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-200"
                  onClick={() => {
                    setEquipmentSection("booking");
                    setEquipmentTab("all");
                    setMobileBookingView("equipment");
                  }}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Back to setups
                </Button>
                <Card className="border-white/80 bg-white/90 shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-900">Add equipment</CardTitle>
                    </CardHeader>
                    <CardContent>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formElement = event.currentTarget;
                  void submitCreateEquipment(new FormData(formElement), () => formElement.reset());
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      name="name"
                      required
                      aria-label="Equipment name"
                      disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Location</Label>
                    <Input
                      name="location"
                      disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    name="description"
                    rows={2}
                    disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Outlook calendar ID</Label>
                    <Input
                      name="outlook_calendar_id"
                      placeholder="AAMkAG..."
                      disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Outlook calendar label</Label>
                    <Input
                      name="outlook_calendar_name"
                      placeholder="Confocal Microscope"
                      disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="booking_requires_approval"
                    value="true"
                    disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                  />
                  Booking requires approval
                </label>
                {!canManageEquipment ? (
                  <p className="text-xs text-slate-500">Only lab managers or admins can create equipment.</p>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                  >
                    Add equipment
                  </Button>
                </div>
              </form>
                    </CardContent>
                  </Card>
                </>
              ) : (
              <Card className="border-white/80 bg-white/90">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base text-slate-900">Add equipment</CardTitle>
                  {embedded ? null : (
                    <CardDescription className="text-slate-600">Add equipment entries for booking and planning.</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <form
                    className="grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formElement = event.currentTarget;
                      void submitCreateEquipment(new FormData(formElement), () => formElement.reset());
                    }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          name="name"
                          required
                          aria-label="Equipment name"
                          disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Location</Label>
                        <Input
                          name="location"
                          disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                        />
                      </div>
                    </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    name="description"
                    rows={2}
                    disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Outlook calendar ID</Label>
                    <Input
                      name="outlook_calendar_id"
                      placeholder="AAMkAG..."
                      disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Outlook calendar label</Label>
                    <Input
                      name="outlook_calendar_name"
                      placeholder="Confocal Microscope"
                      disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="booking_requires_approval"
                        value="true"
                        disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                      />
                      Booking requires approval
                    </label>
                    {!canManageEquipment ? (
                      <p className="text-xs text-slate-500">Only lab managers or admins can create equipment.</p>
                    ) : null}
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={busy || !labContext.labId || labContext.featureUnavailable || !canManageEquipment}
                        className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                      >
                        Add equipment
                      </Button>
                    </div>
                  </form>
                  <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Available equipment</summary>
                    <div className="mt-2 space-y-2">
                    {localEquipmentOptions.length === 0 ? (
                      <p className="text-sm text-slate-600">No equipment yet. Add one to enable booking.</p>
                    ) : (
                      localEquipmentOptions.slice(0, 12).map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-3 py-2",
                            selectedEquipmentId === item.id ? "border-cyan-300 bg-cyan-50/70" : "border-slate-200 bg-white",
                          )}
                        >
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setSelectedEquipmentId(item.id)}
                          >
                            <p className="text-sm font-medium text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              {item.location ?? "No location"} · {item.isActive ? "Active" : "Inactive"}{item.outlookCalendarId ? " · Outlook sync" : ""}
                            </p>
                          </button>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-slate-200"
                              onClick={() => void submitSetEquipmentActive(item.id, !item.isActive)}
                              disabled={!canManageEquipment || busy}
                            >
                              {item.isActive ? "Deactivate" : "Reactivate"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => void submitDeleteEquipment(item.id)}
                              disabled={!canManageEquipment || busy}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                    </div>
                  </details>
                  <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Edit equipment</summary>
                    <div className="mt-2">
                    {!selectedEquipment ? (
                      <p className="text-sm text-slate-600">Select equipment to edit details.</p>
                    ) : (
                      <form
                        key={selectedEquipment.id}
                        ref={equipmentEditFormRef}
                        className="grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitUpdateEquipment(new FormData(event.currentTarget));
                        }}
                      >
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            name="name"
                            defaultValue={selectedEquipment.name}
                            disabled={!canManageEquipment || busy}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Location</Label>
                          <Input
                            name="location"
                            defaultValue={selectedEquipment.location ?? ""}
                            disabled={!canManageEquipment || busy}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            name="description"
                            rows={2}
                            defaultValue={selectedEquipment.description ?? ""}
                            disabled={!canManageEquipment || busy}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs">Outlook calendar ID</Label>
                            <Input
                              name="outlook_calendar_id"
                              defaultValue={selectedEquipment.outlookCalendarId ?? ""}
                              disabled={!canManageEquipment || busy}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Outlook calendar label</Label>
                            <Input
                              name="outlook_calendar_name"
                              defaultValue={selectedEquipment.outlookCalendarName ?? ""}
                              disabled={!canManageEquipment || busy}
                            />
                          </div>
                        </div>
                        {selectedEquipment.outlookCalendarId ? (
                          <p className="text-xs text-slate-500">
                            Outlook sync uses the lab-level connected Outlook account and routes bookings into this specific equipment calendar ID.
                          </p>
                        ) : null}
                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            name="booking_requires_approval"
                            value="true"
                            defaultChecked={selectedEquipment.bookingRequiresApproval}
                            disabled={!canManageEquipment || busy}
                          />
                          Booking requires approval
                        </label>
                        {equipmentEditError ? (
                          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                            {equipmentEditError}
                          </p>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            disabled={!canManageEquipment || busy}
                            onClick={() => void submitDeleteEquipment(selectedEquipment.id)}
                          >
                            Delete equipment
                          </Button>
                          <Button
                            type="submit"
                            disabled={!canManageEquipment || busy}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                          >
                            Save equipment changes
                          </Button>
                        </div>
                      </form>
                    )}
                    </div>
                  </details>
                </CardContent>
              </Card>
              )
              ) : null}

              {equipmentSection === "booking" && !isNarrowMobile ? (
              <Card className="border-white/80 bg-white/90">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base text-slate-900">Add booking</CardTitle>
                  {embedded ? null : (
                    <CardDescription className="text-slate-600">Schedule time on equipment for upcoming work.</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <form
                    ref={bookingFormRef}
                    className="grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formElement = event.currentTarget;
                      void submitCreateBooking(new FormData(formElement), () => formElement.reset());
                    }}
                  >
                    <div>
                      <Label className="text-xs">Equipment</Label>
                      <select
                        key={`booking-equipment-${equipmentTab}`}
                        name="equipment_id"
                        required
                        aria-label="Booking equipment"
                        disabled={
                          busy
                          || activeEquipmentOptions.length === 0
                          || labContext.featureUnavailable
                          || equipmentTab !== "all"
                        }
                        className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        defaultValue={equipmentTab !== "all" ? equipmentTab : (activeEquipmentOptions[0]?.id ?? "")}
                      >
                        <option value="" disabled>
                          Select equipment
                        </option>
                        {activeEquipmentOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {equipmentTab !== "all" ? (
                        <p className="mt-1 text-xs text-slate-500">Booking is scoped to this equipment tab.</p>
                      ) : null}
                    </div>
                    <div>
                      <Label className="text-xs">Title</Label>
                      <Input
                        name="title"
                        required
                        aria-label="Booking title"
                        disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Starts At</Label>
                        <Input
                          name="starts_at"
                          type="datetime-local"
                          required
                          aria-label="Booking start date and time"
                          disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Ends At</Label>
                        <Input
                          name="ends_at"
                          type="datetime-local"
                          required
                          aria-label="Booking end date and time"
                          disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Optional task ID</Label>
                      <Input
                        name="task_id"
                        list="operations-task-options"
                        disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                      />
                      <datalist id="operations-task-options">
                        {taskOptions.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <Label className="text-xs">Notes</Label>
                      <Textarea name="notes" rows={2} disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable} />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={busy || activeEquipmentOptions.length === 0 || labContext.featureUnavailable}
                        className="rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                      >
                        Add booking
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
              ) : null}

              {equipmentSection === "calendar" ? (
                isNarrowMobile ? (
                  mobileCalendarView === "chat" ? (
                    <div className="space-y-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-200"
                        onClick={() => setMobileCalendarView("calendar")}
                      >
                        <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                        Back to calendar
                      </Button>
                      {selectedCalendarEquipment ? (
                        <ObjectLinksPanel
                          title="Equipment chatroom"
                          subtitle=""
                          linkedObjectId={selectedCalendarEquipment.id}
                          linkedObjectType="lab_equipment"
                          labId={labContext.labId}
                          linkedTaskIds={selectedCalendarEquipment.linkedTaskIds}
                          taskOptions={taskOptions}
                          messages={withLocalMessages("lab_equipment", selectedCalendarEquipment.id, selectedCalendarEquipment.messages)}
                          messageDraft={equipmentMessageDraft}
                          onMessageDraftChange={setEquipmentMessageDraft}
                          onCreateTaskLink={submitTaskLink}
                          onPostMessage={submitMessage}
                          disabled={labContext.featureUnavailable}
                          busy={busy}
                        />
                      ) : (
                        <Card className="border-white/80 bg-white/90">
                          <CardContent className="py-8 text-sm text-slate-600">
                            Select an equipment tab to open its shared chatroom.
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    equipmentCalendarCard
                  )
                ) : (
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
                    {equipmentCalendarCard}
                    {selectedCalendarEquipment ? (
                      <ObjectLinksPanel
                        title="Equipment chatroom"
                        subtitle=""
                        linkedObjectId={selectedCalendarEquipment.id}
                        linkedObjectType="lab_equipment"
                        labId={labContext.labId}
                        linkedTaskIds={selectedCalendarEquipment.linkedTaskIds}
                        taskOptions={taskOptions}
                        messages={withLocalMessages("lab_equipment", selectedCalendarEquipment.id, selectedCalendarEquipment.messages)}
                        messageDraft={equipmentMessageDraft}
                        onMessageDraftChange={setEquipmentMessageDraft}
                        onCreateTaskLink={submitTaskLink}
                        onPostMessage={submitMessage}
                        disabled={labContext.featureUnavailable}
                        busy={busy}
                      />
                    ) : (
                      <Card className="border-white/80 bg-white/90">
                        <CardContent className="py-8 text-sm text-slate-600">
                          Select an equipment tab to open its shared chatroom.
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )
              ) : null}
            </div>
            ) : null}

            {equipmentSection === "calendar" || (isNarrowMobile && equipmentSection === "booking" && mobileBookingView !== "detail") ? null : (
            <div className="min-w-0 space-y-4">
              {equipmentSection === "booking" ? (
              <Card className="border-white/80 bg-white/90">
                <CardHeader className="pb-4">
                  {isNarrowMobile ? (
                    <button
                      type="button"
                      className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600"
                      onClick={() => setMobileBookingView("list")}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back to bookings
                    </button>
                  ) : null}
                  <CardTitle className="text-base text-slate-900">
                    {selectedBooking ? selectedBooking.equipmentName : "Select a booking"}
                  </CardTitle>
                  {embedded ? null : (
                    <CardDescription className="text-slate-600">
                      Review booking details or edit when permitted.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedBooking ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      Select a booking to view details.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                            ownerColor(selectedBooking.bookedBy ?? selectedBooking.bookedByLabel).chip,
                          )}
                        >
                          <span className={cn("h-2 w-2 rounded-full", ownerColor(selectedBooking.bookedBy ?? selectedBooking.bookedByLabel).dot)} />
                          {selectedBooking.bookedByLabel}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-slate-200"
                            onClick={() => {
                              setIsEditingBooking((current) => !current);
                              setBookingEditError(null);
                            }}
                            disabled={busy || labContext.featureUnavailable}
                          >
                            {isEditingBooking ? "Cancel edit" : "Edit booking"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            disabled={busy || labContext.featureUnavailable || !canEditSelectedBooking}
                            onClick={() => void submitDeleteBooking(selectedBooking)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      {!canEditSelectedBooking ? (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Editing is restricted to the booking owner, lab managers, or admins.
                        </p>
                      ) : null}

                      {bookingEditError ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                          {bookingEditError}
                        </p>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Window</p>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {formatBookingWindow(selectedBooking.startsAt, selectedBooking.endsAt).time}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {bookingStatusLabel(selectedBooking.status, selectedBooking.bookingRequiresApproval)}
                          </p>
                        </div>
                      </div>

                      {isEditingBooking && canEditSelectedBooking ? (
                        <form
                          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitUpdateBooking();
                          }}
                        >
                          <div>
                            <Label className="text-xs">Equipment</Label>
                            <select
                              value={bookingEditDraft.equipmentId}
                              onChange={(event) =>
                                setBookingEditDraft((current) => ({ ...current, equipmentId: event.target.value }))
                              }
                              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                            >
                              {localEquipmentOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Title</Label>
                            <Input
                              value={bookingEditDraft.title}
                              onChange={(event) =>
                                setBookingEditDraft((current) => ({ ...current, title: event.target.value }))
                              }
                              required
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs">Starts at</Label>
                              <Input
                                type="datetime-local"
                                value={bookingEditDraft.startsAt}
                                onChange={(event) =>
                                  setBookingEditDraft((current) => ({ ...current, startsAt: event.target.value }))
                                }
                                required
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Ends at</Label>
                              <Input
                                type="datetime-local"
                                value={bookingEditDraft.endsAt}
                                onChange={(event) =>
                                  setBookingEditDraft((current) => ({ ...current, endsAt: event.target.value }))
                                }
                                required
                              />
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs">Status</Label>
                              <select
                                value={bookingEditDraft.status}
                                onChange={(event) =>
                                  setBookingEditDraft((current) => ({
                                    ...current,
                                    status: event.target.value as PlatformBookingStatus,
                                  }))
                                }
                                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                              >
                                <option value="draft">Waiting for approval</option>
                                <option value="confirmed">Scheduled (confirmed)</option>
                                <option value="in_use">In use</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">Task ID</Label>
                              <Input
                                value={bookingEditDraft.taskId}
                                onChange={(event) =>
                                  setBookingEditDraft((current) => ({ ...current, taskId: event.target.value }))
                                }
                                list="operations-task-options"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Notes</Label>
                            <Textarea
                              rows={2}
                              value={bookingEditDraft.notes}
                              onChange={(event) =>
                                setBookingEditDraft((current) => ({ ...current, notes: event.target.value }))
                              }
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="border-slate-200"
                              onClick={() => setIsEditingBooking(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              disabled={busy || labContext.featureUnavailable}
                              className="bg-slate-900 text-white hover:bg-slate-800"
                            >
                              Save changes
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Booking title</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{selectedBooking.title}</p>
                          {selectedBooking.notes ? (
                            <p className="mt-2 text-sm text-slate-700">{selectedBooking.notes}</p>
                          ) : null}
                          {selectedBooking.bookingRequiresApproval ? (
                            <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                              This equipment requires approval in the current lab policy layer.
                              <HelpHint text={`Approvers: ${approverNamesText}`} />
                            </p>
                          ) : null}
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status controls</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select
                            value={bookingEditDraft.status}
                            onChange={(event) =>
                              setBookingEditDraft((current) => ({
                                ...current,
                                status: event.target.value as PlatformBookingStatus,
                              }))
                            }
                            disabled={busy || !canEditSelectedBooking}
                            className="h-10 min-w-0 flex-1 basis-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          >
                            <option value="draft">Waiting for approval</option>
                            <option value="confirmed">Scheduled (confirmed)</option>
                            <option value="in_use">In use</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <Button
                            type="button"
                            disabled={busy || labContext.featureUnavailable || !canEditSelectedBooking}
                            className="w-full sm:w-auto bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => {
                              const nextStatus = bookingEditDraft.status;
                              const confirmed = window.confirm(
                                `Change booking status from ${bookingStatusLabel(selectedBooking.status, selectedBooking.bookingRequiresApproval)} to ${bookingStatusLabel(nextStatus, selectedBooking.bookingRequiresApproval)}?`,
                              );
                              if (!confirmed) return;
                              void submitBookingStatus(selectedBooking.id, nextStatus);
                            }}
                          >
                            <Wrench className="mr-2 h-4 w-4" />
                            Apply status
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Status changes are reversible while you have permission.
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              ) : null}

              {equipmentSection === "booking" && selectedBooking ? (
                <ObjectLinksPanel
                  title="Booking notes and links"
                  subtitle="Track discussion and related tasks for this booking."
                  linkedObjectId={selectedBooking.id}
                  linkedObjectType="lab_equipment_booking"
                  labId={labContext.labId}
                  linkedTaskIds={selectedBooking.linkedTaskIds}
                  taskOptions={taskOptions}
                  messages={withLocalMessages("lab_equipment_booking", selectedBooking.id, selectedBooking.messages)}
                  messageDraft={bookingMessageDraft}
                  onMessageDraftChange={setBookingMessageDraft}
                  onCreateTaskLink={submitTaskLink}
                  onPostMessage={submitMessage}
                  disabled={labContext.featureUnavailable}
                  busy={busy}
                />
              ) : null}
            </div>
            )}
          </div>
        </TabsContent>

        {embedded ? null : (
        <TabsContent value="handoff" className="space-y-4">
          <Card className="border-white/80 bg-white/90">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base text-slate-900">Summary</CardTitle>
                <HelpHint text="Choose one summary view at a time." />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {handoffSection === "chooser" ? (
                <div className={cn("ops-slide-card space-y-3", handoffSlideClass)}>
                  <p className="text-sm text-slate-600">Pick a summary view to continue.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="bg-slate-900 text-white hover:bg-slate-800"
                      onClick={() => {
                        setHandoffSlideDirection("forward");
                        setHandoffSection("inventory");
                      }}
                    >
                      Reagent summary
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200"
                      onClick={() => {
                        setHandoffSlideDirection("forward");
                        setHandoffSection("bookings");
                      }}
                    >
                      Booking summary
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200"
                      onClick={() => {
                        setHandoffSlideDirection("forward");
                        setHandoffSection("notes");
                      }}
                    >
                      Workspace notes
                    </Button>
                  </div>
                </div>
              ) : null}

              {handoffSection === "inventory" ? (
                <div className={cn("ops-slide-card space-y-3", handoffSlideClass)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Reagent summary</p>
                    <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => {
                      setHandoffSlideDirection("back");
                      setHandoffSection("chooser");
                    }}>
                      Back
                    </Button>
                  </div>
                  {localInventory.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.linkedTaskIds.length} task link{item.linkedTaskIds.length === 1 ? "" : "s"} · {item.messages.length} message{item.messages.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {handoffSection === "bookings" ? (
                <div className={cn("ops-slide-card space-y-3", handoffSlideClass)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Booking summary</p>
                    <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => {
                      setHandoffSlideDirection("back");
                      setHandoffSection("chooser");
                    }}>
                      Back
                    </Button>
                  </div>
                  {localBookings.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-sm font-semibold text-slate-900">{item.equipmentName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.linkedTaskIds.length} task link{item.linkedTaskIds.length === 1 ? "" : "s"} · {item.messages.length} message{item.messages.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {handoffSection === "notes" ? (
                <div className={cn("ops-slide-card space-y-3", handoffSlideClass)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Workspace notes</p>
                    <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => {
                      setHandoffSlideDirection("back");
                      setHandoffSection("chooser");
                    }}>
                      Back
                    </Button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">Shared workspace</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p>Visible to lab members.</p>
                      <HelpHint text="Inventory, bookings, tasks, and notes here are shared with your lab." />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">Equipment setup</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p>Create equipment before booking.</p>
                      <HelpHint text="Add equipment first, then add bookings with time windows and optional task links." />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">Reagent groups</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p>Use groups for filters.</p>
                      <HelpHint text="Group related items to keep inventory lists easy to scan." />
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
