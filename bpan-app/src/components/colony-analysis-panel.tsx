"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Papa from "papaparse";
import {
  BarChart3,
  FlaskConical,
  Download,
  Loader2,
  Table as TableIcon,
  Brain,
  Sparkles,
  Filter,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Animal, Cohort, ColonyTimepoint, ColonyResult } from "@/types";

// Dynamically import Plotly
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Overnight Nesting",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Habituation",
  rotarod: "Rotarod Testing",
  stamina: "Stamina Test",
  blood_draw: "Plasma Collection",
  eeg_recording: "EEG Recording",
};

const GROUP_COLORS: Record<string, string> = {
  "Hemi Male": "#ef4444",
  "WT Male": "#3b82f6",
  "Het Female": "#f97316",
  "WT Female": "#8b5cf6",
};

const GROUP_ORDER = ["Hemi Male", "WT Male", "Het Female", "WT Female"];

const CHART_COLORS = [
  "#ef4444", "#3b82f6", "#f97316", "#8b5cf6",
  "#10b981", "#f59e0b", "#06b6d4", "#ec4899",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function sem(arr: number[]): number {
  return arr.length < 2 ? 0 : stdDev(arr) / Math.sqrt(arr.length);
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n: number, d = 4): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function formatNum(n: number, d = 2): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(d);
}

/** Welch's t-test (two-tailed) */
function welchTTest(a: number[], b: number[]): { t: number; df: number; p: number; cohenD: number } {
  const m1 = mean(a), m2 = mean(b);
  const v1 = a.reduce((s, v) => s + (v - m1) ** 2, 0) / (a.length - 1);
  const v2 = b.reduce((s, v) => s + (v - m2) ** 2, 0) / (b.length - 1);
  const se = Math.sqrt(v1 / a.length + v2 / b.length);
  if (se === 0) return { t: 0, df: 0, p: 1, cohenD: 0 };
  const t = (m1 - m2) / se;
  const df = (v1 / a.length + v2 / b.length) ** 2 /
    ((v1 / a.length) ** 2 / (a.length - 1) + (v2 / b.length) ** 2 / (b.length - 1));
  const pooledSD = Math.sqrt(((a.length - 1) * v1 + (b.length - 1) * v2) / (a.length + b.length - 2));
  const cohenD = pooledSD === 0 ? 0 : (m1 - m2) / pooledSD;
  const p = 2 * (1 - approxNormCDF(Math.abs(t)));
  return { t: round(t), df: round(df), p: round(p, 6), cohenD: round(cohenD) };
}

/** One-way ANOVA */
function oneWayAnova(groups: number[][]): { F: number; dfBetween: number; dfWithin: number; p: number; etaSq: number } {
  const all = groups.flat();
  const grandMean = mean(all);
  const k = groups.length;
  const N = all.length;
  let ssBetween = 0, ssWithin = 0;
  for (const g of groups) {
    const gm = mean(g);
    ssBetween += g.length * (gm - grandMean) ** 2;
    for (const v of g) ssWithin += (v - gm) ** 2;
  }
  const dfBetween = k - 1;
  const dfWithin = N - k;
  if (dfWithin <= 0 || dfBetween <= 0) return { F: 0, dfBetween, dfWithin, p: 1, etaSq: 0 };
  const F = (ssBetween / dfBetween) / (ssWithin / dfWithin);
  const etaSq = ssBetween / (ssBetween + ssWithin);
  const p = 1 - approxFCDF(F, dfBetween, dfWithin);
  return { F: round(F), dfBetween, dfWithin, p: round(p, 6), etaSq: round(etaSq) };
}

function approxNormCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

function approxFCDF(f: number, d1: number, d2: number): number {
  const x = (f * d1) / (f * d1 + d2);
  return regularizedBeta(x, d1 / 2, d2 / 2);
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x === 0 || x === 1) return x;
  const maxIter = 200;
  const eps = 1e-10;
  let result = 1, c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  result = d;
  for (let m = 1; m <= maxIter; m++) {
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps;
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps;
    d = 1 / d; result *= d * c;
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps;
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  const lnB = lgamma(a) + lgamma(b) - lgamma(a + b);
  const prefix = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnB) / a;
  return prefix * result;
}

function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface FlatRow {
  animal_id: string;
  identifier: string;
  sex: string;
  genotype: string;
  group: string; // "Hemi Male", "WT Male", etc.
  cohort: string;
  timepoint: number;
  experiment: string;
  [key: string]: string | number | null;
}

interface GroupStats {
  group: string;
  n: number;
  mean: number;
  sd: number;
  sem: number;
  median: number;
  min: number;
  max: number;
  values: number[];
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ColonyAnalysisPanelProps {
  animals: Animal[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
  colonyResults: ColonyResult[];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ColonyAnalysisPanel({
  animals,
  cohorts,
  timepoints,
  colonyResults,
}: ColonyAnalysisPanelProps) {
  // ── Filter state ──
  const [selectedExperiment, setSelectedExperiment] = useState<string>("__all__");
  const [selectedTimepoint, setSelectedTimepoint] = useState<string>("__all__");
  const [selectedCohort, setSelectedCohort] = useState<string>("__all__");

  // Available experiment types from results
  const availableExperiments = useMemo(() => {
    const exps = new Set(colonyResults.map((r) => r.experiment_type));
    return Array.from(exps).sort();
  }, [colonyResults]);

  // Available timepoints from results
  const availableTimepoints = useMemo(() => {
    const tps = new Set(colonyResults.map((r) => r.timepoint_age_days));
    return Array.from(tps).sort((a, b) => a - b);
  }, [colonyResults]);

  // ── Build flat dataset ──
  const { flatData, measureKeys, measureLabels } = useMemo(() => {
    let results = colonyResults;

    if (selectedExperiment !== "__all__") {
      results = results.filter((r) => r.experiment_type === selectedExperiment);
    }
    if (selectedTimepoint !== "__all__") {
      results = results.filter((r) => r.timepoint_age_days === Number(selectedTimepoint));
    }

    const rows: FlatRow[] = [];
    const keySet = new Set<string>();
    const labels: Record<string, string> = {};

    for (const result of results) {
      const animal = animals.find((a) => a.id === result.animal_id);
      if (!animal) continue;
      if (selectedCohort !== "__all__" && animal.cohort_id !== selectedCohort) continue;

      const cohort = cohorts.find((c) => c.id === animal.cohort_id);
      const genotypeLabel = animal.genotype === "hemi" ? "Hemi" : animal.genotype === "het" ? "Het" : "WT";
      const sexLabel = animal.sex === "male" ? "Male" : "Female";
      const group = `${genotypeLabel} ${sexLabel}`;

      const row: FlatRow = {
        animal_id: animal.id,
        identifier: animal.identifier,
        sex: sexLabel,
        genotype: genotypeLabel,
        group,
        cohort: cohort?.name || "Unknown",
        timepoint: result.timepoint_age_days,
        experiment: result.experiment_type,
      };

      const measures = result.measures as Record<string, string | number | null>;
      for (const [key, value] of Object.entries(measures)) {
        if (key.startsWith("__")) continue; // Skip internal fields (__cage_image, __raw_data_url)
        if (value !== null && value !== undefined) {
          row[key] = typeof value === "string" && !isNaN(Number(value)) ? Number(value) : value;
          keySet.add(key);
          if (!labels[key]) {
            labels[key] = key
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())
              .replace(/\bPct\b/i, "%")
              .replace(/\bSec\b/i, "(s)")
              .replace(/\bCm\b/i, "(cm)");
          }
        }
      }

      rows.push(row);
    }

    return {
      flatData: rows,
      measureKeys: Array.from(keySet).sort(),
      measureLabels: labels,
    };
  }, [colonyResults, animals, cohorts, selectedExperiment, selectedTimepoint, selectedCohort]);

  // Numeric measure keys only
  const numericMeasureKeys = useMemo(() => {
    return measureKeys.filter((key) => {
      const values = flatData.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
      const numCount = values.filter((v) => typeof v === "number" || !isNaN(Number(v))).length;
      return numCount / Math.max(values.length, 1) > 0.5;
    });
  }, [measureKeys, flatData]);

  // Groups present in the data
  const availableGroups = useMemo(() => {
    const groups = new Set(flatData.map((r) => r.group));
    return GROUP_ORDER.filter((g) => groups.has(g));
  }, [flatData]);

  if (colonyResults.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-16 text-center">
        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h3 className="font-medium text-lg mb-2">No results data yet</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Import behavioral tracking data or enter results in the Results tab to start analyzing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Filters ─── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Data Filters</span>
            <Badge variant="secondary" className="text-xs ml-auto">
              {flatData.length} rows · {numericMeasureKeys.length} measures · {availableGroups.length} groups
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs mb-1 block">Experiment Type</Label>
              <Select value={selectedExperiment} onValueChange={setSelectedExperiment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Experiments</SelectItem>
                  {availableExperiments.map((e) => (
                    <SelectItem key={e} value={e}>
                      {EXPERIMENT_LABELS[e] || e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Timepoint</Label>
              <Select value={selectedTimepoint} onValueChange={setSelectedTimepoint}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Timepoints</SelectItem>
                  {availableTimepoints.map((tp) => (
                    <SelectItem key={tp} value={String(tp)}>
                      {tp} Day
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Cohort</Label>
              <Select value={selectedCohort} onValueChange={setSelectedCohort}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Cohorts</SelectItem>
                  {cohorts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {flatData.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Info className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No data matches the current filters.</p>
        </div>
      ) : (
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Summary
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5">
              <TableIcon className="h-3.5 w-3.5" /> Data
            </TabsTrigger>
            <TabsTrigger value="analyze" className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Statistics
            </TabsTrigger>
            <TabsTrigger value="visualize" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Graphs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <SummaryPanel
              flatData={flatData}
              numericKeys={numericMeasureKeys}
              measureLabels={measureLabels}
              groups={availableGroups}
            />
          </TabsContent>

          <TabsContent value="data">
            <DataTablePanel
              flatData={flatData}
              measureKeys={measureKeys}
              measureLabels={measureLabels}
            />
          </TabsContent>

          <TabsContent value="analyze">
            <StatisticsPanel
              flatData={flatData}
              numericKeys={numericMeasureKeys}
              measureLabels={measureLabels}
              groups={availableGroups}
            />
          </TabsContent>

          <TabsContent value="visualize">
            <VisualizationPanel
              flatData={flatData}
              numericKeys={numericMeasureKeys}
              measureLabels={measureLabels}
              groups={availableGroups}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Summary Panel ──────────────────────────────────────────────────────────

function SummaryPanel({
  flatData,
  numericKeys,
  measureLabels,
  groups,
}: {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels: Record<string, string>;
  groups: string[];
}) {
  const [expandedMeasure, setExpandedMeasure] = useState<string | null>(
    numericKeys[0] || null
  );

  const groupStatsMap = useMemo(() => {
    const map: Record<string, Record<string, GroupStats>> = {};
    for (const key of numericKeys) {
      map[key] = {};
      for (const group of groups) {
        const values = flatData
          .filter((r) => r.group === group)
          .map((r) => Number(r[key]))
          .filter((v) => !isNaN(v));
        map[key][group] = {
          group,
          n: values.length,
          mean: mean(values),
          sd: stdDev(values),
          sem: sem(values),
          median: median(values),
          min: values.length ? Math.min(...values) : 0,
          max: values.length ? Math.max(...values) : 0,
          values,
        };
      }
    }
    return map;
  }, [flatData, numericKeys, groups]);

  // Quick comparison: hemi vs wt (males), het vs wt (females)
  const quickTests = useMemo(() => {
    const tests: { label: string; measureKey: string; group1: string; group2: string; result: ReturnType<typeof welchTTest> | null }[] = [];
    for (const key of numericKeys.slice(0, 8)) { // top 8 measures
      const stats = groupStatsMap[key];
      if (!stats) continue;

      if (stats["Hemi Male"]?.n >= 2 && stats["WT Male"]?.n >= 2) {
        tests.push({
          label: `${measureLabels[key] || key}: Hemi♂ vs WT♂`,
          measureKey: key,
          group1: "Hemi Male",
          group2: "WT Male",
          result: welchTTest(stats["Hemi Male"].values, stats["WT Male"].values),
        });
      }

      if (stats["Het Female"]?.n >= 2 && stats["WT Female"]?.n >= 2) {
        tests.push({
          label: `${measureLabels[key] || key}: Het♀ vs WT♀`,
          measureKey: key,
          group1: "Het Female",
          group2: "WT Female",
          result: welchTTest(stats["Het Female"].values, stats["WT Female"].values),
        });
      }
    }
    return tests;
  }, [numericKeys, groupStatsMap, measureLabels]);

  return (
    <div className="space-y-4">
      {/* Group counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {groups.map((g) => {
          const count = flatData.filter((r) => r.group === g).length;
          return (
            <Card key={g}>
              <CardContent className="pt-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: GROUP_COLORS[g] || "#666" }}
                >
                  {count}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{g}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary stats per measure */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">
            Summary Statistics by Group
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {numericKeys.map((key) => {
              const stats = groupStatsMap[key];
              if (!stats) return null;
              const isExpanded = expandedMeasure === key;

              return (
                <div key={key}>
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setExpandedMeasure(isExpanded ? null : key)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium flex-1">
                      {measureLabels[key] || key}
                    </span>
                    <div className="flex gap-3">
                      {groups.map((g) => (
                        <span
                          key={g}
                          className="text-xs tabular-nums"
                          style={{ color: GROUP_COLORS[g] || "#666" }}
                        >
                          {stats[g]?.n > 0 ? `${formatNum(stats[g].mean)} ± ${formatNum(stats[g].sem)}` : "—"}
                        </span>
                      ))}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Group</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">N</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Mean</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">SD</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">SEM</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Median</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Min</th>
                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Max</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map((g) => {
                              const s = stats[g];
                              if (!s || s.n === 0) return null;
                              return (
                                <tr key={g} className="border-b last:border-0">
                                  <td className="py-1.5 px-2 font-medium" style={{ color: GROUP_COLORS[g] }}>{g}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{s.n}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(s.mean)}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(s.sd)}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(s.sem)}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(s.median)}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(s.min)}</td>
                                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(s.max)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick comparison tests */}
      {quickTests.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Quick Comparisons (Welch&apos;s t-test)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {quickTests.map((test, i) => {
                if (!test.result) return null;
                const sig = test.result.p < 0.05;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-4 py-2 text-xs ${
                      sig ? "bg-green-50/50 dark:bg-green-950/10" : ""
                    }`}
                  >
                    <span className="font-medium">{test.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground tabular-nums">
                        t = {test.result.t}, d = {test.result.cohenD}
                      </span>
                      <Badge
                        variant={sig ? "default" : "secondary"}
                        className={`text-[10px] ${sig ? "bg-green-600" : ""}`}
                      >
                        p = {test.result.p < 0.001 ? "< 0.001" : test.result.p.toFixed(4)}
                        {sig ? " *" : ""}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Data Table Panel ───────────────────────────────────────────────────────

function DataTablePanel({
  flatData,
  measureKeys,
  measureLabels,
}: {
  flatData: FlatRow[];
  measureKeys: string[];
  measureLabels: Record<string, string>;
}) {
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const pageSize = 50;
  const rows = flatData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(flatData.length / pageSize);

  const handleExportCSV = useCallback(() => {
    const headers = ["Identifier", "Sex", "Genotype", "Group", "Cohort", "Timepoint", "Experiment", ...measureKeys.map((k) => measureLabels[k] || k)];
    const csvRows = flatData.map((row) => [
      row.identifier,
      row.sex,
      row.genotype,
      row.group,
      row.cohort,
      row.timepoint,
      EXPERIMENT_LABELS[row.experiment] || row.experiment,
      ...measureKeys.map((k) => row[k] ?? ""),
    ]);

    const csv = Papa.unparse({ fields: headers, data: csvRows });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `colony-analysis-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  }, [flatData, measureKeys, measureLabels]);

  const handleCopyTable = useCallback(() => {
    const headers = ["Identifier", "Sex", "Genotype", "Group", "Cohort", "Timepoint", "Experiment", ...measureKeys.map((k) => measureLabels[k] || k)];
    const csvRows = flatData.map((row) => [
      row.identifier,
      row.sex,
      row.genotype,
      row.group,
      row.cohort,
      row.timepoint,
      EXPERIMENT_LABELS[row.experiment] || row.experiment,
      ...measureKeys.map((k) => row[k] ?? ""),
    ]);
    const tsv = [headers.join("\t"), ...csvRows.map((r) => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard! Paste into Excel or Google Sheets.");
  }, [flatData, measureKeys, measureLabels]);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Colony Data — {flatData.length} rows, {measureKeys.length + 7} columns
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={handleCopyTable}>
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={handleExportCSV}>
              <Download className="h-3 w-3" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                <th className="px-2 py-2 text-left font-medium">ID</th>
                <th className="px-2 py-2 text-left font-medium">Sex</th>
                <th className="px-2 py-2 text-left font-medium">Genotype</th>
                <th className="px-2 py-2 text-left font-medium">Group</th>
                <th className="px-2 py-2 text-left font-medium">Cohort</th>
                <th className="px-2 py-2 text-left font-medium">TP</th>
                <th className="px-2 py-2 text-left font-medium">Experiment</th>
                {measureKeys.map((k) => (
                  <th key={k} className="px-2 py-2 text-left font-medium min-w-[80px]" title={k}>
                    {(measureLabels[k] || k).length > 20
                      ? (measureLabels[k] || k).slice(0, 18) + "…"
                      : measureLabels[k] || k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.animal_id}-${row.timepoint}-${row.experiment}`} className="border-t hover:bg-accent/50">
                  <td className="px-2 py-1.5 text-muted-foreground">{page * pageSize + i + 1}</td>
                  <td className="px-2 py-1.5 font-medium">{row.identifier}</td>
                  <td className="px-2 py-1.5">
                    <span className={row.sex === "Male" ? "text-blue-600" : "text-pink-600"}>
                      {row.sex === "Male" ? "♂" : "♀"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{row.genotype}</td>
                  <td className="px-2 py-1.5" style={{ color: GROUP_COLORS[row.group] }}>
                    {row.group}
                  </td>
                  <td className="px-2 py-1.5">{row.cohort}</td>
                  <td className="px-2 py-1.5">{row.timepoint}d</td>
                  <td className="px-2 py-1.5">{EXPERIMENT_LABELS[row.experiment] || row.experiment}</td>
                  {measureKeys.map((k) => (
                    <td key={k} className="px-2 py-1.5 tabular-nums">
                      {row[k] !== null && row[k] !== undefined
                        ? typeof row[k] === "number"
                          ? formatNum(row[k] as number)
                          : String(row[k])
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t text-xs">
            <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Statistics Panel ───────────────────────────────────────────────────────

function StatisticsPanel({
  flatData,
  numericKeys,
  measureLabels,
  groups,
}: {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels: Record<string, string>;
  groups: string[];
}) {
  const [testType, setTestType] = useState("t_test");
  const [measureKey, setMeasureKey] = useState(numericKeys[0] || "");
  const [group1, setGroup1] = useState(groups[0] || "");
  const [group2, setGroup2] = useState(groups[1] || "");
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);

  const TEST_OPTIONS = [
    { value: "descriptive", label: "Descriptive Statistics", desc: "Mean, SD, SEM, median for each group" },
    { value: "t_test", label: "t-Test (2 groups)", desc: "Compare two groups (Welch's t-test)" },
    { value: "anova", label: "ANOVA (all groups)", desc: "Compare all groups at once" },
    { value: "multi_compare", label: "All Pairwise Comparisons", desc: "t-tests between every pair of groups" },
  ];

  const runTest = useCallback(() => {
    const getValues = (group: string) =>
      flatData
        .filter((r) => r.group === group)
        .map((r) => Number(r[measureKey]))
        .filter((v) => !isNaN(v));

    switch (testType) {
      case "descriptive": {
        const results: Record<string, unknown> = {};
        for (const g of groups) {
          const vals = getValues(g);
          if (vals.length === 0) continue;
          results[g] = {
            n: vals.length,
            mean: round(mean(vals)),
            sd: round(stdDev(vals)),
            sem: round(sem(vals)),
            median: round(median(vals)),
            min: round(Math.min(...vals)),
            max: round(Math.max(...vals)),
          };
        }
        setCurrentResult({ test: "Descriptive Statistics", measure: measureLabels[measureKey] || measureKey, ...results });
        break;
      }
      case "t_test": {
        const a = getValues(group1);
        const b = getValues(group2);
        if (a.length < 2 || b.length < 2) {
          toast.error("Each group needs at least 2 values");
          return;
        }
        const result = welchTTest(a, b);
        setCurrentResult({
          test: "Welch's t-test (two-tailed)",
          measure: measureLabels[measureKey] || measureKey,
          groups_compared: `${group1} vs ${group2}`,
          ...result,
          significant_005: result.p < 0.05,
          significant_001: result.p < 0.01,
          group1_stats: { name: group1, n: a.length, mean: round(mean(a)), sd: round(stdDev(a)), sem: round(sem(a)) },
          group2_stats: { name: group2, n: b.length, mean: round(mean(b)), sd: round(stdDev(b)), sem: round(sem(b)) },
        });
        break;
      }
      case "anova": {
        const allGroups = groups.map((g) => getValues(g)).filter((g) => g.length >= 2);
        if (allGroups.length < 2) {
          toast.error("Need at least 2 groups with ≥ 2 values each");
          return;
        }
        const result = oneWayAnova(allGroups);
        const groupStats = groups.map((g) => {
          const vals = getValues(g);
          return { group: g, n: vals.length, mean: round(mean(vals)), sd: round(stdDev(vals)) };
        }).filter((g) => g.n > 0);

        setCurrentResult({
          test: "One-way ANOVA",
          measure: measureLabels[measureKey] || measureKey,
          ...result,
          significant_005: result.p < 0.05,
          significant_001: result.p < 0.01,
          group_stats: groupStats,
        });
        break;
      }
      case "multi_compare": {
        const comparisons: { comparison: string; t: number; p: number; cohenD: number; significant: boolean }[] = [];
        for (let i = 0; i < groups.length; i++) {
          for (let j = i + 1; j < groups.length; j++) {
            const a = getValues(groups[i]);
            const b = getValues(groups[j]);
            if (a.length < 2 || b.length < 2) continue;
            const result = welchTTest(a, b);
            comparisons.push({
              comparison: `${groups[i]} vs ${groups[j]}`,
              t: result.t,
              p: result.p,
              cohenD: result.cohenD,
              significant: result.p < 0.05,
            });
          }
        }
        // Bonferroni correction
        const nComparisons = comparisons.length;
        const corrected = comparisons.map((c) => ({
          ...c,
          p_bonferroni: round(Math.min(c.p * nComparisons, 1), 6),
          significant_bonferroni: c.p * nComparisons < 0.05,
        }));

        setCurrentResult({
          test: "All Pairwise Comparisons (Welch's t-test with Bonferroni correction)",
          measure: measureLabels[measureKey] || measureKey,
          n_comparisons: nComparisons,
          comparisons: corrected,
        });
        break;
      }
    }
  }, [testType, measureKey, group1, group2, groups, flatData, measureLabels]);

  const handleCopyResults = useCallback(() => {
    if (!currentResult) return;
    navigator.clipboard.writeText(JSON.stringify(currentResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentResult]);

  const needsGroups = testType === "t_test";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Label className="text-xs mb-1 block">Statistical Test</Label>
              <Select value={testType} onValueChange={(v) => { setTestType(v); setCurrentResult(null); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Measure</Label>
              <Select value={measureKey} onValueChange={setMeasureKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select measure" />
                </SelectTrigger>
                <SelectContent>
                  {numericKeys.map((k) => (
                    <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsGroups && (
              <>
                <div>
                  <Label className="text-xs mb-1 block">Group 1</Label>
                  <Select value={group1} onValueChange={setGroup1}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Group 2</Label>
                  <Select value={group2} onValueChange={setGroup2}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.filter((g) => g !== group1).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <Button onClick={runTest} disabled={!measureKey} className="gap-1.5">
            <FlaskConical className="h-4 w-4" /> Run Analysis
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {currentResult && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                {String(currentResult.test)}
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={handleCopyResults}>
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <StatResultsDisplay result={currentResult} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Stat Results Display ───────────────────────────────────────────────────

function StatResultsDisplay({ result }: { result: Record<string, unknown> }) {
  const pValue = result.p as number | undefined;
  const isSignificant = pValue !== undefined && pValue < 0.05;
  const comparisons = result.comparisons as Array<Record<string, unknown>> | undefined;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">Measure:</span> {String(result.measure)}
      </div>

      {pValue !== undefined && (
        <div
          className={`rounded-lg px-4 py-3 text-center font-medium text-sm ${
            isSignificant
              ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-900"
              : "bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border"
          }`}
        >
          {isSignificant
            ? `Statistically significant (p = ${pValue < 0.001 ? "< 0.001" : pValue.toFixed(4)})`
            : `Not statistically significant (p = ${pValue.toFixed(4)})`}
        </div>
      )}

      {/* Key stats cards */}
      {comparisons == null && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.entries(result)
            .filter(([k]) => !["test", "measure", "group_stats", "group1_stats", "group2_stats", "comparisons", "significant_005", "significant_001", "groups_compared"].includes(k) && typeof result[k] !== "object")
            .map(([key, value]) => (
              <div key={key} className="rounded-md border px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{key.replace(/_/g, " ")}</div>
                <div className="text-sm font-medium mt-0.5 tabular-nums">
                  {typeof value === "number" ? (key.includes("p") ? (value < 0.001 ? "< 0.001" : value.toFixed(4)) : value.toFixed(4)) : String(value)}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Group stats */}
      {(result.group1_stats != null || result.group_stats != null) && (
        <div className="text-xs">
          <span className="font-medium">Group Statistics:</span>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 px-2 font-medium text-muted-foreground">Group</th>
                  <th className="text-right py-1 px-2 font-medium text-muted-foreground">N</th>
                  <th className="text-right py-1 px-2 font-medium text-muted-foreground">Mean</th>
                  <th className="text-right py-1 px-2 font-medium text-muted-foreground">SD</th>
                  {(result.group1_stats as Record<string, unknown>)?.sem !== undefined && (
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">SEM</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.group_stats
                  ? (result.group_stats as Array<Record<string, unknown>>).map((g, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 px-2 font-medium" style={{ color: GROUP_COLORS[g.group as string] }}>{String(g.group)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{String(g.n)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(g.mean as number)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(g.sd as number)}</td>
                      </tr>
                    ))
                  : [result.group1_stats, result.group2_stats].filter(Boolean).map((g, i) => {
                      const gs = g as Record<string, unknown>;
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 px-2 font-medium" style={{ color: GROUP_COLORS[gs.name as string] }}>{String(gs.name)}</td>
                          <td className="text-right py-1 px-2 tabular-nums">{String(gs.n)}</td>
                          <td className="text-right py-1 px-2 tabular-nums">{formatNum(gs.mean as number)}</td>
                          <td className="text-right py-1 px-2 tabular-nums">{formatNum(gs.sd as number)}</td>
                          {gs.sem !== undefined && (
                            <td className="text-right py-1 px-2 tabular-nums">{formatNum(gs.sem as number)}</td>
                          )}
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Descriptive stats (per-group objects) */}
      {!result.group_stats && !result.group1_stats && !comparisons && (
        (() => {
          const groupKeys = Object.keys(result).filter(
            (k) => typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k]) && k !== "test" && k !== "measure"
          );
          if (groupKeys.length === 0) return null;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Group</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">N</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">Mean</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">SD</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">SEM</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">Median</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">Min</th>
                    <th className="text-right py-1 px-2 font-medium text-muted-foreground">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {groupKeys.map((g) => {
                    const s = result[g] as Record<string, number>;
                    return (
                      <tr key={g} className="border-b last:border-0">
                        <td className="py-1 px-2 font-medium" style={{ color: GROUP_COLORS[g] }}>{g}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{s.n}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(s.mean)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(s.sd)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(s.sem)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(s.median)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(s.min)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{formatNum(s.max)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()
      )}

      {/* Multi-comparison table */}
      {comparisons && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Comparison</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">t</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">p</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">p (Bonferroni)</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Cohen&apos;s d</th>
                <th className="text-center py-1.5 px-2 font-medium text-muted-foreground">Sig.</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c, i) => (
                <tr key={i} className={`border-b last:border-0 ${c.significant_bonferroni ? "bg-green-50/50 dark:bg-green-950/10" : ""}`}>
                  <td className="py-1.5 px-2 font-medium">{String(c.comparison)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(c.t as number, 3)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{(c.p as number) < 0.001 ? "< .001" : (c.p as number).toFixed(4)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{(c.p_bonferroni as number) < 0.001 ? "< .001" : (c.p_bonferroni as number).toFixed(4)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{formatNum(c.cohenD as number, 3)}</td>
                  <td className="text-center py-1.5 px-2">
                    {c.significant_bonferroni ? (
                      <Badge className="bg-green-600 text-[10px]">*</Badge>
                    ) : c.significant ? (
                      <Badge variant="secondary" className="text-[10px]">(*)</Badge>
                    ) : (
                      <span className="text-muted-foreground">ns</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-2 px-2">
            * = significant after Bonferroni correction (α = 0.05/{String(result.n_comparisons)}); (*) = uncorrected only; ns = not significant
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Visualization Panel ────────────────────────────────────────────────────

function VisualizationPanel({
  flatData,
  numericKeys,
  measureLabels,
  groups,
}: {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels: Record<string, string>;
  groups: string[];
}) {
  const [chartType, setChartType] = useState("bar_sem");
  const [measureKey, setMeasureKey] = useState(numericKeys[0] || "");
  const [measureKey2, setMeasureKey2] = useState(numericKeys[1] || "");
  const [groupBy, setGroupBy] = useState<"group" | "sex" | "genotype" | "cohort">("group");
  const [title, setTitle] = useState("");
  const [showPoints, setShowPoints] = useState(true);
  const plotRef = useRef<HTMLDivElement>(null);

  // Significance annotations
  type SigAnnotation = { group1: string; group2: string; label: string };
  const SIG_LABELS = ["ns", "*", "**", "***", "****"];
  const [sigAnnotations, setSigAnnotations] = useState<SigAnnotation[]>([]);
  const [pendingGroup1, setPendingGroup1] = useState("");
  const [pendingGroup2, setPendingGroup2] = useState("");
  const [pendingLabel, setPendingLabel] = useState("*");

  const CHART_OPTIONS = [
    { value: "bar_sem", label: "Bar + SEM" },
    { value: "bar_sd", label: "Bar + SD" },
    { value: "box", label: "Box Plot" },
    { value: "violin", label: "Violin Plot" },
    { value: "scatter", label: "Scatter (2 measures)" },
    { value: "dot_plot", label: "Dot Plot" },
    { value: "timepoint_line", label: "Timepoints (line)" },
  ];

  const plotData = useMemo(() => {
    if (!measureKey) return null;

    const measureLabel = measureLabels[measureKey] || measureKey;
    const chartTitle = title || measureLabel;

    // Get grouping key values
    const getGrouping = (row: FlatRow): string => {
      switch (groupBy) {
        case "sex": return row.sex;
        case "genotype": return row.genotype;
        case "cohort": return row.cohort;
        default: return row.group;
      }
    };

    const groupLabels = groupBy === "group"
      ? groups
      : Array.from(new Set(flatData.map(getGrouping))).sort();

    switch (chartType) {
      case "bar_sem":
      case "bar_sd": {
        const useSEM = chartType === "bar_sem";
        const means: number[] = [];
        const errors: number[] = [];
        const colors: string[] = [];

        for (const g of groupLabels) {
          const values = flatData
            .filter((r) => getGrouping(r) === g)
            .map((r) => Number(r[measureKey]))
            .filter((v) => !isNaN(v));
          means.push(mean(values));
          errors.push(useSEM ? sem(values) : stdDev(values));
          colors.push(GROUP_COLORS[g] || CHART_COLORS[groupLabels.indexOf(g) % CHART_COLORS.length]);
        }

        const traces: Plotly.Data[] = [{
          x: groupLabels,
          y: means,
          type: "bar",
          marker: { color: colors, opacity: 0.85 },
          error_y: {
            type: "data",
            array: errors,
            visible: true,
            thickness: 2,
            width: 6,
          },
          name: measureLabel,
        }];

        // Overlay individual data points
        if (showPoints) {
          for (let i = 0; i < groupLabels.length; i++) {
            const g = groupLabels[i];
            const values = flatData
              .filter((r) => getGrouping(r) === g)
              .map((r) => Number(r[measureKey]))
              .filter((v) => !isNaN(v));
            traces.push({
              x: values.map(() => g),
              y: values,
              type: "scatter",
              mode: "markers",
              marker: {
                color: colors[i],
                size: 7,
                opacity: 0.6,
                line: { color: "white", width: 1 },
              },
              showlegend: false,
              name: g,
            });
          }
        }

        return {
          data: traces,
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            xaxis: { title: { text: "" } },
            yaxis: { title: { text: measureLabel }, rangemode: "tozero" as const },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: false,
            bargap: 0.3,
          },
        };
      }

      case "box":
      case "violin": {
        const traces = groupLabels.map((g, i) => {
          const values = flatData
            .filter((r) => getGrouping(r) === g)
            .map((r) => Number(r[measureKey]))
            .filter((v) => !isNaN(v));
          return {
            y: values,
            x: values.map(() => g),
            name: g,
            type: chartType as "box" | "violin",
            marker: { color: GROUP_COLORS[g] || CHART_COLORS[i % CHART_COLORS.length] },
            ...(chartType === "box" ? { boxpoints: showPoints ? ("all" as const) : ("outliers" as const), jitter: 0.3, pointpos: -1.8 } : {}),
            ...(chartType === "violin" ? { points: showPoints ? ("all" as const) : (false as const), jitter: 0.3 } : {}),
          };
        });

        return {
          data: traces as Plotly.Data[],
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            yaxis: { title: { text: measureLabel } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: false,
          },
        };
      }

      case "scatter": {
        if (!measureKey2) return null;
        const measureLabel2 = measureLabels[measureKey2] || measureKey2;
        const traces = groupLabels.map((g, i) => {
          const rows = flatData.filter((r) => getGrouping(r) === g);
          return {
            x: rows.map((r) => Number(r[measureKey])).filter((v) => !isNaN(v)),
            y: rows.map((r) => Number(r[measureKey2])).filter((v) => !isNaN(v)),
            type: "scatter" as const,
            mode: "markers" as const,
            name: g,
            marker: {
              color: GROUP_COLORS[g] || CHART_COLORS[i % CHART_COLORS.length],
              size: 10,
              opacity: 0.8,
            },
          };
        });

        return {
          data: traces as Plotly.Data[],
          layout: {
            title: { text: title || `${measureLabel} vs ${measureLabel2}`, font: { size: 16 } },
            xaxis: { title: { text: measureLabel } },
            yaxis: { title: { text: measureLabel2 } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: true,
          },
        };
      }

      case "dot_plot": {
        const traces = groupLabels.map((g, i) => {
          const values = flatData
            .filter((r) => getGrouping(r) === g)
            .map((r) => Number(r[measureKey]))
            .filter((v) => !isNaN(v));
          const m = mean(values);
          const s = sem(values);

          return [
            // Data points
            {
              x: values.map(() => g),
              y: values,
              type: "scatter" as const,
              mode: "markers" as const,
              marker: {
                color: GROUP_COLORS[g] || CHART_COLORS[i % CHART_COLORS.length],
                size: 9,
                opacity: 0.7,
              },
              showlegend: false,
              name: g,
            },
            // Mean ± SEM
            {
              x: [g],
              y: [m],
              type: "scatter" as const,
              mode: "markers" as const,
              error_y: { type: "data" as const, array: [s], visible: true, thickness: 3, width: 12 },
              marker: { color: "black", size: 0, symbol: "line-ew" as const },
              showlegend: false,
              name: `${g} mean`,
            },
          ];
        }).flat();

        return {
          data: traces as Plotly.Data[],
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            yaxis: { title: { text: measureLabel } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
          },
        };
      }

      case "timepoint_line": {
        const tps = Array.from(new Set(flatData.map((r) => r.timepoint))).sort((a, b) => a - b);
        if (tps.length < 2) return null;

        const traces = groupLabels.map((g, i) => {
          const means: number[] = [];
          const sems: number[] = [];
          for (const tp of tps) {
            const values = flatData
              .filter((r) => getGrouping(r) === g && r.timepoint === tp)
              .map((r) => Number(r[measureKey]))
              .filter((v) => !isNaN(v));
            means.push(mean(values));
            sems.push(sem(values));
          }
          return {
            x: tps.map((tp) => `${tp}d`),
            y: means,
            error_y: { type: "data" as const, array: sems, visible: true },
            type: "scatter" as const,
            mode: "lines+markers" as const,
            name: g,
            marker: { color: GROUP_COLORS[g] || CHART_COLORS[i % CHART_COLORS.length], size: 8 },
            line: { color: GROUP_COLORS[g] || CHART_COLORS[i % CHART_COLORS.length], width: 2 },
          };
        });

        return {
          data: traces as Plotly.Data[],
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            xaxis: { title: { text: "Timepoint (days)" } },
            yaxis: { title: { text: measureLabel } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: true,
          },
        };
      }

      default:
        return null;
    }
  }, [chartType, measureKey, measureKey2, groupBy, flatData, groups, measureLabels, title, showPoints]);

  // Build Plotly shapes + annotations for significance brackets
  const sigShapesAndAnnotations = useMemo(() => {
    if (!plotData || sigAnnotations.length === 0) return { shapes: [], annotations: [] };
    if (chartType === "scatter" || chartType === "timepoint_line") return { shapes: [], annotations: [] };

    const getGrouping = (row: FlatRow): string => {
      switch (groupBy) {
        case "sex": return row.sex;
        case "genotype": return row.genotype;
        case "cohort": return row.cohort;
        default: return row.group;
      }
    };

    const groupLabels = groupBy === "group"
      ? groups
      : Array.from(new Set(flatData.map(getGrouping))).sort();

    // Compute max Y per group for bracket positioning
    const groupMaxY: Record<string, number> = {};
    for (const g of groupLabels) {
      const values = flatData
        .filter((r) => getGrouping(r) === g)
        .map((r) => Number(r[measureKey]))
        .filter((v) => !isNaN(v));
      const m = mean(values);
      const s = (chartType === "bar_sem" ? sem(values) : chartType === "bar_sd" ? stdDev(values) : 0);
      groupMaxY[g] = Math.max(m + s, ...values);
    }

    const overallMax = Math.max(...Object.values(groupMaxY), 0);
    const step = overallMax * 0.08; // spacing between stacked brackets

    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];

    // Sort annotations by the span width (narrow first) to stack properly
    const sorted = [...sigAnnotations].sort((a, b) => {
      const spanA = Math.abs(groupLabels.indexOf(a.group2) - groupLabels.indexOf(a.group1));
      const spanB = Math.abs(groupLabels.indexOf(b.group2) - groupLabels.indexOf(b.group1));
      return spanA - spanB;
    });

    let currentY = overallMax + step;

    for (const ann of sorted) {
      const idx1 = groupLabels.indexOf(ann.group1);
      const idx2 = groupLabels.indexOf(ann.group2);
      if (idx1 < 0 || idx2 < 0) continue;

      const x0 = Math.min(idx1, idx2);
      const x1 = Math.max(idx1, idx2);
      const bracketY = currentY;
      const tickDown = step * 0.3;

      // Left vertical tick
      shapes.push({
        type: "line",
        x0: groupLabels[x0], x1: groupLabels[x0],
        y0: bracketY - tickDown, y1: bracketY,
        xref: "x", yref: "y",
        line: { color: "black", width: 1.5 },
      });
      // Horizontal bar
      shapes.push({
        type: "line",
        x0: groupLabels[x0], x1: groupLabels[x1],
        y0: bracketY, y1: bracketY,
        xref: "x", yref: "y",
        line: { color: "black", width: 1.5 },
      });
      // Right vertical tick
      shapes.push({
        type: "line",
        x0: groupLabels[x1], x1: groupLabels[x1],
        y0: bracketY - tickDown, y1: bracketY,
        xref: "x", yref: "y",
        line: { color: "black", width: 1.5 },
      });

      // Label
      const midIdx = (x0 + x1) / 2;
      annotations.push({
        x: groupLabels[Math.round(midIdx)] || groupLabels[x0],
        y: bracketY + step * 0.15,
        xref: "x",
        yref: "y",
        text: ann.label === "ns" ? "<i>ns</i>" : ann.label,
        showarrow: false,
        font: { size: ann.label === "ns" ? 11 : 14, color: "black" },
        xanchor: "center",
        yanchor: "bottom",
      });

      currentY += step;
    }

    return { shapes, annotations };
  }, [plotData, sigAnnotations, chartType, groupBy, flatData, groups, measureKey]);

  const handleExport = useCallback(
    async (format: "svg" | "png") => {
      const plotlyModule = await import("plotly.js-dist-min");
      const Plotly = plotlyModule.default || plotlyModule;
      const gd = plotRef.current?.querySelector(".js-plotly-plot") as HTMLElement | null;
      if (!gd) return;
      await Plotly.downloadImage(gd, {
        format,
        width: 1200,
        height: 800,
        filename: title || "colony-analysis",
      });
    },
    [title]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-2">
              <Label className="text-xs mb-1 block">Chart Type</Label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={`min-w-0 ${chartType === "scatter" ? "lg:col-span-3" : "lg:col-span-4"}`}>
              <Label className="text-xs mb-1 block">
                {chartType === "scatter" ? "X Measure" : "Measure"}
              </Label>
              <Select value={measureKey} onValueChange={setMeasureKey}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {numericKeys.map((k) => (
                    <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {chartType === "scatter" && (
              <div className="min-w-0 lg:col-span-3">
                <Label className="text-xs mb-1 block">Y Measure</Label>
                <Select value={measureKey2} onValueChange={setMeasureKey2}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericKeys.filter((k) => k !== measureKey).map((k) => (
                      <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={`min-w-0 ${chartType === "scatter" ? "lg:col-span-2" : "lg:col-span-3"}`}>
              <Label className="text-xs mb-1 block">Group By</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Genotype × Sex</SelectItem>
                  <SelectItem value="genotype">Genotype only</SelectItem>
                  <SelectItem value="sex">Sex only</SelectItem>
                  <SelectItem value="cohort">Cohort</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={`min-w-0 ${chartType === "scatter" ? "lg:col-span-2" : "lg:col-span-3"}`}>
              <Label className="text-xs mb-1 block">Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-generated"
                className="w-full min-w-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(e) => setShowPoints(e.target.checked)}
                className="rounded h-3.5 w-3.5"
              />
              Show individual data points
            </label>
          </div>

          {/* ─── Significance Annotations ─────────────── */}
          {chartType !== "scatter" && chartType !== "timepoint_line" && (
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs font-medium">Significance Annotations</Label>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground block mb-0.5">Group 1</Label>
                  <Select value={pendingGroup1} onValueChange={setPendingGroup1}>
                    <SelectTrigger className="h-8 text-xs w-[140px]">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      {(groupBy === "group" ? groups : Array.from(new Set(flatData.map((r) => {
                        switch (groupBy) {
                          case "sex": return r.sex;
                          case "genotype": return r.genotype;
                          case "cohort": return r.cohort;
                          default: return r.group;
                        }
                      }))).sort()).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground block mb-0.5">Group 2</Label>
                  <Select value={pendingGroup2} onValueChange={setPendingGroup2}>
                    <SelectTrigger className="h-8 text-xs w-[140px]">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      {(groupBy === "group" ? groups : Array.from(new Set(flatData.map((r) => {
                        switch (groupBy) {
                          case "sex": return r.sex;
                          case "genotype": return r.genotype;
                          case "cohort": return r.cohort;
                          default: return r.group;
                        }
                      }))).sort()).filter((g) => g !== pendingGroup1).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground block mb-0.5">Significance</Label>
                  <Select value={pendingLabel} onValueChange={setPendingLabel}>
                    <SelectTrigger className="h-8 text-xs w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIG_LABELS.map((l) => (
                        <SelectItem key={l} value={l}>{l === "ns" ? "ns" : l} {l === "ns" ? "(p≥0.05)" : l === "*" ? "(p<0.05)" : l === "**" ? "(p<0.01)" : l === "***" ? "(p<0.001)" : "(p<0.0001)"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!pendingGroup1 || !pendingGroup2 || pendingGroup1 === pendingGroup2}
                  onClick={() => {
                    setSigAnnotations((prev) => [
                      ...prev,
                      { group1: pendingGroup1, group2: pendingGroup2, label: pendingLabel },
                    ]);
                    setPendingGroup1("");
                    setPendingGroup2("");
                  }}
                >
                  + Add
                </Button>
              </div>

              {sigAnnotations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {sigAnnotations.map((ann, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-xs gap-1 pl-2 pr-1 py-0.5 cursor-pointer hover:bg-destructive/10"
                      onClick={() => setSigAnnotations((prev) => prev.filter((_, j) => j !== i))}
                    >
                      {ann.group1} vs {ann.group2}: <strong>{ann.label}</strong>
                      <span className="text-muted-foreground hover:text-destructive ml-0.5">✕</span>
                    </Badge>
                  ))}
                  {sigAnnotations.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] text-muted-foreground px-1.5"
                      onClick={() => setSigAnnotations([])}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {plotData && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Preview</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => handleExport("svg")}>
                  <Download className="h-3 w-3" /> SVG
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => handleExport("png")}>
                  <Download className="h-3 w-3" /> PNG
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={plotRef}>
              <Plot
                data={plotData.data}
                layout={{
                  ...plotData.layout,
                  autosize: true,
                  margin: { l: 70, r: 30, t: sigAnnotations.length > 0 ? 80 + sigAnnotations.length * 20 : 60, b: 60 },
                  shapes: [
                    ...((plotData.layout as Record<string, unknown>).shapes as Partial<Plotly.Shape>[] || []),
                    ...sigShapesAndAnnotations.shapes,
                  ],
                  annotations: [
                    ...((plotData.layout as Record<string, unknown>).annotations as Partial<Plotly.Annotations>[] || []),
                    ...sigShapesAndAnnotations.annotations,
                  ],
                } as Partial<Plotly.Layout>}
                config={{
                  responsive: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ["lasso2d", "select2d"],
                  toImageButtonOptions: {
                    format: "svg",
                    filename: title || "colony-analysis",
                  },
                }}
                useResizeHandler
                style={{ width: "100%", height: 500 }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {chartType === "timepoint_line" && !plotData && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Info className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            Need data from at least 2 timepoints for a line chart. Select &quot;All Timepoints&quot; in the filter above.
          </p>
        </div>
      )}
    </div>
  );
}
