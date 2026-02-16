import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as ss from "simple-statistics";

// ─── Statistical tests (all run in the browser-friendly simple-statistics) ───

function descriptive(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: ss.mean(values),
    median: ss.median(sorted),
    std: ss.standardDeviation(values),
    sem: ss.standardDeviation(values) / Math.sqrt(values.length),
    min: ss.min(values),
    max: ss.max(values),
    q1: ss.quantile(sorted, 0.25),
    q3: ss.quantile(sorted, 0.75),
    iqr: ss.interquartileRange(sorted),
    skewness: ss.sampleSkewness(values),
  };
}

function tTest(group1: number[], group2: number[]) {
  const m1 = ss.mean(group1);
  const m2 = ss.mean(group2);
  const s1 = ss.variance(group1);
  const s2 = ss.variance(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  const se = Math.sqrt(s1 / n1 + s2 / n2);
  const t = (m1 - m2) / se;

  // Welch's degrees of freedom
  const df =
    Math.pow(s1 / n1 + s2 / n2, 2) /
    (Math.pow(s1 / n1, 2) / (n1 - 1) + Math.pow(s2 / n2, 2) / (n2 - 1));

  // Cohen's d
  const pooledSD = Math.sqrt(
    ((n1 - 1) * s1 + (n2 - 1) * s2) / (n1 + n2 - 2)
  );
  const cohensD = (m1 - m2) / pooledSD;

  // Approximate p-value using normal distribution for large samples
  const p = 2 * (1 - approxNormCDF(Math.abs(t)));

  return {
    test: "Welch's t-test (two-tailed)",
    t_statistic: round(t),
    degrees_of_freedom: round(df),
    p_value: round(p, 6),
    significant_005: p < 0.05,
    significant_001: p < 0.01,
    effect_size_cohens_d: round(cohensD),
    group1_stats: { n: n1, mean: round(m1), std: round(Math.sqrt(s1)) },
    group2_stats: { n: n2, mean: round(m2), std: round(Math.sqrt(s2)) },
    mean_difference: round(m1 - m2),
  };
}

function anova(groups: number[][]) {
  const allValues = groups.flat();
  const grandMean = ss.mean(allValues);
  const k = groups.length;
  const N = allValues.length;

  let ssBetween = 0;
  let ssWithin = 0;

  for (const group of groups) {
    const groupMean = ss.mean(group);
    ssBetween += group.length * Math.pow(groupMean - grandMean, 2);
    for (const val of group) {
      ssWithin += Math.pow(val - groupMean, 2);
    }
  }

  const dfBetween = k - 1;
  const dfWithin = N - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const F = msBetween / msWithin;

  // Eta-squared effect size
  const etaSq = ssBetween / (ssBetween + ssWithin);

  // Approximate p-value
  const p = 1 - approxFCDF(F, dfBetween, dfWithin);

  return {
    test: "One-way ANOVA",
    f_statistic: round(F),
    df_between: dfBetween,
    df_within: dfWithin,
    p_value: round(p, 6),
    significant_005: p < 0.05,
    significant_001: p < 0.01,
    effect_size_eta_squared: round(etaSq),
    ss_between: round(ssBetween),
    ss_within: round(ssWithin),
    group_stats: groups.map((g, i) => ({
      group: i + 1,
      n: g.length,
      mean: round(ss.mean(g)),
      std: round(ss.standardDeviation(g)),
    })),
  };
}

function mannWhitney(group1: number[], group2: number[]) {
  const n1 = group1.length;
  const n2 = group2.length;

  // Combine and rank
  const combined = [
    ...group1.map((v) => ({ v, g: 1 })),
    ...group2.map((v) => ({ v, g: 2 })),
  ].sort((a, b) => a.v - b.v);

  // Assign ranks (handle ties)
  const ranks: number[] = [];
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[k] = avgRank;
    i = j;
  }

  let R1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].g === 1) R1 += ranks[k];
  }

  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (U - mu) / sigma;
  const p = 2 * (1 - approxNormCDF(Math.abs(z)));

  // Effect size r
  const r = Math.abs(z) / Math.sqrt(n1 + n2);

  return {
    test: "Mann-Whitney U test",
    U_statistic: round(U),
    z_score: round(z),
    p_value: round(p, 6),
    significant_005: p < 0.05,
    effect_size_r: round(r),
    group1_n: n1,
    group2_n: n2,
    group1_median: round(ss.median(group1)),
    group2_median: round(ss.median(group2)),
  };
}

function chiSquare(observed: number[][]) {
  const rows = observed.length;
  const cols = observed[0].length;
  const rowTotals = observed.map((r) => r.reduce((a, b) => a + b, 0));
  const colTotals = Array.from({ length: cols }, (_, c) =>
    observed.reduce((a, r) => a + r[c], 0)
  );
  const total = rowTotals.reduce((a, b) => a + b, 0);

  let chi2 = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const expected = (rowTotals[r] * colTotals[c]) / total;
      chi2 += Math.pow(observed[r][c] - expected, 2) / expected;
    }
  }

  const df = (rows - 1) * (cols - 1);
  const p = 1 - approxChiCDF(chi2, df);
  const cramersV = Math.sqrt(chi2 / (total * Math.min(rows - 1, cols - 1)));

  return {
    test: "Chi-squared test",
    chi2_statistic: round(chi2),
    degrees_of_freedom: df,
    p_value: round(p, 6),
    significant_005: p < 0.05,
    effect_size_cramers_v: round(cramersV),
    n: total,
  };
}

function correlation(x: number[], y: number[]) {
  const r = ss.sampleCorrelation(x, y);
  const n = x.length;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - approxNormCDF(Math.abs(t)));

  const reg = ss.linearRegression(x.map((xi, i) => [xi, y[i]]));
  const rSquared = r * r;

  return {
    test: "Pearson correlation",
    r: round(r),
    r_squared: round(rSquared),
    p_value: round(p, 6),
    significant_005: p < 0.05,
    n,
    slope: round(reg.m),
    intercept: round(reg.b),
    interpretation:
      Math.abs(r) < 0.3
        ? "weak"
        : Math.abs(r) < 0.7
        ? "moderate"
        : "strong",
  };
}

// ─── Approximation helpers ───────────────────────────────────────────────────

function approxNormCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1.0 + sign * y);
}

function approxFCDF(f: number, d1: number, d2: number): number {
  // Using approximation via normal distribution for large df
  const x = (f * d1) / (f * d1 + d2);
  return regularizedBeta(x, d1 / 2, d2 / 2);
}

function approxChiCDF(x: number, k: number): number {
  // Wilson-Hilferty approximation
  const z = Math.pow(x / k, 1 / 3) - (1 - 2 / (9 * k));
  const denom = Math.sqrt(2 / (9 * k));
  return approxNormCDF(z / denom);
}

function regularizedBeta(x: number, a: number, b: number): number {
  // Simple continued fraction approximation
  if (x === 0 || x === 1) return x;
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

    numerator =
      -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + numerator / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }

  const lnBeta =
    lgamma(a) + lgamma(b) - lgamma(a + b);
  const prefix = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  return prefix * result;
}

function lgamma(x: number): number {
  // Stirling's approximation
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += c[j] / ++y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function round(n: number, decimals = 4): number {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { test_type, data: inputData, config } = body;

    let results: Record<string, unknown> = {};

    switch (test_type) {
      case "descriptive": {
        const values = (inputData.values as number[]).filter(
          (v) => v !== null && v !== undefined && !isNaN(v)
        );
        if (values.length < 2)
          return NextResponse.json(
            { error: "Need at least 2 values" },
            { status: 400 }
          );
        results = descriptive(values);
        // Normality check (simplified)
        const skew = (results as { skewness: number }).skewness;
        (results as Record<string, unknown>).normality_warning =
          Math.abs(skew) > 2
            ? "Data appears highly skewed — consider non-parametric tests"
            : Math.abs(skew) > 1
            ? "Data is moderately skewed"
            : "Data appears approximately normal";
        break;
      }

      case "t_test": {
        const g1 = (inputData.group1 as number[]).filter(
          (v) => !isNaN(v)
        );
        const g2 = (inputData.group2 as number[]).filter(
          (v) => !isNaN(v)
        );
        if (g1.length < 2 || g2.length < 2)
          return NextResponse.json(
            { error: "Each group needs at least 2 values" },
            { status: 400 }
          );
        results = tTest(g1, g2);
        // Sample size warning
        if (g1.length < 10 || g2.length < 10) {
          (results as Record<string, unknown>).sample_size_warning =
            "Small sample sizes (n < 10) — interpret with caution";
        }
        break;
      }

      case "anova": {
        const groups = (inputData.groups as number[][]).map((g) =>
          g.filter((v) => !isNaN(v))
        );
        if (groups.length < 2)
          return NextResponse.json(
            { error: "Need at least 2 groups" },
            { status: 400 }
          );
        if (groups.some((g) => g.length < 2))
          return NextResponse.json(
            { error: "Each group needs at least 2 values" },
            { status: 400 }
          );
        results = anova(groups);
        break;
      }

      case "mann_whitney": {
        const g1 = (inputData.group1 as number[]).filter(
          (v) => !isNaN(v)
        );
        const g2 = (inputData.group2 as number[]).filter(
          (v) => !isNaN(v)
        );
        if (g1.length < 2 || g2.length < 2)
          return NextResponse.json(
            { error: "Each group needs at least 2 values" },
            { status: 400 }
          );
        results = mannWhitney(g1, g2);
        break;
      }

      case "chi_square": {
        const observed = inputData.observed as number[][];
        if (!observed || observed.length < 2 || observed[0].length < 2)
          return NextResponse.json(
            { error: "Need at least a 2x2 contingency table" },
            { status: 400 }
          );
        results = chiSquare(observed);
        break;
      }

      case "correlation": {
        const x = (inputData.x as number[]).filter((v) => !isNaN(v));
        const y = (inputData.y as number[]).filter((v) => !isNaN(v));
        const n = Math.min(x.length, y.length);
        if (n < 3)
          return NextResponse.json(
            { error: "Need at least 3 paired values" },
            { status: 400 }
          );
        results = correlation(x.slice(0, n), y.slice(0, n));
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown test: ${test_type}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      test_type,
      config,
      results,
    });
  } catch (err: unknown) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

