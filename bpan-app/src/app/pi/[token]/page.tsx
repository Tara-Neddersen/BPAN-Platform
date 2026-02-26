"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Loader2, AlertCircle, Mouse, Calendar, Check, Clock,
  FlaskConical, BarChart3, ChevronLeft, ChevronRight, ImageIcon,
  Table as TableIcon, TrendingUp, ClipboardCheck, Bot, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Animal, Cohort, ColonyTimepoint, ColonyResult } from "@/types";
import type { WorkspaceCalendarEvent } from "@/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y-Maze", ldb: "Light-Dark Box",
  marble: "Marble Burying", nesting: "Nesting", rotarod: "Rotarod (legacy)",
  rotarod_hab: "Rotarod Hab", rotarod_test1: "Rotarod Test 1", rotarod_test2: "Rotarod Test 2",
  stamina: "Stamina",
  catwalk: "CatWalk", blood_draw: "Plasma Collection",
  data_collection: "Transport to Core", core_acclimation: "Core Acclimation",
  eeg_implant: "EEG Implant", eeg_recording: "EEG Recording",
};

const GENOTYPE_LABELS: Record<string, string> = {
  hemi: "Hemi", wt: "WT", het: "Het",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  skipped: "bg-red-100 text-red-700",
};

const GROUP_COLORS: Record<string, string> = {
  "Hemi Male": "#ef4444",
  "WT Male": "#3b82f6",
  "Het Female": "#f97316",
  "WT Female": "#8b5cf6",
};

const CHART_COLORS = [
  "#ef4444", "#3b82f6", "#f97316", "#8b5cf6",
  "#10b981", "#f59e0b", "#06b6d4", "#ec4899",
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface PortalPhoto {
  image_url: string;
  caption: string | null;
  experiment_type: string | null;
  taken_date: string | null;
}

interface PortalData {
  advisor_name: string;
  can_see: string[];
  animals: Array<{
    id: string; identifier: string; sex: string; genotype: string;
    birth_date: string; status: string; cohort_id: string; cohort_name: string;
    ear_tag: string | null; cage_number: string | null;
    eeg_implanted: boolean;
  }>;
  full_animals: Animal[];
  experiments: Array<{
    animal_id: string; animal_identifier: string; cohort_id: string | null;
    experiment_type: string; timepoint_age_days: number | null;
    scheduled_date: string | null; completed_date: string | null;
    status: string; results_drive_url: string | null; notes: string | null;
  }>;
  colony_results: ColonyResult[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
  calendar_events: WorkspaceCalendarEvent[];
  photos: PortalPhoto[];
  stats: {
    total_animals: number; active_animals: number;
    pending_experiments: number; completed_experiments: number;
    in_progress_experiments: number; skipped_experiments: number;
  };
}

/** Convert Google Drive share links to direct image URLs */
function convertDriveUrl(url: string): string {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  const match2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (match2) return `https://lh3.googleusercontent.com/d/${match2[1]}`;
  return url;
}

// ─── Photo Gallery Slideshow ────────────────────────────────────────────

function PhotoGallery({ photos }: { photos: PortalPhoto[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [fade, setFade] = useState(true);

  const next = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev + 1) % photos.length);
      setFade(true);
    }, 300);
  }, [photos.length]);

  const prev = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev - 1 + photos.length) % photos.length);
      setFade(true);
    }, 300);
  }, [photos.length]);

  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, [photos.length, next]);

  if (photos.length === 0) return null;

  const photo = photos[currentIdx];
  const displayUrl = convertDriveUrl(photo.image_url);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Lab Gallery
          <Badge variant="outline" className="text-xs ml-auto">{currentIdx + 1} / {photos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <div className="relative">
        <div className="h-[260px] sm:h-[320px] md:h-[360px] bg-transparent flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={photo.caption || "Lab photo"}
            className={`block w-full h-full object-contain object-center transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`}
            referrerPolicy="no-referrer"
          />
        </div>
        {photos.length > 1 && (
          <>
            <Button
              variant="ghost" size="sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-7 w-7 p-0 rounded-full"
              onClick={prev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-7 w-7 p-0 rounded-full"
              onClick={next}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
        {(photo.caption || photo.experiment_type) && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-6">
            <p className="text-white text-xs sm:text-sm font-medium">{photo.caption || ""}</p>
            <div className="flex items-center gap-2 mt-1">
              {photo.experiment_type && (
                <Badge className="bg-white/20 text-white border-0 text-xs" variant="secondary">
                  {EXPERIMENT_LABELS[photo.experiment_type] || photo.experiment_type}
                </Badge>
              )}
              {photo.taken_date && (
                <span className="text-white/70 text-xs">{photo.taken_date}</span>
              )}
            </div>
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 py-1.5">
          {photos.map((_, idx) => (
            <button
              key={idx}
              className={`h-1.5 rounded-full transition-all ${idx === currentIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              onClick={() => {
                setFade(false);
                setTimeout(() => { setCurrentIdx(idx); setFade(true); }, 300);
              }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Colony Results View (read-only results matrix) ─────────────────────

function ColonyResultsView({
  fullAnimals,
  colonyResults,
  cohorts,
  timepoints,
}: {
  fullAnimals: Animal[];
  colonyResults: ColonyResult[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
}) {
  const [selectedTimepoint, setSelectedTimepoint] = useState<string>("__all__");
  const [selectedExperiment, setSelectedExperiment] = useState<string>("__all__");

  // Available experiments from results
  const availableExperiments = useMemo(() => {
    const exps = new Set(colonyResults.map((r) => r.experiment_type));
    return Array.from(exps).sort();
  }, [colonyResults]);

  // Available timepoints from results
  const availableTimepoints = useMemo(() => {
    const tps = new Set(colonyResults.map((r) => r.timepoint_age_days));
    return Array.from(tps).sort((a, b) => a - b);
  }, [colonyResults]);

  // Filtered results
  const filteredResults = useMemo(() => {
    return colonyResults.filter((r) => {
      if (selectedTimepoint !== "__all__" && r.timepoint_age_days !== Number(selectedTimepoint)) return false;
      if (selectedExperiment !== "__all__" && r.experiment_type !== selectedExperiment) return false;
      return true;
    });
  }, [colonyResults, selectedTimepoint, selectedExperiment]);

  // Group results by animal
  const animalResults = useMemo(() => {
    const map = new Map<string, ColonyResult[]>();
    for (const r of filteredResults) {
      if (!map.has(r.animal_id)) map.set(r.animal_id, []);
      map.get(r.animal_id)!.push(r);
    }
    return map;
  }, [filteredResults]);

  // All measure keys from filtered results
  const measureKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of filteredResults) {
      if (r.measures && typeof r.measures === "object") {
        for (const k of Object.keys(r.measures as Record<string, unknown>)) {
          if (k.startsWith("__")) continue; // Skip internal fields
          keys.add(k);
        }
      }
    }
    return Array.from(keys).sort();
  }, [filteredResults]);

  // Group animals by cohort
  const cohortGroups = useMemo(() => {
    const groups = new Map<string, Animal[]>();
    for (const a of fullAnimals) {
      const results = animalResults.get(a.id);
      if (!results || results.length === 0) continue;
      const cohortId = a.cohort_id;
      if (!groups.has(cohortId)) groups.set(cohortId, []);
      groups.get(cohortId)!.push(a);
    }
    return groups;
  }, [fullAnimals, animalResults]);

  if (colonyResults.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No experiment results recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[140px]">
          <Select value={selectedTimepoint} onValueChange={setSelectedTimepoint}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Timepoint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Timepoints</SelectItem>
              {availableTimepoints.map((tp) => (
                <SelectItem key={tp} value={String(tp)}>{tp} Day</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select value={selectedExperiment} onValueChange={setSelectedExperiment}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Experiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Experiments</SelectItem>
              {availableExperiments.map((exp) => (
                <SelectItem key={exp} value={exp}>{EXPERIMENT_LABELS[exp] || exp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary" className="text-xs h-8 px-3 flex items-center">
          {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""} · {cohortGroups.size} cohort{cohortGroups.size !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Results table per cohort */}
      {Array.from(cohortGroups.entries()).map(([cohortId, groupAnimals]) => {
        const cohort = cohorts.find((c) => c.id === cohortId);
        return (
          <Card key={cohortId}>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm font-medium">{cohort?.name || "Unknown Cohort"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 px-3 font-medium sticky left-0 bg-background z-10 min-w-[100px]">Animal</th>
                        <th className="text-left py-2 px-2 font-medium min-w-[60px]">Sex</th>
                        <th className="text-left py-2 px-2 font-medium min-w-[50px]">GT</th>
                        {selectedExperiment === "__all__" && (
                          <th className="text-left py-2 px-2 font-medium min-w-[100px]">Experiment</th>
                        )}
                        {selectedTimepoint === "__all__" && (
                          <th className="text-center py-2 px-2 font-medium min-w-[60px]">Day</th>
                        )}
                        {measureKeys.slice(0, 8).map((key) => (
                          <th key={key} className="text-right py-2 px-2 font-medium min-w-[80px] max-w-[120px] truncate">
                            {key.replace(/_/g, " ")}
                          </th>
                        ))}
                        {measureKeys.length > 8 && (
                          <th className="text-center py-2 px-2 font-medium text-muted-foreground">
                            +{measureKeys.length - 8}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {groupAnimals.map((animal) => {
                        const results = animalResults.get(animal.id) || [];
                        return results.map((r, ri) => {
                          const measures = (r.measures || {}) as Record<string, string | number | null>;
                          return (
                            <tr key={`${animal.id}-${ri}`} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="py-1.5 px-3 font-medium sticky left-0 bg-background z-10">
                                {ri === 0 ? animal.identifier : ""}
                              </td>
                              <td className="py-1.5 px-2">
                                {ri === 0 ? (animal.sex === "male" ? "♂" : "♀") : ""}
                              </td>
                              <td className="py-1.5 px-2">
                                {ri === 0 && (
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] h-4 px-1 ${
                                      animal.genotype === "hemi"
                                        ? "bg-red-100 text-red-700"
                                        : animal.genotype === "het"
                                        ? "bg-orange-100 text-orange-700"
                                        : "bg-blue-100 text-blue-700"
                                    }`}
                                  >
                                    {GENOTYPE_LABELS[animal.genotype] || animal.genotype}
                                  </Badge>
                                )}
                              </td>
                              {selectedExperiment === "__all__" && (
                                <td className="py-1.5 px-2 text-muted-foreground">
                                  {EXPERIMENT_LABELS[r.experiment_type] || r.experiment_type}
                                </td>
                              )}
                              {selectedTimepoint === "__all__" && (
                                <td className="py-1.5 px-2 text-center">
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">{r.timepoint_age_days}d</Badge>
                                </td>
                              )}
                              {measureKeys.slice(0, 8).map((key) => (
                                <td key={key} className="py-1.5 px-2 text-right tabular-nums">
                                  {measures[key] != null
                                    ? typeof measures[key] === "number"
                                      ? (measures[key] as number) % 1 === 0
                                        ? String(measures[key])
                                        : (measures[key] as number).toFixed(2)
                                      : String(measures[key])
                                    : <span className="text-muted-foreground/40">—</span>}
                                </td>
                              ))}
                              {measureKeys.length > 8 && (
                                <td className="py-1.5 px-2 text-center text-muted-foreground/40">…</td>
                              )}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Simple Analysis Panel (read-only charts for PI) ────────────────────

type PinnedPlot = { experiment: string; timepoint: string; measure: string; chartType: string; label: string };

function PIAnalysisPanel({
  fullAnimals,
  colonyResults,
  cohorts,
  portalToken,
}: {
  fullAnimals: Animal[];
  colonyResults: ColonyResult[];
  cohorts: Cohort[];
  portalToken: string;
}) {
  const [selectedExperiment, setSelectedExperiment] = useState<string>("");
  const [selectedTimepoint, setSelectedTimepoint] = useState<string>("");
  const [selectedMeasure, setSelectedMeasure] = useState<string>("");
  const [chartType, setChartType] = useState<string>("scatter");

  // Pinned plots (stored in localStorage per portal token)
  const PINNED_KEY = `pinned_plots_${portalToken}`;
  const [pinnedPlots, setPinnedPlots] = useState<PinnedPlot[]>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem(PINNED_KEY) : null;
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const savePinnedPlots = (plots: PinnedPlot[]) => {
    setPinnedPlots(plots);
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(plots)); } catch { /* ignore */ }
  };

  const pinCurrentPlot = () => {
    if (!selectedExperiment || !selectedTimepoint || !selectedMeasure) return;
    const label = `${EXPERIMENT_LABELS[selectedExperiment] || selectedExperiment} · ${selectedMeasure.replace(/_/g, " ")} · ${selectedTimepoint}d`;
    const newPin: PinnedPlot = { experiment: selectedExperiment, timepoint: selectedTimepoint, measure: selectedMeasure, chartType, label };
    // Avoid exact duplicates
    if (pinnedPlots.some(p => p.experiment === newPin.experiment && p.timepoint === newPin.timepoint && p.measure === newPin.measure && p.chartType === newPin.chartType)) return;
    savePinnedPlots([...pinnedPlots, newPin]);
  };

  const unpinPlot = (idx: number) => {
    savePinnedPlots(pinnedPlots.filter((_, i) => i !== idx));
  };

  const availableExperiments = useMemo(() => {
    const exps = new Set(colonyResults.map((r) => r.experiment_type));
    return Array.from(exps).sort();
  }, [colonyResults]);

  // Auto-select first experiment
  useEffect(() => {
    if (availableExperiments.length > 0 && !selectedExperiment) {
      setSelectedExperiment(availableExperiments[0]);
    }
  }, [availableExperiments, selectedExperiment]);

  const availableTimepoints = useMemo(() => {
    const tps = new Set(
      colonyResults
        .filter((r) => r.experiment_type === selectedExperiment)
        .map((r) => r.timepoint_age_days)
    );
    return Array.from(tps).sort((a, b) => a - b);
  }, [colonyResults, selectedExperiment]);

  useEffect(() => {
    if (availableTimepoints.length > 0 && !availableTimepoints.includes(Number(selectedTimepoint))) {
      setSelectedTimepoint(String(availableTimepoints[0]));
    }
  }, [availableTimepoints, selectedTimepoint]);

  // Filtered results for the current experiment + timepoint
  const filtered = useMemo(() => {
    return colonyResults.filter(
      (r) =>
        r.experiment_type === selectedExperiment &&
        r.timepoint_age_days === Number(selectedTimepoint)
    );
  }, [colonyResults, selectedExperiment, selectedTimepoint]);

  // Available measures
  const availableMeasures = useMemo(() => {
    const keys = new Set<string>();
    for (const r of filtered) {
      const m = r.measures as Record<string, unknown> | null;
      if (!m) continue;
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith("__")) continue; // Skip internal fields
        if (typeof v === "number") keys.add(k);
      }
    }
    return Array.from(keys).sort();
  }, [filtered]);

  useEffect(() => {
    if (availableMeasures.length > 0 && !availableMeasures.includes(selectedMeasure)) {
      setSelectedMeasure(availableMeasures[0]);
    }
  }, [availableMeasures, selectedMeasure]);

  // Build group data for the selected measure
  const groupData = useMemo(() => {
    if (!selectedMeasure) return [];

    const groups: Record<string, number[]> = {};
    for (const r of filtered) {
      const animal = fullAnimals.find((a) => a.id === r.animal_id);
      if (!animal) continue;
      const m = r.measures as Record<string, number | string | null> | null;
      if (!m) continue;
      const val = m[selectedMeasure];
      if (typeof val !== "number") continue;
      const gLabel =
        `${GENOTYPE_LABELS[animal.genotype] || animal.genotype} ${animal.sex === "male" ? "Male" : "Female"}`;
      if (!groups[gLabel]) groups[gLabel] = [];
      groups[gLabel].push(val);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => {
        const order = ["Hemi Male", "WT Male", "Het Female", "WT Female"];
        return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
      })
      .map(([label, values]) => ({
        label,
        values,
        mean: values.reduce((s, v) => s + v, 0) / values.length,
        sem: values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - values.reduce((a, b) => a + b, 0) / values.length) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length) : 0,
        sd: values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - values.reduce((a, b) => a + b, 0) / values.length) ** 2, 0) / (values.length - 1)) : 0,
      }));
  }, [filtered, fullAnimals, selectedMeasure]);

  // Helper to build plot data for a given config (reused for pinned plots)
  const buildPlotData = useCallback((gData: typeof groupData, ct: string, measure: string) => {
    if (gData.length === 0) return { data: [], layout: {} };
    const measureLabel = measure.replace(/_/g, " ");
    if (ct === "bar") {
      return {
        data: [{
          type: "bar" as const,
          x: gData.map((g) => g.label),
          y: gData.map((g) => g.mean),
          error_y: { type: "data" as const, array: gData.map((g) => g.sem), visible: true },
          marker: { color: gData.map((g) => GROUP_COLORS[g.label] || CHART_COLORS[0]) },
        }],
        layout: { title: { text: measureLabel, font: { size: 14 } }, yaxis: { title: { text: measureLabel } }, margin: { t: 40, r: 20, b: 60, l: 60 }, height: 350 },
      };
    }
    if (ct === "box") {
      return {
        data: gData.map((g, i) => ({ type: "box" as const, y: g.values, name: g.label, marker: { color: GROUP_COLORS[g.label] || CHART_COLORS[i] }, boxpoints: "all" as const, jitter: 0.3, pointpos: -1.5 })),
        layout: { title: { text: measureLabel, font: { size: 14 } }, yaxis: { title: { text: measureLabel } }, margin: { t: 40, r: 20, b: 60, l: 60 }, height: 350, showlegend: false },
      };
    }
    if (ct === "violin") {
      return {
        data: gData.map((g, i) => ({ type: "violin" as const, y: g.values, name: g.label, box: { visible: true }, meanline: { visible: true }, marker: { color: GROUP_COLORS[g.label] || CHART_COLORS[i] }, points: "all" as const, jitter: 0.3 })),
        layout: { title: { text: measureLabel, font: { size: 14 } }, yaxis: { title: { text: measureLabel } }, margin: { t: 40, r: 20, b: 60, l: 60 }, height: 350, showlegend: false },
      };
    }
    // scatter / dot plot with mean ± SD overlay
    const dotTraces = gData.map((g, i) => ({
      type: "scatter" as const,
      mode: "markers" as const,
      y: g.values,
      x: g.values.map(() => g.label),
      name: g.label,
      marker: { color: GROUP_COLORS[g.label] || CHART_COLORS[i], size: 8, opacity: 0.65 },
    }));
    const sdTraces = gData.map((g, i) => ({
      type: "scatter" as const,
      mode: "markers" as const,
      x: [g.label],
      y: [g.mean],
      error_y: { type: "data" as const, array: [g.sd], visible: true, thickness: 2.5, width: 10, color: GROUP_COLORS[g.label] || CHART_COLORS[i] },
      marker: { color: GROUP_COLORS[g.label] || CHART_COLORS[i], size: 10, symbol: "line-ew-open" as const, line: { width: 2.5 } },
      name: `${g.label} mean±SD`,
      showlegend: false,
    }));
    return {
      data: [...dotTraces, ...sdTraces],
      layout: { title: { text: measureLabel, font: { size: 14 } }, yaxis: { title: { text: measureLabel } }, margin: { t: 40, r: 20, b: 60, l: 60 }, height: 350 },
    };
  }, []);

  // Plotly data for current selection
  const plotData = useMemo(() => buildPlotData(groupData, chartType, selectedMeasure), [buildPlotData, groupData, chartType, selectedMeasure]);

  // Summary stats table
  const statsTable = useMemo(() => {
    return groupData.map((g) => ({
      group: g.label,
      n: g.values.length,
      mean: g.mean.toFixed(3),
      sd: g.sd.toFixed(3),
      sem: g.sem.toFixed(3),
      min: Math.min(...g.values).toFixed(3),
      max: Math.max(...g.values).toFixed(3),
    }));
  }, [groupData]);

  if (colonyResults.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No experiment results available for analysis.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pinned Plots */}
      {pinnedPlots.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">📌 Pinned Plots</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pinnedPlots.map((pin, idx) => {
              // Build group data for pinned plot
              const pinFiltered = colonyResults.filter(r => r.experiment_type === pin.experiment && r.timepoint_age_days === Number(pin.timepoint));
              const pinGroups: Record<string, number[]> = {};
              for (const r of pinFiltered) {
                const animal = fullAnimals.find(a => a.id === r.animal_id);
                if (!animal) continue;
                const m = r.measures as Record<string, number | string | null> | null;
                if (!m) continue;
                const val = m[pin.measure];
                if (typeof val !== "number") continue;
                const gLabel = `${GENOTYPE_LABELS[animal.genotype] || animal.genotype} ${animal.sex === "male" ? "Male" : "Female"}`;
                if (!pinGroups[gLabel]) pinGroups[gLabel] = [];
                pinGroups[gLabel].push(val);
              }
              const pinGData = Object.entries(pinGroups).map(([label, values]) => ({
                label, values,
                mean: values.reduce((s, v) => s + v, 0) / values.length,
                sem: values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - values.reduce((a, b) => a + b, 0) / values.length) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length) : 0,
                sd: 0,
              }));
              const pinPlotData = buildPlotData(pinGData, pin.chartType, pin.measure);
              return (
                <Card key={idx} className="relative">
                  <button
                    onClick={() => unpinPlot(idx)}
                    className="absolute top-2 right-2 z-10 text-[10px] text-muted-foreground hover:text-destructive bg-background/80 rounded px-1"
                    title="Unpin this plot"
                  >
                    ✕ unpin
                  </button>
                  <CardContent className="pt-3 pb-1 px-2">
                    <p className="text-[10px] text-muted-foreground mb-1 pr-12 truncate">{pin.label}</p>
                    {pinGData.length > 0 ? (
                      <Plot
                        data={pinPlotData.data as Plotly.Data[]}
                        layout={{ ...(pinPlotData.layout as Record<string, unknown>), autosize: true, paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { size: 9 }, height: 220, margin: { t: 20, r: 10, b: 40, l: 40 } } as Partial<Plotly.Layout>}
                        config={{ responsive: true, displayModeBar: false }}
                        style={{ width: "100%", height: "220px" }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground py-4 text-center">No data</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Config */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-3 min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Experiment</label>
              <Select value={selectedExperiment} onValueChange={setSelectedExperiment}>
                <SelectTrigger className="h-8 text-xs w-full min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableExperiments.map((exp) => (
                    <SelectItem key={exp} value={exp}>{EXPERIMENT_LABELS[exp] || exp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="xl:col-span-2 min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Timepoint</label>
              <Select value={selectedTimepoint} onValueChange={setSelectedTimepoint}>
                <SelectTrigger className="h-8 text-xs w-full min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTimepoints.map((tp) => (
                    <SelectItem key={tp} value={String(tp)}>{tp} Day</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="xl:col-span-5 min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Measure</label>
              <Select value={selectedMeasure} onValueChange={setSelectedMeasure}>
                <SelectTrigger className="h-8 text-xs w-full min-w-0 overflow-hidden [&>span]:block [&>span]:min-w-0 [&>span]:truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMeasures.map((m) => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="xl:col-span-2 min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Chart Type</label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger className="h-8 text-xs w-full min-w-0 overflow-hidden [&>span]:block [&>span]:min-w-0 [&>span]:truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scatter">Dot Plot</SelectItem>
                  <SelectItem value="bar">Bar + SEM</SelectItem>
                  <SelectItem value="box">Box Plot</SelectItem>
                  <SelectItem value="violin">Violin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pin button */}
          {selectedExperiment && selectedMeasure && groupData.length > 0 && (
            <div className="mt-3 pt-3 border-t flex justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={pinCurrentPlot}>
                📌 Pin this plot
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      {groupData.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <Plot
              data={plotData.data as Plotly.Data[]}
              layout={{
                ...plotData.layout,
                autosize: true,
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                font: { size: 11 },
              } as Partial<Plotly.Layout>}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: "100%", height: "400px" }}
            />
          </CardContent>
        </Card>
      )}

      {/* Stats table */}
      {statsTable.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm font-medium">Group Statistics</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-3 font-medium">Group</th>
                    <th className="text-right py-2 px-3 font-medium">N</th>
                    <th className="text-right py-2 px-3 font-medium">Mean</th>
                    <th className="text-right py-2 px-3 font-medium">SD</th>
                    <th className="text-right py-2 px-3 font-medium">SEM</th>
                    <th className="text-right py-2 px-3 font-medium">Min</th>
                    <th className="text-right py-2 px-3 font-medium">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {statsTable.map((row) => (
                    <tr key={row.group} className="border-b last:border-0">
                      <td className="py-1.5 px-3 font-medium" style={{ color: GROUP_COLORS[row.group] }}>{row.group}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.n}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.mean}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.sd}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.sem}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.min}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Experiment Tracker (read-only for PI) ──────────────────────────────

// Genotype color scheme
const GENOTYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  hemi: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  het: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  wt: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
};

// Sex ordering (for sort tiebreak)
const SEX_ORDER: Record<string, number> = { male: 0, female: 1 };

// Genotype ordering (for sort tiebreak)
const GENOTYPE_ORDER: Record<string, number> = { hemi: 0, het: 1, wt: 2 };

// Canonical protocol order for experiments
const PROTOCOL_ORDER: string[] = [
  "handling", "y_maze", "marble", "ldb", "nesting",
  "data_collection", "core_acclimation", "catwalk",
  "rotarod_hab", "rotarod_test1", "rotarod_test2", "stamina", "blood_draw",
  "eeg_implant", "eeg_recording",
  "rotarod", // legacy — keep at end so old records still display
];

function PITrackerTab({
  animals,
  experiments,
  cohorts,
  timepoints,
}: {
  animals: PortalData["animals"];
  experiments: PortalData["experiments"];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
}) {
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [summaryHighlight, setSummaryHighlight] = useState<"completed" | "scheduled" | "skipped">("completed");

  // All experiment types present in data, in protocol order
  const experimentTypes = useMemo(() => {
    const present = new Set(experiments.map(e => e.experiment_type));
    // Protocol order first, then any unknown types at the end
    const ordered = PROTOCOL_ORDER.filter(t => present.has(t));
    for (const t of present) {
      if (!ordered.includes(t)) ordered.push(t);
    }
    return ordered;
  }, [experiments]);

  // Sorted timepoint ages
  const tpAges = useMemo(() => {
    const ages = new Set(experiments.map(e => e.timepoint_age_days).filter(Boolean) as number[]);
    return [...ages].sort((a, b) => a - b);
  }, [experiments]);

  // First timepoint (for EEG implant: only show at first tp)
  const firstTpAge = tpAges.length > 0 ? tpAges[0] : null;

  // Which experiment types to show for a given timepoint
  const getTypesForTp = useCallback((tpAge: number) => {
    // EEG implant only at first timepoint
    if (tpAge !== firstTpAge) {
      return experimentTypes.filter(t => t !== "eeg_implant");
    }
    return experimentTypes;
  }, [experimentTypes, firstTpAge]);

  // Cohort lookup
  const cohortById = useMemo(() => {
    const map = new Map<string, Cohort>();
    for (const c of cohorts) map.set(c.id, c);
    return map;
  }, [cohorts]);

  // Build sorted animal list: cohort name → sex → genotype → numeric identifier
  const sortedAnimals = useMemo(() => {
    const animalIdsWithExps = new Set(experiments.map(e => e.animal_id));
    const relevantAnimals = animals.filter(a =>
      animalIdsWithExps.has(a.id) && (filterCohort === "all" || a.cohort_id === filterCohort)
    );

    return [...relevantAnimals].sort((a, b) => {
      // 1. Cohort name
      const cohortA = cohortById.get(a.cohort_id)?.name || "";
      const cohortB = cohortById.get(b.cohort_id)?.name || "";
      const cohortCmp = cohortA.localeCompare(cohortB, undefined, { numeric: true });
      if (cohortCmp !== 0) return cohortCmp;

      // 2. Sex (male first)
      const sexA = SEX_ORDER[a.sex] ?? 2;
      const sexB = SEX_ORDER[b.sex] ?? 2;
      if (sexA !== sexB) return sexA - sexB;

      // 3. Genotype (hemi → het → wt)
      const genoA = GENOTYPE_ORDER[a.genotype] ?? 3;
      const genoB = GENOTYPE_ORDER[b.genotype] ?? 3;
      if (genoA !== genoB) return genoA - genoB;

      // 4. Numeric part of identifier (natural number sort)
      const numA = parseInt(a.identifier.match(/(\d+)$/)?.[1] || "0", 10);
      const numB = parseInt(b.identifier.match(/(\d+)$/)?.[1] || "0", 10);
      if (numA !== numB) return numA - numB;

      return a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
    });
  }, [animals, experiments, filterCohort, cohortById]);

  // Genotype count summary
  const genotypeCounts = useMemo(() => {
    const counts: Record<string, { male: number; female: number }> = {};
    for (const a of sortedAnimals) {
      if (!counts[a.genotype]) counts[a.genotype] = { male: 0, female: 0 };
      if (a.sex === "male") counts[a.genotype].male++;
      else counts[a.genotype].female++;
    }
    return counts;
  }, [sortedAnimals]);

  // Build skip notes lookup: animal_id::tp::type → notes
  const skipNotesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of experiments) {
      if (e.status === "skipped" && e.notes && e.timepoint_age_days != null) {
        map.set(`${e.animal_id}::${e.timepoint_age_days}::${e.experiment_type}`, e.notes);
      }
    }
    return map;
  }, [experiments]);

  // Lookup: animal_id → timepoint → experiment_type → status
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of experiments) {
      if (e.timepoint_age_days != null) {
        const key = `${e.animal_id}::${e.timepoint_age_days}::${e.experiment_type}`;
        map.set(key, e.status);
      }
    }
    return map;
  }, [experiments]);

  // Cohort-level summary: cohort × timepoint counts
  const cohortSummaryData = useMemo(() => {
    const cohortIds = [...new Set(sortedAnimals.map(a => a.cohort_id))];
    return cohortIds.map(cohortId => {
      const cohortAnimals = sortedAnimals.filter(a => a.cohort_id === cohortId);
      const tpData = tpAges.map(tp => {
        const counts: Record<string, number> = { completed: 0, scheduled: 0, in_progress: 0, skipped: 0, total: 0 };
        for (const animal of cohortAnimals) {
          for (const type of getTypesForTp(tp)) {
            const status = statusMap.get(`${animal.id}::${tp}::${type}`);
            if (status && status !== "pending") {
              counts.total++;
              if (status in counts) counts[status]++;
            }
          }
        }
        return { tp, ...counts };
      });
      return { cohortId, cohortName: cohortById.get(cohortId)?.name || "?", nAnimals: cohortAnimals.length, tpData };
    });
  }, [sortedAnimals, tpAges, statusMap, getTypesForTp, cohortById]);

  // Status icon (with skip reason tooltip)
  const getStatusIcon = (status: string | undefined, skipNote?: string) => {
    switch (status) {
      case "completed": return <span className="text-green-600">✅</span>;
      case "in_progress": return <span className="text-amber-500">🔵</span>;
      case "scheduled": return <span className="text-blue-400">⏳</span>;
      case "skipped":
        return (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-gray-400 cursor-help"
            title={skipNote ? `Skipped: ${skipNote}` : "Skipped"}
          >
            —
          </span>
        );
      default: return <span className="text-gray-200">·</span>;
    }
  };

  // Pre-compute columns per timepoint (for colSpan)
  const tpColumns = useMemo(() => tpAges.map(tp => ({
    tp,
    types: getTypesForTp(tp),
  })), [tpAges, getTypesForTp]);

  // Total columns for scroll width hint
  const totalExpCols = tpColumns.reduce((sum, tc) => sum + tc.types.length, 0);

  return (
    <div className="space-y-4">
      {/* Genotype count summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(GENOTYPE_COLORS).map(([geno, colors]) => {
          const counts = genotypeCounts[geno] || { male: 0, female: 0 };
          const total = counts.male + counts.female;
          if (total === 0) return null;
          return (
            <div key={geno} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${colors.bg} ${colors.text} ${colors.border}`}>
              <span className="font-bold text-sm">{GENOTYPE_LABELS[geno] || geno}</span>
              <span className="text-xs font-semibold">n={total}</span>
              {counts.male > 0 && <span className="text-xs opacity-80">♂{counts.male}</span>}
              {counts.female > 0 && <span className="text-xs opacity-80">♀{counts.female}</span>}
            </div>
          );
        })}
      </div>

      {/* Cohort Summary Grid */}
      {cohortSummaryData.length > 0 && tpAges.length > 0 && (
        <Card>
          <CardHeader className="py-2.5 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-medium">Cohort Progress</CardTitle>
              <div className="flex gap-1">
                {([
                  { key: "completed" as const, label: "✓ Done", active: "bg-emerald-100 text-emerald-800 border-emerald-300", inactive: "text-muted-foreground border-muted" },
                  { key: "scheduled" as const, label: "⏳ Scheduled", active: "bg-blue-100 text-blue-800 border-blue-300", inactive: "text-muted-foreground border-muted" },
                  { key: "skipped" as const, label: "— Skipped", active: "bg-red-100 text-red-800 border-red-300", inactive: "text-muted-foreground border-muted" },
                ]).map(opt => (
                  <button key={opt.key} onClick={() => setSummaryHighlight(opt.key)}
                    className={`px-2.5 py-0.5 rounded text-xs border font-medium transition-colors ${summaryHighlight === opt.key ? opt.active : opt.inactive}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/30 whitespace-nowrap">Cohort</th>
                    <th className="text-center px-2 py-2 text-muted-foreground font-medium">n</th>
                    {tpAges.map(tp => (
                      <th key={tp} className="text-center px-3 py-2 font-semibold border-l min-w-[70px]">{tp}d</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortSummaryData.map(row => (
                    <tr key={row.cohortId} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium sticky left-0 bg-background whitespace-nowrap">{row.cohortName}</td>
                      <td className="text-center px-2 py-2 text-muted-foreground">{row.nAnimals}</td>
                      {row.tpData.map(cell => {
                        const c = cell as Record<string, number>;
                        const completed = c.completed || 0;
                        const scheduled = (c.scheduled || 0) + (c.in_progress || 0);
                        const skipped = c.skipped || 0;
                        const total = c.total || 0;

                        // Determine dominant status & sticker
                        let bg = "transparent";
                        let badge: React.ReactNode = <span className="text-muted-foreground/30">·</span>;

                        if (total > 0) {
                          if (completed > 0) {
                            // Any completion → ✓
                            // Full green if all done, lighter if partial
                            const allDone = completed >= total;
                            bg = allDone
                              ? "rgba(16,185,129,0.6)"
                              : `rgba(16,185,129,${0.15 + (completed / total) * 0.35})`;
                            badge = (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-sm shadow-sm select-none ${allDone ? "bg-emerald-500 text-white" : "bg-emerald-200 text-emerald-800"}`}>✓</span>
                            );
                          } else if (skipped > 0 && skipped >= scheduled) {
                            // All/majority skipped, nothing done
                            bg = "rgba(156,163,175,0.2)";
                            badge = <span className="text-gray-400 font-bold text-lg select-none">−</span>;
                          } else {
                            // Scheduled / pending, nothing done yet
                            const pct = scheduled / total;
                            bg = `rgba(59,130,246,${0.1 + pct * 0.35})`;
                            badge = (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 whitespace-nowrap">
                                Sched.
                              </span>
                            );
                          }
                        }

                        return (
                          <td key={cell.tp} className="text-center px-3 py-2 border-l transition-colors" style={{ background: bg }}>
                            {badge}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cohort filter + genotype legend */}
      <div className="flex items-center gap-2 flex-wrap">
        {cohorts.length > 1 && (
          <Select value={filterCohort} onValueChange={setFilterCohort}>
            <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="Filter by cohort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cohorts</SelectItem>
              {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 ml-auto text-[10px]">
          {Object.entries(GENOTYPE_COLORS).map(([geno, colors]) => (
            <span key={geno} className={`px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} font-medium`}>
              {GENOTYPE_LABELS[geno] || geno}
            </span>
          ))}
        </div>
      </div>

      {/* Tracker matrix — use native div scroll (not ScrollArea) for reliable horizontal scroll */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="text-xs border-collapse" style={{ minWidth: `${160 + totalExpCols * 50}px` }}>
              <thead className="sticky top-0 z-20">
                {/* Row 1: Timepoint group headers */}
                <tr className="bg-muted/50 border-b">
                  <th
                    className="text-left py-2 px-3 font-semibold sticky left-0 bg-muted/50 z-30 min-w-[160px]"
                    rowSpan={2}
                  >
                    Animal
                  </th>
                  {tpColumns.map(({ tp, types }, tpIdx) => (
                    <th
                      key={tp}
                      colSpan={types.length}
                      className={`text-center py-1.5 px-1 font-bold text-sm bg-muted/50 ${tpIdx > 0 ? "border-l-[3px] border-l-foreground/30" : ""}`}
                    >
                      {tp} days
                    </th>
                  ))}
                </tr>
                {/* Row 2: Experiment type headers */}
                <tr className="bg-muted/30 border-b">
                  {tpColumns.map(({ tp, types }, tpIdx) => (
                    types.map((type, typeIdx) => (
                      <th
                        key={`${tp}-${type}`}
                        className={`text-center py-1 px-0.5 font-medium bg-muted/30 ${tpIdx > 0 && typeIdx === 0 ? "border-l-[3px] border-l-foreground/30" : ""}`}
                        style={{ minWidth: "46px", maxWidth: "70px" }}
                      >
                        <div
                          className="text-[9px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis"
                          title={EXPERIMENT_LABELS[type] || type}
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: "70px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}
                        >
                          {EXPERIMENT_LABELS[type] || type}
                        </div>
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAnimals.map((animal, idx) => {
                  const cohort = cohortById.get(animal.cohort_id);
                  const genoColors = GENOTYPE_COLORS[animal.genotype] || { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300" };

                  // Detect cohort boundary for bold separator
                  const prevAnimal = idx > 0 ? sortedAnimals[idx - 1] : null;
                  const isCohortBoundary = prevAnimal != null && prevAnimal.cohort_id !== animal.cohort_id;

                  return (
                    <tr
                      key={animal.id}
                      className={`border-b last:border-0 hover:bg-muted/10 ${isCohortBoundary ? "border-t-[3px] border-t-foreground/30" : ""}`}
                    >
                      <td className="py-1.5 px-3 font-medium sticky left-0 bg-background z-10 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-semibold ${genoColors.bg} ${genoColors.text}`}>
                            {GENOTYPE_LABELS[animal.genotype] || animal.genotype}
                          </span>
                          <span>{animal.identifier}</span>
                          <span className="text-[9px] text-muted-foreground">{animal.sex === "male" ? "♂" : "♀"}</span>
                          {cohort && <span className="text-[9px] text-muted-foreground opacity-60">({cohort.name.replace("BPAN ", "B")})</span>}
                        </div>
                      </td>
                      {tpColumns.map(({ tp, types }, tpIdx) => (
                        types.map((type, typeIdx) => {
                          const key = `${animal.id}::${tp}::${type}`;
                          const status = statusMap.get(key);
                          const skipNote = skipNotesMap.get(key);
                          return (
                            <td
                              key={`${tp}-${type}`}
                              className={`text-center py-1 px-0.5 ${tpIdx > 0 && typeIdx === 0 ? "border-l-[3px] border-l-foreground/30" : ""} ${status === "skipped" ? "bg-muted/20" : ""}`}
                              title={status === "skipped" ? (skipNote ? `Skipped: ${skipNote}` : "Skipped") : undefined}
                            >
                              {getStatusIcon(status, skipNote)}
                            </td>
                          );
                        })
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">✅ Completed</span>
        <span className="flex items-center gap-1">🔵 In Progress</span>
        <span className="flex items-center gap-1">⏳ Scheduled</span>
        <span className="flex items-center gap-1 text-muted-foreground">— Skipped (hover for reason)</span>
        <span className="flex items-center gap-1">· Not scheduled</span>
      </div>
    </div>
  );
}

// ─── Main Portal Page ───────────────────────────────────────────────────

export default function PIPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [piOperatorInput, setPiOperatorInput] = useState("");
  const [piOperatorSending, setPiOperatorSending] = useState(false);
  const [piOperatorMessages, setPiOperatorMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const [piTaskTitle, setPiTaskTitle] = useState("");
  const [piTaskDueDate, setPiTaskDueDate] = useState("");
  const [piTaskPriority, setPiTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [piTaskNotes, setPiTaskNotes] = useState("");
  const [piTaskSubmitting, setPiTaskSubmitting] = useState(false);
  const [piTaskFeedback, setPiTaskFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pi/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Access denied or expired");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h1 className="text-xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground">This link is invalid or has been revoked.</p>
    </div>
  );

  const upcoming = data.experiments
    .filter((e) => e.status === "scheduled" && e.scheduled_date)
    .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
    .slice(0, 15);
  const cohortNameById = new Map(data.cohorts.map((c) => [c.id, c.name]));
  const upcomingByDate = upcoming.reduce((acc, exp) => {
    const dateKey = exp.scheduled_date || "Unscheduled";
    if (!acc.has(dateKey)) acc.set(dateKey, []);
    acc.get(dateKey)!.push(exp);
    return acc;
  }, new Map<string, typeof upcoming>());
  const upcomingCalendarEvents = data.calendar_events
    .filter((e) => e.start_at)
    .sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || "")))
    .slice(0, 20);
  const upcomingCalendarByDate = upcomingCalendarEvents.reduce((acc, ev) => {
    const dateKey = String(ev.start_at).slice(0, 10);
    if (!acc.has(dateKey)) acc.set(dateKey, []);
    acc.get(dateKey)!.push(ev);
    return acc;
  }, new Map<string, typeof upcomingCalendarEvents>());

  const hasColonyResults = data.can_see.includes("colony_results") && data.colony_results.length > 0;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 40%, #f5f0ff 100%)" }}>
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">

      {/* Hero header */}
      <div className="rounded-2xl px-6 py-5 space-y-1" style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #6d28d9 100%)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-indigo-200 text-xs font-medium tracking-wide uppercase">Live View</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Colony Overview</h1>
        <p className="text-indigo-200 text-sm">Read-only view for <span className="text-white font-medium">{data.advisor_name}</span></p>
      </div>

      {/* Stats */}
      {(() => {
        const total = data.stats.completed_experiments + data.stats.in_progress_experiments + data.stats.pending_experiments;
        const pct = total > 0 ? Math.round((data.stats.completed_experiments / total) * 100) : 0;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)" }}>
                <div className="text-2xl font-bold text-violet-800">{data.stats.active_animals}</div>
                <p className="text-xs text-violet-600 font-medium mt-0.5">Active Animals</p>
              </div>
              <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}>
                <div className="text-3xl font-bold text-emerald-700">{data.stats.completed_experiments}</div>
                <p className="text-xs text-emerald-700 font-semibold mt-0.5">Done ✓</p>
              </div>
              <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
                <div className="text-2xl font-bold text-amber-700">{data.stats.in_progress_experiments}</div>
                <p className="text-xs text-amber-600 font-medium mt-0.5">Ongoing</p>
              </div>
              <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #e0f2fe, #bae6fd)" }}>
                <div className="text-2xl font-bold text-sky-700">{pct}%</div>
                <p className="text-xs text-sky-600 font-medium mt-0.5">Complete</p>
              </div>
            </div>
            {total > 0 && (
              <div className="space-y-1">
                <div className="w-full bg-white/60 rounded-full h-2.5 overflow-hidden shadow-inner">
                  <div className="h-2.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #10b981, #06b6d4)" }} />
                </div>
                <p className="text-xs text-slate-500 text-right">{pct}% of protocol complete</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Photo Gallery Slideshow */}
      {data.photos && data.photos.length > 0 && (
        <PhotoGallery photos={data.photos} />
      )}

      {/* Tabbed sections: Tracker / Results / Analysis / Overview */}
      {hasColonyResults || data.experiments.length > 0 ? (
        <Tabs defaultValue="overview">
          <TabsList className="w-full flex flex-wrap gap-1 p-1.5 rounded-2xl" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(99,102,241,0.15)", height: "auto" }}>
            <TabsTrigger value="overview" className="flex-1 gap-1.5 rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
              <Mouse className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            {data.experiments.length > 0 && (
              <TabsTrigger value="tracker" className="flex-1 gap-1.5 rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                <ClipboardCheck className="h-3.5 w-3.5" /> Tracker
              </TabsTrigger>
            )}
            {data.can_see.includes("calendar") && (
              <TabsTrigger value="calendar" className="flex-1 gap-1.5 rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                <Calendar className="h-3.5 w-3.5" /> Calendar
              </TabsTrigger>
            )}
            <TabsTrigger value="operator" className="flex-1 gap-1.5 rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
              <Bot className="h-3.5 w-3.5" /> Operator
            </TabsTrigger>
            {hasColonyResults && (
              <>
                <TabsTrigger value="results" className="flex-1 gap-1.5 rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                  <TableIcon className="h-3.5 w-3.5" /> Results Data
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex-1 gap-1.5 rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                  <TrendingUp className="h-3.5 w-3.5" /> Analysis & Plots
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Overview Tab — first (positive landing view) */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Recent Activity — TOP for positive first impression */}
            {data.can_see.includes("experiments") && (() => {
              const recentCompleted = data.experiments
                .filter(e => e.status === "completed")
                .sort((a, b) => (b.completed_date || "").localeCompare(a.completed_date || ""))
                .slice(0, 30);
              const recentInProgress = data.experiments
                .filter(e => e.status === "in_progress")
                .slice(0, 10);
              if (recentCompleted.length === 0 && recentInProgress.length === 0) return null;
              return (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-green-600" />
                      <span>Recent Activity</span>
                      {recentCompleted.length > 0 && (
                        <Badge className="bg-green-100 text-green-700 text-xs ml-1" variant="secondary">
                          {recentCompleted.length} completed ✓
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 pb-3">
                    {recentCompleted.map((exp, i) => (
                      <div key={`c-${i}`} className="flex items-center gap-2 text-sm">
                        <span className="text-green-600 text-base leading-none">✓</span>
                        <span className="font-medium">{exp.animal_identifier}</span>
                        <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                        {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                        <span className="text-xs text-muted-foreground ml-auto">{exp.completed_date || ""}</span>
                      </div>
                    ))}
                    {recentInProgress.length > 0 && (
                      <div className="pt-1 mt-1 border-t">
                        {recentInProgress.map((exp, i) => (
                          <div key={`ip-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="text-amber-500 text-base leading-none">○</span>
                            <span>{exp.animal_identifier}</span>
                            <span>{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                            {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Upcoming */}
            {data.can_see.includes("timeline") && upcoming.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Upcoming Experiments
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-3">
                  {Array.from(upcomingByDate.entries()).map(([date, items]) => (
                    <div key={date} className="space-y-1.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {date}
                      </div>
                      {items.map((exp, i) => (
                        <div key={`${date}-${i}`} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{exp.animal_identifier}</span>
                            {exp.cohort_id && (
                              <Badge variant="outline" className="text-xs">{cohortNameById.get(exp.cohort_id) || "Unknown cohort"}</Badge>
                            )}
                            <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                            {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {data.can_see.includes("calendar") && upcomingCalendarEvents.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Upcoming Calendar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-3">
                  {Array.from(upcomingCalendarByDate.entries()).map(([date, items]) => (
                    <div key={`cal-${date}`} className="space-y-1.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {date}
                      </div>
                      {items.map((ev, i) => (
                        <div key={`${date}-${i}-${ev.id}`} className="flex items-center justify-between text-sm gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-medium truncate">{ev.title}</span>
                            {ev.category && (
                              <Badge variant="outline" className="text-xs capitalize">{String(ev.category).replace(/_/g, " ")}</Badge>
                            )}
                            {ev.status && (
                              <Badge variant="secondary" className="text-xs capitalize">{String(ev.status).replace(/_/g, " ")}</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {ev.all_day ? "All day" : String(ev.start_at).slice(11, 16)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Animals */}
            {data.can_see.includes("animals") && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Mouse className="h-4 w-4" /> Animals ({data.animals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-3">
                  {data.animals.map((a, i) => {
                    const age = Math.floor((Date.now() - new Date(a.birth_date).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-1.5 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.identifier}</span>
                          <Badge variant="outline" className="text-xs">{a.cohort_name}</Badge>
                          <Badge variant="secondary" className="text-xs">{GENOTYPE_LABELS[a.genotype]} {a.sex === "male" ? "♂" : "♀"}</Badge>
                          {a.eeg_implanted && <Badge className="bg-purple-100 text-purple-700 text-xs" variant="secondary">EEG</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{age}d old</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tracker Tab */}
          {data.experiments.length > 0 && (
            <TabsContent value="tracker" className="mt-4">
              <PITrackerTab
                animals={data.animals}
                experiments={data.experiments}
                cohorts={data.cohorts}
                timepoints={data.timepoints}
              />
            </TabsContent>
          )}

          {data.can_see.includes("calendar") && (
            <TabsContent value="calendar" className="mt-4">
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Calendar Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-3">
                  {upcomingCalendarEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No calendar events visible in this portal.</p>
                  ) : (
                    Array.from(upcomingCalendarByDate.entries()).map(([date, items]) => (
                      <div key={`tab-cal-${date}`} className="space-y-1.5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{date}</div>
                        {items.map((ev, i) => (
                          <div key={`${date}-${ev.id}-${i}`} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-1 last:pb-0">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-medium truncate">{ev.title}</span>
                              <Badge variant="outline" className="text-xs capitalize">{String(ev.category || "event").replace(/_/g, " ")}</Badge>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {ev.status && <Badge variant="secondary" className="text-xs capitalize">{String(ev.status).replace(/_/g, " ")}</Badge>}
                              <span className="text-xs text-muted-foreground">{ev.all_day ? "All day" : String(ev.start_at).slice(11, 16)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="operator" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4" /> PI Operator (Read-only)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Ask read-only questions about this portal’s connected data (calendar, cohorts, animals). This view cannot change data.
                </p>
                <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Assign Task to Tara</p>
                    <Badge variant="outline" className="text-[10px]">PI can create tasks</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      value={piTaskTitle}
                      onChange={(e) => setPiTaskTitle(e.target.value)}
                      placeholder="Task title (e.g. Review rotarod outliers)"
                      className="sm:col-span-2 h-9 rounded-md border bg-background px-3 text-sm"
                    />
                    <select
                      value={piTaskPriority}
                      onChange={(e) => setPiTaskPriority(e.target.value as "low" | "medium" | "high")}
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="low">Low priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="high">High priority</option>
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="date"
                      value={piTaskDueDate}
                      onChange={(e) => setPiTaskDueDate(e.target.value)}
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                    />
                    <textarea
                      value={piTaskNotes}
                      onChange={(e) => setPiTaskNotes(e.target.value)}
                      placeholder="Optional notes / context"
                      className="sm:col-span-2 min-h-[38px] max-h-[100px] resize-y rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Creates a real task in the main BPAN workspace (source: PI Portal).
                    </p>
                    <Button
                      size="sm"
                      disabled={piTaskSubmitting || !piTaskTitle.trim()}
                      onClick={async () => {
                        const title = piTaskTitle.trim();
                        if (!title) return;
                        setPiTaskSubmitting(true);
                        setPiTaskFeedback(null);
                        try {
                          const res = await fetch(`/api/pi/${token}/tasks`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              title,
                              due_date: piTaskDueDate || null,
                              priority: piTaskPriority,
                              description: piTaskNotes.trim() || null,
                            }),
                          });
                          const json = await res.json();
                          if (!res.ok) {
                            setPiTaskFeedback(json.error || "Failed to create task");
                          } else {
                            setPiTaskFeedback(`Task created: ${json.task?.title || title}`);
                            setPiTaskTitle("");
                            setPiTaskDueDate("");
                            setPiTaskPriority("medium");
                            setPiTaskNotes("");
                          }
                        } catch {
                          setPiTaskFeedback("Failed to create task");
                        } finally {
                          setPiTaskSubmitting(false);
                        }
                      }}
                    >
                      {piTaskSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Add Task
                    </Button>
                  </div>
                  {piTaskFeedback && (
                    <div className="text-xs rounded-md border bg-background px-2.5 py-2">
                      {piTaskFeedback}
                    </div>
                  )}
                </div>
                {piOperatorMessages.length === 0 && (
                  <div className="rounded-lg border p-3 space-y-1.5">
                    {["summary", "show upcoming", "what's on 2026-03-20", "cohort BPAN 5"].map((q) => (
                      <button
                        key={q}
                        onClick={() => setPiOperatorInput(q)}
                        className="block w-full text-left text-xs px-2 py-1.5 rounded border hover:bg-accent"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {piOperatorMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words overflow-hidden leading-relaxed ${
                          msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={piOperatorInput}
                    onChange={(e) => setPiOperatorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!piOperatorInput.trim() || piOperatorSending) return;
                        (async () => {
                          const msg = piOperatorInput.trim();
                          setPiOperatorInput("");
                          setPiOperatorSending(true);
                          setPiOperatorMessages((prev) => [...prev, { id: `pi-op-u-${Date.now()}`, role: "user", content: msg }]);
                          try {
                            const res = await fetch(`/api/pi/${token}/operator`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ message: msg }),
                            });
                            const json = await res.json();
                            setPiOperatorMessages((prev) => [...prev, { id: `pi-op-a-${Date.now()}`, role: "assistant", content: json.response || json.error || "Request failed" }]);
                          } catch {
                            setPiOperatorMessages((prev) => [...prev, { id: `pi-op-e-${Date.now()}`, role: "assistant", content: "Request failed" }]);
                          } finally {
                            setPiOperatorSending(false);
                          }
                        })();
                      }
                    }}
                    placeholder="Ask PI Operator..."
                    className="flex-1 min-w-0 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[38px] max-h-[120px]"
                    rows={1}
                  />
                  <Button
                    size="sm"
                    disabled={piOperatorSending || !piOperatorInput.trim()}
                    onClick={async () => {
                      const msg = piOperatorInput.trim();
                      if (!msg) return;
                      setPiOperatorInput("");
                      setPiOperatorSending(true);
                      setPiOperatorMessages((prev) => [...prev, { id: `pi-op-u-${Date.now()}`, role: "user", content: msg }]);
                      try {
                        const res = await fetch(`/api/pi/${token}/operator`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ message: msg }),
                        });
                        const json = await res.json();
                        setPiOperatorMessages((prev) => [...prev, { id: `pi-op-a-${Date.now()}`, role: "assistant", content: json.response || json.error || "Request failed" }]);
                      } catch {
                        setPiOperatorMessages((prev) => [...prev, { id: `pi-op-e-${Date.now()}`, role: "assistant", content: "Request failed" }]);
                      } finally {
                        setPiOperatorSending(false);
                      }
                    }}
                  >
                    {piOperatorSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {hasColonyResults && (
            <>
              <TabsContent value="results" className="mt-4">
                <ColonyResultsView
                  fullAnimals={data.full_animals}
                  colonyResults={data.colony_results}
                  cohorts={data.cohorts}
                  timepoints={data.timepoints}
                />
              </TabsContent>

              <TabsContent value="analysis" className="mt-4">
                <PIAnalysisPanel
                  fullAnimals={data.full_animals}
                  colonyResults={data.colony_results}
                  cohorts={data.cohorts}
                  portalToken={token}
                />
              </TabsContent>
            </>
          )}

          {/* (Overview TabsContent is rendered first above) */}
        </Tabs>
      ) : (
        <>
          {/* Fallback: show original layout without tabs if no colony results */}
          {data.can_see.includes("timeline") && upcoming.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Upcoming Experiments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-3">
                {Array.from(upcomingByDate.entries()).map(([date, items]) => (
                  <div key={date} className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {date}
                    </div>
                    {items.map((exp, i) => (
                      <div key={`${date}-${i}`} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{exp.animal_identifier}</span>
                          {exp.cohort_id && (
                            <Badge variant="outline" className="text-xs">{cohortNameById.get(exp.cohort_id) || "Unknown cohort"}</Badge>
                          )}
                          <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                          {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.can_see.includes("animals") && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Mouse className="h-4 w-4" /> Animals ({data.animals.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                {data.animals.map((a, i) => {
                  const age = Math.floor((Date.now() - new Date(a.birth_date).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-1.5 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.identifier}</span>
                        <Badge variant="outline" className="text-xs">{a.cohort_name}</Badge>
                        <Badge variant="secondary" className="text-xs">{GENOTYPE_LABELS[a.genotype]} {a.sex === "male" ? "♂" : "♀"}</Badge>
                        {a.eeg_implanted && <Badge className="bg-purple-100 text-purple-700 text-xs" variant="secondary">EEG</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{age}d old</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {data.can_see.includes("experiments") && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" /> All Experiments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pb-3">
                {data.experiments.slice(0, 50).map((exp, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge className={`${STATUS_COLORS[exp.status]} text-xs`} variant="secondary">
                      {exp.status}
                    </Badge>
                    <span className="font-medium">{exp.animal_identifier}</span>
                    <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                    {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">{exp.scheduled_date || exp.completed_date || ""}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="text-center text-xs text-slate-400 py-4">
        Powered by BPAN Research Platform
      </div>
    </div>
    </div>
  );
}
