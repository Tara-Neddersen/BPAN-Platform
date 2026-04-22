// Derived-measure utilities: columns that aren't written by the raw
// instrument output but can be computed from other columns in the result.
//
// Design note: these functions are pure and deterministic. They never
// overwrite a value the user already imported — if the derived key is
// already present in `measures`, we leave it alone. That way, a user who
// exports and re-imports a manually corrected total won't see their edit
// clobbered by an auto-sum.
//
// Intentionally narrow in scope today: only Y-maze Total Entries is
// implemented. Extending this file (not the call sites) is the right
// place to add new derivations.

/**
 * Regexes that identify a Y-maze per-arm entry count in the measures blob.
 * Kept permissive so different labs/parser outputs still match. Examples
 * that match: arm_a_entries, arm_1_entries, entries_arm_a,
 * novel_arm_entries. We require the key to mention an "arm" AND an
 * "entr*" substring so we do not accidentally sum things like arm_length.
 */
const ARM_ENTRY_KEY_PATTERNS: RegExp[] = [
  /^arm_[a-z0-9]+_entr/i,
  /^entries?_arm_[a-z0-9]+$/i,
  /_arm_[a-z0-9]+_entr/i,
  /^[a-z]+_arm_entr/i, // e.g. novel_arm_entries, familiar_arm_entries
];

function looksLikeArmEntryKey(key: string): boolean {
  if (!key) return false;
  // Explicit guard: do not treat the derived total itself as an input.
  if (/^total_(arm_)?entr/i.test(key)) return false;
  return ARM_ENTRY_KEY_PATTERNS.some((re) => re.test(key));
}

function toNumericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * If the result is Y-maze and has two or more per-arm entry counts,
 * returns their sum as a candidate `total_entries` value. Returns null if
 * there's nothing to compute (wrong experiment, not enough arm columns,
 * or any individual value is non-numeric).
 */
export function computeYMazeTotalEntries(
  experimentType: string | null | undefined,
  measures: Record<string, unknown> | null | undefined,
): number | null {
  if (!experimentType || experimentType !== "y_maze") return null;
  if (!measures) return null;
  const armEntryKeys = Object.keys(measures).filter(looksLikeArmEntryKey);
  if (armEntryKeys.length < 2) return null;
  let total = 0;
  for (const k of armEntryKeys) {
    const n = toNumericOrNull(measures[k]);
    if (n === null) return null;
    total += n;
  }
  return total;
}

/**
 * Return a measures blob with any derivations applied. Non-mutating;
 * returns the original reference when nothing changed (so React memo
 * checks stay cheap).
 *
 * Currently handles Y-maze `total_entries`. Safe to call for any
 * experiment type — unknowns pass through unchanged.
 */
export function applyDerivedMeasures<
  M extends Record<string, unknown>,
>(experimentType: string | null | undefined, measures: M): M {
  if (experimentType === "y_maze") {
    const existingTotal = toNumericOrNull(measures.total_entries);
    if (existingTotal === null) {
      const derived = computeYMazeTotalEntries(experimentType, measures);
      if (derived !== null) {
        return { ...measures, total_entries: derived } as M;
      }
    }
  }
  return measures;
}

/**
 * The human-readable label for a derived key. Used by the analysis panel
 * when building measure dropdowns so the derived column shows up with a
 * sensible name even when the run schema didn't declare it.
 */
export const DERIVED_MEASURE_LABELS: Record<string, string> = {
  total_entries: "Total Entries",
};

/**
 * Keys that are always allowed to surface in plots / dropdowns for a
 * given experiment type, even when the run's schema_snapshot doesn't
 * declare them explicitly. Keeps the analysis panel's
 * "hide non-schema keys" rule (from the P0 fix) from suppressing our
 * auto-computed derivations.
 */
export const DERIVED_MEASURE_KEYS_BY_EXPERIMENT: Record<string, string[]> = {
  y_maze: ["total_entries"],
};
