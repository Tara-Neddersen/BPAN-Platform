export interface FlatRow {
  animal_id: string;
  identifier: string;
  sex: string;
  genotype: string;
  group: string;
  cohort: string;
  timepoint: number;
  experiment: string;
  [key: string]: string | number | null;
}

export interface GroupStats {
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

export type AnalysisFactor = "group" | "sex" | "genotype" | "cohort" | "timepoint";
export type OutlierMethod = "iqr" | "zscore";
export type OutlierMode = "mark" | "exclude" | "restore";
export type AnalysisAuditSource = "manual" | "rule" | "outlier" | "restored";
export type PowerBaseTest =
  | "t_test"
  | "paired_t_test"
  | "mann_whitney"
  | "wilcoxon_signed_rank"
  | "anova"
  | "kruskal_wallis"
  | "two_way_anova"
  | "repeated_measures_anova"
  | "mixed_effects"
  | "multi_compare"
  | "dunnett"
  | "ancova"
  | "chi_square"
  | "fisher_exact"
  | "pearson"
  | "spearman"
  | "log_rank"
  | "roc_curve"
  | "nonlinear_regression"
  | "dose_response";
export type PowerObjective = "sample_size" | "achieved_power" | "mde";
export type PowerTargetEffect =
  | "primary"
  | "omnibus"
  | "main_effect_a"
  | "main_effect_b"
  | "interaction"
  | "time"
  | "between"
  | "adjusted_factor"
  | "contrast"
  | "association"
  | "survival"
  | "discrimination"
  | "model_fit";
export type PowerContrastScope = "primary_contrast";
export type PowerEffectMetric =
  | "d"
  | "dz"
  | "f"
  | "partial_eta_sq"
  | "r"
  | "event_rates"
  | "hazard_ratio"
  | "auc"
  | "r2";
export type PowerEngine = "auto" | "analytic" | "simulation";
export type PowerSampleMode =
  | "per_group"
  | "per_cell"
  | "subjects_total"
  | "subjects_per_group"
  | "pairs_total"
  | "total";
export type AnalysisTableKind =
  | "column"
  | "grouped"
  | "paired"
  | "xy"
  | "survival"
  | "contingency"
  | "multi_endpoint_bundle";

export interface AnalysisAnimalRow {
  animal_id: string;
  identifier: string;
  cohort: string;
  sex: string;
  genotype: string;
  group: string;
  rowCount: number;
  included: boolean;
}

export interface AnalysisSetEntry {
  animalId: string;
  included: boolean;
  reason: string;
  source: AnalysisAuditSource;
  outlierFlagged?: boolean;
  outlierMode?: OutlierMode;
  outlierScore?: number | null;
}

export interface ColonyAnalysisStatsDraft {
  testType: string;
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
  postHocMethod: "none" | "tukey";
  pAdjustMethod: "none" | "bonferroni" | "holm" | "fdr";
  modelKind: "guided" | "repeated_measures" | "mixed_effects" | "paired" | "categorical" | "covariate" | "diagnostic";
  subjectFactor: "animal_id";
  withinSubjectFactor: "timepoint";
  betweenSubjectFactor: AnalysisFactor | "__none__";
  covariateMeasureKey: string;
  controlGroup: string;
  binaryGroupA: string;
  binaryGroupB: string;
  positiveClass: string;
  regressionModelFamily: "linear" | "exponential" | "logistic";
  alpha: number;
  targetPower: number;
  powerConfig: PowerConfig;
  reportMeasureKeys: string[];
  outlierMethod: OutlierMethod;
  outlierThreshold: number;
  tableExportMode: "long" | "wide";
}

export type ModelKind = ColonyAnalysisStatsDraft["modelKind"];

export interface PowerContrastSelection {
  group1: string;
  group2: string;
  label: string;
}

export interface PowerPlannedSample {
  mode: PowerSampleMode;
  value: number;
}

export interface PowerSimulationMeta {
  iterations: number;
  seed: number;
  mcse: number | null;
}

export interface PowerAssumptions {
  nuisanceScale: number | null;
  residualSd: number | null;
  withinSubjectCorr: number | null;
  eventRates: {
    group1: number;
    group2: number;
  } | null;
  classPrevalence: number | null;
  censoringRate: number | null;
  predictorMean: number | null;
  predictorSd: number | null;
  effectNotes: string[];
}

export interface PowerConfig {
  baseTest: PowerBaseTest;
  objective: PowerObjective;
  targetEffect: PowerTargetEffect;
  contrastScope: PowerContrastScope;
  contrastSelection: PowerContrastSelection | null;
  effectMetric: PowerEffectMetric;
  effectValue: number | { group1: number; group2: number };
  plannedSample: PowerPlannedSample;
  engine: PowerEngine;
  simulationMeta: PowerSimulationMeta;
  assumptions: PowerAssumptions;
}

export type VisualizationChartType =
  | "bar_sem"
  | "bar_sd"
  | "box"
  | "violin"
  | "scatter"
  | "dot_plot"
  | "timepoint_line"
  | "survival_curve"
  | "roc_curve"
  | "regression_fit"
  | "paired_slope";

export interface AxisDraft {
  title: string;
  min: number | null;
  max: number | null;
  autoScale: boolean;
  zeroLock: boolean;
  logScale: boolean;
  invert: boolean;
  tickStep: number | null;
  tickDecimals: number | null;
  showGrid: boolean;
  labelFontSize: number;
  tickFontSize: number;
}

export interface TraceStyleDraft {
  dotSize: number;
  dotOpacity: number;
  dotJitter: number;
  dotSymbol: string;
  outlineWidth: number;
  barOpacity: number;
  lineWidth: number;
  errorBarStyle: "sem" | "sd" | "ci" | "none";
  errorBarCapWidth: number;
  palette: string;
  groupColorOverrides: Record<string, string>;
  controlGroupEmphasis: boolean;
  showMeanOverlay: boolean;
  showMedianOverlay: boolean;
  showCiOverlay: boolean;
  showMatchedConnectors: boolean;
}

export interface LegendDraft {
  visible: boolean;
  position: "top" | "right" | "bottom" | "left";
  order: "normal" | "reversed";
  labelSource: "grouping" | "trace";
}

export interface AnnotationDraft {
  id: string;
  type: "text" | "arrow" | "panel_label";
  text: string;
  x: string;
  y: number | null;
  color: string;
  fontSize: number;
  arrowToX?: string;
  arrowToY?: number | null;
}

export interface FigureStudioDraft {
  chartFamily: VisualizationChartType;
  chartSubstyle: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  panelSpacing: number;
  sharedXAxis: boolean;
  sharedYAxis: boolean;
  significanceMode: "result-driven" | "manual-override" | "hidden";
  axisX: AxisDraft;
  axisY: AxisDraft;
  traceStyle: TraceStyleDraft;
  legend: LegendDraft;
  annotations: AnnotationDraft[];
  panelLabels: string[];
}

export interface ColonyAnalysisVisualizationDraft {
  chartType: VisualizationChartType;
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
  showMeanLine: boolean;
  showDistributionCurve: boolean;
  tableExportMode: "long" | "wide";
}

export interface SavedColonyAnalysisRoot {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedColonyAnalysisRevision {
  id: string;
  analysisId: string;
  name: string;
  revisionNumber: number;
  createdAt: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  summaryText: string | null;
}

export interface RevisionDiffSummary {
  fromRevision: string;
  toRevision: string;
  changes: string[];
}

export interface AnalysisSuggestion {
  testType: ColonyAnalysisStatsDraft["testType"];
  label: string;
  reason: string;
}

export interface AssumptionCheck {
  name: string;
  status: "pass" | "warn" | "info";
  message: string;
  statistic?: number;
  p?: number;
}

export interface StructuredResultTable {
  id: string;
  title: string;
  description?: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export interface AnalysisDiagnosticEntry {
  level: "warn" | "info";
  message: string;
  source?: string;
}

export interface ResultEnvelope {
  schemaVersion: number;
  testName: string;
  measureLabel: string;
  modelTerms: string[];
  df: Array<number | null>;
  statistics: Record<string, number | string | null>;
  pValue: number | null;
  effectSizes: Array<{ label: string; value: number | null }>;
  correctionMethod: string | null;
  assumptions: AssumptionCheck[];
  warnings: string[];
  postHoc: Array<Record<string, unknown>>;
  includedCount: number;
  excludedCount: number;
  raw: Record<string, unknown>;
}

export interface ResultTableSet {
  tables: StructuredResultTable[];
}

export interface ModelDiagnostics {
  entries: AnalysisDiagnosticEntry[];
  warnings: string[];
  residualSummary?: Record<string, unknown> | null;
}

export interface FigurePacket {
  figureMetadata: {
    chartType: string;
    title: string;
    primaryMeasure: string;
    secondaryMeasure?: string;
    grouping: string;
    significanceSource: string;
    annotationCount: number;
    recommendedChartType?: VisualizationChartType;
    resultFamily?: string;
    tableKind?: AnalysisTableKind;
    figureWidth?: number;
    figureHeight?: number;
    palette?: string;
    schemaVersion?: number;
  };
  caption: string;
  linkedSummary: string;
  linkedResultsText: string;
  warnings: string[];
}

export interface MultiEndpointResultSummary {
  measureKey: string;
  measureLabel: string;
  summary: string;
}

export interface AnalysisReportPayload {
  reportSummary: string;
  reportResultsText: string;
  reportMethodsText: string;
  reportCaption: string;
  reportWarnings: string[];
  bundledMeasures?: string[];
  diagnostics: AnalysisDiagnosticEntry[];
  resultTables: StructuredResultTable[];
  figurePacket: FigurePacket;
  multiEndpointResults: MultiEndpointResultSummary[];
  figureMetadata: FigurePacket["figureMetadata"];
}

export interface ColonyAnalysisScopeDraft {
  runId: string;
  experiment: string;
  timepoint: string;
  cohort: string;
}

export interface AnalysisSetPreset {
  runId: string;
  experiment: string;
  timepoint: string;
  cohort: string;
  search: string;
}

export interface ProvenanceDraft {
  schemaVersion: number;
  revisionNumber?: number | null;
  savedAt?: string | null;
  finalized: boolean;
  finalizedAt?: string | null;
  duplicatedFromRevisionId?: string | null;
  figureVersion: string;
  exportBundleVersion: string;
  analysisSetCounts: {
    included: number;
    excluded: number;
  };
}

export interface ColonyAnalysisRevisionConfigEnvelope {
  kind: "colony_analysis";
  schemaVersion: number;
  revision_number?: number;
  description: string | null;
  scope: ColonyAnalysisScopeDraft;
  analysisSet: {
    excludedAnimals: Array<{ animalId: string; reason: string }>;
    entries: AnalysisSetEntry[];
    preset: AnalysisSetPreset;
    counts: {
      included: number;
      excluded: number;
    };
  };
  statistics: ColonyAnalysisStatsDraft;
  visualization: {
    tableKind: AnalysisTableKind;
    draft: ColonyAnalysisVisualizationDraft;
    figureStudio: FigureStudioDraft;
  };
  tables: {
    exportMode: "long" | "wide";
    resultTables: StructuredResultTable[];
  };
  reporting: {
    reportWarnings: string[];
    figureMetadata: FigurePacket["figureMetadata"] | null;
    figurePacket: FigurePacket | null;
    multiEndpointResults: MultiEndpointResultSummary[];
  };
  provenance: ProvenanceDraft;
  finalized?: boolean;
  finalizedAt?: string | null;
  duplicatedFromRevisionId?: string | null;
}

export interface ColonyAnalysisRevisionResultsEnvelope {
  schemaVersion: number;
  rawResult: Record<string, unknown> | null;
  normalizedResult: ResultEnvelope | null;
  reportSummary: string;
  reportResultsText: string;
  reportMethodsText: string;
  reportCaption: string;
  reportWarnings: string[];
  diagnostics: AnalysisDiagnosticEntry[];
  resultTables: StructuredResultTable[];
  figurePacket: FigurePacket | null;
  figureMetadata: FigurePacket["figureMetadata"] | null;
  multiEndpointResults: MultiEndpointResultSummary[];
}

export interface NormalizedColonyAnalysisRevision {
  config: ColonyAnalysisRevisionConfigEnvelope;
  results: ColonyAnalysisRevisionResultsEnvelope;
}
