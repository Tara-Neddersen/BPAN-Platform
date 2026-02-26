"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  BarChart3,
  FileText,
  Beaker,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  AlertTriangle,
  Loader2,
  GripVertical,
} from "lucide-react";
import {
  createExperiment,
  updateExperiment,
  deleteExperiment,
  updateExperimentStatus,
  createTimepoint,
  completeTimepoint,
  deleteTimepoint,
  createProtocol,
  updateProtocol,
  deleteProtocol,
  createReagent,
  updateReagent,
  deleteReagent,
} from "@/app/(protected)/experiments/actions";
import {
  createWorkspaceCalendarEvent,
  deleteWorkspaceCalendarEvent,
  updateWorkspaceCalendarEvent,
} from "@/app/(protected)/experiments/calendar-actions";
import {
  rescheduleExperimentDate,
  rescheduleExperimentDates,
  updateAnimalExperiment,
  batchUpdateAnimalExperimentStatusByIds,
} from "@/app/(protected)/colony/actions";
import { toast } from "sonner";
import type { Experiment, ExperimentTimepoint, Protocol, Reagent, ProtocolStep, AnimalExperiment, Animal, Cohort, ColonyTimepoint, WorkspaceCalendarEvent } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

type TabKey = "calendar" | "gantt" | "protocols" | "reagents";

const COLONY_EXP_LABELS: Record<string, string> = {
  handling: "Handling",
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Nesting",
  data_collection: "Data Collection",
  core_acclimation: "Core Acclim.",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Hab.",
  rotarod_test1: "RR Test 1",
  rotarod_test2: "RR Test 2",
  rotarod_recovery: "RR Recovery",
  rotarod: "Rotarod",
  stamina: "Stamina",
  blood_draw: "Blood Draw",
  eeg_implant: "EEG Implant",
  eeg_recording: "EEG Recording",
};

const COLONY_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border-l-2 border-l-indigo-500",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-l-2 border-l-amber-500",
};

const STATUS_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  planned: { bg: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: <Clock className="h-3 w-3" /> },
  in_progress: { bg: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Loader2 className="h-3 w-3" /> },
  completed: { bg: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { bg: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400", icon: <XCircle className="h-3 w-3" /> },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  protocols: Protocol[];
  reagents: Reagent[];
  animalExperiments?: AnimalExperiment[];
  animals?: Animal[];
  cohorts?: Cohort[];
  colonyTimepoints?: ColonyTimepoint[];
  workspaceCalendarEvents?: WorkspaceCalendarEvent[];
}

export function ExperimentsClient({
  experiments,
  timepoints,
  protocols,
  reagents,
  animalExperiments = [],
  animals = [],
  cohorts = [],
  colonyTimepoints = [],
  workspaceCalendarEvents = [],
}: Props) {
  const [tab, setTab] = useState<TabKey>("calendar");
  const [showNewExperiment, setShowNewExperiment] = useState(false);
  const [editingExperiment, setEditingExperiment] = useState<Experiment | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Experiment Planner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan experiments, track protocols, and manage reagents.
          </p>
        </div>
        <Button onClick={() => setShowNewExperiment(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Experiment
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Planned", count: experiments.filter((e) => e.status === "planned").length, color: "text-blue-600" },
          { label: "In Progress", count: experiments.filter((e) => e.status === "in_progress").length, color: "text-yellow-600" },
          { label: "Completed", count: experiments.filter((e) => e.status === "completed").length, color: "text-green-600" },
          { label: "Upcoming Timepoints", count: timepoints.filter((t) => !t.completed_at).length, color: "text-purple-600" },
          { label: "Colony Scheduled", count: animalExperiments.filter((e) => e.status === "scheduled").length, color: "text-indigo-600" },
          { label: "Colony In Progress", count: animalExperiments.filter((e) => e.status === "in_progress").length, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {[
          { key: "calendar" as const, label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
          { key: "gantt" as const, label: "Timeline", icon: <BarChart3 className="h-4 w-4" /> },
          { key: "protocols" as const, label: "Protocols", icon: <FileText className="h-4 w-4" /> },
          { key: "reagents" as const, label: "Reagents", icon: <Beaker className="h-4 w-4" /> },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* New/Edit experiment form */}
      {(showNewExperiment || editingExperiment) && (
        <ExperimentForm
          experiment={editingExperiment}
          protocols={protocols}
          allExperiments={experiments}
          onClose={() => {
            setShowNewExperiment(false);
            setEditingExperiment(null);
          }}
        />
      )}

      {/* Tab content */}
      {tab === "calendar" && (
        <CalendarView
          experiments={experiments}
          timepoints={timepoints}
          onEdit={setEditingExperiment}
          animalExperiments={animalExperiments}
          animals={animals}
          cohorts={cohorts}
          colonyTimepoints={colonyTimepoints}
          workspaceCalendarEvents={workspaceCalendarEvents}
        />
      )}
      {tab === "gantt" && (
        <GanttView
          experiments={experiments}
          timepoints={timepoints}
          onEdit={setEditingExperiment}
        />
      )}
      {tab === "protocols" && <ProtocolsView protocols={protocols} />}
      {tab === "reagents" && <ReagentsView reagents={reagents} />}
    </div>
  );
}

// ─── Experiment Form ─────────────────────────────────────────────────────────

function ExperimentForm({
  experiment,
  protocols,
  allExperiments,
  onClose,
}: {
  experiment: Experiment | null;
  protocols: Protocol[];
  allExperiments: Experiment[];
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      if (experiment) {
        formData.set("id", experiment.id);
        await updateExperiment(formData);
      } else {
        await createExperiment(formData);
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {experiment ? "Edit Experiment" : "New Experiment"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium mb-1 block">Title *</label>
            <Input name="title" defaultValue={experiment?.title || ""} required placeholder="e.g. WDR45 knockout Western blot" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium mb-1 block">Description</label>
            <textarea
              name="description"
              defaultValue={experiment?.description || ""}
              placeholder="Brief description..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-16"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Status</label>
            <select name="status" defaultValue={experiment?.status || "planned"} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Priority</label>
            <select name="priority" defaultValue={experiment?.priority || "medium"} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Start Date</label>
            <Input type="date" name="start_date" defaultValue={experiment?.start_date || ""} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">End Date</label>
            <Input type="date" name="end_date" defaultValue={experiment?.end_date || ""} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Related Aim</label>
            <Input name="aim" defaultValue={experiment?.aim || ""} placeholder="e.g. Aim 1.2" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Protocol</label>
            <select name="protocol_id" defaultValue={experiment?.protocol_id || ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">None</option>
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Tags</label>
            <Input name="tags" defaultValue={experiment?.tags?.join(", ") || ""} placeholder="comma-separated" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Depends On</label>
            <select name="depends_on" defaultValue={experiment?.depends_on?.[0] || ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">None</option>
              {allExperiments
                .filter((e) => e.id !== experiment?.id)
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
            </select>
          </div>
          {experiment && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium mb-1 block">Notes</label>
              <textarea
                name="notes"
                defaultValue={experiment?.notes || ""}
                placeholder="Experiment notes..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-16"
              />
            </div>
          )}
          <div className="sm:col-span-2 flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {experiment ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Calendar View ───────────────────────────────────────────────────────────

function CalendarView({
  experiments,
  timepoints,
  onEdit,
  animalExperiments = [],
  animals = [],
  cohorts = [],
  colonyTimepoints = [],
  workspaceCalendarEvents = [],
}: {
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  onEdit: (e: Experiment) => void;
  animalExperiments?: AnimalExperiment[];
  animals?: Animal[];
  cohorts?: Cohort[];
  colonyTimepoints?: ColonyTimepoint[];
  workspaceCalendarEvents?: WorkspaceCalendarEvent[];
}) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showColonyExps, setShowColonyExps] = useState(true);
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPayload, setDragPayload] = useState<{ expId: string; expIds: string[]; fromDate: string } | null>(null);
  const [showEventFormForDate, setShowEventFormForDate] = useState<string | null>(null);
  const [manualEventTitle, setManualEventTitle] = useState("");
  const [manualEventCategory, setManualEventCategory] = useState("general");
  const [manualEventDescription, setManualEventDescription] = useState("");
  const [manualEventSaving, setManualEventSaving] = useState(false);
  const [calendarIntegrationsOpen, setCalendarIntegrationsOpen] = useState(false);
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<{ configured: boolean; connected: boolean; email?: string | null } | null>(null);
  const [calendarFeed, setCalendarFeed] = useState<{ icsUrl: string } | null>(null);
  const [syncingGoogleCalendar, setSyncingGoogleCalendar] = useState(false);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ─── Drag & Drop Handlers ───────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, expId: string, expType: string, fromDate: string, expIds?: string[]) => {
    const payload = { expId, expIds: expIds || [expId], expType, fromDate };
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDragPayload({ expId, expIds: expIds || [expId], fromDate });
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(dayStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const moveColonyExperiments = useCallback(async (ids: string[], expId: string, fromDate: string, targetDate: string) => {
    if (fromDate === targetDate) return;
    const result = ids.length > 1
      ? await rescheduleExperimentDates(ids, targetDate)
      : await rescheduleExperimentDate(expId, targetDate);

    if (result.error) {
      toast.error(`Failed to reschedule: ${result.error}`);
    } else {
      const label = ids.length > 1 ? `${ids.length} animals` : "1 animal";
      toast.success(`Moved ${label} to ${targetDate}`);
      router.refresh();
    }
  }, [router]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDay(null);
    setIsDragging(false);
    setDragPayload(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { expId, expIds, fromDate } = data;
      const ids: string[] = expIds && expIds.length > 1 ? expIds : [expId];
      await moveColonyExperiments(ids, expId, fromDate, targetDate);
    } catch {
      toast.error("Failed to move experiment");
    }
  }, [moveColonyExperiments]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverDay(null);
    setDragPayload(null);
  }, []);

  const handleMonthDrop = useCallback(async (e: React.DragEvent, monthShift: -1 | 1) => {
    e.preventDefault();
    if (!dragPayload) return;
    setIsDragging(false);
    setDragOverDay(null);
    const src = new Date(`${dragPayload.fromDate}T12:00:00`);
    if (Number.isNaN(src.getTime())) return;
    const target = new Date(src);
    const originalDay = src.getDate();
    target.setDate(1);
    target.setMonth(target.getMonth() + monthShift);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(originalDay, lastDay));
    const targetDate = target.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    await moveColonyExperiments(dragPayload.expIds, dragPayload.expId, dragPayload.fromDate, targetDate);
    setCurrentDate(new Date(target.getFullYear(), target.getMonth(), 1));
    setDragPayload(null);
  }, [dragPayload, moveColonyExperiments]);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const monthName = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Lookups
  const animalMap = new Map(animals.map(a => [a.id, a]));
  const cohortMap = new Map(cohorts.map(c => [c.id, c]));
  const tpMap = new Map(colonyTimepoints.map(tp => [tp.age_days, tp]));

  // Filter colony experiments: only scheduled & in_progress
  const filteredColonyExps = animalExperiments.filter(ae => {
    if (ae.status !== "scheduled" && ae.status !== "in_progress") return false;
    if (!ae.scheduled_date) return false;
    if (filterCohort !== "all") {
      const animal = animalMap.get(ae.animal_id);
      if (!animal || animal.cohort_id !== filterCohort) return false;
    }
    return true;
  });

  // Map experiments to dates
  function getExperimentsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return experiments.filter((e) => {
      if (!e.start_date && !e.end_date) return false;
      const start = e.start_date || e.end_date;
      const end = e.end_date || e.start_date;
      return start! <= dateStr && dateStr <= end!;
    });
  }

  function getTimepointsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return timepoints.filter((t) => t.scheduled_at.startsWith(dateStr));
  }

  function getManualEventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return workspaceCalendarEvents.filter((ev) => String(ev.start_at).slice(0, 10) === dateStr);
  }

  // Group colony experiments by date → experiment_type → list of animals
  function getColonyExpsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayExps = filteredColonyExps.filter(ae => ae.scheduled_date === dateStr);

    // Group by experiment_type + status
    const groups = new Map<string, { type: string; status: string; isVirtual?: boolean; animals: { id: string; expId: string; identifier: string; cohortName: string; tpName: string }[] }>();
    for (const ae of dayExps) {
      const key = `${ae.experiment_type}::${ae.status}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: ae.experiment_type,
          status: ae.status,
          animals: [],
        });
      }
      const animal = animalMap.get(ae.animal_id);
      const cohort = animal ? cohortMap.get(animal.cohort_id) : null;
      const tp = ae.timepoint_age_days != null ? tpMap.get(ae.timepoint_age_days) : null;
      groups.get(key)!.animals.push({
        id: ae.animal_id,
        expId: ae.id,
        identifier: animal?.identifier || "?",
        cohortName: cohort?.name || "",
        tpName: tp?.name || `${ae.timepoint_age_days}d`,
      });
    }

    // Calendar-only planning event: rotarod recovery day (the day before stamina)
    const nextDate = new Date(`${dateStr}T12:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const nextDayStamina = filteredColonyExps.filter(
      (ae) => ae.experiment_type === "stamina" && ae.scheduled_date === nextDateStr
    );
    if (nextDayStamina.length > 0) {
      const key = "rotarod_recovery::scheduled";
      groups.set(key, {
        type: "rotarod_recovery",
        status: "scheduled",
        isVirtual: true,
        animals: nextDayStamina.map((ae) => {
          const animal = animalMap.get(ae.animal_id);
          const cohort = animal ? cohortMap.get(animal.cohort_id) : null;
          const tp = ae.timepoint_age_days != null ? tpMap.get(ae.timepoint_age_days) : null;
          return {
            id: ae.animal_id,
            expId: ae.id,
            identifier: animal?.identifier || "?",
            cohortName: cohort?.name || "",
            tpName: tp?.name || `${ae.timepoint_age_days}d`,
          };
        }),
      });
    }

    return Array.from(groups.values()).sort((a, b) => a.type.localeCompare(b.type));
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  // Upcoming timepoints
  const upcoming = timepoints
    .filter((t) => !t.completed_at && new Date(t.scheduled_at) >= new Date())
    .slice(0, 5);

  // This month colony experiment summary
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const manualEventsThisMonth = workspaceCalendarEvents.filter(
    (ev) => String(ev.start_at).slice(0, 10) >= monthStart && String(ev.start_at).slice(0, 10) <= monthEnd
  ).length;
  const thisMonthColony = filteredColonyExps.filter(ae =>
    ae.scheduled_date! >= monthStart && ae.scheduled_date! <= monthEnd
  );
  const scheduledThisMonth = thisMonthColony.filter(ae => ae.status === "scheduled").length;
  const inProgressThisMonth = thisMonthColony.filter(ae => ae.status === "in_progress").length;

  const handleCreateManualEvent = useCallback(async (dateStr: string) => {
    const title = manualEventTitle.trim();
    if (!title) {
      toast.error("Event title is required");
      return;
    }
    setManualEventSaving(true);
    try {
      const result = await createWorkspaceCalendarEvent({
        title,
        startAt: `${dateStr}T12:00:00.000Z`,
        allDay: true,
        category: manualEventCategory || "general",
        description: manualEventDescription.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Calendar event added");
      setManualEventTitle("");
      setManualEventDescription("");
      setManualEventCategory("general");
      setShowEventFormForDate(null);
      router.refresh();
    } catch {
      toast.error("Failed to create calendar event");
    } finally {
      setManualEventSaving(false);
    }
  }, [manualEventTitle, manualEventCategory, manualEventDescription, router]);

  const loadCalendarIntegrations = useCallback(async () => {
    try {
      const [gRes, feedRes] = await Promise.all([
        fetch("/api/calendar/google/status"),
        fetch("/api/calendar/feed/status"),
      ]);
      const g = await gRes.json();
      const feed = await feedRes.json();
      setGoogleCalendarStatus(g);
      if (feed?.icsUrl) setCalendarFeed({ icsUrl: feed.icsUrl });
    } catch {
      toast.error("Failed to load calendar integrations");
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Month navigation + colony toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            onDragOver={(e) => { if (isDragging) e.preventDefault(); }}
            onDrop={(e) => { void handleMonthDrop(e, -1); }}
            title={isDragging ? "Drop here to move to previous month (same day)" : undefined}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold">{monthName}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            onDragOver={(e) => { if (isDragging) e.preventDefault(); }}
            onDrop={(e) => { void handleMonthDrop(e, 1); }}
            title={isDragging ? "Drop here to move to next month (same day)" : undefined}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              const next = !calendarIntegrationsOpen;
              setCalendarIntegrationsOpen(next);
              if (next) void loadCalendarIntegrations();
            }}
          >
            Calendar Integrations
          </Button>
          {/* Colony experiment toggle */}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showColonyExps}
              onChange={(e) => setShowColonyExps(e.target.checked)}
              className="rounded"
            />
            <span>Colony Experiments</span>
          </label>

          {/* Cohort filter */}
          {showColonyExps && cohorts.length > 0 && (
            <select
              value={filterCohort}
              onChange={(e) => setFilterCohort(e.target.value)}
              className="text-xs border rounded-md px-2 py-1 bg-background"
            >
              <option value="all">All Cohorts</option>
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {calendarIntegrationsOpen && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-background p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Google Calendar</p>
                <Badge variant={googleCalendarStatus?.connected ? "default" : "secondary"} className="text-[10px]">
                  {googleCalendarStatus?.connected ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                One-way sync for workspace calendar events. Planner/colony events are available via ICS feed below.
              </p>
              {googleCalendarStatus?.email && (
                <p className="text-xs text-muted-foreground">Account: {googleCalendarStatus.email}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={async () => {
                    const res = await fetch("/api/calendar/google/auth");
                    const data = await res.json();
                    if (!res.ok || !data.url) {
                      toast.error(data.error || "Google Calendar auth not available");
                      return;
                    }
                    window.location.href = data.url;
                  }}
                >
                  {googleCalendarStatus?.connected ? "Reconnect Google" : "Connect Google"}
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={syncingGoogleCalendar || !googleCalendarStatus?.connected}
                  onClick={async () => {
                    setSyncingGoogleCalendar(true);
                    try {
                      const res = await fetch("/api/calendar/google/sync", { method: "POST" });
                      const data = await res.json();
                      if (!res.ok) toast.error(data.error || "Sync failed");
                      else toast.success(`Synced ${data.synced || 0} workspace event${(data.synced || 0) === 1 ? "" : "s"} to Google Calendar`);
                    } finally {
                      setSyncingGoogleCalendar(false);
                    }
                  }}
                >
                  {syncingGoogleCalendar ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Sync workspace events
                </Button>
                {googleCalendarStatus?.connected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-destructive"
                    onClick={async () => {
                      const res = await fetch("/api/calendar/google/disconnect", { method: "POST" });
                      if (res.ok) {
                        toast.success("Google Calendar disconnected");
                        await loadCalendarIntegrations();
                      } else {
                        const data = await res.json();
                        toast.error(data.error || "Disconnect failed");
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-background p-3 space-y-2">
              <p className="text-sm font-medium">Apple / Outlook / Google (Subscribe URL)</p>
              <p className="text-xs text-muted-foreground">
                Subscribe to one live BPAN calendar feed (workspace events + planner + colony schedule).
              </p>
              <div className="flex gap-2">
                <Input readOnly value={calendarFeed?.icsUrl || ""} className="h-8 text-xs" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={async () => {
                    if (!calendarFeed?.icsUrl) return;
                    await navigator.clipboard.writeText(calendarFeed.icsUrl);
                    toast.success("ICS URL copied");
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Use “Add calendar from URL” in Google Calendar, Apple Calendar, or Outlook.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* This-month colony summary */}
      {showColonyExps && (scheduledThisMonth + inProgressThisMonth) > 0 && (
        <div className="flex items-center gap-4 text-xs px-3 py-2 rounded-lg border bg-muted/30">
          <span className="font-medium text-foreground">This month:</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />
            {scheduledThisMonth} scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
            {inProgressThisMonth} in progress
          </span>
          {manualEventsThisMonth > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
              {manualEventsThisMonth} workspace event{manualEventsThisMonth === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {/* Legend */}
      {showColonyExps && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-blue-200 inline-block border border-blue-400" /> Planner experiments
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-indigo-200 inline-block border border-indigo-400" /> Colony scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-amber-200 inline-block border border-amber-400" /> Colony in progress
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-purple-200 inline-block border border-purple-400" /> Timepoints
          </span>
        </div>
      )}

      {/* Calendar grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-medium py-2 text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={i} className="border-t border-r min-h-[90px] bg-muted/30" />;
            }

            const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayExperiments = getExperimentsForDay(day);
            const dayTimepoints = getTimepointsForDay(day);
            const colonyGroups = showColonyExps ? getColonyExpsForDay(day) : [];
            const manualDayEvents = getManualEventsForDay(day);
            const isToday = dayStr === todayStr;
            const hasContent = dayExperiments.length > 0 || dayTimepoints.length > 0 || colonyGroups.length > 0 || manualDayEvents.length > 0;
            const isExpanded = expandedDay === dayStr;
            // Count unique animals (an animal doing 2 experiments counts as 1)
            const uniqueAnimalIds = new Set(colonyGroups.flatMap(g => g.animals.map(a => a.id)));
            const totalColonyAnimals = uniqueAnimalIds.size;

            return (
              <div
                key={i}
                className={`border-t border-r min-h-[90px] p-1 relative group transition-colors ${
                  isToday ? "bg-primary/5" : ""
                } ${hasContent ? "cursor-pointer hover:bg-muted/20" : ""} ${
                  dragOverDay === dayStr ? "ring-2 ring-primary ring-inset bg-primary/10" : ""
                } ${isDragging ? "transition-shadow" : ""}`}
                onClick={() => {
                  if (hasContent) setExpandedDay(isExpanded ? null : dayStr);
                }}
                onDragOver={(e) => handleDragOver(e, dayStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dayStr)}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium inline-flex h-5 w-5 items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                    {day}
                  </span>
                  {totalColonyAnimals > 0 && !isExpanded && (
                    <span className="text-[9px] text-muted-foreground">{totalColonyAnimals} 🐭</span>
                  )}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {/* Regular experiments */}
                  {dayExperiments.slice(0, 2).map((e) => (
                    <button
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                      className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate ${STATUS_STYLES[e.status]?.bg || "bg-gray-100"}`}
                    >
                      {e.title}
                    </button>
                  ))}
                  {dayExperiments.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{dayExperiments.length - 2} more</span>
                  )}

                  {/* Manual workspace events */}
                  {manualDayEvents.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      className="text-[10px] leading-tight px-1 py-0.5 rounded truncate bg-emerald-100 text-emerald-800 border border-emerald-300"
                      title={ev.description || ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {manualDayEvents.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{manualDayEvents.length - 2} events</span>
                  )}

                  {/* Planner timepoints */}
                  {dayTimepoints.map((t) => (
                    <div key={t.id} className="text-[10px] text-purple-600 truncate flex items-center gap-0.5">
                      <Clock className="h-2 w-2" /> {t.label}
                    </div>
                  ))}

                  {/* Colony experiments — collapsed view */}
                  {!isExpanded && colonyGroups.length > 0 && (
                    <div className="space-y-0.5">
                      {colonyGroups.slice(0, 3).map((g) => (
                        <div
                          key={g.type + g.status}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-grab active:cursor-grabbing ${COLONY_STATUS_COLORS[g.status] || "bg-gray-100 text-gray-700"}`}
                          draggable={g.type !== "rotarod_recovery"}
                          onDragStart={(e) => {
                            if (g.type === "rotarod_recovery") return;
                            e.stopPropagation();
                            // Drag all experiments in this group together
                            const allIds = g.animals.map(a => a.expId);
                            handleDragStart(e, allIds[0], g.type, dayStr, allIds);
                          }}
                          onDragEnd={handleDragEnd}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            <GripVertical className="h-2 w-2 opacity-40 inline-block flex-shrink-0" />
                            {COLONY_EXP_LABELS[g.type] || g.type} · {g.animals.length}
                          </span>
                        </div>
                      ))}
                      {colonyGroups.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{colonyGroups.length - 3} more</span>
                      )}
                    </div>
                  )}

              {/* Colony experiments — expanded view */}
                  {isExpanded && colonyGroups.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {colonyGroups.map((g) => (
                        <div
                          key={g.type + g.status}
                          className={`text-[10px] leading-tight px-1.5 py-1 rounded ${COLONY_STATUS_COLORS[g.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          <div className="font-medium flex items-center justify-between">
                            <span>{COLONY_EXP_LABELS[g.type] || g.type}</span>
                            <Badge variant="outline" className="h-3.5 px-1 text-[8px]">{g.status === "in_progress" ? "IP" : "Sched"}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-1 mt-0.5 text-[9px] opacity-80">
                            {g.animals.slice(0, 6).map((a) => (
                              <span
                                key={a.id}
                                title={`Drag to reschedule · ${a.cohortName} #${a.identifier} (${a.tpName})`}
                                className={g.type === "rotarod_recovery" ? "opacity-80" : "cursor-grab active:cursor-grabbing hover:underline"}
                                draggable={g.type !== "rotarod_recovery"}
                                onDragStart={(e) => {
                                  if (g.type === "rotarod_recovery") return;
                                  e.stopPropagation();
                                  handleDragStart(e, a.expId, g.type, dayStr);
                                }}
                                onDragEnd={handleDragEnd}
                              >
                                {a.cohortName ? `${a.cohortName.replace("BPAN ", "B")}-` : ""}{a.identifier}
                              </span>
                            ))}
                            {g.animals.length > 6 && (
                              <span className="text-muted-foreground">+{g.animals.length - 6}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setExpandedDay(dayStr);
                    setShowEventFormForDate(showEventFormForDate === dayStr ? null : dayStr);
                  }}
                  className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded bg-background/90 border text-muted-foreground hover:text-foreground text-[10px]"
                  title="Add workspace event"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail panel — shown below calendar when a day is expanded */}
      {expandedDay && (() => {
        const day = parseInt(expandedDay.split("-")[2]);
        const colonyGroups = showColonyExps ? getColonyExpsForDay(day) : [];
        const dayExperiments = getExperimentsForDay(day);
        const manualDayEvents = getManualEventsForDay(day);
        const totalAnimals = colonyGroups.reduce((s, g) => s + g.animals.length, 0);
        if (colonyGroups.length === 0 && dayExperiments.length === 0 && manualDayEvents.length === 0) return null;

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{new Date(expandedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setExpandedDay(null)}>
                  Close
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Workspace calendar events */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Workspace Events</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowEventFormForDate(showEventFormForDate === expandedDay ? null : expandedDay)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                {showEventFormForDate === expandedDay && (
                  <div className="rounded-md border p-2 space-y-2 mb-2">
                    <Input
                      value={manualEventTitle}
                      onChange={(e) => setManualEventTitle(e.target.value)}
                      placeholder="Event title"
                      className="h-8 text-xs"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={manualEventCategory}
                        onChange={(e) => setManualEventCategory(e.target.value)}
                        placeholder="Category"
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={manualEventSaving}
                        onClick={() => void handleCreateManualEvent(expandedDay)}
                      >
                        {manualEventSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Save Event
                      </Button>
                    </div>
                    <textarea
                      value={manualEventDescription}
                      onChange={(e) => setManualEventDescription(e.target.value)}
                      placeholder="Optional description"
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-xs resize-none h-16"
                    />
                  </div>
                )}
                {manualDayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No workspace events</p>
                ) : (
                  <div className="space-y-1">
                    {manualDayEvents.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                        <div>
                          <p className="font-medium">{ev.title}</p>
                          <p className="text-muted-foreground">{ev.category}{ev.status ? ` · ${ev.status}` : ""}</p>
                          {ev.description && <p className="text-muted-foreground mt-0.5">{ev.description}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <select
                            className="h-7 rounded border bg-background px-1 text-[11px]"
                            value={ev.status}
                            onChange={async (e) => {
                              const result = await updateWorkspaceCalendarEvent(ev.id, { status: e.target.value as "scheduled" | "in_progress" | "completed" | "cancelled" });
                              if (result.error) toast.error(result.error);
                              else router.refresh();
                            }}
                          >
                            <option value="scheduled">scheduled</option>
                            <option value="in_progress">in progress</option>
                            <option value="completed">completed</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={async () => {
                              const result = await deleteWorkspaceCalendarEvent(ev.id);
                              if (result.error) toast.error(result.error);
                              else {
                                toast.success("Deleted event");
                                router.refresh();
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Regular planner experiments */}
              {dayExperiments.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Planner Experiments</p>
                  {dayExperiments.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-sm border rounded-md p-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${STATUS_STYLES[e.status]?.bg || ""}`}>{e.status}</Badge>
                        <span className="font-medium">{e.title}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onEdit(e)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Colony experiments */}
              {colonyGroups.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Colony Experiments ({totalAnimals} total)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {colonyGroups.map((g) => (
                      <div
                        key={g.type + g.status}
                        className={`rounded-lg p-2.5 ${COLONY_STATUS_COLORS[g.status] || "bg-gray-100"}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{COLONY_EXP_LABELS[g.type] || g.type}{g.type === "rotarod_recovery" ? " (calendar only)" : ""}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {g.animals.length} animal{g.animals.length !== 1 ? "s" : ""} · {g.status === "in_progress" ? "In Progress" : "Scheduled"}
                          </Badge>
                        </div>
                        {g.type !== "rotarod_recovery" && (
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">Batch status</span>
                            <select
                              className="h-6 rounded border bg-background px-1 text-[10px]"
                              value={g.status}
                              onChange={async (e) => {
                                const next = e.target.value as "scheduled" | "pending" | "in_progress" | "completed" | "skipped";
                                const result = await batchUpdateAnimalExperimentStatusByIds(g.animals.map((a) => a.expId), next);
                                if (result.error) toast.error(result.error);
                                else {
                                  toast.success(`Updated ${g.animals.length} experiment${g.animals.length === 1 ? "" : "s"}`);
                                  router.refresh();
                                }
                              }}
                            >
                              <option value="scheduled">scheduled</option>
                              <option value="pending">pending</option>
                              <option value="in_progress">in progress</option>
                              <option value="completed">completed</option>
                              <option value="skipped">skipped</option>
                            </select>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {g.animals.map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-1 text-[10px] bg-white/60 dark:bg-black/20 rounded px-1.5 py-0.5 hover:ring-1 hover:ring-primary/50"
                              title={`Drag to reschedule · ${a.cohortName} #${a.identifier} (${a.tpName})`}
                              draggable={g.type !== "rotarod_recovery"}
                              onDragStart={(e) => {
                                if (g.type === "rotarod_recovery") return;
                                e.stopPropagation();
                                handleDragStart(e, a.expId, g.type, expandedDay!);
                              }}
                              onDragEnd={handleDragEnd}
                            >
                              {g.type !== "rotarod_recovery" && <GripVertical className="h-2.5 w-2.5 opacity-40 mr-0.5 flex-shrink-0" />}
                              {a.cohortName && <span className="font-medium mr-0.5">{a.cohortName.replace("BPAN ", "B")}</span>}
                              #{a.identifier}
                              <span className="ml-1 opacity-60">{a.tpName}</span>
                              {g.type !== "rotarod_recovery" && (
                                <select
                                  className="ml-1 h-5 rounded border bg-background px-1 text-[9px]"
                                  defaultValue={g.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={async (e) => {
                                    const fd = new FormData();
                                    fd.set("status", e.target.value);
                                    const result = await updateAnimalExperiment(a.expId, fd);
                                    if (result.error) toast.error(result.error);
                                    else router.refresh();
                                  }}
                                >
                                  <option value="scheduled">sched</option>
                                  <option value="pending">pend</option>
                                  <option value="in_progress">IP</option>
                                  <option value="completed">done</option>
                                  <option value="skipped">skip</option>
                                </select>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Upcoming timepoints */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-600" /> Upcoming Timepoints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((t) => {
              const exp = experiments.find((e) => e.id === t.experiment_id);
              return (
                <div key={t.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                  <div>
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {exp?.title} — {new Date(t.scheduled_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-green-600"
                      onClick={() => completeTimepoint(t.id)}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => deleteTimepoint(t.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Experiment list */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Planner Experiments</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Custom lab experiments you track manually (Western blots, behavioral assays, etc.) — separate from the colony animal experiments shown in the calendar above.</p>
        </div>
        {experiments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm font-medium">No planner experiments yet</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">Hit <span className="font-semibold">+ New Experiment</span> above to log a custom experiment. Colony animal experiments are managed under <span className="font-semibold">Colony → Tracker</span>.</p>
          </div>
        ) : (
          experiments.map((e) => (
            <ExperimentCard
              key={e.id}
              experiment={e}
              experiments={experiments}
              timepoints={timepoints.filter((t) => t.experiment_id === e.id)}
              onEdit={() => onEdit(e)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Experiment Card ─────────────────────────────────────────────────────────

function ExperimentCard({
  experiment: e,
  experiments,
  timepoints,
  onEdit,
}: {
  experiment: Experiment;
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  onEdit: () => void;
}) {
  const [showTimepoints, setShowTimepoints] = useState(false);
  const [showAddTp, setShowAddTp] = useState(false);
  const [tpPending, setTpPending] = useState(false);

  const dependency = e.depends_on.length > 0
    ? experiments.find((dep) => dep.id === e.depends_on[0])
    : null;

  const isBlocked = dependency && dependency.status !== "completed";

  async function handleAddTimepoint(formData: FormData) {
    setTpPending(true);
    try {
      formData.set("experiment_id", e.id);
      await createTimepoint(formData);
      setShowAddTp(false);
    } catch (err) {
      console.error(err);
    } finally {
      setTpPending(false);
    }
  }

  return (
    <Card className={isBlocked ? "border-amber-300 dark:border-amber-800" : ""}>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{e.title}</h4>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status]?.bg}`}>
                {STATUS_STYLES[e.status]?.icon} {e.status.replace("_", " ")}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[e.priority]}`}>
                {e.priority}
              </span>
            </div>
            {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteExperiment(e.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {e.start_date && <span>Start: {e.start_date}</span>}
          {e.end_date && <span>End: {e.end_date}</span>}
          {e.aim && <span>Aim: {e.aim}</span>}
          {e.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
        </div>

        {/* Dependency warning */}
        {isBlocked && dependency && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Blocked — depends on &quot;{dependency.title}&quot; ({dependency.status.replace("_", " ")})</span>
          </div>
        )}
        {dependency && !isBlocked && (
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Dependency &quot;{dependency.title}&quot; completed</span>
          </div>
        )}

        {/* Status buttons */}
        <div className="flex gap-1">
          {["planned", "in_progress", "completed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => updateExperimentStatus(e.id, s)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                e.status === s ? STATUS_STYLES[s]?.bg : "hover:bg-accent"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Timepoints */}
        <div className="pt-1">
          <button
            onClick={() => setShowTimepoints(!showTimepoints)}
            className="text-xs text-primary hover:text-primary/80 font-medium"
          >
            {showTimepoints ? "Hide" : "Show"} timepoints ({timepoints.length})
          </button>

          {showTimepoints && (
            <div className="mt-2 space-y-1">
              {timepoints.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    {t.completed_at ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <Clock className="h-3 w-3 text-purple-500" />
                    )}
                    <span className={t.completed_at ? "line-through text-muted-foreground" : ""}>{t.label}</span>
                    <span className="text-muted-foreground">{new Date(t.scheduled_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-1">
                    {!t.completed_at && (
                      <button onClick={() => completeTimepoint(t.id)} className="text-green-600 hover:text-green-800">
                        <CheckCircle2 className="h-3 w-3" />
                      </button>
                    )}
                    <button onClick={() => deleteTimepoint(t.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              {showAddTp ? (
                <form action={handleAddTimepoint} className="flex gap-1 mt-1">
                  <Input name="label" placeholder="Timepoint label..." className="text-xs h-7 flex-1" required />
                  <Input type="datetime-local" name="scheduled_at" className="text-xs h-7" required />
                  <Button type="submit" size="sm" className="h-7 text-xs" disabled={tpPending}>
                    {tpPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAddTp(false)}>
                    ✕
                  </Button>
                </form>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs h-6 gap-1" onClick={() => setShowAddTp(true)}>
                  <Plus className="h-3 w-3" /> Add timepoint
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Gantt View ──────────────────────────────────────────────────────────────

function GanttView({
  experiments,
  timepoints,
  onEdit,
}: {
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  onEdit: (e: Experiment) => void;
}) {
  // Find date range
  const dated = experiments.filter((e) => e.start_date);
  if (dated.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Add start and end dates to your experiments to see the timeline.</p>
      </div>
    );
  }

  const allDates = dated.flatMap((e) => [e.start_date!, e.end_date || e.start_date!]);
  const minDate = new Date(allDates.sort()[0]);
  const maxDate = new Date(allDates.sort().reverse()[0]);

  // Extend range a bit
  minDate.setDate(minDate.getDate() - 3);
  maxDate.setDate(maxDate.getDate() + 3);

  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  function dayOffset(dateStr: string) {
    return Math.ceil((new Date(dateStr).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Generate month labels
  const months: { label: string; offset: number; width: number }[] = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  while (cursor <= maxDate) {
    const mStart = Math.max(0, dayOffset(cursor.toISOString().split("T")[0]));
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const mEnd = Math.min(totalDays, dayOffset(nextMonth.toISOString().split("T")[0]));
    months.push({
      label: cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      offset: mStart,
      width: mEnd - mStart,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const todayOffset = dayOffset(today);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border rounded-lg">
        <div style={{ minWidth: `${Math.max(totalDays * 8, 600)}px` }}>
          {/* Month headers */}
          <div className="flex border-b bg-muted">
            <div className="w-48 flex-shrink-0 px-3 py-1.5 text-xs font-medium">Experiment</div>
            <div className="flex-1 relative flex">
              {months.map((m) => (
                <div
                  key={m.label}
                  style={{ left: `${(m.offset / totalDays) * 100}%`, width: `${(m.width / totalDays) * 100}%` }}
                  className="absolute text-xs text-muted-foreground text-center py-1.5"
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Experiment rows */}
          {dated
            .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))
            .map((e) => {
              const start = dayOffset(e.start_date!);
              const end = e.end_date ? dayOffset(e.end_date) : start + 1;
              const width = Math.max(end - start, 1);

              // Experiment timepoints
              const expTps = timepoints.filter((t) => t.experiment_id === e.id);

              return (
                <div key={e.id} className="flex border-b hover:bg-accent/30 transition-colors">
                  <button
                    onClick={() => onEdit(e)}
                    className="w-48 flex-shrink-0 px-3 py-2 text-xs text-left truncate hover:text-primary transition-colors"
                    title={e.title}
                  >
                    {e.title}
                  </button>
                  <div className="flex-1 relative py-1.5">
                    {/* Today line */}
                    {todayOffset >= 0 && todayOffset <= totalDays && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                        style={{ left: `${(todayOffset / totalDays) * 100}%` }}
                      />
                    )}
                    {/* Bar */}
                    <div
                      className={`absolute h-5 rounded-full flex items-center px-2 text-[10px] font-medium text-white ${
                        e.status === "completed" ? "bg-green-500" :
                        e.status === "in_progress" ? "bg-yellow-500" :
                        e.status === "cancelled" ? "bg-gray-400" : "bg-blue-500"
                      }`}
                      style={{
                        left: `${(start / totalDays) * 100}%`,
                        width: `${(width / totalDays) * 100}%`,
                        minWidth: "20px",
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                      title={`${e.start_date} → ${e.end_date || e.start_date}`}
                    />
                    {/* Dependency arrows */}
                    {e.depends_on.map((depId) => {
                      const dep = dated.find((d) => d.id === depId);
                      if (!dep || !dep.end_date) return null;
                      const depEnd = dayOffset(dep.end_date);
                      return (
                        <div
                          key={depId}
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{ left: `${(depEnd / totalDays) * 100}%` }}
                        >
                          <ArrowRight className="h-3 w-3 text-amber-500" />
                        </div>
                      );
                    })}
                    {/* Timepoint dots */}
                    {expTps.map((tp) => {
                      const tpDate = tp.scheduled_at.split("T")[0];
                      const tpOffset = dayOffset(tpDate);
                      return (
                        <div
                          key={tp.id}
                          className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white ${tp.completed_at ? "bg-green-500" : "bg-purple-500"}`}
                          style={{ left: `${(tpOffset / totalDays) * 100}%` }}
                          title={`${tp.label} (${tpDate})`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Planned</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> In Progress</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Completed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Timepoint</span>
        <span className="flex items-center gap-1"><span className="w-px h-3 bg-red-400 inline-block" /> Today</span>
      </div>
    </div>
  );
}

// ─── Protocols View ──────────────────────────────────────────────────────────

function ProtocolsView({ protocols }: { protocols: Protocol[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [steps, setSteps] = useState<ProtocolStep[]>([]);
  const [pending, setPending] = useState(false);

  function startNew() {
    setEditing(null);
    setSteps([{ id: crypto.randomUUID(), text: "", duration: "" }]);
    setShowForm(true);
  }

  function startEdit(p: Protocol) {
    setEditing(p);
    setSteps(p.steps.length > 0 ? p.steps : [{ id: crypto.randomUUID(), text: "", duration: "" }]);
    setShowForm(true);
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    formData.set("steps", JSON.stringify(steps.filter((s) => s.text.trim())));
    try {
      if (editing) {
        formData.set("id", editing.id);
        await updateProtocol(formData);
      } else {
        await createProtocol(formData);
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Protocol Templates</h3>
        <Button size="sm" className="gap-1" onClick={startNew}>
          <Plus className="h-3 w-3" /> New Protocol
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form action={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium mb-1 block">Title *</label>
                  <Input name="title" defaultValue={editing?.title || ""} required placeholder="e.g. Western Blot Protocol" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Category</label>
                  <Input name="category" defaultValue={editing?.category || ""} placeholder="e.g. Protein Analysis" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Description</label>
                <textarea
                  name="description"
                  defaultValue={editing?.description || ""}
                  placeholder="Protocol description..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-16"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Cloud File Links (Google Drive, etc.)</label>
                <textarea
                  name="file_links"
                  defaultValue={(editing?.file_links || []).join("\n")}
                  placeholder={"Paste one URL per line\nhttps://drive.google.com/file/d/..."}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-20"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Files stay in your cloud storage. BPAN only saves the links.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Steps</label>
                {steps.map((step, i) => (
                  <div key={step.id} className="flex gap-1 mb-1">
                    <span className="text-xs text-muted-foreground mt-2 w-6 text-right">{i + 1}.</span>
                    <Input
                      value={step.text}
                      onChange={(e) => {
                        const updated = [...steps];
                        updated[i] = { ...step, text: e.target.value };
                        setSteps(updated);
                      }}
                      placeholder={`Step ${i + 1}...`}
                      className="text-sm flex-1"
                    />
                    <Input
                      value={step.duration || ""}
                      onChange={(e) => {
                        const updated = [...steps];
                        updated[i] = { ...step, duration: e.target.value };
                        setSteps(updated);
                      }}
                      placeholder="Duration"
                      className="text-sm w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-destructive"
                      onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 gap-1"
                  onClick={() => setSteps([...steps, { id: crypto.randomUUID(), text: "", duration: "" }])}
                >
                  <Plus className="h-3 w-3" /> Add step
                </Button>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {protocols.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No protocols yet. Create reusable templates for your experiments.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {protocols.map((p) => (
            <Card key={p.id} className="group">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-sm">{p.title}</h4>
                    {p.category && (
                      <Badge variant="secondary" className="text-xs mt-1">{p.category}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(p)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteProtocol(p.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                {(p.file_links || []).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Files</p>
                    <div className="flex flex-wrap gap-1">
                      {(p.file_links || []).slice(0, 3).map((url, i) => (
                        <a
                          key={`${p.id}-file-${i}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-primary hover:bg-primary/5"
                        >
                          File {i + 1}
                        </a>
                      ))}
                      {(p.file_links || []).length > 3 && (
                        <span className="text-[11px] text-muted-foreground">+{(p.file_links || []).length - 3} more</span>
                      )}
                    </div>
                  </div>
                )}
                {p.steps.length > 0 && (
                  <div className="space-y-0.5">
                    {p.steps.slice(0, 3).map((s, i) => (
                      <p key={s.id || i} className="text-xs text-muted-foreground truncate">
                        {i + 1}. {s.text} {s.duration && <span className="text-primary/60">({s.duration})</span>}
                      </p>
                    ))}
                    {p.steps.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{p.steps.length - 3} more steps</p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">v{p.version} — {new Date(p.updated_at).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reagents View ───────────────────────────────────────────────────────────

function ReagentsView({ reagents }: { reagents: Reagent[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reagent | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      if (editing) {
        formData.set("id", editing.id);
        await updateReagent(formData);
      } else {
        await createReagent(formData);
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
    } finally {
      setPending(false);
    }
  }

  // Check for expiring reagents
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = reagents.filter(
    (r) => r.expiration_date && new Date(r.expiration_date) <= thirtyDays && new Date(r.expiration_date) >= now
  );
  const expired = reagents.filter(
    (r) => r.expiration_date && new Date(r.expiration_date) < now
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reagent & Resource Tracker</h3>
        <Button size="sm" className="gap-1" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-3 w-3" /> Add Reagent
        </Button>
      </div>

      {/* Alerts */}
      {expired.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{expired.length} reagent{expired.length > 1 ? "s" : ""} expired!</span>
        </div>
      )}
      {expiring.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{expiring.length} reagent{expiring.length > 1 ? "s" : ""} expiring within 30 days</span>
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Name *</label>
                <Input name="name" defaultValue={editing?.name || ""} required placeholder="e.g. Anti-WDR45 antibody" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Catalog #</label>
                <Input name="catalog_number" defaultValue={editing?.catalog_number || ""} placeholder="e.g. ab12345" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Supplier</label>
                <Input name="supplier" defaultValue={editing?.supplier || ""} placeholder="e.g. Abcam" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Lot #</label>
                <Input name="lot_number" defaultValue={editing?.lot_number || ""} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Quantity</label>
                <Input type="number" step="any" name="quantity" defaultValue={editing?.quantity ?? ""} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Unit</label>
                <Input name="unit" defaultValue={editing?.unit || ""} placeholder="e.g. µL, mg, mL" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Expiration Date</label>
                <Input type="date" name="expiration_date" defaultValue={editing?.expiration_date || ""} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Storage Location</label>
                <Input name="storage_location" defaultValue={editing?.storage_location || ""} placeholder="e.g. -20°C Freezer, Shelf 3" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block">Notes</label>
                <textarea
                  name="notes"
                  defaultValue={editing?.notes || ""}
                  placeholder="Additional notes..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-16"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {reagents.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Beaker className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No reagents tracked yet. Add your reagents to track stock and expiration.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium text-xs">Name</th>
                <th className="py-2 pr-3 font-medium text-xs">Supplier</th>
                <th className="py-2 pr-3 font-medium text-xs">Stock</th>
                <th className="py-2 pr-3 font-medium text-xs">Expires</th>
                <th className="py-2 pr-3 font-medium text-xs">Location</th>
                <th className="py-2 font-medium text-xs w-16"></th>
              </tr>
            </thead>
            <tbody>
              {reagents.map((r) => {
                const isExpired = r.expiration_date && new Date(r.expiration_date) < now;
                const isExpiring = r.expiration_date && new Date(r.expiration_date) <= thirtyDays && !isExpired;

                return (
                  <tr key={r.id} className={`border-b hover:bg-accent/30 transition-colors ${isExpired ? "bg-red-50/50 dark:bg-red-950/10" : isExpiring ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{r.name}</span>
                      {r.catalog_number && <span className="text-xs text-muted-foreground ml-1">({r.catalog_number})</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.supplier || "—"}</td>
                    <td className="py-2 pr-3 text-xs">
                      {r.quantity !== null ? `${r.quantity} ${r.unit || ""}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.expiration_date ? (
                        <span className={isExpired ? "text-red-600 font-medium" : isExpiring ? "text-amber-600 font-medium" : ""}>
                          {r.expiration_date}
                          {isExpired && " ⚠️"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.storage_location || "—"}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(r); setShowForm(true); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => deleteReagent(r.id)} className="text-destructive hover:text-destructive/80">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
