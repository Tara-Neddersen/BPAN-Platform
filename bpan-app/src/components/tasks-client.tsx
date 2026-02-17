"use client";

import { useState, useMemo } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
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
};

function daysUntil(dateStr: string) {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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

// ─── Interfaces ──────────────────────────────────────────────────────────

// Behavior experiment types (handling → rotarod/stamina/blood_draw) treated as one batch
const BEHAVIOR_EXP_TYPES = new Set([
  "handling", "y_maze", "marble", "ldb", "nesting",
  "data_collection", "core_acclimation", "catwalk",
  "rotarod_hab", "rotarod", "stamina", "blood_draw",
]);

const EXP_TYPE_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y-Maze", marble: "Marble Burying",
  ldb: "Light-Dark Box", nesting: "Nesting", data_collection: "Data Collection",
  core_acclimation: "Core Acclimation", catwalk: "CatWalk", rotarod_hab: "Rotarod Hab",
  rotarod: "Rotarod", stamina: "Stamina", blood_draw: "Plasma Collection",
  eeg_implant: "EEG Implant", eeg_recording: "EEG Recording",
};

interface TasksClientProps {
  tasks: Task[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcomingExperiments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cohorts: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcomingCageChanges: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentMeetings: any[];
  actions: {
    createTask: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateTask: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    toggleTask: (id: string, completed: boolean) => Promise<{ success?: boolean; error?: string }>;
    deleteTask: (id: string) => Promise<{ success?: boolean; error?: string }>;
  };
}

type ViewFilter = "all" | "today" | "upcoming" | "overdue" | "completed";

// ─── Main Component ─────────────────────────────────────────────────────

export function TasksClient({
  tasks: initTasks,
  upcomingExperiments,
  cohorts,
  upcomingCageChanges,
  recentMeetings,
  actions,
}: TasksClientProps) {
  const [tasks, setTasks] = useState(initTasks);
  const [view, setView] = useState<ViewFilter>("all");
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  // ─── Stats ──────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
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
    const pending = tasks.filter((t) => t.status !== "completed" && t.status !== "skipped");
    switch (view) {
      case "today": return pending.filter((t) => t.due_date === today);
      case "upcoming": return pending.filter((t) => t.due_date && t.due_date > today);
      case "overdue": return pending.filter((t) => t.due_date && t.due_date < today);
      case "completed": return tasks.filter((t) => t.status === "completed").slice(0, 20);
      default: return pending;
    }
  }, [tasks, view, today]);

  async function act(promise: Promise<{ success?: boolean; error?: string }>) {
    setBusy(true);
    const res = await promise;
    if (res?.error) toast.error(res.error);
    else toast.success("Done!");
    // Simple reload for now
    window.location.reload();
    setBusy(false);
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
    else { toast.success("Done!"); onSuccess(); window.location.reload(); }
    setBusy(false);
  }

  return (
    <>
      {/* ─── Stats Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setView("overdue")}
          className={`flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md ${
            view === "overdue" ? "border-red-300 ring-2 ring-red-100 shadow-sm" : ""
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{stats.overdue.length}</div>
            <div className="text-xs text-muted-foreground">Overdue</div>
          </div>
        </button>
        <button
          onClick={() => setView("today")}
          className={`flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md ${
            view === "today" ? "border-amber-300 ring-2 ring-amber-100 shadow-sm" : ""
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{stats.dueToday.length}</div>
            <div className="text-xs text-muted-foreground">Due Today</div>
          </div>
        </button>
        <button
          onClick={() => setView("upcoming")}
          className={`flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md ${
            view === "upcoming" ? "border-blue-300 ring-2 ring-blue-100 shadow-sm" : ""
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{stats.upcoming.length}</div>
            <div className="text-xs text-muted-foreground">Upcoming</div>
          </div>
        </button>
        <button
          onClick={() => setView("completed")}
          className={`flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md ${
            view === "completed" ? "border-green-300 ring-2 ring-green-100 shadow-sm" : ""
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{stats.completed.length}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
        </button>
      </div>

      {/* ─── Upcoming Experiments (Batched by Cohort) & Other Items ─── */}
      {(upcomingExperiments.length > 0 || upcomingCageChanges.length > 0 || recentMeetings.length > 0) && (
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
                    firstDate: exp.scheduled_date,
                    lastDate: exp.scheduled_date,
                    count: 0,
                  });
                }

                const batch = batches.get(key)!;
                batch.animals.add(exp.animals?.identifier || "?");
                batch.expTypes.add(exp.experiment_type);
                if (exp.scheduled_date < batch.firstDate) batch.firstDate = exp.scheduled_date;
                if (exp.scheduled_date > batch.lastDate) batch.lastDate = exp.scheduled_date;
                batch.count++;
              }

              const sortedBatches = [...batches.values()].sort((a, b) => a.firstDate.localeCompare(b.firstDate));

              return sortedBatches.map((batch, i) => {
                const dateRange = batch.firstDate === batch.lastDate
                  ? formatDate(batch.firstDate)
                  : `${formatDate(batch.firstDate)} → ${formatDate(batch.lastDate)}`;

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
                          <span>Behavior Experiments (Handling → Y-Maze, LDB, Marble, Nesting, CatWalk, Rotarod, Plasma)</span>
                        ) : (
                          <span>{[...batch.expTypes].map(t => EXP_TYPE_LABELS[t] || t).join(", ")}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 ml-5">
                        Animals: {[...batch.animals].join(", ")}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0 whitespace-nowrap">
                      {dateRange}
                    </Badge>
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

      {/* ─── Filter Tabs & Add Button ──────────────────── */}
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
        <Button onClick={() => setShowAddTask(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Task
        </Button>
      </div>

      {/* ─── Task List ─────────────────────────────────── */}
      {filteredTasks.length === 0 ? (
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
      )}

      {/* ─── Add Task Dialog ───────────────────────────── */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editingTask && (
            <form onSubmit={(e) => handleFormAction((fd) => actions.updateTask(editingTask.id, fd), e, () => setEditingTask(null))} className="space-y-3">
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
              {editingTask.source_label && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {SOURCE_ICONS[editingTask.source_type || "manual"]}
                  Source: {editingTask.source_label}
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

