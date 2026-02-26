export type ActivityFeedItem = {
  id: string;
  kind: "task" | "meeting" | "note" | "experiment" | "dataset" | "analysis" | "figure" | "paper" | "calendar";
  title: string;
  detail: string;
  timestamp: string;
  href: string;
};

export type MissingDataAlert = {
  key: string;
  title: string;
  detail: string;
  href: string;
  severity: "warn" | "info";
  fix?: "resync_meeting_tasks" | "backfill_timepoints";
};

export type ActivityKindFilter = "all" | "task" | "meeting" | "note" | "results";
export type ActivityWindowFilter = "24h" | "7d" | "30d";

export type ExperimentTraceCard = {
  id: string;
  title: string;
  statusLabel: string;
  timepointsTotal: number;
  timepointsCompleted: number;
  datasets: number;
  analyses: number;
  figures: number;
  lastEventAt: string | null;
  timeline: { kind: string; label: string; meta: string; at: string; href?: string }[];
};

import type { SupabaseClient } from "@supabase/supabase-js";

export function buildWorkspaceActivityFeed(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meetings: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experiments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datasets: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyses: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  figures: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  papers: any[];
}): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];

  for (const t of input.tasks) {
    items.push({
      id: t.id,
      kind: "task",
      title: t.title || "Task updated",
      detail: `Status: ${String(t.status || "pending").replace("_", " ")}${t.source_type ? ` • ${t.source_type}` : ""}`,
      timestamp: t.updated_at,
      href: "/tasks",
    });
  }
  for (const m of input.meetings) {
    items.push({
      id: m.id,
      kind: "meeting",
      title: m.title || "Meeting note updated",
      detail: `Meeting date: ${m.meeting_date || "unknown"}`,
      timestamp: m.updated_at,
      href: `/meetings?meeting=${encodeURIComponent(m.id)}`,
    });
  }
  for (const n of input.notes) {
    items.push({
      id: n.id,
      kind: "note",
      title: n.content ? String(n.content).slice(0, 60) : "Research note updated",
      detail: `Type: ${n.note_type || "general"}`,
      timestamp: n.updated_at,
      href: "/notes",
    });
  }
  for (const e of input.experiments) {
    items.push({
      id: e.id,
      kind: "experiment",
      title: e.title || "Experiment updated",
      detail: `Status: ${String(e.status || "planned").replace("_", " ")}`,
      timestamp: e.updated_at,
      href: "/experiments",
    });
  }
  for (const d of input.datasets) {
    items.push({
      id: d.id,
      kind: "dataset",
      title: d.name || "Dataset updated",
      detail: `${d.row_count ?? 0} rows${d.experiment_id ? " • linked to experiment" : " • unlinked"}`,
      timestamp: d.updated_at,
      href: `/results?dataset=${encodeURIComponent(d.id)}&tab=data`,
    });
  }
  for (const a of input.analyses) {
    items.push({
      id: a.id,
      kind: "analysis",
      title: a.name || "Analysis created",
      detail: `Test: ${String(a.test_type || "analysis").replace("_", " ")}`,
      timestamp: a.created_at,
      href: a.dataset_id
        ? `/results?dataset=${encodeURIComponent(a.dataset_id)}&tab=analyze&analysis=${encodeURIComponent(a.id)}`
        : "/results?tab=analyze",
    });
  }
  for (const f of input.figures) {
    items.push({
      id: f.id,
      kind: "figure",
      title: f.name || "Figure updated",
      detail: `Chart: ${f.chart_type || "figure"}`,
      timestamp: f.updated_at,
      href: f.dataset_id
        ? `/results?dataset=${encodeURIComponent(f.dataset_id)}&tab=visualize&figure=${encodeURIComponent(f.id)}`
        : "/results?tab=visualize",
    });
  }
  for (const p of input.papers) {
    items.push({
      id: p.id,
      kind: "paper",
      title: p.title || "Saved paper",
      detail: p.journal ? `Saved from ${p.journal}` : "Saved to library",
      timestamp: p.created_at,
      href: "/library",
    });
  }

  return items
    .filter((i) => Boolean(i.timestamp))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);
}

export async function getIndexedWorkspaceActivityFeed(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<ActivityFeedItem[] | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_events")
      .select("entity_id, entity_type, title, detail, href, event_at")
      .eq("user_id", userId)
      .order("event_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (error.message.toLowerCase().includes("relation")) return null;
      throw error;
    }
    return (data || []).map((row) => ({
      id: String(row.entity_id),
      kind: mapEventEntityTypeToActivityKind(String(row.entity_type)),
      title: String(row.title || "Activity"),
      detail: String(row.detail || ""),
      timestamp: String(row.event_at),
      href: String(row.href || "/dashboard"),
    }));
  } catch {
    return null;
  }
}

export async function getWorkspaceBackstageIndexStats(
  supabase: SupabaseClient,
  userId: string
): Promise<{ links: number; events: number; latestEventAt: string | null } | null> {
  try {
    const [{ count: links }, { count: events }, latest] = await Promise.all([
      supabase.from("workspace_entity_links").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("workspace_events").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("workspace_events").select("event_at").eq("user_id", userId).order("event_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (latest.error && latest.error.message.toLowerCase().includes("relation")) return null;
    return {
      links: links || 0,
      events: events || 0,
      latestEventAt: latest.data?.event_at || null,
    };
  } catch {
    return null;
  }
}

function mapEventEntityTypeToActivityKind(entityType: string): ActivityFeedItem["kind"] {
  if (entityType === "calendar_event") return "calendar";
  if (entityType === "animal_experiment" || entityType === "colony_result") return "experiment";
  if (entityType === "meeting") return "meeting";
  if (entityType === "task") return "task";
  if (entityType === "note") return "note";
  if (entityType === "experiment") return "experiment";
  if (entityType === "dataset") return "dataset";
  if (entityType === "analysis") return "analysis";
  if (entityType === "figure") return "figure";
  return "paper";
}

export function filterWorkspaceActivityFeed(items: ActivityFeedItem[], kind: ActivityKindFilter, window: ActivityWindowFilter) {
  const now = Date.now();
  const maxAgeMs =
    window === "24h" ? 24 * 60 * 60 * 1000 :
    window === "7d" ? 7 * 24 * 60 * 60 * 1000 :
    30 * 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    const ageOk = now - new Date(item.timestamp).getTime() <= maxAgeMs;
    if (!ageOk) return false;
    if (kind === "all") return true;
    if (kind === "results") return ["dataset", "analysis", "figure"].includes(item.kind);
    return item.kind === kind;
  });
}

export function buildMissingDataAlerts(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experiments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timepoints: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datasets: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyses: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  figures: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meetings: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meetingActionTasks: any[];
}): MissingDataAlert[] {
  const alerts: MissingDataAlert[] = [];
  const timepointsByExperiment = new Map<string, number>();
  for (const tp of input.timepoints) {
    if (!tp.experiment_id) continue;
    timepointsByExperiment.set(tp.experiment_id, (timepointsByExperiment.get(tp.experiment_id) || 0) + 1);
  }

  const experimentsWithoutTimepoints = input.experiments.filter(
    (e) => ["planned", "in_progress"].includes(String(e.status)) && !timepointsByExperiment.get(e.id)
  );
  if (experimentsWithoutTimepoints.length > 0) {
    alerts.push({
      key: "exp-no-timepoints",
      title: `${experimentsWithoutTimepoints.length} active experiment${experimentsWithoutTimepoints.length === 1 ? "" : "s"} missing timepoints`,
      detail: "Add scheduled timepoints so calendar and progress tracking stay accurate.",
      href: "/experiments",
      severity: "warn",
      fix: "backfill_timepoints",
    });
  }

  const unlinkedDatasets = input.datasets.filter((d) => !d.experiment_id);
  if (unlinkedDatasets.length > 0) {
    alerts.push({
      key: "datasets-unlinked",
      title: `${unlinkedDatasets.length} dataset${unlinkedDatasets.length === 1 ? "" : "s"} not linked to an experiment`,
      detail: "Link datasets to experiments to improve results traceability.",
      href: "/results",
      severity: "warn",
    });
  }

  const datasetIds = new Set(input.datasets.map((d) => d.id));
  const analysesMissingDataset = input.analyses.filter((a) => !a.dataset_id || !datasetIds.has(a.dataset_id));
  if (analysesMissingDataset.length > 0) {
    alerts.push({
      key: "analysis-missing-dataset",
      title: `${analysesMissingDataset.length} analys${analysesMissingDataset.length === 1 ? "is" : "es"} with missing dataset link`,
      detail: "These analyses may be pointing to deleted/unavailable datasets.",
      href: "/results",
      severity: "warn",
    });
  }

  const figuresWithoutAnalysis = input.figures.filter((f) => !f.analysis_id);
  if (figuresWithoutAnalysis.length > 0) {
    alerts.push({
      key: "figures-no-analysis",
      title: `${figuresWithoutAnalysis.length} figure${figuresWithoutAnalysis.length === 1 ? "" : "s"} not tied to an analysis`,
      detail: "Optional, but linking figures to analyses improves reproducibility and reporting.",
      href: "/results",
      severity: "info",
    });
  }

  const syncedByMeeting = new Map<string, number>();
  for (const t of input.meetingActionTasks) {
    if (!t.source_id) continue;
    syncedByMeeting.set(t.source_id, (syncedByMeeting.get(t.source_id) || 0) + 1);
  }
  const meetingsWithActions = input.meetings.filter((m) => Array.isArray(m.action_items) && m.action_items.length > 0);
  const meetingsWithoutSyncedTasks = meetingsWithActions.filter((m) => (syncedByMeeting.get(m.id) || 0) === 0);
  if (meetingsWithoutSyncedTasks.length > 0) {
    alerts.push({
      key: "meeting-actions-unsynced",
      title: `${meetingsWithoutSyncedTasks.length} meeting${meetingsWithoutSyncedTasks.length === 1 ? "" : "s"} has action items but no synced tasks`,
      detail: "Open and save the meeting note to refresh the meeting-to-task sync.",
      href: "/meetings",
      severity: "warn",
      fix: "resync_meeting_tasks",
    });
  }

  return alerts.slice(0, 6);
}

export function buildExperimentTraceabilityCards(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experiments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timepoints: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datasets: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyses: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  figures: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[];
}): ExperimentTraceCard[] {
  const datasetsByExperiment = new Map<string, typeof input.datasets>();
  for (const d of input.datasets) {
    if (!d.experiment_id) continue;
    const list = datasetsByExperiment.get(d.experiment_id) || [];
    list.push(d);
    datasetsByExperiment.set(d.experiment_id, list);
  }

  const analysesByDataset = new Map<string, typeof input.analyses>();
  for (const a of input.analyses) {
    if (!a.dataset_id) continue;
    const list = analysesByDataset.get(a.dataset_id) || [];
    list.push(a);
    analysesByDataset.set(a.dataset_id, list);
  }

  const figuresByDataset = new Map<string, typeof input.figures>();
  for (const f of input.figures) {
    if (!f.dataset_id) continue;
    const list = figuresByDataset.get(f.dataset_id) || [];
    list.push(f);
    figuresByDataset.set(f.dataset_id, list);
  }

  const figuresByAnalysis = new Map<string, typeof input.figures>();
  for (const f of input.figures) {
    if (!f.analysis_id) continue;
    const list = figuresByAnalysis.get(f.analysis_id) || [];
    list.push(f);
    figuresByAnalysis.set(f.analysis_id, list);
  }

  const tasksByExperiment = new Map<string, typeof input.tasks>();
  for (const t of input.tasks) {
    if (!t.source_id) continue;
    const list = tasksByExperiment.get(t.source_id) || [];
    list.push(t);
    tasksByExperiment.set(t.source_id, list);
  }

  return [...input.experiments]
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 8)
    .map((exp) => {
      const timepoints = input.timepoints.filter((tp) => tp.experiment_id === exp.id);
      const expDatasets = datasetsByExperiment.get(exp.id) || [];
      const expAnalyses = expDatasets.flatMap((d) => analysesByDataset.get(d.id) || []);
      const expFigures = [
        ...expDatasets.flatMap((d) => figuresByDataset.get(d.id) || []),
        ...expAnalyses.flatMap((a) => figuresByAnalysis.get(a.id) || []),
      ];
      const expTasks = tasksByExperiment.get(exp.id) || [];

      const timeline: ExperimentTraceCard["timeline"] = [];
      for (const tp of [...timepoints].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()).slice(0, 2)) {
        timeline.push({
          kind: "timepoint",
          label: `Timepoint: ${tp.label}`,
          meta: tp.completed_at ? `Completed ${formatTraceTime(tp.completed_at)}` : `Scheduled ${formatTraceTime(tp.scheduled_at)}`,
          at: tp.completed_at || tp.scheduled_at,
          href: "/experiments",
        });
      }
      for (const d of [...expDatasets].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()).slice(0, 2)) {
        timeline.push({
          kind: "dataset",
          label: `Dataset: ${d.name}`,
          meta: `${d.row_count ?? 0} rows`,
          at: d.updated_at || d.created_at,
          href: `/results?dataset=${encodeURIComponent(d.id)}&tab=data`,
        });
      }
      for (const a of [...expAnalyses].sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()).slice(0, 2)) {
        timeline.push({
          kind: "analysis",
          label: `Analysis: ${a.name}`,
          meta: String(a.test_type || "analysis").replace("_", " "),
          at: a.created_at,
          href: `/results?dataset=${encodeURIComponent(a.dataset_id)}&tab=analyze&analysis=${encodeURIComponent(a.id)}`,
        });
      }
      for (const f of [...expFigures].sort((x, y) => new Date(y.updated_at || y.created_at).getTime() - new Date(x.updated_at || x.created_at).getTime()).slice(0, 1)) {
        timeline.push({
          kind: "figure",
          label: `Figure: ${f.name}`,
          meta: String(f.chart_type || "figure"),
          at: f.updated_at || f.created_at,
          href: f.dataset_id
            ? `/results?dataset=${encodeURIComponent(f.dataset_id)}&tab=visualize&figure=${encodeURIComponent(f.id)}`
            : "/results?tab=visualize",
        });
      }
      for (const t of [...expTasks].sort((x, y) => new Date(y.updated_at).getTime() - new Date(x.updated_at).getTime()).slice(0, 1)) {
        timeline.push({
          kind: "task",
          label: `Task: ${t.title}`,
          meta: `Status: ${String(t.status).replace("_", " ")}${t.due_date ? ` • due ${t.due_date}` : ""}`,
          at: t.updated_at,
          href: "/tasks",
        });
      }

      timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      const lastEventAt = timeline[0]?.at || exp.updated_at || exp.created_at;

      return {
        id: exp.id,
        title: exp.title,
        statusLabel: String(exp.status || "planned").replace("_", " "),
        timepointsTotal: timepoints.length,
        timepointsCompleted: timepoints.filter((tp) => !!tp.completed_at).length,
        datasets: expDatasets.length,
        analyses: expAnalyses.length,
        figures: expFigures.length,
        lastEventAt,
        timeline: timeline.slice(0, 5),
      };
    });
}

function formatTraceTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffHrs = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
  if (diffHrs < 24) return diffHrs <= 0 ? "today" : `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
