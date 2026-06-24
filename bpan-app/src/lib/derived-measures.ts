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

// ─── Generic "Average" result columns ────────────────────────────────
//
// A research result schema can declare an "average" column whose value is
// the mean of one or more numeric source columns in the same row. The
// average is encoded in the column's `options` array as a marker entry
// "__average__" plus one "field:<sourceKey>" entry per source column. This
// matches how the battery-creation wizard serializes average columns.
//
// These helpers are generic: any column declared this way is computed,
// regardless of experiment type. The legacy hardcoded rotarod/stamina
// averages remain in colony-results-tab for default (non-schema)
// experiments.

const AVERAGE_MARKER = "__average__";
const AVERAGE_FIELD_PREFIX = "field:";

/** Minimal shape of a result schema column we need to detect averages. */
export interface AverageColumnLike {
  key: string;
  options?: unknown[] | null;
  group_key?: string | null;
}

function optionStrings(column: AverageColumnLike): string[] {
  if (!Array.isArray(column.options)) return [];
  return column.options.filter((o): o is string => typeof o === "string");
}

/**
 * True if the column is a derived average column (declared via the
 * "__average__" marker, the conventional "average_score" key, or the
 * "derived" group).
 */
export function isAverageColumn(column: AverageColumnLike): boolean {
  const opts = optionStrings(column);
  if (opts.includes(AVERAGE_MARKER)) return true;
  if (opts.some((o) => o.startsWith(AVERAGE_FIELD_PREFIX))) return true;
  if (column.key === "average_score") return true;
  if (column.group_key === "derived") return true;
  return false;
}

/**
 * The source field keys an average column averages over. Pulled from the
 * column's "field:<sourceKey>" option entries.
 */
export function getAverageSourceKeys(column: AverageColumnLike): string[] {
  return optionStrings(column)
    .filter((o) => o.startsWith(AVERAGE_FIELD_PREFIX))
    .map((o) => o.slice(AVERAGE_FIELD_PREFIX.length))
    .filter((key) => key.length > 0);
}

/**
 * Compute the mean of an average column's source fields for one row.
 * Ignores blank / non-numeric sources. Returns null when no source field
 * has a numeric value (so the cell renders blank rather than 0).
 */
export function computeAverageColumnValue(
  column: AverageColumnLike,
  measures: Record<string, unknown> | null | undefined,
): number | null {
  if (!measures) return null;
  const sourceKeys = getAverageSourceKeys(column);
  if (sourceKeys.length === 0) return null;
  const values = sourceKeys
    .map((key) => toNumericOrNull(measures[key]))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(mean.toFixed(2));
}

/**
 * Given the schema columns for an experiment and a row's measures, return a
 * new measures blob with every declared average column recomputed from its
 * source fields. Non-mutating; returns the original reference when nothing
 * changed. Average columns are always recomputed (they are derived, not
 * user-entered), but non-average user fields are never touched.
 */
export function applyAverageColumns<M extends Record<string, unknown>>(
  schemaColumns: AverageColumnLike[] | null | undefined,
  measures: M,
): M {
  if (!schemaColumns || schemaColumns.length === 0) return measures;
  let next: M | null = null;
  for (const column of schemaColumns) {
    if (!isAverageColumn(column)) continue;
    const computed = computeAverageColumnValue(column, next ?? measures);
    const nextValue = computed === null ? null : computed;
    const current = (next ?? measures)[column.key];
    if (current === nextValue) continue;
    next = { ...(next ?? measures), [column.key]: nextValue } as M;
  }
  return next ?? measures;
}

/**
 * The set of column keys in a schema that are derived averages. Used by the
 * UI to render those cells as read-only computed values.
 */
export function getAverageColumnKeys(
  schemaColumns: AverageColumnLike[] | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  for (const column of schemaColumns || []) {
    if (isAverageColumn(column)) keys.add(column.key);
  }
  return keys;
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
