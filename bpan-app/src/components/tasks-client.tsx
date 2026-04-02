"use client";

import { startTransition, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Loader2, Check, Calendar,
  AlertTriangle, CheckCircle2, Clock, Flag,
  ListChecks, Beaker, RefreshCw, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Task } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { badge: string; icon: React.ReactNode }> = {
  low: { badge: "bg-gray-100 text-gray-600", icon: <Flag className="h-3 w-3 text-gray-400" /> },
  medium: { badge: "bg-blue-100 text-blue-700", icon: <Flag className="h-3 w-3 text-blue-500" /> },
  high: { badge: "bg-orange-100 text-orange-700", icon: <Flag className="h-3 w-3 text-orange-500" /> },
  urgent: { badge: "bg-red-100 text-red-700", icon: <Flag className="h-3 w-3 text-red-500" /> },
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  meeting_action: <MessageSquare className="h-3 w-3" />,
  experiment: <Beaker className="h-3 w-3" />,
  cage_change: <RefreshCw className="h-3 w-3" />,
  manual: <ListChecks className="h-3 w-3" />,
  animal_care: <Calendar className="h-3 w-3" />,
  reminder: <Clock className="h-3 w-3" />,
  pi_portal: <MessageSquare className="h-3 w-3" />,
};

const COLONY_EXP_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y-Maze", ldb: "Light-Dark Box",
  marble: "Marble Burying", nesting: "Nesting", data_collection: "Transport to Core",
  core_acclimation: "Core Acclim.", catwalk: "CatWalk", rotarod_hab: "Rotarod Hab.",
  rotarod: "Rotarod", stamina: "Stamina", blood_draw: "Blood Draw",
  eeg_implant: "EEG Implant", eeg_recording: "EEG Recording",
};

// ─── Timezone-safe LA date helpers ───────────────────────────────────────
function toDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function daysUntil(dateStr: string): number {
  const todayLA = toDateStr();
  const [ty, tm, td] = todayLA.split("-").map(Number);
  const [ey, em, ed] = dateStr.split("-").map(Number);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function formatDate(dateStr: string) {
  const d = daysUntil(dateStr);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d < 7) return `In ${d} days`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatScheduleDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

// ─── Interfaces ──────────────────────────────────────────────────────────

// Behavior experiment types (handling → rotarod/stamina/blood_draw) treated as one batch
const BEHAVIOR_EXP_TYPES = new Set([
  "handling", "y_maze", "marble", "ldb", "nesting",
  "data_collection", "core_acclimation", "catwalk",
  "rotarod_hab", "rotarod", "stamina", "blood_draw",
]);

const EXP_TYPE_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y-Maze", marble: "Marble Burying",
  ldb: "Light-Dark Box", nesting: "Nesting", data_collection: "Transport to Core",
  core_acclimation: "Core Acclimation", catwalk: "CatWalk", rotarod_hab: "Rotarod Hab",
  rotarod: "Rotarod", stamina: "Stamina", blood_draw: "Plasma Collection",
  eeg_implant: "EEG Implant", eeg_recording: "EEG Recording",
};

const PI_SHARED_TASK_TAG = "shared_with_pi";

function isTaskSharedWithPi(task: Task) {
  return Array.isArray(task.tags) && task.tags.includes(PI_SHARED_TASK_TAG);
}

interface TasksClientProps {
  tasks: Task[];
  upcomingExperiments: UpcomingExperimentLite[];
  cohorts: CohortLite[];
  upcomingCageChanges: CageChangeLite[];
  recentMeetings: RecentMeetingLite[];
  actions: {
    createTask: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateTask: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    toggleTask: (id: string, completed: boolean) => Promise<{ success?: boolean; error?: string }>;
    deleteTask: (id: string) => Promise<{ success?: boolean; error?: string }>;
    updateAnimalExperimentBatchStatus: (experimentIds: string[], status: string) => Promise<{ success?: boolean; error?: string }>;
  };
}

type ViewFilter = "all" | "today" | "upcoming" | "overdue" | "completed";
type SourceFilter = "all" | "meeting_action" | "manual" | "experiment" | "cage_change" | "pi_portal";
type TasksPanel = "queue" | "schedule" | "calendar";
const TASKS_PANEL_STORAGE_KEY = "tasks.panel.v1";
const TASKS_PANEL_STORAGE_EVENT = "tasks-panel-preference";

function readStoredTasksPanel(): TasksPanel {
  if (typeof window === "undefined") return "queue";
  const storedPanel = window.localStorage.getItem(TASKS_PANEL_STORAGE_KEY);
  return storedPanel === "queue" || storedPanel === "schedule" || storedPanel === "calendar"
    ? storedPanel
    : "queue";
}

function subscribeToTasksPanel(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === TASKS_PANEL_STORAGE_KEY) callback();
  };
  const handlePreferenceChange = () => callback();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(TASKS_PANEL_STORAGE_EVENT, handlePreferenceChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(TASKS_PANEL_STORAGE_EVENT, handlePreferenceChange);
  };
}

interface UpcomingExperimentLite {
  id: string;
  scheduled_date: string;
  status: string;
  experiment_type: string;
  timepoint_age_days: number | null;
  animals?: {
    identifier?: string | null;
    cohort_id?: string | null;
  } | null;
}

interface CohortLite {
  id: string;
  name: string;
}

interface CageChangeLite {
  id: string;
  scheduled_date: string;
}

interface RecentMeetingLite {
  id: string;
  title: string;
  action_items?: Array<{ done: boolean }> | null;
}

// ─── Mini Week Calendar ──────────────────────────────────────────────────

function WeekCalendar({
  tasks,
  upcomingExperiments,
  cohorts,
  selectedDay,
  onSelectDay,
}: {
  tasks: Task[];
  upcomingExperiments: UpcomingExperimentLite[];
  cohorts: CohortLite[];
  selectedDay: string;
  onSelectDay: (dateStr: string) => void;
}) {
  const todayStr = toDateStr();
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const dow = new Date(todayMs).getUTCDay();
  const weekStartMs = todayMs - (dow === 0 ? 6 : dow - 1) * 86400000;

  const days = Array.from({ length: 7 }, (_, i) => {
    const ms = weekStartMs + i * 86400000;
    const d = new Date(ms);
    const dateStr = d.toISOString().split("T")[0];
    return {
      dateStr,
      num: d.getUTCDate(),
      name: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      isWeekend: i >= 5,
    };
  });

  const counts = (dateStr: string) => {
    const t = tasks.filter(
      (t) => t.due_date === dateStr && t.status !== "completed" && t.status !== "skipped"
    ).length;
    const e = upcomingExperiments.filter((e) => e.scheduled_date === dateStr).length;
    return { t, e };
  };

  const rangeLabel =
    new Date(weekStartMs).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) +
    " – " +
    new Date(weekStartMs + 6 * 86400000).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

  // Day detail — experiments grouped by type + tasks
  const cohortMap = new Map(cohorts.map((c: { id: string; name: string }) => [c.id, c.name]));
  const selExps = upcomingExperiments.filter((e) => e.scheduled_date === selectedDay);
  const selTasks = tasks.filter(
    (t) => t.due_date === selectedDay && t.status !== "completed" && t.status !== "skipped"
  );
  const seenGroups = new Map<string, { cohorts: Set<string>; count: number }>();
  for (const exp of selExps) {
    const key = exp.experiment_type as string;
    if (!seenGroups.has(key)) seenGroups.set(key, { cohorts: new Set(), count: 0 });
    const g = seenGroups.get(key)!;
    const cId = exp.animals?.cohort_id;
    if (cId) g.cohorts.add(cohortMap.get(cId) || "?");
    g.count++;
  }
  const expGroups = [...seenGroups.entries()]
    .map(([type, v]) => ({ type, cohortNames: [...v.cohorts], count: v.count }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const [sy, sm, sd] = selectedDay.split("-").map(Number);
  const selDate = new Date(Date.UTC(sy, sm - 1, sd));
  const selLabel =
    selectedDay === todayStr
      ? "Today"
      : selDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
      {/* Gradient header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 58%, #bae6fd 100%)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="mouse">🐭</span>
          <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">This Week</span>
        </div>
        <span className="text-xs font-medium text-blue-700">{rangeLabel}</span>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1.5 p-3 pb-2">
        {days.map((day) => {
          const { t, e } = counts(day.dateStr);
          const total = t + e;
          const isSelected = day.dateStr === selectedDay;
          return (
            <button
              key={day.dateStr}
              onClick={() => onSelectDay(day.dateStr)}
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 text-center select-none transition-all ${
                day.isToday
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isSelected && !day.isToday
                  ? "bg-sky-100 text-sky-800 ring-2 ring-sky-300"
                  : day.isPast
                  ? "opacity-40 hover:opacity-60 cursor-pointer"
                  : day.isWeekend
                  ? "bg-muted/40 hover:bg-muted/60 cursor-pointer"
                  : "hover:bg-accent cursor-pointer"
              }`}
            >
              <span className={`text-[10px] font-semibold ${day.isToday ? "opacity-75" : "text-muted-foreground"}`}>
                {day.name}
              </span>
              <span className="text-sm font-bold leading-none">{day.num}</span>
              <div className="flex gap-0.5 min-h-[18px] items-center justify-center flex-wrap">
                {e > 0 && (
                  <span
                    title={`${e} experiment${e !== 1 ? "s" : ""}`}
                    className={`text-[9px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center ${
                      day.isToday ? "bg-white/25 text-white" : "bg-cyan-100 text-cyan-700"
                    }`}
                  >
                    {e}
                  </span>
                )}
                {t > 0 && (
                  <span
                    title={`${t} task${t !== 1 ? "s" : ""}`}
                    className={`text-[9px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center ${
                      day.isToday ? "bg-white/25 text-white" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {t}
                  </span>
                )}
                {total === 0 && <span className="h-[18px]" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day detail panel */}
      <div className="border-t mx-3 pt-3 pb-3 min-h-[52px]">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{selLabel}</p>
        {expGroups.length === 0 && selTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nothing scheduled — enjoy the break! 🎉</p>
        ) : (
          <div className="space-y-1">
            {expGroups.map((g) => (
              <div key={g.type} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-purple-400 flex-shrink-0" />
                <span className="font-semibold text-cyan-800">{COLONY_EXP_LABELS[g.type] || g.type}</span>
                {g.cohortNames.length > 0 && (
                  <span className="text-muted-foreground">· {g.cohortNames.join(", ")}</span>
                )}
                <span className="text-muted-foreground">· {g.count} animal{g.count !== 1 ? "s" : ""}</span>
              </div>
            ))}
            {selTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="font-medium">{t.title}</span>
                {(t.priority === "urgent" || t.priority === "high") && (
                  <span className={`text-[10px] rounded px-1 font-medium ${t.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                    {t.priority}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex gap-4 justify-end">
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-200 border border-cyan-300" />
          Experiments
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-200 border border-blue-300" />
          Tasks
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export function TasksClient({
  tasks: initTasks,
  upcomingExperiments,
  cohorts,
  upcomingCageChanges,
  recentMeetings,
  actions,
}: TasksClientProps) {
  const router = useRouter();
  const tasks = initTasks;
  const panel = useSyncExternalStore(subscribeToTasksPanel, readStoredTasksPanel, () => "queue");
  const [calendarDay, setCalendarDay] = useState<string>(toDateStr());
  const [view, setView] = useState<ViewFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  function setPanel(nextPanel: TasksPanel) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TASKS_PANEL_STORAGE_KEY, nextPanel);
    window.dispatchEvent(new Event(TASKS_PANEL_STORAGE_EVENT));
  }

  // ─── Stats ──────────────────────────────────
  const today = toDateStr();
  const stats = useMemo(() => {
    const pending = tasks.filter((t) => t.status !== "completed" && t.status !== "skipped");
    const overdue = pending.filter((t) => t.due_date && t.due_date < today);
    const dueToday = pending.filter((t) => t.due_date === today);
    const upcoming = pending.filter((t) => t.due_date && t.due_date > today);
    const completed = tasks.filter((t) => t.status === "completed");
    return { pending, overdue, dueToday, upcoming, completed, total: tasks.length };
  }, [tasks, today]);

  // ─── Filtered Tasks ──────────────────────────
  const filteredTasks = useMemo(() => {
    const sourceMatches = (t: Task) => sourceFilter === "all" || (t.source_type || "manual") === sourceFilter;
    const pending = tasks.filter((t) => t.status !== "completed" && t.status !== "skipped" && sourceMatches(t));
    switch (view) {
      case "today": return pending.filter((t) => t.due_date === today);
      case "upcoming": return pending.filter((t) => t.due_date && t.due_date > today);
      case "overdue": return pending.filter((t) => t.due_date && t.due_date < today);
      case "completed": return tasks.filter((t) => t.status === "completed" && sourceMatches(t)).slice(0, 20);
      default: return pending;
    }
  }, [tasks, view, today, sourceFilter]);

  const calendarDayTasks = useMemo(
    () => tasks.filter((task) => task.due_date === calendarDay && task.status !== "skipped"),
    [tasks, calendarDay]
  );
  async function act(promise: Promise<{ success?: boolean; error?: string }>) {
    setBusy(true);
    const res = await promise;
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Done!");
      startTransition(() => router.refresh());
    }
    setBusy(false);
  }

  function setBatchStatus(experimentIds: string[], status: string) {
    return act(actions.updateAnimalExperimentBatchStatus(experimentIds, status));
  }

  async function handleFormAction(
    action: (fd: FormData) => Promise<{ success?: boolean; error?: string }>,
    e: React.FormEvent<HTMLFormElement>,
    onSuccess: () => void,
  ) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await action(fd);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Done!");
      onSuccess();
      startTransition(() => router.refresh());
    }
    setBusy(false);
  }

  return (
    <>
      <div className="sticky-section-switcher px-2 py-2">
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/75 bg-white/82 p-1 backdrop-blur-xl">
          {([
            { id: "calendar", label: "Calendar" },
            { id: "queue", label: "Tasks" },
            { id: "schedule", label: "Schedule" },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPanel(item.id)}
              className={`h-10 rounded-xl text-sm font-medium transition-all ${
                panel === item.id
                  ? "border border-white/85 bg-white/95 text-slate-900 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)]"
                  : "border border-transparent bg-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {panel === "calendar" ? (
        <WeekCalendar
          tasks={tasks}
          upcomingExperiments={upcomingExperiments}
          cohorts={cohorts}
          selectedDay={calendarDay}
          onSelectDay={setCalendarDay}
        />
      ) : null}

      {panel === "calendar" ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold">
              Day Tasks: {calendarDay === today ? "Today" : new Date(calendarDay).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {calendarDayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks for this day.</p>
            ) : (
              <div className="space-y-2">
                {calendarDayTasks.map((task) => {
                  const isDone = task.status === "completed";
                  return (
                    <div
                      key={`calendar-${task.id}`}
                      className={`flex items-start gap-3 rounded-xl border bg-white/70 px-3 py-2.5 ${isDone ? "opacity-60" : ""}`}
                    >
                      <button
                        className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isDone
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-gray-300 hover:border-primary"
                        }`}
                        onClick={() => act(actions.toggleTask(task.id, !isDone))}
                        aria-label={isDone ? "Mark task as pending" : "Mark task as completed"}
                      >
                        {isDone && <Check className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setEditingTask(task)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${isDone ? "line-through" : ""}`}>{task.title}</span>
                          {task.priority !== "medium" && (
                            <Badge className={`text-[10px] ${PRIORITY_STYLES[task.priority]?.badge}`}>
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                        {task.description ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.description}</p>
                        ) : null}
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => act(actions.deleteTask(task.id))}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {panel === "queue" ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setView("overdue")}
          style={{ background: "linear-gradient(135deg, #fee2e2, #fecaca)" }}
          className={`flex items-center gap-3 rounded-xl p-4 text-left transition-all hover:shadow-md shadow-sm ${view === "overdue" ? "ring-2 ring-red-300" : ""}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 text-red-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-red-700">{stats.overdue.length}</div>
            <div className="text-xs text-red-700 font-semibold">Overdue</div>
          </div>
        </button>
        <button
          onClick={() => setView("today")}
          style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}
          className={`flex items-center gap-3 rounded-xl p-4 text-left transition-all hover:shadow-md shadow-sm ${view === "today" ? "ring-2 ring-amber-300" : ""}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-amber-700">{stats.dueToday.length}</div>
            <div className="text-xs text-amber-700 font-semibold">Due Today</div>
          </div>
        </button>
        <button
          onClick={() => setView("upcoming")}
          style={{ background: "linear-gradient(135deg, #dbeafe, #bfdbfe)" }}
          className={`flex items-center gap-3 rounded-xl p-4 text-left transition-all hover:shadow-md shadow-sm ${view === "upcoming" ? "ring-2 ring-blue-300" : ""}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 text-blue-500">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-blue-700">{stats.upcoming.length}</div>
            <div className="text-xs text-blue-700 font-semibold">Upcoming</div>
          </div>
        </button>
        <button
          onClick={() => setView("completed")}
          style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}
          className={`flex items-center gap-3 rounded-xl p-4 text-left transition-all hover:shadow-md shadow-sm ${view === "completed" ? "ring-2 ring-green-300" : ""}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-green-700">{stats.completed.length}</div>
            <div className="text-xs text-green-700 font-semibold">Completed</div>
          </div>
        </button>
        </div>
      ) : null}

      {/* ─── Upcoming Experiments (Batched by Cohort) & Other Items ─── */}
      {panel === "schedule" && (upcomingExperiments.length > 0 || upcomingCageChanges.length > 0 || recentMeetings.length > 0) && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Beaker className="h-4 w-4" /> Upcoming Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-3">
            {/* Group experiments by cohort + timepoint + behavior vs other */}
            {(() => {
              const cohortMap = new Map(cohorts.map((c: { id: string; name: string }) => [c.id, c.name]));

              // Group by: cohort_id + timepoint_age_days + isBehavior
              type BatchKey = string;
              const batches = new Map<BatchKey, {
                cohortName: string;
                timepointDays: number;
                isBehavior: boolean;
                animals: Set<string>;
                expTypes: Set<string>;
                statuses: Set<string>;
                experimentIds: string[];
                firstDate: string;
                lastDate: string;
                count: number;
              }>();

              for (const exp of upcomingExperiments) {
                const cohortId = exp.animals?.cohort_id || "unknown";
                const cohortName = cohortMap.get(cohortId) || "Unknown";
                const tpDays = exp.timepoint_age_days || 0;
                const isBehavior = BEHAVIOR_EXP_TYPES.has(exp.experiment_type);
                const key = `${cohortId}|${tpDays}|${isBehavior ? "beh" : "other"}`;

                if (!batches.has(key)) {
                  batches.set(key, {
                    cohortName,
                    timepointDays: tpDays,
                    isBehavior,
                    animals: new Set(),
                    expTypes: new Set(),
                    statuses: new Set(),
                    experimentIds: [],
                    firstDate: exp.scheduled_date,
                    lastDate: exp.scheduled_date,
                    count: 0,
                  });
                }

                const batch = batches.get(key)!;
                batch.animals.add(exp.animals?.identifier || "?");
                batch.expTypes.add(exp.experiment_type);
                batch.statuses.add(exp.status || "scheduled");
                batch.experimentIds.push(exp.id);
                if (exp.scheduled_date < batch.firstDate) batch.firstDate = exp.scheduled_date;
                if (exp.scheduled_date > batch.lastDate) batch.lastDate = exp.scheduled_date;
                batch.count++;
              }

              const sortedBatches = [...batches.values()].sort((a, b) => a.firstDate.localeCompare(b.firstDate));

              return sortedBatches.map((batch, i) => {
                const dateRange = batch.firstDate === batch.lastDate
                  ? formatScheduleDate(batch.firstDate)
                  : `${formatScheduleDate(batch.firstDate)} → ${formatScheduleDate(batch.lastDate)}`;
                const expLabels = [...batch.expTypes].map((t) => EXP_TYPE_LABELS[t] || t);
                const shownLabels = expLabels.slice(0, 3);
                const remainingLabelCount = Math.max(expLabels.length - shownLabels.length, 0);
                const statusValues = [...batch.statuses].filter(Boolean);
                const batchStatus = statusValues.length === 1 ? statusValues[0] : "mixed";

                return (
                  <div key={i} className="flex items-start justify-between gap-2 text-sm bg-muted/30 rounded-md p-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Beaker className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                        <span className="font-semibold">{batch.cohortName}</span>
                        <Badge variant="outline" className="text-[10px]">{batch.timepointDays}d</Badge>
                        <Badge className="bg-purple-100 text-purple-700 text-[10px]" variant="secondary">
                          {batch.animals.size} animals
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 ml-5">
                        {batch.isBehavior ? (
                          <span>Behavior pipeline</span>
                        ) : (
                          <span>{expLabels.join(", ")}</span>
                        )}
                      </div>
                      {batch.isBehavior ? (
                        <div className="mt-1 ml-5 flex flex-wrap gap-1">
                          {shownLabels.map((label) => (
                            <span
                              key={`${batch.cohortName}-${batch.timepointDays}-${label}`}
                              className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600"
                            >
                              {label}
                            </span>
                          ))}
                          {remainingLabelCount > 0 ? (
                            <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                              +{remainingLabelCount} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="text-[10px] text-muted-foreground mt-0.5 ml-5">
                        Animals: {[...batch.animals].slice(0, 5).join(", ")}
                        {batch.animals.size > 5 ? ` +${batch.animals.size - 5} more` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant="outline" className="text-xs flex-shrink-0 whitespace-nowrap">
                        {dateRange}
                      </Badge>
                      <select
                        value={batchStatus}
                        onChange={(e) => setBatchStatus(batch.experimentIds, e.target.value)}
                        className="h-6 min-w-[108px] rounded-md border border-input bg-white px-1.5 text-[10px] shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        aria-label={`Set status for ${batch.cohortName}`}
                      >
                        {batchStatus === "mixed" ? <option value="mixed">Mixed</option> : null}
                        <option value="scheduled">Scheduled</option>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </div>
                  </div>
                );
              });
            })()}

            {/* Cage Changes */}
            {upcomingCageChanges.slice(0, 3).map((cc) => (
              <div key={cc.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 text-amber-500" />
                  <span>Cage Change</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {formatDate(cc.scheduled_date)}
                </Badge>
              </div>
            ))}

            {/* Meeting action items */}
            {recentMeetings.slice(0, 2).map((m) => {
              const pending = (m.action_items || []).filter((a: { done: boolean }) => !a.done).length;
              if (pending === 0) return null;
              return (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3 w-3 text-blue-500" />
                    <span>{m.title}: {pending} pending action{pending !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}

          </CardContent>
        </Card>
      )}

      {panel === "schedule" && upcomingExperiments.length === 0 && upcomingCageChanges.length === 0 && recentMeetings.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-8 text-center">
          <p className="text-sm font-medium text-slate-900">No upcoming schedule items.</p>
          <p className="mt-1 text-xs text-slate-600">Experiments, cage changes, and meeting actions will appear here.</p>
        </div>
      ) : null}

      {/* ─── Filter Tabs & Add Button ──────────────────── */}
      {panel === "queue" ? (
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {(["all", "today", "upcoming", "overdue", "completed"] as ViewFilter[]).map((f) => (
            <Button
              key={f}
              variant={view === f ? "default" : "outline"}
              size="sm"
              className="text-xs capitalize"
              onClick={() => setView(f)}
            >
              {f === "all" ? "Active" : f}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Filter source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="meeting_action">Meetings</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="experiment">Experiments</SelectItem>
              <SelectItem value="cage_change">Cage changes</SelectItem>
              <SelectItem value="pi_portal">PI portal</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddTask(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        </div>
      </div>
      ) : null}

      {/* ─── Task List ─────────────────────────────────── */}
      {panel === "queue" && (filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/[0.06]">
            <ListChecks className="h-7 w-7 text-primary/40" />
          </div>
          <p className="text-lg font-medium">
            {view === "completed" ? "No completed tasks yet" : view === "overdue" ? "Nothing overdue — great job!" : "No tasks here"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {view === "all" ? "Add tasks manually, or they\u2019ll appear automatically from meetings and experiments." : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const isOverdue = task.due_date && task.due_date < today && task.status !== "completed";
            const isDone = task.status === "completed";
            return (
              <Card
                key={task.id}
                className={`transition-colors ${isDone ? "opacity-60" : ""} ${isOverdue ? "border-red-300 dark:border-red-700" : ""}`}
              >
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <button
                      className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isDone
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-gray-300 hover:border-primary"
                      }`}
                      onClick={() => act(actions.toggleTask(task.id, !isDone))}
                    >
                      {isDone && <Check className="h-3 w-3" />}
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingTask(task)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${isDone ? "line-through" : ""}`}>
                          {task.title}
                        </span>
                        {task.priority !== "medium" && (
                          <Badge className={`text-[10px] ${PRIORITY_STYLES[task.priority]?.badge}`}>
                            {task.priority}
                          </Badge>
                        )}
                        {task.source_type && task.source_type !== "manual" && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            {SOURCE_ICONS[task.source_type]}
                            {task.source_label || task.source_type}
                          </Badge>
                        )}
                        {isTaskSharedWithPi(task) && (
                          <Badge variant="outline" className="text-[10px]">
                            Visible in PI
                          </Badge>
                        )}
                        {task.source_type === "meeting_action" && task.source_id && (
                          <Link
                            href={`/meetings?meeting=${encodeURIComponent(task.source_id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Open meeting
                          </Link>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        {task.due_date && (
                          <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                            {formatDate(task.due_date)}
                          </span>
                        )}
                        {task.description && (
                          <span className="truncate max-w-[300px]">{task.description}</span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => act(actions.deleteTask(task.id))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
            </Card>
          );
        })}
        </div>
      ))}

      {/* ─── Add Task Dialog ───────────────────────────── */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>
              Create a manual task for your queue or share it with the PI portal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.createTask, e, () => setShowAddTask(false))} className="space-y-3">
            <div>
              <Label className="text-xs">Task *</Label>
              <Input name="title" required placeholder="What needs to be done?" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Due Date</Label>
                <Input name="due_date" type="date" />
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea name="description" placeholder="Optional details..." rows={2} />
            </div>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <input type="checkbox" id="new-show-on-pi" name="show_on_pi" value="true" className="h-4 w-4" />
              <Label htmlFor="new-show-on-pi" className="text-xs cursor-pointer">Show this task on the PI platform</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddTask(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Task Dialog ──────────────────────────── */}
      <Dialog open={!!editingTask} onOpenChange={(v) => { if (!v) setEditingTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details, notes, status, and PI visibility in one place.
            </DialogDescription>
          </DialogHeader>
          {editingTask && (
            <form onSubmit={(e) => handleFormAction((fd) => actions.updateTask(editingTask.id, fd), e, () => setEditingTask(null))} className="space-y-3">
              <input type="hidden" name="show_on_pi_enabled" value="true" />
              <div>
                <Label className="text-xs">Task *</Label>
                <Input name="title" required defaultValue={editingTask.title} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Due Date</Label>
                  <Input name="due_date" type="date" defaultValue={editingTask.due_date || ""} />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select name="priority" defaultValue={editingTask.priority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select name="status" defaultValue={editingTask.status}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="skipped">Skipped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea name="description" defaultValue={editingTask.description || ""} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea name="notes" defaultValue={editingTask.notes || ""} rows={2} />
              </div>
              <div className="flex items-center gap-2 rounded-md border p-2">
                <input
                  type="checkbox"
                  id="edit-show-on-pi"
                  name="show_on_pi"
                  value="true"
                  defaultChecked={isTaskSharedWithPi(editingTask)}
                  className="h-4 w-4"
                />
                <Label htmlFor="edit-show-on-pi" className="text-xs cursor-pointer">Show this task on the PI platform</Label>
              </div>
              {editingTask.source_label && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {SOURCE_ICONS[editingTask.source_type || "manual"]}
                    <span>Source: {editingTask.source_label}</span>
                  </div>
                  {editingTask.source_type === "meeting_action" && editingTask.source_id && (
                    <Link
                      href={`/meetings?meeting=${encodeURIComponent(editingTask.source_id)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <MessageSquare className="h-3 w-3" />
                      Open source meeting
                    </Link>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditingTask(null)}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
