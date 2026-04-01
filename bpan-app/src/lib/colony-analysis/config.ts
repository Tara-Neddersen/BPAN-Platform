import type {
  AnalysisSetEntry,
  ColonyAnalysisStatsDraft,
  ColonyAnalysisVisualizationDraft,
  VisualizationChartType,
} from "@/lib/colony-analysis/types";

const VALID_CHART_TYPES: VisualizationChartType[] = [
  "bar_sem",
  "bar_sd",
  "box",
  "violin",
  "scatter",
  "dot_plot",
  "timepoint_line",
  "survival_curve",
  "roc_curve",
  "regression_fit",
  "paired_slope",
];

export function defaultStatsDraft(): ColonyAnalysisStatsDraft {
  return {
    testType: "t_test",
    measureKey: "",
    measureKey2: "",
    timeToEventMeasureKey: "",
    eventMeasureKey: "",
    predictorMeasureKey: "",
    scoreMeasureKey: "",
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
    covariateMeasureKey: "",
    controlGroup: "",
    binaryGroupA: "",
    binaryGroupB: "",
    positiveClass: "Positive",
    regressionModelFamily: "linear",
    alpha: 0.05,
    targetPower: 0.8,
    reportMeasureKeys: [],
    outlierMethod: "iqr",
    outlierThreshold: 1.5,
    tableExportMode: "long",
  };
}

export function defaultVisualizationDraft(): ColonyAnalysisVisualizationDraft {
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
    showMeanLine: false,
    showDistributionCurve: false,
    tableExportMode: "long",
  };
}

export function normalizeAnalysisSetEntry(entry: Record<string, unknown>): AnalysisSetEntry {
  return {
    animalId: String(entry.animalId || ""),
    included: entry.included !== false,
    reason: String(entry.reason || ""),
    source:
      entry.source === "manual" || entry.source === "rule" || entry.source === "outlier" || entry.source === "restored"
        ? entry.source
        : "manual",
    outlierFlagged: Boolean(entry.outlierFlagged),
    outlierMode:
      entry.outlierMode === "mark" || entry.outlierMode === "exclude" || entry.outlierMode === "restore"
        ? entry.outlierMode
        : undefined,
    outlierScore:
      typeof entry.outlierScore === "number"
        ? entry.outlierScore
        : Number.isNaN(Number(entry.outlierScore))
          ? null
          : Number(entry.outlierScore),
  };
}

export function normalizeStatsDraft(input?: Partial<ColonyAnalysisStatsDraft>): ColonyAnalysisStatsDraft {
  const merged = {
    ...defaultStatsDraft(),
    ...(input || {}),
  };
  return {
    ...merged,
    alpha: Number.isFinite(Number(merged.alpha)) ? Number(merged.alpha) : 0.05,
    targetPower: Number.isFinite(Number(merged.targetPower)) ? Number(merged.targetPower) : 0.8,
    outlierThreshold: Number.isFinite(Number(merged.outlierThreshold)) ? Number(merged.outlierThreshold) : 1.5,
    reportMeasureKeys: Array.isArray(merged.reportMeasureKeys)
      ? merged.reportMeasureKeys.map((value) => String(value)).filter(Boolean)
      : [],
    postHocMethod: merged.postHocMethod === "tukey" ? "tukey" : "none",
    pAdjustMethod:
      merged.pAdjustMethod === "bonferroni" || merged.pAdjustMethod === "holm" || merged.pAdjustMethod === "fdr"
        ? merged.pAdjustMethod
        : "none",
    regressionModelFamily:
      merged.regressionModelFamily === "exponential" || merged.regressionModelFamily === "logistic"
        ? merged.regressionModelFamily
        : "linear",
    tableExportMode: merged.tableExportMode === "wide" ? "wide" : "long",
    outlierMethod: merged.outlierMethod === "zscore" ? "zscore" : "iqr",
    betweenSubjectFactor:
      merged.betweenSubjectFactor === "group" ||
      merged.betweenSubjectFactor === "sex" ||
      merged.betweenSubjectFactor === "genotype" ||
      merged.betweenSubjectFactor === "cohort" ||
      merged.betweenSubjectFactor === "timepoint"
        ? merged.betweenSubjectFactor
        : "__none__",
  };
}

export function normalizeVisualizationDraft(
  input?: Partial<ColonyAnalysisVisualizationDraft>,
): ColonyAnalysisVisualizationDraft {
  const merged = {
    ...defaultVisualizationDraft(),
    ...(input || {}),
  };
  return {
    ...merged,
    chartType: VALID_CHART_TYPES.includes(merged.chartType as VisualizationChartType)
      ? (merged.chartType as VisualizationChartType)
      : "bar_sem",
    groupBy:
      merged.groupBy === "sex" || merged.groupBy === "genotype" || merged.groupBy === "cohort"
        ? merged.groupBy
        : "group",
    sigAnnotations: Array.isArray(merged.sigAnnotations)
      ? merged.sigAnnotations
          .map((annotation) => ({
            group1: String(annotation.group1 || ""),
            group2: String(annotation.group2 || ""),
            label: String(annotation.label || ""),
          }))
          .filter((annotation) => annotation.group1 && annotation.group2 && annotation.label)
      : [],
    autoStatsMethod: merged.autoStatsMethod === "mann_whitney" ? "mann_whitney" : "welch_t",
    autoPAdjust: merged.autoPAdjust === "bonferroni" ? "bonferroni" : "none",
    tableExportMode: merged.tableExportMode === "wide" ? "wide" : "long",
    showPoints: Boolean(merged.showPoints),
    autoRunSigStars: Boolean(merged.autoRunSigStars),
    includeNsAnnotations: Boolean(merged.includeNsAnnotations),
    showMeanLine: Boolean(merged.showMeanLine),
    showDistributionCurve: Boolean(merged.showDistributionCurve),
  };
}

export function normalizeSavedResult(result: Record<string, unknown> | null | undefined) {
  if (!result || typeof result !== "object") return null;
  return {
    ...result,
    reportWarnings: Array.isArray(result.reportWarnings) ? result.reportWarnings.map((value) => String(value)) : [],
    reportSummary: typeof result.reportSummary === "string" ? result.reportSummary : "",
    reportResultsText: typeof result.reportResultsText === "string" ? result.reportResultsText : "",
    reportMethodsText: typeof result.reportMethodsText === "string" ? result.reportMethodsText : "",
    reportCaption: typeof result.reportCaption === "string" ? result.reportCaption : "",
    resultTables: Array.isArray(result.resultTables) ? result.resultTables : [],
    diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics : [],
    multiEndpointResults: Array.isArray(result.multiEndpointResults) ? result.multiEndpointResults : [],
  };
}
