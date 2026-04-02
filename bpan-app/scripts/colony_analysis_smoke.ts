import assert from "node:assert/strict";
import {
  buildRevisionConfigEnvelope,
  buildRevisionResultsEnvelope,
  COLONY_ANALYSIS_SCHEMA_VERSION,
  defaultFigureStudioDraft,
  defaultStatsDraft,
  defaultVisualizationDraft,
  normalizeSavedResult,
  normalizeSavedRevisionEnvelope,
} from "../src/lib/colony-analysis/config";
import { buildStructuredResultTables, generateAnalysisReport, renderAnalysisReportMarkdown } from "../src/lib/colony-analysis/reporting";
import { deriveSignificanceAnnotationsFromResult, deriveVisualizationDraftFromResult } from "../src/lib/colony-analysis/visualization";

const measureLabels = {
  average_speed: "Average Speed",
  score_signal: "Score Signal",
  time_to_event: "Time To Event",
  event_observed: "Event Observed",
  dose: "Dose",
  response: "Response",
};

const anovaResult = {
  test: "One-way ANOVA",
  measure: "Average Speed",
  grouped_by: "Genotype × Sex",
  F: 5.4321,
  p: 0.0123,
  anova_table: [
    { source: "Group", ss: 10.2, df: 3, ms: 3.4, F: 5.43, p: 0.0123, partial_eta_sq: 0.41 },
    { source: "Residual", ss: 22.5, df: 16, ms: 1.41 },
  ],
  group_stats: [
    { group: "WT Male", n: 6, mean: 0.21, sd: 0.03, sem: 0.01, median: 0.21, min: 0.17, max: 0.25 },
    { group: "Hemi Male", n: 6, mean: 0.31, sd: 0.04, sem: 0.02, median: 0.3, min: 0.26, max: 0.37 },
  ],
  comparisons: [
    {
      comparison: "WT Male vs Hemi Male",
      statistic_label: "t",
      statistic: 2.91,
      p: 0.018,
      adjusted_p: 0.036,
      effect_label: "Cohen's d",
      effect_size: 1.12,
      significant: true,
    },
  ],
  posthoc_label: "Holm-adjusted pairwise comparisons",
  assumption_checks: [{ name: "Normality", status: "info", message: "Shapiro-style screen passed for both groups." }],
};

const rocResult = {
  test: "ROC Curve",
  measure: "Score Signal",
  auc: 0.84,
  p: 0.004,
  roc_points: [
    { threshold: 0.9, fpr: 0, tpr: 0.12 },
    { threshold: 0.7, fpr: 0.14, tpr: 0.61 },
    { threshold: 0.5, fpr: 0.21, tpr: 0.82 },
  ],
  threshold_table: [
    { threshold: 0.9, sensitivity: 0.12, specificity: 1, false_positive_rate: 0, youden_j: 0.12, tp: 1, fp: 0, tn: 7, fn: 7 },
    { threshold: 0.5, sensitivity: 0.82, specificity: 0.79, false_positive_rate: 0.21, youden_j: 0.61, tp: 7, fp: 2, tn: 5, fn: 1 },
  ],
  optimal_threshold: { threshold: 0.5, sensitivity: 0.82, specificity: 0.79, false_positive_rate: 0.21 },
};

const survivalResult = {
  test: "Kaplan-Meier Survival",
  measure: "Time To Event",
  survival_curves: [
    {
      group: "WT Male",
      n: 8,
      events: 4,
      censored: 4,
      median_survival: 28,
      points: [
        { time: 0, survival: 1, at_risk: 8, events: 0 },
        { time: 14, survival: 0.875, at_risk: 8, events: 1 },
        { time: 28, survival: 0.5, at_risk: 5, events: 2 },
      ],
    },
  ],
};

const regressionResult = {
  test: "Linear regression",
  measure: "Dose → Response",
  predictor_label: "Dose",
  outcome_label: "Response",
  r2: 0.93,
  rmse: 0.12,
  coefficients: { intercept: 1.02, slope: 0.44 },
  points: [
    { x: 0, y: 1.1 },
    { x: 1, y: 1.4 },
    { x: 2, y: 1.9 },
    { x: 3, y: 2.3 },
  ],
  fitted_points: [
    { x: 0, y: 1.02 },
    { x: 1, y: 1.46 },
    { x: 2, y: 1.9 },
    { x: 3, y: 2.34 },
  ],
};

function run() {
  const statsDraft = {
    ...defaultStatsDraft(),
    measureKey: "average_speed",
    reportMeasureKeys: ["average_speed", "score_signal"],
  };
  const visualizationDraft = {
    ...defaultVisualizationDraft(),
    measureKey: "average_speed",
  };
  const figureStudioDraft = {
    ...defaultFigureStudioDraft("bar_sem"),
    title: "Y-Maze Figure",
    subtitle: "Revision-linked figure studio",
    width: 960,
    height: 640,
    axisY: {
      ...defaultFigureStudioDraft("bar_sem").axisY,
      title: "Average speed (m/s)",
      min: 0,
      max: 0.5,
      autoScale: false,
    },
  };

  const anovaReport = generateAnalysisReport({
    result: anovaResult,
    statsDraft,
    visualizationDraft,
    figureStudioDraft,
    measureLabels,
    includedCount: 12,
    excludedCount: 1,
    analysisName: "Smoke Analysis",
    exclusions: [{ animalId: "BPAN6-2", reason: "Manual QC exclusion" }],
  });

  assert.ok(anovaReport);
  assert.ok(anovaReport.resultTables.length >= 2);
  assert.ok(anovaReport.diagnostics.length >= 1);
  assert.equal(anovaReport.figurePacket.figureMetadata.recommendedChartType, "bar_sem");
  assert.equal(anovaReport.figurePacket.figureMetadata.annotationCount, 1);
  assert.match(anovaReport.figurePacket.figureMetadata.significanceSource, /Result-driven significance/);
  assert.equal(anovaReport.figurePacket.figureMetadata.figureWidth, 960);
  assert.equal(anovaReport.figurePacket.figureMetadata.figureHeight, 640);
  assert.equal(anovaReport.figurePacket.figureMetadata.schemaVersion, COLONY_ANALYSIS_SCHEMA_VERSION);

  const markdown = renderAnalysisReportMarkdown({
    analysisName: "Smoke Analysis",
    reportPayload: anovaReport,
    exclusions: [{ animalId: "BPAN6-2", reason: "Manual QC exclusion" }],
  });
  assert.ok(markdown.includes("Structured Result Tables"));

  assert.equal(deriveVisualizationDraftFromResult(survivalResult, visualizationDraft).chartType, "survival_curve");
  assert.equal(deriveVisualizationDraftFromResult(rocResult, visualizationDraft).chartType, "roc_curve");
  assert.equal(deriveVisualizationDraftFromResult(regressionResult, visualizationDraft).chartType, "regression_fit");

  const rocTables = buildStructuredResultTables(rocResult);
  assert.ok(rocTables.some((table) => table.id === "roc-thresholds"));
  assert.ok(rocTables.some((table) => table.id === "roc-points"));

  const resultDrivenAnnotations = deriveSignificanceAnnotationsFromResult(anovaResult);
  assert.equal(resultDrivenAnnotations.length, 1);
  assert.equal(resultDrivenAnnotations[0]?.label, "*");

  const normalizedOldRevision = normalizeSavedResult({ test: "Legacy Result", figurePacket: { linkedSummary: "Legacy" } });
  assert.deepEqual(normalizedOldRevision?.reportWarnings, []);
  assert.deepEqual(normalizedOldRevision?.resultTables, []);
  assert.equal(normalizedOldRevision?.figurePacket.figureMetadata.chartType, "bar_sem");
  assert.equal(normalizedOldRevision?.figurePacket.linkedSummary, "Legacy");

  const configEnvelope = buildRevisionConfigEnvelope({
    description: "Smoke config",
    scope: { runId: "run-1", experiment: "y_maze", timepoint: "30", cohort: "BPAN 6" },
    excludedAnimals: [{ animalId: "BPAN6-2", reason: "Manual QC exclusion" }],
    analysisSetEntries: [
      { animalId: "BPAN6-1", included: true, reason: "", source: "manual" },
      { animalId: "BPAN6-2", included: false, reason: "Manual QC exclusion", source: "manual" },
    ],
    analysisSetPreset: { runId: "run-1", experiment: "y_maze", timepoint: "30", cohort: "BPAN 6", search: "BPAN6" },
    statsDraft,
    visualizationDraft,
    figureStudioDraft,
    resultTables: anovaReport.resultTables,
    reportWarnings: anovaReport.reportWarnings,
    figureMetadata: anovaReport.figureMetadata,
    figurePacket: anovaReport.figurePacket,
    multiEndpointResults: anovaReport.multiEndpointResults,
    includedAnimalCount: 12,
    excludedAnimalCount: 1,
    finalized: false,
    revisionNumber: 3,
  });
  const resultsEnvelope = buildRevisionResultsEnvelope({
    rawResult: anovaResult,
    reportSummary: anovaReport.reportSummary,
    reportResultsText: anovaReport.reportResultsText,
    reportMethodsText: anovaReport.reportMethodsText,
    reportCaption: anovaReport.reportCaption,
    reportWarnings: anovaReport.reportWarnings,
    diagnostics: anovaReport.diagnostics,
    resultTables: anovaReport.resultTables,
    figurePacket: anovaReport.figurePacket,
    figureMetadata: anovaReport.figureMetadata,
    multiEndpointResults: anovaReport.multiEndpointResults,
    includedAnimalCount: 12,
    excludedAnimalCount: 1,
  });
  const normalizedRevision = normalizeSavedRevisionEnvelope({
    config: configEnvelope as unknown as Record<string, unknown>,
    results: resultsEnvelope as unknown as Record<string, unknown>,
  });

  assert.equal(normalizedRevision.config.schemaVersion, COLONY_ANALYSIS_SCHEMA_VERSION);
  assert.equal(normalizedRevision.config.visualization.figureStudio.width, 960);
  assert.equal(normalizedRevision.config.visualization.figureStudio.axisY.max, 0.5);
  assert.equal(normalizedRevision.results.reportSummary, anovaReport.reportSummary);
  assert.equal(normalizedRevision.results.figureMetadata?.figureWidth, 960);
  assert.equal(normalizedRevision.results.normalizedResult?.includedCount, 12);

  console.log("colony_analysis_smoke: ok");
}

run();
