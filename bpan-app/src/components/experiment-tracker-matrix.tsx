"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, Minus, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import type {
  Animal,
  Cohort,
  ColonyResult,
  ColonyTimepoint,
  AnimalExperiment,
  ExperimentRun,
  RunAssignment,
  RunTimepoint,
  RunTimepointExperiment,
} from "@/types";
import { sortCohortsByName } from "@/lib/cohort-sort";

// ─── Labels ────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling",
  y_maze: "Y-Maze",
  ldb: "LDB",
  marble: "Marble",
  nesting: "Nesting",
  social_interaction: "Social Interaction",
  data_collection: "Transport to Core",
  core_acclimation: "Core Acclim",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Hab",
  rotarod_test1: "Rotarod Test 1",
  rotarod_test2: "Rotarod Test 2",
  rotarod: "Rotarod",
  stamina: "Stamina",
  blood_draw: "Plasma Collection",
  eeg_implant: "EEG Implant",
  eeg_recording: "EEG Record",
};

const GENOTYPE_LABELS: Record<string, string> = {
  hemi: "HEMI",
  het: "HET",
  wt: "WT",
};

// Strong, accessible genotype badge colors (light + dark) — distinct per
// genotype so the sticky GT column reads clearly.
const GENOTYPE_BADGE_CLASS: Record<string, string> = {
  hemi: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  het: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  wt: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
};

const STATUS_ICON: Record<string, { icon: React.ReactNode; color: string; title: string }> = {
  completed: {
    icon: <Check className="w-3.5 h-3.5" />,
    color: "text-green-600 bg-green-50 dark:bg-green-950/40",
    title: "Completed",
  },
  scheduled: {
    icon: <Clock className="w-3.5 h-3.5" />,
    color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40",
    title: "Scheduled",
  },
  in_progress: {
    icon: <Clock className="w-3.5 h-3.5" />,
    color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40",
    title: "In Progress",
  },
  skipped: {
    icon: <X className="w-3.5 h-3.5" />,
    color: "text-red-400 bg-red-50 dark:bg-red-950/40",
    title: "Skipped",
  },
  pending: {
    icon: <Minus className="w-3.5 h-3.5" />,
    color: "text-gray-300 bg-gray-50 dark:bg-gray-900/40",
    title: "Pending",
  },
};

// ─── Props ─────────────────────────────────────────────────────────────

interface ExperimentTrackerMatrixProps {
  animals: Animal[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
  experiments: AnimalExperiment[];
  colonyResults: ColonyResult[];
  experimentRuns: ExperimentRun[];
  runAssignments: RunAssignment[];
  runTimepoints: RunTimepoint[];
  runTimepointExperiments: RunTimepointExperiment[];
  /** Shared run id from the `run` URL param. Seeds the initial selection when present; falls back to "__all__" otherwise or when it doesn't match a real run. */
  initialRunId?: string | null;
  /** Persist the selected run to the shared `run` URL param so it survives tab switches. */
  onRunChange?: (runId: string | null) => void;
  onBatchUpdateStatus?: (cohortIds: string[], timepointAgeDays: number[], experimentTypes: string[], newStatus: string, notes?: string) => Promise<{ success?: boolean; error?: string; updated?: number }>;
  onBatchUpdated?: () => Promise<void> | void;
}

// ─── Multi-toggle helper ────────────────────────────────────────────────

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function resultHasData(result: ColonyResult) {
  return Object.values((result.measures || {}) as Record<string, unknown>).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== "";
  });
}

function animalMatchesRunAssignments(animal: Animal, assignments: RunAssignment[]) {
  if (assignments.length === 0) return true;

  return assignments.some((assignment) => {
    if (assignment.scope_type === "study") return true;
    if (assignment.scope_type === "cohort" && assignment.cohort_id) return animal.cohort_id === assignment.cohort_id;
    if (assignment.scope_type === "animal" && assignment.animal_id) return animal.id === assignment.animal_id;
    return false;
  });
}

// ─── Component ─────────────────────────────────────────────────────────

export function ExperimentTrackerMatrix({
  animals,
  cohorts,
  timepoints,
  experiments,
  colonyResults,
  experimentRuns,
  runAssignments,
  runTimepoints,
  runTimepointExperiments,
  initialRunId = null,
  onRunChange,
  onBatchUpdateStatus,
  onBatchUpdated,
}: ExperimentTrackerMatrixProps) {
  const router = useRouter();
  // Seed from the shared `run` URL param when provided; otherwise keep the
  // existing default ("__all__"). Invalid ids are reconciled to "__all__" by
  // `resolvedRunId` below, so no crash if the id doesn't match a real run.
  const [activeRunId, setActiveRunId] = useState(initialRunId || "__all__");
  const [filterCohort, setFilterCohort] = useState("all");
  const [sortKey, setSortKey] = useState<"cohort" | "identifier" | "genotype" | "sex" | "completion">("cohort");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCohorts, setBatchCohorts] = useState<Set<string>>(new Set());
  const [batchTps, setBatchTps] = useState<Set<number>>(new Set());
  const [batchExps, setBatchExps] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string>("");
  const [batchSkipReason, setBatchSkipReason] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [batchResult, setBatchResult] = useState<string | null>(null);

  // Update local run state (immediate source of truth for this tab) and persist
  // the choice to the shared `run` URL param so it survives a tab switch.
  const handleRunSelect = useCallback((runId: string) => {
    setActiveRunId(runId);
    onRunChange?.(runId);
  }, [onRunChange]);

  const resetBatch = useCallback(() => {
    setBatchCohorts(new Set());
    setBatchTps(new Set());
    setBatchExps(new Set());
    setBatchStatus("");
    setBatchSkipReason("");
    setBatchResult(null);
  }, []);

  const visibleRuns = useMemo(() => {
    return experimentRuns
      .filter((run) => run.status !== "cancelled")
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [experimentRuns]);

  const resolvedRunId =
    activeRunId === "__all__" || visibleRuns.some((run) => run.id === activeRunId) ? activeRunId : "__all__";

  const selectedRun = useMemo(
    () => visibleRuns.find((run) => run.id === resolvedRunId) || null,
    [resolvedRunId, visibleRuns],
  );

  const selectedRunAssignments = useMemo(
    () => runAssignments.filter((assignment) => assignment.experiment_run_id === resolvedRunId),
    [resolvedRunId, runAssignments],
  );

  const selectedRunTimepoints = useMemo(
    () =>
      runTimepoints
        .filter((timepoint) => timepoint.experiment_run_id === resolvedRunId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [resolvedRunId, runTimepoints],
  );

  const selectedRunTimepointIds = useMemo(
    () => selectedRunTimepoints.map((timepoint) => timepoint.id),
    [selectedRunTimepoints],
  );

  const selectedRunExperiments = useMemo(
    () =>
      runTimepointExperiments
        .filter((experiment) => selectedRunTimepointIds.includes(experiment.run_timepoint_id))
        .sort((a, b) => a.sort_order - b.sort_order),
    [runTimepointExperiments, selectedRunTimepointIds],
  );

  // Sorted timepoints by age
  const sortedTimepoints = useMemo(
    () => [...timepoints].sort((a, b) => a.age_days - b.age_days),
    [timepoints]
  );

  // Gather all unique experiment types: from timepoint config + actual experiment data
  const allExperimentTypes = useMemo(() => {
    if (selectedRun) {
      return [...new Set(selectedRunExperiments.map((experiment) => experiment.experiment_key))];
    }
    const types: string[] = [];
    // Start with timepoint-configured experiments
    for (const tp of sortedTimepoints) {
      for (const exp of tp.experiments) {
        if (!types.includes(exp)) types.push(exp);
      }
    }
    // Also handle "handling" which happens before each timepoint
    if (!types.includes("handling")) {
      types.unshift("handling");
    }
    // Also include EEG and any other types found in actual experiment data
    for (const exp of experiments) {
      if (!types.includes(exp.experiment_type)) {
        types.push(exp.experiment_type);
      }
    }
    return types;
  }, [experiments, selectedRun, selectedRunExperiments, sortedTimepoints]);

  // Filter animals (sorting is applied later, once per-row completion counts
  // are available — see sortedAnimals below).
  const filteredAnimals = useMemo(() => {
    let list = animals.filter((a) => a.status === "active");
    if (filterCohort !== "all") {
      list = list.filter((a) => a.cohort_id === filterCohort);
    }
    if (selectedRun) {
      list = list.filter((animal) => animalMatchesRunAssignments(animal, selectedRunAssignments));
    }
    return list;
  }, [animals, filterCohort, selectedRun, selectedRunAssignments]);

  // Build a lookup: animalId -> timepointAge -> experimentType -> status
  const statusMap = useMemo(() => {
    const map = new Map<string, Map<number, Map<string, string>>>();
    for (const exp of experiments) {
      if (!map.has(exp.animal_id)) map.set(exp.animal_id, new Map());
      const byAnimal = map.get(exp.animal_id)!;
      const tpAge = exp.timepoint_age_days ?? 0;
      if (!byAnimal.has(tpAge)) byAnimal.set(tpAge, new Map());
      byAnimal.get(tpAge)!.set(exp.experiment_type, exp.status);
    }
    return map;
  }, [experiments]);

  const completedResultMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const result of colonyResults) {
      if (!resultHasData(result)) continue;

      if (selectedRun) {
        if (result.experiment_run_id !== selectedRun.id) continue;
        const timepoint = selectedRunTimepoints.find((item) => item.id === result.run_timepoint_id);
        const experiment = selectedRunExperiments.find((item) => item.id === result.run_timepoint_experiment_id);
        if (!timepoint || !experiment) continue;
        if (!map.has(result.animal_id)) map.set(result.animal_id, new Set());
        map.get(result.animal_id)?.add(`${timepoint.target_age_days}::${experiment.experiment_key}`);
        continue;
      }

      if (!map.has(result.animal_id)) map.set(result.animal_id, new Set());
      map.get(result.animal_id)?.add(`${result.timepoint_age_days}::${result.experiment_type}`);
    }
    return map;
  }, [colonyResults, selectedRun, selectedRunExperiments, selectedRunTimepoints]);

  const effectiveTimepoints = useMemo(
    () =>
      selectedRun
        ? selectedRunTimepoints.map((timepoint) => ({
            age_days: timepoint.target_age_days,
            name: timepoint.label,
          }))
        : sortedTimepoints.map((timepoint) => ({
            age_days: timepoint.age_days,
            name: timepoint.name,
          })),
    [selectedRun, selectedRunTimepoints, sortedTimepoints],
  );

  // EEG Implant only belongs at the first timepoint; EEG Recording at all.
  // Build per-timepoint experiment type lists accordingly.
  const firstTpAge = sortedTimepoints.length > 0 ? sortedTimepoints[0].age_days : null;
  const hasEegImplant = allExperimentTypes.includes("eeg_implant");

  const getTypesForTp = useCallback((tpAge: number) => {
    if (!hasEegImplant) return allExperimentTypes;
    // Only show eeg_implant for the first timepoint
    if (tpAge === firstTpAge) return allExperimentTypes;
    return allExperimentTypes.filter(t => t !== "eeg_implant");
  }, [allExperimentTypes, firstTpAge, hasEegImplant]);

  // Summary stats
  const summary = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const animal of filteredAnimals) {
      for (const tp of effectiveTimepoints) {
        for (const expType of getTypesForTp(tp.age_days)) {
          total++;
          const status = completedResultMap.get(animal.id)?.has(`${tp.age_days}::${expType}`)
            ? "completed"
            : statusMap.get(animal.id)?.get(tp.age_days)?.get(expType);
          if (status === "completed") completed++;
        }
      }
    }
    return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [completedResultMap, effectiveTimepoints, filteredAnimals, getTypesForTp, statusMap]);

  // Column headers: per-timepoint experiment types (EEG implant only at first TP)
  const columns = useMemo(() => {
    const cols: { tpAge: number; tpName: string; expType: string; label: string }[] = [];
    if (selectedRun) {
      for (const tp of selectedRunTimepoints) {
        const experimentsForTimepoint = selectedRunExperiments
          .filter((experiment) => experiment.run_timepoint_id === tp.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        for (const experiment of experimentsForTimepoint) {
          cols.push({
            tpAge: tp.target_age_days,
            tpName: tp.label,
            expType: experiment.experiment_key,
            label: experiment.label || EXPERIMENT_LABELS[experiment.experiment_key] || experiment.experiment_key,
          });
        }
      }
      return cols;
    }
    for (const tp of sortedTimepoints) {
      for (const expType of getTypesForTp(tp.age_days)) {
        cols.push({
          tpAge: tp.age_days,
          tpName: tp.name,
          expType,
          label: EXPERIMENT_LABELS[expType] || expType,
        });
      }
    }
    return cols;
  }, [selectedRun, selectedRunExperiments, selectedRunTimepoints, sortedTimepoints, getTypesForTp]);

  // Group columns by timepoint for header spans
  const tpGroups = useMemo(() => {
    const groups: { tpAge: number; tpName: string; colCount: number }[] = [];
    if (selectedRun) {
      for (const tp of selectedRunTimepoints) {
        groups.push({
          tpAge: tp.target_age_days,
          tpName: tp.label,
          colCount: selectedRunExperiments.filter((experiment) => experiment.run_timepoint_id === tp.id).length,
        });
      }
      return groups;
    }
    for (const tp of sortedTimepoints) {
      groups.push({
        tpAge: tp.age_days,
        tpName: tp.name,
        colCount: getTypesForTp(tp.age_days).length,
      });
    }
    return groups;
  }, [selectedRun, selectedRunExperiments, selectedRunTimepoints, sortedTimepoints, getTypesForTp]);

  // Per-animal completed count over the visible columns. Reuses the exact same
  // status resolution as the rendered cells (completedResultMap → statusMap),
  // so sorting by completion matches the icons shown in each row.
  const completedByAnimal = useMemo(() => {
    const map = new Map<string, number>();
    for (const animal of filteredAnimals) {
      const animalStatuses = statusMap.get(animal.id);
      const resultCompletions = completedResultMap.get(animal.id);
      let count = 0;
      for (const col of columns) {
        const st = resultCompletions?.has(`${col.tpAge}::${col.expType}`)
          ? "completed"
          : animalStatuses?.get(col.tpAge)?.get(col.expType);
        if (st === "completed") count++;
      }
      map.set(animal.id, count);
    }
    return map;
  }, [filteredAnimals, columns, completedResultMap, statusMap]);

  // Apply user-controlled sort. Default (cohort → identifier, ascending) leaves
  // ordering identical to the previous behavior.
  const cohortNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cohorts) m.set(c.id, c.name);
    return m;
  }, [cohorts]);

  // Natural/numeric sort for cohort dropdown + batch-select chips ("BPAN 3" before "BPAN 10").
  const sortedCohorts = useMemo(() => sortCohortsByName(cohorts), [cohorts]);

  const sortedAnimals = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const byCohortThenId = (a: Animal, b: Animal) => {
      const cohortA = cohortNameById.get(a.cohort_id) || "";
      const cohortB = cohortNameById.get(b.cohort_id) || "";
      if (cohortA !== cohortB) return cohortA.localeCompare(cohortB, undefined, { numeric: true });
      return a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
    };

    const compare = (a: Animal, b: Animal): number => {
      let primary = 0;
      switch (sortKey) {
        case "cohort":
          // Default ordering: cohort then identifier as the natural tiebreak.
          return byCohortThenId(a, b) * dir;
        case "identifier":
          primary = a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
          break;
        case "genotype":
          primary = (a.genotype || "").localeCompare(b.genotype || "", undefined, { numeric: true });
          break;
        case "sex":
          primary = (a.sex || "").localeCompare(b.sex || "", undefined, { numeric: true });
          break;
        case "completion":
          primary = (completedByAnimal.get(a.id) || 0) - (completedByAnimal.get(b.id) || 0);
          break;
      }
      if (primary !== 0) return primary * dir;
      // Stable, sensible tiebreak so equal keys stay grouped predictably.
      return byCohortThenId(a, b);
    };

    return [...filteredAnimals].sort(compare);
  }, [filteredAnimals, sortKey, sortDir, cohortNameById, completedByAnimal]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">📋 Experiment Tracker</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              All animals × tests × timepoints — at a glance
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Summary */}
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{summary.pct}%</div>
              <div className="text-xs text-muted-foreground">
                {summary.completed}/{summary.total} done
              </div>
            </div>
            <Select value={resolvedRunId} onValueChange={handleRunSelect}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Runs / Legacy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Runs / Legacy</SelectItem>
                {visibleRuns.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    {run.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Filter */}
            <Select value={filterCohort} onValueChange={setFilterCohort}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Cohorts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cohorts</SelectItem>
                {sortedCohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Sort */}
            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as typeof sortKey)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort rows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cohort">Sort: Cohort</SelectItem>
                <SelectItem value="identifier">Sort: Animal ID</SelectItem>
                <SelectItem value="genotype">Sort: Genotype</SelectItem>
                <SelectItem value="sex">Sort: Sex</SelectItem>
                <SelectItem value="completion">Sort: Completion</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              title={sortDir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
              aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </Button>
          </div>
        </div>

        {/* Legend + Batch Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS_ICON).map(([key, { icon, color, title }]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${color}`}>
                  {icon}
                </span>
                {title}
              </div>
            ))}
          </div>
          {onBatchUpdateStatus && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => { setBatchOpen(!batchOpen); setBatchResult(null); }}
            >
              <Zap className="w-3.5 h-3.5" />
              Batch Update
            </Button>
          )}
        </div>

        {/* Batch Update Panel */}
        {batchOpen && onBatchUpdateStatus && (
          <div className="mt-3 p-4 rounded-lg border bg-muted/30 space-y-4">
            <p className="text-sm font-medium">Batch update — click to select multiple, then Apply</p>

            {/* Cohorts */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Cohorts <span className="text-muted-foreground/60">(none = all)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {sortedCohorts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setBatchCohorts(toggleSet(batchCohorts, c.id))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      batchCohorts.has(c.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Timepoints */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Timepoints</p>
              <div className="flex flex-wrap gap-1.5">
                {effectiveTimepoints.map((tp) => (
                  <button
                    key={tp.age_days}
                    type="button"
                    onClick={() => setBatchTps(toggleSet(batchTps, tp.age_days))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      batchTps.has(tp.age_days)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {tp.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (batchTps.size === effectiveTimepoints.length) setBatchTps(new Set());
                    else setBatchTps(new Set(effectiveTimepoints.map((tp) => tp.age_days)));
                  }}
                  className="px-2.5 py-1 rounded-full text-xs border border-dashed hover:bg-muted transition-colors text-muted-foreground"
                >
                  {batchTps.size === effectiveTimepoints.length ? "Clear all" : "Select all"}
                </button>
              </div>
            </div>

            {/* Experiments */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Experiments</p>
              <div className="flex flex-wrap gap-1.5">
                {allExperimentTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBatchExps(toggleSet(batchExps, t))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      batchExps.has(t)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {EXPERIMENT_LABELS[t] || t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (batchExps.size === allExperimentTypes.length) setBatchExps(new Set());
                    else setBatchExps(new Set(allExperimentTypes));
                  }}
                  className="px-2.5 py-1 rounded-full text-xs border border-dashed hover:bg-muted transition-colors text-muted-foreground"
                >
                  {batchExps.size === allExperimentTypes.length ? "Clear all" : "Select all"}
                </button>
              </div>
            </div>

            {/* Status + Apply */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Mark as</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { value: "completed", label: "✅ Completed" },
                    { value: "in_progress", label: "🟡 In Progress" },
                    { value: "scheduled", label: "🔵 Scheduled" },
                    { value: "skipped", label: "❌ Skipped" },
                    { value: "pending", label: "— Pending" },
                  ] as const).map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setBatchStatus(batchStatus === s.value ? "" : s.value)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        batchStatus === s.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {batchStatus === "skipped" && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Skip reason (optional)</p>
                  <Input
                    placeholder="e.g. Equipment unavailable, animal excluded"
                    value={batchSkipReason}
                    onChange={(e) => setBatchSkipReason(e.target.value)}
                    className="text-xs h-8 max-w-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                size="sm"
                className="text-xs"
                disabled={batchTps.size === 0 || batchExps.size === 0 || !batchStatus || isPending}
                onClick={() => {
                  startTransition(async () => {
                    setBatchResult(null);
                    const res = await onBatchUpdateStatus(
                      Array.from(batchCohorts),
                      Array.from(batchTps),
                      Array.from(batchExps),
                      batchStatus,
                      batchSkipReason || undefined
                    );
                    if (res.error) {
                      setBatchResult(`❌ ${res.error}`);
                    } else {
                      setBatchResult(`✅ Updated ${res.updated} experiments`);
                      if (onBatchUpdated) await onBatchUpdated();
                      else router.refresh();
                    }
                  });
                }}
              >
                {isPending ? "Updating..." : `Apply to ${batchTps.size} tp × ${batchExps.size} exp`}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={resetBatch}>
                Reset
              </Button>
              {batchResult && (
                <p className="text-xs font-medium">{batchResult}</p>
              )}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {columns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No timepoints with experiments configured yet.</p>
            <p className="text-xs mt-1">Create a battery or add colony timepoints in Experiments, then they will appear here.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-xs border-collapse">
              {/* ─── Two-row header: Timepoint span + Experiment names ─── */}
              <thead className="sticky top-0 z-20">
                {/* Row 1: Timepoint group headers */}
                <tr className="bg-background border-b">
                  <th
                    className="sticky left-0 z-30 w-[160px] min-w-[160px] bg-background px-3 py-2 text-left font-semibold text-sm border-r"
                    rowSpan={2}
                  >
                    Animal
                  </th>
                  <th
                    className="sticky left-[160px] z-30 w-[64px] min-w-[64px] bg-background px-2 py-2 text-left font-semibold text-sm border-r shadow-[6px_0_10px_-10px_rgba(15,23,42,0.45)]"
                    rowSpan={2}
                  >
                    GT
                  </th>
                  {tpGroups.map((g) => (
                    <th
                      key={g.tpAge}
                      colSpan={g.colCount}
                      className="px-2 py-1.5 text-center font-semibold border-r border-b bg-background"
                    >
                      <div className="whitespace-nowrap">{g.tpName}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {g.tpAge}d
                      </div>
                    </th>
                  ))}
                </tr>
                {/* Row 2: Individual experiment headers */}
                <tr className="bg-muted/30 border-b shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                  {columns.map((col, i) => {
                    // Add right border at timepoint boundaries
                    const isLastInGroup =
                      i === columns.length - 1 ||
                      columns[i + 1]?.tpAge !== col.tpAge;
                    return (
                      <th
                        key={`${col.tpAge}-${col.expType}`}
                        className={`px-1 py-1.5 text-center font-medium text-muted-foreground whitespace-nowrap ${
                          isLastInGroup ? "border-r" : ""
                        }`}
                        title={`${col.label} at ${col.tpAge}d`}
                      >
                        <span className="inline-block max-w-[60px] truncate">
                          {col.label}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {sortedAnimals.map((animal, rowIdx) => {
                  const cohort = cohorts.find((c) => c.id === animal.cohort_id);
                  const animalStatuses = statusMap.get(animal.id);
                  const resultCompletions = completedResultMap.get(animal.id) || new Set<string>();

                  // Reuse the precomputed per-animal completed count.
                  const animalCompleted = completedByAnimal.get(animal.id) || 0;
                  const animalTotal = columns.length;

                  return (
                    <tr
                      key={animal.id}
                      className={`border-b hover:bg-muted/20 transition-colors ${
                        rowIdx % 2 === 0 ? "" : "bg-muted/5"
                      }`}
                    >
                      {/* Animal name cell */}
                      <td
                        className="sticky left-0 z-20 w-[160px] min-w-[160px] px-3 py-1.5 border-r whitespace-nowrap bg-background"
                      >
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-sm">
                              {animal.identifier}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                              {cohort && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                  {cohort.name}
                                </Badge>
                              )}
                              <span>{animal.sex === "male" ? "♂" : "♀"}</span>
                              <span className="text-muted-foreground/60">
                                {animalCompleted}/{animalTotal}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Genotype cell (second sticky column) */}
                      <td
                        className="sticky left-[160px] z-20 w-[64px] min-w-[64px] px-2 py-1.5 border-r text-center bg-background shadow-[6px_0_10px_-10px_rgba(15,23,42,0.45)]"
                      >
                        <Badge
                          variant="secondary"
                          className={`text-[9px] px-1 py-0 font-medium ${GENOTYPE_BADGE_CLASS[animal.genotype] || GENOTYPE_BADGE_CLASS.wt}`}
                        >
                          {GENOTYPE_LABELS[animal.genotype] || animal.genotype}
                        </Badge>
                      </td>

                      {/* Status cells */}
                      {columns.map((col, i) => {
                        const status = resultCompletions.has(`${col.tpAge}::${col.expType}`)
                          ? "completed"
                          : animalStatuses?.get(col.tpAge)?.get(col.expType);
                        const info = status
                          ? STATUS_ICON[status] || STATUS_ICON.pending
                          : STATUS_ICON.pending;

                        const isLastInGroup =
                          i === columns.length - 1 ||
                          columns[i + 1]?.tpAge !== col.tpAge;

                        return (
                          <td
                            key={`${col.tpAge}-${col.expType}`}
                            className={`px-1 py-1 text-center ${
                              isLastInGroup ? "border-r" : ""
                            }`}
                            title={`${col.label} @ ${col.tpAge}d: ${info.title}`}
                          >
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${info.color}`}
                            >
                              {status === "completed" ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : status === "skipped" ? (
                                <X className="w-3.5 h-3.5" />
                              ) : status === "scheduled" || status === "in_progress" ? (
                                <Clock className="w-3 h-3" />
                              ) : (
                                // Not scheduled / no record
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
