"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Loader2, AlertCircle, Mouse, Calendar, Check, Clock,
  FlaskConical, BarChart3, ChevronLeft, ChevronRight, ImageIcon,
  Table as TableIcon, TrendingUp,
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

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y-Maze", ldb: "Light-Dark Box",
  marble: "Marble Burying", nesting: "Nesting", rotarod: "Rotarod",
  rotarod_hab: "Rotarod Hab", stamina: "Stamina Test",
  catwalk: "CatWalk", blood_draw: "Plasma Collection",
  data_collection: "Data Collection", core_acclimation: "Core Acclimation",
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
    identifier: string; sex: string; genotype: string;
    birth_date: string; status: string; cohort_name: string;
    ear_tag: string | null; cage_number: string | null;
    eeg_implanted: boolean;
  }>;
  full_animals: Animal[];
  experiments: Array<{
    animal_identifier: string; experiment_type: string;
    timepoint_age_days: number | null; scheduled_date: string | null;
    completed_date: string | null; status: string;
    results_drive_url: string | null;
  }>;
  colony_results: ColonyResult[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
  photos: PortalPhoto[];
  stats: {
    total_animals: number; active_animals: number;
    pending_experiments: number; completed_experiments: number;
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
        <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={photo.caption || "Lab photo"}
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`}
            referrerPolicy="no-referrer"
          />
        </div>
        {photos.length > 1 && (
          <>
            <Button
              variant="ghost" size="sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-8 w-8 p-0 rounded-full"
              onClick={prev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-8 w-8 p-0 rounded-full"
              onClick={next}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
        {(photo.caption || photo.experiment_type) && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8">
            <p className="text-white text-sm font-medium">{photo.caption || ""}</p>
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
        <div className="flex justify-center gap-1.5 py-2">
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

function PIAnalysisPanel({
  fullAnimals,
  colonyResults,
  cohorts,
}: {
  fullAnimals: Animal[];
  colonyResults: ColonyResult[];
  cohorts: Cohort[];
}) {
  const [selectedExperiment, setSelectedExperiment] = useState<string>("");
  const [selectedTimepoint, setSelectedTimepoint] = useState<string>("");
  const [selectedMeasure, setSelectedMeasure] = useState<string>("");
  const [chartType, setChartType] = useState<string>("bar");

  // Significance annotations
  type SigAnnotation = { group1: string; group2: string; label: string };
  const SIG_LABELS = ["ns", "*", "**", "***", "****"];
  const [sigAnnotations, setSigAnnotations] = useState<SigAnnotation[]>([]);
  const [pendingGroup1, setPendingGroup1] = useState("");
  const [pendingGroup2, setPendingGroup2] = useState("");
  const [pendingLabel, setPendingLabel] = useState("*");

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

  // Plotly data
  const plotData = useMemo(() => {
    if (groupData.length === 0) return { data: [], layout: {} };

    const measureLabel = selectedMeasure.replace(/_/g, " ");

    if (chartType === "bar") {
      return {
        data: [{
          type: "bar" as const,
          x: groupData.map((g) => g.label),
          y: groupData.map((g) => g.mean),
          error_y: {
            type: "data" as const,
            array: groupData.map((g) => g.sem),
            visible: true,
          },
          marker: {
            color: groupData.map((g) => GROUP_COLORS[g.label] || CHART_COLORS[0]),
          },
        }],
        layout: {
          title: { text: measureLabel, font: { size: 14 } },
          yaxis: { title: { text: measureLabel } },
          margin: { t: 40, r: 20, b: 60, l: 60 },
          height: 400,
        },
      };
    }

    if (chartType === "box") {
      return {
        data: groupData.map((g, i) => ({
          type: "box" as const,
          y: g.values,
          name: g.label,
          marker: { color: GROUP_COLORS[g.label] || CHART_COLORS[i] },
          boxpoints: "all" as const,
          jitter: 0.3,
          pointpos: -1.5,
        })),
        layout: {
          title: { text: measureLabel, font: { size: 14 } },
          yaxis: { title: { text: measureLabel } },
          margin: { t: 40, r: 20, b: 60, l: 60 },
          height: 400,
          showlegend: false,
        },
      };
    }

    if (chartType === "violin") {
      return {
        data: groupData.map((g, i) => ({
          type: "violin" as const,
          y: g.values,
          name: g.label,
          box: { visible: true },
          meanline: { visible: true },
          marker: { color: GROUP_COLORS[g.label] || CHART_COLORS[i] },
          points: "all" as const,
          jitter: 0.3,
        })),
        layout: {
          title: { text: measureLabel, font: { size: 14 } },
          yaxis: { title: { text: measureLabel } },
          margin: { t: 40, r: 20, b: 60, l: 60 },
          height: 400,
          showlegend: false,
        },
      };
    }

    // scatter: individual animals
    return {
      data: groupData.map((g, i) => ({
        type: "scatter" as const,
        mode: "markers" as const,
        y: g.values,
        x: g.values.map(() => g.label),
        name: g.label,
        marker: {
          color: GROUP_COLORS[g.label] || CHART_COLORS[i],
          size: 8,
        },
      })),
      layout: {
        title: { text: measureLabel, font: { size: 14 } },
        yaxis: { title: { text: measureLabel } },
        margin: { t: 40, r: 20, b: 60, l: 60 },
        height: 400,
      },
    };
  }, [groupData, chartType, selectedMeasure]);

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

  // Build significance bracket shapes + annotations
  const sigShapesAndAnnotations = useMemo(() => {
    if (groupData.length === 0 || sigAnnotations.length === 0)
      return { shapes: [] as Partial<Plotly.Shape>[], annotations: [] as Partial<Plotly.Annotations>[] };

    const labels = groupData.map((g) => g.label);
    const overallMax = Math.max(...groupData.flatMap((g) => [g.mean + g.sem, ...g.values]), 0);
    const step = overallMax * 0.08;

    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];

    const sorted = [...sigAnnotations].sort((a, b) => {
      const spanA = Math.abs(labels.indexOf(a.group2) - labels.indexOf(a.group1));
      const spanB = Math.abs(labels.indexOf(b.group2) - labels.indexOf(b.group1));
      return spanA - spanB;
    });

    let currentY = overallMax + step;

    for (const ann of sorted) {
      const idx1 = labels.indexOf(ann.group1);
      const idx2 = labels.indexOf(ann.group2);
      if (idx1 < 0 || idx2 < 0) continue;

      const x0 = Math.min(idx1, idx2);
      const x1 = Math.max(idx1, idx2);
      const bracketY = currentY;
      const tickDown = step * 0.3;

      shapes.push(
        { type: "line", x0: labels[x0], x1: labels[x0], y0: bracketY - tickDown, y1: bracketY, xref: "x", yref: "y", line: { color: "black", width: 1.5 } },
        { type: "line", x0: labels[x0], x1: labels[x1], y0: bracketY, y1: bracketY, xref: "x", yref: "y", line: { color: "black", width: 1.5 } },
        { type: "line", x0: labels[x1], x1: labels[x1], y0: bracketY - tickDown, y1: bracketY, xref: "x", yref: "y", line: { color: "black", width: 1.5 } },
      );

      const midIdx = (x0 + x1) / 2;
      annotations.push({
        x: labels[Math.round(midIdx)] || labels[x0],
        y: bracketY + step * 0.15,
        xref: "x", yref: "y",
        text: ann.label === "ns" ? "<i>ns</i>" : ann.label,
        showarrow: false,
        font: { size: ann.label === "ns" ? 11 : 14, color: "black" },
        xanchor: "center", yanchor: "bottom",
      });

      currentY += step;
    }

    return { shapes, annotations };
  }, [groupData, sigAnnotations]);

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
      {/* Config */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Experiment</label>
              <Select value={selectedExperiment} onValueChange={setSelectedExperiment}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableExperiments.map((exp) => (
                    <SelectItem key={exp} value={exp}>{EXPERIMENT_LABELS[exp] || exp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Timepoint</label>
              <Select value={selectedTimepoint} onValueChange={setSelectedTimepoint}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTimepoints.map((tp) => (
                    <SelectItem key={tp} value={String(tp)}>{tp} Day</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Measure</label>
              <Select value={selectedMeasure} onValueChange={setSelectedMeasure}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableMeasures.map((m) => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Chart Type</label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar + SEM</SelectItem>
                  <SelectItem value="box">Box Plot</SelectItem>
                  <SelectItem value="violin">Violin</SelectItem>
                  <SelectItem value="scatter">Scatter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Significance annotations */}
          {chartType !== "scatter" && groupData.length > 0 && (
            <div className="border-t mt-3 pt-3 space-y-2">
              <label className="text-[11px] font-medium text-muted-foreground">Significance Annotations</label>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Group 1</label>
                  <Select value={pendingGroup1} onValueChange={setPendingGroup1}>
                    <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {groupData.map((g) => (
                        <SelectItem key={g.label} value={g.label}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Group 2</label>
                  <Select value={pendingGroup2} onValueChange={setPendingGroup2}>
                    <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {groupData.filter((g) => g.label !== pendingGroup1).map((g) => (
                        <SelectItem key={g.label} value={g.label}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Significance</label>
                  <Select value={pendingLabel} onValueChange={setPendingLabel}>
                    <SelectTrigger className="h-7 text-xs w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIG_LABELS.map((l) => (
                        <SelectItem key={l} value={l}>{l === "ns" ? "ns" : l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!pendingGroup1 || !pendingGroup2 || pendingGroup1 === pendingGroup2}
                  onClick={() => {
                    setSigAnnotations((prev) => [...prev, { group1: pendingGroup1, group2: pendingGroup2, label: pendingLabel }]);
                    setPendingGroup1("");
                    setPendingGroup2("");
                  }}
                >
                  + Add
                </Button>
              </div>
              {sigAnnotations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sigAnnotations.map((ann, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-[10px] gap-1 pl-1.5 pr-1 py-0 cursor-pointer hover:bg-destructive/10"
                      onClick={() => setSigAnnotations((prev) => prev.filter((_, j) => j !== i))}
                    >
                      {ann.group1} vs {ann.group2}: <strong>{ann.label}</strong>
                      <span className="text-muted-foreground hover:text-destructive ml-0.5">✕</span>
                    </Badge>
                  ))}
                  {sigAnnotations.length > 1 && (
                    <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setSigAnnotations([])}>
                      Clear all
                    </button>
                  )}
                </div>
              )}
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
                margin: { ...(plotData.layout as Record<string, unknown>).margin as Record<string, number> || { t: 40, r: 20, b: 60, l: 60 }, t: sigAnnotations.length > 0 ? 60 + sigAnnotations.length * 20 : 40 },
                shapes: [...sigShapesAndAnnotations.shapes],
                annotations: [...sigShapesAndAnnotations.annotations],
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

// ─── Main Portal Page ───────────────────────────────────────────────────

export default function PIPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const hasColonyResults = data.can_see.includes("colony_results") && data.colony_results.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <Badge variant="secondary" className="mb-2">PI Portal — Live View</Badge>
        <h1 className="text-2xl font-bold">Colony Overview</h1>
        <p className="text-muted-foreground text-sm">Read-only view for {data.advisor_name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.active_animals}</div>
          <p className="text-xs text-muted-foreground">Active Animals</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.total_animals}</div>
          <p className="text-xs text-muted-foreground">Total Animals</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.pending_experiments}</div>
          <p className="text-xs text-muted-foreground">Pending</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.completed_experiments}</div>
          <p className="text-xs text-muted-foreground">Completed</p>
        </CardContent></Card>
      </div>

      {/* Photo Gallery Slideshow */}
      {data.photos && data.photos.length > 0 && (
        <PhotoGallery photos={data.photos} />
      )}

      {/* Tabbed sections: Overview / Results / Analysis */}
      {hasColonyResults ? (
        <Tabs defaultValue="overview">
          <TabsList className="w-full flex gap-1 p-1" style={{ height: "auto" }}>
            <TabsTrigger value="overview" className="flex-1 gap-1.5">
              <Mouse className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1 gap-1.5">
              <TableIcon className="h-3.5 w-3.5" /> Results Data
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex-1 gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Analysis & Plots
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Upcoming */}
            {data.can_see.includes("timeline") && upcoming.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Upcoming Experiments
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 pb-3">
                  {upcoming.map((exp, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{exp.animal_identifier}</span>
                        <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                        {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{exp.scheduled_date}</span>
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

            {/* Experiment Progress */}
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
          </TabsContent>

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
            />
          </TabsContent>
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
              <CardContent className="space-y-1.5 pb-3">
                {upcoming.map((exp, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{exp.animal_identifier}</span>
                      <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                      {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{exp.scheduled_date}</span>
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

      <div className="text-center text-xs text-muted-foreground py-4">
        Powered by BPAN Research Platform
      </div>
    </div>
  );
}
