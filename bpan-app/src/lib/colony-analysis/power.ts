import type {
  AnalysisFactor,
  FlatRow,
  PowerAssumptions,
  PowerBaseTest,
  PowerConfig,
  PowerContrastSelection,
  PowerEffectMetric,
  PowerEngine,
  PowerObjective,
  PowerPlannedSample,
  PowerTargetEffect,
} from "@/lib/colony-analysis/types";

export interface PowerDesignOption {
  value: PowerBaseTest;
  label: string;
  desc: string;
  defaultEngine: PowerEngine;
}

export interface PowerOption {
  value: string;
  label: string;
}

export interface PowerPlannerInput {
  flatData: FlatRow[];
  numericKeys: string[];
  measureLabels?: Record<string, string>;
  measureKey: string;
  measureKey2: string;
  timeToEventMeasureKey: string;
  eventMeasureKey: string;
  predictorMeasureKey: string;
  scoreMeasureKey: string;
  groupingFactor: AnalysisFactor;
  factorA: AnalysisFactor;
  factorB: AnalysisFactor;
  group1: string;
  group2: string;
  controlGroup: string;
  binaryGroupA: string;
  binaryGroupB: string;
  positiveClass: string;
  betweenSubjectFactor: AnalysisFactor | "__none__";
  covariateMeasureKey: string;
  regressionModelFamily: "linear" | "exponential" | "logistic";
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr";
  alpha: number;
  targetPower: number;
  powerConfig: PowerConfig;
  includedCount?: number;
  excludedCount?: number;
}

export interface PowerPlannerContext {
  baseTestOptions: PowerDesignOption[];
  targetOptions: Array<{ value: PowerTargetEffect; label: string }>;
  contrastOptions: PowerContrastSelection[];
  effectMetricLabel: string;
  sampleModeLabel: string;
  observedEffectValue: number | { group1: number; group2: number };
  observedAssumptions: PowerAssumptions;
  observedPlannedSample: PowerPlannedSample;
  assumptionNotes: string[];
  defaultEngine: PowerEngine;
  eligible: boolean;
  eligibilityNotes: string[];
}

type SampleContext = {
  groups: string[];
  factorALevels: string[];
  factorBLevels: string[];
  timepoints: number[];
  betweenLevels: string[];
};

const POWER_DESIGN_OPTIONS: PowerDesignOption[] = [
  { value: "t_test", label: "Welch t-test", desc: "Two-group independent-samples planning.", defaultEngine: "analytic" },
  { value: "paired_t_test", label: "Paired t-test", desc: "Matched / within-animal power planning.", defaultEngine: "analytic" },
  { value: "mann_whitney", label: "Mann-Whitney U", desc: "Rank-based two-group planning with deterministic Monte Carlo.", defaultEngine: "simulation" },
  { value: "wilcoxon_signed_rank", label: "Wilcoxon Signed-Rank", desc: "Rank-based paired planning with deterministic Monte Carlo.", defaultEngine: "simulation" },
  { value: "anova", label: "1-way ANOVA", desc: "Omnibus multi-group planning.", defaultEngine: "analytic" },
  { value: "kruskal_wallis", label: "Kruskal-Wallis", desc: "Non-parametric omnibus planning with deterministic Monte Carlo.", defaultEngine: "simulation" },
  { value: "two_way_anova", label: "2-way ANOVA", desc: "Main-effect and interaction planning for factorial designs.", defaultEngine: "simulation" },
  { value: "repeated_measures_anova", label: "Repeated-measures ANOVA", desc: "Within-subject timepoint planning.", defaultEngine: "simulation" },
  { value: "mixed_effects", label: "Mixed-effects", desc: "Incomplete longitudinal planning with deterministic Monte Carlo.", defaultEngine: "simulation" },
  { value: "multi_compare", label: "All Pairwise Comparisons", desc: "Chosen-contrast planning under multiplicity correction.", defaultEngine: "analytic" },
  { value: "dunnett", label: "Control vs All", desc: "Chosen control-contrast planning under multiplicity correction.", defaultEngine: "analytic" },
  { value: "ancova", label: "ANCOVA", desc: "Adjusted-factor planning with a numeric covariate.", defaultEngine: "simulation" },
  { value: "chi_square", label: "Chi-square", desc: "Balanced 2×2 association planning.", defaultEngine: "analytic" },
  { value: "fisher_exact", label: "Fisher Exact", desc: "Exact 2×2 planning with deterministic Monte Carlo.", defaultEngine: "simulation" },
  { value: "pearson", label: "Pearson Correlation", desc: "Linear association planning.", defaultEngine: "analytic" },
  { value: "spearman", label: "Spearman Correlation", desc: "Rank-correlation planning with deterministic Monte Carlo.", defaultEngine: "simulation" },
  { value: "log_rank", label: "Log-rank", desc: "Two-group survival planning.", defaultEngine: "simulation" },
  { value: "roc_curve", label: "ROC / AUC", desc: "Discrimination planning based on AUC.", defaultEngine: "simulation" },
  { value: "nonlinear_regression", label: "Nonlinear Regression", desc: "Predictor-outcome model-fit planning.", defaultEngine: "simulation" },
  { value: "dose_response", label: "Dose Response", desc: "Sigmoidal dose-response planning.", defaultEngine: "simulation" },
];

const POWER_OBJECTIVES: Array<{ value: PowerObjective; label: string }> = [
  { value: "sample_size", label: "Required Sample Size" },
  { value: "achieved_power", label: "Achieved Power" },
  { value: "mde", label: "Minimum Detectable Effect" },
];

const POWER_TARGET_LABELS: Record<PowerTargetEffect, string> = {
  primary: "Primary Effect",
  omnibus: "Omnibus Effect",
  main_effect_a: "Main Effect A",
  main_effect_b: "Main Effect B",
  interaction: "Interaction",
  time: "Time",
  between: "Between-subject Effect",
  adjusted_factor: "Adjusted Factor Effect",
  contrast: "Primary Contrast",
  association: "Association",
  survival: "Survival Difference",
  discrimination: "Discrimination",
  model_fit: "Model Fit",
};

const POWER_EFFECT_LABELS: Record<PowerEffectMetric, string> = {
  d: "Cohen's d",
  dz: "Cohen's dz",
  f: "Cohen's f",
  partial_eta_sq: "Partial eta squared",
  r: "Correlation (r)",
  event_rates: "Event Rates",
  hazard_ratio: "Hazard Ratio",
  auc: "AUC",
  r2: "R²",
};

const POWER_SAMPLE_MODE_LABELS: Record<PowerPlannedSample["mode"], string> = {
  per_group: "Per group",
  per_cell: "Per cell",
  subjects_total: "Total subjects",
  subjects_per_group: "Subjects per group",
  pairs_total: "Total matched pairs",
  total: "Total observations",
};

const POWER_TARGETS_BY_TEST: Record<PowerBaseTest, PowerTargetEffect[]> = {
  t_test: ["primary"],
  paired_t_test: ["primary"],
  mann_whitney: ["primary"],
  wilcoxon_signed_rank: ["primary"],
  anova: ["omnibus"],
  kruskal_wallis: ["omnibus"],
  two_way_anova: ["main_effect_a", "main_effect_b", "interaction"],
  repeated_measures_anova: ["time"],
  mixed_effects: ["time", "interaction"],
  multi_compare: ["contrast"],
  dunnett: ["contrast"],
  ancova: ["adjusted_factor"],
  chi_square: ["primary"],
  fisher_exact: ["primary"],
  pearson: ["association"],
  spearman: ["association"],
  log_rank: ["survival"],
  roc_curve: ["discrimination"],
  nonlinear_regression: ["model_fit"],
  dose_response: ["model_fit"],
};

const ANALYTIC_POWER_TESTS = new Set<PowerBaseTest>([
  "t_test",
  "paired_t_test",
  "anova",
  "pearson",
  "chi_square",
  "multi_compare",
  "dunnett",
]);

const DEFAULT_SIMULATION_ITERATIONS = 400;
const DEFAULT_SIMULATION_SEED = 42;

export function getPowerObjectiveOptions() {
  return POWER_OBJECTIVES;
}

export function getPowerDesignOptions() {
  return POWER_DESIGN_OPTIONS;
}

export function getPowerMetricLabel(metric: PowerEffectMetric) {
  return POWER_EFFECT_LABELS[metric] || metric;
}

export function getPowerSampleModeLabel(mode: PowerPlannedSample["mode"]) {
  return POWER_SAMPLE_MODE_LABELS[mode] || mode;
}

export function getPowerTargetOptions(baseTest: PowerBaseTest) {
  return (POWER_TARGETS_BY_TEST[baseTest] || ["primary"]).map((value) => ({
    value,
    label: POWER_TARGET_LABELS[value],
  }));
}

export function inferPowerBaseTest(testType: string): PowerBaseTest | null {
  switch (testType) {
    case "t_test":
    case "paired_t_test":
    case "mann_whitney":
    case "wilcoxon_signed_rank":
    case "anova":
    case "kruskal_wallis":
    case "two_way_anova":
    case "repeated_measures_anova":
    case "mixed_effects":
    case "multi_compare":
    case "dunnett":
    case "ancova":
    case "chi_square":
    case "fisher_exact":
    case "pearson":
    case "spearman":
    case "log_rank":
    case "roc_curve":
    case "nonlinear_regression":
    case "dose_response":
      return testType;
    case "kaplan_meier":
      return "log_rank";
    case "roc_auc":
    case "power_two_group":
      return "t_test";
    default:
      return null;
  }
}

export function chooseSuggestedPowerBaseTest(testTypes: string[]): PowerBaseTest {
  for (const testType of testTypes) {
    const inferred = inferPowerBaseTest(testType);
    if (inferred) return inferred;
  }
  return "t_test";
}

function round(n: number, d = 4): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  return Math.sqrt(arr.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (arr.length - 1));
}

function sem(arr: number[]): number {
  return arr.length < 2 ? 0 : stdDev(arr) / Math.sqrt(arr.length);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function approxNormCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
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
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const maxIter = 200;
  const eps = 1e-10;
  let result = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  result = d;
  for (let m = 1; m <= maxIter; m++) {
    let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + numerator / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    result *= d * c;

    numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + numerator / c;
    if (Math.abs(c) < eps) c = eps;
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
  const coefficients = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (let i = 0; i < coefficients.length; i++) series += coefficients[i] / ++y;
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let delta = sum;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      delta *= x / ap;
      sum += delta;
      if (Math.abs(delta) < Math.abs(sum) * 1e-10) break;
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
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

function approxChiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(df / 2, x / 2);
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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function pooledSd(a: number[], b: number[]) {
  if (a.length < 2 || b.length < 2) return 0;
  const v1 = stdDev(a) ** 2;
  const v2 = stdDev(b) ** 2;
  return Math.sqrt((((a.length - 1) * v1) + ((b.length - 1) * v2)) / Math.max(a.length + b.length - 2, 1));
}

function welchTTest(a: number[], b: number[]): { t: number; df: number; p: number; cohenD: number } {
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = a.reduce((sum, value) => sum + (value - m1) ** 2, 0) / Math.max(a.length - 1, 1);
  const v2 = b.reduce((sum, value) => sum + (value - m2) ** 2, 0) / Math.max(b.length - 1, 1);
  const se = Math.sqrt(v1 / Math.max(a.length, 1) + v2 / Math.max(b.length, 1));
  if (!Number.isFinite(se) || se === 0) return { t: 0, df: 0, p: 1, cohenD: 0 };
  const t = (m1 - m2) / se;
  const df = (v1 / a.length + v2 / b.length) ** 2 / Math.max(((v1 / a.length) ** 2) / Math.max(a.length - 1, 1) + ((v2 / b.length) ** 2) / Math.max(b.length - 1, 1), 1e-12);
  const d = pooledSd(a, b) === 0 ? 0 : (m1 - m2) / pooledSd(a, b);
  return { t: round(t), df: round(df), p: round(2 * (1 - approxNormCDF(Math.abs(t))), 6), cohenD: round(d) };
}

function pairedTTest(a: number[], b: number[]): { t: number; df: number; p: number; cohenDz: number } {
  if (a.length !== b.length || a.length < 2) return { t: 0, df: Math.max(a.length - 1, 0), p: 1, cohenDz: 0 };
  const diffs = a.map((value, index) => value - b[index]);
  const meanDiff = mean(diffs);
  const sdDiff = stdDev(diffs);
  const seDiff = sdDiff / Math.sqrt(diffs.length);
  if (!Number.isFinite(seDiff) || seDiff === 0) return { t: 0, df: diffs.length - 1, p: 1, cohenDz: 0 };
  const t = meanDiff / seDiff;
  const df = diffs.length - 1;
  return { t: round(t), df, p: round(1 - approxFCDF(t * t, 1, df), 6), cohenDz: round(sdDiff === 0 ? 0 : meanDiff / sdDiff) };
}

function mannWhitneyUTest(a: number[], b: number[]): { u: number; z: number; p: number } {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { u: 0, z: 0, p: 1 };
  const pooled = [...a.map((value) => ({ value, group: 1 })), ...b.map((value) => ({ value, group: 2 }))].sort((x, y) => x.value - y.value);
  const ranks = new Array<number>(pooled.length).fill(0);
  let i = 0;
  while (i < pooled.length) {
    let j = i;
    while (j + 1 < pooled.length && pooled[j + 1].value === pooled[i].value) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  let r1 = 0;
  for (let index = 0; index < pooled.length; index++) {
    if (pooled[index].group === 1) r1 += ranks[index];
  }
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) return { u: round(u), z: 0, p: 1 };
  const correction = u > mu ? -0.5 : 0.5;
  const z = (u - mu + correction) / sigma;
  return { u: round(u), z: round(z), p: round(2 * (1 - approxNormCDF(Math.abs(z))), 6) };
}

function wilcoxonSignedRankTest(a: number[], b: number[]): { W: number; z: number; p: number } {
  if (a.length !== b.length || a.length < 2) return { W: 0, z: 0, p: 1 };
  const diffs = a.map((value, index) => value - b[index]).filter((value) => value !== 0);
  if (diffs.length === 0) return { W: 0, z: 0, p: 1 };
  const absDiffs = diffs.map(Math.abs);
  const ranks = rankWithTies(absDiffs);
  let wPositive = 0;
  let wNegative = 0;
  diffs.forEach((diff, index) => {
    if (diff > 0) wPositive += ranks[index];
    else wNegative += ranks[index];
  });
  const w = Math.min(wPositive, wNegative);
  const n = diffs.length;
  const meanW = (n * (n + 1)) / 4;
  const sdW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  const z = sdW === 0 ? 0 : (w - meanW) / sdW;
  return { W: round(w), z: round(z), p: round(2 * (1 - approxNormCDF(Math.abs(z))), 6) };
}

function oneWayAnova(groups: number[][]): { F: number; dfBetween: number; dfWithin: number; p: number; etaSq: number } {
  const valid = groups.filter((group) => group.length > 0);
  const all = valid.flat();
  const grandMean = mean(all);
  const k = valid.length;
  const n = all.length;
  let ssBetween = 0;
  let ssWithin = 0;
  for (const group of valid) {
    const groupMean = mean(group);
    ssBetween += group.length * (groupMean - grandMean) ** 2;
    for (const value of group) ssWithin += (value - groupMean) ** 2;
  }
  const dfBetween = k - 1;
  const dfWithin = n - k;
  if (dfBetween <= 0 || dfWithin <= 0) return { F: 0, dfBetween, dfWithin, p: 1, etaSq: 0 };
  const f = (ssBetween / dfBetween) / (ssWithin / dfWithin);
  const etaSq = ssBetween / Math.max(ssBetween + ssWithin, 1e-12);
  return { F: round(f), dfBetween, dfWithin, p: round(1 - approxFCDF(f, dfBetween, dfWithin), 6), etaSq: round(etaSq) };
}

function kruskalWallisTest(groups: number[][]): { H: number; df: number; p: number; epsilonSq: number } {
  const validGroups = groups.filter((group) => group.length > 0);
  const k = validGroups.length;
  const n = validGroups.flat().length;
  if (k < 2 || n === 0) return { H: 0, df: Math.max(0, k - 1), p: 1, epsilonSq: 0 };
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
  h = (12 / (n * (n + 1))) * h - 3 * (n + 1);
  const df = k - 1;
  return {
    H: round(h),
    df,
    p: round(1 - approxChiSquareCDF(h, df), 6),
    epsilonSq: round(df > 0 ? Math.max(0, (h - df) / Math.max(n - df, 1)) : 0),
  };
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
  const t = r * Math.sqrt(df / Math.max(1 - r * r, 1e-12));
  return { r: round(r), t: round(t), df, p: round(1 - approxFCDF(t * t, 1, df), 6), r2: round(r * r) };
}

function spearmanCorrelation(x: number[], y: number[]): { rho: number; t: number; df: number; p: number; r2: number } {
  const rx = rankWithTies(x);
  const ry = rankWithTies(y);
  const pearson = pearsonCorrelation(rx, ry);
  return { rho: pearson.r, t: pearson.t, df: pearson.df, p: pearson.p, r2: pearson.r2 };
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
  const levelsA = uniqueSorted(prepared.map((row) => row.a));
  const levelsB = uniqueSorted(prepared.map((row) => row.b));
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
  return { y: prepared.map((row) => row.y), design, levelsA, levelsB };
}

function twoWayAnova(
  rows: FlatRow[],
  measureKey: string,
  factorA: AnalysisFactor,
  factorB: AnalysisFactor,
) {
  if (factorA === factorB) return { error: "Choose two different factors for 2-way ANOVA." } as const;
  const validRows = rows.filter((row) => !Number.isNaN(Number(row[measureKey])));
  const levelsA = uniqueSorted(validRows.map((row) => getFactorValue(row, factorA)));
  const levelsB = uniqueSorted(validRows.map((row) => getFactorValue(row, factorB)));
  if (levelsA.length < 2 || levelsB.length < 2) return { error: "Each factor needs at least 2 levels." } as const;
  const cellCounts = levelsA.flatMap((levelA) =>
    levelsB.map((levelB) => ({
      levelA,
      levelB,
      n: validRows.filter((row) => getFactorValue(row, factorA) === levelA && getFactorValue(row, factorB) === levelB).length,
    })),
  );
  if (cellCounts.some((cell) => cell.n === 0)) return { error: "Every factor combination needs at least one included animal." } as const;
  const modelA = buildTwoWayDesign(validRows, measureKey, factorA, factorB, true, false, false);
  const modelB = buildTwoWayDesign(validRows, measureKey, factorA, factorB, false, true, false);
  const modelAdd = buildTwoWayDesign(validRows, measureKey, factorA, factorB, true, true, false);
  const modelFull = buildTwoWayDesign(validRows, measureKey, factorA, factorB, true, true, true);
  const fitA = fitLinearModel(modelA.design, modelA.y);
  const fitB = fitLinearModel(modelB.design, modelB.y);
  const fitAdd = fitLinearModel(modelAdd.design, modelAdd.y);
  const fitFull = fitLinearModel(modelFull.design, modelFull.y);
  if (!fitA || !fitB || !fitAdd || !fitFull) return { error: "Could not fit 2-way ANOVA." } as const;
  const dfA = levelsA.length - 1;
  const dfB = levelsB.length - 1;
  const dfInteraction = dfA * dfB;
  const ssA = Math.max(0, fitB.sse - fitAdd.sse);
  const ssB = Math.max(0, fitA.sse - fitAdd.sse);
  const ssInteraction = Math.max(0, fitAdd.sse - fitFull.sse);
  const msErrorAdd = fitAdd.dfResidual > 0 ? fitAdd.sse / fitAdd.dfResidual : 0;
  const msErrorFull = fitFull.dfResidual > 0 ? fitFull.sse / fitFull.dfResidual : 0;
  const fA = dfA > 0 && msErrorAdd > 0 ? (ssA / dfA) / msErrorAdd : 0;
  const fB = dfB > 0 && msErrorAdd > 0 ? (ssB / dfB) / msErrorAdd : 0;
  const fInteraction = dfInteraction > 0 && msErrorFull > 0 ? (ssInteraction / dfInteraction) / msErrorFull : 0;
  return {
    factorA: getFactorLabel(factorA),
    factorB: getFactorLabel(factorB),
    levelsA,
    levelsB,
    n: validRows.length,
    table: [
      {
        source: getFactorLabel(factorA),
        F: round(fA),
        p: round(dfA > 0 && fitAdd.dfResidual > 0 ? 1 - approxFCDF(fA, dfA, fitAdd.dfResidual) : 1, 6),
        partial_eta_sq: round(ssA / Math.max(ssA + fitAdd.sse, 1e-12)),
      },
      {
        source: getFactorLabel(factorB),
        F: round(fB),
        p: round(dfB > 0 && fitAdd.dfResidual > 0 ? 1 - approxFCDF(fB, dfB, fitAdd.dfResidual) : 1, 6),
        partial_eta_sq: round(ssB / Math.max(ssB + fitAdd.sse, 1e-12)),
      },
      {
        source: `${getFactorLabel(factorA)} × ${getFactorLabel(factorB)}`,
        F: round(fInteraction),
        p: round(dfInteraction > 0 && fitFull.dfResidual > 0 ? 1 - approxFCDF(fInteraction, dfInteraction, fitFull.dfResidual) : 1, 6),
        partial_eta_sq: round(ssInteraction / Math.max(ssInteraction + fitFull.sse, 1e-12)),
      },
    ],
    cellCounts,
  };
}

function buildLongitudinalDataset(rows: FlatRow[], measureKey: string, betweenFactor: AnalysisFactor | "__none__") {
  const subjects = new Map<string, { between: string; values: Map<number, number> }>();
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
      between: entry.between,
      values: availableTimepoints.map((timepoint) => Number(entry.values.get(timepoint))),
    }));
  return { subjects, availableTimepoints, completeSubjects };
}

function repeatedMeasuresAnova(rows: FlatRow[], measureKey: string) {
  const dataset = buildLongitudinalDataset(rows, measureKey, "__none__");
  const nSubjects = dataset.completeSubjects.length;
  const k = dataset.availableTimepoints.length;
  if (k < 2 || nSubjects < 2) return { error: "Repeated-measures ANOVA needs at least 2 timepoints and 2 complete animals." } as const;
  const matrix = dataset.completeSubjects.map((subject) => subject.values);
  const grandMean = mean(matrix.flat());
  const subjectMeans = matrix.map((values) => mean(values));
  const timeMeans = dataset.availableTimepoints.map((_, index) => mean(matrix.map((subject) => subject[index])));
  let ssTotal = 0;
  matrix.forEach((values) => values.forEach((value) => { ssTotal += (value - grandMean) ** 2; }));
  const ssSubjects = k * subjectMeans.reduce((sum, subjectMean) => sum + (subjectMean - grandMean) ** 2, 0);
  const ssTime = nSubjects * timeMeans.reduce((sum, timeMean) => sum + (timeMean - grandMean) ** 2, 0);
  const ssError = Math.max(0, ssTotal - ssSubjects - ssTime);
  const dfTime = k - 1;
  const dfError = (nSubjects - 1) * (k - 1);
  const msTime = dfTime > 0 ? ssTime / dfTime : 0;
  const msError = dfError > 0 ? ssError / dfError : 0;
  const f = msError > 0 ? msTime / msError : 0;
  return {
    F: round(f),
    p: round(dfTime > 0 && dfError > 0 ? 1 - approxFCDF(f, dfTime, dfError) : 1, 6),
    partial_eta_sq: round(ssTime / Math.max(ssTime + ssError, 1e-12)),
  };
}

function mixedEffectsApproximation(rows: FlatRow[], measureKey: string, betweenFactor: AnalysisFactor | "__none__") {
  const validRows = rows
    .map((row) => ({
      ...row,
      y: Number(row[measureKey]),
      timeLabel: `${row.timepoint} Day`,
      betweenLabel: betweenFactor === "__none__" ? "All animals" : getFactorValue(row, betweenFactor),
    }))
    .filter((row) => !Number.isNaN(row.y));
  const subjectLevels = uniqueSorted(validRows.map((row) => row.animal_id));
  const timeLevels = uniqueSorted(validRows.map((row) => row.timeLabel));
  const betweenLevels = uniqueSorted(validRows.map((row) => row.betweenLabel));
  if (subjectLevels.length < 2 || timeLevels.length < 2) return { error: "Mixed-effects needs at least 2 animals and 2 timepoints." } as const;
  const baseDesign = validRows.map((row) => [
    1,
    ...subjectLevels.slice(1).map((subject) => (row.animal_id === subject ? 1 : 0)),
  ]);
  const timeDesign = validRows.map((row, index) => [
    ...baseDesign[index],
    ...timeLevels.slice(1).map((level) => (row.timeLabel === level ? 1 : 0)),
  ]);
  const interactionDesign = validRows.map((row, index) => {
    const columns = [...timeDesign[index]];
    if (betweenFactor === "__none__" || betweenLevels.length < 2) return columns;
    const betweenDummies = betweenLevels.slice(1).map((level) => (row.betweenLabel === level ? 1 : 0));
    for (const timeLevel of timeLevels.slice(1)) {
      for (const betweenDummy of betweenDummies) columns.push((row.timeLabel === timeLevel ? 1 : 0) * betweenDummy);
    }
    return columns;
  });
  const y = validRows.map((row) => row.y);
  const fitBase = fitLinearModel(baseDesign, y);
  const fitTime = fitLinearModel(timeDesign, y);
  const fitInteraction = fitLinearModel(interactionDesign, y);
  if (!fitBase || !fitTime || !fitInteraction) return { error: "Could not fit the mixed-effects approximation." } as const;
  const dfTime = timeLevels.length - 1;
  const ssTime = Math.max(0, fitBase.sse - fitTime.sse);
  const msTime = dfTime > 0 ? ssTime / dfTime : 0;
  const msError = fitTime.dfResidual > 0 ? fitTime.sse / fitTime.dfResidual : 0;
  const fTime = msError > 0 ? msTime / msError : 0;
  const interactionDf = betweenFactor === "__none__" || betweenLevels.length < 2 ? 0 : (timeLevels.length - 1) * (betweenLevels.length - 1);
  const ssInteraction = interactionDf > 0 ? Math.max(0, fitTime.sse - fitInteraction.sse) : 0;
  const msInteraction = interactionDf > 0 ? ssInteraction / interactionDf : 0;
  const msInteractionError = fitInteraction.dfResidual > 0 ? fitInteraction.sse / fitInteraction.dfResidual : 0;
  const fInteraction = interactionDf > 0 && msInteractionError > 0 ? msInteraction / msInteractionError : 0;
  return {
    time: {
      F: round(fTime),
      p: round(dfTime > 0 && fitTime.dfResidual > 0 ? 1 - approxFCDF(fTime, dfTime, fitTime.dfResidual) : 1, 6),
      partial_eta_sq: round(ssTime / Math.max(ssTime + fitTime.sse, 1e-12)),
    },
    interaction: {
      F: round(fInteraction),
      p: round(interactionDf > 0 && fitInteraction.dfResidual > 0 ? 1 - approxFCDF(fInteraction, interactionDf, fitInteraction.dfResidual) : 1, 6),
      partial_eta_sq: round(ssInteraction / Math.max(ssInteraction + fitInteraction.sse, 1e-12)),
    },
  };
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
  return { chi2: round(chi2), df: 1, p: round(1 - approxChiSquareCDF(chi2, 1), 6), phi: round(total > 0 ? Math.sqrt(chi2 / total) : 0) };
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
    const probability = hyperProb(x);
    if (probability <= observed + 1e-12) p += probability;
  }
  return { p: round(Math.min(p, 1), 6) };
}

function ancova(rows: FlatRow[], outcomeKey: string, factor: AnalysisFactor, covariateKey: string) {
  const prepared = rows
    .map((row) => ({
      y: Number(row[outcomeKey]),
      covariate: Number(row[covariateKey]),
      factorLevel: getFactorValue(row, factor),
    }))
    .filter((row) => !Number.isNaN(row.y) && !Number.isNaN(row.covariate) && row.factorLevel);
  const levels = uniqueSorted(prepared.map((row) => row.factorLevel));
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
    return [1, row.covariate, ...factorDummies, ...factorDummies.map((dummy) => dummy * row.covariate)];
  });
  const y = prepared.map((row) => row.y);
  const reducedFit = fitLinearModel(reducedDesign, y);
  const fullFit = fitLinearModel(fullDesign, y);
  const interactionFit = fitLinearModel(interactionDesign, y);
  if (!reducedFit || !fullFit || !interactionFit) return { error: "Could not fit ANCOVA with the selected variables." } as const;
  const dfFactor = levels.length - 1;
  const ssFactor = Math.max(0, reducedFit.sse - fullFit.sse);
  const msFactor = dfFactor > 0 ? ssFactor / dfFactor : 0;
  const msError = fullFit.dfResidual > 0 ? fullFit.sse / fullFit.dfResidual : 0;
  const f = msError > 0 ? msFactor / msError : 0;
  return {
    F: round(f),
    p: round(dfFactor > 0 && fullFit.dfResidual > 0 ? 1 - approxFCDF(f, dfFactor, fullFit.dfResidual) : 1, 6),
    partial_eta_sq: round(ssFactor / Math.max(ssFactor + fullFit.sse, 1e-12)),
    rmse: round(Math.sqrt(fullFit.sse / Math.max(prepared.length, 1))),
  };
}

function buildRocCurve(scores: Array<{ score: number; positive: boolean }>) {
  const sortedThresholds = Array.from(new Set(scores.map((entry) => entry.score))).sort((a, b) => b - a);
  const positives = scores.filter((entry) => entry.positive).length;
  const negatives = scores.length - positives;
  if (positives === 0 || negatives === 0) return { auc: 0.5 };
  const points = [{ threshold: Number.POSITIVE_INFINITY, tpr: 0, fpr: 0 }];
  for (const threshold of sortedThresholds) {
    const tp = scores.filter((entry) => entry.positive && entry.score >= threshold).length;
    const fp = scores.filter((entry) => !entry.positive && entry.score >= threshold).length;
    const sensitivity = tp / positives;
    const specificity = 1 - fp / negatives;
    points.push({ threshold, tpr: sensitivity, fpr: 1 - specificity });
  }
  points.push({ threshold: Number.NEGATIVE_INFINITY, tpr: 1, fpr: 1 });
  const augmented = points.sort((a, b) => a.fpr - b.fpr);
  let auc = 0;
  for (let index = 1; index < augmented.length; index++) {
    const prev = augmented[index - 1];
    const curr = augmented[index];
    auc += (curr.fpr - prev.fpr) * ((curr.tpr + prev.tpr) / 2);
  }
  return { auc: round(auc, 4) };
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
  const groups = uniqueSorted(prepared.map((row) => row.group));
  if (groups.length < 2) return { error: "Log-rank needs at least 2 groups." } as const;
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
  return { log_rank_chi2: round(chi2), df, p: round(1 - approxChiSquareCDF(chi2, df), 6) };
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
    return { r2: round(totalSS > 0 ? 1 - fit.sse / totalSS : 1, 4) };
  }
  if (family === "exponential") {
    const valid = points.filter((point) => point.y > 0);
    if (valid.length < 4) return { error: "Exponential regression needs positive outcome values." } as const;
    const fit = fitLinearModel(valid.map((point) => [1, point.x]), valid.map((point) => Math.log(point.y)));
    if (!fit) return { error: "Could not fit exponential regression." } as const;
    const [logA, b] = fit.coefficients;
    const a = Math.exp(logA);
    const sse = points.reduce((sum, point) => sum + (point.y - a * Math.exp(b * point.x)) ** 2, 0);
    return { r2: round(totalSS > 0 ? 1 - sse / totalSS : 1, 4) };
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1e-6);
  let bestSse = Number.POSITIVE_INFINITY;
  for (const bottom of [minY - yRange * 0.15, minY, minY + yRange * 0.1]) {
    for (const top of [maxY - yRange * 0.1, maxY, maxY + yRange * 0.15]) {
      if (Math.abs(top - bottom) < 1e-6) continue;
      for (let i = 0; i <= 24; i++) {
        const midpoint = minX + ((maxX - minX) * i) / 24;
        for (const slope of [-xRange, -xRange / 2, -xRange / 4, xRange / 4, xRange / 2, xRange].filter((value) => Math.abs(value) > 1e-6)) {
          const sse = points.reduce((sum, point) => {
            const predicted = bottom + (top - bottom) / (1 + Math.exp(-(point.x - midpoint) / slope));
            return sum + (point.y - predicted) ** 2;
          }, 0);
          bestSse = Math.min(bestSse, sse);
        }
      }
    }
  }
  return { r2: round(totalSS > 0 ? 1 - bestSse / totalSS : 1, 4) };
}

function estimateWithinSubjectCorrelation(pairsA: number[], pairsB: number[]) {
  if (pairsA.length !== pairsB.length || pairsA.length < 3) return null;
  const correlation = pearsonCorrelation(pairsA, pairsB);
  return Number.isFinite(correlation.r) ? correlation.r : null;
}

function cohenFfromEta(eta: number) {
  return Math.sqrt(Math.max(eta, 0) / Math.max(1 - eta, 1e-12));
}

function eventRate(values: Array<boolean | null>) {
  const valid = values.filter((value): value is boolean => value != null);
  if (valid.length === 0) return null;
  return valid.filter(Boolean).length / valid.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function effectMagnitude(metric: PowerEffectMetric, effectValue: number | { group1: number; group2: number }) {
  if (metric === "event_rates") {
    if (typeof effectValue === "number") return Math.abs(effectValue);
    const p1 = clamp(effectValue.group1, 1e-6, 1 - 1e-6);
    const p2 = clamp(effectValue.group2, 1e-6, 1 - 1e-6);
    return Math.abs(2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2)));
  }
  if (metric === "hazard_ratio") return Math.abs(Math.log(Math.max(Number(effectValue), 1e-6)));
  if (metric === "auc") {
    const auc = clamp(Number(effectValue), 0.500001, 0.999999);
    return Math.abs(Math.sqrt(2) * approxNormInv(auc));
  }
  if (metric === "r2") {
    const r2 = clamp(Number(effectValue), 1e-6, 0.999999);
    return Math.sqrt(r2 / Math.max(1 - r2, 1e-12));
  }
  if (metric === "partial_eta_sq") return cohenFfromEta(clamp(Number(effectValue), 0, 0.999999));
  if (metric === "r") {
    const r = clamp(Math.abs(Number(effectValue)), 1e-6, 0.999999);
    return Math.abs(0.5 * Math.log((1 + r) / (1 - r)));
  }
  return Math.abs(Number(effectValue));
}

function sampleValueToTotal(
  baseTest: PowerBaseTest,
  plannedSample: PowerPlannedSample,
  sampleContext: SampleContext,
) {
  const groups = Math.max(sampleContext.groups.length, 2);
  const factorACount = Math.max(sampleContext.factorALevels.length, 2);
  const factorBCount = Math.max(sampleContext.factorBLevels.length, 2);
  const betweenCount = Math.max(sampleContext.betweenLevels.length, 1);
  switch (plannedSample.mode) {
    case "per_cell":
      return plannedSample.value * factorACount * factorBCount;
    case "subjects_per_group":
      return plannedSample.value * betweenCount;
    case "per_group":
      return plannedSample.value * groups;
    case "pairs_total":
    case "subjects_total":
    case "total":
    default:
      return plannedSample.value;
  }
}

function getDefaultSampleMode(baseTest: PowerBaseTest): PowerPlannedSample["mode"] {
  switch (baseTest) {
    case "two_way_anova":
      return "per_cell";
    case "paired_t_test":
    case "wilcoxon_signed_rank":
      return "pairs_total";
    case "repeated_measures_anova":
    case "mixed_effects":
      return "subjects_per_group";
    case "pearson":
    case "spearman":
    case "nonlinear_regression":
    case "dose_response":
      return "total";
    case "log_rank":
      return "subjects_total";
    default:
      return "per_group";
  }
}

function effectiveAlpha(alpha: number, baseTest: PowerBaseTest, pAdjustMethod: PowerPlannerInput["pAdjustMethod"], contrastCount: number) {
  const safeAlpha = clamp(alpha, 1e-6, 0.2);
  if ((baseTest !== "multi_compare" && baseTest !== "dunnett") || contrastCount <= 1) return safeAlpha;
  switch (pAdjustMethod) {
    case "bonferroni":
    case "holm":
      return safeAlpha / contrastCount;
    case "fdr":
      return safeAlpha / Math.max(Math.sqrt(contrastCount), 1);
    case "none":
    default:
      return safeAlpha;
  }
}

function baseCriticalZ(alpha: number) {
  return approxNormInv(1 - clamp(alpha, 1e-6, 0.2) / 2);
}

function analyticPowerForSample(
  baseTest: PowerBaseTest,
  metric: PowerEffectMetric,
  effectValue: number | { group1: number; group2: number },
  plannedSample: PowerPlannedSample,
  alpha: number,
  sampleContext: SampleContext,
  assumptions: PowerAssumptions,
) {
  const magnitude = effectMagnitude(metric, effectValue);
  const critical = baseCriticalZ(alpha);
  const total = sampleValueToTotal(baseTest, plannedSample, sampleContext);
  const groups = Math.max(sampleContext.groups.length, 2);
  const eventsFraction = clamp(1 - (assumptions.censoringRate ?? 0.2), 0.05, 1);
  let signal = 0;
  switch (baseTest) {
    case "t_test":
    case "mann_whitney":
    case "multi_compare":
    case "dunnett":
      signal = magnitude * Math.sqrt(Math.max(plannedSample.value, 2) / 2);
      break;
    case "paired_t_test":
    case "wilcoxon_signed_rank":
      signal = magnitude * Math.sqrt(Math.max(plannedSample.value, 2));
      break;
    case "pearson":
    case "spearman":
      signal = magnitude * Math.sqrt(Math.max(total - 3, 1));
      break;
    case "chi_square":
    case "fisher_exact":
      signal = magnitude * Math.sqrt(Math.max(plannedSample.value, 2) / 2);
      break;
    case "log_rank":
      signal = magnitude * Math.sqrt(Math.max(total * eventsFraction, 2) / 4);
      break;
    case "roc_curve":
      signal = magnitude * Math.sqrt(Math.max(total, 4) / 2);
      break;
    default:
      signal = magnitude * Math.sqrt(Math.max(total, Math.max(groups, 2)));
      break;
  }
  return clamp(approxNormCDF(signal - critical), 0, 0.999999);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), t | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(rng: () => number) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomExponential(rng: () => number, rate: number) {
  const u = Math.max(rng(), 1e-12);
  return -Math.log(u) / Math.max(rate, 1e-12);
}

function centeredPattern(count: number) {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) => index - (count - 1) / 2);
}

function scalePatternToSd(pattern: number[], targetSd: number) {
  const currentSd = stdDev(pattern);
  if (currentSd === 0) return pattern.map(() => 0);
  return pattern.map((value) => (value / currentSd) * targetSd);
}

function toFlatRows(rows: Array<Record<string, string | number | null>>) {
  return rows as FlatRow[];
}

function powerRejectsSimulation(input: PowerPlannerInput, alpha: number, sampleValue: number, effectValue: number | { group1: number; group2: number }, seed: number) {
  const rng = mulberry32(seed);
  const nuisanceScale = Math.max(input.powerConfig.assumptions.nuisanceScale ?? 1, 1e-6);
  const withinCorr = clamp(input.powerConfig.assumptions.withinSubjectCorr ?? 0.4, -0.95, 0.95);
  const groups = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.groupingFactor)));
  const factorALevels = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.factorA)));
  const factorBLevels = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.factorB)));
  const betweenFactor = input.betweenSubjectFactor === "__none__" ? null : input.betweenSubjectFactor;
  const betweenLevels = input.betweenSubjectFactor === "__none__"
    ? ["All animals"]
    : uniqueSorted(input.flatData.map((row) => getFactorValue(row, betweenFactor as AnalysisFactor)));
  const metric = input.powerConfig.effectMetric;
  const magnitude = effectMagnitude(metric, effectValue);
  const positiveClass = input.positiveClass || "Positive";
  const timepoints = Array.from(new Set(input.flatData.map((row) => row.timepoint))).sort((a, b) => a - b);

  switch (input.powerConfig.baseTest) {
    case "mann_whitney": {
      const n = Math.max(sampleValue, 2);
      const a = Array.from({ length: n }, () => randomNormal(rng) * nuisanceScale - (magnitude * nuisanceScale) / 2);
      const b = Array.from({ length: n }, () => randomNormal(rng) * nuisanceScale + (magnitude * nuisanceScale) / 2);
      return mannWhitneyUTest(a, b).p < alpha;
    }
    case "wilcoxon_signed_rank": {
      const n = Math.max(sampleValue, 2);
      const a: number[] = [];
      const b: number[] = [];
      for (let i = 0; i < n; i++) {
        const base = randomNormal(rng) * nuisanceScale;
        const pairedNoise = randomNormal(rng) * nuisanceScale * Math.sqrt(Math.max(1 - withinCorr ** 2, 1e-6));
        a.push(base);
        b.push(base * withinCorr + pairedNoise + magnitude * nuisanceScale);
      }
      return wilcoxonSignedRankTest(a, b).p < alpha;
    }
    case "kruskal_wallis": {
      const k = Math.max(groups.length, 3);
      const perGroup = Math.max(sampleValue, 2);
      const shifts = scalePatternToSd(centeredPattern(k), magnitude * nuisanceScale);
      const simulatedGroups = Array.from({ length: k }, (_, groupIndex) =>
        Array.from({ length: perGroup }, () => randomNormal(rng) * nuisanceScale + shifts[groupIndex]),
      );
      return kruskalWallisTest(simulatedGroups).p < alpha;
    }
    case "two_way_anova": {
      const levelsA = Math.max(factorALevels.length, 2);
      const levelsB = Math.max(factorBLevels.length, 2);
      const perCell = Math.max(sampleValue, 2);
      const aPattern = scalePatternToSd(centeredPattern(levelsA), magnitude * nuisanceScale);
      const bPattern = scalePatternToSd(centeredPattern(levelsB), magnitude * nuisanceScale);
      const rows: Array<Record<string, string | number | null>> = [];
      for (let aIndex = 0; aIndex < levelsA; aIndex++) {
        for (let bIndex = 0; bIndex < levelsB; bIndex++) {
          for (let i = 0; i < perCell; i++) {
            const interaction =
              input.powerConfig.targetEffect === "interaction"
                ? ((aIndex - (levelsA - 1) / 2) * (bIndex - (levelsB - 1) / 2) * magnitude) / Math.max(levelsA * levelsB, 1)
                : 0;
            const mu =
              (input.powerConfig.targetEffect === "main_effect_a" ? aPattern[aIndex] : 0) +
              (input.powerConfig.targetEffect === "main_effect_b" ? bPattern[bIndex] : 0) +
              interaction * nuisanceScale;
            rows.push({
              animal_id: `animal-${aIndex}-${bIndex}-${i}`,
              identifier: `animal-${aIndex}-${bIndex}-${i}`,
              sex: factorALevels[aIndex] || `A${aIndex + 1}`,
              genotype: factorBLevels[bIndex] || `B${bIndex + 1}`,
              group: `${factorALevels[aIndex] || `A${aIndex + 1}`} ${factorBLevels[bIndex] || `B${bIndex + 1}`}`,
              cohort: "Sim",
              timepoint: 0,
              experiment: "sim",
              [input.measureKey]: randomNormal(rng) * nuisanceScale + mu,
            });
          }
        }
      }
      const result = twoWayAnova(toFlatRows(rows), input.measureKey, input.factorA, input.factorB);
      if ("error" in result) return false;
      const targetLabel =
        input.powerConfig.targetEffect === "main_effect_b"
          ? getFactorLabel(input.factorB)
          : input.powerConfig.targetEffect === "interaction"
            ? `${getFactorLabel(input.factorA)} × ${getFactorLabel(input.factorB)}`
            : getFactorLabel(input.factorA);
      const row = result.table.find((entry) => String(entry.source) === targetLabel);
      return Number(row?.p ?? 1) < alpha;
    }
    case "repeated_measures_anova": {
      const subjectCount = Math.max(sampleValue, 2);
      const countTimepoints = Math.max(timepoints.length, 2);
      const timePattern = scalePatternToSd(centeredPattern(countTimepoints), magnitude * nuisanceScale);
      const rows: Array<Record<string, string | number | null>> = [];
      for (let subjectIndex = 0; subjectIndex < subjectCount; subjectIndex++) {
        const intercept = randomNormal(rng) * nuisanceScale;
        for (let timeIndex = 0; timeIndex < countTimepoints; timeIndex++) {
          const residual = randomNormal(rng) * nuisanceScale * Math.sqrt(Math.max(1 - withinCorr ** 2, 1e-6));
          rows.push({
            animal_id: `animal-${subjectIndex}`,
            identifier: `animal-${subjectIndex}`,
            sex: "Mixed",
            genotype: "Mixed",
            group: "Repeated",
            cohort: "Sim",
            timepoint: timepoints[timeIndex] ?? timeIndex,
            experiment: "sim",
            [input.measureKey]: intercept + timePattern[timeIndex] + residual,
          });
        }
      }
      const result = repeatedMeasuresAnova(toFlatRows(rows), input.measureKey);
      return !("error" in result) && result.p < alpha;
    }
    case "mixed_effects": {
      const groupsCount = Math.max(betweenLevels.length, 2);
      const subjectPerGroup = Math.max(sampleValue, 2);
      const countTimepoints = Math.max(timepoints.length, 2);
      const betweenPattern = scalePatternToSd(centeredPattern(groupsCount), magnitude * nuisanceScale);
      const timePattern = scalePatternToSd(centeredPattern(countTimepoints), magnitude * nuisanceScale);
      const rows: Array<Record<string, string | number | null>> = [];
      for (let groupIndex = 0; groupIndex < groupsCount; groupIndex++) {
        for (let subjectIndex = 0; subjectIndex < subjectPerGroup; subjectIndex++) {
          const intercept = randomNormal(rng) * nuisanceScale;
          for (let timeIndex = 0; timeIndex < countTimepoints; timeIndex++) {
            if (rng() < 0.15) continue;
            const residual = randomNormal(rng) * nuisanceScale * Math.sqrt(Math.max(1 - withinCorr ** 2, 1e-6));
            const interaction =
              input.powerConfig.targetEffect === "interaction"
                ? betweenPattern[groupIndex] * (timeIndex - (countTimepoints - 1) / 2) / Math.max(countTimepoints, 1)
                : 0;
            rows.push({
              animal_id: `animal-${groupIndex}-${subjectIndex}`,
              identifier: `animal-${groupIndex}-${subjectIndex}`,
              sex: "Mixed",
              genotype: "Mixed",
              group: betweenLevels[groupIndex] || `Group ${groupIndex + 1}`,
              cohort: "Sim",
              timepoint: timepoints[timeIndex] ?? timeIndex,
              experiment: "sim",
              [input.measureKey]:
                intercept +
                (input.powerConfig.targetEffect === "time" ? timePattern[timeIndex] : 0) +
                interaction +
                residual,
            });
          }
        }
      }
      const result = mixedEffectsApproximation(toFlatRows(rows), input.measureKey, input.betweenSubjectFactor);
      if ("error" in result) return false;
      if (input.powerConfig.targetEffect === "interaction") return Number(result.interaction.p) < alpha;
      return Number(result.time.p) < alpha;
    }
    case "ancova": {
      const groupsCount = Math.max(groups.length, 2);
      const perGroup = Math.max(sampleValue, 2);
      const groupPattern = scalePatternToSd(centeredPattern(groupsCount), magnitude * nuisanceScale);
      const rows: Array<Record<string, string | number | null>> = [];
      for (let groupIndex = 0; groupIndex < groupsCount; groupIndex++) {
        for (let i = 0; i < perGroup; i++) {
          const covariate = randomNormal(rng);
          rows.push({
            animal_id: `animal-${groupIndex}-${i}`,
            identifier: `animal-${groupIndex}-${i}`,
            sex: "Mixed",
            genotype: "Mixed",
            group: groups[groupIndex] || `Group ${groupIndex + 1}`,
            cohort: "Sim",
            timepoint: 0,
            experiment: "sim",
            [input.covariateMeasureKey]: covariate,
            [input.measureKey]: 0.5 * covariate + groupPattern[groupIndex] + randomNormal(rng) * nuisanceScale,
          });
        }
      }
      const result = ancova(toFlatRows(rows), input.measureKey, input.groupingFactor, input.covariateMeasureKey);
      return !("error" in result) && result.p < alpha;
    }
    case "fisher_exact": {
      const rates = typeof effectValue === "number"
        ? { group1: 0.4, group2: clamp(0.4 + effectValue, 0.01, 0.99) }
        : effectValue;
      const n = Math.max(sampleValue, 2);
      let a = 0;
      let b = 0;
      let c = 0;
      let d = 0;
      for (let i = 0; i < n; i++) {
        if (rng() < rates.group1) a++;
        else b++;
        if (rng() < rates.group2) c++;
        else d++;
      }
      return fisherExactTest(a, b, c, d).p < alpha;
    }
    case "spearman": {
      const n = Math.max(sampleValue, 4);
      const targetR = clamp(typeof effectValue === "number" ? effectValue : 0.35, -0.95, 0.95);
      const x: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < n; i++) {
        const base = randomNormal(rng);
        const noise = randomNormal(rng) * Math.sqrt(Math.max(1 - targetR ** 2, 1e-6));
        x.push(base);
        y.push(Math.sign(base) * Math.abs(base) ** 1.2 * targetR + noise);
      }
      return spearmanCorrelation(x, y).p < alpha;
    }
    case "log_rank": {
      const nTotal = Math.max(sampleValue, 4);
      const groupSize = Math.max(Math.floor(nTotal / 2), 2);
      const hazardRatio = clamp(Number(effectValue), 0.05, 20);
      const censoringRate = clamp(input.powerConfig.assumptions.censoringRate ?? 0.25, 0, 0.85);
      const rows: Array<Record<string, string | number | null>> = [];
      for (let i = 0; i < groupSize * 2; i++) {
        const isCase = i >= groupSize;
        const hazard = isCase ? hazardRatio : 1;
        const eventTime = randomExponential(rng, hazard);
        const censorTime = randomExponential(rng, Math.max(censoringRate, 1e-3));
        const observedTime = Math.min(eventTime, censorTime);
        const eventObserved = eventTime <= censorTime;
        rows.push({
          animal_id: `animal-${i}`,
          identifier: `animal-${i}`,
          sex: "Mixed",
          genotype: "Mixed",
          group: isCase ? (input.group2 || "Group 2") : (input.group1 || "Group 1"),
          cohort: "Sim",
          timepoint: 0,
          experiment: "sim",
          [input.timeToEventMeasureKey]: observedTime,
          [input.eventMeasureKey]: eventObserved ? positiveClass : "Censored",
        });
      }
      const result = logRankTest(toFlatRows(rows), input.timeToEventMeasureKey, input.eventMeasureKey, input.groupingFactor, positiveClass);
      return !("error" in result) && result.p < alpha;
    }
    case "roc_curve": {
      const nTotal = Math.max(sampleValue, 6);
      const auc = clamp(Number(effectValue), 0.500001, 0.99);
      const delta = Math.sqrt(2) * approxNormInv(auc);
      const groupSize = Math.max(Math.floor(nTotal / 2), 3);
      const groupA = Array.from({ length: groupSize }, () => randomNormal(rng));
      const groupB = Array.from({ length: groupSize }, () => randomNormal(rng) + delta);
      return rocAucFromBinaryGroups(groupB, groupA).p < alpha;
    }
    case "nonlinear_regression":
    case "dose_response": {
      const n = Math.max(sampleValue, 8);
      const r2 = clamp(Number(effectValue), 0.01, 0.95);
      const targetR = Math.sqrt(r2);
      const family = input.powerConfig.baseTest === "dose_response" ? "logistic" : input.regressionModelFamily;
      const rows: Array<Record<string, string | number | null>> = [];
      for (let i = 0; i < n; i++) {
        const x = -2 + (4 * i) / Math.max(n - 1, 1);
        const signal =
          family === "exponential"
            ? Math.exp(x / 2)
            : family === "logistic"
              ? 1 / (1 + Math.exp(-x))
              : x;
        const y = signal * targetR + randomNormal(rng) * Math.sqrt(Math.max(1 - r2, 1e-6));
        rows.push({
          animal_id: `animal-${i}`,
          identifier: `animal-${i}`,
          sex: "Mixed",
          genotype: "Mixed",
          group: "Regression",
          cohort: "Sim",
          timepoint: 0,
          experiment: "sim",
          [input.predictorMeasureKey]: x,
          [input.measureKey]: y,
        });
      }
      const result = fitNonlinearRegression(toFlatRows(rows), input.predictorMeasureKey, input.measureKey, family);
      return !("error" in result) && Number(result.r2) >= r2 * 0.5;
    }
    default:
      return analyticPowerForSample(
        input.powerConfig.baseTest,
        metric,
        effectValue,
        { mode: getDefaultSampleMode(input.powerConfig.baseTest), value: sampleValue },
        alpha,
        {
          groups,
          factorALevels,
          factorBLevels,
          timepoints,
          betweenLevels,
        },
        input.powerConfig.assumptions,
      ) >= 0.5;
  }
}

function simulatePowerForSample(input: PowerPlannerInput, alpha: number, sampleValue: number, effectValue: number | { group1: number; group2: number }, iterations: number, seed: number) {
  let successes = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (powerRejectsSimulation(input, alpha, sampleValue, effectValue, seed + iteration * 9973)) successes += 1;
  }
  const power = successes / Math.max(iterations, 1);
  const mcse = Math.sqrt((power * (1 - power)) / Math.max(iterations, 1));
  return { power, mcse };
}

function getContrastOptions(input: PowerPlannerInput, baseTest: PowerBaseTest) {
  const levels = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.groupingFactor)));
  if (levels.length < 2) return [];
  if (baseTest === "dunnett") {
    const control = input.controlGroup || levels[0];
    return levels
      .filter((level) => level !== control)
      .map((level) => ({
        group1: control,
        group2: level,
        label: `${control} vs ${level}`,
      }));
  }
  if (baseTest === "multi_compare") {
    const options: PowerContrastSelection[] = [];
    for (let i = 0; i < levels.length; i++) {
      for (let j = i + 1; j < levels.length; j++) {
        options.push({
          group1: levels[i],
          group2: levels[j],
          label: `${levels[i]} vs ${levels[j]}`,
        });
      }
    }
    return options;
  }
  if (["t_test", "paired_t_test", "mann_whitney", "wilcoxon_signed_rank", "log_rank"].includes(baseTest)) {
    return [{ group1: input.group1 || levels[0], group2: input.group2 || levels[1] || levels[0], label: `${input.group1 || levels[0]} vs ${input.group2 || levels[1] || levels[0]}` }];
  }
  return [];
}

function getObservedContrast(input: PowerPlannerInput, baseTest: PowerBaseTest, contrastOptions: PowerContrastSelection[]) {
  if (baseTest === "multi_compare" || baseTest === "dunnett") {
    const selection = input.powerConfig.contrastSelection;
    if (selection && contrastOptions.some((option) => option.group1 === selection.group1 && option.group2 === selection.group2)) return selection;
    return contrastOptions[0] ?? null;
  }
  if (["t_test", "paired_t_test", "mann_whitney", "wilcoxon_signed_rank", "log_rank"].includes(baseTest)) {
    return contrastOptions[0] ?? null;
  }
  return null;
}

function getGroupValues(input: PowerPlannerInput, group: string, key = input.measureKey) {
  return input.flatData
    .filter((row) => getFactorValue(row, input.groupingFactor) === group)
    .map((row) => Number(row[key]))
    .filter((value) => !Number.isNaN(value));
}

function getPairedValues(input: PowerPlannerInput, group1: string, group2: string) {
  const byAnimal = new Map<string, Record<string, number>>();
  input.flatData.forEach((row) => {
    const level = getFactorValue(row, input.groupingFactor);
    if (level !== group1 && level !== group2) return;
    const value = Number(row[input.measureKey]);
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
}

function deriveObservedPowerState(input: PowerPlannerInput, baseTest: PowerBaseTest) {
  const notes: string[] = [];
  const contrastOptions = getContrastOptions(input, baseTest);
  const contrast = getObservedContrast(input, baseTest, contrastOptions);
  const groups = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.groupingFactor)));
  const factorALevels = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.factorA)));
  const factorBLevels = uniqueSorted(input.flatData.map((row) => getFactorValue(row, input.factorB)));
  const betweenFactor = input.betweenSubjectFactor === "__none__" ? null : input.betweenSubjectFactor;
  const timepoints = Array.from(new Set(input.flatData.map((row) => row.timepoint))).sort((a, b) => a - b);
  const betweenLevels = input.betweenSubjectFactor === "__none__"
    ? ["All animals"]
    : uniqueSorted(input.flatData.map((row) => getFactorValue(row, betweenFactor as AnalysisFactor)));
  const binaryKeys = detectBinaryLikeKeys(input.flatData);
  let eligible = true;
  let effectMetric = input.powerConfig.effectMetric;
  let effectValue: number | { group1: number; group2: number } = typeof input.powerConfig.effectValue === "number"
    ? Number(input.powerConfig.effectValue)
    : { ...input.powerConfig.effectValue };
  let assumptions: PowerAssumptions = {
    nuisanceScale: null,
    residualSd: null,
    withinSubjectCorr: null,
    eventRates: null,
    classPrevalence: null,
    censoringRate: null,
    predictorMean: null,
    predictorSd: null,
    effectNotes: [],
  };

  switch (baseTest) {
    case "t_test":
    case "mann_whitney":
    case "multi_compare":
    case "dunnett": {
      const pair = contrast ?? { group1: input.group1, group2: input.group2, label: `${input.group1} vs ${input.group2}` };
      const a = getGroupValues(input, pair.group1);
      const b = getGroupValues(input, pair.group2);
      if (a.length < 2 || b.length < 2) {
        eligible = false;
        notes.push("At least 2 observations are needed in each selected group.");
      }
      const observed = welchTTest(a, b);
      effectMetric = "d";
      effectValue = Math.abs(observed.cohenD) || 0.5;
      assumptions = {
        ...assumptions,
        nuisanceScale: pooledSd(a, b) || stdDev([...a, ...b]) || 1,
        residualSd: pooledSd(a, b) || stdDev([...a, ...b]) || 1,
        effectNotes: [`Observed contrast: ${pair.label}`],
      };
      break;
    }
    case "paired_t_test":
    case "wilcoxon_signed_rank": {
      const pair = contrast ?? { group1: input.group1, group2: input.group2, label: `${input.group1} vs ${input.group2}` };
      const paired = getPairedValues(input, pair.group1, pair.group2);
      if (paired.a.length < 2) {
        eligible = false;
        notes.push("Need at least 2 matched animals for the selected levels.");
      }
      const observed = pairedTTest(paired.a, paired.b);
      effectMetric = "dz";
      effectValue = Math.abs(observed.cohenDz) || 0.5;
      assumptions = {
        ...assumptions,
        nuisanceScale: stdDev(paired.a.map((value, index) => value - paired.b[index])) || 1,
        residualSd: stdDev(paired.a.map((value, index) => value - paired.b[index])) || 1,
        withinSubjectCorr: estimateWithinSubjectCorrelation(paired.a, paired.b),
        effectNotes: [`Observed matched contrast: ${pair.label}`],
      };
      break;
    }
    case "anova":
    case "kruskal_wallis": {
      const grouped = groups.map((group) => getGroupValues(input, group)).filter((values) => values.length >= 2);
      if (grouped.length < 2) {
        eligible = false;
        notes.push("Need at least 2 groups with 2 or more observations.");
      }
      const observed = oneWayAnova(grouped);
      effectMetric = "f";
      effectValue = cohenFfromEta(observed.etaSq) || 0.25;
      assumptions = {
        ...assumptions,
        nuisanceScale: stdDev(grouped.flat()) || 1,
        residualSd: stdDev(grouped.flat()) || 1,
        effectNotes: [`Observed omnibus eta² = ${round(observed.etaSq, 4)}.`],
      };
      break;
    }
    case "two_way_anova": {
      const observed = twoWayAnova(input.flatData, input.measureKey, input.factorA, input.factorB);
      if ("error" in observed) {
        eligible = false;
        notes.push(String(observed.error));
        effectMetric = "f";
        effectValue = 0.25;
      } else {
        const label =
          input.powerConfig.targetEffect === "main_effect_b"
            ? getFactorLabel(input.factorB)
            : input.powerConfig.targetEffect === "interaction"
              ? `${getFactorLabel(input.factorA)} × ${getFactorLabel(input.factorB)}`
              : getFactorLabel(input.factorA);
        const row = observed.table.find((entry) => String(entry.source) === label);
        const eta = Number(row?.partial_eta_sq ?? 0.06);
        effectMetric = "f";
        effectValue = cohenFfromEta(eta) || 0.25;
        assumptions = {
          ...assumptions,
          nuisanceScale: stdDev(input.flatData.map((row) => Number(row[input.measureKey])).filter((value) => !Number.isNaN(value))) || 1,
          residualSd: stdDev(input.flatData.map((row) => Number(row[input.measureKey])).filter((value) => !Number.isNaN(value))) || 1,
          effectNotes: [`Observed ${label} partial eta² = ${round(eta, 4)}.`],
        };
      }
      break;
    }
    case "repeated_measures_anova": {
      const observed = repeatedMeasuresAnova(input.flatData, input.measureKey);
      if ("error" in observed) {
        eligible = false;
        notes.push(String(observed.error));
        effectMetric = "f";
        effectValue = 0.25;
      } else {
        effectMetric = "f";
        effectValue = cohenFfromEta(Number(observed.partial_eta_sq ?? 0.06)) || 0.25;
        const dataset = buildLongitudinalDataset(input.flatData, input.measureKey, "__none__");
        const correlations: number[] = [];
        dataset.completeSubjects.forEach((subject) => {
          if (subject.values.length < 2) return;
          correlations.push(...subject.values.slice(1).map((value, index) => {
            const prev = subject.values[index];
            return value === prev ? 1 : 0;
          }));
        });
        assumptions = {
          ...assumptions,
          nuisanceScale: stdDev(dataset.completeSubjects.flatMap((subject) => subject.values)) || 1,
          residualSd: stdDev(dataset.completeSubjects.flatMap((subject) => subject.values)) || 1,
          withinSubjectCorr: correlations.length > 0 ? mean(correlations) : input.powerConfig.assumptions.withinSubjectCorr ?? 0.4,
          effectNotes: [`Observed time partial eta² = ${round(Number(observed.partial_eta_sq ?? 0), 4)}.`],
        };
      }
      break;
    }
    case "mixed_effects": {
      const observed = mixedEffectsApproximation(input.flatData, input.measureKey, input.betweenSubjectFactor);
      if ("error" in observed) {
        eligible = false;
        notes.push(String(observed.error));
        effectMetric = "f";
        effectValue = 0.25;
      } else {
        const block = input.powerConfig.targetEffect === "interaction" ? observed.interaction : observed.time;
        effectMetric = "f";
        effectValue = cohenFfromEta(Number(block.partial_eta_sq ?? 0.06)) || 0.25;
        assumptions = {
          ...assumptions,
          nuisanceScale: stdDev(input.flatData.map((row) => Number(row[input.measureKey])).filter((value) => !Number.isNaN(value))) || 1,
          residualSd: stdDev(input.flatData.map((row) => Number(row[input.measureKey])).filter((value) => !Number.isNaN(value))) || 1,
          withinSubjectCorr: input.powerConfig.assumptions.withinSubjectCorr ?? 0.4,
          effectNotes: [`Observed ${input.powerConfig.targetEffect === "interaction" ? "interaction" : "time"} partial eta² = ${round(Number(block.partial_eta_sq ?? 0), 4)}.`],
        };
      }
      break;
    }
    case "ancova": {
      if (!input.covariateMeasureKey) {
        eligible = false;
        notes.push("Choose a covariate to plan ANCOVA power.");
        effectMetric = "f";
        effectValue = 0.25;
      } else {
        const observed = ancova(input.flatData, input.measureKey, input.groupingFactor, input.covariateMeasureKey);
        if ("error" in observed) {
          eligible = false;
          notes.push(String(observed.error));
          effectMetric = "f";
          effectValue = 0.25;
        } else {
          effectMetric = "f";
          effectValue = cohenFfromEta(Number(observed.partial_eta_sq ?? 0.06)) || 0.25;
          const covariateValues = input.flatData.map((row) => Number(row[input.covariateMeasureKey])).filter((value) => !Number.isNaN(value));
          assumptions = {
            ...assumptions,
            nuisanceScale: Number(observed.rmse ?? 1),
            residualSd: Number(observed.rmse ?? 1),
            predictorMean: covariateValues.length > 0 ? mean(covariateValues) : null,
            predictorSd: covariateValues.length > 1 ? stdDev(covariateValues) : null,
            effectNotes: [`Observed adjusted-factor partial eta² = ${round(Number(observed.partial_eta_sq ?? 0), 4)}.`],
          };
        }
      }
      break;
    }
    case "chi_square":
    case "fisher_exact": {
      const eventKey = input.eventMeasureKey || input.measureKey;
      if (!eventKey || !binaryKeys.includes(eventKey)) {
        eligible = false;
        notes.push("Choose a binary outcome field for 2×2 planning.");
      }
      const valuesFor = (group: string) =>
        input.flatData
          .filter((row) => getFactorValue(row, input.groupingFactor) === group)
          .map((row) => inferBinaryValue(row[eventKey], input.positiveClass));
      const p1 = eventRate(valuesFor(input.binaryGroupA || input.group1));
      const p2 = eventRate(valuesFor(input.binaryGroupB || input.group2));
      effectMetric = "event_rates";
      effectValue = { group1: p1 ?? 0.35, group2: p2 ?? 0.6 };
      assumptions = {
        ...assumptions,
        eventRates: { group1: p1 ?? 0.35, group2: p2 ?? 0.6 },
        classPrevalence: p1 != null && p2 != null ? (p1 + p2) / 2 : null,
        effectNotes: [`Observed event rates are ${round(p1 ?? 0.35, 4)} and ${round(p2 ?? 0.6, 4)}.`],
      };
      break;
    }
    case "pearson":
    case "spearman": {
      const pairs = input.flatData
        .map((row) => ({ x: Number(row[input.measureKey]), y: Number(row[input.measureKey2]) }))
        .filter((pair) => !Number.isNaN(pair.x) && !Number.isNaN(pair.y));
      if (pairs.length < 3) {
        eligible = false;
        notes.push("Need at least 3 paired observations for correlation planning.");
      }
      const xs = pairs.map((pair) => pair.x);
      const ys = pairs.map((pair) => pair.y);
      const observed = baseTest === "pearson" ? pearsonCorrelation(xs, ys) : spearmanCorrelation(xs, ys);
      effectMetric = "r";
      effectValue = Math.abs(Number("r" in observed ? observed.r : observed.rho)) || 0.3;
      assumptions = {
        ...assumptions,
        nuisanceScale: stdDev(ys) || 1,
        residualSd: stdDev(ys) || 1,
        predictorMean: xs.length > 0 ? mean(xs) : null,
        predictorSd: xs.length > 1 ? stdDev(xs) : null,
        effectNotes: [`Observed ${baseTest === "pearson" ? "r" : "rho"} = ${round(Number(effectValue), 4)}.`],
      };
      break;
    }
    case "log_rank": {
      if (!input.timeToEventMeasureKey || !input.eventMeasureKey) {
        eligible = false;
        notes.push("Choose time-to-event and event fields for survival planning.");
      }
      const selectedGroups = [input.group1, input.group2].filter(Boolean);
      const rows = input.flatData.filter((row) => selectedGroups.length === 0 || selectedGroups.includes(getFactorValue(row, input.groupingFactor)));
      const byGroup = new Map<string, { times: number[]; events: boolean[] }>();
      rows.forEach((row) => {
        const group = getFactorValue(row, input.groupingFactor);
        const time = Number(row[input.timeToEventMeasureKey]);
        const event = inferBinaryValue(row[input.eventMeasureKey], input.positiveClass);
        if (Number.isNaN(time) || event == null) return;
        const entry = byGroup.get(group) || { times: [], events: [] };
        entry.times.push(time);
        entry.events.push(event);
        byGroup.set(group, entry);
      });
      const availableGroups = Array.from(byGroup.keys()).sort();
      if (availableGroups.length < 2) {
        eligible = false;
        notes.push("Need at least 2 groups with valid survival data.");
      }
      const g1 = byGroup.get(availableGroups[0] || input.group1);
      const g2 = byGroup.get(availableGroups[1] || input.group2);
      const hazard1 = g1 ? g1.events.filter(Boolean).length / Math.max(g1.times.reduce((sum, value) => sum + value, 0), 1e-6) : 1;
      const hazard2 = g2 ? g2.events.filter(Boolean).length / Math.max(g2.times.reduce((sum, value) => sum + value, 0), 1e-6) : 1.35;
      effectMetric = "hazard_ratio";
      effectValue = hazard1 > 0 ? hazard2 / hazard1 : 1.35;
      assumptions = {
        ...assumptions,
        censoringRate:
          g1 && g2
            ? 1 - (g1.events.filter(Boolean).length + g2.events.filter(Boolean).length) / Math.max(g1.events.length + g2.events.length, 1)
            : 0.25,
        effectNotes: [`Observed hazard ratio ≈ ${round(Number(effectValue), 4)}.`],
      };
      break;
    }
    case "roc_curve": {
      const scoreKey = input.scoreMeasureKey || input.measureKey;
      const groupA = input.flatData
        .filter((row) => getFactorValue(row, input.groupingFactor) === (input.binaryGroupA || input.group1))
        .map((row) => Number(row[scoreKey]))
        .filter((value) => !Number.isNaN(value));
      const groupB = input.flatData
        .filter((row) => getFactorValue(row, input.groupingFactor) === (input.binaryGroupB || input.group2))
        .map((row) => Number(row[scoreKey]))
        .filter((value) => !Number.isNaN(value));
      if (groupA.length < 2 || groupB.length < 2) {
        eligible = false;
        notes.push("Need 2 score-bearing groups for ROC power planning.");
      }
      const observed = rocAucFromBinaryGroups(groupB, groupA);
      effectMetric = "auc";
      effectValue = Number(observed.auc) || 0.7;
      assumptions = {
        ...assumptions,
        nuisanceScale: stdDev([...groupA, ...groupB]) || 1,
        residualSd: stdDev([...groupA, ...groupB]) || 1,
        classPrevalence: groupA.length + groupB.length > 0 ? groupB.length / (groupA.length + groupB.length) : null,
        effectNotes: [`Observed AUC = ${round(Number(observed.auc), 4)}.`],
      };
      break;
    }
    case "nonlinear_regression":
    case "dose_response": {
      const family = baseTest === "dose_response" ? "logistic" : input.regressionModelFamily;
      const observed = fitNonlinearRegression(input.flatData, input.predictorMeasureKey, input.measureKey, family);
      if ("error" in observed) {
        eligible = false;
        notes.push(String(observed.error));
      }
      const predictorValues = input.flatData.map((row) => Number(row[input.predictorMeasureKey])).filter((value) => !Number.isNaN(value));
      const outcomeValues = input.flatData.map((row) => Number(row[input.measureKey])).filter((value) => !Number.isNaN(value));
      effectMetric = "r2";
      effectValue = "error" in observed ? 0.2 : Number(observed.r2) || 0.2;
      assumptions = {
        ...assumptions,
        nuisanceScale: stdDev(outcomeValues) || 1,
        residualSd: stdDev(outcomeValues) || 1,
        predictorMean: predictorValues.length > 0 ? mean(predictorValues) : null,
        predictorSd: predictorValues.length > 1 ? stdDev(predictorValues) : null,
        effectNotes: [`Observed model R² = ${round(Number(effectValue), 4)}.`],
      };
      break;
    }
  }

  const sampleMode = getDefaultSampleMode(baseTest);
  const observedSample: PowerPlannedSample = {
    mode: sampleMode,
    value:
      sampleMode === "per_cell"
        ? Math.max(2, Math.round(input.flatData.length / Math.max(factorALevels.length * factorBLevels.length, 1)))
        : sampleMode === "subjects_per_group"
          ? Math.max(2, Math.round(input.flatData.length / Math.max(betweenLevels.length, 1)))
          : sampleMode === "pairs_total"
            ? Math.max(2, Math.round(input.flatData.length / 2))
            : sampleMode === "per_group"
              ? Math.max(2, Math.round(input.flatData.length / Math.max(groups.length, 1)))
              : Math.max(4, input.flatData.length),
  };

  const context: SampleContext = {
    groups,
    factorALevels,
    factorBLevels,
    timepoints,
    betweenLevels,
  };

  return {
    eligible,
    notes,
    contrastOptions,
    contrast,
    effectMetric,
    effectValue,
    assumptions,
    observedSample,
    sampleContext: context,
  };
}

export function derivePowerPlannerContext(input: PowerPlannerInput): PowerPlannerContext {
  const derived = deriveObservedPowerState(input, input.powerConfig.baseTest);
  const baseTestOption = POWER_DESIGN_OPTIONS.find((option) => option.value === input.powerConfig.baseTest) || POWER_DESIGN_OPTIONS[0];
  return {
    baseTestOptions: POWER_DESIGN_OPTIONS,
    targetOptions: getPowerTargetOptions(input.powerConfig.baseTest),
    contrastOptions: derived.contrastOptions,
    effectMetricLabel: getPowerMetricLabel(derived.effectMetric),
    sampleModeLabel: getPowerSampleModeLabel(derived.observedSample.mode),
    observedEffectValue: derived.effectValue,
    observedAssumptions: derived.assumptions,
    observedPlannedSample: derived.observedSample,
    assumptionNotes: derived.assumptions.effectNotes.concat(derived.notes),
    defaultEngine: baseTestOption.defaultEngine,
    eligible: derived.eligible,
    eligibilityNotes: derived.notes,
  };
}

function normalizeSimulationMeta(input: PowerConfig) {
  return {
    iterations: Math.max(100, Math.round(input.simulationMeta.iterations || DEFAULT_SIMULATION_ITERATIONS)),
    seed: Math.round(input.simulationMeta.seed || DEFAULT_SIMULATION_SEED),
  };
}

function estimatePower(
  input: PowerPlannerInput,
  alpha: number,
  sampleValue: number,
  effectValue: number | { group1: number; group2: number },
  sampleContext: SampleContext,
  engine: PowerEngine,
  searchMode = false,
) {
  const simulationMeta = normalizeSimulationMeta(input.powerConfig);
  const effectiveEngine = engine === "auto"
    ? (ANALYTIC_POWER_TESTS.has(input.powerConfig.baseTest) ? "analytic" : "simulation")
    : engine;
  if (effectiveEngine === "analytic") {
    return {
      power: analyticPowerForSample(
        input.powerConfig.baseTest,
        input.powerConfig.effectMetric,
        effectValue,
        { ...input.powerConfig.plannedSample, value: sampleValue },
        alpha,
        sampleContext,
        input.powerConfig.assumptions,
      ),
      mcse: null,
      engine: effectiveEngine,
      iterations: null,
    };
  }
  const iterations = searchMode ? Math.max(120, Math.round(simulationMeta.iterations / 2)) : simulationMeta.iterations;
  const estimate = simulatePowerForSample(input, alpha, sampleValue, effectValue, iterations, simulationMeta.seed);
  return {
    power: estimate.power,
    mcse: round(estimate.mcse, 6),
    engine: effectiveEngine,
    iterations,
  };
}

function solveSampleSize(input: PowerPlannerInput, alpha: number, targetPower: number, effectValue: number | { group1: number; group2: number }, sampleContext: SampleContext) {
  const analyticMagnitude = effectMagnitude(input.powerConfig.effectMetric, effectValue);
  const guess =
    analyticMagnitude <= 0
      ? 12
      : Math.max(
          4,
          Math.ceil(
            ((baseCriticalZ(alpha) + approxNormInv(clamp(targetPower, 0.5, 0.999))) ** 2) /
              Math.max(analyticMagnitude ** 2, 1e-6),
          ),
        );
  let low = 2;
  let high = Math.max(guess, 4);
  let estimate = estimatePower(input, alpha, high, effectValue, sampleContext, input.powerConfig.engine, true);
  while (estimate.power < targetPower && high < 2000) {
    low = high;
    high *= 2;
    estimate = estimatePower(input, alpha, high, effectValue, sampleContext, input.powerConfig.engine, true);
  }
  for (let iteration = 0; iteration < 18; iteration++) {
    const mid = Math.max(2, Math.floor((low + high) / 2));
    const midEstimate = estimatePower(input, alpha, mid, effectValue, sampleContext, input.powerConfig.engine, true);
    if (midEstimate.power >= targetPower) high = mid;
    else low = mid + 1;
    if (low >= high) break;
  }
  return estimatePower(input, alpha, high, effectValue, sampleContext, input.powerConfig.engine);
}

function solveMde(input: PowerPlannerInput, alpha: number, targetPower: number, sampleValue: number, sampleContext: SampleContext) {
  const metric = input.powerConfig.effectMetric;
  const isRates = metric === "event_rates";
  let low = metric === "hazard_ratio" ? 1.0001 : metric === "auc" ? 0.5001 : metric === "r2" ? 0.0001 : 0.0001;
  let high = metric === "hazard_ratio" ? 2.5 : metric === "auc" ? 0.95 : metric === "r2" ? 0.8 : metric === "r" ? 0.95 : 2.5;
  if (isRates) {
    low = 0.01;
    high = 0.6;
  }

  const toEffectValue = (candidate: number): number | { group1: number; group2: number } => {
    if (metric === "event_rates") {
      const base = input.powerConfig.assumptions.eventRates?.group1 ?? 0.35;
      return {
        group1: clamp(base, 0.01, 0.99),
        group2: clamp(base + candidate, 0.01, 0.99),
      };
    }
    return candidate;
  };

  for (let iteration = 0; iteration < 24; iteration++) {
    const mid = (low + high) / 2;
    const estimate = estimatePower(input, alpha, sampleValue, toEffectValue(mid), sampleContext, input.powerConfig.engine, true);
    if (estimate.power >= targetPower) high = mid;
    else low = mid;
  }
  return toEffectValue(high);
}

function plannedSampleSummary(baseTest: PowerBaseTest, sampleValue: number, sampleContext: SampleContext) {
  switch (getDefaultSampleMode(baseTest)) {
    case "per_cell":
      return {
        recommended_n_per_cell: sampleValue,
        recommended_total_n: sampleValue * Math.max(sampleContext.factorALevels.length, 2) * Math.max(sampleContext.factorBLevels.length, 2),
      };
    case "subjects_per_group":
      return {
        recommended_n_per_group: sampleValue,
        recommended_total_n: sampleValue * Math.max(sampleContext.betweenLevels.length, 1),
      };
    case "pairs_total":
      return {
        recommended_total_n: sampleValue,
      };
    case "subjects_total":
    case "total":
      return {
        recommended_total_n: sampleValue,
      };
    case "per_group":
    default:
      return {
        recommended_n_per_group: sampleValue,
        recommended_total_n: sampleValue * Math.max(sampleContext.groups.length, 2),
      };
  }
}

function formatAssumedEffect(metric: PowerEffectMetric, effectValue: number | { group1: number; group2: number }) {
  if (metric === "event_rates" && typeof effectValue !== "number") {
    return {
      group1: round(effectValue.group1, 4),
      group2: round(effectValue.group2, 4),
    };
  }
  return round(Number(effectValue), 4);
}

function getMeasureLabel(input: PowerPlannerInput, baseTest: PowerBaseTest) {
  const labels = input.measureLabels || {};
  switch (baseTest) {
    case "pearson":
    case "spearman":
      return `${labels[input.measureKey] || input.measureKey} vs ${labels[input.measureKey2] || input.measureKey2}`;
    case "log_rank":
      return `${labels[input.timeToEventMeasureKey] || input.timeToEventMeasureKey} with ${labels[input.eventMeasureKey] || input.eventMeasureKey}`;
    case "roc_curve":
      return labels[input.scoreMeasureKey || input.measureKey] || input.scoreMeasureKey || input.measureKey;
    case "nonlinear_regression":
    case "dose_response":
      return `${labels[input.predictorMeasureKey] || input.predictorMeasureKey} → ${labels[input.measureKey] || input.measureKey}`;
    case "chi_square":
    case "fisher_exact":
      return labels[input.eventMeasureKey || input.measureKey] || input.eventMeasureKey || input.measureKey;
    default:
      return labels[input.measureKey] || input.measureKey;
  }
}

export function runPowerAnalysis(input: PowerPlannerInput): Record<string, unknown> | { error: string } {
  const derived = deriveObservedPowerState(input, input.powerConfig.baseTest);
  if (!derived.eligible) {
    return { error: derived.notes[0] || "The selected analysis set does not support this power-planning design yet." };
  }

  const baseTestOption = POWER_DESIGN_OPTIONS.find((option) => option.value === input.powerConfig.baseTest) || POWER_DESIGN_OPTIONS[0];
  const alpha = effectiveAlpha(
    input.alpha,
    input.powerConfig.baseTest,
    input.pAdjustMethod,
    Math.max(derived.contrastOptions.length, 1),
  );
  const targetPower = clamp(input.targetPower, 0.5, 0.999);
  const effectValue = input.powerConfig.effectMetric === derived.effectMetric
    ? input.powerConfig.effectValue
    : derived.effectValue;
  const metric = input.powerConfig.effectMetric;
  const effectForRun = metric === "event_rates" && typeof effectValue === "number"
    ? derived.effectValue
    : effectValue;
  const assumedEffect = formatAssumedEffect(metric, effectForRun);
  const contrast = derived.contrast;
  const plannedSampleValue = Math.max(2, Math.round(input.powerConfig.plannedSample.value || derived.observedSample.value || 2));
  const engine = input.powerConfig.engine === "auto" ? baseTestOption.defaultEngine : input.powerConfig.engine;

  if (input.powerConfig.objective === "sample_size") {
    const solved = solveSampleSize(input, alpha, targetPower, effectForRun, derived.sampleContext);
    const analyticMagnitude = effectMagnitude(metric, effectForRun);
    const initialGuess =
      analyticMagnitude <= 0
        ? 12
        : Math.max(
            4,
            Math.ceil(
              ((baseCriticalZ(alpha) + approxNormInv(targetPower)) ** 2) /
                Math.max(analyticMagnitude ** 2, 1e-6),
            ),
          );
    let recommended = Math.max(initialGuess, 4);
    let low = 2;
    let high = recommended;
    const searchEstimate = estimatePower(input, alpha, high, effectForRun, derived.sampleContext, input.powerConfig.engine, true);
    if (searchEstimate.power < targetPower) {
      while (high < 2000) {
        high *= 2;
        const expanded = estimatePower(input, alpha, high, effectForRun, derived.sampleContext, input.powerConfig.engine, true);
        if (expanded.power >= targetPower) break;
      }
    }
    for (let iteration = 0; iteration < 18; iteration++) {
      const mid = Math.max(2, Math.floor((low + high) / 2));
      const midEstimate = estimatePower(input, alpha, mid, effectForRun, derived.sampleContext, input.powerConfig.engine, true);
      if (midEstimate.power >= targetPower) high = mid;
      else low = mid + 1;
      if (low >= high) break;
    }
    recommended = high;
    return {
      test: `Power Planning (${baseTestOption.label})`,
      measure: getMeasureLabel(input, input.powerConfig.baseTest),
      grouped_by: getFactorLabel(input.groupingFactor),
      included_animals: input.includedCount ?? input.flatData.length,
      excluded_animals: input.excludedCount ?? 0,
      base_test: input.powerConfig.baseTest,
      objective: input.powerConfig.objective,
      target_effect: input.powerConfig.targetEffect,
      effect_metric: metric,
      assumed_effect: assumedEffect,
      alpha: round(alpha, 4),
      target_power: round(targetPower, 4),
      ...plannedSampleSummary(input.powerConfig.baseTest, recommended, derived.sampleContext),
      planned_n: plannedSampleValue,
      achieved_power: round(solved.power, 4),
      engine,
      iterations: solved.iterations,
      mcse: solved.mcse,
      contrast: contrast?.label,
      assumption_notes: derived.assumptions.effectNotes.concat(derived.notes),
      observed_reference_effect: formatAssumedEffect(derived.effectMetric, derived.effectValue),
      sample_mode: getDefaultSampleMode(input.powerConfig.baseTest),
    };
  }

  if (input.powerConfig.objective === "achieved_power") {
    const estimate = estimatePower(input, alpha, plannedSampleValue, effectForRun, derived.sampleContext, input.powerConfig.engine);
    return {
      test: `Power Planning (${baseTestOption.label})`,
      measure: getMeasureLabel(input, input.powerConfig.baseTest),
      grouped_by: getFactorLabel(input.groupingFactor),
      included_animals: input.includedCount ?? input.flatData.length,
      excluded_animals: input.excludedCount ?? 0,
      base_test: input.powerConfig.baseTest,
      objective: input.powerConfig.objective,
      target_effect: input.powerConfig.targetEffect,
      effect_metric: metric,
      assumed_effect: assumedEffect,
      alpha: round(alpha, 4),
      target_power: round(targetPower, 4),
      planned_n: plannedSampleValue,
      planned_total_n: sampleValueToTotal(input.powerConfig.baseTest, { ...input.powerConfig.plannedSample, value: plannedSampleValue }, derived.sampleContext),
      achieved_power: round(estimate.power, 4),
      engine,
      iterations: estimate.iterations,
      mcse: estimate.mcse,
      contrast: contrast?.label,
      assumption_notes: derived.assumptions.effectNotes.concat(derived.notes),
      observed_reference_effect: formatAssumedEffect(derived.effectMetric, derived.effectValue),
      sample_mode: getDefaultSampleMode(input.powerConfig.baseTest),
    };
  }

  const mdeValue = solveMde(input, alpha, targetPower, plannedSampleValue, derived.sampleContext);
  const mdeEstimate = estimatePower(input, alpha, plannedSampleValue, mdeValue, derived.sampleContext, input.powerConfig.engine);
  return {
    test: `Power Planning (${baseTestOption.label})`,
    measure: getMeasureLabel(input, input.powerConfig.baseTest),
    grouped_by: getFactorLabel(input.groupingFactor),
    included_animals: input.includedCount ?? input.flatData.length,
    excluded_animals: input.excludedCount ?? 0,
    base_test: input.powerConfig.baseTest,
    objective: input.powerConfig.objective,
    target_effect: input.powerConfig.targetEffect,
    effect_metric: metric,
    assumed_effect: assumedEffect,
    alpha: round(alpha, 4),
    target_power: round(targetPower, 4),
    planned_n: plannedSampleValue,
    planned_total_n: sampleValueToTotal(input.powerConfig.baseTest, { ...input.powerConfig.plannedSample, value: plannedSampleValue }, derived.sampleContext),
    achieved_power: round(mdeEstimate.power, 4),
    mde: metric === "event_rates" && typeof mdeValue !== "number"
      ? round(Math.abs(mdeValue.group2 - mdeValue.group1), 4)
      : round(Number(mdeValue), 4),
    mde_effect: formatAssumedEffect(metric, mdeValue),
    engine,
    iterations: mdeEstimate.iterations,
    mcse: mdeEstimate.mcse,
    contrast: contrast?.label,
    assumption_notes: derived.assumptions.effectNotes.concat(derived.notes),
    observed_reference_effect: formatAssumedEffect(derived.effectMetric, derived.effectValue),
    sample_mode: getDefaultSampleMode(input.powerConfig.baseTest),
  };
}
