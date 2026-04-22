"use client";

import { Component, type ErrorInfo, type ReactNode, useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Papa from "papaparse";
import {
  BarChart3,
  FlaskConical,
  Download,
  Table as TableIcon,
  Filter,
  TrendingUp,
  Info,
  Save,
  FolderOpen,
  Trash2,
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
import { toast } from "sonner";
import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import type { Animal, Cohort, ColonyResult, ExperimentRun, RunAssignment, RunTimepoint, RunTimepointExperiment, Dataset, Analysis } from "@/types";
import type {
  AnalysisAnimalRow,
  AnalysisAuditSource,
  AnalysisFactor,
  AnalysisReportPayload,
  AnalysisSetEntry,
  AnalysisSuggestion,
  AssumptionCheck,
  ColonyAnalysisStatsDraft,
  ColonyAnalysisVisualizationDraft,
  FigureStudioDraft,
  FlatRow,
  GroupStats,
  ModelKind,
  OutlierMethod,
  OutlierMode,
  PowerBaseTest,
  PowerConfig,
  PowerContrastSelection,
  PowerObjective,
  RevisionDiffSummary,
  SavedColonyAnalysisRevision,
  SavedColonyAnalysisRoot,
  VisualizationChartType,
} from "@/lib/colony-analysis/types";
import {
  buildRevisionConfigEnvelope,
  buildRevisionResultsEnvelope,
  COLONY_ANALYSIS_SCHEMA_VERSION,
  defaultPowerConfig,
  defaultStatsDraft,
  defaultFigureStudioDraft,
  defaultVisualizationDraft,
  normalizeAnalysisSetEntry,
  normalizeSavedRevisionEnvelope,
  normalizeSavedResult,
  normalizeStatsDraft,
  normalizeFigureStudioDraft,
  normalizeVisualizationDraft,
} from "@/lib/colony-analysis/config";
import {
  chooseSuggestedPowerBaseTest,
  derivePowerPlannerContext,
  getPowerObjectiveOptions,
  getPowerTargetOptions,
  inferPowerBaseTest,
  runPowerAnalysis,
} from "@/lib/colony-analysis/power";
import {
  buildFigurePacket,
  buildStructuredResultTables,
  generateAnalysisReport,
  renderAnalysisReportMarkdown,
  summarizeAnalysisResult,
} from "@/lib/colony-analysis/reporting";
import {
  annotationDraftsToPlotly,
  deriveSignificanceAnnotationsFromResult,
  deriveVisualizationDraftFromResult,
  getAxisLayout,
  getEffectiveSigAnnotations,
  getLegendLayout,
} from "@/lib/colony-analysis/visualization";
import {
  applyDerivedMeasures,
  DERIVED_MEASURE_KEYS_BY_EXPERIMENT,
  DERIVED_MEASURE_LABELS,
} from "@/lib/derived-measures";

// Dynamically import Plotly
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Deterministic pseudo-random offset in [-amplitude, +amplitude] keyed off a
// stable seed string. Used to jitter individual data points on bar/dot
// charts so overlapping values don't stack on top of each other, while
// keeping the exact same layout across renders (no flicker when the user
// changes an unrelated setting — same animal always lands in the same spot).
function deterministicJitter(seed: string, amplitude: number): number {
  if (amplitude <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  // Map integer hash to [-1, 1]
  const normalized = (((h % 10000) + 10000) % 10000) / 10000 * 2 - 1;
  return normalized * amplitude;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Overnight Nesting",
  social_interaction: "Social Interaction",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Habituation",
  rotarod_test1: "Rotarod Test 1",
  rotarod_test2: "Rotarod Test 2",
  rotarod: "Rotarod Testing",
  stamina: "Stamina Test",
  blood_draw: "Plasma Collection",
  eeg_recording: "EEG Recording",
};

const GROUP_COLORS: Record<string, string> = {
  "Hemi Male": "#c2410c",
  "WT Male": "#0f766e",
  "Het Female": "#b45309",
  "WT Female": "#7c3aed",
};

const GROUP_ORDER = ["Hemi Male", "WT Male", "Het Female", "WT Female"];
const GROUP_SURFACE_CLASSES: Record<string, string> = {
  "Hemi Male": "border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 text-orange-900",
  "WT Male": "border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-900",
  "Het Female": "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900",
  "WT Female": "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 text-violet-900",
};

const CHART_COLORS = [
  "#0f766e", "#c2410c", "#7c3aed", "#b45309",
  "#2563eb", "#059669", "#dc2626", "#4f46e5",
];

const CHART_OPTIONS: Array<{ value: VisualizationChartType; label: string }> = [
  { value: "bar_sem", label: "Bar + SEM" },
  { value: "bar_sd", label: "Bar + SD" },
  { value: "box", label: "Box Plot" },
  { value: "violin", label: "Violin Plot" },
  { value: "scatter", label: "Scatter (2 measures)" },
  { value: "dot_plot", label: "Dot Plot" },
  { value: "timepoint_line", label: "Timepoints (line)" },
  { value: "paired_slope", label: "Paired Slope" },
  { value: "survival_curve", label: "Survival Curve" },
  { value: "roc_curve", label: "ROC Curve" },
  { value: "regression_fit", label: "Regression Fit" },
];

const CHART_COMPATIBILITY_MAP: Record<string, VisualizationChartType[]> = {
  survival: ["survival_curve"],
  roc: ["roc_curve"],
  regression: ["regression_fit", "scatter"],
  posthoc: ["bar_sem", "bar_sd", "box", "violin", "dot_plot"],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeOptionValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function uniqueNonEmptyOptions(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeOptionValue)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function getPowerContrastSelectionKey(selection: PowerContrastSelection | null | undefined): string {
  const group1 = normalizeOptionValue(selection?.group1) || "__none__";
  const group2 = normalizeOptionValue(selection?.group2) || "__none__";
  return `${group1}__${group2}`;
}

function samePowerContrastSelection(
  a: PowerContrastSelection | null | undefined,
  b: PowerContrastSelection | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return getPowerContrastSelectionKey(a) === getPowerContrastSelectionKey(b);
}

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

/** Mann-Whitney U test (two-tailed normal approximation) */
function mannWhitneyUTest(a: number[], b: number[]): { u: number; z: number; p: number } {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { u: 0, z: 0, p: 1 };

  const pooled = [
    ...a.map((v) => ({ v, g: 1 as const })),
    ...b.map((v) => ({ v, g: 2 as const })),
  ].sort((x, y) => x.v - y.v);

  const ranks = new Array<number>(pooled.length).fill(0);
  let i = 0;
  while (i < pooled.length) {
    let j = i;
    while (j + 1 < pooled.length && pooled[j + 1].v === pooled[i].v) j++;
    const avgRank = (i + j + 2) / 2; // 1-based rank average
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }

  let r1 = 0;
  for (let idx = 0; idx < pooled.length; idx++) {
    if (pooled[idx].g === 1) r1 += ranks[idx];
  }

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) return { u: round(u), z: 0, p: 1 };

  const cc = u > mu ? -0.5 : 0.5; // continuity correction
  const z = (u - mu + cc) / sigma;
  const p = 2 * (1 - approxNormCDF(Math.abs(z)));
  return { u: round(u), z: round(z), p: round(p, 6) };
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

function approxNormInv(probability: number): number {
  const p = Math.min(Math.max(probability, 1e-12), 1 - 1e-12);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
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

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-10) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }

  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

function approxChiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(df / 2, x / 2);
}

function kruskalWallisTest(groups: number[][]): { H: number; df: number; p: number; epsilonSq: number } {
  const validGroups = groups.filter((group) => group.length > 0);
  const k = validGroups.length;
  const pooled = validGroups.flat();
  const N = pooled.length;
  if (k < 2 || N === 0) return { H: 0, df: Math.max(0, k - 1), p: 1, epsilonSq: 0 };

  const ranked = validGroups
    .flatMap((group, groupIndex) => group.map((value) => ({ value, groupIndex })))
    .sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(ranked.length).fill(0);
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].value === ranked[i].value) j++;
    const avgRank = (i + j + 2) / 2;
    for (let kIndex = i; kIndex <= j; kIndex++) ranks[kIndex] = avgRank;
    i = j + 1;
  }

  const rankSums = new Array<number>(k).fill(0);
  const counts = new Array<number>(k).fill(0);
  ranked.forEach((entry, index) => {
    rankSums[entry.groupIndex] += ranks[index];
    counts[entry.groupIndex] += 1;
  });

  let h = 0;
  for (let groupIndex = 0; groupIndex < k; groupIndex++) {
    if (counts[groupIndex] === 0) continue;
    h += (rankSums[groupIndex] ** 2) / counts[groupIndex];
  }
  h = (12 / (N * (N + 1))) * h - 3 * (N + 1);

  const df = k - 1;
  const p = 1 - approxChiSquareCDF(h, df);
  const epsilonSq = df > 0 ? Math.max(0, (h - df) / Math.max(N - df, 1)) : 0;
  return { H: round(h), df, p: round(p, 6), epsilonSq: round(epsilonSq) };
}

function rankWithTies(values: number[]): number[] {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < ordered.length) {
    let j = i;
    while (j + 1 < ordered.length && ordered[j + 1].value === ordered[i].value) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[ordered[k].index] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function pearsonCorrelation(x: number[], y: number[]): { r: number; t: number; df: number; p: number; r2: number } {
  if (x.length !== y.length || x.length < 3) return { r: 0, t: 0, df: 0, p: 1, r2: 0 };
  const mx = mean(x);
  const my = mean(y);
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return { r: 0, t: 0, df: x.length - 2, p: 1, r2: 0 };
  const r = numerator / Math.sqrt(dx2 * dy2);
  const df = x.length - 2;
  const t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r));
  const p = 1 - approxFCDF(t * t, 1, df);
  return { r: round(r), t: round(t), df, p: round(p, 6), r2: round(r * r) };
}

function spearmanCorrelation(x: number[], y: number[]): { rho: number; t: number; df: number; p: number; r2: number } {
  if (x.length !== y.length || x.length < 3) return { rho: 0, t: 0, df: 0, p: 1, r2: 0 };
  const rx = rankWithTies(x);
  const ry = rankWithTies(y);
  const pearson = pearsonCorrelation(rx, ry);
  return {
    rho: pearson.r,
    t: pearson.t,
    df: pearson.df,
    p: pearson.p,
    r2: pearson.r2,
  };
}

function pairedTTest(a: number[], b: number[]): { t: number; df: number; p: number; cohenDz: number } {
  if (a.length !== b.length || a.length < 2) return { t: 0, df: Math.max(0, a.length - 1), p: 1, cohenDz: 0 };
  const diffs = a.map((value, index) => value - b[index]);
  const meanDiff = mean(diffs);
  const sdDiff = stdDev(diffs);
  const seDiff = sdDiff / Math.sqrt(diffs.length);
  if (!Number.isFinite(seDiff) || seDiff === 0) return { t: 0, df: diffs.length - 1, p: 1, cohenDz: 0 };
  const t = meanDiff / seDiff;
  const df = diffs.length - 1;
  const p = 1 - approxFCDF(t * t, 1, df);
  return { t: round(t), df, p: round(p, 6), cohenDz: round(sdDiff === 0 ? 0 : meanDiff / sdDiff) };
}

function skewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return 0;
  const numerator = values.reduce((sum, value) => sum + ((value - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * numerator;
}

function excessKurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return 0;
  const numerator = values.reduce((sum, value) => sum + ((value - m) / s) ** 4, 0);
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * numerator -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  );
}

function normalityScreen(label: string, values: number[]): AssumptionCheck {
  if (values.length < 4) {
    return {
      name: `Normality (${label})`,
      status: "info",
      message: "Too few values for a meaningful normality screen.",
    };
  }
  const s = skewness(values);
  const k = excessKurtosis(values);
  const jb = (values.length / 6) * (s ** 2 + (k ** 2) / 4);
  const p = 1 - approxChiSquareCDF(jb, 2);
  return {
    name: `Normality (${label})`,
    status: p < 0.05 ? "warn" : "pass",
    message:
      p < 0.05
        ? `Jarque-Bera screen suggests non-normality (p = ${p < 0.001 ? "< 0.001" : p.toFixed(4)}).`
        : `Jarque-Bera screen did not flag a strong normality issue (p = ${p.toFixed(4)}).`,
    statistic: round(jb),
    p: round(p, 6),
  };
}

function brownForsytheTest(groups: Array<{ label: string; values: number[] }>): AssumptionCheck {
  const transformed = groups
    .map((group) => ({
      label: group.label,
      values: group.values.map((value) => Math.abs(value - median(group.values))),
    }))
    .filter((group) => group.values.length > 0);
  const result = oneWayAnova(transformed.map((group) => group.values));
  return {
    name: "Equal variance",
    status: result.p < 0.05 ? "warn" : "pass",
    message:
      result.p < 0.05
        ? `Brown-Forsythe screen suggests unequal variances (p = ${result.p < 0.001 ? "< 0.001" : result.p.toFixed(4)}).`
        : `Brown-Forsythe screen did not flag a strong variance imbalance (p = ${result.p.toFixed(4)}).`,
    statistic: result.F,
    p: result.p,
  };
}

function applyPAdjustment(pValues: number[], method: "none" | "bonferroni" | "holm" | "fdr"): number[] {
  if (method === "none") return pValues.map((value) => round(value, 6));
  if (method === "bonferroni") return pValues.map((value) => round(Math.min(value * pValues.length, 1), 6));

  const indexed = pValues.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const adjusted = new Array<number>(pValues.length).fill(1);

  if (method === "holm") {
    let runningMax = 0;
    indexed.forEach((entry, order) => {
      const candidate = Math.min(entry.value * (pValues.length - order), 1);
      runningMax = Math.max(runningMax, candidate);
      adjusted[entry.index] = round(runningMax, 6);
    });
    return adjusted;
  }

  let runningMin = 1;
  for (let i = indexed.length - 1; i >= 0; i--) {
    const rank = i + 1;
    const candidate = Math.min((indexed[i].value * pValues.length) / rank, 1);
    runningMin = Math.min(runningMin, candidate);
    adjusted[indexed[i].index] = round(runningMin, 6);
  }
  return adjusted;
}

function pairwiseGroupComparisons(
  groups: Array<{ label: string; values: number[] }>,
  options: {
    pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr";
    paired?: boolean;
    pooledVariance?: boolean;
    errorDf?: number;
  },
) {
  const rawComparisons: Array<Record<string, unknown>> = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      if (a.values.length < 2 || b.values.length < 2) continue;
      if (options.paired) {
        if (a.values.length !== b.values.length) continue;
        const paired = pairedTTest(a.values, b.values);
        rawComparisons.push({
          comparison: `${a.label} vs ${b.label}`,
          statistic_label: "t",
          statistic: paired.t,
          df: paired.df,
          p: paired.p,
          effect_label: "Cohen's dz",
          effect_size: paired.cohenDz,
        });
        continue;
      }

      if (options.pooledVariance && options.errorDf && options.errorDf > 0) {
        const pooledVariance =
          (((a.values.length - 1) * stdDev(a.values) ** 2) + ((b.values.length - 1) * stdDev(b.values) ** 2)) /
          Math.max(a.values.length + b.values.length - 2, 1);
        const se = Math.sqrt(pooledVariance * (1 / a.values.length + 1 / b.values.length));
        const t = se === 0 ? 0 : (mean(a.values) - mean(b.values)) / se;
        const p = 1 - approxFCDF(t * t, 1, options.errorDf);
        rawComparisons.push({
          comparison: `${a.label} vs ${b.label}`,
          statistic_label: "t",
          statistic: round(t),
          df: options.errorDf,
          p: round(p, 6),
          effect_label: "Mean diff",
          effect_size: round(mean(a.values) - mean(b.values)),
        });
        continue;
      }

      const result = welchTTest(a.values, b.values);
      rawComparisons.push({
        comparison: `${a.label} vs ${b.label}`,
        statistic_label: "t",
        statistic: result.t,
        df: result.df,
        p: result.p,
        effect_label: "Cohen's d",
        effect_size: result.cohenD,
      });
    }
  }

  const adjusted = applyPAdjustment(
    rawComparisons.map((comparison) => Number(comparison.p)),
    options.pAdjustMethod,
  );
  return rawComparisons.map((comparison, index) => ({
    ...comparison,
    adjusted_p: adjusted[index],
    significant: adjusted[index] < 0.05,
  }));
}

function matchedTimepointComparisons(
  subjects: Map<
    string,
    {
      identifier: string;
      between: string;
      values: Map<number, number>;
    }
  >,
  timepointPairs: Array<{ timepoint: number; label: string; index: number }>,
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr",
) {
  const rawComparisons: Array<Record<string, unknown>> = [];
  for (let i = 0; i < timepointPairs.length; i++) {
    for (let j = i + 1; j < timepointPairs.length; j++) {
      const first = timepointPairs[i];
      const second = timepointPairs[j];
      const a: number[] = [];
      const b: number[] = [];
      subjects.forEach((subject) => {
        const firstValue = subject.values.get(first.timepoint);
        const secondValue = subject.values.get(second.timepoint);
        if (firstValue == null || secondValue == null) return;
        a.push(Number(firstValue));
        b.push(Number(secondValue));
      });
      if (a.length < 2 || b.length < 2) continue;
      const result = pairedTTest(a, b);
      rawComparisons.push({
        comparison: `${first.label} vs ${second.label}`,
        group1: first.label,
        group2: second.label,
        statistic_label: "t",
        statistic: result.t,
        df: result.df,
        p: result.p,
        effect_label: "Cohen's dz",
        effect_size: result.cohenDz,
        n_pairs: a.length,
      });
    }
  }

  const adjusted = applyPAdjustment(
    rawComparisons.map((comparison) => Number(comparison.p)),
    pAdjustMethod,
  );
  return rawComparisons.map((comparison, index) => ({
    ...comparison,
    adjusted_p: adjusted[index],
    significant: adjusted[index] < 0.05,
  }));
}

function controlGroupComparisons(
  groups: Array<{ label: string; values: number[] }>,
  controlLabel: string,
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr",
) {
  const filtered = groups.filter((group) => group.values.length >= 2);
  const control = filtered.find((group) => group.label === controlLabel);
  if (!control) return [];
  const comparisonGroups = filtered.filter((group) => group.label !== controlLabel);
  if (comparisonGroups.length === 0) return [];

  let ssWithin = 0;
  let totalN = 0;
  filtered.forEach((group) => {
    const groupMean = mean(group.values);
    totalN += group.values.length;
    group.values.forEach((value) => {
      ssWithin += (value - groupMean) ** 2;
    });
  });
  const dfWithin = totalN - filtered.length;
  const mse = dfWithin > 0 ? ssWithin / dfWithin : 0;
  const pooledSd = mse > 0 ? Math.sqrt(mse) : 0;

  const rawComparisons = comparisonGroups.map((group) => {
    const meanDiff = mean(control.values) - mean(group.values);
    const se = mse > 0 ? Math.sqrt(mse * (1 / control.values.length + 1 / group.values.length)) : 0;
    const t = se === 0 ? 0 : meanDiff / se;
    const p = dfWithin > 0 ? 1 - approxFCDF(t * t, 1, dfWithin) : 1;
    return {
      comparison: `${control.label} vs ${group.label}`,
      group1: control.label,
      group2: group.label,
      statistic_label: "t",
      statistic: round(t),
      df: dfWithin,
      p: round(p, 6),
      effect_label: "Cohen's d",
      effect_size: pooledSd > 0 ? round(meanDiff / pooledSd) : 0,
      mean_difference: round(meanDiff),
    };
  });

  const adjusted = applyPAdjustment(rawComparisons.map((entry) => Number(entry.p)), pAdjustMethod);
  return rawComparisons.map((entry, index) => ({
    ...entry,
    adjusted_p: adjusted[index],
    significant: adjusted[index] < 0.05,
  }));
}

function buildLongitudinalDataset(rows: FlatRow[], measureKey: string, betweenFactor: AnalysisFactor | "__none__") {
  const subjects = new Map<
    string,
    {
      identifier: string;
      between: string;
      values: Map<number, number>;
    }
  >();
  const availableTimepoints = Array.from(
    new Set(
      rows
        .map((row) => ({ timepoint: row.timepoint, value: Number(row[measureKey]) }))
        .filter((entry) => !Number.isNaN(entry.value))
        .map((entry) => entry.timepoint),
    ),
  ).sort((a, b) => a - b);

  rows.forEach((row) => {
    const value = Number(row[measureKey]);
    if (Number.isNaN(value)) return;
    const entry = subjects.get(row.animal_id) || {
      identifier: row.identifier,
      between: betweenFactor === "__none__" ? "All animals" : getFactorValue(row, betweenFactor),
      values: new Map<number, number>(),
    };
    entry.values.set(row.timepoint, value);
    subjects.set(row.animal_id, entry);
  });

  const completeSubjects = Array.from(subjects.entries())
    .filter(([, entry]) => availableTimepoints.every((timepoint) => entry.values.has(timepoint)))
    .map(([animalId, entry]) => ({
      animalId,
      identifier: entry.identifier,
      between: entry.between,
      values: availableTimepoints.map((timepoint) => Number(entry.values.get(timepoint))),
    }));

  const timepointPairs = availableTimepoints.map((timepoint, index) => ({
    timepoint,
    label: `${timepoint} Day`,
    index,
  }));

  return {
    availableTimepoints,
    timepointPairs,
    subjects,
    completeSubjects,
    isComplete: subjects.size > 0 && completeSubjects.length === subjects.size,
  };
}

function repeatedMeasuresAnova(
  rows: FlatRow[],
  measureKey: string,
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr",
) {
  const dataset = buildLongitudinalDataset(rows, measureKey, "__none__");
  const nSubjects = dataset.completeSubjects.length;
  const k = dataset.availableTimepoints.length;
  if (k < 2) return { error: "Repeated-measures ANOVA needs at least 2 timepoints in the included data." } as const;
  if (!dataset.isComplete) return { error: "Repeated-measures ANOVA needs complete values for every included animal across all selected timepoints." } as const;
  if (nSubjects < 2) return { error: "Repeated-measures ANOVA needs at least 2 complete animals." } as const;

  const matrix = dataset.completeSubjects.map((subject) => subject.values);
  const grandMean = mean(matrix.flat());
  const subjectMeans = matrix.map((values) => mean(values));
  const timeMeans = dataset.availableTimepoints.map((_, index) => mean(matrix.map((subject) => subject[index])));

  let ssTotal = 0;
  matrix.forEach((subjectValues) => subjectValues.forEach((value) => { ssTotal += (value - grandMean) ** 2; }));
  const ssSubjects = k * subjectMeans.reduce((sum, subjectMean) => sum + (subjectMean - grandMean) ** 2, 0);
  const ssTime = nSubjects * timeMeans.reduce((sum, timeMean) => sum + (timeMean - grandMean) ** 2, 0);
  const ssError = Math.max(0, ssTotal - ssSubjects - ssTime);

  const dfTime = k - 1;
  const dfError = (nSubjects - 1) * (k - 1);
  const msTime = dfTime > 0 ? ssTime / dfTime : 0;
  const msError = dfError > 0 ? ssError / dfError : 0;
  const F = msError > 0 ? msTime / msError : 0;
  const p = dfTime > 0 && dfError > 0 ? 1 - approxFCDF(F, dfTime, dfError) : 1;

  const assumptionChecks = [
    ...dataset.availableTimepoints.map((timepoint, index) =>
      normalityScreen(`${timepoint} Day`, matrix.map((subject) => subject[index])),
    ),
  ];
  if (k > 2) {
    const diffVariances: number[] = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const diffs = matrix.map((subject) => subject[i] - subject[j]);
        diffVariances.push(stdDev(diffs) ** 2);
      }
    }
    const positiveVariances = diffVariances.filter((value) => value > 0);
    const varianceRatio =
      positiveVariances.length > 1 ? Math.max(...positiveVariances) / Math.min(...positiveVariances) : 1;
    assumptionChecks.push({
      name: "Sphericity",
      status: varianceRatio > 4 ? "warn" : "info",
      message:
        varianceRatio > 4
          ? "Heuristic sphericity screen suggests uneven difference-score variances across timepoints."
          : "Sphericity screen is heuristic in this release; no strong variance imbalance was detected.",
      statistic: round(varianceRatio),
    });
  }

  const postHoc = matchedTimepointComparisons(dataset.subjects, dataset.timepointPairs, pAdjustMethod);

  return {
    test: "Repeated-measures ANOVA",
    n_subjects: nSubjects,
    n_timepoints: k,
    F: round(F),
    df_time: dfTime,
    df_error: dfError,
    p: round(p, 6),
    partial_eta_sq: round(ssTime / Math.max(ssTime + ssError, 1e-12)),
    anova_table: [
      {
        source: "Timepoint",
        ss: round(ssTime),
        df: dfTime,
        ms: round(msTime),
        F: round(F),
        p: round(p, 6),
        partial_eta_sq: round(ssTime / Math.max(ssTime + ssError, 1e-12)),
      },
      { source: "Subject", ss: round(ssSubjects), df: nSubjects - 1, ms: round((nSubjects - 1) > 0 ? ssSubjects / (nSubjects - 1) : 0) },
      { source: "Residual", ss: round(ssError), df: dfError, ms: round(msError) },
    ],
    group_stats: dataset.timepointPairs.map((timepoint) => {
      const values = matrix.map((subject) => subject[timepoint.index]);
      return {
        group: timepoint.label,
        n: values.length,
        mean: round(mean(values)),
        sd: round(stdDev(values)),
        sem: round(sem(values)),
        median: round(median(values)),
      };
    }),
    posthoc_label: "Pairwise timepoint comparisons",
    comparisons: postHoc,
    assumption_checks: assumptionChecks,
    warning: k > 2 ? "Sphericity is screened heuristically in this release rather than with a full Mauchly test." : undefined,
  };
}

function mixedEffectsApproximation(
  rows: FlatRow[],
  measureKey: string,
  betweenFactor: AnalysisFactor | "__none__",
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr",
) {
  const validRows = rows
    .map((row) => ({
      ...row,
      y: Number(row[measureKey]),
      timeLabel: `${row.timepoint} Day`,
      betweenLabel: betweenFactor === "__none__" ? "All animals" : getFactorValue(row, betweenFactor),
    }))
    .filter((row) => !Number.isNaN(row.y));
  const longitudinalDataset = buildLongitudinalDataset(rows, measureKey, betweenFactor);

  const subjectLevels = Array.from(new Set(validRows.map((row) => row.animal_id))).sort();
  const timeLevels = Array.from(new Set(validRows.map((row) => row.timeLabel))).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
  const betweenLevels = Array.from(new Set(validRows.map((row) => row.betweenLabel))).sort();
  if (timeLevels.length < 2) return { error: "Mixed-effects needs at least 2 timepoints in the included data." } as const;
  if (subjectLevels.length < 2) return { error: "Mixed-effects needs at least 2 animals with data." } as const;

  const baseDesign = validRows.map((row) => [
    1,
    ...subjectLevels.slice(1).map((subject) => (row.animal_id === subject ? 1 : 0)),
  ]);
  const timeDesign = validRows.map((row) => [
    ...baseDesign[validRows.indexOf(row)],
    ...timeLevels.slice(1).map((level) => (row.timeLabel === level ? 1 : 0)),
  ]);
  const interactionDesign = validRows.map((row) => {
    const base = [
      ...timeDesign[validRows.indexOf(row)],
    ];
    if (betweenFactor === "__none__" || betweenLevels.length < 2) return base;
    const betweenDummies = betweenLevels.slice(1).map((level) => (row.betweenLabel === level ? 1 : 0));
    for (const timeLevel of timeLevels.slice(1)) {
      for (const betweenDummy of betweenDummies) base.push((row.timeLabel === timeLevel ? 1 : 0) * betweenDummy);
    }
    return base;
  });

  const y = validRows.map((row) => row.y);
  const fitBase = fitLinearModel(baseDesign, y);
  const fitTime = fitLinearModel(timeDesign, y);
  const fitInteraction = fitLinearModel(interactionDesign, y);
  if (!fitBase || !fitTime || !fitInteraction) {
    return { error: "Could not fit the mixed-effects approximation with the current data." } as const;
  }

  const dfTime = timeLevels.length - 1;
  const ssTime = Math.max(0, fitBase.sse - fitTime.sse);
  const msTime = dfTime > 0 ? ssTime / dfTime : 0;
  const msError = fitTime.dfResidual > 0 ? fitTime.sse / fitTime.dfResidual : 0;
  const fTime = msError > 0 ? msTime / msError : 0;
  const pTime = dfTime > 0 && fitTime.dfResidual > 0 ? 1 - approxFCDF(fTime, dfTime, fitTime.dfResidual) : 1;

  let interactionRow: Record<string, unknown> | null = null;
  if (betweenFactor !== "__none__" && betweenLevels.length > 1) {
    const dfInteraction = (timeLevels.length - 1) * (betweenLevels.length - 1);
    const ssInteraction = Math.max(0, fitTime.sse - fitInteraction.sse);
    const msInteraction = dfInteraction > 0 ? ssInteraction / dfInteraction : 0;
    const msInteractionError = fitInteraction.dfResidual > 0 ? fitInteraction.sse / fitInteraction.dfResidual : 0;
    const fInteraction = msInteractionError > 0 ? msInteraction / msInteractionError : 0;
    const pInteraction =
      dfInteraction > 0 && fitInteraction.dfResidual > 0
        ? 1 - approxFCDF(fInteraction, dfInteraction, fitInteraction.dfResidual)
        : 1;
    interactionRow = {
      source: `Timepoint × ${getFactorLabel(betweenFactor)}`,
      ss: round(ssInteraction),
      df: dfInteraction,
      ms: round(msInteraction),
      F: round(fInteraction),
      p: round(pInteraction, 6),
      partial_eta_sq: round(ssInteraction / Math.max(ssInteraction + fitInteraction.sse, 1e-12)),
    };
  }

  const assumptionChecks = [
    ...timeLevels.map((timeLabel) =>
      normalityScreen(
        timeLabel,
        validRows.filter((row) => row.timeLabel === timeLabel).map((row) => row.y),
      ),
    ),
    {
      name: "Subject coverage",
      status: longitudinalDataset.isComplete ? "info" : "warn",
      message: longitudinalDataset.isComplete
        ? "All included animals have complete longitudinal values across the selected timepoints."
        : "Some animals are missing one or more timepoints, so the mixed-effects path is using incomplete longitudinal coverage.",
    },
  ];
  const postHoc = matchedTimepointComparisons(longitudinalDataset.subjects, longitudinalDataset.timepointPairs, pAdjustMethod);

  return {
    test: betweenFactor === "__none__" ? "Mixed-effects approximation" : `Mixed-effects approximation with ${getFactorLabel(betweenFactor)}`,
    n_subjects: subjectLevels.length,
    n_timepoints: timeLevels.length,
    F: round(fTime),
    df_time: dfTime,
    df_error: fitTime.dfResidual,
    p: round(pTime, 6),
    partial_eta_sq: round(ssTime / Math.max(ssTime + fitTime.sse, 1e-12)),
    anova_table: [
      {
        source: "Timepoint",
        ss: round(ssTime),
        df: dfTime,
        ms: round(msTime),
        F: round(fTime),
        p: round(pTime, 6),
        partial_eta_sq: round(ssTime / Math.max(ssTime + fitTime.sse, 1e-12)),
      },
      ...(interactionRow ? [interactionRow] : []),
      {
        source: "Residual",
        ss: round(fitInteraction.sse),
        df: fitInteraction.dfResidual,
        ms: round(fitInteraction.dfResidual > 0 ? fitInteraction.sse / fitInteraction.dfResidual : 0),
      },
    ],
    group_stats: timeLevels.map((timeLabel) => {
      const values = validRows.filter((row) => row.timeLabel === timeLabel).map((row) => row.y);
      return {
        group: timeLabel,
        n: values.length,
        mean: round(mean(values)),
        sd: round(stdDev(values)),
        sem: round(sem(values)),
        median: round(median(values)),
      };
    }),
    comparisons: postHoc,
    posthoc_label: "Pairwise timepoint comparisons",
    assumption_checks: assumptionChecks,
    warning:
      betweenFactor === "__none__"
        ? "This mixed-effects result is approximated with per-animal intercept terms so incomplete longitudinal data can still be modeled."
        : `This mixed-effects result uses per-animal intercept terms; the ${getFactorLabel(betweenFactor)} main effect itself is absorbed by subject intercepts, while timepoint and interaction terms remain testable.`,
  };
}

function getFactorValue(row: FlatRow, factor: AnalysisFactor): string {
  switch (factor) {
    case "sex":
      return row.sex;
    case "genotype":
      return row.genotype;
    case "cohort":
      return row.cohort;
    case "timepoint":
      return `${row.timepoint} Day`;
    case "group":
    default:
      return row.group;
  }
}

function getFactorLabel(factor: AnalysisFactor): string {
  switch (factor) {
    case "sex":
      return "Sex";
    case "genotype":
      return "Genotype";
    case "cohort":
      return "Cohort";
    case "timepoint":
      return "Timepoint";
    case "group":
    default:
      return "Genotype × Sex";
  }
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = matrix.length;
  if (n === 0) return [];
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    }
    if (Math.abs(augmented[pivot][col]) < 1e-10) return null;
    if (pivot !== col) [augmented[pivot], augmented[col]] = [augmented[col], augmented[pivot]];

    const pivotValue = augmented[col][col];
    for (let j = col; j <= n; j++) augmented[col][j] /= pivotValue;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = col; j <= n; j++) augmented[row][j] -= factor * augmented[col][j];
    }
  }

  return augmented.map((row) => row[n]);
}

function fitLinearModel(design: number[][], y: number[]): { sse: number; dfResidual: number; coefficients: number[] } | null {
  if (design.length !== y.length || design.length === 0) return null;
  const columns = design[0].length;
  const xtx = Array.from({ length: columns }, () => Array.from({ length: columns }, () => 0));
  const xty = Array.from({ length: columns }, () => 0);

  for (let row = 0; row < design.length; row++) {
    for (let i = 0; i < columns; i++) {
      xty[i] += design[row][i] * y[row];
      for (let j = 0; j < columns; j++) {
        xtx[i][j] += design[row][i] * design[row][j];
      }
    }
  }

  for (let i = 0; i < columns; i++) xtx[i][i] += 1e-8;
  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return null;

  let sse = 0;
  for (let row = 0; row < design.length; row++) {
    let predicted = 0;
    for (let i = 0; i < columns; i++) predicted += design[row][i] * coefficients[i];
    sse += (y[row] - predicted) ** 2;
  }

  return { sse, dfResidual: Math.max(0, y.length - columns), coefficients };
}

function buildTwoWayDesign(
  rows: FlatRow[],
  measureKey: string,
  factorA: AnalysisFactor,
  factorB: AnalysisFactor,
  includeA: boolean,
  includeB: boolean,
  includeInteraction: boolean,
) {
  const prepared = rows
    .map((row) => ({
      y: Number(row[measureKey]),
      a: getFactorValue(row, factorA),
      b: getFactorValue(row, factorB),
    }))
    .filter((row) => !Number.isNaN(row.y) && row.a && row.b);

  const levelsA = Array.from(new Set(prepared.map((row) => row.a))).sort();
  const levelsB = Array.from(new Set(prepared.map((row) => row.b))).sort();
  const baseA = levelsA[0];
  const baseB = levelsB[0];

  const design = prepared.map((row) => {
    const cols = [1];
    const aDummies = levelsA.slice(1).map((level) => (row.a === level ? 1 : 0));
    const bDummies = levelsB.slice(1).map((level) => (row.b === level ? 1 : 0));
    if (includeA) cols.push(...aDummies);
    if (includeB) cols.push(...bDummies);
    if (includeInteraction) {
      for (const aDummy of aDummies) {
        for (const bDummy of bDummies) cols.push(aDummy * bDummy);
      }
    }
    return cols;
  });

  return {
    y: prepared.map((row) => row.y),
    design,
    levelsA,
    levelsB,
    baseA,
    baseB,
  };
}

function twoWayAnova(
  rows: FlatRow[],
  measureKey: string,
  factorA: AnalysisFactor,
  factorB: AnalysisFactor,
): {
  factorA: string;
  factorB: string;
  levelsA: string[];
  levelsB: string[];
  n: number;
  table: Array<Record<string, unknown>>;
  cellCounts: Array<{ levelA: string; levelB: string; n: number }>;
  warning?: string;
} | { error: string } {
  if (factorA === factorB) return { error: "Choose two different factors for 2-way ANOVA." };

  const validRows = rows.filter((row) => !Number.isNaN(Number(row[measureKey])));
  const levelsA = Array.from(new Set(validRows.map((row) => getFactorValue(row, factorA)))).sort();
  const levelsB = Array.from(new Set(validRows.map((row) => getFactorValue(row, factorB)))).sort();
  if (levelsA.length < 2 || levelsB.length < 2) {
    return { error: "Each factor needs at least 2 levels in the included data." };
  }

  const cellCounts = levelsA.flatMap((levelA) =>
    levelsB.map((levelB) => ({
      levelA,
      levelB,
      n: validRows.filter((row) => getFactorValue(row, factorA) === levelA && getFactorValue(row, factorB) === levelB).length,
    })),
  );

  if (cellCounts.some((cell) => cell.n === 0)) {
    return { error: "2-way ANOVA needs at least one included animal in every factor combination." };
  }

  const modelA = buildTwoWayDesign(validRows, measureKey, factorA, factorB, true, false, false);
  const modelB = buildTwoWayDesign(validRows, measureKey, factorA, factorB, false, true, false);
  const modelAdd = buildTwoWayDesign(validRows, measureKey, factorA, factorB, true, true, false);
  const modelFull = buildTwoWayDesign(validRows, measureKey, factorA, factorB, true, true, true);

  const fitA = fitLinearModel(modelA.design, modelA.y);
  const fitB = fitLinearModel(modelB.design, modelB.y);
  const fitAdd = fitLinearModel(modelAdd.design, modelAdd.y);
  const fitFull = fitLinearModel(modelFull.design, modelFull.y);
  if (!fitA || !fitB || !fitAdd || !fitFull) {
    return { error: "Could not fit the 2-way ANOVA model with the current data." };
  }

  const dfA = levelsA.length - 1;
  const dfB = levelsB.length - 1;
  const dfInteraction = dfA * dfB;
  const msErrorAdd = fitAdd.dfResidual > 0 ? fitAdd.sse / fitAdd.dfResidual : NaN;
  const msErrorFull = fitFull.dfResidual > 0 ? fitFull.sse / fitFull.dfResidual : NaN;

  const ssA = Math.max(0, fitB.sse - fitAdd.sse);
  const ssB = Math.max(0, fitA.sse - fitAdd.sse);
  const ssInteraction = Math.max(0, fitAdd.sse - fitFull.sse);

  const fA = dfA > 0 && msErrorAdd > 0 ? (ssA / dfA) / msErrorAdd : 0;
  const fB = dfB > 0 && msErrorAdd > 0 ? (ssB / dfB) / msErrorAdd : 0;
  const fInteraction = dfInteraction > 0 && msErrorFull > 0 ? (ssInteraction / dfInteraction) / msErrorFull : 0;

  const pA = dfA > 0 && fitAdd.dfResidual > 0 ? 1 - approxFCDF(fA, dfA, fitAdd.dfResidual) : 1;
  const pB = dfB > 0 && fitAdd.dfResidual > 0 ? 1 - approxFCDF(fB, dfB, fitAdd.dfResidual) : 1;
  const pInteraction = dfInteraction > 0 && fitFull.dfResidual > 0 ? 1 - approxFCDF(fInteraction, dfInteraction, fitFull.dfResidual) : 1;

  return {
    factorA: getFactorLabel(factorA),
    factorB: getFactorLabel(factorB),
    levelsA,
    levelsB,
    n: validRows.length,
    table: [
      {
        source: getFactorLabel(factorA),
        ss: round(ssA),
        df: dfA,
        ms: round(dfA > 0 ? ssA / dfA : 0),
        F: round(fA),
        p: round(pA, 6),
        partial_eta_sq: round(ssA / Math.max(ssA + fitAdd.sse, 1e-12)),
      },
      {
        source: getFactorLabel(factorB),
        ss: round(ssB),
        df: dfB,
        ms: round(dfB > 0 ? ssB / dfB : 0),
        F: round(fB),
        p: round(pB, 6),
        partial_eta_sq: round(ssB / Math.max(ssB + fitAdd.sse, 1e-12)),
      },
      {
        source: `${getFactorLabel(factorA)} × ${getFactorLabel(factorB)}`,
        ss: round(ssInteraction),
        df: dfInteraction,
        ms: round(dfInteraction > 0 ? ssInteraction / dfInteraction : 0),
        F: round(fInteraction),
        p: round(pInteraction, 6),
        partial_eta_sq: round(ssInteraction / Math.max(ssInteraction + fitFull.sse, 1e-12)),
      },
      {
        source: "Residual",
        ss: round(fitFull.sse),
        df: fitFull.dfResidual,
        ms: round(fitFull.dfResidual > 0 ? fitFull.sse / fitFull.dfResidual : 0),
      },
    ],
    cellCounts,
    warning: "Main effects are estimated from the additive model, and the interaction is tested separately against the full factorial model.",
  };
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ColonyAnalysisPanelProps {
  animals: Animal[];
  cohorts: Cohort[];
  colonyResults: ColonyResult[];
  experimentRuns: ExperimentRun[];
  runAssignments: RunAssignment[];
  runTimepoints: RunTimepoint[];
  runTimepointExperiments: RunTimepointExperiment[];
  savedAnalysisDatasets: Dataset[];
  savedAnalysisRevisions: Analysis[];
  saveAnalysisRevision: (payload: {
    analysisId?: string | null;
    name: string;
    description?: string | null;
    config: Record<string, unknown>;
    results: Record<string, unknown>;
    summaryText?: string | null;
  }) => Promise<{ success?: boolean; analysisId?: string; revisionId?: string; revisionNumber?: number }>;
  deleteAnalysis: (analysisId: string) => Promise<{ success?: boolean }>;
  updateAnalysisRevisionMetadata: (args: {
    revisionId: string;
    configPatch?: Record<string, unknown>;
    summaryText?: string | null;
  }) => Promise<{ success?: boolean }>;
}

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function detectOutlierScores(
  rows: FlatRow[],
  measureKey: string,
  method: OutlierMethod,
  threshold: number,
): Record<string, { score: number; flagged: boolean }> {
  const values = rows
    .map((row) => ({ animalId: row.animal_id, value: Number(row[measureKey]) }))
    .filter((entry) => !Number.isNaN(entry.value));
  if (values.length < 4) return {};
  if (method === "zscore") {
    const numeric = values.map((entry) => entry.value);
    const m = mean(numeric);
    const sd = stdDev(numeric);
    return values.reduce<Record<string, { score: number; flagged: boolean }>>((acc, entry) => {
      const score = sd === 0 ? 0 : Math.abs((entry.value - m) / sd);
      acc[entry.animalId] = { score: round(score, 4), flagged: score > threshold };
      return acc;
    }, {});
  }
  const numeric = values.map((entry) => entry.value);
  const q1 = quantile(numeric, 0.25);
  const q3 = quantile(numeric, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - threshold * iqr;
  const upper = q3 + threshold * iqr;
  return values.reduce<Record<string, { score: number; flagged: boolean }>>((acc, entry) => {
    let score = 0;
    if (entry.value < q1 && iqr > 0) score = Math.abs((q1 - entry.value) / iqr);
    if (entry.value > q3 && iqr > 0) score = Math.abs((entry.value - q3) / iqr);
    acc[entry.animalId] = {
      score: round(score, 4),
      flagged: entry.value < lower || entry.value > upper,
    };
    return acc;
  }, {});
}

function wilcoxonSignedRankTest(a: number[], b: number[]): { W: number; z: number; p: number; rankBiserial: number } {
  if (a.length !== b.length || a.length < 2) return { W: 0, z: 0, p: 1, rankBiserial: 0 };
  const diffs = a.map((value, index) => value - b[index]).filter((value) => value !== 0);
  if (diffs.length === 0) return { W: 0, z: 0, p: 1, rankBiserial: 0 };
  const absDiffs = diffs.map(Math.abs);
  const ranks = rankWithTies(absDiffs);
  let wPositive = 0;
  let wNegative = 0;
  diffs.forEach((diff, index) => {
    if (diff > 0) wPositive += ranks[index];
    else wNegative += ranks[index];
  });
  const W = Math.min(wPositive, wNegative);
  const n = diffs.length;
  const meanW = (n * (n + 1)) / 4;
  const sdW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  const z = sdW === 0 ? 0 : (W - meanW) / sdW;
  const p = 2 * (1 - approxNormCDF(Math.abs(z)));
  const rankBiserial = (wPositive - wNegative) / ((n * (n + 1)) / 2);
  return { W: round(W), z: round(z), p: round(p, 6), rankBiserial: round(rankBiserial) };
}

function chiSquareTest(contingency: number[][]) {
  const rowSums = contingency.map((row) => row.reduce((sum, value) => sum + value, 0));
  const colSums = contingency[0].map((_, index) => contingency.reduce((sum, row) => sum + row[index], 0));
  const total = rowSums.reduce((sum, value) => sum + value, 0);
  let chi2 = 0;
  for (let r = 0; r < contingency.length; r++) {
    for (let c = 0; c < contingency[r].length; c++) {
      const expected = (rowSums[r] * colSums[c]) / Math.max(total, 1);
      if (expected > 0) chi2 += ((contingency[r][c] - expected) ** 2) / expected;
    }
  }
  const df = (contingency.length - 1) * (contingency[0].length - 1);
  const p = 1 - approxChiSquareCDF(chi2, df);
  const phi = total > 0 ? Math.sqrt(chi2 / total) : 0;
  return { chi2: round(chi2), df, p: round(p, 6), phi: round(phi) };
}

function logFactorial(n: number) {
  let result = 0;
  for (let i = 2; i <= n; i++) result += Math.log(i);
  return result;
}

function fisherExactTest(a: number, b: number, c: number, d: number) {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const total = row1 + row2;
  const minA = Math.max(0, col1 - row2);
  const maxA = Math.min(col1, row1);
  const hyperProb = (x: number) =>
    Math.exp(
      logFactorial(row1) +
        logFactorial(row2) +
        logFactorial(col1) +
        logFactorial(total - col1) -
        (logFactorial(total) + logFactorial(x) + logFactorial(row1 - x) + logFactorial(col1 - x) + logFactorial(row2 - col1 + x)),
    );
  const observed = hyperProb(a);
  let p = 0;
  for (let x = minA; x <= maxA; x++) {
    const prob = hyperProb(x);
    if (prob <= observed + 1e-12) p += prob;
  }
  const oddsRatio = b * c === 0 ? (a * d === 0 ? 0 : Infinity) : (a * d) / (b * c);
  return { p: round(Math.min(p, 1), 6), oddsRatio: Number.isFinite(oddsRatio) ? round(oddsRatio) : oddsRatio };
}

function ancova(rows: FlatRow[], outcomeKey: string, factor: AnalysisFactor, covariateKey: string) {
  const prepared = rows
    .map((row) => ({
      y: Number(row[outcomeKey]),
      covariate: Number(row[covariateKey]),
      factorLevel: getFactorValue(row, factor),
    }))
    .filter((row) => !Number.isNaN(row.y) && !Number.isNaN(row.covariate) && row.factorLevel);
  const levels = Array.from(new Set(prepared.map((row) => row.factorLevel))).sort();
  if (levels.length < 2) return { error: "ANCOVA needs at least 2 factor levels with valid covariate values." } as const;
  if (prepared.length < levels.length + 3) return { error: "Not enough rows to estimate ANCOVA with the selected covariate." } as const;
  const reducedDesign = prepared.map((row) => [1, row.covariate]);
  const fullDesign = prepared.map((row) => [
    1,
    row.covariate,
    ...levels.slice(1).map((level) => (row.factorLevel === level ? 1 : 0)),
  ]);
  const interactionDesign = prepared.map((row) => {
    const factorDummies = levels.slice(1).map((level) => (row.factorLevel === level ? 1 : 0));
    return [
      1,
      row.covariate,
      ...factorDummies,
      ...factorDummies.map((dummy) => dummy * row.covariate),
    ];
  });
  const y = prepared.map((row) => row.y);
  const reducedFit = fitLinearModel(reducedDesign, y);
  const fullFit = fitLinearModel(fullDesign, y);
  const interactionFit = fitLinearModel(interactionDesign, y);
  if (!reducedFit || !fullFit || !interactionFit) return { error: "Could not fit ANCOVA with the selected measure and covariate." } as const;
  const dfFactor = levels.length - 1;
  const ssFactor = Math.max(0, reducedFit.sse - fullFit.sse);
  const msFactor = dfFactor > 0 ? ssFactor / dfFactor : 0;
  const msError = fullFit.dfResidual > 0 ? fullFit.sse / fullFit.dfResidual : 0;
  const F = msError > 0 ? msFactor / msError : 0;
  const p = dfFactor > 0 && fullFit.dfResidual > 0 ? 1 - approxFCDF(F, dfFactor, fullFit.dfResidual) : 1;
  const dfSlope = levels.length - 1;
  const ssSlope = Math.max(0, fullFit.sse - interactionFit.sse);
  const msSlope = dfSlope > 0 ? ssSlope / dfSlope : 0;
  const msInteractionError = interactionFit.dfResidual > 0 ? interactionFit.sse / interactionFit.dfResidual : 0;
  const fSlope = msInteractionError > 0 ? msSlope / msInteractionError : 0;
  const pSlope = dfSlope > 0 && interactionFit.dfResidual > 0 ? 1 - approxFCDF(fSlope, dfSlope, interactionFit.dfResidual) : 1;
  const residuals = fullDesign.map((row, index) => {
    const predicted = row.reduce((sum, coefficient, coefficientIndex) => sum + coefficient * (fullFit.coefficients[coefficientIndex] || 0), 0);
    return y[index] - predicted;
  });
  const coefficients = {
    intercept: round(fullFit.coefficients[0] || 0),
    covariate: round(fullFit.coefficients[1] || 0),
    ...Object.fromEntries(
      levels.slice(1).map((level, index) => [
        `factor_${level}`,
        round(fullFit.coefficients[index + 2] || 0),
      ]),
    ),
  };
  return {
    factor: getFactorLabel(factor),
    covariate: covariateKey,
    F: round(F),
    dfFactor,
    dfError: fullFit.dfResidual,
    p: round(p, 6),
    partial_eta_sq: round(ssFactor / Math.max(ssFactor + fullFit.sse, 1e-12)),
    rmse: round(Math.sqrt(fullFit.sse / Math.max(prepared.length, 1))),
    coefficients,
    assumption_checks: [
      normalityScreen("ANCOVA residuals", residuals),
      {
        name: "Homogeneity of regression slopes",
        status: pSlope < 0.05 ? "warn" : "info",
        message:
          pSlope < 0.05
            ? `Covariate-by-group slope interaction was detected (p = ${pSlope < 0.001 ? "< 0.001" : pSlope.toFixed(4)}), so ANCOVA slope homogeneity may be violated.`
            : `No strong covariate-by-group slope interaction was detected (p = ${pSlope.toFixed(4)}).`,
        statistic: round(fSlope),
        p: round(pSlope, 6),
      },
    ],
    warning:
      pSlope < 0.05
        ? "Interpret ANCOVA cautiously because covariate slopes appear to differ across factor levels."
        : undefined,
  };
}

function rocAucFromBinaryGroups(groupA: number[], groupB: number[]) {
  const totalPairs = groupA.length * groupB.length;
  if (totalPairs === 0) return { auc: 0.5, p: 1 };
  let wins = 0;
  let ties = 0;
  for (const a of groupA) {
    for (const b of groupB) {
      if (a > b) wins += 1;
      else if (a === b) ties += 1;
    }
  }
  const auc = (wins + ties * 0.5) / totalPairs;
  const mw = mannWhitneyUTest(groupA, groupB);
  return { auc: round(auc, 4), p: mw.p };
}

function estimateSampleSizeForTwoGroup(effectSize: number, alpha = 0.05, power = 0.8) {
  if (effectSize <= 0) return null;
  const safeAlpha = Math.min(Math.max(alpha, 1e-6), 0.2);
  const safePower = Math.min(Math.max(power, 0.5), 0.999);
  const zAlpha = approxNormInv(1 - safeAlpha / 2);
  const zPower = approxNormInv(safePower);
  return Math.max(2, Math.ceil((2 * (zAlpha + zPower) ** 2) / (effectSize ** 2)));
}

function inferBinaryValue(value: unknown, positiveClass = "Positive") {
  if (typeof value === "number") return value > 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const positive = positiveClass.trim().toLowerCase();
  if (normalized === positive) return true;
  if (["1", "true", "yes", "positive", "event", "done", "completed"].includes(normalized)) return true;
  if (["0", "false", "no", "negative", "censored", "pending", "skipped"].includes(normalized)) return false;
  return null;
}

function detectBinaryLikeKeys(rows: FlatRow[]) {
  const keys = new Map<string, Set<string>>();
  rows.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (["animal_id", "identifier", "sex", "genotype", "group", "cohort", "timepoint", "experiment"].includes(key)) return;
      if (value == null || value === "") return;
      const set = keys.get(key) || new Set<string>();
      set.add(String(value).trim().toLowerCase());
      keys.set(key, set);
    });
  });
  return Array.from(keys.entries())
    .filter(([, values]) => values.size > 0 && values.size <= 2)
    .map(([key]) => key);
}

function buildRocCurve(scores: Array<{ score: number; positive: boolean }>) {
  const sortedThresholds = Array.from(new Set(scores.map((entry) => entry.score))).sort((a, b) => b - a);
  const positives = scores.filter((entry) => entry.positive).length;
  const negatives = scores.length - positives;
  if (positives === 0 || negatives === 0) return { points: [], thresholdTable: [], optimal: null, auc: 0.5 };
  const points: Array<{ threshold: number; tpr: number; fpr: number }> = [];
  const thresholdTable: Array<Record<string, unknown>> = [];
  let best: Record<string, unknown> | null = null;
  for (const threshold of sortedThresholds) {
    const tp = scores.filter((entry) => entry.positive && entry.score >= threshold).length;
    const fp = scores.filter((entry) => !entry.positive && entry.score >= threshold).length;
    const fn = positives - tp;
    const tn = negatives - fp;
    const sensitivity = tp / positives;
    const specificity = tn / negatives;
    const fpr = 1 - specificity;
    const youden = sensitivity + specificity - 1;
    const row = {
      threshold: round(threshold, 4),
      sensitivity: round(sensitivity, 4),
      specificity: round(specificity, 4),
      false_positive_rate: round(fpr, 4),
      tp,
      fp,
      tn,
      fn,
      youden_j: round(youden, 4),
    };
    thresholdTable.push(row);
    points.push({ threshold, tpr: sensitivity, fpr });
    if (!best || Number(row.youden_j) > Number(best.youden_j)) best = row;
  }
  const augmented = [{ threshold: Number.POSITIVE_INFINITY, tpr: 0, fpr: 0 }, ...points, { threshold: Number.NEGATIVE_INFINITY, tpr: 1, fpr: 1 }]
    .sort((a, b) => a.fpr - b.fpr);
  let auc = 0;
  for (let i = 1; i < augmented.length; i++) {
    const prev = augmented[i - 1];
    const curr = augmented[i];
    auc += (curr.fpr - prev.fpr) * ((curr.tpr + prev.tpr) / 2);
  }
  return { points, thresholdTable, optimal: best, auc: round(auc, 4) };
}

function kaplanMeierSummary(
  rows: FlatRow[],
  timeKey: string,
  eventKey: string,
  groupingFactor: AnalysisFactor,
  positiveClass: string,
) {
  const grouped = new Map<string, Array<{ time: number; event: boolean }>>();
  rows.forEach((row) => {
    const time = Number(row[timeKey]);
    const event = inferBinaryValue(row[eventKey], positiveClass);
    if (Number.isNaN(time) || event == null) return;
    const group = getFactorValue(row, groupingFactor);
    const list = grouped.get(group) || [];
    list.push({ time, event });
    grouped.set(group, list);
  });
  return Array.from(grouped.entries())
    .filter(([, entries]) => entries.length >= 2)
    .map(([group, entries]) => {
      const ordered = [...entries].sort((a, b) => a.time - b.time);
      let atRisk = ordered.length;
      let survival = 1;
      const points: Array<Record<string, unknown>> = [{ time: 0, survival: 1, at_risk: atRisk, events: 0 }];
      const uniqueTimes = Array.from(new Set(ordered.map((entry) => entry.time))).sort((a, b) => a - b);
      uniqueTimes.forEach((time) => {
        const atTime = ordered.filter((entry) => entry.time === time);
        const events = atTime.filter((entry) => entry.event).length;
        const censored = atTime.length - events;
        if (events > 0 && atRisk > 0) survival *= (atRisk - events) / atRisk;
        points.push({
          time,
          survival: round(survival, 4),
          at_risk: atRisk,
          events,
          censored,
        });
        atRisk -= atTime.length;
      });
      const medianPoint = points.find((point) => Number(point.survival) <= 0.5);
      return {
        group,
        n: entries.length,
        events: entries.filter((entry) => entry.event).length,
        censored: entries.filter((entry) => !entry.event).length,
        median_survival: medianPoint ? Number(medianPoint.time) : null,
        points,
      };
    });
}

function logRankTest(
  rows: FlatRow[],
  timeKey: string,
  eventKey: string,
  groupingFactor: AnalysisFactor,
  positiveClass: string,
) {
  const prepared = rows
    .map((row) => ({
      time: Number(row[timeKey]),
      event: inferBinaryValue(row[eventKey], positiveClass),
      group: getFactorValue(row, groupingFactor),
    }))
    .filter((row) => !Number.isNaN(row.time) && row.event != null);
  const groups = Array.from(new Set(prepared.map((row) => row.group)));
  if (groups.length < 2) return { error: "Log-rank test needs at least 2 groups with valid survival data." } as const;
  const eventTimes = Array.from(new Set(prepared.filter((row) => row.event).map((row) => row.time))).sort((a, b) => a - b);
  const observed = new Map<string, number>(groups.map((group) => [group, 0]));
  const expected = new Map<string, number>(groups.map((group) => [group, 0]));
  const variance = new Map<string, number>(groups.map((group) => [group, 0]));
  eventTimes.forEach((time) => {
    const atRiskByGroup = groups.map((group) => prepared.filter((row) => row.group === group && row.time >= time).length);
    const eventByGroup = groups.map((group) => prepared.filter((row) => row.group === group && row.time === time && row.event).length);
    const totalAtRisk = atRiskByGroup.reduce((sum, value) => sum + value, 0);
    const totalEvents = eventByGroup.reduce((sum, value) => sum + value, 0);
    if (totalAtRisk <= 1 || totalEvents === 0) return;
    groups.forEach((group, index) => {
      const o = eventByGroup[index];
      const e = (atRiskByGroup[index] / totalAtRisk) * totalEvents;
      const v =
        (atRiskByGroup[index] * (totalAtRisk - atRiskByGroup[index]) * totalEvents * (totalAtRisk - totalEvents)) /
        Math.max(totalAtRisk ** 2 * (totalAtRisk - 1), 1);
      observed.set(group, Number(observed.get(group) || 0) + o);
      expected.set(group, Number(expected.get(group) || 0) + e);
      variance.set(group, Number(variance.get(group) || 0) + v);
    });
  });
  const chi2 = groups.reduce((sum, group) => {
    const diff = Number(observed.get(group) || 0) - Number(expected.get(group) || 0);
    const v = Number(variance.get(group) || 0);
    return sum + (v > 0 ? (diff ** 2) / v : 0);
  }, 0);
  const df = groups.length - 1;
  return {
    log_rank_chi2: round(chi2),
    df,
    p: round(1 - approxChiSquareCDF(chi2, df), 6),
    observed_expected: groups.map((group) => ({
      group,
      observed: round(Number(observed.get(group) || 0), 4),
      expected: round(Number(expected.get(group) || 0), 4),
      variance: round(Number(variance.get(group) || 0), 4),
    })),
  };
}

function fitNonlinearRegression(
  rows: FlatRow[],
  predictorKey: string,
  outcomeKey: string,
  family: "linear" | "exponential" | "logistic",
) {
  const points = rows
    .map((row) => ({ x: Number(row[predictorKey]), y: Number(row[outcomeKey]) }))
    .filter((row) => !Number.isNaN(row.x) && !Number.isNaN(row.y));
  if (points.length < 4) return { error: "Need at least 4 valid rows for regression fitting." } as const;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const yMean = mean(ys);
  const totalSS = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0);

  if (family === "linear") {
    const fit = fitLinearModel(points.map((point) => [1, point.x]), ys);
    if (!fit) return { error: "Could not fit linear regression." } as const;
    const [intercept, slope] = fit.coefficients;
    return {
      model: "Linear regression",
      family,
      coefficients: { intercept: round(intercept), slope: round(slope) },
      fitted_points: points.map((point) => ({ x: point.x, y: round(intercept + slope * point.x, 4) })),
      rmse: round(Math.sqrt(fit.sse / Math.max(points.length, 1))),
      r2: round(totalSS > 0 ? 1 - fit.sse / totalSS : 1, 4),
      points,
    };
  }

  if (family === "exponential") {
    const valid = points.filter((point) => point.y > 0);
    if (valid.length < 4) return { error: "Exponential regression needs positive outcome values." } as const;
    const fit = fitLinearModel(valid.map((point) => [1, point.x]), valid.map((point) => Math.log(point.y)));
    if (!fit) return { error: "Could not fit exponential regression." } as const;
    const [logA, b] = fit.coefficients;
    const a = Math.exp(logA);
    const sse = points.reduce((sum, point) => sum + (point.y - a * Math.exp(b * point.x)) ** 2, 0);
    return {
      model: "Exponential regression",
      family,
      coefficients: { a: round(a), b: round(b) },
      fitted_points: points.map((point) => ({ x: point.x, y: round(a * Math.exp(b * point.x), 4) })),
      rmse: round(Math.sqrt(sse / Math.max(points.length, 1))),
      r2: round(totalSS > 0 ? 1 - sse / totalSS : 1, 4),
      points,
    };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1e-6);
  let best: { bottom: number; top: number; midpoint: number; slope: number; sse: number } | null = null;
  const bottomCandidates = [minY - yRange * 0.15, minY, minY + yRange * 0.1];
  const topCandidates = [maxY - yRange * 0.1, maxY, maxY + yRange * 0.15];
  const slopeCandidates = [
    -xRange,
    -xRange / 2,
    -xRange / 4,
    -xRange / 8,
    xRange / 8,
    xRange / 4,
    xRange / 2,
    xRange,
  ].filter((value) => Math.abs(value) > 1e-6);
  for (const bottom of bottomCandidates) {
    for (const top of topCandidates) {
      if (Math.abs(top - bottom) < 1e-6) continue;
      for (let i = 0; i <= 24; i++) {
        const midpoint = minX + ((maxX - minX) * i) / 24;
        for (const slope of slopeCandidates) {
          const sse = points.reduce((sum, point) => {
            const predicted = bottom + (top - bottom) / (1 + Math.exp(-(point.x - midpoint) / slope));
            return sum + (point.y - predicted) ** 2;
          }, 0);
          if (!best || sse < best.sse) best = { bottom, top, midpoint, slope, sse };
        }
      }
    }
  }
  if (!best) return { error: "Could not fit logistic regression." } as const;
  return {
    model: "Logistic regression",
    family,
    coefficients: {
      bottom: round(best.bottom),
      top: round(best.top),
      midpoint: round(best.midpoint),
      slope: round(best.slope),
    },
    fitted_points: points.map((point) => ({
      x: point.x,
      y: round(best.bottom + (best.top - best.bottom) / (1 + Math.exp(-(point.x - best.midpoint) / best.slope)), 4),
    })),
    rmse: round(Math.sqrt(best.sse / Math.max(points.length, 1))),
    r2: round(totalSS > 0 ? 1 - best.sse / totalSS : 1, 4),
    points,
  };
}

function summarizeRevisionDiff(a: SavedColonyAnalysisRevision | null, b: SavedColonyAnalysisRevision | null): RevisionDiffSummary | null {
  if (!a || !b) return null;
  const changes: string[] = [];
  const aStats = (a.config.statistics || {}) as Record<string, unknown>;
  const bStats = (b.config.statistics || {}) as Record<string, unknown>;
  const aScope = (a.config.scope || {}) as Record<string, unknown>;
  const bScope = (b.config.scope || {}) as Record<string, unknown>;
  if (aStats.testType !== bStats.testType) changes.push(`Test changed from ${String(aStats.testType || "—")} to ${String(bStats.testType || "—")}.`);
  if (aStats.measureKey !== bStats.measureKey) changes.push(`Primary measure changed from ${String(aStats.measureKey || "—")} to ${String(bStats.measureKey || "—")}.`);
  if (aScope.experiment !== bScope.experiment || aScope.timepoint !== bScope.timepoint) {
    changes.push(`Scope changed from ${String(aScope.experiment || "all")} @ ${String(aScope.timepoint || "all")} to ${String(bScope.experiment || "all")} @ ${String(bScope.timepoint || "all")}.`);
  }
  const aExcluded = Array.isArray(a.config.analysisSetEntries) ? (a.config.analysisSetEntries as Array<Record<string, unknown>>).filter((entry) => entry.included === false).length : 0;
  const bExcluded = Array.isArray(b.config.analysisSetEntries) ? (b.config.analysisSetEntries as Array<Record<string, unknown>>).filter((entry) => entry.included === false).length : 0;
  if (aExcluded !== bExcluded) changes.push(`Excluded animals changed from ${aExcluded} to ${bExcluded}.`);
  if (String(a.results.reportSummary || "") !== String(b.results.reportSummary || "")) changes.push("Statistical summary changed.");
  return {
    fromRevision: `Rev ${a.revisionNumber}`,
    toRevision: `Rev ${b.revisionNumber}`,
    changes: changes.length > 0 ? changes : ["No major difference detected in saved scope, stats config, or summary."],
  };
}

function suggestAnalysisTests(params: {
  flatData: FlatRow[];
  numericKeys: string[];
  hasMultipleTimepoints: boolean;
}): AnalysisSuggestion[] {
  const { flatData, numericKeys, hasMultipleTimepoints } = params;
  const suggestions: AnalysisSuggestion[] = [];
  const groups = Array.from(new Set(flatData.map((row) => row.group))).filter(Boolean);
  const sexes = Array.from(new Set(flatData.map((row) => row.sex))).filter(Boolean);
  const genotypes = Array.from(new Set(flatData.map((row) => row.genotype))).filter(Boolean);
  const repeatedSubjectCount = Array.from(
    flatData.reduce<Map<string, Set<number>>>((map, row) => {
      const set = map.get(row.animal_id) || new Set<number>();
      set.add(row.timepoint);
      map.set(row.animal_id, set);
      return map;
    }, new Map()),
  ).filter(([, timepoints]) => timepoints.size > 1).length;
  const longitudinalCandidate = repeatedSubjectCount >= 2;
  const longitudinalComplete =
    longitudinalCandidate &&
    Array.from(
      flatData.reduce<Map<string, Set<number>>>((map, row) => {
        const set = map.get(row.animal_id) || new Set<number>();
        set.add(row.timepoint);
        map.set(row.animal_id, set);
        return map;
      }, new Map()),
    ).every(([, timepoints]) => timepoints.size === new Set(flatData.map((row) => row.timepoint)).size);
  const binaryKeys = detectBinaryLikeKeys(flatData);
  const hasBinaryOutcome = binaryKeys.length > 0;
  const hasPredictorOutcomePair = numericKeys.length >= 2;

  if (numericKeys.length >= 2) {
    suggestions.push({
      testType: "pearson",
      label: "Pearson Correlation",
      reason: "Two or more numeric outcomes are available, so you can test linear associations.",
    });
    suggestions.push({
      testType: "spearman",
      label: "Spearman Correlation",
      reason: "Useful when the relationship may be monotonic or less normally distributed.",
    });
    suggestions.push({
      testType: "nonlinear_regression",
      label: "Nonlinear Regression",
      reason: "Two numeric measures are available, so predictor-outcome fitting is possible.",
    });
  }

  if (sexes.length >= 2 && genotypes.length >= 2) {
    suggestions.unshift({
      testType: "two_way_anova",
      label: "2-way ANOVA",
      reason: "Both sex and genotype vary here, so a factor-based model can test main effects plus interaction.",
    });
  }

  if (groups.length === 2) {
    suggestions.unshift({
      testType: "t_test",
      label: "Welch t-test",
      reason: "Exactly two groups are present, which fits the standard 2-group comparison flow.",
    });
    suggestions.push({
      testType: "mann_whitney",
      label: "Mann-Whitney U",
      reason: "A good non-parametric fallback for the same 2-group comparison.",
    });
  } else if (groups.length > 2) {
    suggestions.unshift({
      testType: "anova",
      label: "1-way ANOVA",
      reason: "More than two groups are present, so a multi-group comparison is appropriate.",
    });
    suggestions.push({
      testType: "kruskal_wallis",
      label: "Kruskal-Wallis",
      reason: "Non-parametric alternative when distribution assumptions look shaky.",
    });
    suggestions.push({
      testType: "multi_compare",
      label: "Pairwise Comparisons",
      reason: "Useful after group-level screening when you need pairwise follow-up tests.",
    });
  }

  if (hasMultipleTimepoints) {
    suggestions.unshift(
      longitudinalComplete
        ? {
            testType: "repeated_measures_anova",
            label: "Repeated-Measures ANOVA",
            reason: "The same animals appear across multiple timepoints with complete longitudinal values.",
          }
        : longitudinalCandidate
        ? {
            testType: "mixed_effects",
            label: "Mixed-Effects",
            reason: "Animals span multiple timepoints, but some longitudinal values are missing, so the mixed-effects path is safer.",
          }
        : {
            testType: "descriptive",
            label: "Longitudinal Review",
            reason: "Multiple timepoints are present, but there are not enough repeated animals yet for longitudinal inference.",
          },
    );
  }

  if (hasBinaryOutcome && numericKeys.length >= 1) {
    suggestions.push({
      testType: "roc_curve",
      label: "ROC Curve",
      reason: "A binary-like outcome and numeric score are both present, so discrimination analysis is available.",
    });
    suggestions.push({
      testType: "kaplan_meier",
      label: "Kaplan-Meier",
      reason: "A numeric duration plus binary event field can support survival-style summaries.",
    });
    suggestions.push({
      testType: "log_rank",
      label: "Log-rank",
      reason: "When event/censoring fields exist across groups, survival curves can be compared directly.",
    });
  }

  if (suggestions.some((suggestion) => inferPowerBaseTest(suggestion.testType))) {
    suggestions.push({
      testType: "power_planning",
      label: "Power Planning",
      reason: "This analysis set supports inferential modeling, so you can plan required N, achieved power, or the minimum detectable effect.",
    });
  }

  return suggestions.filter(
    (suggestion, index, arr) => arr.findIndex((entry) => entry.testType === suggestion.testType) === index,
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ColonyAnalysisPanel({
  animals,
  cohorts,
  colonyResults,
  experimentRuns,
  runAssignments,
  runTimepoints,
  runTimepointExperiments,
  savedAnalysisDatasets,
  savedAnalysisRevisions,
  saveAnalysisRevision,
  deleteAnalysis,
  updateAnalysisRevisionMetadata,
}: ColonyAnalysisPanelProps) {
  // ── Filter state ──
  const [activeRunId, setActiveRunId] = useState<string>("__all__");
  const [selectedExperiment, setSelectedExperiment] = useState<string>(
    () => colonyResults[0]?.experiment_type || "__all__"
  );
  const [selectedTimepoint, setSelectedTimepoint] = useState<string>("__all__");
  const [selectedCohort, setSelectedCohort] = useState<string>("__all__");
  const [excludedAnimalIds, setExcludedAnimalIds] = useState<Set<string>>(new Set());
  // Groups the user has de-selected for the current analysis. Feeds into
  // includedFlatData so every downstream computation (stats tests,
  // significance brackets, bar chart groups, n labels) respects the
  // subset. Empty set means "include all groups", which is the default.
  const [excludedGroups, setExcludedGroups] = useState<Set<string>>(new Set());
  const [exclusionReasons, setExclusionReasons] = useState<Record<string, string>>({});
  const [exclusionSources, setExclusionSources] = useState<Record<string, AnalysisAuditSource>>({});
  const [outlierFlags, setOutlierFlags] = useState<Record<string, boolean>>({});
  const [outlierModes, setOutlierModes] = useState<Record<string, OutlierMode>>({});
  const [outlierScores, setOutlierScores] = useState<Record<string, number>>({});
  const [animalSearch, setAnimalSearch] = useState("");
  const [analysisName, setAnalysisName] = useState("Untitled Colony Analysis");
  const [analysisDescription, setAnalysisDescription] = useState("");
  const [selectedSavedAnalysisId, setSelectedSavedAnalysisId] = useState<string>("__new__");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>("__latest__");
  const [compareRevisionId, setCompareRevisionId] = useState<string>("__none__");
  const [statsDraft, setStatsDraft] = useState<ColonyAnalysisStatsDraft>(defaultStatsDraft());
  const [visualizationDraft, setVisualizationDraft] = useState<ColonyAnalysisVisualizationDraft>(defaultVisualizationDraft());
  const [figureStudioDraft, setFigureStudioDraft] = useState<FigureStudioDraft>(
    defaultFigureStudioDraft(defaultVisualizationDraft().chartType),
  );
  const [savedResult, setSavedResult] = useState<Record<string, unknown> | null>(null);
  const [loadedRevisionKey, setLoadedRevisionKey] = useState<string>("draft");
  const [activeTab, setActiveTab] = useState("summary");

  const visibleRuns = useMemo(() => experimentRuns.filter((run) => run.status !== "cancelled"), [experimentRuns]);
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
  const savedAnalysisRoots = useMemo<SavedColonyAnalysisRoot[]>(
    () =>
      savedAnalysisDatasets
        .map((dataset) => ({
          id: dataset.id,
          name: dataset.name,
          description: dataset.description,
          created_at: dataset.created_at,
          updated_at: dataset.updated_at,
        }))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [savedAnalysisDatasets],
  );
  const revisionsByAnalysisId = useMemo(() => {
    const map = new Map<string, SavedColonyAnalysisRevision[]>();
    for (const analysis of savedAnalysisRevisions) {
      const revisionNumber =
        typeof analysis.config?.revision_number === "number"
          ? Number(analysis.config.revision_number)
          : 1;
      const list = map.get(analysis.dataset_id) || [];
      list.push({
        id: analysis.id,
        analysisId: analysis.dataset_id,
        name: analysis.name,
        revisionNumber,
        createdAt: analysis.created_at,
        config: analysis.config || {},
        results: analysis.results || {},
        summaryText: analysis.ai_interpretation || null,
      });
      map.set(analysis.dataset_id, list);
    }
    for (const [key, revisions] of map.entries()) {
      map.set(
        key,
        revisions.sort((a, b) => b.revisionNumber - a.revisionNumber || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      );
    }
    return map;
  }, [savedAnalysisRevisions]);
  const filteredResults = useMemo(() => {
    let results = colonyResults.filter(resultHasData);
    if (selectedRun) {
      results = results.filter((result) => result.experiment_run_id === selectedRun.id);
    }
    return results;
  }, [colonyResults, selectedRun]);
  const currentSavedRevisions =
    selectedSavedAnalysisId !== "__new__" ? revisionsByAnalysisId.get(selectedSavedAnalysisId) || [] : [];
  const selectedSavedRevision =
    selectedSavedAnalysisId === "__new__"
      ? null
      : selectedRevisionId === "__latest__"
      ? currentSavedRevisions[0] || null
      : currentSavedRevisions.find((revision) => revision.id === selectedRevisionId) || null;
  const compareRevision =
    selectedSavedAnalysisId === "__new__" || compareRevisionId === "__none__"
      ? null
      : currentSavedRevisions.find((revision) => revision.id === compareRevisionId) || null;
  const selectedRevisionFinalized = Boolean(selectedSavedRevision?.config?.finalized);

  // Available experiment types from results
  const availableExperiments = useMemo(() => {
    if (selectedRun) {
      return uniqueNonEmptyOptions(selectedRunExperiments.map((experiment) => experiment.experiment_key));
    }
    return uniqueNonEmptyOptions(filteredResults.map((result) => result.experiment_type)).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [filteredResults, selectedRun, selectedRunExperiments]);

  const resolvedSelectedExperiment =
    selectedExperiment === "__all__" || availableExperiments.includes(selectedExperiment) ? selectedExperiment : "__all__";
  const effectiveSelectedExperiment =
    resolvedSelectedExperiment;

  // Available timepoints from results, scoped by selected experiment.
  const availableTimepoints = useMemo(() => {
    if (selectedRun) {
      const scopedTimepoints =
        effectiveSelectedExperiment && effectiveSelectedExperiment !== "__all__"
          ? selectedRunTimepoints.filter((timepoint) =>
              selectedRunExperiments.some(
                (experiment) =>
                  experiment.run_timepoint_id === timepoint.id && experiment.experiment_key === effectiveSelectedExperiment,
              ),
            )
          : selectedRunTimepoints;
      return scopedTimepoints.map((timepoint) => timepoint.target_age_days).sort((a, b) => a - b);
    }
    const scoped =
      effectiveSelectedExperiment && effectiveSelectedExperiment !== "__all__"
        ? filteredResults.filter((r) => r.experiment_type === effectiveSelectedExperiment)
        : filteredResults;
    const tps = new Set(scoped.map((r) => r.timepoint_age_days));
    return Array.from(tps).sort((a, b) => a - b);
  }, [effectiveSelectedExperiment, filteredResults, selectedRun, selectedRunExperiments, selectedRunTimepoints]);

  const effectiveSelectedTimepoint =
    selectedTimepoint !== "__all__" && !availableTimepoints.includes(Number(selectedTimepoint))
      ? "__all__"
      : selectedTimepoint;

  // ── Schema-declared measures for the current run/experiment/timepoint ──
  // When a run is selected, we want the measure dropdown to surface ONLY the
  // columns declared in the run's schema for the matching
  // (timepoint × experiment) combinations — not every stale/extra key that
  // might live inside a result's measures blob. This is the "we report what
  // we say we report" guarantee for run-scoped analyses.
  const allowedMeasureKeys = useMemo<Set<string> | null>(() => {
    if (!selectedRun) return null; // Legacy path — no schema constraint.
    const selectedTimepointId =
      effectiveSelectedTimepoint !== "__all__"
        ? selectedRunTimepoints.find(
            (timepoint) => timepoint.target_age_days === Number(effectiveSelectedTimepoint),
          )?.id || null
        : null;

    const matching = selectedRunExperiments.filter((experiment) => {
      if (
        effectiveSelectedExperiment !== "__all__" &&
        experiment.experiment_key !== effectiveSelectedExperiment
      ) {
        return false;
      }
      if (selectedTimepointId && experiment.run_timepoint_id !== selectedTimepointId) {
        return false;
      }
      return true;
    });

    if (matching.length === 0) return null; // No schema info — don't over-hide.

    const keys = new Set<string>();
    for (const experiment of matching) {
      const snapshot = (experiment.schema_snapshot || []) as Array<{ key?: string }>;
      for (const column of snapshot) {
        if (column.key) keys.add(column.key);
      }
      // Whitelist any derived-measure keys for this experiment so computed
      // columns (e.g. Y-maze Total Entries) survive the schema filter even
      // when the run's schema_snapshot didn't explicitly declare them.
      const derivedKeys = DERIVED_MEASURE_KEYS_BY_EXPERIMENT[experiment.experiment_key] || [];
      for (const k of derivedKeys) keys.add(k);
    }
    return keys.size > 0 ? keys : null;
  }, [
    selectedRun,
    selectedRunExperiments,
    selectedRunTimepoints,
    effectiveSelectedExperiment,
    effectiveSelectedTimepoint,
  ]);

  // Label override map built from the run's schema snapshots so the measure
  // dropdown / axis labels show the labels the PI chose for this run instead
  // of auto-generated Title Case guesses.
  const schemaLabelByKey = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (!selectedRun) return map;
    for (const experiment of selectedRunExperiments) {
      const snapshot = (experiment.schema_snapshot || []) as Array<{
        key?: string;
        label?: string;
      }>;
      for (const column of snapshot) {
        if (column.key && column.label && !map[column.key]) {
          map[column.key] = column.label;
        }
      }
    }
    return map;
  }, [selectedRun, selectedRunExperiments]);

  // ── Build flat dataset ──
  const { scopedFlatData, scopedMeasureKeys, scopedMeasureLabels } = useMemo(() => {
    let results = filteredResults;

    if (effectiveSelectedExperiment !== "__all__") {
      results = results.filter((r) => r.experiment_type === effectiveSelectedExperiment);
    }
    if (effectiveSelectedTimepoint !== "__all__") {
      results = results.filter((r) => r.timepoint_age_days === Number(effectiveSelectedTimepoint));
    }

    const rows: FlatRow[] = [];
    const keySet = new Set<string>();
    const labels: Record<string, string> = {};

    for (const result of results) {
      const animal = animals.find((a) => a.id === result.animal_id);
      if (!animal) continue;
      if (selectedCohort !== "__all__" && animal.cohort_id !== selectedCohort) continue;
      if (selectedRun && !animalMatchesRunAssignments(animal, selectedRunAssignments)) continue;

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
        experiment:
          selectedRun && result.run_timepoint_experiment_id
            ? selectedRunExperiments.find((item) => item.id === result.run_timepoint_experiment_id)?.label || result.experiment_type
            : result.experiment_type,
      };

      // Apply derivations (e.g. Y-maze total_entries = sum of arm entries)
      // on read so legacy results imported before the derivation existed
      // still surface the derived columns. Import already stores the
      // derived value going forward; this is a defensive fallback.
      const rawMeasures = (result.measures || {}) as Record<string, string | number | null>;
      const measures = applyDerivedMeasures(
        result.experiment_type,
        rawMeasures,
      ) as Record<string, string | number | null>;
      for (const [rawKey, value] of Object.entries(measures)) {
        const key = normalizeOptionValue(rawKey);
        if (!key || key.startsWith("__")) continue; // Skip internal fields (__cage_image, __raw_data_url)
        // When a run is selected and its schema declares a column set, hide
        // any measure keys that aren't in the schema. This prevents stale
        // keys inside result.measures (e.g. mislabelled legacy imports) from
        // becoming plottable columns and silently producing wrong reports.
        // Derived keys are whitelisted above, so they survive this check.
        if (allowedMeasureKeys && !allowedMeasureKeys.has(key)) continue;
        if (value !== null && value !== undefined) {
          row[key] = typeof value === "string" && !isNaN(Number(value)) ? Number(value) : value;
          keySet.add(key);
          if (!labels[key]) {
            labels[key] =
              schemaLabelByKey[key] ||
              DERIVED_MEASURE_LABELS[key] ||
              key
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
      scopedFlatData: rows,
      scopedMeasureKeys: Array.from(keySet).sort(),
      scopedMeasureLabels: labels,
    };
  }, [
    animals,
    cohorts,
    effectiveSelectedExperiment,
    effectiveSelectedTimepoint,
    filteredResults,
    selectedCohort,
    selectedRun,
    selectedRunAssignments,
    selectedRunExperiments,
    allowedMeasureKeys,
    schemaLabelByKey,
  ]);

  const analysisAnimals = useMemo<AnalysisAnimalRow[]>(() => {
    const animalMap = new Map<string, AnalysisAnimalRow>();
    for (const row of scopedFlatData) {
      const existing = animalMap.get(row.animal_id);
      if (existing) {
        existing.rowCount += 1;
        existing.included = !excludedAnimalIds.has(row.animal_id);
        continue;
      }
      animalMap.set(row.animal_id, {
        animal_id: row.animal_id,
        identifier: row.identifier,
        cohort: row.cohort,
        sex: row.sex,
        genotype: row.genotype,
        group: row.group,
        rowCount: 1,
        included: !excludedAnimalIds.has(row.animal_id),
      });
    }
    return Array.from(animalMap.values()).sort((a, b) =>
      a.cohort === b.cohort
        ? a.identifier.localeCompare(b.identifier, undefined, { numeric: true })
        : a.cohort.localeCompare(b.cohort, undefined, { numeric: true }),
    );
  }, [excludedAnimalIds, scopedFlatData]);

  const visibleAnalysisAnimals = useMemo(() => {
    const query = animalSearch.trim().toLowerCase();
    if (!query) return analysisAnimals;
    return analysisAnimals.filter((animal) =>
      [
        animal.identifier,
        animal.cohort,
        animal.sex,
        animal.genotype,
        animal.group,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [analysisAnimals, animalSearch]);

  const includedFlatData = useMemo(
    () =>
      scopedFlatData.filter((row) => {
        if (excludedAnimalIds.has(row.animal_id)) return false;
        // Subset-group filter: if the user de-selected the row's group,
        // drop it from the pipeline so stats + brackets + chart all
        // reflect the chosen subset.
        if (excludedGroups.size > 0 && excludedGroups.has(row.group)) return false;
        return true;
      }),
    [excludedAnimalIds, excludedGroups, scopedFlatData],
  );

  const { flatData, measureKeys, measureLabels } = useMemo(() => {
    const keySet = new Set<string>();
    const labels: Record<string, string> = {};
    for (const row of includedFlatData) {
      for (const key of scopedMeasureKeys) {
        if (row[key] === null || row[key] === undefined || row[key] === "") continue;
        keySet.add(key);
        labels[key] = scopedMeasureLabels[key] || key;
      }
    }
    return {
      flatData: includedFlatData,
      measureKeys: Array.from(keySet).sort(),
      measureLabels: labels,
    };
  }, [includedFlatData, scopedMeasureKeys, scopedMeasureLabels]);

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
  // All groups that exist in the scoped data BEFORE the subset picker's
  // exclusions. Drives the "Groups in this analysis" toggle UI so that
  // deselecting a group doesn't make it disappear from the picker itself.
  const allGroupsInScope = useMemo(() => {
    const groups = new Set(scopedFlatData.map((r) => r.group));
    const ordered = GROUP_ORDER.filter((g) => groups.has(g));
    const extras = Array.from(groups).filter((g) => !GROUP_ORDER.includes(g)).sort();
    return [...ordered, ...extras];
  }, [scopedFlatData]);

  const includedAnimalCount = analysisAnimals.filter((animal) => animal.included).length;
  const excludedAnimalCount = analysisAnimals.length - includedAnimalCount;
  const excludedFlatData = useMemo(
    () => scopedFlatData.filter((row) => excludedAnimalIds.has(row.animal_id)),
    [excludedAnimalIds, scopedFlatData],
  );
  const activeExclusions = useMemo(
    () =>
      Array.from(new Set([...Object.keys(exclusionReasons), ...Array.from(excludedAnimalIds)]))
        .filter((animalId) => excludedAnimalIds.has(animalId))
        .map((animalId) => ({
          animalId,
          reason: exclusionReasons[animalId] || "",
          source: exclusionSources[animalId] || "manual",
          outlierFlagged: Boolean(outlierFlags[animalId]),
          outlierMode: outlierModes[animalId],
          outlierScore: outlierScores[animalId],
        })),
    [excludedAnimalIds, exclusionReasons, exclusionSources, outlierFlags, outlierModes, outlierScores],
  );
  const currentAnalysisSetEntries = useMemo<AnalysisSetEntry[]>(
    () =>
      analysisAnimals.map((animal) => ({
        animalId: animal.animal_id,
        included: !excludedAnimalIds.has(animal.animal_id),
        reason: exclusionReasons[animal.animal_id] || "",
        source: exclusionSources[animal.animal_id] || "manual",
        outlierFlagged: Boolean(outlierFlags[animal.animal_id]),
        outlierMode: outlierModes[animal.animal_id],
        outlierScore: outlierScores[animal.animal_id] ?? null,
      })),
    [analysisAnimals, excludedAnimalIds, exclusionReasons, exclusionSources, outlierFlags, outlierModes, outlierScores],
  );
  const revisionDiff = summarizeRevisionDiff(compareRevision, selectedSavedRevision);
  const currentReportPayload = useMemo(
    () =>
      generateAnalysisReport({
        result: savedResult,
        statsDraft,
        visualizationDraft,
        figureStudioDraft,
        measureLabels,
        includedCount: includedAnimalCount,
        excludedCount: excludedAnimalCount,
        analysisName,
        exclusions: activeExclusions,
      }),
    [
      activeExclusions,
      analysisName,
      excludedAnimalCount,
      figureStudioDraft,
      includedAnimalCount,
      measureLabels,
      savedResult,
      statsDraft,
      visualizationDraft,
    ],
  );
  const suggestedTests = useMemo(
    () =>
      suggestAnalysisTests({
        flatData,
        numericKeys: numericMeasureKeys,
        hasMultipleTimepoints: Array.from(new Set(flatData.map((row) => row.timepoint))).length > 1,
      }),
    [flatData, numericMeasureKeys],
  );
  const workflowSteps = [
    {
      title: "Choose scope",
      done:
        resolvedRunId !== "__all__" ||
        effectiveSelectedExperiment !== "__all__" ||
        effectiveSelectedTimepoint !== "__all__" ||
        selectedCohort !== "__all__",
    },
    { title: "Review animals", done: analysisAnimals.length > 0 },
    { title: "Handle exclusions", done: excludedAnimalCount > 0 || flatData.length > 0 },
    { title: "Pick a test", done: Boolean(statsDraft.measureKey) && suggestedTests.length > 0 },
    { title: "Run statistics", done: Boolean(savedResult) },
    { title: "Save revision", done: selectedSavedAnalysisId !== "__new__" },
  ];

  /* eslint-disable react-hooks/set-state-in-effect -- saved-analysis selection must realign when the available revisions change. */
  useEffect(() => {
    if (savedAnalysisRoots.length === 0) return;
    if (selectedSavedAnalysisId === "__new__") return;
    if (savedAnalysisRoots.some((root) => root.id === selectedSavedAnalysisId)) return;
    setSelectedSavedAnalysisId(savedAnalysisRoots[0]?.id || "__new__");
  }, [savedAnalysisRoots, selectedSavedAnalysisId]);

  useEffect(() => {
    if (!selectedSavedRevision) return;
    const normalizedRevision = normalizeSavedRevisionEnvelope({
      config: selectedSavedRevision.config || null,
      results: selectedSavedRevision.results || null,
    });
    const scope = normalizedRevision.config.scope;
    const analysisSetEntries = normalizedRevision.config.analysisSet.entries;
    const stats = normalizedRevision.config.statistics;
    const loadedResult = normalizedRevision.results.rawResult || normalizeSavedResult(selectedSavedRevision.results || null);
    const visualization = deriveVisualizationDraftFromResult(
      loadedResult,
      normalizedRevision.config.visualization.draft,
    );
    const effectiveEntries =
      analysisSetEntries.length > 0
        ? analysisSetEntries
        : normalizedRevision.config.analysisSet.excludedAnimals.map((entry) =>
            normalizeAnalysisSetEntry({
              animalId: entry.animalId,
              included: false,
              reason: entry.reason,
              source: "manual",
            }),
          );

    setAnalysisName(selectedSavedRevision.name || "Untitled Colony Analysis");
    setAnalysisDescription(String(normalizedRevision.config.description || ""));
    setActiveRunId(typeof scope.runId === "string" ? scope.runId : "__all__");
    setSelectedExperiment(typeof scope.experiment === "string" ? scope.experiment : "__all__");
    setSelectedTimepoint(typeof scope.timepoint === "string" ? scope.timepoint : "__all__");
    setSelectedCohort(typeof scope.cohort === "string" ? scope.cohort : "__all__");
    setAnimalSearch(String(normalizedRevision.config.analysisSet.preset.search || ""));
    setExcludedAnimalIds(
      new Set(
        effectiveEntries
          .filter((entry) => entry.included === false)
          .map((entry) => String(entry.animalId || ""))
          .filter(Boolean),
      ),
    );
    setExclusionReasons(
      effectiveEntries.reduce<Record<string, string>>((acc, entry) => {
        const animalId = String(entry.animalId || "").trim();
        if (!animalId) return acc;
        acc[animalId] = String(entry.reason || "");
        return acc;
      }, {}),
    );
    setExclusionSources(
      effectiveEntries.reduce<Record<string, AnalysisAuditSource>>((acc, entry) => {
        const animalId = String(entry.animalId || "").trim();
        if (!animalId) return acc;
        acc[animalId] = (String(entry.source || "manual") as AnalysisAuditSource);
        return acc;
      }, {}),
    );
    setOutlierFlags(
      effectiveEntries.reduce<Record<string, boolean>>((acc, entry) => {
        const animalId = String(entry.animalId || "").trim();
        if (!animalId) return acc;
        acc[animalId] = Boolean(entry.outlierFlagged);
        return acc;
      }, {}),
    );
    setOutlierModes(
      effectiveEntries.reduce<Record<string, OutlierMode>>((acc, entry) => {
        const animalId = String(entry.animalId || "").trim();
        if (!animalId || !entry.outlierMode) return acc;
        acc[animalId] = String(entry.outlierMode) as OutlierMode;
        return acc;
      }, {}),
    );
    setOutlierScores(
      effectiveEntries.reduce<Record<string, number>>((acc, entry) => {
        const animalId = String(entry.animalId || "").trim();
        const value = Number(entry.outlierScore);
        if (!animalId || Number.isNaN(value)) return acc;
        acc[animalId] = value;
        return acc;
      }, {}),
    );
    setStatsDraft(stats);
    setVisualizationDraft(visualization);
    setFigureStudioDraft(
      normalizeFigureStudioDraft(
        normalizedRevision.config.visualization.figureStudio,
        visualization.chartType,
        "",
        visualization.measureKey,
      ),
    );
    setSavedResult(loadedResult);
    setLoadedRevisionKey(selectedSavedRevision.id);
  }, [selectedSavedRevision]);

  useEffect(() => {
    if (selectedSavedAnalysisId !== "__new__") return;
    setSelectedRevisionId("__latest__");
    setCompareRevisionId("__none__");
  }, [selectedSavedAnalysisId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const exportAnalysisRows = useCallback(
    (rows: FlatRow[], fileLabel: string) => {
      const headers = ["Identifier", "Sex", "Genotype", "Group", "Cohort", "Timepoint", "Experiment", ...measureKeys];
      const csv = Papa.unparse({
        fields: headers,
        data: rows.map((row) => [
          row.identifier,
          row.sex,
          row.genotype,
          row.group,
          row.cohort,
          row.timepoint,
          row.experiment,
          ...measureKeys.map((key) => row[key] ?? ""),
        ]),
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileLabel}-${new Date().toISOString().split("T")[0]}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [measureKeys],
  );

  const handleExportSummary = () => {
    const configEnvelope = buildRevisionConfigEnvelope({
      description: analysisDescription,
      scope: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
      },
      excludedAnimals: activeExclusions,
      analysisSetEntries: currentAnalysisSetEntries,
      analysisSetPreset: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
        search: animalSearch,
      },
      statsDraft,
      visualizationDraft,
      figureStudioDraft,
      resultTables: currentReportPayload?.resultTables || [],
      reportWarnings: currentReportPayload?.reportWarnings || [],
      figureMetadata: currentReportPayload?.figureMetadata || null,
      figurePacket: currentReportPayload?.figurePacket || null,
      multiEndpointResults: currentReportPayload?.multiEndpointResults || [],
      includedAnimalCount,
      excludedAnimalCount,
      finalized: Boolean(selectedSavedRevision?.config?.finalized),
      finalizedAt:
        typeof selectedSavedRevision?.config?.finalizedAt === "string"
          ? String(selectedSavedRevision?.config?.finalizedAt)
          : null,
      duplicatedFromRevisionId:
        typeof selectedSavedRevision?.config?.duplicatedFromRevisionId === "string"
          ? String(selectedSavedRevision?.config?.duplicatedFromRevisionId)
          : null,
      revisionNumber: selectedSavedRevision?.revisionNumber || null,
    });
    const resultsEnvelope = buildRevisionResultsEnvelope({
      rawResult: savedResult,
      reportSummary:
        currentReportPayload?.reportSummary || summarizeAnalysisResult(savedResult, includedAnimalCount, excludedAnimalCount) || "",
      reportResultsText: currentReportPayload?.reportResultsText || "",
      reportMethodsText: currentReportPayload?.reportMethodsText || "",
      reportCaption: currentReportPayload?.reportCaption || "",
      reportWarnings: currentReportPayload?.reportWarnings || [],
      diagnostics: currentReportPayload?.diagnostics || [],
      resultTables: currentReportPayload?.resultTables || [],
      figurePacket: currentReportPayload?.figurePacket || null,
      figureMetadata: currentReportPayload?.figureMetadata || null,
      multiEndpointResults: currentReportPayload?.multiEndpointResults || [],
      includedAnimalCount,
      excludedAnimalCount,
    });
    const payload = {
      name: analysisName,
      description: analysisDescription,
      schemaVersion: COLONY_ANALYSIS_SCHEMA_VERSION,
      scope: configEnvelope.scope,
      config: configEnvelope,
      resultsEnvelope,
      summary: currentReportPayload?.reportSummary || summarizeAnalysisResult(savedResult, includedAnimalCount, excludedAnimalCount),
      report: currentReportPayload,
      results: savedResult,
      includedAnimals: includedAnimalCount,
      excludedAnimals: excludedAnimalCount,
      exclusions: activeExclusions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${analysisName.replace(/\s+/g, "-").toLowerCase() || "colony-analysis"}-summary.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Analysis summary exported.");
  };

  const handleExportReport = useCallback(() => {
    if (!currentReportPayload) {
      toast.error("Run an analysis first to generate a report.");
      return;
    }
    const reportText = renderAnalysisReportMarkdown({
      analysisName,
      reportPayload: currentReportPayload,
      exclusions: activeExclusions,
    });
    const blob = new Blob([reportText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${analysisName.replace(/\s+/g, "-").toLowerCase() || "colony-analysis"}-report.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Human-readable report exported.");
  }, [activeExclusions, analysisName, currentReportPayload]);

  const handleExportFigurePacket = useCallback(() => {
    if (!currentReportPayload) {
      toast.error("Run an analysis first to generate figure output.");
      return;
    }
    const packet = {
      analysisName,
      ...buildFigurePacket(currentReportPayload),
    };
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${analysisName.replace(/\s+/g, "-").toLowerCase() || "colony-analysis"}-figure-packet.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Figure packet exported.");
  }, [analysisName, currentReportPayload]);

  const handleSaveAnalysis = async (mode: "new" | "revision") => {
    if (!savedResult) {
      toast.error("Run an analysis first so there is something meaningful to save.");
      return;
    }
    const configEnvelope = buildRevisionConfigEnvelope({
      description: analysisDescription.trim() || null,
      scope: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
      },
      excludedAnimals: Array.from(excludedAnimalIds).map((animalId) => ({
        animalId,
        reason: exclusionReasons[animalId] || "",
      })),
      analysisSetEntries: currentAnalysisSetEntries,
      analysisSetPreset: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
        search: animalSearch,
      },
      statsDraft,
      visualizationDraft,
      figureStudioDraft,
      resultTables: currentReportPayload?.resultTables || [],
      reportWarnings: currentReportPayload?.reportWarnings || [],
      figureMetadata: currentReportPayload?.figureMetadata || null,
      figurePacket: currentReportPayload?.figurePacket || null,
      multiEndpointResults: currentReportPayload?.multiEndpointResults || [],
      includedAnimalCount,
      excludedAnimalCount,
      finalized: Boolean(selectedSavedRevision?.config?.finalized),
      finalizedAt:
        typeof selectedSavedRevision?.config?.finalizedAt === "string"
          ? String(selectedSavedRevision?.config?.finalizedAt)
          : null,
      revisionNumber: selectedSavedRevision?.revisionNumber || null,
    });
    const resultsEnvelope = buildRevisionResultsEnvelope({
      rawResult: savedResult,
      reportSummary:
        currentReportPayload?.reportSummary || summarizeAnalysisResult(savedResult, includedAnimalCount, excludedAnimalCount) || "",
      reportResultsText: currentReportPayload?.reportResultsText || "",
      reportMethodsText: currentReportPayload?.reportMethodsText || "",
      reportCaption: currentReportPayload?.reportCaption || "",
      reportWarnings: currentReportPayload?.reportWarnings || [],
      diagnostics: currentReportPayload?.diagnostics || [],
      resultTables: currentReportPayload?.resultTables || [],
      figurePacket: currentReportPayload?.figurePacket || null,
      figureMetadata: currentReportPayload?.figureMetadata || null,
      multiEndpointResults: currentReportPayload?.multiEndpointResults || [],
      includedAnimalCount,
      excludedAnimalCount,
    });
    const payload = {
      reportPayload: currentReportPayload,
      analysisId: mode === "revision" && selectedSavedAnalysisId !== "__new__" ? selectedSavedAnalysisId : null,
      name: analysisName.trim() || "Untitled Colony Analysis",
      description: analysisDescription.trim() || null,
      config: configEnvelope as unknown as Record<string, unknown>,
      results: resultsEnvelope as unknown as Record<string, unknown>,
      summaryText: resultsEnvelope.reportSummary,
    };
    try {
      const result = await saveAnalysisRevision(payload);
      if (result.success) {
        toast.success(mode === "new" ? "Saved as a new Colony Analysis." : `Saved revision ${result.revisionNumber ?? ""}.`.trim());
        if (result.analysisId) setSelectedSavedAnalysisId(result.analysisId);
        if (result.revisionId) {
          setSelectedRevisionId(result.revisionId);
          setLoadedRevisionKey(result.revisionId);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Colony Analysis.");
    }
  };

  const handleDeleteAnalysis = useCallback(async () => {
    if (selectedSavedAnalysisId === "__new__") return;
    if (!confirm(`Delete "${analysisName}" and all of its revisions?`)) return;
    try {
      await deleteAnalysis(selectedSavedAnalysisId);
      toast.success("Saved analysis deleted.");
      setSelectedSavedAnalysisId("__new__");
      setSelectedRevisionId("__latest__");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete saved analysis.");
    }
  }, [analysisName, deleteAnalysis, selectedSavedAnalysisId]);

  const markAnimalExclusion = useCallback((animalId: string, included: boolean, source: AnalysisAuditSource, reason = "") => {
    setExcludedAnimalIds((current) => {
      const next = new Set(current);
      if (included) next.delete(animalId);
      else next.add(animalId);
      return next;
    });
    setExclusionSources((current) => ({ ...current, [animalId]: source }));
    if (reason) {
      setExclusionReasons((current) => ({ ...current, [animalId]: reason }));
    }
  }, []);

  const handleRunOutlierScreen = useCallback(
    (mode: OutlierMode) => {
      if (!statsDraft.measureKey) {
        toast.error("Choose an outcome measure first for outlier screening.");
        return;
      }
      const scores = detectOutlierScores(flatData, statsDraft.measureKey, statsDraft.outlierMethod, statsDraft.outlierThreshold);
      setOutlierFlags((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(scores).map(([animalId, payload]) => [animalId, payload.flagged])),
      }));
      setOutlierScores((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(scores).map(([animalId, payload]) => [animalId, payload.score])),
      }));
      setOutlierModes((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(scores).filter(([, payload]) => payload.flagged).map(([animalId]) => [animalId, mode])),
      }));
      Object.entries(scores).forEach(([animalId, payload]) => {
        if (!payload.flagged) return;
        if (mode === "restore") {
          markAnimalExclusion(animalId, true, "restored", "");
          return;
        }
        markAnimalExclusion(
          animalId,
          mode !== "exclude",
          "outlier",
          `${statsDraft.outlierMethod.toUpperCase()} outlier screen (${statsDraft.measureKey}) score ${payload.score.toFixed(2)}`,
        );
      });
      const flaggedCount = Object.values(scores).filter((payload) => payload.flagged).length;
      toast.success(
        flaggedCount > 0
          ? `Flagged ${flaggedCount} outlier${flaggedCount === 1 ? "" : "s"} using ${statsDraft.outlierMethod.toUpperCase()}.`
          : "No outliers were flagged with the current settings.",
      );
    },
    [flatData, markAnimalExclusion, statsDraft.measureKey, statsDraft.outlierMethod, statsDraft.outlierThreshold],
  );

  const handleDuplicateAnalysis = async () => {
    if (!savedResult) {
      toast.error("Run or load an analysis first.");
      return;
    }
    const configEnvelope = buildRevisionConfigEnvelope({
      description: analysisDescription.trim() || null,
      scope: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
      },
      excludedAnimals: Array.from(excludedAnimalIds).map((animalId) => ({
        animalId,
        reason: exclusionReasons[animalId] || "",
      })),
      analysisSetEntries: currentAnalysisSetEntries,
      analysisSetPreset: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
        search: animalSearch,
      },
      statsDraft,
      visualizationDraft,
      figureStudioDraft,
      resultTables: currentReportPayload?.resultTables || [],
      reportWarnings: currentReportPayload?.reportWarnings || [],
      figureMetadata: currentReportPayload?.figureMetadata || null,
      figurePacket: currentReportPayload?.figurePacket || null,
      multiEndpointResults: currentReportPayload?.multiEndpointResults || [],
      includedAnimalCount,
      excludedAnimalCount,
      finalized: false,
      duplicatedFromRevisionId: selectedSavedRevision?.id || null,
      revisionNumber: null,
    });
    const resultsEnvelope = buildRevisionResultsEnvelope({
      rawResult: savedResult,
      reportSummary:
        currentReportPayload?.reportSummary || summarizeAnalysisResult(savedResult, includedAnimalCount, excludedAnimalCount) || "",
      reportResultsText: currentReportPayload?.reportResultsText || "",
      reportMethodsText: currentReportPayload?.reportMethodsText || "",
      reportCaption: currentReportPayload?.reportCaption || "",
      reportWarnings: currentReportPayload?.reportWarnings || [],
      diagnostics: currentReportPayload?.diagnostics || [],
      resultTables: currentReportPayload?.resultTables || [],
      figurePacket: currentReportPayload?.figurePacket || null,
      figureMetadata: currentReportPayload?.figureMetadata || null,
      multiEndpointResults: currentReportPayload?.multiEndpointResults || [],
      includedAnimalCount,
      excludedAnimalCount,
    });
    const payload = {
      analysisId: null,
      name: `${analysisName.trim() || "Colony Analysis"} Copy`,
      description: analysisDescription.trim() || null,
      config: configEnvelope as unknown as Record<string, unknown>,
      results: resultsEnvelope as unknown as Record<string, unknown>,
      summaryText: resultsEnvelope.reportSummary,
    };
    const result = await saveAnalysisRevision(payload);
    if (result.success && result.analysisId) {
      setSelectedSavedAnalysisId(result.analysisId);
      setSelectedRevisionId(result.revisionId || "__latest__");
      toast.success("Saved analysis duplicated.");
    }
  };

  const handleToggleFinalizeRevision = async () => {
    if (!selectedSavedRevision) return;
    try {
      await updateAnalysisRevisionMetadata({
        revisionId: selectedSavedRevision.id,
        configPatch: {
          finalized: !selectedRevisionFinalized,
          finalizedAt: !selectedRevisionFinalized ? new Date().toISOString() : null,
        },
      });
      toast.success(selectedRevisionFinalized ? "Revision unlocked for editing." : "Revision finalized.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update revision status.");
    }
  };

  const handleExportResultTables = useCallback(() => {
    if (!savedResult) {
      toast.error("Run an analysis first to export result tables.");
      return;
    }
    const tables = currentReportPayload?.resultTables || buildStructuredResultTables(savedResult);
    const rows: Array<Record<string, unknown>> = tables.flatMap((table) =>
      table.rows.map((row) => ({
        table: table.id,
        table_title: table.title,
        ...row,
      })),
    );
    if (rows.length === 0) {
      toast.error("This result does not currently expose structured tables.");
      return;
    }
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${analysisName.replace(/\s+/g, "-").toLowerCase() || "colony-analysis"}-tables.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Structured result tables exported.");
  }, [analysisName, currentReportPayload, savedResult]);

  if (colonyResults.length === 0) {
    return (
      <WorkspaceEmptyState
        icon="analysis"
        title="No analysis-ready results yet"
        description="Import or capture colony results first, then come back here to compare cohorts, inspect exclusions, and export analysis-ready summaries."
        primaryAction={{ label: "Open colony results", href: "/colony/results" }}
        secondaryAction={{ label: "Open colony tracker", href: "/colony/tracker" }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm">
        <CardContent className="pt-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <FolderOpen className="mt-0.5 h-4 w-4 text-slate-700" />
              <div>
                <p className="text-sm font-semibold leading-none text-slate-900">Saved Analyses</p>
                <p className="mt-1 text-xs text-slate-600">
                  Save this analysis as a reusable, versioned workflow with its own exclusions and outputs.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportAnalysisRows(flatData, "colony-analysis-included")}>
                <Download className="h-3.5 w-3.5" /> Included CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportAnalysisRows(excludedFlatData, "colony-analysis-excluded")}>
                <Download className="h-3.5 w-3.5" /> Excluded CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportSummary}>
                <Download className="h-3.5 w-3.5" /> Summary
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportReport}>
                <Download className="h-3.5 w-3.5" /> Report
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportFigurePacket}>
                <Download className="h-3.5 w-3.5" /> Figure Packet
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportResultTables} disabled={!savedResult}>
                <Download className="h-3.5 w-3.5" /> Tables
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleSaveAnalysis("new")}>
                <Save className="h-3.5 w-3.5" /> Save as New
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={selectedSavedAnalysisId === "__new__" || selectedRevisionFinalized}
                onClick={() => handleSaveAnalysis("revision")}
              >
                <Save className="h-3.5 w-3.5" /> Save Revision
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!savedResult}
                onClick={handleDuplicateAnalysis}
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={selectedSavedAnalysisId === "__new__" || !selectedSavedRevision}
                onClick={handleToggleFinalizeRevision}
              >
                <Check className="h-3.5 w-3.5" /> {selectedRevisionFinalized ? "Unlock" : "Finalize"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={selectedSavedAnalysisId === "__new__"}
                onClick={handleDeleteAnalysis}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs mb-1 block">Analysis</Label>
              <Select value={selectedSavedAnalysisId} onValueChange={setSelectedSavedAnalysisId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">New unsaved analysis</SelectItem>
                  {savedAnalysisRoots.map((root) => (
                    <SelectItem key={root.id} value={root.id}>{root.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Revision</Label>
              <Select value={selectedRevisionId} onValueChange={setSelectedRevisionId} disabled={selectedSavedAnalysisId === "__new__"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__latest__">Latest revision</SelectItem>
                  {currentSavedRevisions.map((revision) => (
                    <SelectItem key={revision.id} value={revision.id}>
                      Rev {revision.revisionNumber} · {new Date(revision.createdAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Compare Against</Label>
              <Select value={compareRevisionId} onValueChange={setCompareRevisionId} disabled={selectedSavedAnalysisId === "__new__"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No comparison</SelectItem>
                  {currentSavedRevisions
                    .filter((revision) => revision.id !== selectedSavedRevision?.id)
                    .map((revision) => (
                      <SelectItem key={revision.id} value={revision.id}>
                        Rev {revision.revisionNumber}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Analysis Name</Label>
              <Input value={analysisName} onChange={(event) => setAnalysisName(event.target.value)} placeholder="e.g. Run 1 30D Y-Maze" />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <Label className="text-xs mb-1 block">Description</Label>
              <Input value={analysisDescription} onChange={(event) => setAnalysisDescription(event.target.value)} placeholder="Optional methods / scope note" />
            </div>
          </div>
          {(selectedSavedRevision || revisionDiff) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {selectedSavedRevision && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Revision State</span>
                    {selectedRevisionFinalized ? (
                      <Badge className="bg-emerald-600 text-white">Finalized</Badge>
                    ) : (
                      <Badge variant="outline">Editable</Badge>
                    )}
                  </div>
                  <div className="mt-1">Revision {selectedSavedRevision.revisionNumber} saved {new Date(selectedSavedRevision.createdAt).toLocaleString()}.</div>
                </div>
              )}
              {revisionDiff && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-700">
                  <div className="font-medium">{revisionDiff.fromRevision} → {revisionDiff.toRevision}</div>
                  <div className="mt-1 space-y-1">
                    {revisionDiff.changes.map((change) => (
                      <div key={change}>• {change}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Filters ─── */}
      <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm">
        <CardContent className="pt-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Filter className="mt-0.5 h-4 w-4 text-cyan-700" />
              <div>
                <p className="text-sm font-semibold leading-none text-slate-900">Analysis Data</p>
                <p className="mt-1 text-xs text-slate-600">
                  Choose experiment scope before running stats or building plots.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[11px]">{flatData.length} rows</Badge>
              <Badge variant="outline" className="text-[11px]">{numericMeasureKeys.length} measures</Badge>
              <Badge variant="outline" className="text-[11px]">{availableGroups.length} groups</Badge>
              <Badge variant="outline" className="text-[11px]">{includedAnimalCount}/{analysisAnimals.length || 0} animals included</Badge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs mb-1 block">Run Scope</Label>
              <Select value={resolvedRunId} onValueChange={setActiveRunId}>
                <SelectTrigger>
                  <SelectValue />
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
            </div>
            <div>
              <Label className="text-xs mb-1 block">Experiment Type</Label>
              <Select value={resolvedSelectedExperiment} onValueChange={setSelectedExperiment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Experiments</SelectItem>
                    {availableExperiments.map((e) => (
                    <SelectItem key={e} value={e}>
                      {selectedRun
                        ? selectedRunExperiments.find((item) => item.experiment_key === e)?.label || EXPERIMENT_LABELS[e] || e
                        : EXPERIMENT_LABELS[e] || e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Timepoint</Label>
              <Select value={effectiveSelectedTimepoint} onValueChange={setSelectedTimepoint}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Timepoints</SelectItem>
                  {availableTimepoints.map((tp) => (
                    <SelectItem key={tp} value={String(tp)}>
                      {selectedRun
                        ? selectedRunTimepoints.find((item) => item.target_age_days === tp)?.label || `${tp} Day`
                        : `${tp} Day`}
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

      {analysisAnimals.length > 0 && (
        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm">
          <CardHeader className="border-b bg-slate-50/70 py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Analysis Set</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose which animals are included before running stats, graphs, or exports.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[11px]">{includedAnimalCount} included</Badge>
                {excludedAnimalCount > 0 && (
                  <Badge variant="outline" className="text-[11px] text-amber-700">{excludedAnimalCount} excluded</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={animalSearch}
                onChange={(event) => setAnimalSearch(event.target.value)}
                placeholder="Search animal, cohort, sex, genotype..."
                className="h-9 max-w-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExcludedAnimalIds(new Set());
                  setExclusionSources({});
                }}
                disabled={excludedAnimalCount === 0}
              >
                Include all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  visibleAnalysisAnimals.forEach((animal) =>
                    markAnimalExclusion(animal.animal_id, false, "rule", "Visible selection exclusion"),
                  )
                }
                disabled={visibleAnalysisAnimals.length === 0}
              >
                Exclude visible
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!statsDraft.measureKey}
                onClick={() =>
                  scopedFlatData
                    .filter((row) => row[statsDraft.measureKey] == null || row[statsDraft.measureKey] === "")
                    .forEach((row) => markAnimalExclusion(row.animal_id, false, "rule", `Missing selected outcome: ${statsDraft.measureKey}`))
                }
              >
                Exclude missing selected outcome
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {Array.from(new Set(analysisAnimals.map((animal) => animal.cohort))).map((cohort) => (
                <Button
                  key={cohort}
                  variant="ghost"
                  size="sm"
                  className="h-7 border"
                  onClick={() =>
                    analysisAnimals
                      .filter((animal) => animal.cohort === cohort)
                      .forEach((animal) => markAnimalExclusion(animal.animal_id, false, "rule", `Excluded cohort ${cohort}`))
                  }
                >
                  Exclude {cohort}
                </Button>
              ))}
              {["Male", "Female"].map((sex) => (
                <Button
                  key={sex}
                  variant="ghost"
                  size="sm"
                  className="h-7 border"
                  onClick={() =>
                    analysisAnimals
                      .filter((animal) => animal.sex === sex)
                      .forEach((animal) => markAnimalExclusion(animal.animal_id, false, "rule", `Excluded sex ${sex}`))
                  }
                >
                  Exclude {sex}
                </Button>
              ))}
              {["Hemi", "Het", "WT"].map((genotype) => (
                <Button
                  key={genotype}
                  variant="ghost"
                  size="sm"
                  className="h-7 border"
                  onClick={() =>
                    analysisAnimals
                      .filter((animal) => animal.genotype === genotype)
                      .forEach((animal) => markAnimalExclusion(animal.animal_id, false, "rule", `Excluded genotype ${genotype}`))
                  }
                >
                  Exclude {genotype}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-5">
              <div>
                <Label className="mb-1 block text-xs">Outlier Screen</Label>
                <Select
                  value={statsDraft.outlierMethod}
                  onValueChange={(value) => setStatsDraft((current) => ({ ...current, outlierMethod: value as OutlierMethod }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iqr">IQR Fence</SelectItem>
                    <SelectItem value="zscore">Z-Score</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Threshold</Label>
                <Input
                  type="number"
                  value={statsDraft.outlierThreshold}
                  onChange={(event) =>
                    setStatsDraft((current) => ({
                      ...current,
                      outlierThreshold: Number.parseFloat(event.target.value || "0") || current.outlierThreshold,
                    }))
                  }
                />
              </div>
              <div className="md:col-span-3">
                <Label className="mb-1 block text-xs">Outlier Actions</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={!statsDraft.measureKey} onClick={() => handleRunOutlierScreen("mark")}>
                    Mark Only
                  </Button>
                  <Button variant="outline" size="sm" disabled={!statsDraft.measureKey} onClick={() => handleRunOutlierScreen("exclude")}>
                    Mark + Exclude
                  </Button>
                  <Button variant="outline" size="sm" disabled={!statsDraft.measureKey} onClick={() => handleRunOutlierScreen("restore")}>
                    Restore Flagged
                  </Button>
                </div>
              </div>
            </div>

            <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50/95">
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Include</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Animal</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Cohort</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Sex</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Genotype</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Group</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Audit</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Reason</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Outlier</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAnalysisAnimals.map((animal) => (
                    <tr key={animal.animal_id} className="border-b last:border-0">
                      <td className="px-2 py-2">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={animal.included}
                            onChange={(event) =>
                              markAnimalExclusion(
                                animal.animal_id,
                                event.target.checked,
                                event.target.checked ? "restored" : "manual",
                                event.target.checked ? "" : exclusionReasons[animal.animal_id] || "Manual exclusion",
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span>{animal.included ? "Included" : "Excluded"}</span>
                        </label>
                      </td>
                      <td className="px-2 py-2 font-medium">{animal.identifier}</td>
                      <td className="px-2 py-2">{animal.cohort}</td>
                      <td className="px-2 py-2">{animal.sex}</td>
                      <td className="px-2 py-2">{animal.genotype}</td>
                      <td className="px-2 py-2" style={{ color: GROUP_COLORS[animal.group] || undefined }}>
                        {animal.group}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {exclusionSources[animal.animal_id] || (animal.included ? "manual" : "manual")}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        {!animal.included ? (
                          <Input
                            value={exclusionReasons[animal.animal_id] || ""}
                            onChange={(event) =>
                              setExclusionReasons((current) => ({
                                ...current,
                                [animal.animal_id]: event.target.value,
                              }))
                            }
                            placeholder="Reason"
                            className="h-7 min-w-[140px]"
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {outlierFlags[animal.animal_id] ? (
                          <span title={outlierModes[animal.animal_id] || "flagged"}>
                            {outlierScores[animal.animal_id] != null ? formatNum(outlierScores[animal.animal_id], 2) : "flagged"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{animal.rowCount}</td>
                    </tr>
                  ))}
                  {visibleAnalysisAnimals.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                        No animals match the current search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {flatData.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Info className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {scopedFlatData.length > 0
              ? "All matching animals are currently excluded from this analysis set."
              : "No data matches the current filters."}
          </p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm">
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Guided Workflow</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Build an analysis set first, then let the panel suggest the most sensible behavioral tests for the data that remains.
                  </p>
                </div>
                <Badge variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                  {includedAnimalCount} included / {excludedAnimalCount} excluded
                </Badge>
              </div>

              <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step.title}
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      step.done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <div className="font-medium">Step {index + 1}</div>
                    <div className="mt-1">{step.title}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-slate-700">Suggested tests for this analysis set</p>
                  <p className="text-[11px] text-slate-500">
                    Suggestions update from the current scope, included animals, and available measures.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestedTests.map((suggestion) => (
                    <Button
                      key={suggestion.testType}
                      variant={statsDraft.testType === suggestion.testType ? "default" : "outline"}
                      size="sm"
                      className="h-auto max-w-full whitespace-normal text-left"
                      onClick={() => {
                        setStatsDraft((current) => ({ ...current, testType: suggestion.testType }));
                        setActiveTab("analyze");
                      }}
                    >
                      <span className="flex flex-col items-start py-0.5">
                        <span>{suggestion.label}</span>
                        <span className="text-[10px] opacity-80">{suggestion.reason}</span>
                      </span>
                    </Button>
                  ))}
                  {suggestedTests.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                      Add more included animals or numeric measures to unlock guided test suggestions.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {allGroupsInScope.length > 1 && (
            <Card className="border-slate-200">
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-700">Groups in this analysis</p>
                    <p className="text-[11px] text-slate-500">
                      Click a group to toggle it. De-selected groups are dropped from the plot, summary, and every statistical test (ANOVA, t-test, brackets). Default: all groups included.
                    </p>
                  </div>
                  {excludedGroups.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExcludedGroups(new Set())}
                    >
                      Include all
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {allGroupsInScope.map((group) => {
                    const included = !excludedGroups.has(group);
                    const color = GROUP_COLORS[group] || "#64748b";
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() =>
                          setExcludedGroups((current) => {
                            const next = new Set(current);
                            if (next.has(group)) next.delete(group);
                            else next.add(group);
                            return next;
                          })
                        }
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                          included
                            ? "border-slate-300 bg-white text-slate-900 hover:border-slate-400"
                            : "border-slate-200 bg-slate-100 text-slate-400 line-through hover:bg-slate-200"
                        }`}
                        aria-pressed={included}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: included ? color : "#cbd5e1" }}
                        />
                        {group}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1">
            <TabsTrigger value="summary" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <TrendingUp className="h-3.5 w-3.5" /> Summary
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <TableIcon className="h-3.5 w-3.5" /> Data
            </TabsTrigger>
            <TabsTrigger value="analyze" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <FlaskConical className="h-3.5 w-3.5" /> Statistics
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Info className="h-3.5 w-3.5" /> Report
            </TabsTrigger>
            <TabsTrigger value="visualize" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
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
              key={`stats-${loadedRevisionKey}`}
              flatData={flatData}
              numericKeys={numericMeasureKeys}
              measureLabels={measureLabels}
              includedCount={includedAnimalCount}
              excludedCount={excludedAnimalCount}
              initialConfig={statsDraft}
              initialResult={savedResult}
              onConfigChange={setStatsDraft}
              onResultChange={setSavedResult}
            />
          </TabsContent>

          <TabsContent value="report">
            <ReportPreviewPanel
              reportPayload={currentReportPayload}
              exclusions={activeExclusions}
              analysisName={analysisName}
            />
          </TabsContent>

          <TabsContent value="visualize">
            <VisualizationPanel
              key={`viz-${loadedRevisionKey}`}
              flatData={flatData}
              numericKeys={numericMeasureKeys}
              measureLabels={measureLabels}
              groups={availableGroups}
              initialConfig={visualizationDraft}
              initialFigureStudioConfig={figureStudioDraft}
              result={savedResult}
              reportPayload={currentReportPayload}
              onConfigChange={setVisualizationDraft}
              onFigureStudioChange={setFigureStudioDraft}
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
            <Card key={g} className={`border ${GROUP_SURFACE_CLASSES[g] || "border-slate-200 bg-white"}`}>
              <CardContent className="pt-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: GROUP_COLORS[g] || "#666" }}
                >
                  {count}
                </div>
                <p className="text-xs mt-0.5 opacity-85">{g}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary stats per measure */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="py-3 px-4 bg-slate-50/65 border-b">
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
    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
      <CardHeader className="border-b bg-slate-50/70 py-3 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              Analysis Data Table
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {flatData.length} rows · {measureKeys.length + 7} columns
            </p>
          </div>
          <div className="flex gap-1.5">
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
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90">
              <tr>
                <th className="w-12 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ID</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sex</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Genotype</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Group</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cohort</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">TP</th>
                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Experiment</th>
                {measureKeys.map((k) => (
                  <th key={k} className="min-w-[110px] px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={k}>
                    {(measureLabels[k] || k).length > 20
                      ? (measureLabels[k] || k).slice(0, 18) + "…"
                      : measureLabels[k] || k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.animal_id}-${row.timepoint}-${row.experiment}`}
                  className={`border-b transition-colors hover:bg-accent/40 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}
                >
                  <td className="px-2 py-2 text-xs text-muted-foreground">{page * pageSize + i + 1}</td>
                  <td className="px-2 py-2 font-semibold">{row.identifier}</td>
                  <td className="px-2 py-2">
                    <span className={row.sex === "Male" ? "text-blue-600" : "text-pink-600"}>
                      {row.sex === "Male" ? "♂" : "♀"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs font-medium uppercase tracking-wide">{row.genotype}</td>
                  <td className="px-2 py-2 font-medium" style={{ color: GROUP_COLORS[row.group] }}>
                    {row.group}
                  </td>
                  <td className="px-2 py-2 text-xs">{row.cohort}</td>
                  <td className="px-2 py-2 text-xs tabular-nums">{row.timepoint}d</td>
                  <td className="px-2 py-2 text-xs">{EXPERIMENT_LABELS[row.experiment] || row.experiment}</td>
                  {measureKeys.map((k) => (
                    <td key={k} className="px-2 py-2 text-xs tabular-nums">
                      {row[k] !== null && row[k] !== undefined
                        ? typeof row[k] === "number"
                          ? formatNum(row[k] as number)
                          : String(row[k])
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-slate-50/70 px-4 py-2 text-xs">
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
  includedCount,
  excludedCount,
  initialConfig,
  initialResult,
  onConfigChange,
  onResultChange,
}: {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels: Record<string, string>;
  includedCount: number;
  excludedCount: number;
  initialConfig?: ColonyAnalysisStatsDraft;
  initialResult?: Record<string, unknown> | null;
  onConfigChange?: (next: ColonyAnalysisStatsDraft) => void;
  onResultChange?: (next: Record<string, unknown> | null) => void;
}) {
  const normalizedInitialConfig = useMemo(() => normalizeStatsDraft(initialConfig), [initialConfig]);
  const initialConfigRef = useRef<ColonyAnalysisStatsDraft>(normalizedInitialConfig);
  const lastEmittedConfigRef = useRef<string>("");
  const [testType, setTestType] = useState(normalizedInitialConfig.testType);
  const [measureKey, setMeasureKey] = useState(normalizedInitialConfig.measureKey || numericKeys[0] || "");
  const [measureKey2, setMeasureKey2] = useState(normalizedInitialConfig.measureKey2 || numericKeys[1] || numericKeys[0] || "");
  const [timeToEventMeasureKey, setTimeToEventMeasureKey] = useState(normalizedInitialConfig.timeToEventMeasureKey || numericKeys[0] || "");
  const [eventMeasureKey, setEventMeasureKey] = useState(normalizedInitialConfig.eventMeasureKey || "");
  const [predictorMeasureKey, setPredictorMeasureKey] = useState(normalizedInitialConfig.predictorMeasureKey || numericKeys[0] || "");
  const [scoreMeasureKey, setScoreMeasureKey] = useState(normalizedInitialConfig.scoreMeasureKey || numericKeys[0] || "");
  const [groupingFactor, setGroupingFactor] = useState<AnalysisFactor>(normalizedInitialConfig.groupingFactor);
  const [factorA, setFactorA] = useState<AnalysisFactor>(normalizedInitialConfig.factorA);
  const [factorB, setFactorB] = useState<AnalysisFactor>(normalizedInitialConfig.factorB);
  const [group1, setGroup1] = useState(normalizedInitialConfig.group1);
  const [group2, setGroup2] = useState(normalizedInitialConfig.group2);
  const [postHocMethod, setPostHocMethod] = useState<"none" | "tukey">(normalizedInitialConfig.postHocMethod);
  const [pAdjustMethod, setPAdjustMethod] = useState<"none" | "bonferroni" | "holm" | "fdr">(normalizedInitialConfig.pAdjustMethod);
  const [modelKind, setModelKind] = useState<ModelKind>(normalizedInitialConfig.modelKind);
  const [subjectFactor, setSubjectFactor] = useState<"animal_id">(normalizedInitialConfig.subjectFactor);
  const [withinSubjectFactor, setWithinSubjectFactor] = useState<"timepoint">(normalizedInitialConfig.withinSubjectFactor);
  const [betweenSubjectFactor, setBetweenSubjectFactor] = useState<AnalysisFactor | "__none__">(normalizedInitialConfig.betweenSubjectFactor);
  const [covariateMeasureKey, setCovariateMeasureKey] = useState(normalizedInitialConfig.covariateMeasureKey || "");
  const [controlGroup, setControlGroup] = useState(normalizedInitialConfig.controlGroup || "");
  const [binaryGroupA, setBinaryGroupA] = useState(normalizedInitialConfig.binaryGroupA || "");
  const [binaryGroupB, setBinaryGroupB] = useState(normalizedInitialConfig.binaryGroupB || "");
  const [positiveClass, setPositiveClass] = useState(normalizedInitialConfig.positiveClass || "Positive");
  const [regressionModelFamily, setRegressionModelFamily] = useState(normalizedInitialConfig.regressionModelFamily || "linear");
  const [alpha, setAlpha] = useState<number>(normalizedInitialConfig.alpha || 0.05);
  const [targetPower, setTargetPower] = useState<number>(normalizedInitialConfig.targetPower || 0.8);
  const [powerConfig, setPowerConfig] = useState<PowerConfig>(normalizedInitialConfig.powerConfig);
  const [reportMeasureKeys, setReportMeasureKeys] = useState<string[]>(normalizedInitialConfig.reportMeasureKeys || []);
  const [outlierMethod] = useState<OutlierMethod>(normalizedInitialConfig.outlierMethod);
  const [outlierThreshold] = useState<number>(normalizedInitialConfig.outlierThreshold);
  const [tableExportMode, setTableExportMode] = useState<"long" | "wide">(normalizedInitialConfig.tableExportMode);
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(initialResult || null);
  const [copied, setCopied] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);

  const TEST_OPTIONS = [
    { value: "descriptive", label: "Descriptive Statistics", desc: "Mean, SD, SEM, median for each selected factor level" },
    { value: "t_test", label: "Welch t-test", desc: "Compare two selected groups with unequal-variance t-test" },
    { value: "paired_t_test", label: "Paired t-test", desc: "Compare matched measurements from the same animals" },
    { value: "mann_whitney", label: "Mann-Whitney U", desc: "Non-parametric comparison between two selected groups" },
    { value: "wilcoxon_signed_rank", label: "Wilcoxon Signed-Rank", desc: "Paired non-parametric comparison for matched animals" },
    { value: "anova", label: "1-way ANOVA", desc: "Compare all levels of one factor at once" },
    { value: "kruskal_wallis", label: "Kruskal-Wallis", desc: "Non-parametric alternative to 1-way ANOVA" },
    { value: "two_way_anova", label: "2-way ANOVA", desc: "Test two factors plus their interaction" },
    { value: "repeated_measures_anova", label: "Repeated-measures ANOVA", desc: "Within-animal timepoint model for complete longitudinal data" },
    { value: "mixed_effects", label: "Mixed-effects", desc: "Incomplete longitudinal data using per-animal intercept modeling" },
    { value: "multi_compare", label: "All Pairwise Comparisons", desc: "Run pairwise Welch t-tests across factor levels" },
    { value: "dunnett", label: "Control vs All", desc: "Compare every level against a designated control group" },
    { value: "ancova", label: "ANCOVA", desc: "Adjust one factor comparison by a numeric covariate" },
    { value: "chi_square", label: "Chi-square", desc: "Test association between factor levels and binary outcome" },
    { value: "fisher_exact", label: "Fisher Exact", desc: "Exact test for 2×2 contingency tables" },
    { value: "pearson", label: "Pearson Correlation", desc: "Linear association between two measures" },
    { value: "spearman", label: "Spearman Correlation", desc: "Rank-based association between two measures" },
    { value: "kaplan_meier", label: "Kaplan-Meier", desc: "Estimate group-wise survival curves from time-to-event data" },
    { value: "log_rank", label: "Log-rank", desc: "Compare survival curves across groups using time-to-event data" },
    { value: "nonlinear_regression", label: "Nonlinear Regression", desc: "Fit a predictor-outcome model with linear, exponential, or logistic families" },
    { value: "dose_response", label: "Dose Response", desc: "Sigmoidal predictor-outcome fitting for dose-response style data" },
    { value: "roc_curve", label: "ROC Curve", desc: "Full ROC curve with threshold summary and AUC" },
    { value: "power_planning", label: "Power Planning", desc: "Adaptive power planning across supported inferential designs" },
  ];

  const factorOptions: Array<{ value: AnalysisFactor; label: string }> = [
    { value: "group", label: "Genotype × Sex" },
    { value: "sex", label: "Sex" },
    { value: "genotype", label: "Genotype" },
    { value: "cohort", label: "Cohort" },
    { value: "timepoint", label: "Timepoint" },
  ];

  const factorLevels = useMemo(() => {
    const levels = Array.from(new Set(flatData.map((row) => getFactorValue(row, groupingFactor)))).sort();
    return levels;
  }, [flatData, groupingFactor]);
  const binaryMeasureKeys = useMemo(() => detectBinaryLikeKeys(flatData), [flatData]);
  const hasMultipleTimepoints = useMemo(() => new Set(flatData.map((row) => row.timepoint)).size > 1, [flatData]);
  const panelSuggestedTests = useMemo(
    () => suggestAnalysisTests({ flatData, numericKeys, hasMultipleTimepoints }),
    [flatData, hasMultipleTimepoints, numericKeys],
  );
  const suggestedPowerBaseTest = useMemo(
    () => chooseSuggestedPowerBaseTest(panelSuggestedTests.map((suggestion) => suggestion.testType)),
    [panelSuggestedTests],
  );
  const activeTestType = testType === "power_planning" ? powerConfig.baseTest : testType;
  const powerPlannerInput = useMemo(
    () => ({
      flatData,
      numericKeys,
      measureLabels,
      measureKey,
      measureKey2,
      timeToEventMeasureKey,
      eventMeasureKey,
      predictorMeasureKey,
      scoreMeasureKey,
      groupingFactor,
      factorA,
      factorB,
      group1,
      group2,
      controlGroup,
      binaryGroupA,
      binaryGroupB,
      positiveClass,
      betweenSubjectFactor,
      covariateMeasureKey,
      regressionModelFamily,
      pAdjustMethod,
      alpha,
      targetPower,
      powerConfig,
      includedCount,
      excludedCount,
    }),
    [
      alpha,
      betweenSubjectFactor,
      binaryGroupA,
      binaryGroupB,
      controlGroup,
      covariateMeasureKey,
      eventMeasureKey,
      excludedCount,
      factorA,
      factorB,
      flatData,
      group1,
      group2,
      groupingFactor,
      includedCount,
      measureKey,
      measureKey2,
      measureLabels,
      numericKeys,
      pAdjustMethod,
      positiveClass,
      powerConfig,
      predictorMeasureKey,
      regressionModelFamily,
      scoreMeasureKey,
      targetPower,
      timeToEventMeasureKey,
    ],
  );
  const powerPlannerContext = useMemo(() => derivePowerPlannerContext(powerPlannerInput), [powerPlannerInput]);
  const powerObjectiveOptions = useMemo(() => getPowerObjectiveOptions(), []);
  const powerTargetOptions = useMemo(() => getPowerTargetOptions(powerConfig.baseTest), [powerConfig.baseTest]);

  const buildObservedPowerConfig = useCallback(
    (
      baseTest: PowerBaseTest,
      options?: {
        objective?: PowerObjective;
        preservePlannedSample?: boolean;
        targetEffect?: PowerConfig["targetEffect"];
      },
    ): PowerConfig => {
      const defaults = defaultPowerConfig(baseTest);
      const seedConfig: PowerConfig = {
        ...defaults,
        objective: options?.objective ?? powerConfig.objective,
        targetEffect: options?.targetEffect ?? defaults.targetEffect,
        engine: powerConfig.engine,
        simulationMeta: powerConfig.simulationMeta,
      };
      const observed = derivePowerPlannerContext({
        ...powerPlannerInput,
        alpha,
        targetPower,
        powerConfig: seedConfig,
      });
      const preservedValue = Math.max(2, Math.round(powerConfig.plannedSample.value || observed.observedPlannedSample.value));
      return {
        ...seedConfig,
        effectValue: observed.observedEffectValue,
        assumptions: observed.observedAssumptions,
        plannedSample: options?.preservePlannedSample
          ? { ...defaults.plannedSample, value: preservedValue }
          : observed.observedPlannedSample,
        contrastSelection: observed.contrastOptions[0] ?? null,
      };
    },
    [alpha, powerConfig.engine, powerConfig.objective, powerConfig.plannedSample.value, powerConfig.simulationMeta, powerPlannerInput, targetPower],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- dependent controls intentionally snap to valid measure/model selections when source fields change. */
  useEffect(() => {
    if (!numericKeys.includes(measureKey)) setMeasureKey(numericKeys[0] || "");
    if (!numericKeys.includes(measureKey2)) setMeasureKey2(numericKeys[1] || numericKeys[0] || "");
    if (!numericKeys.includes(timeToEventMeasureKey)) setTimeToEventMeasureKey(numericKeys[0] || "");
    if (!numericKeys.includes(predictorMeasureKey)) setPredictorMeasureKey(numericKeys[0] || "");
    if (!numericKeys.includes(scoreMeasureKey)) setScoreMeasureKey(numericKeys[0] || "");
    if (eventMeasureKey && !binaryMeasureKeys.includes(eventMeasureKey)) setEventMeasureKey(binaryMeasureKeys[0] || "");
  }, [binaryMeasureKeys, eventMeasureKey, measureKey, measureKey2, numericKeys, predictorMeasureKey, scoreMeasureKey, timeToEventMeasureKey]);

  useEffect(() => {
    if (activeTestType === "repeated_measures_anova") setModelKind("repeated_measures");
    else if (activeTestType === "mixed_effects") setModelKind("mixed_effects");
    else setModelKind("guided");
  }, [activeTestType]);

  useEffect(() => {
    if (testType !== "power_planning") return;
    const validTarget = powerTargetOptions.some((option) => option.value === powerConfig.targetEffect);
    const nextContrast =
      powerConfig.baseTest === "multi_compare" || powerConfig.baseTest === "dunnett"
        ? powerPlannerContext.contrastOptions.find(
            (option) =>
              option.group1 === powerConfig.contrastSelection?.group1 && option.group2 === powerConfig.contrastSelection?.group2,
          ) ?? powerPlannerContext.contrastOptions[0] ?? null
        : powerConfig.contrastSelection;
    const contrastChanged = !samePowerContrastSelection(nextContrast, powerConfig.contrastSelection);
    if (validTarget && !contrastChanged) return;
    setPowerConfig((current) => ({
      ...current,
      targetEffect: validTarget ? current.targetEffect : defaultPowerConfig(current.baseTest).targetEffect,
      contrastSelection: contrastChanged ? nextContrast : current.contrastSelection,
    }));
  }, [powerConfig.baseTest, powerConfig.contrastSelection, powerConfig.targetEffect, powerPlannerContext.contrastOptions, powerTargetOptions, testType]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const nextConfig = normalizeStatsDraft({
      ...initialConfigRef.current,
      testType,
      measureKey,
      measureKey2,
      timeToEventMeasureKey,
      eventMeasureKey,
      predictorMeasureKey,
      scoreMeasureKey,
      groupingFactor,
      factorA,
      factorB,
      group1,
      group2,
      postHocMethod,
      pAdjustMethod,
      modelKind,
      subjectFactor,
      withinSubjectFactor,
      betweenSubjectFactor,
      covariateMeasureKey,
      controlGroup,
      binaryGroupA,
      binaryGroupB,
      positiveClass,
      regressionModelFamily,
      alpha,
      targetPower,
      powerConfig,
      reportMeasureKeys,
      outlierMethod,
      outlierThreshold,
      tableExportMode,
    });
    const nextSignature = JSON.stringify(nextConfig);
    if (lastEmittedConfigRef.current === nextSignature) return;
    lastEmittedConfigRef.current = nextSignature;
    onConfigChange?.(nextConfig);
  }, [alpha, betweenSubjectFactor, binaryGroupA, binaryGroupB, controlGroup, covariateMeasureKey, eventMeasureKey, factorA, factorB, group1, group2, groupingFactor, measureKey, measureKey2, modelKind, onConfigChange, outlierMethod, outlierThreshold, pAdjustMethod, positiveClass, postHocMethod, powerConfig, predictorMeasureKey, regressionModelFamily, reportMeasureKeys, scoreMeasureKey, subjectFactor, tableExportMode, targetPower, testType, timeToEventMeasureKey, withinSubjectFactor]);

  useEffect(() => {
    onResultChange?.(currentResult);
  }, [currentResult, onResultChange]);

  /* eslint-disable react-hooks/set-state-in-effect -- comparison selectors must stay on valid factor levels as the included data changes. */
  useEffect(() => {
    if (!factorLevels.includes(group1)) setGroup1(factorLevels[0] || "");
    if (!factorLevels.includes(group2) || group2 === group1) {
      setGroup2(factorLevels.find((level) => level !== (factorLevels[0] || "")) || factorLevels[0] || "");
    }
    if (!factorLevels.includes(controlGroup)) setControlGroup(factorLevels[0] || "");
    if (!factorLevels.includes(binaryGroupA)) setBinaryGroupA(factorLevels[0] || "");
    if (!factorLevels.includes(binaryGroupB) || binaryGroupB === binaryGroupA) {
      setBinaryGroupB(factorLevels.find((level) => level !== (factorLevels[0] || "")) || factorLevels[0] || "");
    }
  }, [binaryGroupA, binaryGroupB, controlGroup, factorLevels, group1, group2]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const runTest = useCallback(() => {
    const getValues = (group: string, key = measureKey) =>
      flatData
        .filter((r) => getFactorValue(r, groupingFactor) === group)
        .map((r) => Number(r[key]))
        .filter((v) => !isNaN(v));
    const getPairedValues = () => {
      const byAnimal = new Map<string, Record<string, number>>();
      flatData.forEach((row) => {
        const level = getFactorValue(row, groupingFactor);
        if (level !== group1 && level !== group2) return;
        const value = Number(row[measureKey]);
        if (Number.isNaN(value)) return;
        const current = byAnimal.get(row.animal_id) || {};
        current[level] = value;
        byAnimal.set(row.animal_id, current);
      });
      const paired = Array.from(byAnimal.values()).filter((entry) => entry[group1] != null && entry[group2] != null);
      return {
        a: paired.map((entry) => Number(entry[group1])),
        b: paired.map((entry) => Number(entry[group2])),
      };
    };

    switch (testType) {
      case "descriptive": {
        const results: Record<string, unknown> = {};
        for (const g of factorLevels) {
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
        setCurrentResult({
          test: "Descriptive Statistics",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...results,
        });
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
          grouped_by: getFactorLabel(groupingFactor),
          groups_compared: `${group1} vs ${group2}`,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...result,
          significant_005: result.p < 0.05,
          significant_001: result.p < 0.01,
          group1_stats: { name: group1, n: a.length, mean: round(mean(a)), sd: round(stdDev(a)), sem: round(sem(a)) },
          group2_stats: { name: group2, n: b.length, mean: round(mean(b)), sd: round(stdDev(b)), sem: round(sem(b)) },
        });
        break;
      }
      case "paired_t_test": {
        const { a, b } = getPairedValues();
        if (a.length < 2 || b.length < 2) {
          toast.error("Need at least 2 matched animals with both selected levels.");
          return;
        }
        const result = pairedTTest(a, b);
        setCurrentResult({
          test: "Paired t-test",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          groups_compared: `${group1} vs ${group2}`,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          n_pairs: a.length,
          ...result,
          significant_005: result.p < 0.05,
          group1_stats: { name: group1, n: a.length, mean: round(mean(a)), sd: round(stdDev(a)), sem: round(sem(a)) },
          group2_stats: { name: group2, n: b.length, mean: round(mean(b)), sd: round(stdDev(b)), sem: round(sem(b)) },
        });
        break;
      }
      case "mann_whitney": {
        const a = getValues(group1);
        const b = getValues(group2);
        if (a.length < 2 || b.length < 2) {
          toast.error("Each group needs at least 2 values");
          return;
        }
        const result = mannWhitneyUTest(a, b);
        setCurrentResult({
          test: "Mann-Whitney U (two-tailed)",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          groups_compared: `${group1} vs ${group2}`,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...result,
          significant_005: result.p < 0.05,
          group1_stats: { name: group1, n: a.length, median: round(median(a)), mean_rank_proxy: round(mean(rankWithTies(a))) },
          group2_stats: { name: group2, n: b.length, median: round(median(b)), mean_rank_proxy: round(mean(rankWithTies(b))) },
        });
        break;
      }
      case "wilcoxon_signed_rank": {
        const { a, b } = getPairedValues();
        if (a.length < 2 || b.length < 2) {
          toast.error("Need at least 2 matched animals with both selected levels.");
          return;
        }
        const result = wilcoxonSignedRankTest(a, b);
        setCurrentResult({
          test: "Wilcoxon Signed-Rank",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          groups_compared: `${group1} vs ${group2}`,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          n_pairs: a.length,
          ...result,
          significant_005: result.p < 0.05,
          group1_stats: { name: group1, n: a.length, median: round(median(a)), mean: round(mean(a)) },
          group2_stats: { name: group2, n: b.length, median: round(median(b)), mean: round(mean(b)) },
        });
        break;
      }
      case "anova": {
        const grouped = factorLevels.map((g) => ({ label: g, values: getValues(g) })).filter((g) => g.values.length >= 2);
        const allGroups = grouped.map((group) => group.values);
        if (allGroups.length < 2) {
          toast.error("Need at least 2 groups with ≥ 2 values each");
          return;
        }
        const result = oneWayAnova(allGroups);
        const assumptionChecks = [
          ...grouped.map((group) => normalityScreen(group.label, group.values)),
          brownForsytheTest(grouped),
        ];
        const groupStats = factorLevels.map((g) => {
          const vals = getValues(g);
          return { group: g, n: vals.length, mean: round(mean(vals)), sd: round(stdDev(vals)) };
        }).filter((g) => g.n > 0);
        const posthocComparisons =
          postHocMethod === "none"
            ? []
            : pairwiseGroupComparisons(grouped, {
                pAdjustMethod,
                pooledVariance: postHocMethod === "tukey",
                errorDf: result.dfWithin,
              });

        setCurrentResult({
          test: "One-way ANOVA",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...result,
          significant_005: result.p < 0.05,
          significant_001: result.p < 0.01,
          group_stats: groupStats,
          comparisons: posthocComparisons,
          posthoc_label: postHocMethod === "tukey" ? "Tukey-style pooled post-hoc" : undefined,
          assumption_checks: assumptionChecks,
        });
        break;
      }
      case "kruskal_wallis": {
        const allGroups = factorLevels.map((g) => getValues(g)).filter((g) => g.length >= 2);
        if (allGroups.length < 2) {
          toast.error("Need at least 2 groups with ≥ 2 values each");
          return;
        }
        const result = kruskalWallisTest(allGroups);
        setCurrentResult({
          test: "Kruskal-Wallis",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...result,
          significant_005: result.p < 0.05,
          group_stats: factorLevels
            .map((g) => {
              const vals = getValues(g);
              return { group: g, n: vals.length, median: round(median(vals)), mean: round(mean(vals)) };
            })
            .filter((g) => g.n > 0),
        });
        break;
      }
      case "two_way_anova": {
        const result = twoWayAnova(flatData, measureKey, factorA, factorB);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        const groupedCells = result.cellCounts.map((cell) => ({
          label: `${String(cell.levelA)} / ${String(cell.levelB)}`,
          values: flatData
            .filter((row) => getFactorValue(row, factorA) === cell.levelA && getFactorValue(row, factorB) === cell.levelB)
            .map((row) => Number(row[measureKey]))
            .filter((value) => !Number.isNaN(value)),
        }));
        const assumptionChecks = [
          ...groupedCells.map((cell) => normalityScreen(cell.label, cell.values)),
          brownForsytheTest(groupedCells.filter((cell) => cell.values.length > 0)),
        ];
        const simpleEffects = result.levelsB.flatMap((levelB) =>
          pairwiseGroupComparisons(
            result.levelsA.map((levelA) => ({
              label: `${levelA} @ ${levelB}`,
              values: flatData
                .filter((row) => getFactorValue(row, factorA) === levelA && getFactorValue(row, factorB) === levelB)
                .map((row) => Number(row[measureKey]))
                .filter((value) => !Number.isNaN(value)),
            })),
            { pAdjustMethod },
          ),
        );
        setCurrentResult({
          test: "Two-way ANOVA",
          measure: measureLabels[measureKey] || measureKey,
          factor_a: result.factorA,
          factor_b: result.factorB,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          n: result.n,
          levels_a: result.levelsA,
          levels_b: result.levelsB,
          anova_table: result.table,
          cell_counts: result.cellCounts,
          warning: result.warning,
          assumption_checks: assumptionChecks,
          comparisons: simpleEffects,
          posthoc_label: "Simple-effects follow-up comparisons",
        });
        break;
      }
      case "repeated_measures_anova": {
        const result = repeatedMeasuresAnova(flatData, measureKey, pAdjustMethod);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setCurrentResult({
          ...result,
          measure: measureLabels[measureKey] || measureKey,
          model_kind: "repeated_measures_anova",
          subject_factor: subjectFactor,
          within_subject_factor: withinSubjectFactor,
          between_subject_factor: betweenSubjectFactor,
          included_animals: includedCount,
          excluded_animals: excludedCount,
        });
        break;
      }
      case "mixed_effects": {
        const result = mixedEffectsApproximation(flatData, measureKey, betweenSubjectFactor, pAdjustMethod);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setCurrentResult({
          ...result,
          measure: measureLabels[measureKey] || measureKey,
          model_kind: "mixed_effects",
          subject_factor: subjectFactor,
          within_subject_factor: withinSubjectFactor,
          between_subject_factor: betweenSubjectFactor,
          included_animals: includedCount,
          excluded_animals: excludedCount,
        });
        break;
      }
      case "multi_compare": {
        const corrected = pairwiseGroupComparisons(
          factorLevels.map((level) => ({ label: level, values: getValues(level) })).filter((group) => group.values.length >= 2),
          { pAdjustMethod },
        );

        setCurrentResult({
          test: `All Pairwise Comparisons (${pAdjustMethod === "none" ? "uncorrected" : `${pAdjustMethod} adjusted`})`,
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          included_animals: includedCount,
          excluded_animals: excludedCount,
          n_comparisons: corrected.length,
          comparisons: corrected,
        });
        break;
      }
      case "dunnett": {
        const grouped = factorLevels
          .map((level) => ({
            label: level,
            values: getValues(level),
          }))
          .filter((group) => group.values.length >= 2);
        const controlValues = getValues(controlGroup);
        if (controlValues.length < 2 || grouped.filter((group) => group.label !== controlGroup).length === 0) {
          toast.error("Need a control group plus at least one comparison group with 2+ values.");
          return;
        }
        const comparisons = controlGroupComparisons(grouped, controlGroup, pAdjustMethod);
        setCurrentResult({
          test: "Dunnett-style Control vs All Comparisons",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          control_group: controlGroup,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          comparisons,
          posthoc_label: `Control-group follow-up (${pAdjustMethod}, pooled error)`,
        });
        break;
      }
      case "ancova": {
        if (!covariateMeasureKey) {
          toast.error("Choose a covariate measure.");
          return;
        }
        const result = ancova(flatData, measureKey, groupingFactor, covariateMeasureKey);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setCurrentResult({
          test: "ANCOVA",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          covariate_label: measureLabels[covariateMeasureKey] || covariateMeasureKey,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...result,
        });
        break;
      }
      case "chi_square":
      case "fisher_exact": {
        const validRows = flatData.filter((row) => {
          const group = getFactorValue(row, groupingFactor);
          return (group === binaryGroupA || group === binaryGroupB) && row[measureKey] != null && row[measureKey] !== "";
        });
        const countFor = (group: string, positive: boolean) =>
          validRows.filter((row) => {
            if (getFactorValue(row, groupingFactor) !== group) return false;
            const value = Number(row[measureKey]);
            if (!Number.isNaN(value)) return positive ? value > 0 : value <= 0;
            const label = String(row[measureKey]).toLowerCase();
            return positive ? ["1", "true", "yes", "positive", "done", "completed"].includes(label) : !["1", "true", "yes", "positive", "done", "completed"].includes(label);
          }).length;
        const a = countFor(binaryGroupA, true);
        const b = countFor(binaryGroupA, false);
        const c = countFor(binaryGroupB, true);
        const d = countFor(binaryGroupB, false);
        if (a + b === 0 || c + d === 0) {
          toast.error("Need both selected groups to have binary data.");
          return;
        }
        const contingency = [
          [a, b],
          [c, d],
        ];
        const result = testType === "chi_square" ? chiSquareTest(contingency) : fisherExactTest(a, b, c, d);
        setCurrentResult({
          test: testType === "chi_square" ? "Chi-square Test" : "Fisher Exact Test",
          measure: measureLabels[measureKey] || measureKey,
          grouped_by: getFactorLabel(groupingFactor),
          groups_compared: `${binaryGroupA} vs ${binaryGroupB}`,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          contingency_table: [
            { group: binaryGroupA, positive: a, negative: b },
            { group: binaryGroupB, positive: c, negative: d },
          ],
          ...result,
        });
        break;
      }
      case "pearson":
      case "spearman": {
        const pairs = flatData
          .map((row) => ({ x: Number(row[measureKey]), y: Number(row[measureKey2]) }))
          .filter((pair) => !Number.isNaN(pair.x) && !Number.isNaN(pair.y));
        if (pairs.length < 3) {
          toast.error("Need at least 3 animals with both measures present");
          return;
        }
        const xs = pairs.map((pair) => pair.x);
        const ys = pairs.map((pair) => pair.y);
        if (testType === "pearson") {
          const result = pearsonCorrelation(xs, ys);
          setCurrentResult({
            test: "Pearson Correlation",
            measure: `${measureLabels[measureKey] || measureKey} vs ${measureLabels[measureKey2] || measureKey2}`,
            included_animals: includedCount,
            excluded_animals: excludedCount,
            n: pairs.length,
            ...result,
            significant_005: result.p < 0.05,
          });
        } else {
          const result = spearmanCorrelation(xs, ys);
          setCurrentResult({
            test: "Spearman Correlation",
            measure: `${measureLabels[measureKey] || measureKey} vs ${measureLabels[measureKey2] || measureKey2}`,
            included_animals: includedCount,
            excluded_animals: excludedCount,
            n: pairs.length,
            ...result,
            significant_005: result.p < 0.05,
          });
        }
        break;
      }
      case "kaplan_meier":
      case "log_rank": {
        if (!timeToEventMeasureKey || !eventMeasureKey) {
          toast.error("Choose both time-to-event and event fields.");
          return;
        }
        const curves = kaplanMeierSummary(flatData, timeToEventMeasureKey, eventMeasureKey, groupingFactor, positiveClass);
        if (curves.length < 1) {
          toast.error("Need valid time-to-event and event data to estimate survival curves.");
          return;
        }
        const logRank = curves.length > 1 ? logRankTest(flatData, timeToEventMeasureKey, eventMeasureKey, groupingFactor, positiveClass) : null;
        if (testType === "log_rank" && logRank && "error" in logRank) {
          toast.error(logRank.error);
          return;
        }
        setCurrentResult({
          test: testType === "kaplan_meier" ? "Kaplan-Meier Survival" : "Log-rank Survival Comparison",
          measure: `${measureLabels[timeToEventMeasureKey] || timeToEventMeasureKey} with ${measureLabels[eventMeasureKey] || eventMeasureKey}`,
          grouped_by: getFactorLabel(groupingFactor),
          included_animals: includedCount,
          excluded_animals: excludedCount,
          survival_curves: curves,
          log_rank_chi2: logRank && !("error" in logRank) ? logRank.log_rank_chi2 : undefined,
          df: logRank && !("error" in logRank) ? logRank.df : undefined,
          p: logRank && !("error" in logRank) ? logRank.p : undefined,
          observed_expected: logRank && !("error" in logRank) ? logRank.observed_expected : undefined,
          warning: "Survival v1 assumes one time-to-event field plus one event/censor field for the included animals.",
        });
        break;
      }
      case "nonlinear_regression":
      case "dose_response": {
        const family = testType === "dose_response" ? "logistic" : regressionModelFamily;
        if (!predictorMeasureKey || !measureKey) {
          toast.error("Choose predictor and outcome measures.");
          return;
        }
        const result = fitNonlinearRegression(flatData, predictorMeasureKey, measureKey, family);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setCurrentResult({
          test: testType === "dose_response" ? "Dose Response Fit" : result.model,
          measure: `${measureLabels[predictorMeasureKey] || predictorMeasureKey} → ${measureLabels[measureKey] || measureKey}`,
          predictor_label: measureLabels[predictorMeasureKey] || predictorMeasureKey,
          outcome_label: measureLabels[measureKey] || measureKey,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          ...result,
        });
        break;
      }
      case "roc_curve":
      case "roc_auc": {
        const scoreKey = scoreMeasureKey || measureKey;
        const eventKey = eventMeasureKey || measureKey;
        const scoreRows = flatData
          .map((row) => ({
            score: Number(row[scoreKey]),
            positive: inferBinaryValue(row[eventKey], positiveClass),
            group: getFactorValue(row, groupingFactor),
          }))
          .filter((row) => !Number.isNaN(row.score) && row.positive != null && (row.group === binaryGroupA || row.group === binaryGroupB));
        if (scoreRows.length < 4) {
          toast.error("Need valid score and binary-class rows for ROC analysis.");
          return;
        }
        const curve = buildRocCurve(scoreRows.map((row) => ({ score: row.score, positive: Boolean(row.positive) })));
        const groupAValues = scoreRows.filter((row) => row.group === binaryGroupA).map((row) => row.score);
        const groupBValues = scoreRows.filter((row) => row.group === binaryGroupB).map((row) => row.score);
        const scalar = rocAucFromBinaryGroups(groupAValues, groupBValues);
        setCurrentResult({
          test: "ROC Curve",
          measure: measureLabels[scoreKey] || scoreKey,
          grouped_by: getFactorLabel(groupingFactor),
          groups_compared: `${binaryGroupA} vs ${binaryGroupB}`,
          included_animals: includedCount,
          excluded_animals: excludedCount,
          auc: curve.auc,
          p: scalar.p,
          significant_005: scalar.p < 0.05,
          roc_points: curve.points,
          threshold_table: curve.thresholdTable,
          optimal_threshold: curve.optimal,
          positive_class: positiveClass,
        });
        break;
      }
      case "power_planning":
      case "power_two_group": {
        setPowerBusy(true);
        window.requestAnimationFrame(() => {
          const result = runPowerAnalysis({
            ...powerPlannerInput,
            powerConfig,
          });
          if ("error" in result) {
            toast.error(String(result.error));
            setPowerBusy(false);
            return;
          }
          setCurrentResult(result);
          setPowerBusy(false);
        });
        break;
      }
    }
  }, [alpha, betweenSubjectFactor, binaryGroupA, binaryGroupB, controlGroup, covariateMeasureKey, eventMeasureKey, excludedCount, factorA, factorB, factorLevels, flatData, group1, group2, groupingFactor, includedCount, measureKey, measureKey2, measureLabels, pAdjustMethod, positiveClass, postHocMethod, powerConfig, powerPlannerInput, predictorMeasureKey, regressionModelFamily, scoreMeasureKey, subjectFactor, targetPower, testType, timeToEventMeasureKey, withinSubjectFactor]);

  const handleCopyResults = useCallback(() => {
    if (!currentResult) return;
    navigator.clipboard.writeText(JSON.stringify(currentResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentResult]);

  const needsPowerPlanning = testType === "power_planning" || testType === "power_two_group";
  const needsGroups =
    ["t_test", "mann_whitney", "paired_t_test", "wilcoxon_signed_rank"].includes(activeTestType) ||
    (needsPowerPlanning && activeTestType === "log_rank");
  const needsFactor = ["descriptive", "t_test", "mann_whitney", "paired_t_test", "wilcoxon_signed_rank", "anova", "kruskal_wallis", "multi_compare", "dunnett", "ancova", "chi_square", "fisher_exact", "roc_auc", "roc_curve", "kaplan_meier", "log_rank"].includes(activeTestType);
  const needsTwoFactors = activeTestType === "two_way_anova";
  const needsSecondMeasure = activeTestType === "pearson" || activeTestType === "spearman";
  const needsLongitudinalModel = activeTestType === "repeated_measures_anova" || activeTestType === "mixed_effects";
  const needsPAdjust = needsPowerPlanning
    ? ["multi_compare", "dunnett"].includes(activeTestType)
    : ["multi_compare", "repeated_measures_anova", "mixed_effects", "two_way_anova", "dunnett"].includes(activeTestType) || (activeTestType === "anova" && postHocMethod !== "none");
  const needsCovariate = activeTestType === "ancova";
  const needsBinaryGroups = ["chi_square", "fisher_exact", "roc_auc", "roc_curve"].includes(activeTestType);
  const needsControlGroup = activeTestType === "dunnett";
  const needsSurvivalFields = activeTestType === "kaplan_meier" || activeTestType === "log_rank";
  const needsRegressionFields = activeTestType === "nonlinear_regression" || activeTestType === "dose_response";

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <Label className="text-xs mb-1 block">Statistical Test</Label>
              <Select
                value={testType}
                onValueChange={(value) => {
                  if (value === "power_planning") {
                    const inferredBase = inferPowerBaseTest(testType) ?? suggestedPowerBaseTest;
                    setPowerConfig(buildObservedPowerConfig(inferredBase, {
                      objective: powerConfig.objective,
                      preservePlannedSample: powerConfig.objective !== "sample_size",
                    }));
                  }
                  setTestType(value);
                  setCurrentResult(null);
                }}
              >
                <SelectTrigger className="w-full min-w-0">
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

            <div className="min-w-0 sm:col-span-2 lg:col-span-5">
              <Label className="text-xs mb-1 block">Measure</Label>
              <Select value={measureKey} onValueChange={setMeasureKey}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Select measure" />
                </SelectTrigger>
                <SelectContent>
                  {numericKeys.map((k) => (
                    <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsSecondMeasure && (
              <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                <Label className="text-xs mb-1 block">Second Measure</Label>
                <Select value={measureKey2} onValueChange={setMeasureKey2}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Select measure" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericKeys.filter((k) => k !== measureKey).map((k) => (
                      <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsSurvivalFields && (
              <>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Time-to-event</Label>
                  <Select value={timeToEventMeasureKey} onValueChange={setTimeToEventMeasureKey}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Select duration field" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericKeys.map((k) => (
                        <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Event Field</Label>
                  <Select value={eventMeasureKey} onValueChange={setEventMeasureKey}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Select event field" />
                    </SelectTrigger>
                    <SelectContent>
                      {binaryMeasureKeys.map((k) => (
                        <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Positive Event Label</Label>
                  <Input value={positiveClass} onChange={(event) => setPositiveClass(event.target.value)} placeholder="Positive" />
                </div>
              </>
            )}

            {needsRegressionFields && (
              <>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Predictor</Label>
                  <Select value={predictorMeasureKey} onValueChange={setPredictorMeasureKey}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Select predictor" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericKeys.map((k) => (
                        <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Outcome</Label>
                  <Select value={measureKey} onValueChange={setMeasureKey}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericKeys.map((k) => (
                        <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {testType === "nonlinear_regression" && (
                  <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                    <Label className="text-xs mb-1 block">Model Family</Label>
                    <Select value={regressionModelFamily} onValueChange={(value) => setRegressionModelFamily(value as "linear" | "exponential" | "logistic")}>
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linear">Linear</SelectItem>
                        <SelectItem value="exponential">Exponential</SelectItem>
                        <SelectItem value="logistic">Logistic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {needsCovariate && (
              <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                <Label className="text-xs mb-1 block">Covariate</Label>
                <Select value={covariateMeasureKey} onValueChange={setCovariateMeasureKey}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Select covariate" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericKeys.filter((k) => k !== measureKey).map((k) => (
                      <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsFactor && (
              <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                <Label className="text-xs mb-1 block">Group By</Label>
                <Select value={groupingFactor} onValueChange={(value) => setGroupingFactor(value as AnalysisFactor)}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {factorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsTwoFactors && (
              <>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Factor A</Label>
                  <Select value={factorA} onValueChange={(value) => setFactorA(value as AnalysisFactor)}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {factorOptions.filter((option) => option.value !== "group").map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Factor B</Label>
                  <Select value={factorB} onValueChange={(value) => setFactorB(value as AnalysisFactor)}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {factorOptions.filter((option) => option.value !== "group" && option.value !== factorA).map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {needsLongitudinalModel && (
              <>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Subject</Label>
                  <Select value={subjectFactor} onValueChange={(value) => setSubjectFactor(value as "animal_id")}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="animal_id">Animal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Within-subject factor</Label>
                  <Select value={withinSubjectFactor} onValueChange={(value) => setWithinSubjectFactor(value as "timepoint")}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="timepoint">Timepoint</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Between-subject factor</Label>
                  <Select value={betweenSubjectFactor} onValueChange={(value) => setBetweenSubjectFactor(value as AnalysisFactor | "__none__")}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {factorOptions.filter((option) => option.value !== "timepoint").map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {needsGroups && (
              <>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Group 1</Label>
                  <Select value={group1} onValueChange={setGroup1}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {factorLevels.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Group 2</Label>
                  <Select value={group2} onValueChange={setGroup2}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {factorLevels.filter((g) => g !== group1).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {needsControlGroup && (
              <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                <Label className="text-xs mb-1 block">Control Group</Label>
                <Select value={controlGroup} onValueChange={setControlGroup}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {factorLevels.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsBinaryGroups && (
              <>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Score / Numeric Field</Label>
                  <Select value={scoreMeasureKey || measureKey} onValueChange={setScoreMeasureKey}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {numericKeys.map((k) => (
                        <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Binary Class Field</Label>
                  <Select value={eventMeasureKey || measureKey} onValueChange={setEventMeasureKey}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Select class field" />
                    </SelectTrigger>
                    <SelectContent>
                      {binaryMeasureKeys.map((k) => (
                        <SelectItem key={k} value={k}>{measureLabels[k] || k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Binary Group A</Label>
                  <Select value={binaryGroupA} onValueChange={setBinaryGroupA}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {factorLevels.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Binary Group B</Label>
                  <Select value={binaryGroupB} onValueChange={setBinaryGroupB}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {factorLevels.filter((g) => g !== binaryGroupA).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Positive Class</Label>
                  <Input value={positiveClass} onChange={(event) => setPositiveClass(event.target.value)} placeholder="Positive" />
                </div>
              </>
            )}

            {needsPowerPlanning && (
              <>
                <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Power Design</Label>
                  <Select
                    value={powerConfig.baseTest}
                    onValueChange={(value) => {
                      const nextBase = value as PowerBaseTest;
                      setPowerConfig(buildObservedPowerConfig(nextBase, {
                        objective: powerConfig.objective,
                        preservePlannedSample: powerConfig.objective !== "sample_size",
                      }));
                      setCurrentResult(null);
                    }}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {powerPlannerContext.baseTestOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div>
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.desc}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-3">
                  <Label className="text-xs mb-1 block">Objective</Label>
                  <Select
                    value={powerConfig.objective}
                    onValueChange={(value) => {
                      const objective = value as PowerObjective;
                      setPowerConfig((current) =>
                        objective === current.objective
                          ? current
                          : {
                              ...current,
                              objective,
                              plannedSample:
                                objective === "sample_size"
                                  ? current.plannedSample
                                  : {
                                      ...current.plannedSample,
                                      value: Math.max(2, Math.round(current.plannedSample.value || powerPlannerContext.observedPlannedSample.value)),
                                    },
                            },
                      );
                      setCurrentResult(null);
                    }}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {powerObjectiveOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Engine</Label>
                  <Select
                    value={powerConfig.engine}
                    onValueChange={(value) => {
                      setPowerConfig((current) => ({ ...current, engine: value as PowerConfig["engine"] }));
                      setCurrentResult(null);
                    }}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="analytic">Analytic</SelectItem>
                      <SelectItem value="simulation">Simulation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {powerTargetOptions.length > 1 && (
                  <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                    <Label className="text-xs mb-1 block">Target Effect</Label>
                    <Select
                      value={powerConfig.targetEffect}
                      onValueChange={(value) => {
                        setPowerConfig(buildObservedPowerConfig(powerConfig.baseTest, {
                          objective: powerConfig.objective,
                          preservePlannedSample: powerConfig.objective !== "sample_size",
                          targetEffect: value as PowerConfig["targetEffect"],
                        }));
                        setCurrentResult(null);
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {powerTargetOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(powerConfig.baseTest === "multi_compare" || powerConfig.baseTest === "dunnett") && powerPlannerContext.contrastOptions.length > 0 && (
                  <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                    <Label className="text-xs mb-1 block">Primary Contrast</Label>
                    <Select
                      value={getPowerContrastSelectionKey(powerConfig.contrastSelection || powerPlannerContext.contrastOptions[0] || null)}
                      onValueChange={(value) => {
                        const nextSelection =
                          powerPlannerContext.contrastOptions.find((option) => getPowerContrastSelectionKey(option) === value) || null;
                        setPowerConfig((current) => ({ ...current, contrastSelection: nextSelection }));
                        setCurrentResult(null);
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {powerPlannerContext.contrastOptions.map((option) => (
                          <SelectItem key={getPowerContrastSelectionKey(option)} value={getPowerContrastSelectionKey(option)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Alpha</Label>
                  <Input type="number" step="0.01" value={alpha} onChange={(event) => setAlpha(Number.parseFloat(event.target.value || "0.05") || 0.05)} />
                </div>
                <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Target Power</Label>
                  <Input type="number" step="0.05" value={targetPower} onChange={(event) => setTargetPower(Number.parseFloat(event.target.value || "0.8") || 0.8)} />
                </div>
                {powerConfig.effectMetric === "event_rates" && typeof powerConfig.effectValue !== "number" ? (
                  <>
                    <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                      <Label className="text-xs mb-1 block">Group 1 Event Rate</Label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step="0.01"
                        value={powerConfig.effectValue.group1}
                        onChange={(event) => {
                          const nextValue = Number.parseFloat(event.target.value || "0");
                          setPowerConfig((current) => ({
                            ...current,
                            effectValue: {
                              group1: nextValue,
                              group2: typeof current.effectValue === "number" ? nextValue : current.effectValue.group2,
                            },
                          }));
                          setCurrentResult(null);
                        }}
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                      <Label className="text-xs mb-1 block">Group 2 Event Rate</Label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step="0.01"
                        value={powerConfig.effectValue.group2}
                        onChange={(event) => {
                          const nextValue = Number.parseFloat(event.target.value || "0");
                          setPowerConfig((current) => ({
                            ...current,
                            effectValue: {
                              group1: typeof current.effectValue === "number" ? nextValue : current.effectValue.group1,
                              group2: nextValue,
                            },
                          }));
                          setCurrentResult(null);
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                    <Label className="text-xs mb-1 block">Assumed {powerPlannerContext.effectMetricLabel}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={typeof powerConfig.effectValue === "number" ? powerConfig.effectValue : 0}
                      onChange={(event) => {
                        setPowerConfig((current) => ({ ...current, effectValue: Number.parseFloat(event.target.value || "0") || 0 }));
                        setCurrentResult(null);
                      }}
                    />
                  </div>
                )}
                {powerConfig.objective !== "sample_size" && (
                  <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                    <Label className="text-xs mb-1 block">{powerPlannerContext.sampleModeLabel}</Label>
                    <Input
                      type="number"
                      min={2}
                      step="1"
                      value={powerConfig.plannedSample.value}
                      onChange={(event) => {
                        setPowerConfig((current) => ({
                          ...current,
                          plannedSample: {
                            ...current.plannedSample,
                            value: Math.max(2, Math.round(Number.parseFloat(event.target.value || "2") || 2)),
                          },
                        }));
                        setCurrentResult(null);
                      }}
                    />
                  </div>
                )}
                <div className="min-w-0 sm:col-span-2 lg:col-span-2 flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setPowerConfig(buildObservedPowerConfig(powerConfig.baseTest, {
                        objective: powerConfig.objective,
                        preservePlannedSample: powerConfig.objective !== "sample_size",
                      }));
                      setCurrentResult(null);
                    }}
                  >
                    Use Observed
                  </Button>
                </div>
              </>
            )}

            {(testType === "anova") && (
              <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                <Label className="text-xs mb-1 block">Post-hoc</Label>
                <Select value={postHocMethod} onValueChange={(value) => setPostHocMethod(value as "none" | "tukey")}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="tukey">Tukey-style pooled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsPAdjust && (
              <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                <Label className="text-xs mb-1 block">P-value correction</Label>
                <Select value={pAdjustMethod} onValueChange={(value) => setPAdjustMethod(value as "none" | "bonferroni" | "holm" | "fdr")}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bonferroni">Bonferroni</SelectItem>
                    <SelectItem value="holm">Holm</SelectItem>
                    <SelectItem value="fdr">FDR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="min-w-0 sm:col-span-1 lg:col-span-2">
              <Label className="text-xs mb-1 block">Result Table Export</Label>
              <Select value={tableExportMode} onValueChange={(value) => setTableExportMode(value as "long" | "wide")}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
            <Label className="text-xs mb-1 block">Report Bundle Measures</Label>
            <div className="flex flex-wrap gap-2">
              {numericKeys.slice(0, 10).map((key) => {
                const selected = reportMeasureKeys.includes(key);
                return (
                  <Button
                    key={key}
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      setReportMeasureKeys((current) =>
                        current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
                      )
                    }
                  >
                    {measureLabels[key] || key}
                  </Button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              These measures are carried into the saved revision report bundle and export metadata, even when the active analysis is centered on one primary outcome.
            </p>
          </div>

          {needsLongitudinalModel && (
            <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
              {activeTestType === "repeated_measures_anova"
                ? "Repeated-measures ANOVA only runs on animals with complete values across the selected timepoints."
                : "Mixed-effects uses per-animal intercept modeling so incomplete longitudinal data can still be analyzed."}
            </div>
          )}

          {needsPowerPlanning && (
            <div className={`rounded-md border px-3 py-2 text-xs ${powerPlannerContext.eligible ? "border-slate-200 bg-slate-50/70 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <div className="font-medium text-slate-800">Planner defaults</div>
              <div className="mt-1">
                {powerPlannerContext.assumptionNotes.length > 0
                  ? powerPlannerContext.assumptionNotes.join(" ")
                  : "Observed-effect defaults will populate here once the selected design has enough data to estimate nuisance structure."}
              </div>
            </div>
          )}

          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
            Outlier screen preference: {outlierMethod.toUpperCase()} at {formatNum(outlierThreshold, 2)}. Export tables will prefer {tableExportMode} format for downstream figure/report packets.
          </div>

          <Button
            onClick={runTest}
            disabled={!measureKey || powerBusy || (needsPowerPlanning && !powerPlannerContext.eligible)}
            className="w-full gap-1.5 bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
          >
            <FlaskConical className="h-4 w-4" /> {powerBusy ? "Running Planner..." : "Run Analysis"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {currentResult && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b bg-slate-50/70 py-3 px-4">
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
  const anovaTable = result.anova_table as Array<Record<string, unknown>> | undefined;
  const cellCounts = result.cell_counts as Array<Record<string, unknown>> | undefined;
  const assumptionChecks = result.assumption_checks as Array<Record<string, unknown>> | undefined;
  const contingencyTable = result.contingency_table as Array<Record<string, unknown>> | undefined;
  const survivalCurves = result.survival_curves as Array<Record<string, unknown>> | undefined;
  const thresholdTable = result.threshold_table as Array<Record<string, unknown>> | undefined;
  const fittedPoints = result.fitted_points as Array<Record<string, unknown>> | undefined;
  const includedAnimals = result.included_animals as number | undefined;
  const excludedAnimals = result.excluded_animals as number | undefined;

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-600">
        <span className="font-medium">Measure:</span> {String(result.measure)}
      </div>
      {(includedAnimals !== undefined || excludedAnimals !== undefined) && (
        <div className="text-xs text-slate-600">
          <span className="font-medium">Analysis set:</span> {includedAnimals ?? 0} included / {excludedAnimals ?? 0} excluded
        </div>
      )}
      {result.grouped_by != null && (
        <div className="text-xs text-slate-600">
          <span className="font-medium">Grouped by:</span> {String(result.grouped_by)}
        </div>
      )}
      {(result.subject_factor != null || result.within_subject_factor != null || result.between_subject_factor != null) && (
        <div className="text-xs text-slate-600">
          <span className="font-medium">Model:</span>{" "}
          subject = {String(result.subject_factor || "animal")} · within = {String(result.within_subject_factor || "timepoint")}
          {result.between_subject_factor && result.between_subject_factor !== "__none__"
            ? ` · between = ${String(result.between_subject_factor)}`
            : ""}
        </div>
      )}
      {result.warning != null && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {String(result.warning)}
        </div>
      )}

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
      {comparisons == null && anovaTable == null && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(result)
            .filter(([k]) => !["test", "measure", "grouped_by", "group_stats", "group1_stats", "group2_stats", "comparisons", "anova_table", "cell_counts", "warning", "significant_005", "significant_001", "groups_compared", "levels_a", "levels_b", "factor_a", "factor_b", "assumption_checks", "included_animals", "excluded_animals", "posthoc_label", "subject_factor", "within_subject_factor", "between_subject_factor", "model_kind", "reportSummary", "reportResultsText", "reportMethodsText", "reportCaption", "reportWarnings", "figureMetadata", "survival_curves", "threshold_table", "roc_points", "fitted_points", "observed_expected", "optimal_threshold"].includes(k) && typeof result[k] !== "object")
            .map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{key.replace(/_/g, " ")}</div>
                <div className="text-sm font-medium mt-0.5 tabular-nums">
                  {typeof value === "number" ? (key.includes("p") ? (value < 0.001 ? "< 0.001" : value.toFixed(4)) : value.toFixed(4)) : String(value)}
                </div>
              </div>
            ))}
        </div>
      )}

      {assumptionChecks && assumptionChecks.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-700">Assumption checks</div>
          <div className="grid gap-2 md:grid-cols-2">
            {assumptionChecks.map((check, index) => (
              <div
                key={`${String(check.name)}-${index}`}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  check.status === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : check.status === "pass"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <div className="font-medium">{String(check.name)}</div>
                <div className="mt-1">{String(check.message)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {anovaTable && (
        <div className="space-y-2">
          {(result.factor_a != null || result.factor_b != null) && (
            <div className="text-xs text-slate-600">
              <span className="font-medium">Factors:</span> {String(result.factor_a)} and {String(result.factor_b)}
            </div>
          )}
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50/70">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">SS</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">df</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">MS</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">F</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">p</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Partial η²</th>
                </tr>
              </thead>
              <tbody>
                {anovaTable.map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-medium">{String(row.source)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.ss == null ? "—" : formatNum(Number(row.ss), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.df == null ? "—" : String(row.df)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.ms == null ? "—" : formatNum(Number(row.ms), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.F == null ? "—" : formatNum(Number(row.F), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.p == null ? "—" : Number(row.p) < 0.001 ? "< .001" : Number(row.p).toFixed(4)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.partial_eta_sq == null ? "—" : formatNum(Number(row.partial_eta_sq), 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cellCounts && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50/70">
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Factor A</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Factor B</th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Included n</th>
                  </tr>
                </thead>
                <tbody>
                  {cellCounts.map((cell, index) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="px-2 py-1.5">{String(cell.levelA)}</td>
                      <td className="px-2 py-1.5">{String(cell.levelB)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{String(cell.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {contingencyTable && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50/70">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Group</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Positive</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Negative</th>
                </tr>
              </thead>
              <tbody>
                {contingencyTable.map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-medium">{String(row.group)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{String(row.positive ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{String(row.negative ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {survivalCurves && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-700">Survival curves</div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50/70">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Group</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">N</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Events</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Censored</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Median Survival</th>
                </tr>
              </thead>
              <tbody>
                {survivalCurves.map((curve, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-medium">{String(curve.group)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{String(curve.n)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{String(curve.events)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{String(curve.censored)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{curve.median_survival == null ? "—" : formatNum(Number(curve.median_survival), 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {thresholdTable && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-700">ROC threshold summary</div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50/70">
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Threshold</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Sensitivity</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Specificity</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Youden J</th>
                </tr>
              </thead>
              <tbody>
                {thresholdTable.slice(0, 8).map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(Number(row.threshold), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(Number(row.sensitivity), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(Number(row.specificity), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(Number(row.youden_j), 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fittedPoints && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-700">Fitted curve preview</div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50/70">
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Predictor</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Fitted</th>
                </tr>
              </thead>
              <tbody>
                {fittedPoints.slice(0, 12).map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(Number(row.x), 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(Number(row.y), 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Group stats */}
      {(result.group1_stats != null || result.group_stats != null) && (
        <div className="text-xs">
          <span className="font-medium">Group Statistics:</span>
          <div className="mt-1 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50/70">
                  <th className="text-left py-1 px-2 font-medium text-muted-foreground">Group</th>
                  <th className="text-right py-1 px-2 font-medium text-muted-foreground">N</th>
                  <th className="text-right py-1 px-2 font-medium text-muted-foreground">Mean</th>
                  <th className="text-right py-1 px-2 font-medium text-muted-foreground">SD</th>
                  {((result.group1_stats as Record<string, unknown>)?.sem !== undefined || (result.group1_stats as Record<string, unknown>)?.mean_rank_proxy !== undefined) && (
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
                        <td className="text-right py-1 px-2 tabular-nums">{g.mean == null ? "—" : formatNum(g.mean as number)}</td>
                        <td className="text-right py-1 px-2 tabular-nums">{g.sd == null ? "—" : formatNum(g.sd as number)}</td>
                        {((g.sem !== undefined) || (g.median !== undefined)) && (
                          <td className="text-right py-1 px-2 tabular-nums">
                            {g.sem !== undefined ? formatNum(g.sem as number) : formatNum(g.median as number)}
                          </td>
                        )}
                      </tr>
                    ))
                  : [result.group1_stats, result.group2_stats].filter(Boolean).map((g, i) => {
                      const gs = g as Record<string, unknown>;
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 px-2 font-medium" style={{ color: GROUP_COLORS[gs.name as string] }}>{String(gs.name)}</td>
                          <td className="text-right py-1 px-2 tabular-nums">{String(gs.n)}</td>
                          <td className="text-right py-1 px-2 tabular-nums">{gs.mean == null ? "—" : formatNum(gs.mean as number)}</td>
                          <td className="text-right py-1 px-2 tabular-nums">{gs.sd == null ? "—" : formatNum(gs.sd as number)}</td>
                          {(gs.sem !== undefined || gs.mean_rank_proxy !== undefined) && (
                            <td className="text-right py-1 px-2 tabular-nums">
                              {gs.sem !== undefined ? formatNum(gs.sem as number) : formatNum(gs.mean_rank_proxy as number)}
                            </td>
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
            (k) => typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k]) && !["test", "measure", "figureMetadata"].includes(k)
          );
          if (groupKeys.length === 0) return null;
          return (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50/70">
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
        <div className="space-y-2">
          {result.posthoc_label != null && (
            <div className="text-xs text-slate-600">
              <span className="font-medium">Post-hoc:</span> {String(result.posthoc_label)}
            </div>
          )}
          <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50/70">
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Comparison</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Statistic</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">p</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Adjusted p</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Effect</th>
                <th className="text-center py-1.5 px-2 font-medium text-muted-foreground">Sig.</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c, i) => (
                <tr key={i} className={`border-b last:border-0 ${c.significant ? "bg-green-50/50 dark:bg-green-950/10" : ""}`}>
                  <td className="py-1.5 px-2 font-medium">{String(c.comparison)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {String(c.statistic_label || "stat")} = {formatNum(Number(c.statistic || 0), 3)}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{(c.p as number) < 0.001 ? "< .001" : (c.p as number).toFixed(4)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {(Number(c.adjusted_p ?? c.p) < 0.001) ? "< .001" : Number(c.adjusted_p ?? c.p).toFixed(4)}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {String(c.effect_label || "Effect")} = {formatNum(Number(c.effect_size || 0), 3)}
                  </td>
                  <td className="text-center py-1.5 px-2">
                    {c.significant ? (
                      <Badge className="bg-green-600 text-[10px]">*</Badge>
                    ) : (
                      <span className="text-muted-foreground">ns</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="text-[10px] text-muted-foreground px-2">
            Significance is based on the adjusted p-value shown above.
          </p>
        </div>
      )}
    </div>
  );
}

function ReportPreviewPanel({
  reportPayload,
  exclusions,
  analysisName,
}: {
  reportPayload: AnalysisReportPayload | null;
  exclusions: Array<{ animalId: string; reason: string }>;
  analysisName: string;
}) {
  if (!reportPayload) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Info className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Run an analysis to generate a manuscript-style report preview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="border-b bg-slate-50/70 py-3 px-4">
          <CardTitle className="text-sm font-medium">{analysisName} Report Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
            <p className="mt-1 text-sm text-slate-800">{reportPayload.reportSummary}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Methods Note</p>
            <p className="mt-1 text-sm text-slate-800">{reportPayload.reportMethodsText}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Results Text</p>
            <p className="mt-1 text-sm text-slate-800">{reportPayload.reportResultsText}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Figure Caption</p>
            <p className="mt-1 text-sm text-slate-800">{reportPayload.reportCaption}</p>
          </div>
          {reportPayload.bundledMeasures && reportPayload.bundledMeasures.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bundled Measures</p>
              <p className="mt-1 text-sm text-slate-800">{reportPayload.bundledMeasures.join(", ")}</p>
            </div>
          )}
          {reportPayload.multiEndpointResults.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Multi-endpoint Bundle</p>
              <div className="mt-1 space-y-1">
                {reportPayload.multiEndpointResults.map((entry) => (
                  <div key={entry.measureKey} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-medium">{entry.measureLabel}</span>: {entry.summary}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warnings</p>
            <div className="mt-1 space-y-1">
              {reportPayload.reportWarnings.length > 0 ? (
                reportPayload.reportWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {warning}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No warnings on this saved result.</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnostics</p>
            <div className="mt-1 space-y-1">
              {reportPayload.diagnostics.length > 0 ? (
                reportPayload.diagnostics.map((diagnostic, index) => (
                  <div
                    key={`${diagnostic.message}-${index}`}
                    className={`rounded-md px-3 py-2 text-xs ${
                      diagnostic.level === "warn"
                        ? "border border-amber-200 bg-amber-50 text-amber-900"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-medium">{diagnostic.source || "Diagnostic"}:</span> {diagnostic.message}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No additional diagnostics were generated.</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Figure Packet</p>
            <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p><span className="font-medium">Recommended chart:</span> {reportPayload.figurePacket.figureMetadata.recommendedChartType || reportPayload.figurePacket.figureMetadata.chartType}</p>
              <p className="mt-1"><span className="font-medium">Result family:</span> {reportPayload.figurePacket.figureMetadata.resultFamily || "general"}</p>
              <p className="mt-1"><span className="font-medium">Grouping:</span> {reportPayload.figurePacket.figureMetadata.grouping}</p>
            </div>
          </div>
          {reportPayload.resultTables.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Structured Result Tables</p>
              <div className="mt-2 space-y-3">
                {reportPayload.resultTables.map((table) => (
                  <div key={table.id} className="rounded-md border border-slate-200 bg-white">
                    <div className="border-b bg-slate-50/70 px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{table.title}</p>
                      {table.description ? <p className="mt-0.5 text-xs text-slate-600">{table.description}</p> : null}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50/40">
                            {table.columns.map((column) => (
                              <th key={column} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                                {column.replace(/_/g, " ")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, rowIndex) => (
                            <tr key={`${table.id}-${rowIndex}`} className="border-b last:border-0">
                              {table.columns.map((column) => (
                                <td key={column} className="px-2 py-1.5 align-top text-slate-700">
                                  {row[column] == null || row[column] === "" ? "—" : String(row[column])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exclusions Appendix</p>
            <div className="mt-1 space-y-1">
              {exclusions.length > 0 ? (
                exclusions.map((entry) => (
                  <div key={entry.animalId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-medium">{entry.animalId}</span>: {entry.reason || "No reason provided"}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No animals were excluded in this revision.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Visualization Panel ────────────────────────────────────────────────────

class AnalysisPlotErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Plot rendering failed." };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Colony analysis plot render failed", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/70 p-8 text-center">
          <Info className="mx-auto mb-2 h-6 w-6 text-amber-700/70" />
          <p className="text-sm font-medium text-amber-900">This figure could not be rendered.</p>
          <p className="mt-1 text-xs text-amber-800">
            The saved revision data is still available, but this graph configuration needs to be reset or regenerated.
          </p>
          {this.state.message ? <p className="mt-2 text-[11px] text-amber-700">{this.state.message}</p> : null}
        </div>
      );
    }
    return this.props.children;
  }
}

function VisualizationPanel({
  flatData,
  numericKeys,
  measureLabels,
  groups,
  initialConfig,
  initialFigureStudioConfig,
  result,
  reportPayload,
  onConfigChange,
  onFigureStudioChange,
}: {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels: Record<string, string>;
  groups: string[];
  initialConfig?: ColonyAnalysisVisualizationDraft;
  initialFigureStudioConfig?: FigureStudioDraft;
  result: Record<string, unknown> | null;
  reportPayload: AnalysisReportPayload | null;
  onConfigChange?: (next: ColonyAnalysisVisualizationDraft) => void;
  onFigureStudioChange?: (next: FigureStudioDraft) => void;
}) {
  const normalizedInitialConfig = useMemo(() => normalizeVisualizationDraft(initialConfig), [initialConfig]);
  const normalizedInitialFigureStudioConfig = useMemo(
    () =>
      normalizeFigureStudioDraft(
        initialFigureStudioConfig,
        normalizedInitialConfig.chartType,
        "",
        measureLabels[normalizedInitialConfig.measureKey] || normalizedInitialConfig.measureKey,
      ),
    [initialFigureStudioConfig, measureLabels, normalizedInitialConfig],
  );
  const initialConfigRef = useRef<ColonyAnalysisVisualizationDraft>(normalizedInitialConfig);
  const initialFigureStudioConfigRef = useRef<FigureStudioDraft>(normalizedInitialFigureStudioConfig);
  const lastEmittedConfigRef = useRef("");
  const lastEmittedFigureStudioConfigRef = useRef("");
  const safeNumericKeys = useMemo(() => numericKeys.filter(Boolean), [numericKeys]);
  const [chartType, setChartType] = useState(normalizedInitialConfig.chartType);
  const [measureKey, setMeasureKey] = useState(normalizedInitialConfig.measureKey || safeNumericKeys[0] || "");
  const [measureKey2, setMeasureKey2] = useState(normalizedInitialConfig.measureKey2 || safeNumericKeys[1] || "");
  const [groupBy, setGroupBy] = useState<"group" | "sex" | "genotype" | "cohort">(normalizedInitialConfig.groupBy);
  const [title, setTitle] = useState(normalizedInitialConfig.title);
  const [showPoints, setShowPoints] = useState(normalizedInitialConfig.showPoints);
  const [figureStudio, setFigureStudio] = useState<FigureStudioDraft>(normalizedInitialFigureStudioConfig);
  const plotRef = useRef<HTMLDivElement>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // Significance annotations
  type SigAnnotation = { group1: string; group2: string; label: string };
  const SIG_LABELS = ["ns", "*", "**", "***", "****"];
  const [sigAnnotations, setSigAnnotations] = useState<SigAnnotation[]>(normalizedInitialConfig.sigAnnotations);
  const [pendingGroup1, setPendingGroup1] = useState("");
  const [pendingGroup2, setPendingGroup2] = useState("");
  const [pendingLabel, setPendingLabel] = useState("*");
  const [autoRunSigStars, setAutoRunSigStars] = useState(normalizedInitialConfig.autoRunSigStars);
  const [autoStatsMethod, setAutoStatsMethod] = useState<"welch_t" | "mann_whitney">(normalizedInitialConfig.autoStatsMethod);
  const [autoPAdjust, setAutoPAdjust] = useState<"none" | "bonferroni">(normalizedInitialConfig.autoPAdjust);
  const [includeNsAnnotations, setIncludeNsAnnotations] = useState(normalizedInitialConfig.includeNsAnnotations);
  const [showManualSigControls, setShowManualSigControls] = useState(false);
  const [autoStatsSummary, setAutoStatsSummary] = useState<{
    tested: number;
    added: number;
    method: string;
    correction: string;
  } | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    initialConfigRef.current = normalizedInitialConfig;
  }, [normalizedInitialConfig]);

  useEffect(() => {
    initialFigureStudioConfigRef.current = normalizedInitialFigureStudioConfig;
    const incomingSignature = JSON.stringify(normalizedInitialFigureStudioConfig);
    setFigureStudio((current) => (
      JSON.stringify(current) === incomingSignature ? current : normalizedInitialFigureStudioConfig
    ));
  }, [normalizedInitialFigureStudioConfig]);

  const recommendedChartType = reportPayload?.figureMetadata.recommendedChartType || null;
  const effectiveChartType = useMemo<VisualizationChartType>(() => {
    if (!recommendedChartType) return chartType;
    const family = reportPayload?.figureMetadata.resultFamily;
    const allowed = family ? CHART_COMPATIBILITY_MAP[family] : undefined;
    if (!allowed || allowed.length === 0) return chartType;
    return allowed.includes(chartType) ? chartType : recommendedChartType;
  }, [chartType, recommendedChartType, reportPayload?.figureMetadata.resultFamily]);
  const availableChartOptions = useMemo(() => {
    const family = reportPayload?.figureMetadata.resultFamily;
    const allowed = family ? CHART_COMPATIBILITY_MAP[family] : undefined;
    if (!allowed || allowed.length === 0) return CHART_OPTIONS;
    return CHART_OPTIONS.filter((option) => allowed.includes(option.value));
  }, [reportPayload?.figureMetadata.resultFamily]);

  const showMeasureSelectors = !["survival_curve", "roc_curve", "regression_fit", "paired_slope"].includes(effectiveChartType);
  const allowSecondaryMeasure = effectiveChartType === "scatter";
  const supportsSignificance = !["scatter", "timepoint_line", "survival_curve", "roc_curve", "regression_fit", "paired_slope"].includes(effectiveChartType);
  const getGrouping = useCallback((row: FlatRow): string => {
    switch (groupBy) {
      case "sex":
        return row.sex;
      case "genotype":
        return row.genotype;
      case "cohort":
        return row.cohort;
      case "group":
      default:
        return row.group;
    }
  }, [groupBy]);
  const groupLabels = useMemo(
    () =>
      groupBy === "group"
        ? groups
        : Array.from(new Set(flatData.map(getGrouping))).sort(),
    [flatData, getGrouping, groupBy, groups],
  );
  const resultDrivenSigAnnotations = useMemo(
    () =>
      deriveSignificanceAnnotationsFromResult(result, {
        allowedGroups: groupLabels,
        includeNs: includeNsAnnotations,
        maxAnnotations: includeNsAnnotations ? 6 : 4,
      }),
    [groupLabels, includeNsAnnotations, result],
  );
  const effectiveSigAnnotations = useMemo(
    () =>
      getEffectiveSigAnnotations({
        result,
        current: {
          ...normalizedInitialConfig,
          chartType: effectiveChartType,
          measureKey,
          measureKey2,
          groupBy,
          title,
          showPoints,
          sigAnnotations,
          autoRunSigStars,
          autoStatsMethod,
          autoPAdjust,
          includeNsAnnotations,
        },
        figureStudio,
        allowedGroups: groupLabels,
      }),
    [
      autoPAdjust,
      autoRunSigStars,
      autoStatsMethod,
      effectiveChartType,
      figureStudio,
      groupBy,
      groupLabels,
      includeNsAnnotations,
      measureKey,
      measureKey2,
      normalizedInitialConfig,
      result,
      showPoints,
      sigAnnotations,
      title,
    ],
  );

  useEffect(() => {
    if (safeNumericKeys.length === 0) return;
    if (!safeNumericKeys.includes(measureKey)) setMeasureKey(safeNumericKeys[0] || "");
    if (measureKey2 && !safeNumericKeys.includes(measureKey2)) {
      setMeasureKey2(safeNumericKeys.find((key) => key !== measureKey) || safeNumericKeys[1] || "");
    }
  }, [measureKey, measureKey2, safeNumericKeys]);

  useEffect(() => {
    // When chart family / measure / title changes, re-normalize the figure
    // studio draft but DON'T force-set axisY.title here. The input field
    // renders the computed fallback (`figureStudio.axisY.title ||
    // measureLabels[measureKey] || measureKey`) for display, and
    // getAxisLayout uses the same fallback at plot-render time. Previously
    // we set axisY.title to `current.axisY.title || measureLabels[...]`,
    // which made the stored title sticky: once seeded with measure A's
    // label, it persisted across measure switches and the Y axis kept
    // showing measure A even after the user chose measure B. Keeping
    // axisY.title empty unless the user explicitly types a custom value
    // lets the fallback track the current measure automatically.
    setFigureStudio((current) =>
      normalizeFigureStudioDraft(
        {
          ...current,
          chartFamily: effectiveChartType,
          title: current.title || title,
        },
        effectiveChartType,
        current.axisX.title,
        measureLabels[measureKey] || measureKey,
      ),
    );
  }, [effectiveChartType, measureKey, measureLabels, title]);

  useEffect(() => {
    const nextConfig = normalizeVisualizationDraft({
      ...initialConfigRef.current,
      chartType: effectiveChartType,
      measureKey,
      measureKey2,
      groupBy,
      title,
      showPoints,
      sigAnnotations,
      autoRunSigStars,
      autoStatsMethod,
      autoPAdjust,
      includeNsAnnotations,
    });
    const nextConfigSignature = JSON.stringify(nextConfig);
    if (lastEmittedConfigRef.current !== nextConfigSignature) {
      lastEmittedConfigRef.current = nextConfigSignature;
      onConfigChange?.(nextConfig);
    }

    // Emit the config for saving. Do NOT force-seed axisY.title here — keep
    // it as whatever the user has explicitly typed (or empty). Display of
    // the Y axis is handled by a fallback (measure label) at render time,
    // so an empty stored title renders correctly AND keeps tracking the
    // current measure when the user changes their selection.
    const nextFigureStudioConfig = normalizeFigureStudioDraft(
      {
        ...initialFigureStudioConfigRef.current,
        ...figureStudio,
        chartFamily: effectiveChartType,
        title: figureStudio.title || title,
      },
      effectiveChartType,
      figureStudio.axisX.title,
      measureLabels[measureKey] || measureKey,
    );
    const nextFigureStudioSignature = JSON.stringify(nextFigureStudioConfig);
    if (lastEmittedFigureStudioConfigRef.current !== nextFigureStudioSignature) {
      lastEmittedFigureStudioConfigRef.current = nextFigureStudioSignature;
      onFigureStudioChange?.(nextFigureStudioConfig);
    }
  }, [
    autoPAdjust,
    autoRunSigStars,
    autoStatsMethod,
    effectiveChartType,
    figureStudio,
    groupBy,
    includeNsAnnotations,
    measureKey,
    measureKey2,
    measureLabels,
    onConfigChange,
    onFigureStudioChange,
    showPoints,
    sigAnnotations,
    title,
  ]);

  const autoGenerateSigAnnotations = useCallback((): {
    annotations: SigAnnotation[];
    tested: number;
  } => {
    if (!measureKey) return { annotations: [], tested: 0 };
    if (!supportsSignificance) return { annotations: [], tested: 0 };

    const pToLabel = (p: number): string => {
      if (p < 0.0001) return "****";
      if (p < 0.001) return "***";
      if (p < 0.01) return "**";
      if (p < 0.05) return "*";
      return "ns";
    };

    const candidates: Array<{ group1: string; group2: string; p: number }> = [];
    for (let i = 0; i < groupLabels.length; i++) {
      for (let j = i + 1; j < groupLabels.length; j++) {
        const g1 = groupLabels[i];
        const g2 = groupLabels[j];

        const vals1 = flatData
          .filter((r) => getGrouping(r) === g1)
          .map((r) => Number(r[measureKey]))
          .filter((v) => !isNaN(v));
        const vals2 = flatData
          .filter((r) => getGrouping(r) === g2)
          .map((r) => Number(r[measureKey]))
          .filter((v) => !isNaN(v));

        if (vals1.length < 2 || vals2.length < 2) continue;
        const p =
          autoStatsMethod === "welch_t"
            ? welchTTest(vals1, vals2).p
            : mannWhitneyUTest(vals1, vals2).p;
        candidates.push({ group1: g1, group2: g2, p });
      }
    }

    const nComparisons = candidates.length;
    const autoAnnotations = candidates
      .map((c) => {
        const correctedP = autoPAdjust === "bonferroni"
          ? Math.min(c.p * Math.max(nComparisons, 1), 1)
          : c.p;
        return { group1: c.group1, group2: c.group2, label: pToLabel(correctedP), p: correctedP };
      })
      .filter((ann) => includeNsAnnotations || ann.label !== "ns")
      .sort((a, b) => a.p - b.p)
      .slice(0, includeNsAnnotations ? 6 : 4)
      .map(({ group1, group2, label }) => ({ group1, group2, label }));

    return { annotations: autoAnnotations, tested: nComparisons };
  }, [supportsSignificance, groupLabels, flatData, getGrouping, measureKey, autoStatsMethod, autoPAdjust, includeNsAnnotations]);

  const applyAutoSigAnnotations = useCallback((showToast: boolean) => {
    const { annotations, tested } = autoGenerateSigAnnotations();
    setSigAnnotations(annotations);
    setAutoStatsSummary({
      tested,
      added: annotations.length,
      method: autoStatsMethod === "welch_t" ? "Welch t-test" : "Mann-Whitney U",
      correction: autoPAdjust === "bonferroni" ? "Bonferroni" : "None",
    });

    if (showToast) {
      if (tested === 0) {
        toast.message("No valid group pairs to test (need at least 2 values per group).");
      } else if (annotations.length === 0) {
        toast.message("Ran selected stats, but no annotations met your current settings.");
      } else {
        toast.success(`Ran ${tested} comparisons and added ${annotations.length} annotation${annotations.length === 1 ? "" : "s"}.`);
      }
    }
  }, [autoGenerateSigAnnotations, autoStatsMethod, autoPAdjust]);

  useEffect(() => {
    if (!autoRunSigStars) return;
    applyAutoSigAnnotations(false);
  }, [autoRunSigStars, applyAutoSigAnnotations]);

  const resolveGroupColor = useCallback(
    (group: string, index: number) =>
      figureStudio.traceStyle.groupColorOverrides[group] ||
      GROUP_COLORS[group] ||
      CHART_COLORS[index % CHART_COLORS.length],
    [figureStudio.traceStyle.groupColorOverrides],
  );
  const patchFigureStudio = useCallback((patch: Partial<FigureStudioDraft>) => {
    setFigureStudio((current) =>
      normalizeFigureStudioDraft(
        {
          ...current,
          ...patch,
        },
        effectiveChartType,
        current.axisX.title,
        measureLabels[measureKey] || measureKey,
      ),
    );
  }, [effectiveChartType, measureKey, measureLabels]);

  const xAxisTitle = figureStudio.axisX.title;
  const yAxisTitle = figureStudio.axisY.title || measureLabels[measureKey] || measureKey;

  const plotData = useMemo(() => {
    const measureLabel = measureLabels[measureKey] || measureKey;
    const chartTitle = title || reportPayload?.figureMetadata.title || measureLabel || String(result?.measure || "Analysis Figure");

    // Get grouping key values
    switch (effectiveChartType) {
      case "survival_curve": {
        if (!Array.isArray(result?.survival_curves) || result.survival_curves.length === 0) return null;
        const traces = (result.survival_curves as Array<Record<string, unknown>>).map((curve, index) => {
          const points = Array.isArray(curve.points) ? (curve.points as Array<Record<string, unknown>>) : [];
          const color = resolveGroupColor(String(curve.group || ""), index);
          return {
            x: points.map((point) => Number(point.time ?? 0)),
            y: points.map((point) => Number(point.survival ?? 0)),
            type: "scatter" as const,
            mode: "lines+markers" as const,
            line: { color, width: figureStudio.traceStyle.lineWidth, shape: "hv" as const },
            marker: {
              color,
              size: figureStudio.traceStyle.dotSize,
              symbol: figureStudio.traceStyle.dotSymbol,
            },
            name: String(curve.group || `Group ${index + 1}`),
          };
        });

        return {
          data: traces as Plotly.Data[],
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            xaxis: { title: { text: "Time" } },
            yaxis: { title: { text: "Survival probability" }, range: [0, 1.05] },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: true,
          },
        };
      }

      case "roc_curve": {
        if (!Array.isArray(result?.roc_points) || result.roc_points.length === 0) return null;
        const rocPoints = result.roc_points as Array<Record<string, unknown>>;
        const optimalThreshold = (result?.optimal_threshold as Record<string, unknown> | null) || null;
        const curveTrace: Plotly.Data = {
          x: rocPoints.map((point) => Number(point.fpr ?? 0)),
          y: rocPoints.map((point) => Number(point.tpr ?? 0)),
          type: "scatter",
          mode: "lines+markers",
          name: "ROC",
          line: { color: "#2563eb", width: figureStudio.traceStyle.lineWidth },
          marker: {
            color: "#2563eb",
            size: figureStudio.traceStyle.dotSize,
            symbol: figureStudio.traceStyle.dotSymbol,
          },
        };
        const traces: Plotly.Data[] = [
          curveTrace,
          {
            x: [0, 1],
            y: [0, 1],
            type: "scatter",
            mode: "lines",
            name: "Chance",
            line: { color: "#94a3b8", width: 1.5, dash: "dash" },
          },
        ];
        if (optimalThreshold) {
          traces.push({
            x: [Number(optimalThreshold.false_positive_rate ?? 0)],
            y: [Number(optimalThreshold.sensitivity ?? 0)],
            type: "scatter",
            mode: "markers",
            name: "Optimal threshold",
            marker: { color: "#dc2626", size: figureStudio.traceStyle.dotSize + 2, symbol: "diamond" },
          });
        }
        return {
          data: traces,
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            xaxis: { title: { text: "False Positive Rate" }, range: [0, 1] },
            yaxis: { title: { text: "True Positive Rate" }, range: [0, 1] },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: true,
          },
        };
      }

      case "regression_fit": {
        if (!Array.isArray(result?.points) || !Array.isArray(result?.fitted_points)) return null;
        const observed = result.points as Array<Record<string, unknown>>;
        const fitted = result.fitted_points as Array<Record<string, unknown>>;
        const traces: Plotly.Data[] = [
          {
            x: observed.map((point) => Number(point.x ?? 0)),
            y: observed.map((point) => Number(point.y ?? 0)),
            type: "scatter",
            mode: "markers",
            name: "Observed",
            marker: {
              color: "#0f766e",
              size: figureStudio.traceStyle.dotSize + 1,
              opacity: figureStudio.traceStyle.dotOpacity,
              symbol: figureStudio.traceStyle.dotSymbol,
            },
          },
          {
            x: fitted.map((point) => Number(point.x ?? 0)),
            y: fitted.map((point) => Number(point.y ?? 0)),
            type: "scatter",
            mode: "lines",
            name: "Fitted",
            line: { color: "#c2410c", width: figureStudio.traceStyle.lineWidth },
          },
        ];
        return {
          data: traces,
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            xaxis: { title: { text: String(result?.predictor_label || "Predictor") } },
            yaxis: { title: { text: String(result?.outcome_label || "Outcome") } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
            showlegend: true,
          },
        };
      }

      case "paired_slope": {
        if (!measureKey) return null;
        const groupsCompared = String(result?.groups_compared || "");
        const [leftGroup, rightGroup] = groupsCompared.includes(" vs ")
          ? groupsCompared.split(" vs ").map((value) => value.trim())
          : groupLabels.slice(0, 2);
        if (!leftGroup || !rightGroup) return null;
        const pairedRows = Array.from(
          flatData.reduce<Map<string, Record<string, number>>>((map, row) => {
            const group = getGrouping(row);
            if (group !== leftGroup && group !== rightGroup) return map;
            const value = Number(row[measureKey]);
            if (Number.isNaN(value)) return map;
            const current = map.get(row.animal_id) || {};
            current[group] = value;
            map.set(row.animal_id, current);
            return map;
          }, new Map()),
        ).filter(([, values]) => values[leftGroup] != null && values[rightGroup] != null);
        if (pairedRows.length === 0) return null;
        const traces: Plotly.Data[] = pairedRows.map(([animalId, values]) => ({
          x: [leftGroup, rightGroup],
          y: [Number(values[leftGroup]), Number(values[rightGroup])],
          type: "scatter",
          mode: "lines+markers",
          line: { color: "#94a3b8", width: figureStudio.traceStyle.showMatchedConnectors ? figureStudio.traceStyle.lineWidth : 0 },
          marker: {
            color: "#0f172a",
            size: figureStudio.traceStyle.dotSize,
            symbol: figureStudio.traceStyle.dotSymbol,
          },
          name: animalId,
          showlegend: false,
        }));
        return {
          data: traces,
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            yaxis: { title: { text: measureLabel || String(result?.measure || "Measure") } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 12 },
          },
        };
      }

      case "bar_sem":
      case "bar_sd": {
        if (!measureKey) return null;
        const useSEM = effectiveChartType === "bar_sem";
        const means: number[] = [];
        const errors: number[] = [];
        const colors: string[] = [];
        // Per-group sample size — surfaced as "(n=N)" under each x tick
        // label so the reader immediately sees the number of animals
        // contributing to each bar without hunting through the table.
        const counts: number[] = [];

        for (const g of groupLabels) {
          const values = flatData
            .filter((r) => getGrouping(r) === g)
            .map((r) => Number(r[measureKey]))
            .filter((v) => !isNaN(v));
          means.push(mean(values));
          errors.push(useSEM ? sem(values) : stdDev(values));
          colors.push(resolveGroupColor(g, groupLabels.indexOf(g)));
          counts.push(values.length);
        }

        // Use numeric x positions for BOTH bar and scatter so the scatter
        // overlay can be horizontally jittered (Plotly category axes don't
        // allow fractional offsets within a category). X axis tick labels
        // still show the group names via tickvals/ticktext.
        const barIndices = groupLabels.map((_, i) => i);
        const traces: Plotly.Data[] = [{
          x: barIndices,
          y: means,
          type: "bar",
          marker: {
            color: colors,
            opacity: figureStudio.traceStyle.barOpacity,
            line: { color: "#ffffff", width: figureStudio.traceStyle.outlineWidth },
          },
          error_y: {
            type: "data",
            array: errors,
            visible: figureStudio.traceStyle.errorBarStyle !== "none",
            thickness: figureStudio.traceStyle.lineWidth,
            width: figureStudio.traceStyle.errorBarCapWidth,
          },
          name: measureLabel,
        }];

        // Overlay individual data points with deterministic horizontal
        // jitter so dots in the same group don't stack on top of each
        // other. Seed is `${animal_id}::${group}` so the layout stays
        // stable across renders — same data always lands in the same
        // visual spots. The jitter amplitude is driven by the
        // `dotJitter` trace-style setting (0..1), mapped onto ~30% of a
        // bar width on either side of center (so dots stay within the bar).
        if (showPoints) {
          const jitterAmplitude = Math.max(0, Math.min(1, figureStudio.traceStyle.dotJitter ?? 0.35)) * 0.3;
          for (let i = 0; i < groupLabels.length; i++) {
            const g = groupLabels[i];
            const groupRows = flatData
              .filter((r) => getGrouping(r) === g)
              .map((r) => ({
                y: Number(r[measureKey]),
                seed: `${String(r.animal_id)}::${g}`,
                // Hover text format: "BPAN 3-4 · 30 days · LDB · run1"
                // Assembled so the user can instantly identify the dot
                // they're hovering without scrolling through the table.
                hoverText: [
                  String(r.identifier || r.animal_id),
                  r.timepoint !== undefined && r.timepoint !== null
                    ? `${r.timepoint} days`
                    : null,
                  r.experiment ? String(r.experiment) : null,
                  selectedRun?.name ? String(selectedRun.name) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))
              .filter((p) => !isNaN(p.y));
            traces.push({
              x: groupRows.map((p) => i + deterministicJitter(p.seed, jitterAmplitude)),
              y: groupRows.map((p) => p.y),
              type: "scatter",
              mode: "markers",
              marker: {
                color: colors[i],
                size: figureStudio.traceStyle.dotSize,
                opacity: figureStudio.traceStyle.dotOpacity,
                symbol: figureStudio.traceStyle.dotSymbol,
                line: { color: "white", width: figureStudio.traceStyle.outlineWidth },
              },
              showlegend: false,
              name: g,
              text: groupRows.map((p) => p.hoverText),
              hovertemplate: `<b>%{text}</b><br>${measureLabel}: %{y}<extra></extra>`,
            });
          }
        }

        return {
          data: traces,
          layout: {
            title: { text: chartTitle, font: { size: 16 } },
            xaxis: {
              title: { text: "" },
              tickmode: "array" as const,
              tickvals: barIndices,
              ticktext: groupLabels.map((g, i) => `${g}<br><span style="font-size:10px;color:#64748b">(n=${counts[i]})</span>`),
              range: [-0.5, groupLabels.length - 0.5] as [number, number],
            },
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
        if (!measureKey) return null;
        const traces = groupLabels.map((g, i) => {
          const values = flatData
            .filter((r) => getGrouping(r) === g)
            .map((r) => Number(r[measureKey]))
            .filter((v) => !isNaN(v));
          return {
            y: values,
            x: values.map(() => g),
            name: g,
            type: effectiveChartType as "box" | "violin",
            marker: {
              color: resolveGroupColor(g, i),
              opacity: figureStudio.traceStyle.dotOpacity,
              size: figureStudio.traceStyle.dotSize,
              symbol: figureStudio.traceStyle.dotSymbol,
            },
            ...(effectiveChartType === "box"
              ? { boxpoints: showPoints ? ("all" as const) : ("outliers" as const), jitter: figureStudio.traceStyle.dotJitter, pointpos: -1.8 }
              : {}),
            ...(effectiveChartType === "violin"
              ? { points: showPoints ? ("all" as const) : (false as const), jitter: figureStudio.traceStyle.dotJitter }
              : {}),
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
        if (!measureKey) return null;
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
              color: resolveGroupColor(g, i),
              size: figureStudio.traceStyle.dotSize + 2,
              opacity: figureStudio.traceStyle.dotOpacity,
              symbol: figureStudio.traceStyle.dotSymbol,
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
        if (!measureKey) return null;
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
                color: resolveGroupColor(g, i),
                size: figureStudio.traceStyle.dotSize,
                opacity: figureStudio.traceStyle.dotOpacity,
                symbol: figureStudio.traceStyle.dotSymbol,
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
              error_y: {
                type: "data" as const,
                array: [s],
                visible: figureStudio.traceStyle.errorBarStyle !== "none",
                thickness: figureStudio.traceStyle.lineWidth,
                width: figureStudio.traceStyle.errorBarCapWidth + 6,
              },
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
        if (!measureKey) return null;
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
            marker: {
              color: resolveGroupColor(g, i),
              size: figureStudio.traceStyle.dotSize,
              symbol: figureStudio.traceStyle.dotSymbol,
            },
            line: { color: resolveGroupColor(g, i), width: figureStudio.traceStyle.lineWidth },
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
  }, [
    effectiveChartType,
    figureStudio,
    flatData,
    getGrouping,
    groupLabels,
    measureKey,
    measureKey2,
    measureLabels,
    reportPayload?.figureMetadata.title,
    resolveGroupColor,
    result,
    showPoints,
    title,
  ]);

  // Build Plotly shapes + annotations for significance brackets
  const sigShapesAndAnnotations = useMemo(() => {
    if (!plotData || effectiveSigAnnotations.length === 0) {
      return { shapes: [], annotations: [], yRangeMin: null as number | null, yRangeMax: null as number | null };
    }
    if (!supportsSignificance) {
      return { shapes: [], annotations: [], yRangeMin: null as number | null, yRangeMax: null as number | null };
    }
    const drawableAnnotations = effectiveSigAnnotations.filter((ann) => ann.label !== "ns");
    if (drawableAnnotations.length === 0) {
      return { shapes: [], annotations: [], yRangeMin: null as number | null, yRangeMax: null as number | null };
    }

    // Compute max Y per group for bracket positioning
    const groupMaxY: Record<string, number> = {};
    for (const g of groupLabels) {
      const values = flatData
        .filter((r) => getGrouping(r) === g)
        .map((r) => Number(r[measureKey]))
        .filter((v) => !isNaN(v));
      const m = mean(values);
      const s = (effectiveChartType === "bar_sem" ? sem(values) : effectiveChartType === "bar_sd" ? stdDev(values) : 0);
      groupMaxY[g] = Math.max(m + s, ...values);
    }

    const allValues = flatData
      .map((r) => Number(r[measureKey]))
      .filter((v) => !isNaN(v));
    const yValues = Object.values(groupMaxY);
    const overallMax = Math.max(...yValues, ...allValues, 0);
    const overallMin = Math.min(...allValues, 0);
    const range = Math.max(overallMax - overallMin, 1);
    const step = Math.max(range * 0.14, 2.2); // extra spacing between stacked brackets

    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];

    // Stack wider brackets first so inner comparisons are easier to read
    const sorted = [...drawableAnnotations].sort((a, b) => {
      const spanA = Math.abs(groupLabels.indexOf(a.group2) - groupLabels.indexOf(a.group1));
      const spanB = Math.abs(groupLabels.indexOf(b.group2) - groupLabels.indexOf(b.group1));
      return spanB - spanA;
    });

    let currentY = overallMax + step * 1.8;

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
        text: ann.label,
        showarrow: false,
        font: { size: 15, color: "#111827" },
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "rgba(0,0,0,0)",
        borderpad: 1,
        xanchor: "center",
        yanchor: "bottom",
      });

      currentY += step;
    }

    const yRangeMax = currentY + step * 0.35;
    return {
      shapes,
      annotations,
      yRangeMin: overallMin < 0 ? overallMin * 1.08 : 0,
      yRangeMax,
    };
  }, [plotData, effectiveSigAnnotations, effectiveChartType, supportsSignificance, getGrouping, flatData, groupLabels, measureKey]);

  const handleExport = useCallback(
    async (format: "svg" | "png" | "pdf") => {
      const plotlyModule = await import("plotly.js-dist-min");
      const Plotly = plotlyModule.default || plotlyModule;
      const gd = plotRef.current?.querySelector(".js-plotly-plot") as HTMLElement | null;
      if (!gd) return;
      if (format === "pdf") {
        const win = window.open("", "_blank", "noopener,noreferrer,width=1280,height=960");
        if (!win) {
          toast.error("Unable to open the print window for PDF export.");
          return;
        }
        const image = await Plotly.toImage(gd, {
          format: "png",
          width: figureStudio.width,
          height: figureStudio.height,
        });
        const titleText = figureStudio.title || title || "Colony analysis figure";
        const caption = reportPayload?.reportCaption || "";
        win.document.write(`
          <html>
            <head>
              <title>${titleText}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 24px; color: #0f172a; }
                h1 { font-size: 20px; margin-bottom: 12px; }
                img { width: 100%; max-width: 1000px; border: 1px solid #cbd5e1; }
                p { font-size: 12px; line-height: 1.5; margin-top: 12px; }
              </style>
            </head>
            <body>
              <h1>${titleText}</h1>
              <img src="${image}" alt="${titleText}" />
              ${caption ? `<p>${caption}</p>` : ""}
            </body>
          </html>
        `);
        win.document.close();
        win.focus();
        win.print();
        return;
      }
      await Plotly.downloadImage(gd, {
        format,
        width: figureStudio.width,
        height: figureStudio.height,
        filename: figureStudio.title || title || "colony-analysis",
      });
    },
    [figureStudio.height, figureStudio.title, figureStudio.width, reportPayload?.reportCaption, title]
  );

  const handleExportFigureMetadata = useCallback(() => {
    if (!reportPayload) {
      toast.error("Run an analysis first to generate figure metadata.");
      return;
    }
    const packet = buildFigurePacket(reportPayload);
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(reportPayload.figureMetadata.title || "figure").replace(/\s+/g, "-").toLowerCase()}-metadata.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Figure metadata exported.");
  }, [reportPayload]);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-2">
              <Label className="text-xs mb-1 block">Chart Type</Label>
              <Select value={effectiveChartType} onValueChange={(value) => setChartType(value as VisualizationChartType)}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableChartOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showMeasureSelectors && (
            <div className={`min-w-0 ${allowSecondaryMeasure ? "lg:col-span-3" : "lg:col-span-4"}`}>
              <Label className="text-xs mb-1 block">
                {allowSecondaryMeasure ? "X Measure" : "Measure"}
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
            )}

            {allowSecondaryMeasure && (
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

            <div className={`min-w-0 ${allowSecondaryMeasure ? "lg:col-span-2" : "lg:col-span-3"}`}>
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

            <div className={`min-w-0 ${allowSecondaryMeasure ? "lg:col-span-2" : "lg:col-span-3"}`}>
              <Label className="text-xs mb-1 block">Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-generated"
                className="w-full min-w-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white/70 px-2.5 py-2">
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

          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium">Figure Studio</Label>
              <Badge variant="secondary" className="text-[10px]">
                Schema v{COLONY_ANALYSIS_SCHEMA_VERSION}
              </Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Figure title</Label>
                <Input
                  value={figureStudio.title}
                  onChange={(event) => patchFigureStudio({ title: event.target.value })}
                  placeholder="Publication title"
                />
              </div>
              <div className="lg:col-span-3">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Subtitle</Label>
                <Input
                  value={figureStudio.subtitle}
                  onChange={(event) => patchFigureStudio({ subtitle: event.target.value })}
                  placeholder="Optional subtitle"
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Canvas width</Label>
                <Input
                  type="number"
                  min={320}
                  value={figureStudio.width}
                  onChange={(event) => patchFigureStudio({ width: Number(event.target.value) || 1200 })}
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Canvas height</Label>
                <Input
                  type="number"
                  min={320}
                  value={figureStudio.height}
                  onChange={(event) => patchFigureStudio({ height: Number(event.target.value) || 800 })}
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Significance source</Label>
                <Select
                  value={figureStudio.significanceMode}
                  onValueChange={(value) =>
                    patchFigureStudio({
                      significanceMode: value as FigureStudioDraft["significanceMode"],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="result-driven">Result-driven</SelectItem>
                    <SelectItem value="manual-override">Manual override</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <Label className="mb-1 block text-[10px] text-muted-foreground">X axis title</Label>
                <Input
                  value={xAxisTitle}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisX: { ...figureStudio.axisX, title: event.target.value },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-3">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Y axis title</Label>
                <Input
                  value={yAxisTitle}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisY: { ...figureStudio.axisY, title: event.target.value },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Y min</Label>
                <Input
                  type="number"
                  value={figureStudio.axisY.min ?? ""}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisY: {
                        ...figureStudio.axisY,
                        autoScale: false,
                        min: event.target.value === "" ? null : Number(event.target.value),
                      },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Y max</Label>
                <Input
                  type="number"
                  value={figureStudio.axisY.max ?? ""}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisY: {
                        ...figureStudio.axisY,
                        autoScale: false,
                        max: event.target.value === "" ? null : Number(event.target.value),
                      },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Legend</Label>
                <Select
                  value={figureStudio.legend.position}
                  onValueChange={(value) =>
                    patchFigureStudio({
                      legend: {
                        ...figureStudio.legend,
                        position: value as FigureStudioDraft["legend"]["position"],
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Dot size</Label>
                <Input
                  type="number"
                  min={1}
                  value={figureStudio.traceStyle.dotSize}
                  onChange={(event) =>
                    patchFigureStudio({
                      traceStyle: {
                        ...figureStudio.traceStyle,
                        dotSize: Number(event.target.value) || figureStudio.traceStyle.dotSize,
                      },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Dot opacity</Label>
                <Input
                  type="number"
                  min={0.05}
                  max={1}
                  step="0.05"
                  value={figureStudio.traceStyle.dotOpacity}
                  onChange={(event) =>
                    patchFigureStudio({
                      traceStyle: {
                        ...figureStudio.traceStyle,
                        dotOpacity: Number(event.target.value) || figureStudio.traceStyle.dotOpacity,
                      },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Line width</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={figureStudio.traceStyle.lineWidth}
                  onChange={(event) =>
                    patchFigureStudio({
                      traceStyle: {
                        ...figureStudio.traceStyle,
                        lineWidth: Number(event.target.value) || figureStudio.traceStyle.lineWidth,
                      },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Bar opacity</Label>
                <Input
                  type="number"
                  min={0.05}
                  max={1}
                  step="0.05"
                  value={figureStudio.traceStyle.barOpacity}
                  onChange={(event) =>
                    patchFigureStudio({
                      traceStyle: {
                        ...figureStudio.traceStyle,
                        barOpacity: Number(event.target.value) || figureStudio.traceStyle.barOpacity,
                      },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Tick font size</Label>
                <Input
                  type="number"
                  min={8}
                  value={figureStudio.axisY.tickFontSize}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisX: { ...figureStudio.axisX, tickFontSize: Number(event.target.value) || figureStudio.axisX.tickFontSize },
                      axisY: { ...figureStudio.axisY, tickFontSize: Number(event.target.value) || figureStudio.axisY.tickFontSize },
                    })
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-[10px] text-muted-foreground">Label font size</Label>
                <Input
                  type="number"
                  min={8}
                  value={figureStudio.axisY.labelFontSize}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisX: { ...figureStudio.axisX, labelFontSize: Number(event.target.value) || figureStudio.axisX.labelFontSize },
                      axisY: { ...figureStudio.axisY, labelFontSize: Number(event.target.value) || figureStudio.axisY.labelFontSize },
                    })
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureStudio.axisY.autoScale}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisY: { ...figureStudio.axisY, autoScale: event.target.checked },
                    })
                  }
                  className="h-3.5 w-3.5 rounded"
                />
                Auto-scale Y axis
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureStudio.axisY.zeroLock}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisY: { ...figureStudio.axisY, zeroLock: event.target.checked },
                    })
                  }
                  className="h-3.5 w-3.5 rounded"
                />
                Lock Y axis to zero
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureStudio.axisY.showGrid}
                  onChange={(event) =>
                    patchFigureStudio({
                      axisY: { ...figureStudio.axisY, showGrid: event.target.checked },
                      axisX: { ...figureStudio.axisX, showGrid: event.target.checked },
                    })
                  }
                  className="h-3.5 w-3.5 rounded"
                />
                Show gridlines
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureStudio.legend.visible}
                  onChange={(event) =>
                    patchFigureStudio({
                      legend: { ...figureStudio.legend, visible: event.target.checked },
                    })
                  }
                  className="h-3.5 w-3.5 rounded"
                />
                Show legend
              </label>
            </div>
          </div>

          {/* ─── Significance Annotations ─────────────── */}
          {supportsSignificance && (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-medium">Significance</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowManualSigControls((v) => !v)}
                  >
                    {showManualSigControls ? "Hide manual" : "Manual stars"}
                  </Button>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRunSigStars}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setAutoRunSigStars(enabled);
                        if (enabled) applyAutoSigAnnotations(true);
                      }}
                      className="rounded h-3.5 w-3.5"
                    />
                    Auto stars
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => applyAutoSigAnnotations(true)}
                  >
                    Run stats
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground block mb-0.5">Method</Label>
                    <Select value={autoStatsMethod} onValueChange={(v) => setAutoStatsMethod(v as "welch_t" | "mann_whitney")}>
                      <SelectTrigger className="h-8 text-xs w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="welch_t">Welch t-test</SelectItem>
                        <SelectItem value="mann_whitney">Mann-Whitney U</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground block mb-0.5">Correction</Label>
                    <Select value={autoPAdjust} onValueChange={(v) => setAutoPAdjust(v as "none" | "bonferroni")}>
                      <SelectTrigger className="h-8 text-xs w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="bonferroni">Bonferroni</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-1.5 pb-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeNsAnnotations}
                      onChange={(e) => setIncludeNsAnnotations(e.target.checked)}
                      className="rounded h-3.5 w-3.5"
                    />
                    Include ns
                  </label>
                </div>
                {autoStatsSummary && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Last run: {autoStatsSummary.tested} tested, {autoStatsSummary.added} added ({autoStatsSummary.method}, {autoStatsSummary.correction}).
                  </p>
                )}
                {sigAnnotations.length === 0 && resultDrivenSigAnnotations.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Using {resultDrivenSigAnnotations.length} saved comparison{resultDrivenSigAnnotations.length === 1 ? "" : "s"} from the current statistical result.
                  </p>
                )}
              </div>

              {showManualSigControls && (
                <div className="flex flex-wrap items-end gap-2 pt-1">
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
                    <Label className="text-[10px] text-muted-foreground block mb-0.5">Star</Label>
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
              )}

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
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b bg-slate-50/70 py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Preview</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={handleExportFigureMetadata}>
                  <Download className="h-3 w-3" /> Packet
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => handleExport("pdf")}>
                  <Download className="h-3 w-3" /> PDF
                </Button>
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
              {hasMounted ? (
                <AnalysisPlotErrorBoundary>
                  <Plot
                    data={plotData.data}
                    layout={{
                      ...plotData.layout,
                      title: {
                        text: figureStudio.title || title || ((plotData.layout as { title?: { text?: string } }).title?.text ?? ""),
                        font: { size: figureStudio.axisY.labelFontSize + 2, color: "#0f172a" },
                      },
                      autosize: true,
                      width: figureStudio.width,
                      height: figureStudio.height,
                      paper_bgcolor: figureStudio.backgroundColor,
                      plot_bgcolor: "rgba(248,250,252,0.85)",
                      font: { color: "#0f172a" },
                      legend: getLegendLayout(figureStudio.legend),
                      showlegend:
                        figureStudio.legend.visible &&
                        ((plotData.layout as Record<string, unknown>).showlegend as boolean | undefined) !== false,
                      margin: {
                        l: figureStudio.marginLeft,
                        r: figureStudio.marginRight,
                        t:
                          Math.max(
                            figureStudio.marginTop,
                            effectiveSigAnnotations.length > 0 ? 80 + effectiveSigAnnotations.length * 20 : figureStudio.marginTop,
                          ),
                        b: figureStudio.marginBottom,
                      },
                      xaxis: {
                        ...((plotData.layout as Record<string, unknown>).xaxis as Partial<Plotly.Layout["xaxis"]> || {}),
                        ...getAxisLayout(figureStudio.axisX, xAxisTitle, "xaxis"),
                      },
                      yaxis: {
                        ...((plotData.layout as Record<string, unknown>).yaxis as Partial<Plotly.Layout["yaxis"]> || {}),
                        ...getAxisLayout(figureStudio.axisY, yAxisTitle, "yaxis"),
                        ...(sigShapesAndAnnotations.yRangeMax !== null
                          ? { range: [sigShapesAndAnnotations.yRangeMin ?? 0, sigShapesAndAnnotations.yRangeMax] as [number, number] }
                          : {}),
                      },
                      shapes: [
                        ...((plotData.layout as Record<string, unknown>).shapes as Partial<Plotly.Shape>[] || []),
                        ...sigShapesAndAnnotations.shapes,
                      ],
                      annotations: [
                        ...((plotData.layout as Record<string, unknown>).annotations as Partial<Plotly.Annotations>[] || []),
                        ...sigShapesAndAnnotations.annotations,
                        ...annotationDraftsToPlotly(figureStudio.annotations),
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
                    style={{
                      width: "100%",
                      height: figureStudio.height,
                      border: `${figureStudio.borderWidth}px solid ${figureStudio.borderColor}`,
                      borderRadius: 12,
                      background: figureStudio.backgroundColor,
                    }}
                  />
                </AnalysisPlotErrorBoundary>
              ) : (
                <div
                  className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-500"
                  style={{ height: figureStudio.height }}
                >
                  Preparing figure renderer...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!plotData && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
          <Info className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-slate-700">No figure could be generated from the current analysis state.</p>
          <p className="mt-1 text-xs text-slate-500">
            {result
              ? "Try rerunning the analysis, switching to the recommended chart family, or choosing a measure with data."
              : "Run an analysis first, then this tab will render a revision-linked figure and packet."}
          </p>
        </div>
      )}

      {reportPayload && (
        <Card className="border-slate-200/80 bg-white shadow-sm">
          <CardHeader className="border-b bg-slate-50/70 py-3 px-4">
            <CardTitle className="text-sm font-medium">Figure Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm text-slate-800">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Figure Title</p>
                <p className="mt-1">{reportPayload.figureMetadata.title}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grouping</p>
                <p className="mt-1">{reportPayload.figureMetadata.grouping}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plotted Measure</p>
                <p className="mt-1">
                  {reportPayload.figureMetadata.primaryMeasure}
                  {reportPayload.figureMetadata.secondaryMeasure ? ` vs ${reportPayload.figureMetadata.secondaryMeasure}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Significance Source</p>
                <p className="mt-1">{reportPayload.figureMetadata.significanceSource}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Chart</p>
                <p className="mt-1">{reportPayload.figureMetadata.recommendedChartType || reportPayload.figureMetadata.chartType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result Family</p>
                <p className="mt-1">{reportPayload.figureMetadata.resultFamily || "general"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Figure Size</p>
                <p className="mt-1">
                  {reportPayload.figureMetadata.figureWidth ?? "Auto"} × {reportPayload.figureMetadata.figureHeight ?? "Auto"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Table Kind</p>
                <p className="mt-1">{reportPayload.figureMetadata.tableKind || "grouped"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Linked Statistical Summary</p>
              <p className="mt-1">{reportPayload.reportSummary}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated Caption</p>
              <p className="mt-1">{reportPayload.reportCaption}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {effectiveChartType === "timepoint_line" && !plotData && (
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
