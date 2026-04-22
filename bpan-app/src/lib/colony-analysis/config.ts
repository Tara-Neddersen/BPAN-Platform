import type {
  AnalysisDiagnosticEntry,
  AnalysisSetEntry,
  AnalysisSetPreset,
  AnalysisTableKind,
  AnnotationDraft,
  AssumptionCheck,
  AxisDraft,
  ColonyAnalysisRevisionConfigEnvelope,
  ColonyAnalysisRevisionResultsEnvelope,
  ColonyAnalysisScopeDraft,
  ColonyAnalysisStatsDraft,
  ColonyAnalysisVisualizationDraft,
  FigurePacket,
  FigureStudioDraft,
  LegendDraft,
  MultiEndpointResultSummary,
  NormalizedColonyAnalysisRevision,
  PowerAssumptions,
  PowerBaseTest,
  PowerConfig,
  PowerContrastSelection,
  PowerEffectMetric,
  PowerEngine,
  PowerObjective,
  PowerPlannedSample,
  PowerSimulationMeta,
  PowerTargetEffect,
  ProvenanceDraft,
  ResultEnvelope,
  StructuredResultTable,
  TraceStyleDraft,
  VisualizationChartType,
} from "@/lib/colony-analysis/types";

export const COLONY_ANALYSIS_SCHEMA_VERSION = 2;

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

const VALID_TABLE_KINDS: AnalysisTableKind[] = [
  "column",
  "grouped",
  "paired",
  "xy",
  "survival",
  "contingency",
  "multi_endpoint_bundle",
];

const POWER_BASE_TESTS: PowerBaseTest[] = [
  "t_test",
  "paired_t_test",
  "mann_whitney",
  "wilcoxon_signed_rank",
  "anova",
  "kruskal_wallis",
  "two_way_anova",
  "repeated_measures_anova",
  "mixed_effects",
  "multi_compare",
  "dunnett",
  "ancova",
  "chi_square",
  "fisher_exact",
  "pearson",
  "spearman",
  "log_rank",
  "roc_curve",
  "nonlinear_regression",
  "dose_response",
];

const POWER_TARGET_EFFECTS: PowerTargetEffect[] = [
  "primary",
  "omnibus",
  "main_effect_a",
  "main_effect_b",
  "interaction",
  "time",
  "between",
  "adjusted_factor",
  "contrast",
  "association",
  "survival",
  "discrimination",
  "model_fit",
];

const POWER_EFFECT_METRICS: PowerEffectMetric[] = [
  "d",
  "dz",
  "f",
  "partial_eta_sq",
  "r",
  "event_rates",
  "hazard_ratio",
  "auc",
  "r2",
];

const POWER_ENGINES: PowerEngine[] = ["auto", "analytic", "simulation"];
const POWER_OBJECTIVES: PowerObjective[] = ["sample_size", "achieved_power", "mde"];

function defaultPowerAssumptions(): PowerAssumptions {
  return {
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
}

function defaultPlannedSample(mode: PowerPlannedSample["mode"] = "per_group", value = 10): PowerPlannedSample {
  return {
    mode,
    value,
  };
}

function defaultSimulationMeta(): PowerSimulationMeta {
  return {
    iterations: 400,
    seed: 42,
    mcse: null,
  };
}

function getDefaultPowerMetric(baseTest: PowerBaseTest): PowerEffectMetric {
  switch (baseTest) {
    case "paired_t_test":
    case "wilcoxon_signed_rank":
      return "dz";
    case "anova":
    case "kruskal_wallis":
    case "two_way_anova":
    case "repeated_measures_anova":
    case "mixed_effects":
    case "ancova":
      return "f";
    case "pearson":
    case "spearman":
    case "nonlinear_regression":
    case "dose_response":
      return baseTest === "pearson" || baseTest === "spearman" ? "r" : "r2";
    case "chi_square":
    case "fisher_exact":
      return "event_rates";
    case "log_rank":
      return "hazard_ratio";
    case "roc_curve":
      return "auc";
    case "multi_compare":
    case "dunnett":
    case "t_test":
    case "mann_whitney":
    default:
      return "d";
  }
}

function getDefaultPowerTarget(baseTest: PowerBaseTest): PowerTargetEffect {
  switch (baseTest) {
    case "anova":
    case "kruskal_wallis":
      return "omnibus";
    case "two_way_anova":
      return "main_effect_a";
    case "repeated_measures_anova":
      return "time";
    case "mixed_effects":
      return "time";
    case "ancova":
      return "adjusted_factor";
    case "multi_compare":
    case "dunnett":
      return "contrast";
    case "pearson":
    case "spearman":
      return "association";
    case "log_rank":
      return "survival";
    case "roc_curve":
      return "discrimination";
    case "nonlinear_regression":
    case "dose_response":
      return "model_fit";
    default:
      return "primary";
  }
}

function getDefaultPowerSample(baseTest: PowerBaseTest): PowerPlannedSample {
  switch (baseTest) {
    case "two_way_anova":
      return defaultPlannedSample("per_cell", 8);
    case "repeated_measures_anova":
    case "mixed_effects":
      return defaultPlannedSample("subjects_per_group", 10);
    case "paired_t_test":
    case "wilcoxon_signed_rank":
      return defaultPlannedSample("pairs_total", 20);
    case "pearson":
    case "spearman":
    case "nonlinear_regression":
    case "dose_response":
      return defaultPlannedSample("total", 24);
    case "log_rank":
      return defaultPlannedSample("subjects_total", 30);
    default:
      return defaultPlannedSample("per_group", 10);
  }
}

export function defaultPowerConfig(baseTest: PowerBaseTest = "t_test"): PowerConfig {
  return {
    baseTest,
    objective: "sample_size",
    targetEffect: getDefaultPowerTarget(baseTest),
    contrastScope: "primary_contrast",
    contrastSelection: null,
    effectMetric: getDefaultPowerMetric(baseTest),
    effectValue:
      getDefaultPowerMetric(baseTest) === "event_rates"
        ? { group1: 0.35, group2: 0.6 }
        : getDefaultPowerMetric(baseTest) === "hazard_ratio"
          ? 0.7
          : getDefaultPowerMetric(baseTest) === "auc"
            ? 0.7
            : getDefaultPowerMetric(baseTest) === "r2"
              ? 0.2
              : getDefaultPowerMetric(baseTest) === "r"
                ? 0.35
                : 0.5,
    plannedSample: getDefaultPowerSample(baseTest),
    engine: "auto",
    simulationMeta: defaultSimulationMeta(),
    assumptions: defaultPowerAssumptions(),
  };
}

function normalizeContrastSelection(input: unknown): PowerContrastSelection | null {
  if (!isRecord(input)) return null;
  const group1 = stringOrDefault(input.group1);
  const group2 = stringOrDefault(input.group2);
  if (!group1 || !group2) return null;
  return {
    group1,
    group2,
    label: stringOrDefault(input.label, `${group1} vs ${group2}`),
  };
}

function normalizePowerAssumptions(input: unknown): PowerAssumptions {
  const source = isRecord(input) ? input : {};
  const eventRatesSource = isRecord(source.eventRates) ? source.eventRates : null;
  return {
    nuisanceScale: numericOrNull(source.nuisanceScale),
    residualSd: numericOrNull(source.residualSd),
    withinSubjectCorr: numericOrNull(source.withinSubjectCorr),
    eventRates:
      eventRatesSource &&
      numericOrNull(eventRatesSource.group1) !== null &&
      numericOrNull(eventRatesSource.group2) !== null
        ? {
            group1: Number(eventRatesSource.group1),
            group2: Number(eventRatesSource.group2),
          }
        : null,
    classPrevalence: numericOrNull(source.classPrevalence),
    censoringRate: numericOrNull(source.censoringRate),
    predictorMean: numericOrNull(source.predictorMean),
    predictorSd: numericOrNull(source.predictorSd),
    effectNotes: stringArray(source.effectNotes),
  };
}

function inferLegacyPowerBaseTest(input?: Partial<ColonyAnalysisStatsDraft>): PowerBaseTest {
  if (input?.testType === "power_two_group") return "t_test";
  return "t_test";
}

export function normalizePowerConfig(
  input?: Partial<PowerConfig> | null,
  legacyStats?: Partial<ColonyAnalysisStatsDraft> | null,
): PowerConfig {
  const baseFallback = inferLegacyPowerBaseTest(legacyStats || undefined);
  const source = {
    ...defaultPowerConfig(baseFallback),
    ...(input || {}),
  };
  const baseTest = POWER_BASE_TESTS.includes(source.baseTest as PowerBaseTest)
    ? (source.baseTest as PowerBaseTest)
    : baseFallback;
  const effectMetric = POWER_EFFECT_METRICS.includes(source.effectMetric as PowerEffectMetric)
    ? (source.effectMetric as PowerEffectMetric)
    : getDefaultPowerMetric(baseTest);
  const effectValue =
    effectMetric === "event_rates"
      ? isRecord(source.effectValue)
        ? {
            group1: numericOrDefault(source.effectValue.group1, 0.35),
            group2: numericOrDefault(source.effectValue.group2, 0.6),
          }
        : defaultPowerConfig(baseTest).effectValue
      : numericOrDefault(source.effectValue, numericOrDefault(defaultPowerConfig(baseTest).effectValue, 0.5));

  return {
    ...defaultPowerConfig(baseTest),
    ...source,
    baseTest,
    objective: POWER_OBJECTIVES.includes(source.objective as PowerObjective)
      ? (source.objective as PowerObjective)
      : "sample_size",
    targetEffect: POWER_TARGET_EFFECTS.includes(source.targetEffect as PowerTargetEffect)
      ? (source.targetEffect as PowerTargetEffect)
      : getDefaultPowerTarget(baseTest),
    contrastScope: "primary_contrast",
    contrastSelection: normalizeContrastSelection(source.contrastSelection),
    effectMetric,
    effectValue,
    plannedSample: isRecord(source.plannedSample)
      ? {
          mode: stringOrDefault(source.plannedSample.mode, getDefaultPowerSample(baseTest).mode) as PowerPlannedSample["mode"],
          value: Math.max(2, Math.round(numericOrDefault(source.plannedSample.value, getDefaultPowerSample(baseTest).value))),
        }
      : getDefaultPowerSample(baseTest),
    engine: POWER_ENGINES.includes(source.engine as PowerEngine)
      ? (source.engine as PowerEngine)
      : "auto",
    simulationMeta: isRecord(source.simulationMeta)
      ? {
          iterations: Math.max(100, Math.round(numericOrDefault(source.simulationMeta.iterations, 400))),
          seed: Math.round(numericOrDefault(source.simulationMeta.seed, 42)),
          mcse: numericOrNull(source.simulationMeta.mcse),
        }
      : defaultSimulationMeta(),
    assumptions: normalizePowerAssumptions(source.assumptions),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrDefault(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numericOrDefault(value: unknown, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : null;
}

function booleanOrDefault(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map((value) => String(value)).filter(Boolean) : [];
}

function normalizeStatisticsRecord(input: unknown): Record<string, string | number | null> {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (value === null) return [key, null];
      if (typeof value === "number" || typeof value === "string") return [key, value];
      return [key, String(value)];
    }),
  );
}

function normalizeFigureMetadata(input: unknown): FigurePacket["figureMetadata"] | null {
  if (!isRecord(input)) return null;
  const chartTypeCandidate = stringOrDefault(input.chartType, "bar_sem");
  const recommendedChartTypeCandidate = stringOrDefault(input.recommendedChartType);
  const tableKindCandidate = stringOrDefault(input.tableKind);
  return {
    chartType: chartTypeCandidate,
    title: stringOrDefault(input.title),
    primaryMeasure: stringOrDefault(input.primaryMeasure),
    ...(nullableString(input.secondaryMeasure) ? { secondaryMeasure: String(input.secondaryMeasure) } : {}),
    grouping: stringOrDefault(input.grouping, "Genotype x Sex"),
    significanceSource: stringOrDefault(input.significanceSource, "No significance annotations"),
    annotationCount: numericOrDefault(input.annotationCount, 0),
    ...(VALID_CHART_TYPES.includes(recommendedChartTypeCandidate as VisualizationChartType)
      ? { recommendedChartType: recommendedChartTypeCandidate as VisualizationChartType }
      : {}),
    resultFamily: stringOrDefault(input.resultFamily, "general"),
    ...(VALID_TABLE_KINDS.includes(tableKindCandidate as AnalysisTableKind)
      ? { tableKind: tableKindCandidate as AnalysisTableKind }
      : {}),
    ...(numericOrNull(input.figureWidth) !== null ? { figureWidth: Number(input.figureWidth) } : {}),
    ...(numericOrNull(input.figureHeight) !== null ? { figureHeight: Number(input.figureHeight) } : {}),
    ...(nullableString(input.palette) ? { palette: String(input.palette) } : {}),
    schemaVersion: numericOrDefault(input.schemaVersion, COLONY_ANALYSIS_SCHEMA_VERSION),
  };
}

function normalizeFigurePacket(
  input: unknown,
  fallbackMetadata: FigurePacket["figureMetadata"] | null,
): FigurePacket | null {
  if (!isRecord(input) && !fallbackMetadata) return null;
  const source = isRecord(input) ? input : {};
  const figureMetadata = normalizeFigureMetadata(source.figureMetadata) ?? fallbackMetadata;
  if (!figureMetadata) return null;
  return {
    figureMetadata,
    caption: stringOrDefault(source.caption),
    linkedSummary: stringOrDefault(source.linkedSummary),
    linkedResultsText: stringOrDefault(source.linkedResultsText),
    warnings: stringArray(source.warnings),
  };
}

function normalizeStructuredResultTables(input: unknown): StructuredResultTable[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((table) => {
      if (!isRecord(table)) return null;
      const columns = stringArray(table.columns);
      const rows = Array.isArray(table.rows) ? table.rows.filter(isRecord) : [];
      if (!table.id || !table.title || columns.length === 0 || rows.length === 0) return null;
      return {
        id: String(table.id),
        title: String(table.title),
        ...(nullableString(table.description) ? { description: String(table.description) } : {}),
        columns,
        rows,
      } satisfies StructuredResultTable;
    })
    .filter((table): table is StructuredResultTable => Boolean(table));
}

function normalizeDiagnostics(input: unknown): AnalysisDiagnosticEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!isRecord(entry)) return null;
      return {
        level: entry.level === "warn" ? "warn" : "info",
        message: stringOrDefault(entry.message, "Diagnostic note"),
        ...(nullableString(entry.source) ? { source: String(entry.source) } : {}),
      } satisfies AnalysisDiagnosticEntry;
    })
    .filter((entry): entry is AnalysisDiagnosticEntry => Boolean(entry));
}

function normalizeMultiEndpointResults(input: unknown): MultiEndpointResultSummary[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const measureKey = stringOrDefault(entry.measureKey);
      if (!measureKey) return null;
      return {
        measureKey,
        measureLabel: stringOrDefault(entry.measureLabel, measureKey),
        summary: stringOrDefault(entry.summary),
      } satisfies MultiEndpointResultSummary;
    })
    .filter((entry): entry is MultiEndpointResultSummary => Boolean(entry));
}

function normalizeAssumptionChecks(input: unknown): AssumptionCheck[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const status = entry.status === "pass" || entry.status === "warn" || entry.status === "info" ? entry.status : "info";
      return {
        name: stringOrDefault(entry.name, "Assumption"),
        status,
        message: stringOrDefault(entry.message, "No details recorded."),
        ...(numericOrNull(entry.statistic) !== null ? { statistic: Number(entry.statistic) } : {}),
        ...(numericOrNull(entry.p) !== null ? { p: Number(entry.p) } : {}),
      } satisfies AssumptionCheck;
    })
    .filter((entry): entry is AssumptionCheck => Boolean(entry));
}

function normalizeResultEnvelope(
  input: unknown,
  rawResult: Record<string, unknown> | null,
  includedCount: number,
  excludedCount: number,
): ResultEnvelope | null {
  if (!isRecord(input) && !rawResult) return null;
  const source = isRecord(input) ? input : {};
  const raw = rawResult ?? (isRecord(source.raw) ? source.raw : {});
  const statisticsSource = normalizeStatisticsRecord(source.statistics);
  const fallbackStatistics = Object.fromEntries(
    ["t", "F", "H", "U", "W", "r", "rho", "auc", "chi2", "rmse", "r2", "p", "achieved_power", "mde", "recommended_total_n", "recommended_n_per_group", "recommended_n_per_cell", "planned_n", "mcse"].flatMap((key) => {
      const value = raw[key];
      return value === undefined ? [] : [[key, typeof value === "number" || typeof value === "string" ? value : String(value)]];
    }),
  );
  const correctionMethod =
    nullableString(source.correctionMethod) ??
    nullableString(raw.correction_method) ??
    nullableString(raw.posthoc_label);
  const effectSizes = Array.isArray(source.effectSizes)
    ? source.effectSizes
        .map((entry) => {
          if (!isRecord(entry)) return null;
          return {
            label: stringOrDefault(entry.label, "Effect size"),
            value: numericOrNull(entry.value),
          };
        })
        .filter((entry): entry is { label: string; value: number | null } => Boolean(entry))
    : nullableString(raw.effect_label) || raw.effect_size !== undefined
      ? [{
          label: stringOrDefault(raw.effect_label, "Effect size"),
          value: numericOrNull(raw.effect_size),
        }]
      : [];

  return {
    schemaVersion: numericOrDefault(source.schemaVersion, COLONY_ANALYSIS_SCHEMA_VERSION),
    testName: stringOrDefault(source.testName, stringOrDefault(raw.test, "Analysis")),
    measureLabel: stringOrDefault(source.measureLabel, stringOrDefault(raw.measure, "")),
    modelTerms: stringArray(source.modelTerms),
    df: Array.isArray(source.df)
      ? source.df.map((value) => numericOrNull(value))
      : numericOrNull(raw.df) !== null
        ? [numericOrNull(raw.df)]
        : [],
    statistics: Object.keys(statisticsSource).length > 0 ? statisticsSource : normalizeStatisticsRecord(fallbackStatistics),
    pValue: numericOrNull(source.pValue) ?? numericOrNull(raw.p),
    effectSizes,
    correctionMethod,
    assumptions: normalizeAssumptionChecks(source.assumptions ?? raw.assumption_checks),
    warnings: stringArray(source.warnings).concat(nullableString(raw.warning) ? [String(raw.warning)] : []),
    postHoc: Array.isArray(source.postHoc)
      ? source.postHoc.filter(isRecord)
      : Array.isArray(raw.comparisons)
        ? raw.comparisons.filter(isRecord)
        : [],
    includedCount: numericOrDefault(source.includedCount, includedCount),
    excludedCount: numericOrDefault(source.excludedCount, excludedCount),
    raw,
  };
}

function defaultAxisDraft(title = ""): AxisDraft {
  return {
    title,
    min: null,
    max: null,
    autoScale: true,
    zeroLock: false,
    logScale: false,
    invert: false,
    tickStep: null,
    tickDecimals: null,
    showGrid: true,
    labelFontSize: 14,
    tickFontSize: 12,
  };
}

function normalizeAxisDraft(input: unknown, fallbackTitle = ""): AxisDraft {
  // NOTE: `fallbackTitle` is intentionally NOT used to seed `title` here.
  // Auto-populating title from the fallback made the stored title "sticky":
  // once written on the first normalize, later calls saw a non-empty
  // source.title and preserved the stale value even when the selected
  // measure (and therefore the fallback) had changed. That caused the plot
  // title to update to the newly selected measure while the Y axis title
  // kept showing the previous measure's label. The display path already
  // computes the fallback at render time (`axis.title || fallbackTitle` in
  // getAxisLayout, plus the yAxisTitle computation in the analysis panel),
  // so leaving `title` empty here is correct and safer.
  // The parameter is retained for API stability and to document intent at
  // every call site.
  void fallbackTitle;
  const defaults = defaultAxisDraft("");
  const source = isRecord(input) ? input : {};
  return {
    title: typeof source.title === "string" ? source.title : "",
    min: numericOrNull(source.min),
    max: numericOrNull(source.max),
    autoScale: booleanOrDefault(source.autoScale, defaults.autoScale),
    zeroLock: booleanOrDefault(source.zeroLock, defaults.zeroLock),
    logScale: booleanOrDefault(source.logScale, defaults.logScale),
    invert: booleanOrDefault(source.invert, defaults.invert),
    tickStep: numericOrNull(source.tickStep),
    tickDecimals: numericOrNull(source.tickDecimals),
    showGrid: booleanOrDefault(source.showGrid, defaults.showGrid),
    labelFontSize: numericOrDefault(source.labelFontSize, defaults.labelFontSize),
    tickFontSize: numericOrDefault(source.tickFontSize, defaults.tickFontSize),
  };
}

function defaultTraceStyleDraft(chartFamily: VisualizationChartType): TraceStyleDraft {
  return {
    dotSize: 9,
    dotOpacity: 0.72,
    dotJitter: 0.24,
    dotSymbol: "circle",
    outlineWidth: 1,
    barOpacity: 0.85,
    lineWidth: 2,
    errorBarStyle: chartFamily === "bar_sd" ? "sd" : "sem",
    errorBarCapWidth: 8,
    palette: "workspace",
    groupColorOverrides: {},
    controlGroupEmphasis: false,
    showMeanOverlay: false,
    showMedianOverlay: false,
    showCiOverlay: false,
    showMatchedConnectors: chartFamily === "paired_slope",
  };
}

function normalizeTraceStyleDraft(input: unknown, chartFamily: VisualizationChartType): TraceStyleDraft {
  const defaults = defaultTraceStyleDraft(chartFamily);
  const source = isRecord(input) ? input : {};
  const errorBarStyle =
    source.errorBarStyle === "sd" || source.errorBarStyle === "ci" || source.errorBarStyle === "none"
      ? source.errorBarStyle
      : "sem";
  const palette = nullableString(source.palette) ?? defaults.palette;
  const groupColorOverrides = isRecord(source.groupColorOverrides)
    ? Object.fromEntries(Object.entries(source.groupColorOverrides).map(([key, value]) => [key, String(value)]))
    : {};
  return {
    dotSize: numericOrDefault(source.dotSize, defaults.dotSize),
    dotOpacity: numericOrDefault(source.dotOpacity, defaults.dotOpacity),
    dotJitter: numericOrDefault(source.dotJitter, defaults.dotJitter),
    dotSymbol: stringOrDefault(source.dotSymbol, defaults.dotSymbol),
    outlineWidth: numericOrDefault(source.outlineWidth, defaults.outlineWidth),
    barOpacity: numericOrDefault(source.barOpacity, defaults.barOpacity),
    lineWidth: numericOrDefault(source.lineWidth, defaults.lineWidth),
    errorBarStyle,
    errorBarCapWidth: numericOrDefault(source.errorBarCapWidth, defaults.errorBarCapWidth),
    palette,
    groupColorOverrides,
    controlGroupEmphasis: booleanOrDefault(source.controlGroupEmphasis, defaults.controlGroupEmphasis),
    showMeanOverlay: booleanOrDefault(source.showMeanOverlay, defaults.showMeanOverlay),
    showMedianOverlay: booleanOrDefault(source.showMedianOverlay, defaults.showMedianOverlay),
    showCiOverlay: booleanOrDefault(source.showCiOverlay, defaults.showCiOverlay),
    showMatchedConnectors: booleanOrDefault(source.showMatchedConnectors, defaults.showMatchedConnectors),
  };
}

function defaultLegendDraft(chartFamily: VisualizationChartType): LegendDraft {
  return {
    visible: ["scatter", "timepoint_line", "survival_curve", "roc_curve", "regression_fit"].includes(chartFamily),
    position: "right",
    order: "normal",
    labelSource: "grouping",
  };
}

function normalizeLegendDraft(input: unknown, chartFamily: VisualizationChartType): LegendDraft {
  const defaults = defaultLegendDraft(chartFamily);
  const source = isRecord(input) ? input : {};
  return {
    visible: booleanOrDefault(source.visible, defaults.visible),
    position:
      source.position === "top" || source.position === "bottom" || source.position === "left"
        ? source.position
        : "right",
    order: source.order === "reversed" ? "reversed" : "normal",
    labelSource: source.labelSource === "trace" ? "trace" : "grouping",
  };
}

function normalizeAnnotationDraft(input: unknown): AnnotationDraft | null {
  if (!isRecord(input)) return null;
  const type = input.type === "arrow" || input.type === "panel_label" ? input.type : "text";
  const text = stringOrDefault(input.text);
  if (!text && type !== "arrow") return null;
  return {
    id: stringOrDefault(input.id, `annotation-${Math.random().toString(36).slice(2, 10)}`),
    type,
    text,
    x: stringOrDefault(input.x),
    y: numericOrNull(input.y),
    color: stringOrDefault(input.color, "#111827"),
    fontSize: numericOrDefault(input.fontSize, 12),
    ...(nullableString(input.arrowToX) ? { arrowToX: String(input.arrowToX) } : {}),
    ...(numericOrNull(input.arrowToY) !== null ? { arrowToY: Number(input.arrowToY) } : {}),
  };
}

export function defaultFigureStudioDraft(
  chartFamily: VisualizationChartType,
  xAxisTitle = "",
  yAxisTitle = "",
): FigureStudioDraft {
  return {
    chartFamily,
    chartSubstyle: "default",
    title: "",
    subtitle: "",
    width: 1200,
    height: 800,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    marginTop: 72,
    marginRight: 40,
    marginBottom: 64,
    marginLeft: 72,
    panelSpacing: 24,
    sharedXAxis: false,
    sharedYAxis: false,
    significanceMode: "result-driven",
    axisX: defaultAxisDraft(xAxisTitle),
    axisY: defaultAxisDraft(yAxisTitle),
    traceStyle: defaultTraceStyleDraft(chartFamily),
    legend: defaultLegendDraft(chartFamily),
    annotations: [],
    panelLabels: [],
  };
}

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
    powerConfig: defaultPowerConfig("t_test"),
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
  const legacyPowerConfig =
    merged.testType === "power_planning" || merged.testType === "power_two_group"
      ? normalizePowerConfig(
          isRecord(merged.powerConfig) ? (merged.powerConfig as Partial<PowerConfig>) : null,
          merged,
        )
      : normalizePowerConfig(isRecord(merged.powerConfig) ? (merged.powerConfig as Partial<PowerConfig>) : null, merged);
  return {
    ...merged,
    alpha: Number.isFinite(Number(merged.alpha)) ? Number(merged.alpha) : 0.05,
    targetPower: Number.isFinite(Number(merged.targetPower)) ? Number(merged.targetPower) : 0.8,
    powerConfig: legacyPowerConfig,
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

export function normalizeFigureStudioDraft(
  input: Partial<FigureStudioDraft> | null | undefined,
  chartFamily: VisualizationChartType,
  xAxisTitle = "",
  yAxisTitle = "",
): FigureStudioDraft {
  const safeChartFamily = VALID_CHART_TYPES.includes(chartFamily) ? chartFamily : defaultVisualizationDraft().chartType;
  const defaults = defaultFigureStudioDraft(safeChartFamily, xAxisTitle, yAxisTitle);
  const source = isRecord(input) ? input : {};
  const nextChartFamily = VALID_CHART_TYPES.includes(source.chartFamily as VisualizationChartType)
    ? (source.chartFamily as VisualizationChartType)
    : safeChartFamily;
  const defaultsForFamily = defaultFigureStudioDraft(nextChartFamily, xAxisTitle, yAxisTitle);
  return {
    chartFamily: nextChartFamily,
    chartSubstyle: stringOrDefault(source.chartSubstyle, defaultsForFamily.chartSubstyle),
    title: stringOrDefault(source.title, defaults.title),
    subtitle: stringOrDefault(source.subtitle, defaults.subtitle),
    width: numericOrDefault(source.width, defaultsForFamily.width),
    height: numericOrDefault(source.height, defaultsForFamily.height),
    backgroundColor: stringOrDefault(source.backgroundColor, defaultsForFamily.backgroundColor),
    borderColor: stringOrDefault(source.borderColor, defaultsForFamily.borderColor),
    borderWidth: numericOrDefault(source.borderWidth, defaultsForFamily.borderWidth),
    marginTop: numericOrDefault(source.marginTop, defaultsForFamily.marginTop),
    marginRight: numericOrDefault(source.marginRight, defaultsForFamily.marginRight),
    marginBottom: numericOrDefault(source.marginBottom, defaultsForFamily.marginBottom),
    marginLeft: numericOrDefault(source.marginLeft, defaultsForFamily.marginLeft),
    panelSpacing: numericOrDefault(source.panelSpacing, defaultsForFamily.panelSpacing),
    sharedXAxis: booleanOrDefault(source.sharedXAxis, defaultsForFamily.sharedXAxis),
    sharedYAxis: booleanOrDefault(source.sharedYAxis, defaultsForFamily.sharedYAxis),
    significanceMode:
      source.significanceMode === "manual-override" || source.significanceMode === "hidden"
        ? source.significanceMode
        : "result-driven",
    axisX: normalizeAxisDraft(source.axisX, xAxisTitle || defaultsForFamily.axisX.title),
    axisY: normalizeAxisDraft(source.axisY, yAxisTitle || defaultsForFamily.axisY.title),
    traceStyle: normalizeTraceStyleDraft(source.traceStyle, nextChartFamily),
    legend: normalizeLegendDraft(source.legend, nextChartFamily),
    annotations: Array.isArray(source.annotations)
      ? source.annotations.map(normalizeAnnotationDraft).filter((entry): entry is AnnotationDraft => Boolean(entry))
      : defaultsForFamily.annotations,
    panelLabels: stringArray(source.panelLabels),
  };
}

export function normalizeSavedResult(
  result: Record<string, unknown> | null | undefined,
): (Record<string, unknown> & {
  reportWarnings: string[];
  reportSummary: string;
  reportResultsText: string;
  reportMethodsText: string;
  reportCaption: string;
  figureMetadata: FigurePacket["figureMetadata"];
  figurePacket: FigurePacket;
  resultTables: StructuredResultTable[];
  diagnostics: AnalysisDiagnosticEntry[];
  multiEndpointResults: MultiEndpointResultSummary[];
}) | null {
  if (!result || typeof result !== "object") return null;
  const rawFigureMetadata =
    result.figureMetadata && typeof result.figureMetadata === "object"
      ? (result.figureMetadata as Record<string, unknown>)
      : {};
  const figureMetadata = normalizeFigureMetadata(rawFigureMetadata) ?? {
    chartType: "bar_sem",
    title: "",
    primaryMeasure: "",
    grouping: "Genotype x Sex",
    significanceSource: "No significance annotations",
    annotationCount: 0,
    resultFamily: "general",
    schemaVersion: COLONY_ANALYSIS_SCHEMA_VERSION,
  };
  const rawFigurePacket =
    result.figurePacket && typeof result.figurePacket === "object"
      ? (result.figurePacket as Record<string, unknown>)
      : {};
  const figurePacket =
    normalizeFigurePacket(rawFigurePacket, figureMetadata) || {
      figureMetadata,
      caption: "",
      linkedSummary: "",
      linkedResultsText: "",
      warnings: [],
    };
  return {
    ...result,
    reportWarnings: Array.isArray(result.reportWarnings) ? result.reportWarnings.map((value) => String(value)) : [],
    reportSummary: typeof result.reportSummary === "string" ? result.reportSummary : "",
    reportResultsText: typeof result.reportResultsText === "string" ? result.reportResultsText : "",
    reportMethodsText: typeof result.reportMethodsText === "string" ? result.reportMethodsText : "",
    reportCaption: typeof result.reportCaption === "string" ? result.reportCaption : "",
    figureMetadata,
    figurePacket,
    resultTables: normalizeStructuredResultTables(result.resultTables),
    diagnostics: normalizeDiagnostics(result.diagnostics),
    multiEndpointResults: normalizeMultiEndpointResults(result.multiEndpointResults),
  };
}

export function determineAnalysisTableKind(
  result: Record<string, unknown>,
  statsDraft: Pick<ColonyAnalysisStatsDraft, "testType" | "reportMeasureKeys">,
  visualizationDraft: Pick<ColonyAnalysisVisualizationDraft, "chartType" | "measureKey2">,
): AnalysisTableKind {
  if (Array.isArray(statsDraft.reportMeasureKeys) && statsDraft.reportMeasureKeys.filter(Boolean).length > 1) {
    return "multi_endpoint_bundle";
  }
  if (Array.isArray(result.survival_curves) && result.survival_curves.length > 0) return "survival";
  if (Array.isArray(result.contingency_table) && result.contingency_table.length > 0) return "contingency";
  if (
    visualizationDraft.chartType === "scatter" ||
    visualizationDraft.chartType === "roc_curve" ||
    visualizationDraft.chartType === "regression_fit" ||
    visualizationDraft.measureKey2 ||
    statsDraft.testType === "pearson" ||
    statsDraft.testType === "spearman" ||
    statsDraft.testType === "nonlinear_regression" ||
    statsDraft.testType === "dose_response" ||
    Array.isArray(result.fitted_points)
  ) {
    return "xy";
  }
  if (
    visualizationDraft.chartType === "paired_slope" ||
    statsDraft.testType === "paired_t_test" ||
    statsDraft.testType === "wilcoxon_signed_rank" ||
    String(result.test || "").toLowerCase().includes("paired")
  ) {
    return "paired";
  }
  if (
    Array.isArray(result.group_stats) ||
    Array.isArray(result.comparisons) ||
    Array.isArray(result.anova_table) ||
    result.grouped_by != null
  ) {
    return "grouped";
  }
  return "column";
}

type BuildRevisionConfigEnvelopeArgs = {
  description: string | null;
  scope: ColonyAnalysisScopeDraft;
  excludedAnimals: Array<{ animalId: string; reason: string }>;
  analysisSetEntries: AnalysisSetEntry[];
  analysisSetPreset: AnalysisSetPreset;
  statsDraft: ColonyAnalysisStatsDraft;
  visualizationDraft: ColonyAnalysisVisualizationDraft;
  figureStudioDraft?: FigureStudioDraft | null;
  resultTables: StructuredResultTable[];
  reportWarnings: string[];
  figureMetadata: FigurePacket["figureMetadata"] | null;
  figurePacket: FigurePacket | null;
  multiEndpointResults: MultiEndpointResultSummary[];
  includedAnimalCount: number;
  excludedAnimalCount: number;
  finalized?: boolean;
  finalizedAt?: string | null;
  duplicatedFromRevisionId?: string | null;
  revisionNumber?: number | null;
  savedAt?: string | null;
  figureVersion?: string;
  exportBundleVersion?: string;
};

export function buildRevisionConfigEnvelope(args: BuildRevisionConfigEnvelopeArgs): ColonyAnalysisRevisionConfigEnvelope {
  const stats = normalizeStatsDraft(args.statsDraft);
  const visualization = normalizeVisualizationDraft(args.visualizationDraft);
  const figureStudio = normalizeFigureStudioDraft(
    args.figureStudioDraft,
    visualization.chartType,
    "",
    visualization.measureKey,
  );
  const figureMetadata = normalizeFigureMetadata(args.figureMetadata);
  const figurePacket = normalizeFigurePacket(args.figurePacket, figureMetadata);
  const normalizedEntries = Array.isArray(args.analysisSetEntries)
    ? args.analysisSetEntries.map((entry) => normalizeAnalysisSetEntry(entry as unknown as Record<string, unknown>))
    : [];
  const normalizedExcludedAnimals = Array.isArray(args.excludedAnimals)
    ? args.excludedAnimals
        .map((entry) => ({
          animalId: stringOrDefault(entry?.animalId),
          reason: stringOrDefault(entry?.reason),
        }))
        .filter((entry) => entry.animalId)
    : [];
  const includedCount = Math.max(0, Math.trunc(numericOrDefault(args.includedAnimalCount, 0)));
  const excludedCount = Math.max(0, Math.trunc(numericOrDefault(args.excludedAnimalCount, normalizedExcludedAnimals.length)));
  const tableKind =
    figureMetadata?.tableKind ??
    determineAnalysisTableKind(args.figurePacket?.figureMetadata ?? {}, stats, visualization);
  const finalized = Boolean(args.finalized);
  const finalizedAt = finalized ? args.finalizedAt ?? null : null;
  const duplicatedFromRevisionId = args.duplicatedFromRevisionId ?? null;
  const revisionNumber = numericOrNull(args.revisionNumber);
  const provenance: ProvenanceDraft = {
    schemaVersion: COLONY_ANALYSIS_SCHEMA_VERSION,
    ...(revisionNumber !== null ? { revisionNumber } : {}),
    ...(nullableString(args.savedAt) ? { savedAt: String(args.savedAt) } : { savedAt: new Date().toISOString() }),
    finalized,
    ...(finalizedAt ? { finalizedAt } : {}),
    ...(duplicatedFromRevisionId ? { duplicatedFromRevisionId } : {}),
    figureVersion: args.figureVersion || "1.0",
    exportBundleVersion: args.exportBundleVersion || "1.0",
    analysisSetCounts: {
      included: includedCount,
      excluded: excludedCount,
    },
  };

  return {
    kind: "colony_analysis",
    schemaVersion: COLONY_ANALYSIS_SCHEMA_VERSION,
    ...(revisionNumber !== null ? { revision_number: revisionNumber } : {}),
    description: args.description,
    scope: {
      runId: stringOrDefault(args.scope.runId, "__all__"),
      experiment: stringOrDefault(args.scope.experiment, "__all__"),
      timepoint: stringOrDefault(args.scope.timepoint, "__all__"),
      cohort: stringOrDefault(args.scope.cohort, "__all__"),
    },
    analysisSet: {
      excludedAnimals: normalizedExcludedAnimals,
      entries: normalizedEntries,
      preset: {
        runId: stringOrDefault(args.analysisSetPreset.runId, "__all__"),
        experiment: stringOrDefault(args.analysisSetPreset.experiment, "__all__"),
        timepoint: stringOrDefault(args.analysisSetPreset.timepoint, "__all__"),
        cohort: stringOrDefault(args.analysisSetPreset.cohort, "__all__"),
        search: stringOrDefault(args.analysisSetPreset.search),
      },
      counts: {
        included: includedCount,
        excluded: excludedCount,
      },
    },
    statistics: stats,
    visualization: {
      tableKind,
      draft: visualization,
      figureStudio,
    },
    tables: {
      exportMode: visualization.tableExportMode,
      resultTables: normalizeStructuredResultTables(args.resultTables),
    },
    reporting: {
      reportWarnings: stringArray(args.reportWarnings),
      figureMetadata,
      figurePacket,
      multiEndpointResults: normalizeMultiEndpointResults(args.multiEndpointResults),
    },
    provenance,
    finalized,
    finalizedAt,
    duplicatedFromRevisionId,
  };
}

type BuildRevisionResultsEnvelopeArgs = {
  rawResult: Record<string, unknown> | null;
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
  includedAnimalCount: number;
  excludedAnimalCount: number;
};

export function buildRevisionResultsEnvelope(
  args: BuildRevisionResultsEnvelopeArgs,
): ColonyAnalysisRevisionResultsEnvelope {
  const includedCount = Math.max(0, Math.trunc(numericOrDefault(args.includedAnimalCount, 0)));
  const excludedCount = Math.max(0, Math.trunc(numericOrDefault(args.excludedAnimalCount, 0)));
  const normalizedMetadata = normalizeFigureMetadata(args.figureMetadata);
  const normalizedPacket = normalizeFigurePacket(args.figurePacket, normalizedMetadata);
  return {
    schemaVersion: COLONY_ANALYSIS_SCHEMA_VERSION,
    rawResult: args.rawResult ?? null,
    normalizedResult: normalizeResultEnvelope(args.rawResult, args.rawResult, includedCount, excludedCount),
    reportSummary: stringOrDefault(args.reportSummary),
    reportResultsText: stringOrDefault(args.reportResultsText),
    reportMethodsText: stringOrDefault(args.reportMethodsText),
    reportCaption: stringOrDefault(args.reportCaption),
    reportWarnings: stringArray(args.reportWarnings),
    diagnostics: normalizeDiagnostics(args.diagnostics),
    resultTables: normalizeStructuredResultTables(args.resultTables),
    figurePacket: normalizedPacket,
    figureMetadata: normalizedMetadata,
    multiEndpointResults: normalizeMultiEndpointResults(args.multiEndpointResults),
  };
}

type NormalizeSavedRevisionEnvelopeArgs = {
  config: Record<string, unknown> | null | undefined;
  results: Record<string, unknown> | null | undefined;
};

export function normalizeSavedRevisionEnvelope(
  args: NormalizeSavedRevisionEnvelopeArgs,
): NormalizedColonyAnalysisRevision {
  const config = isRecord(args.config) ? args.config : {};
  const results = isRecord(args.results) ? args.results : {};
  const normalizedSavedResults = normalizeSavedResult(results);
  const scopeSource = isRecord(config.scope) ? config.scope : config;
  const analysisSetSource = isRecord(config.analysisSet) ? config.analysisSet : {};
  const presetSource = isRecord(analysisSetSource.preset)
    ? analysisSetSource.preset
    : isRecord(config.analysisSetPreset)
      ? config.analysisSetPreset
      : {};
  const stats = normalizeStatsDraft(
    isRecord(config.statistics)
      ? (config.statistics as Partial<ColonyAnalysisStatsDraft>)
      : isRecord(config.statsDraft)
        ? (config.statsDraft as Partial<ColonyAnalysisStatsDraft>)
        : (config as Partial<ColonyAnalysisStatsDraft>),
  );
  const visualization = normalizeVisualizationDraft(
    isRecord(isRecord(config.visualization) ? config.visualization.draft : null)
      ? ((config.visualization as Record<string, unknown>).draft as Partial<ColonyAnalysisVisualizationDraft>)
      : isRecord(config.visualizationDraft)
        ? (config.visualizationDraft as Partial<ColonyAnalysisVisualizationDraft>)
        : (config as Partial<ColonyAnalysisVisualizationDraft>),
  );
  const figureStudioDraft = normalizeFigureStudioDraft(
    isRecord(config.visualization) && isRecord((config.visualization as Record<string, unknown>).figureStudio)
      ? ((config.visualization as Record<string, unknown>).figureStudio as Partial<FigureStudioDraft>)
      : isRecord(config.figureStudioDraft)
        ? (config.figureStudioDraft as Partial<FigureStudioDraft>)
        : undefined,
    visualization.chartType,
    "",
    visualization.measureKey,
  );
  const rawExcludedAnimals = Array.isArray(analysisSetSource.excludedAnimals)
    ? analysisSetSource.excludedAnimals
    : Array.isArray(config.excludedAnimals)
      ? config.excludedAnimals
      : [];
  const excludedAnimals = rawExcludedAnimals
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const animalId = stringOrDefault(entry.animalId);
      if (!animalId) return null;
      return {
        animalId,
        reason: stringOrDefault(entry.reason),
      };
    })
    .filter((entry): entry is { animalId: string; reason: string } => Boolean(entry));
  const entries = Array.isArray(analysisSetSource.entries)
    ? analysisSetSource.entries
        .filter(isRecord)
        .map((entry) => normalizeAnalysisSetEntry(entry))
    : [];
  const effectiveEntries =
    entries.length > 0
      ? entries
      : excludedAnimals.map((entry) =>
          normalizeAnalysisSetEntry({
            animalId: entry.animalId,
            included: false,
            reason: entry.reason,
            source: "manual",
          }),
        );
  const analysisSetCountsSource = isRecord(config.provenance) && isRecord((config.provenance as Record<string, unknown>).analysisSetCounts)
    ? ((config.provenance as Record<string, unknown>).analysisSetCounts as Record<string, unknown>)
    : isRecord(analysisSetSource.counts)
      ? (analysisSetSource.counts as Record<string, unknown>)
      : {};
  const excludedAnimalCount = numericOrDefault(
    analysisSetCountsSource.excluded,
    excludedAnimals.length || effectiveEntries.filter((entry) => !entry.included).length,
  );
  const includedAnimalCount = numericOrDefault(
    analysisSetCountsSource.included,
    Math.max(effectiveEntries.filter((entry) => entry.included).length, 0),
  );
  const rawResult =
    isRecord(results.rawResult)
      ? (results.rawResult as Record<string, unknown>)
      : isRecord(normalizedSavedResults?.rawResult)
        ? (normalizedSavedResults.rawResult as Record<string, unknown>)
        : results;
  const normalizedFigureMetadata =
    normalizeFigureMetadata(
      (isRecord(config.reporting) ? (config.reporting as Record<string, unknown>).figureMetadata : undefined) ??
        config.figureMetadata ??
        normalizedSavedResults?.figureMetadata,
    ) ?? normalizeFigureMetadata(normalizedSavedResults?.figureMetadata);
  const normalizedFigurePacket =
    normalizeFigurePacket(
      (isRecord(config.reporting) ? (config.reporting as Record<string, unknown>).figurePacket : undefined) ??
        config.figurePacket ??
        normalizedSavedResults?.figurePacket,
      normalizedFigureMetadata,
    ) ?? normalizeFigurePacket(normalizedSavedResults?.figurePacket, normalizedFigureMetadata);
  const resultTables = normalizeStructuredResultTables(
    (isRecord(config.tables) ? (config.tables as Record<string, unknown>).resultTables : undefined) ??
      config.resultTables ??
      normalizedSavedResults?.resultTables,
  );
  const multiEndpointResults = normalizeMultiEndpointResults(
    (isRecord(config.reporting) ? (config.reporting as Record<string, unknown>).multiEndpointResults : undefined) ??
      config.multiEndpointResults ??
      normalizedSavedResults?.multiEndpointResults,
  );
  const finalized =
    booleanOrDefault(config.finalized, false) ||
    (isRecord(config.provenance) && booleanOrDefault((config.provenance as Record<string, unknown>).finalized, false));
  const finalizedAt =
    nullableString(config.finalizedAt) ??
    (isRecord(config.provenance) ? nullableString((config.provenance as Record<string, unknown>).finalizedAt) : null);
  const duplicatedFromRevisionId =
    nullableString(config.duplicatedFromRevisionId) ??
    (isRecord(config.provenance)
      ? nullableString((config.provenance as Record<string, unknown>).duplicatedFromRevisionId)
      : null);
  const revisionNumber = numericOrNull(config.revision_number) ?? numericOrNull(config.revisionNumber);

  const normalizedConfig = buildRevisionConfigEnvelope({
    description: nullableString(config.description),
    scope: {
      runId: stringOrDefault(scopeSource.runId, "__all__"),
      experiment: stringOrDefault(scopeSource.experiment, "__all__"),
      timepoint: stringOrDefault(scopeSource.timepoint, "__all__"),
      cohort: stringOrDefault(scopeSource.cohort, "__all__"),
    },
    excludedAnimals,
    analysisSetEntries: effectiveEntries,
    analysisSetPreset: {
      runId: stringOrDefault(presetSource.runId, stringOrDefault(scopeSource.runId, "__all__")),
      experiment: stringOrDefault(presetSource.experiment, stringOrDefault(scopeSource.experiment, "__all__")),
      timepoint: stringOrDefault(presetSource.timepoint, stringOrDefault(scopeSource.timepoint, "__all__")),
      cohort: stringOrDefault(presetSource.cohort, stringOrDefault(scopeSource.cohort, "__all__")),
      search: stringOrDefault(presetSource.search),
    },
    statsDraft: stats,
    visualizationDraft: visualization,
    figureStudioDraft,
    resultTables,
    reportWarnings: stringArray(
      (isRecord(config.reporting) ? (config.reporting as Record<string, unknown>).reportWarnings : undefined) ??
        config.reportWarnings ??
        normalizedSavedResults?.reportWarnings,
    ),
    figureMetadata: normalizedFigureMetadata,
    figurePacket: normalizedFigurePacket,
    multiEndpointResults,
    includedAnimalCount,
    excludedAnimalCount,
    finalized,
    finalizedAt,
    duplicatedFromRevisionId,
    revisionNumber,
    savedAt:
      (isRecord(config.provenance) ? nullableString((config.provenance as Record<string, unknown>).savedAt) : null) ??
      null,
    figureVersion:
      (isRecord(config.provenance) ? nullableString((config.provenance as Record<string, unknown>).figureVersion) : null) ??
      "1.0",
    exportBundleVersion:
      (isRecord(config.provenance)
        ? nullableString((config.provenance as Record<string, unknown>).exportBundleVersion)
        : null) ?? "1.0",
  });

  const normalizedResults = buildRevisionResultsEnvelope({
    rawResult,
    reportSummary: stringOrDefault(results.reportSummary, stringOrDefault(normalizedSavedResults?.reportSummary)),
    reportResultsText: stringOrDefault(results.reportResultsText, stringOrDefault(normalizedSavedResults?.reportResultsText)),
    reportMethodsText: stringOrDefault(results.reportMethodsText, stringOrDefault(normalizedSavedResults?.reportMethodsText)),
    reportCaption: stringOrDefault(results.reportCaption, stringOrDefault(normalizedSavedResults?.reportCaption)),
    reportWarnings: stringArray(results.reportWarnings ?? normalizedSavedResults?.reportWarnings),
    diagnostics: normalizeDiagnostics(results.diagnostics ?? normalizedSavedResults?.diagnostics),
    resultTables,
    figurePacket: normalizedFigurePacket,
    figureMetadata: normalizedFigureMetadata,
    multiEndpointResults,
    includedAnimalCount,
    excludedAnimalCount,
  });

  return {
    config: normalizedConfig,
    results: normalizedResults,
  };
}
