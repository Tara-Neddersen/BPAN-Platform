// Shared derivation helpers that MUST stay in lockstep with the recording grid
// (src/components/colony-results-tab.tsx — fallbackRunTimepoints). The grid is
// the source of truth for what a run's recordable experiments + timepoint ages
// are; the data-import destination builder (src/components/results-client.tsx)
// uses the SAME helpers so imported rows land exactly where the grid reads them.
//
// If you change the grid's experiment-key or window-age logic, change it HERE so
// both paths can never drift apart.

/**
 * The experiment identity for a run schedule block. Honors the battery verbatim:
 * an explicit metadata.experimentType wins (so its predefined measure columns
 * apply); otherwise the block's OWN title is the experiment key — NO
 * "recognized type" gatekeeping (so DeepLabCut / RR S are valid, not dropped).
 *
 * Returns "" only when there is no name at all.
 */
export function deriveRunBlockExperimentKey(
  metadataExperimentType: string | null | undefined,
  blockTitle: string | null | undefined
): string {
  const typed =
    typeof metadataExperimentType === "string" ? metadataExperimentType.trim() : "";
  if (typed) return typed;
  return (blockTitle || "").trim();
}

/**
 * The representative age (days) for a timepoint window, matching the grid:
 *  - Number(windowName) when finite (e.g. "120" -> 120),
 *  - else the LEADING integer of a range (e.g. "30-60" -> 30, "120-150" -> 120),
 *  - else the block's targetAgeDays (falling back to 0).
 *
 * Keeping this identical to the grid guarantees the import destination's
 * timepoint_age_days matches the grid's timepoint age, so getExistingResult
 * finds the imported rows.
 */
export function deriveRunWindowAge(
  windowName: string | null | undefined,
  targetAgeDays: number | null | undefined
): number {
  if (typeof windowName === "string" && windowName.trim()) {
    const numericAge = Number(windowName);
    if (Number.isFinite(numericAge)) return numericAge;
    const leadingAge = Number.parseInt(windowName, 10);
    if (Number.isFinite(leadingAge)) return leadingAge;
  }
  return targetAgeDays ?? 0;
}
