"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import type { Animal, Cohort, ColonyResult, ExperimentRun, RunAssignment, RunTimepoint, RunTimepointExperiment, Dataset, Analysis } from "@/types";

// Dynamically import Plotly
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

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

  const postHoc = pairwiseGroupComparisons(
    dataset.timepointPairs.map((timepoint) => ({
      label: timepoint.label,
      values: matrix.map((subject) => subject[timepoint.index]),
    })),
    { paired: true, pAdjustMethod },
  );

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

  const postHoc = pairwiseGroupComparisons(
    timeLevels.map((timeLabel) => ({
      label: timeLabel,
      values: validRows
        .filter((row) => row.timeLabel === timeLabel)
        .map((row) => row.y),
    })),
    { pAdjustMethod },
  );

  const assumptionChecks = [
    ...timeLevels.map((timeLabel) =>
      normalityScreen(
        timeLabel,
        validRows.filter((row) => row.timeLabel === timeLabel).map((row) => row.y),
      ),
    ),
  ];

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

type AnalysisFactor = "group" | "sex" | "genotype" | "cohort" | "timepoint";

interface AnalysisAnimalRow {
  animal_id: string;
  identifier: string;
  cohort: string;
  sex: string;
  genotype: string;
  group: string;
  rowCount: number;
  included: boolean;
}

interface ColonyAnalysisStatsDraft {
  testType: string;
  measureKey: string;
  measureKey2: string;
  groupingFactor: AnalysisFactor;
  factorA: AnalysisFactor;
  factorB: AnalysisFactor;
  group1: string;
  group2: string;
  postHocMethod: "none" | "tukey";
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr";
  modelKind: "guided" | "repeated_measures" | "mixed_effects";
  subjectFactor: "animal_id";
  withinSubjectFactor: "timepoint";
  betweenSubjectFactor: AnalysisFactor | "__none__";
}

interface ColonyAnalysisVisualizationDraft {
  chartType: string;
  measureKey: string;
  measureKey2: string;
  groupBy: "group" | "sex" | "genotype" | "cohort";
  title: string;
  showPoints: boolean;
  sigAnnotations: Array<{ group1: string; group2: string; label: string }>;
  autoRunSigStars: boolean;
  autoStatsMethod: "welch_t" | "mann_whitney";
  autoPAdjust: "none" | "bonferroni";
  includeNsAnnotations: boolean;
}

interface SavedColonyAnalysisRoot {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedColonyAnalysisRevision {
  id: string;
  analysisId: string;
  name: string;
  revisionNumber: number;
  createdAt: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  summaryText: string | null;
}

interface AnalysisSuggestion {
  testType: ColonyAnalysisStatsDraft["testType"];
  label: string;
  reason: string;
}

interface AssumptionCheck {
  name: string;
  status: "pass" | "warn" | "info";
  message: string;
  statistic?: number;
  p?: number;
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
}

function defaultStatsDraft(): ColonyAnalysisStatsDraft {
  return {
    testType: "t_test",
    measureKey: "",
    measureKey2: "",
    groupingFactor: "group",
    factorA: "genotype",
    factorB: "sex",
    group1: "",
    group2: "",
    postHocMethod: "none",
    pAdjustMethod: "holm",
    modelKind: "guided",
    subjectFactor: "animal_id",
    withinSubjectFactor: "timepoint",
    betweenSubjectFactor: "__none__",
  };
}

function defaultVisualizationDraft(): ColonyAnalysisVisualizationDraft {
  return {
    chartType: "bar_sem",
    measureKey: "",
    measureKey2: "",
    groupBy: "group",
    title: "",
    showPoints: true,
    sigAnnotations: [],
    autoRunSigStars: false,
    autoStatsMethod: "welch_t",
    autoPAdjust: "none",
    includeNsAnnotations: false,
  };
}

function summarizeAnalysisResult(result: Record<string, unknown> | null, included: number, excluded: number) {
  if (!result) return null;
  const pieces = [
    `Included animals: ${included}`,
    `Excluded animals: ${excluded}`,
    `Test: ${String(result.test || "Analysis")}`,
    `Measure: ${String(result.measure || "—")}`,
  ];
  if (result.groups_compared) pieces.push(`Comparison: ${String(result.groups_compared)}`);
  if (typeof result.p === "number") {
    pieces.push(`p = ${result.p < 0.001 ? "< 0.001" : Number(result.p).toFixed(4)}`);
  }
  if (typeof result.F === "number") pieces.push(`F = ${formatNum(Number(result.F), 4)}`);
  if (typeof result.t === "number") pieces.push(`t = ${formatNum(Number(result.t), 4)}`);
  if (typeof result.H === "number") pieces.push(`H = ${formatNum(Number(result.H), 4)}`);
  if (typeof result.r === "number") pieces.push(`r = ${formatNum(Number(result.r), 4)}`);
  if (typeof result.rho === "number") pieces.push(`rho = ${formatNum(Number(result.rho), 4)}`);
  return pieces.join(" | ");
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
}: ColonyAnalysisPanelProps) {
  // ── Filter state ──
  const [activeRunId, setActiveRunId] = useState<string>("__all__");
  const [selectedExperiment, setSelectedExperiment] = useState<string>(
    () => colonyResults[0]?.experiment_type || "__all__"
  );
  const [selectedTimepoint, setSelectedTimepoint] = useState<string>("__all__");
  const [selectedCohort, setSelectedCohort] = useState<string>("__all__");
  const [excludedAnimalIds, setExcludedAnimalIds] = useState<Set<string>>(new Set());
  const [exclusionReasons, setExclusionReasons] = useState<Record<string, string>>({});
  const [animalSearch, setAnimalSearch] = useState("");
  const [analysisName, setAnalysisName] = useState("Untitled Colony Analysis");
  const [analysisDescription, setAnalysisDescription] = useState("");
  const [selectedSavedAnalysisId, setSelectedSavedAnalysisId] = useState<string>("__new__");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>("__latest__");
  const [statsDraft, setStatsDraft] = useState<ColonyAnalysisStatsDraft>(defaultStatsDraft());
  const [visualizationDraft, setVisualizationDraft] = useState<ColonyAnalysisVisualizationDraft>(defaultVisualizationDraft());
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

  // Available experiment types from results
  const availableExperiments = useMemo(() => {
    if (selectedRun) {
      return selectedRunExperiments.map((experiment) => experiment.experiment_key);
    }
    const exps = new Set(filteredResults.map((r) => r.experiment_type));
    return Array.from(exps).sort();
  }, [filteredResults, selectedRun, selectedRunExperiments]);

  const effectiveSelectedExperiment =
    selectedExperiment === "__all__" && availableExperiments.length > 0
      ? availableExperiments[0]
      : selectedExperiment;

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
      scopedFlatData: rows,
      scopedMeasureKeys: Array.from(keySet).sort(),
      scopedMeasureLabels: labels,
    };
  }, [animals, cohorts, effectiveSelectedExperiment, effectiveSelectedTimepoint, filteredResults, selectedCohort, selectedRun, selectedRunAssignments, selectedRunExperiments]);

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
    () => scopedFlatData.filter((row) => !excludedAnimalIds.has(row.animal_id)),
    [excludedAnimalIds, scopedFlatData],
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

  const includedAnimalCount = analysisAnimals.filter((animal) => animal.included).length;
  const excludedAnimalCount = analysisAnimals.length - includedAnimalCount;
  const excludedFlatData = useMemo(
    () => scopedFlatData.filter((row) => excludedAnimalIds.has(row.animal_id)),
    [excludedAnimalIds, scopedFlatData],
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
  const workflowSteps = useMemo(
    () => [
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
    ],
    [
      analysisAnimals.length,
      effectiveSelectedExperiment,
      effectiveSelectedTimepoint,
      excludedAnimalCount,
      flatData.length,
      resolvedRunId,
      savedResult,
      selectedCohort,
      selectedSavedAnalysisId,
      statsDraft.measureKey,
      suggestedTests.length,
    ],
  );

  useEffect(() => {
    if (savedAnalysisRoots.length === 0) return;
    if (selectedSavedAnalysisId === "__new__") return;
    if (savedAnalysisRoots.some((root) => root.id === selectedSavedAnalysisId)) return;
    setSelectedSavedAnalysisId(savedAnalysisRoots[0]?.id || "__new__");
  }, [savedAnalysisRoots, selectedSavedAnalysisId]);

  useEffect(() => {
    if (!selectedSavedRevision) return;
    const scope = (selectedSavedRevision.config.scope || {}) as Record<string, unknown>;
    const exclusions = Array.isArray(selectedSavedRevision.config.excludedAnimals)
      ? (selectedSavedRevision.config.excludedAnimals as Array<Record<string, unknown>>)
      : [];
    const stats = (selectedSavedRevision.config.statistics || {}) as Partial<ColonyAnalysisStatsDraft>;
    const visualization = (selectedSavedRevision.config.visualization || {}) as Partial<ColonyAnalysisVisualizationDraft>;

    setAnalysisName(selectedSavedRevision.name || "Untitled Colony Analysis");
    setAnalysisDescription(String(selectedSavedRevision.config.description || ""));
    setActiveRunId(typeof scope.runId === "string" ? scope.runId : "__all__");
    setSelectedExperiment(typeof scope.experiment === "string" ? scope.experiment : "__all__");
    setSelectedTimepoint(typeof scope.timepoint === "string" ? scope.timepoint : "__all__");
    setSelectedCohort(typeof scope.cohort === "string" ? scope.cohort : "__all__");
    setExcludedAnimalIds(new Set(exclusions.map((entry) => String(entry.animalId || "")).filter(Boolean)));
    setExclusionReasons(
      exclusions.reduce<Record<string, string>>((acc, entry) => {
        const animalId = String(entry.animalId || "").trim();
        if (!animalId) return acc;
        acc[animalId] = String(entry.reason || "");
        return acc;
      }, {}),
    );
    setStatsDraft({
      ...defaultStatsDraft(),
      ...stats,
    });
    setVisualizationDraft({
      ...defaultVisualizationDraft(),
      ...visualization,
      sigAnnotations: Array.isArray(visualization.sigAnnotations)
        ? (visualization.sigAnnotations as Array<{ group1: string; group2: string; label: string }>)
        : [],
    });
    setSavedResult(selectedSavedRevision.results || null);
    setLoadedRevisionKey(selectedSavedRevision.id);
  }, [selectedSavedRevision]);

  useEffect(() => {
    if (selectedSavedAnalysisId !== "__new__") return;
    setSelectedRevisionId("__latest__");
  }, [selectedSavedAnalysisId]);

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

  const handleExportSummary = useCallback(() => {
    const summary = summarizeAnalysisResult(savedResult, includedAnimalCount, excludedAnimalCount);
    const payload = {
      name: analysisName,
      description: analysisDescription,
      scope: {
        runId: resolvedRunId,
        experiment: effectiveSelectedExperiment,
        timepoint: effectiveSelectedTimepoint,
        cohort: selectedCohort,
      },
      summary,
      results: savedResult,
      includedAnimals: includedAnimalCount,
      excludedAnimals: excludedAnimalCount,
      exclusions: Object.entries(exclusionReasons)
        .filter(([animalId]) => excludedAnimalIds.has(animalId))
        .map(([animalId, reason]) => ({ animalId, reason })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${analysisName.replace(/\s+/g, "-").toLowerCase() || "colony-analysis"}-summary.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Analysis summary exported.");
  }, [analysisDescription, analysisName, effectiveSelectedExperiment, effectiveSelectedTimepoint, exclusionReasons, excludedAnimalCount, excludedAnimalIds, includedAnimalCount, resolvedRunId, savedResult, selectedCohort]);

  const handleSaveAnalysis = useCallback(
    async (mode: "new" | "revision") => {
      if (!savedResult) {
        toast.error("Run an analysis first so there is something meaningful to save.");
        return;
      }
      const payload = {
        analysisId: mode === "revision" && selectedSavedAnalysisId !== "__new__" ? selectedSavedAnalysisId : null,
        name: analysisName.trim() || "Untitled Colony Analysis",
        description: analysisDescription.trim() || null,
        config: {
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
          statistics: statsDraft,
          visualization: visualizationDraft,
          includedAnimalCount,
          excludedAnimalCount,
        },
        results: savedResult,
        summaryText: summarizeAnalysisResult(savedResult, includedAnimalCount, excludedAnimalCount),
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
    },
    [
      analysisDescription,
      analysisName,
      effectiveSelectedExperiment,
      effectiveSelectedTimepoint,
      excludedAnimalCount,
      excludedAnimalIds,
      exclusionReasons,
      includedAnimalCount,
      resolvedRunId,
      saveAnalysisRevision,
      savedResult,
      selectedCohort,
      selectedSavedAnalysisId,
      statsDraft,
      visualizationDraft,
    ],
  );

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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleSaveAnalysis("new")}>
                <Save className="h-3.5 w-3.5" /> Save as New
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={selectedSavedAnalysisId === "__new__"}
                onClick={() => handleSaveAnalysis("revision")}
              >
                <Save className="h-3.5 w-3.5" /> Save Revision
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
              <Label className="text-xs mb-1 block">Analysis Name</Label>
              <Input value={analysisName} onChange={(event) => setAnalysisName(event.target.value)} placeholder="e.g. Run 1 30D Y-Maze" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Description</Label>
              <Input value={analysisDescription} onChange={(event) => setAnalysisDescription(event.target.value)} placeholder="Optional methods / scope note" />
            </div>
          </div>
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
              <Select value={selectedExperiment} onValueChange={setSelectedExperiment}>
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
                onClick={() => setExcludedAnimalIds(new Set())}
                disabled={excludedAnimalCount === 0}
              >
                Include all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setExcludedAnimalIds((current) => {
                    const next = new Set(current);
                    visibleAnalysisAnimals.forEach((animal) => next.add(animal.animal_id));
                    return next;
                  })
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
                  setExcludedAnimalIds((current) => {
                    const next = new Set(current);
                    scopedFlatData
                      .filter((row) => row[statsDraft.measureKey] == null || row[statsDraft.measureKey] === "")
                      .forEach((row) => next.add(row.animal_id));
                    return next;
                  })
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
                    setExcludedAnimalIds((current) => {
                      const next = new Set(current);
                      analysisAnimals.filter((animal) => animal.cohort === cohort).forEach((animal) => next.add(animal.animal_id));
                      return next;
                    })
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
                    setExcludedAnimalIds((current) => {
                      const next = new Set(current);
                      analysisAnimals.filter((animal) => animal.sex === sex).forEach((animal) => next.add(animal.animal_id));
                      return next;
                    })
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
                    setExcludedAnimalIds((current) => {
                      const next = new Set(current);
                      analysisAnimals.filter((animal) => animal.genotype === genotype).forEach((animal) => next.add(animal.animal_id));
                      return next;
                    })
                  }
                >
                  Exclude {genotype}
                </Button>
              ))}
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
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Reason</th>
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
                              setExcludedAnimalIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.delete(animal.animal_id);
                                else next.add(animal.animal_id);
                                return next;
                              })
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
                      <td className="px-2 py-2 text-right tabular-nums">{animal.rowCount}</td>
                    </tr>
                  ))}
                  {visibleAnalysisAnimals.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
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
              groups={availableGroups}
              includedCount={includedAnimalCount}
              excludedCount={excludedAnimalCount}
              initialConfig={statsDraft}
              initialResult={savedResult}
              onConfigChange={setStatsDraft}
              onResultChange={setSavedResult}
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
              onConfigChange={setVisualizationDraft}
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
  groups,
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
  groups: string[];
  includedCount: number;
  excludedCount: number;
  initialConfig?: ColonyAnalysisStatsDraft;
  initialResult?: Record<string, unknown> | null;
  onConfigChange?: (next: ColonyAnalysisStatsDraft) => void;
  onResultChange?: (next: Record<string, unknown> | null) => void;
}) {
  const [testType, setTestType] = useState(initialConfig?.testType || "t_test");
  const [measureKey, setMeasureKey] = useState(initialConfig?.measureKey || numericKeys[0] || "");
  const [measureKey2, setMeasureKey2] = useState(initialConfig?.measureKey2 || numericKeys[1] || numericKeys[0] || "");
  const [groupingFactor, setGroupingFactor] = useState<AnalysisFactor>(initialConfig?.groupingFactor || "group");
  const [factorA, setFactorA] = useState<AnalysisFactor>(initialConfig?.factorA || "genotype");
  const [factorB, setFactorB] = useState<AnalysisFactor>(initialConfig?.factorB || "sex");
  const [group1, setGroup1] = useState(initialConfig?.group1 || "");
  const [group2, setGroup2] = useState(initialConfig?.group2 || "");
  const [postHocMethod, setPostHocMethod] = useState<"none" | "tukey">(initialConfig?.postHocMethod || "none");
  const [pAdjustMethod, setPAdjustMethod] = useState<"none" | "bonferroni" | "holm" | "fdr">(initialConfig?.pAdjustMethod || "holm");
  const [modelKind, setModelKind] = useState<"guided" | "repeated_measures" | "mixed_effects">(initialConfig?.modelKind || "guided");
  const [subjectFactor, setSubjectFactor] = useState<"animal_id">(initialConfig?.subjectFactor || "animal_id");
  const [withinSubjectFactor, setWithinSubjectFactor] = useState<"timepoint">(initialConfig?.withinSubjectFactor || "timepoint");
  const [betweenSubjectFactor, setBetweenSubjectFactor] = useState<AnalysisFactor | "__none__">(initialConfig?.betweenSubjectFactor || "__none__");
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(initialResult || null);
  const [copied, setCopied] = useState(false);

  const TEST_OPTIONS = [
    { value: "descriptive", label: "Descriptive Statistics", desc: "Mean, SD, SEM, median for each selected factor level" },
    { value: "t_test", label: "Welch t-test", desc: "Compare two selected groups with unequal-variance t-test" },
    { value: "mann_whitney", label: "Mann-Whitney U", desc: "Non-parametric comparison between two selected groups" },
    { value: "anova", label: "1-way ANOVA", desc: "Compare all levels of one factor at once" },
    { value: "kruskal_wallis", label: "Kruskal-Wallis", desc: "Non-parametric alternative to 1-way ANOVA" },
    { value: "two_way_anova", label: "2-way ANOVA", desc: "Test two factors plus their interaction" },
    { value: "repeated_measures_anova", label: "Repeated-measures ANOVA", desc: "Within-animal timepoint model for complete longitudinal data" },
    { value: "mixed_effects", label: "Mixed-effects", desc: "Incomplete longitudinal data using per-animal intercept modeling" },
    { value: "multi_compare", label: "All Pairwise Comparisons", desc: "Run pairwise Welch t-tests across factor levels" },
    { value: "pearson", label: "Pearson Correlation", desc: "Linear association between two measures" },
    { value: "spearman", label: "Spearman Correlation", desc: "Rank-based association between two measures" },
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

  useEffect(() => {
    if (!numericKeys.includes(measureKey)) setMeasureKey(numericKeys[0] || "");
    if (!numericKeys.includes(measureKey2)) setMeasureKey2(numericKeys[1] || numericKeys[0] || "");
  }, [measureKey, measureKey2, numericKeys]);

  useEffect(() => {
    if (testType === "repeated_measures_anova") setModelKind("repeated_measures");
    else if (testType === "mixed_effects") setModelKind("mixed_effects");
    else setModelKind("guided");
  }, [testType]);

  useEffect(() => {
    onConfigChange?.({
      testType,
      measureKey,
      measureKey2,
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
    });
  }, [betweenSubjectFactor, factorA, factorB, group1, group2, groupingFactor, measureKey, measureKey2, modelKind, onConfigChange, pAdjustMethod, postHocMethod, subjectFactor, testType, withinSubjectFactor]);

  useEffect(() => {
    onResultChange?.(currentResult);
  }, [currentResult, onResultChange]);

  useEffect(() => {
    if (!factorLevels.includes(group1)) setGroup1(factorLevels[0] || "");
    if (!factorLevels.includes(group2) || group2 === group1) {
      setGroup2(factorLevels.find((level) => level !== (factorLevels[0] || "")) || factorLevels[0] || "");
    }
  }, [factorLevels, group1, group2]);

  const runTest = useCallback(() => {
    const getValues = (group: string, key = measureKey) =>
      flatData
        .filter((r) => getFactorValue(r, groupingFactor) === group)
        .map((r) => Number(r[key]))
        .filter((v) => !isNaN(v));

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
    }
  }, [betweenSubjectFactor, excludedCount, factorA, factorB, factorLevels, flatData, group1, group2, groupingFactor, includedCount, measureKey, measureKey2, measureLabels, pAdjustMethod, postHocMethod, subjectFactor, testType, withinSubjectFactor]);

  const handleCopyResults = useCallback(() => {
    if (!currentResult) return;
    navigator.clipboard.writeText(JSON.stringify(currentResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentResult]);

  const needsGroups = testType === "t_test" || testType === "mann_whitney";
  const needsFactor = ["descriptive", "t_test", "mann_whitney", "anova", "kruskal_wallis", "multi_compare"].includes(testType);
  const needsTwoFactors = testType === "two_way_anova";
  const needsSecondMeasure = testType === "pearson" || testType === "spearman";
  const needsLongitudinalModel = testType === "repeated_measures_anova" || testType === "mixed_effects";
  const needsPAdjust = ["multi_compare", "repeated_measures_anova", "mixed_effects", "two_way_anova"].includes(testType) || (testType === "anova" && postHocMethod !== "none");

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <Label className="text-xs mb-1 block">Statistical Test</Label>
              <Select value={testType} onValueChange={(v) => { setTestType(v); setCurrentResult(null); }}>
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
          </div>

          {needsLongitudinalModel && (
            <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
              {testType === "repeated_measures_anova"
                ? "Repeated-measures ANOVA only runs on animals with complete values across the selected timepoints."
                : "Mixed-effects uses per-animal intercept modeling so incomplete longitudinal data can still be analyzed."}
            </div>
          )}

          <Button onClick={runTest} disabled={!measureKey} className="w-full gap-1.5 bg-slate-900 text-white hover:bg-slate-800 sm:w-auto">
            <FlaskConical className="h-4 w-4" /> Run Analysis
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
            .filter(([k]) => !["test", "measure", "grouped_by", "group_stats", "group1_stats", "group2_stats", "comparisons", "anova_table", "cell_counts", "warning", "significant_005", "significant_001", "groups_compared", "levels_a", "levels_b", "factor_a", "factor_b", "assumption_checks", "included_animals", "excluded_animals", "posthoc_label", "subject_factor", "within_subject_factor", "between_subject_factor", "model_kind"].includes(k) && typeof result[k] !== "object")
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
            (k) => typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k]) && k !== "test" && k !== "measure"
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

// ─── Visualization Panel ────────────────────────────────────────────────────

function VisualizationPanel({
  flatData,
  numericKeys,
  measureLabels,
  groups,
  initialConfig,
  onConfigChange,
}: {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels: Record<string, string>;
  groups: string[];
  initialConfig?: ColonyAnalysisVisualizationDraft;
  onConfigChange?: (next: ColonyAnalysisVisualizationDraft) => void;
}) {
  const [chartType, setChartType] = useState(initialConfig?.chartType || "bar_sem");
  const [measureKey, setMeasureKey] = useState(initialConfig?.measureKey || numericKeys[0] || "");
  const [measureKey2, setMeasureKey2] = useState(initialConfig?.measureKey2 || numericKeys[1] || "");
  const [groupBy, setGroupBy] = useState<"group" | "sex" | "genotype" | "cohort">(initialConfig?.groupBy || "group");
  const [title, setTitle] = useState(initialConfig?.title || "");
  const [showPoints, setShowPoints] = useState(initialConfig?.showPoints ?? true);
  const plotRef = useRef<HTMLDivElement>(null);

  // Significance annotations
  type SigAnnotation = { group1: string; group2: string; label: string };
  const SIG_LABELS = ["ns", "*", "**", "***", "****"];
  const [sigAnnotations, setSigAnnotations] = useState<SigAnnotation[]>(initialConfig?.sigAnnotations || []);
  const [pendingGroup1, setPendingGroup1] = useState("");
  const [pendingGroup2, setPendingGroup2] = useState("");
  const [pendingLabel, setPendingLabel] = useState("*");
  const [autoRunSigStars, setAutoRunSigStars] = useState(initialConfig?.autoRunSigStars ?? false);
  const [autoStatsMethod, setAutoStatsMethod] = useState<"welch_t" | "mann_whitney">(initialConfig?.autoStatsMethod || "welch_t");
  const [autoPAdjust, setAutoPAdjust] = useState<"none" | "bonferroni">(initialConfig?.autoPAdjust || "none");
  const [includeNsAnnotations, setIncludeNsAnnotations] = useState(initialConfig?.includeNsAnnotations ?? false);
  const [showManualSigControls, setShowManualSigControls] = useState(false);
  const [autoStatsSummary, setAutoStatsSummary] = useState<{
    tested: number;
    added: number;
    method: string;
    correction: string;
  } | null>(null);

  const CHART_OPTIONS = [
    { value: "bar_sem", label: "Bar + SEM" },
    { value: "bar_sd", label: "Bar + SD" },
    { value: "box", label: "Box Plot" },
    { value: "violin", label: "Violin Plot" },
    { value: "scatter", label: "Scatter (2 measures)" },
    { value: "dot_plot", label: "Dot Plot" },
    { value: "timepoint_line", label: "Timepoints (line)" },
  ];

  useEffect(() => {
    if (!numericKeys.includes(measureKey)) setMeasureKey(numericKeys[0] || "");
    if (measureKey2 && !numericKeys.includes(measureKey2)) {
      setMeasureKey2(numericKeys.find((key) => key !== measureKey) || numericKeys[1] || "");
    }
  }, [measureKey, measureKey2, numericKeys]);

  useEffect(() => {
    onConfigChange?.({
      chartType,
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
  }, [
    autoPAdjust,
    autoRunSigStars,
    autoStatsMethod,
    chartType,
    groupBy,
    includeNsAnnotations,
    measureKey,
    measureKey2,
    onConfigChange,
    showPoints,
    sigAnnotations,
    title,
  ]);

  const autoGenerateSigAnnotations = useCallback((): {
    annotations: SigAnnotation[];
    tested: number;
  } => {
    if (!measureKey) return { annotations: [], tested: 0 };
    if (chartType === "scatter" || chartType === "timepoint_line") return { annotations: [], tested: 0 };

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
  }, [chartType, groupBy, groups, flatData, measureKey, autoStatsMethod, autoPAdjust, includeNsAnnotations]);

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
    if (!plotData || sigAnnotations.length === 0) {
      return { shapes: [], annotations: [], yRangeMin: null as number | null, yRangeMax: null as number | null };
    }
    if (chartType === "scatter" || chartType === "timepoint_line") {
      return { shapes: [], annotations: [], yRangeMin: null as number | null, yRangeMax: null as number | null };
    }
    const drawableAnnotations = sigAnnotations.filter((ann) => ann.label !== "ns");
    if (drawableAnnotations.length === 0) {
      return { shapes: [], annotations: [], yRangeMin: null as number | null, yRangeMax: null as number | null };
    }

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
      <Card className="border-slate-200/80 bg-white shadow-sm">
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

          {/* ─── Significance Annotations ─────────────── */}
          {chartType !== "scatter" && chartType !== "timepoint_line" && (
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
                  paper_bgcolor: "rgba(255,255,255,0.96)",
                  plot_bgcolor: "rgba(248,250,252,0.85)",
                  font: { color: "#0f172a" },
                  margin: { l: 70, r: 30, t: sigAnnotations.length > 0 ? 80 + sigAnnotations.length * 20 : 60, b: 60 },
                  yaxis: {
                    ...((plotData.layout as Record<string, unknown>).yaxis as Partial<Plotly.Layout["yaxis"]> || {}),
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
