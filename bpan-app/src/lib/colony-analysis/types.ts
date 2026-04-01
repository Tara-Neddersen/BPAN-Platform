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
  reportMeasureKeys: string[];
  outlierMethod: OutlierMethod;
  outlierThreshold: number;
  tableExportMode: "long" | "wide";
}

export type ModelKind = ColonyAnalysisStatsDraft["modelKind"];

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
