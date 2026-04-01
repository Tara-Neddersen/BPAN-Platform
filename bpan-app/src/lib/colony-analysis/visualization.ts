import type { ColonyAnalysisVisualizationDraft, VisualizationChartType } from "@/lib/colony-analysis/types";

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
