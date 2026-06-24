/**
 * Shared cohort name comparator and sorter.
 *
 * Cohort names like "BPAN 3" / "BPAN 10" must sort in natural/numeric order
 * (so "BPAN 3" comes before "BPAN 10"), not in plain string order where
 * "BPAN 10" would incorrectly sort above "BPAN 3".
 *
 * Server queries still use Postgres `.order("name")` (plain text sort); this
 * util fixes ordering purely on the client so every cohort list is naturally
 * sorted. Use `sortCohortsByName` once at the top of a client component that
 * receives the `cohorts` prop, then pass the sorted array to children so
 * descendant dropdowns inherit natural order.
 */

/**
 * Compare two cohort names in natural/numeric order.
 * "BPAN 3" sorts before "BPAN 10".
 */
export function compareCohortName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Return a new array of cohorts sorted by name in natural/numeric order.
 * Does not mutate the input array. Null/undefined names sort as "".
 */
export function sortCohortsByName<T extends { name?: string | null }>(cohorts: T[]): T[] {
  return [...cohorts].sort((a, b) => compareCohortName(a.name ?? "", b.name ?? ""));
}
