import type { ColonyAnalysisVisualizationDraft, VisualizationChartType } from "@/lib/colony-analysis/types";

type SigAnnotation = ColonyAnalysisVisualizationDraft["sigAnnotations"][number];

function pValueToSigLabel(value: unknown, includeNs = false): string | null {
  const p = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(p)) return null;
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return includeNs ? "ns" : null;
}

function parseComparisonGroups(comparison: Record<string, unknown>) {
  const group1 = typeof comparison.group1 === "string" ? comparison.group1.trim() : "";
  const group2 = typeof comparison.group2 === "string" ? comparison.group2.trim() : "";
  if (group1 && group2) return { group1, group2 };

  const label = typeof comparison.comparison === "string" ? comparison.comparison : "";
  const parts = label.split(" vs ").map((value) => value.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      group1: parts[0],
      group2: parts.slice(1).join(" vs "),
    };
  }

  return null;
}

export function deriveSignificanceAnnotationsFromResult(
  result: Record<string, unknown> | null,
  options?: {
    allowedGroups?: string[];
    includeNs?: boolean;
    maxAnnotations?: number;
  },
): SigAnnotation[] {
  if (!result || !Array.isArray(result.comparisons) || result.comparisons.length === 0) return [];
  const includeNs = Boolean(options?.includeNs);
  const maxAnnotations = options?.maxAnnotations && options.maxAnnotations > 0 ? options.maxAnnotations : 6;
  const allowedGroups = options?.allowedGroups && options.allowedGroups.length > 0 ? new Set(options.allowedGroups) : null;

  const annotations = (result.comparisons as Array<Record<string, unknown>>)
    .map((comparison) => {
      const parsed = parseComparisonGroups(comparison);
      if (!parsed) return null;
      if (allowedGroups && (!allowedGroups.has(parsed.group1) || !allowedGroups.has(parsed.group2))) return null;
      const pValue = comparison.adjusted_p ?? comparison.p;
      const label = pValueToSigLabel(pValue, includeNs);
      if (!label) return null;
      return {
        group1: parsed.group1,
        group2: parsed.group2,
        label,
        p: typeof pValue === "number" ? pValue : Number(pValue),
      };
    })
    .filter((entry): entry is SigAnnotation & { p: number } => Boolean(entry))
    .sort((a, b) => a.p - b.p);

  const deduped = annotations.filter((annotation, index, arr) => {
    const key = [annotation.group1, annotation.group2].sort().join("::");
    return arr.findIndex((candidate) => [candidate.group1, candidate.group2].sort().join("::") === key) === index;
  });

  return deduped.slice(0, maxAnnotations).map(({ group1, group2, label }) => ({ group1, group2, label }));
}

export function getFigureSignificanceSource(
  result: Record<string, unknown> | null,
  current: ColonyAnalysisVisualizationDraft,
) {
  const resultDriven = deriveSignificanceAnnotationsFromResult(result);
  if (current.chartType === "scatter" || current.chartType === "timepoint_line") return "No discrete significance brackets applied";
  if (current.autoRunSigStars && current.sigAnnotations.length > 0) {
    return `Auto significance (${current.autoStatsMethod}, ${current.autoPAdjust})`;
  }
  if (current.sigAnnotations.length > 0) return "Manual significance annotations";
  if (resultDriven.length > 0) {
    return `Result-driven significance (${String(result?.posthoc_label || "pairwise comparisons")})`;
  }
  return "No significance annotations";
}

export function deriveVisualizationDraftFromResult(
  result: Record<string, unknown> | null,
  current: ColonyAnalysisVisualizationDraft,
): ColonyAnalysisVisualizationDraft {
  if (!result) return current;

  let chartType: VisualizationChartType = current.chartType;
  if (Array.isArray(result.survival_curves) && result.survival_curves.length > 0) chartType = "survival_curve";
  else if (Array.isArray(result.roc_points) && result.roc_points.length > 0) chartType = "roc_curve";
  else if (Array.isArray(result.fitted_points) && result.fitted_points.length > 0) chartType = "regression_fit";
  else if (result.model_kind === "repeated_measures_anova" || result.model_kind === "mixed_effects") chartType = "timepoint_line";
  else if (String(result.test || "").toLowerCase().includes("paired")) chartType = "paired_slope";

  return {
    ...current,
    chartType,
    title: current.title || String(result.measure || current.title || ""),
  };
}
