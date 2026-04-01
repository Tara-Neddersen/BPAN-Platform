import type {
  AnalysisDiagnosticEntry,
  AnalysisReportPayload,
  ColonyAnalysisStatsDraft,
  ColonyAnalysisVisualizationDraft,
  FigurePacket,
  MultiEndpointResultSummary,
  StructuredResultTable,
} from "@/lib/colony-analysis/types";
import { deriveSignificanceAnnotationsFromResult, getFigureSignificanceSource } from "@/lib/colony-analysis/visualization";

function round(n: number, d = 4): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function formatNum(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "n/a";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(d);
}

export function formatPValueForReport(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  if (value < 0.001) return "p < 0.001";
  return `p = ${value.toFixed(4)}`;
}

export function summarizeAnalysisResult(result: Record<string, unknown> | null, included: number, excluded: number) {
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
  if (typeof result.auc === "number") pieces.push(`AUC = ${formatNum(Number(result.auc), 4)}`);
  if (typeof result.chi2 === "number") pieces.push(`χ² = ${formatNum(Number(result.chi2), 4)}`);
  if (typeof result.log_rank_chi2 === "number") pieces.push(`Log-rank χ² = ${formatNum(Number(result.log_rank_chi2), 4)}`);
  if (typeof result.suggested_n_per_group === "number") pieces.push(`Suggested n/group = ${String(result.suggested_n_per_group)}`);
  if (typeof result.r2 === "number") pieces.push(`R² = ${formatNum(Number(result.r2), 4)}`);
  return pieces.join(" | ");
}

export function getFigureGroupingLabel(groupBy: ColonyAnalysisVisualizationDraft["groupBy"]) {
  switch (groupBy) {
    case "sex":
      return "Sex";
    case "genotype":
      return "Genotype";
    case "cohort":
      return "Cohort";
    case "group":
    default:
      return "Genotype × Sex";
  }
}

function buildDiagnostics(result: Record<string, unknown>): AnalysisDiagnosticEntry[] {
  const diagnostics: AnalysisDiagnosticEntry[] = [];
  if (Array.isArray(result.assumption_checks)) {
    diagnostics.push(
      ...(result.assumption_checks as Array<Record<string, unknown>>)
        .filter((check) => check && typeof check === "object" && (check.status === "warn" || check.status === "info"))
        .map((check) => {
          const level: AnalysisDiagnosticEntry["level"] = check.status === "warn" ? "warn" : "info";
          return {
            level,
            source: String(check.name || "assumption"),
            message: String(check.message || check.name || "Diagnostic note"),
          };
        }),
    );
  }
  if (result.warning) {
    diagnostics.unshift({ level: "warn", source: "result", message: String(result.warning) });
  }
  return diagnostics;
}

function tableFromRows(
  id: string,
  title: string,
  rows: Array<Record<string, unknown>>,
  preferredColumns?: string[],
  description?: string,
): StructuredResultTable | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const columns = preferredColumns && preferredColumns.length > 0
    ? preferredColumns.filter((column) => rows.some((row) => row[column] !== undefined))
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (columns.length === 0) return null;
  return { id, title, description, columns, rows };
}

export function buildStructuredResultTables(result: Record<string, unknown>): StructuredResultTable[] {
  const tables: StructuredResultTable[] = [];

  const push = (table: StructuredResultTable | null) => {
    if (table) tables.push(table);
  };

  if (Array.isArray(result.group_stats)) {
    push(
      tableFromRows(
        "group-stats",
        "Group Statistics",
        result.group_stats as Array<Record<string, unknown>>,
        ["group", "name", "n", "mean", "sd", "sem", "median", "min", "max"],
      ),
    );
  }

  if (Array.isArray(result.anova_table)) {
    push(
      tableFromRows(
        "anova-table",
        "ANOVA Table",
        result.anova_table as Array<Record<string, unknown>>,
        ["source", "ss", "df", "ms", "F", "p", "partial_eta_sq"],
      ),
    );
  }

  if (Array.isArray(result.comparisons)) {
    push(
      tableFromRows(
        "pairwise-comparisons",
        "Pairwise / Post-hoc Comparisons",
        result.comparisons as Array<Record<string, unknown>>,
        ["comparison", "statistic_label", "statistic", "df", "p", "adjusted_p", "effect_label", "effect_size", "significant"],
        result.posthoc_label ? String(result.posthoc_label) : undefined,
      ),
    );
  }

  if (Array.isArray(result.cell_counts)) {
    push(
      tableFromRows(
        "cell-counts",
        "Two-way Cell Counts",
        result.cell_counts as Array<Record<string, unknown>>,
        ["levelA", "levelB", "n"],
      ),
    );
  }

  if (Array.isArray(result.threshold_table)) {
    push(
      tableFromRows(
        "roc-thresholds",
        "ROC Threshold Table",
        result.threshold_table as Array<Record<string, unknown>>,
        ["threshold", "sensitivity", "specificity", "false_positive_rate", "youden_j", "tp", "fp", "tn", "fn"],
      ),
    );
  }

  if (Array.isArray(result.observed_expected)) {
    push(
      tableFromRows(
        "survival-observed-expected",
        "Log-rank Observed vs Expected",
        result.observed_expected as Array<Record<string, unknown>>,
        ["group", "observed", "expected", "variance"],
      ),
    );
  }

  if (Array.isArray(result.contingency_table)) {
    push(
      tableFromRows(
        "contingency",
        "Contingency Table",
        result.contingency_table as Array<Record<string, unknown>>,
        ["group", "positive", "negative"],
      ),
    );
  }

  if (Array.isArray(result.survival_curves)) {
    const summaryRows = (result.survival_curves as Array<Record<string, unknown>>).map((curve) => ({
      group: curve.group,
      n: curve.n,
      events: curve.events,
      censored: curve.censored,
      median_survival: curve.median_survival,
    }));
    push(tableFromRows("survival-summary", "Kaplan-Meier Summary", summaryRows, ["group", "n", "events", "censored", "median_survival"]));
  }

  if (result.coefficients && typeof result.coefficients === "object") {
    push(
      tableFromRows(
        "model-coefficients",
        "Model Coefficients",
        Object.entries(result.coefficients as Record<string, unknown>).map(([term, value]) => ({
          term,
          value: typeof value === "number" ? round(value) : value,
        })),
        ["term", "value"],
      ),
    );
  }

  if (typeof result.r2 === "number" || typeof result.rmse === "number" || typeof result.auc === "number") {
    push(
      tableFromRows(
        "fit-quality",
        "Model / Diagnostic Summary",
        [{
          model: String(result.test || "Analysis"),
          r2: result.r2,
          rmse: result.rmse,
          auc: result.auc,
          p: result.p,
          suggested_n_per_group: result.suggested_n_per_group,
        }],
        ["model", "r2", "rmse", "auc", "p", "suggested_n_per_group"],
      ),
    );
  }

  if (Array.isArray(result.roc_points)) {
    push(
      tableFromRows(
        "roc-points",
        "ROC Curve Points",
        result.roc_points as Array<Record<string, unknown>>,
        ["threshold", "fpr", "tpr"],
      ),
    );
  }

  if (Array.isArray(result.fitted_points)) {
    push(
      tableFromRows(
        "fitted-points",
        "Fitted Curve Points",
        result.fitted_points as Array<Record<string, unknown>>,
        ["x", "y"],
      ),
    );
  }

  return tables;
}

function getRecommendedChartType(result: Record<string, unknown>, draft: ColonyAnalysisVisualizationDraft): FigurePacket["figureMetadata"]["recommendedChartType"] {
  if (Array.isArray(result.survival_curves) && result.survival_curves.length > 0) return "survival_curve";
  if (Array.isArray(result.roc_points) && result.roc_points.length > 0) return "roc_curve";
  if (Array.isArray(result.fitted_points) && result.fitted_points.length > 0) return "regression_fit";
  if (result.model_kind === "repeated_measures_anova" || result.model_kind === "mixed_effects") return "timepoint_line";
  if (String(result.test || "").toLowerCase().includes("paired")) return "paired_slope";
  return draft.chartType;
}

function getResultFamily(result: Record<string, unknown>) {
  if (Array.isArray(result.survival_curves) && result.survival_curves.length > 0) return "survival";
  if (Array.isArray(result.roc_points) && result.roc_points.length > 0) return "roc";
  if (Array.isArray(result.fitted_points) && result.fitted_points.length > 0) return "regression";
  if (Array.isArray(result.anova_table) && result.anova_table.length > 0) return "anova";
  if (Array.isArray(result.comparisons) && result.comparisons.length > 0) return "posthoc";
  return "general";
}

export function buildFigurePacket(
  reportPayload: Pick<AnalysisReportPayload, "figureMetadata" | "reportCaption" | "reportSummary" | "reportResultsText" | "reportWarnings">,
): FigurePacket {
  return {
    figureMetadata: reportPayload.figureMetadata,
    caption: reportPayload.reportCaption,
    linkedSummary: reportPayload.reportSummary,
    linkedResultsText: reportPayload.reportResultsText,
    warnings: reportPayload.reportWarnings,
  };
}

export function renderAnalysisReportMarkdown(args: {
  analysisName: string;
  reportPayload: AnalysisReportPayload;
  exclusions: Array<{ animalId: string; reason: string }>;
}) {
  const { analysisName, reportPayload, exclusions } = args;
  const tableSections = reportPayload.resultTables
    .map((table) => {
      const headers = table.columns.join(" | ");
      const separator = table.columns.map(() => "---").join(" | ");
      const rows = table.rows
        .map((row) => table.columns.map((column) => String(row[column] ?? "—")).join(" | "))
        .join("\n");
      return [`## ${table.title}`, table.description || "", `| ${headers} |`, `| ${separator} |`, rows].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [
    `# ${analysisName}`,
    "",
    "## Summary",
    reportPayload.reportSummary,
    "",
    "## Methods",
    reportPayload.reportMethodsText,
    "",
    "## Results",
    reportPayload.reportResultsText,
    "",
    "## Figure Caption",
    reportPayload.reportCaption,
    "",
    "## Warnings",
    reportPayload.reportWarnings.length > 0 ? reportPayload.reportWarnings.map((warning) => `- ${warning}`).join("\n") : "- None",
    "",
    "## Exclusions",
    exclusions.length > 0 ? exclusions.map((entry) => `- ${entry.animalId}: ${entry.reason || "No reason provided"}`).join("\n") : "- None",
    "",
    "## Structured Result Tables",
    tableSections || "No structured result tables were generated for this revision.",
  ].join("\n");
}

export function generateAnalysisReport(params: {
  result: Record<string, unknown> | null;
  statsDraft: ColonyAnalysisStatsDraft;
  visualizationDraft: ColonyAnalysisVisualizationDraft;
  measureLabels: Record<string, string>;
  includedCount: number;
  excludedCount: number;
  analysisName: string;
  exclusions: Array<{ animalId: string; reason: string }>;
}): AnalysisReportPayload | null {
  const { result, statsDraft, visualizationDraft, measureLabels, includedCount, excludedCount } = params;
  if (!result) return null;

  const measure = String(result.measure || measureLabels[statsDraft.measureKey] || statsDraft.measureKey || "selected measure");
  const groupedBy = String(result.grouped_by || result.factor_a || result.subject_factor || "current analysis grouping");
  const diagnostics = buildDiagnostics(result);
  const warnings = diagnostics.filter((entry) => entry.level === "warn" || entry.level === "info").map((entry) => entry.message);
  const comparisons = Array.isArray(result.comparisons) ? (result.comparisons as Array<Record<string, unknown>>) : [];
  const significantComparisons = comparisons.filter((comparison) => Boolean(comparison.significant)).length;
  const posthocSummary =
    comparisons.length > 0
      ? ` Post-hoc analysis (${String(result.posthoc_label || "pairwise comparisons")}) identified ${significantComparisons} significant comparison${significantComparisons === 1 ? "" : "s"}.`
      : "";

  let resultsSentence = `${String(result.test || "Analysis")} on ${measure} used ${includedCount} included animals`;
  if (excludedCount > 0) resultsSentence += ` with ${excludedCount} excluded from this revision`;
  resultsSentence += ".";

  if (typeof result.F === "number") {
    const dfBits = [];
    if (typeof result.dfBetween === "number") dfBits.push(result.dfBetween);
    if (typeof result.dfWithin === "number") dfBits.push(result.dfWithin);
    if (typeof result.df_time === "number") dfBits.push(result.df_time);
    if (typeof result.df_error === "number") dfBits.push(result.df_error);
    const dfText = dfBits.length >= 2 ? `F(${dfBits[0]}, ${dfBits[1]}) = ${formatNum(Number(result.F), 3)}` : `F = ${formatNum(Number(result.F), 3)}`;
    resultsSentence += ` ${dfText}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.t === "number") {
    const dfText = typeof result.df === "number" ? `t(${result.df}) = ${formatNum(Number(result.t), 3)}` : `t = ${formatNum(Number(result.t), 3)}`;
    resultsSentence += ` ${dfText}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.H === "number") {
    resultsSentence += ` H(${String(result.df ?? "n/a")}) = ${formatNum(Number(result.H), 3)}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.r === "number" || typeof result.rho === "number") {
    const label = typeof result.r === "number" ? "r" : "rho";
    const value = typeof result.r === "number" ? Number(result.r) : Number(result.rho);
    resultsSentence += ` ${label} = ${formatNum(value, 3)}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.auc === "number") {
    resultsSentence += ` AUC = ${formatNum(Number(result.auc), 3)}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.chi2 === "number") {
    resultsSentence += ` χ²(${String(result.df ?? "n/a")}) = ${formatNum(Number(result.chi2), 3)}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.log_rank_chi2 === "number") {
    resultsSentence += ` Log-rank χ²(${String(result.df ?? "n/a")}) = ${formatNum(Number(result.log_rank_chi2), 3)}, ${formatPValueForReport(result.p)}.`;
  } else if (typeof result.r2 === "number" && typeof result.rmse === "number") {
    resultsSentence += ` Model fit achieved R² = ${formatNum(Number(result.r2), 3)} with RMSE = ${formatNum(Number(result.rmse), 3)}.`;
  } else if (typeof result.suggested_n_per_group === "number") {
    resultsSentence += ` Estimated sample size is ${String(result.suggested_n_per_group)} animals per group at α = ${formatNum(Number(result.alpha ?? statsDraft.alpha), 3)} and power = ${formatNum(Number(result.target_power ?? statsDraft.targetPower), 2)}.`;
  } else if (typeof result.p === "number") {
    resultsSentence += ` ${formatPValueForReport(result.p)}.`;
  }
  resultsSentence += posthocSummary;

  const methodsText = [
    `Analysis used the saved Colony Analysis revision for ${params.analysisName || "this workspace"}.`,
    `Outcome: ${measure}.`,
    `Model/Test: ${String(result.test || statsDraft.testType)}.`,
    `Grouping: ${groupedBy}.`,
    `Included animals: ${includedCount}; excluded animals: ${excludedCount}.`,
    statsDraft.pAdjustMethod !== "none" ? `Multiple-comparisons correction: ${statsDraft.pAdjustMethod}.` : "No multiple-comparisons correction was selected.",
    Array.isArray(statsDraft.reportMeasureKeys) && statsDraft.reportMeasureKeys.length > 0
      ? `Bundled measures: ${statsDraft.reportMeasureKeys.map((key) => measureLabels[key] || key).join(", ")}.`
      : "",
  ].join(" ");

  const figureTitle = visualizationDraft.title || measure;
  const primaryMeasure = measureLabels[visualizationDraft.measureKey] || visualizationDraft.measureKey || measure;
  const secondaryMeasure =
    visualizationDraft.measureKey2 && (measureLabels[visualizationDraft.measureKey2] || visualizationDraft.measureKey2)
      ? measureLabels[visualizationDraft.measureKey2] || visualizationDraft.measureKey2
      : undefined;
  const resultDrivenAnnotations = deriveSignificanceAnnotationsFromResult(result);
  const significanceSource = getFigureSignificanceSource(result, visualizationDraft);
  const annotationCount =
    visualizationDraft.sigAnnotations.length > 0
      ? visualizationDraft.sigAnnotations.length
      : resultDrivenAnnotations.length;

  const caption = [
    `${figureTitle}.`,
    `${visualizationDraft.chartType.replace(/_/g, " ")} plot of ${primaryMeasure}${secondaryMeasure ? ` versus ${secondaryMeasure}` : ""} grouped by ${getFigureGroupingLabel(visualizationDraft.groupBy)}.`,
    `Linked analysis: ${String(result.test || "Analysis")} (${formatPValueForReport(result.p)}).`,
    warnings.length > 0 ? `Warnings: ${warnings.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const resultTables = buildStructuredResultTables(result);
  const multiEndpointResults: MultiEndpointResultSummary[] = (Array.isArray(statsDraft.reportMeasureKeys) ? statsDraft.reportMeasureKeys : [])
    .map((measureKey) => ({
      measureKey,
      measureLabel: measureLabels[measureKey] || measureKey,
      summary:
        measureKey === statsDraft.measureKey
          ? summarizeAnalysisResult(result, includedCount, excludedCount) || ""
          : `Bundled into the revision-linked report packet for ${measureLabels[measureKey] || measureKey}.`,
    }));

  const figureMetadata: FigurePacket["figureMetadata"] = {
    chartType: visualizationDraft.chartType,
    title: figureTitle,
    primaryMeasure,
    ...(secondaryMeasure ? { secondaryMeasure } : {}),
    grouping: getFigureGroupingLabel(visualizationDraft.groupBy),
    significanceSource,
    annotationCount,
    recommendedChartType: getRecommendedChartType(result, visualizationDraft),
    resultFamily: getResultFamily(result),
  };

  const reportPayload: AnalysisReportPayload = {
    reportSummary: summarizeAnalysisResult(result, includedCount, excludedCount) || "",
    reportResultsText: resultsSentence,
    reportMethodsText: methodsText,
    reportCaption: caption,
    reportWarnings: warnings,
    bundledMeasures: Array.isArray(statsDraft.reportMeasureKeys)
      ? statsDraft.reportMeasureKeys.map((key) => measureLabels[key] || key)
      : [],
    diagnostics,
    resultTables,
    multiEndpointResults,
    figureMetadata,
    figurePacket: {
      figureMetadata,
      caption,
      linkedSummary: summarizeAnalysisResult(result, includedCount, excludedCount) || "",
      linkedResultsText: resultsSentence,
      warnings,
    },
  };

  return reportPayload;
}
