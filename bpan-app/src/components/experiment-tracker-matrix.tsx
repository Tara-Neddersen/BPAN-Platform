"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, Minus, Zap } from "lucide-react";
import type { Animal, Cohort, ColonyTimepoint, AnimalExperiment } from "@/types";

// ─── Labels ────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling",
  y_maze: "Y-Maze",
  ldb: "LDB",
  marble: "Marble",
  nesting: "Nesting",
  data_collection: "Data Collect",
  core_acclimation: "Core Acclim",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Hab",
  rotarod: "Rotarod",
  stamina: "Stamina",
  blood_draw: "Blood Draw",
  eeg_implant: "EEG Implant",
  eeg_recording: "EEG Record",
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
  onBatchUpdateStatus?: (cohortId: string | null, timepointAgeDays: number, experimentType: string, newStatus: string) => Promise<{ success?: boolean; error?: string; updated?: number }>;
}

// ─── Component ─────────────────────────────────────────────────────────

export function ExperimentTrackerMatrix({
  animals,
  cohorts,
  timepoints,
  experiments,
  onBatchUpdateStatus,
}: ExperimentTrackerMatrixProps) {
  const [filterCohort, setFilterCohort] = useState("all");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCohort, setBatchCohort] = useState<string>("all");
  const [batchTp, setBatchTp] = useState<string>("");
  const [batchExp, setBatchExp] = useState<string>("");
  const [batchStatus, setBatchStatus] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [batchResult, setBatchResult] = useState<string | null>(null);

  // Sorted timepoints by age
  const sortedTimepoints = useMemo(
    () => [...timepoints].sort((a, b) => a.age_days - b.age_days),
    [timepoints]
  );

  // Gather all unique experiment types across timepoints
  const allExperimentTypes = useMemo(() => {
    const types: string[] = [];
    for (const tp of sortedTimepoints) {
      for (const exp of tp.experiments) {
        if (!types.includes(exp)) types.push(exp);
      }
    }
    // Also handle "handling" which happens before each timepoint
    if (!types.includes("handling")) {
      types.unshift("handling");
    }
    return types;
  }, [sortedTimepoints]);

  // Filter animals
  const filteredAnimals = useMemo(() => {
    let list = animals.filter((a) => a.status === "active");
    if (filterCohort !== "all") {
      list = list.filter((a) => a.cohort_id === filterCohort);
    }
    // Sort by cohort then identifier
    return list.sort((a, b) => {
      const cohortA = cohorts.find((c) => c.id === a.cohort_id)?.name || "";
      const cohortB = cohorts.find((c) => c.id === b.cohort_id)?.name || "";
      if (cohortA !== cohortB) return cohortA.localeCompare(cohortB);
      return a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
    });
  }, [animals, filterCohort, cohorts]);

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

  // Summary stats
  const summary = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const animal of filteredAnimals) {
      for (const tp of sortedTimepoints) {
        for (const expType of tp.experiments) {
          total++;
          const status = statusMap.get(animal.id)?.get(tp.age_days)?.get(expType);
          if (status === "completed") completed++;
        }
      }
    }
    return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [filteredAnimals, sortedTimepoints, statusMap]);

  // Column headers: for each timepoint, list its experiment types
  // Structure: { tp, expType, label }[]
  const columns = useMemo(() => {
    const cols: { tpAge: number; tpName: string; expType: string; label: string }[] = [];
    for (const tp of sortedTimepoints) {
      for (const expType of tp.experiments) {
        cols.push({
          tpAge: tp.age_days,
          tpName: tp.name,
          expType,
          label: EXPERIMENT_LABELS[expType] || expType,
        });
      }
    }
    return cols;
  }, [sortedTimepoints]);

  // Group columns by timepoint for header spans
  const tpGroups = useMemo(() => {
    const groups: { tpAge: number; tpName: string; colCount: number }[] = [];
    for (const tp of sortedTimepoints) {
      groups.push({
        tpAge: tp.age_days,
        tpName: tp.name,
        colCount: tp.experiments.length,
      });
    }
    return groups;
  }, [sortedTimepoints]);

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
            {/* Filter */}
            <Select value={filterCohort} onValueChange={setFilterCohort}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Cohorts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cohorts</SelectItem>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="mt-3 p-3 rounded-lg border bg-muted/30 space-y-3">
            <p className="text-xs font-medium">Batch mark experiments as a specific status:</p>
            <div className="flex flex-wrap gap-2">
              {/* Cohort */}
              <Select value={batchCohort} onValueChange={setBatchCohort}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Cohort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cohorts</SelectItem>
                  {cohorts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Timepoint */}
              <Select value={batchTp} onValueChange={setBatchTp}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Timepoint" />
                </SelectTrigger>
                <SelectContent>
                  {sortedTimepoints.map((tp) => (
                    <SelectItem key={tp.age_days} value={String(tp.age_days)}>
                      {tp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Experiment Type */}
              <Select value={batchExp} onValueChange={setBatchExp}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Experiment" />
                </SelectTrigger>
                <SelectContent>
                  {allExperimentTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {EXPERIMENT_LABELS[t] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* New Status */}
              <Select value={batchStatus} onValueChange={setBatchStatus}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Mark as..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">✅ Completed</SelectItem>
                  <SelectItem value="in_progress">🟡 In Progress</SelectItem>
                  <SelectItem value="scheduled">🔵 Scheduled</SelectItem>
                  <SelectItem value="skipped">❌ Skipped</SelectItem>
                  <SelectItem value="pending">— Pending</SelectItem>
                </SelectContent>
              </Select>

              {/* Apply */}
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!batchTp || !batchExp || !batchStatus || isPending}
                onClick={() => {
                  startTransition(async () => {
                    setBatchResult(null);
                    const res = await onBatchUpdateStatus(
                      batchCohort === "all" ? null : batchCohort,
                      parseInt(batchTp),
                      batchExp,
                      batchStatus
                    );
                    if (res.error) setBatchResult(`❌ ${res.error}`);
                    else setBatchResult(`✅ Updated ${res.updated} experiments`);
                  });
                }}
              >
                {isPending ? "Updating..." : "Apply"}
              </Button>
            </div>
            {batchResult && (
              <p className="text-xs font-medium">{batchResult}</p>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {columns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No timepoints with experiments configured yet.</p>
            <p className="text-xs mt-1">Go to the Timepoints tab to set up your experimental protocol.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-xs border-collapse">
              {/* ─── Two-row header: Timepoint span + Experiment names ─── */}
              <thead className="sticky top-0 z-20">
                {/* Row 1: Timepoint group headers */}
                <tr className="bg-background border-b">
                  <th
                    className="sticky left-0 z-30 bg-background px-3 py-2 text-left font-semibold text-sm border-r"
                    rowSpan={2}
                  >
                    Animal
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
                {filteredAnimals.map((animal, rowIdx) => {
                  const cohort = cohorts.find((c) => c.id === animal.cohort_id);
                  const animalStatuses = statusMap.get(animal.id);

                  // Count completed for this animal
                  let animalCompleted = 0;
                  let animalTotal = columns.length;
                  for (const col of columns) {
                    const st = animalStatuses?.get(col.tpAge)?.get(col.expType);
                    if (st === "completed") animalCompleted++;
                  }

                  return (
                    <tr
                      key={animal.id}
                      className={`border-b hover:bg-muted/20 transition-colors ${
                        rowIdx % 2 === 0 ? "" : "bg-muted/5"
                      }`}
                    >
                      {/* Animal name cell */}
                      <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r whitespace-nowrap">
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
                              <span>
                                {animal.sex === "male" ? "♂" : "♀"}{" "}
                                {animal.genotype === "hemi"
                                  ? "HEMI"
                                  : animal.genotype === "het"
                                  ? "HET"
                                  : "WT"}
                              </span>
                              <span className="text-muted-foreground/60">
                                {animalCompleted}/{animalTotal}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status cells */}
                      {columns.map((col, i) => {
                        const status = animalStatuses?.get(col.tpAge)?.get(col.expType);
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

