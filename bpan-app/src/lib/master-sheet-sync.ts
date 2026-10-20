import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatasetColumn } from "@/types";

/**
 * Wide "master sheet" sync.
 *
 * The BPAN Master Sheet keeps one row per mouse and one column per
 * (experiment, timepoint, measure), e.g. "RR1 (s) T2 - P120" or
 * "P30 - %SA - YMaze". This module recognises that layout, unpivots it into
 * (animal, timepoint, experiment, measures) rows and upserts them into
 * colony_results, resolving animals by cohort + number so that the sheet's
 * "3-1" matches the app's "1" in cohort "BPAN 3", "8-2" in "BPAN 8",
 * "BPAN 11-4" in "BPAN 11" or "M4-7" in "M4".
 */

export type WideMeasureSpec = {
  header: string;
  experiment: string;
  timepoint: number;
  key: string;
  /** Multiply numeric values by this before storing (unit conversion). */
  scale?: number;
};

type LongRow = {
  strain: string;
  animalRaw: string;
  timepoint: number;
  experiment: string;
  measures: Record<string, number | string | null>;
};

const Y_MAZE_KEYS: Record<string, { key: string; scale?: number }> = {
  "%sa": { key: "spontaneous_alternation_pct" },
  "% sa": { key: "spontaneous_alternation_pct" },
  "spontaneous alternation": { key: "spontaneous_alternation_pct" },
  "#arm enteries": { key: "total_entries" },
  "#arm entries": { key: "total_entries" },
  "arm entries": { key: "total_entries" },
  "average speed": { key: "average_speed" },
  "total distance": { key: "distance_cm", scale: 100 },
};

const LDB_KEYS: Record<string, string> = {
  "time in light (s)": "time_in_light_sec",
  "% light": "light_pct",
  "transitions": "transitions",
  "latency to dark (s)": "latency_to_dark_sec",
  "dist. in light (m)": "distance_in_light_m",
  "avg light visit (s)": "avg_light_visit_sec",
};

const OF_KEYS: Record<string, string> = {
  "total distance": "total_distance_m",
  "% time in center": "center_time_pct",
  "center entries": "center_entries",
  "time immobile": "time_immobile_sec",
};

const SUFFIX_EXPERIMENTS: Record<string, string> = {
  ymaze: "y_maze",
  "y-maze": "y_maze",
  y_maze: "y_maze",
  ldb: "ldb",
  si: "social_interaction",
  of: "open_field",
  cw: "catwalk",
  catwalk: "catwalk",
  rr: "rotarod",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/%/g, "pct")
    .replace(/#/g, "n_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseWideHeader(header: string): WideMeasureSpec | null {
  const h = header.trim();
  if (!h) return null;

  let m = h.match(/^RR\s*([12])\s*\(s\)\s*T\s*([123])\s*-\s*P\s*(\d+)$/i);
  if (m) return { header: h, experiment: `rotarod_test${m[1]}`, timepoint: Number(m[3]), key: `trial_${m[2]}_sec` };

  m = h.match(/^RR\s*([12])\s*\(Avg\)\s*-\s*P\s*(\d+)$/i);
  if (m) return { header: h, experiment: `rotarod_test${m[1]}`, timepoint: Number(m[2]), key: "latency_to_fall_sec" };

  m = h.match(/^Stamina\s*\(s\)\s*T\s*([123])\s*-\s*P\s*(\d+)$/i);
  if (m) return { header: h, experiment: "stamina", timepoint: Number(m[2]), key: `test_${m[1]}_sec` };

  m = h.match(/^Stamina\s*\(Avg\)\s*-\s*P\s*(\d+)$/i);
  if (m) return { header: h, experiment: "stamina", timepoint: Number(m[1]), key: "avg_duration_sec" };

  m = h.match(/^P\s*(\d+)\s*-\s*Body Weight\s*\(g\)$/i);
  if (m) return { header: h, experiment: "body_weight", timepoint: Number(m[1]), key: "weight_g" };

  // "P30 - %SA - YMaze", "P120-Time in light (s)-LDB", "P360 - Total Distance - OF"
  m = h.match(/^P\s*(\d+)\s*-\s*(.+?)\s*-\s*([A-Za-z_-]+)$/);
  if (m) {
    const timepoint = Number(m[1]);
    const label = m[2].trim();
    const suffix = m[3].trim().toLowerCase();
    const experiment = SUFFIX_EXPERIMENTS[suffix];
    if (!experiment) return null;
    const lower = label.toLowerCase();
    if (experiment === "y_maze" && Y_MAZE_KEYS[lower]) {
      return { header: h, experiment, timepoint, key: Y_MAZE_KEYS[lower].key, scale: Y_MAZE_KEYS[lower].scale };
    }
    if (experiment === "ldb" && LDB_KEYS[lower]) {
      return { header: h, experiment, timepoint, key: LDB_KEYS[lower] };
    }
    if (experiment === "open_field" && OF_KEYS[lower]) {
      return { header: h, experiment, timepoint, key: OF_KEYS[lower] };
    }
    return { header: h, experiment, timepoint, key: slugify(label) };
  }

  // "P30_soczone_invest_time_s_hab-SI"
  m = h.match(/^P\s*(\d+)_(.+?)-([A-Za-z]+)$/);
  if (m) {
    const experiment = SUFFIX_EXPERIMENTS[m[3].toLowerCase()];
    if (!experiment) return null;
    return { header: h, experiment, timepoint: Number(m[1]), key: slugify(m[2]) };
  }

  return null;
}

function findAnimalColumn(columns: DatasetColumn[]) {
  const names = columns.map((c) => c.name);
  const wanted = ["mouse id", "mouse_id", "animal id", "animal_id", "animal", "mouse", "identifier", "id"];
  for (const w of wanted) {
    const hit = names.find((n) => n.trim().toLowerCase() === w);
    if (hit) return hit;
  }
  return null;
}

function findStrainColumn(columns: DatasetColumn[], data: Record<string, unknown>[]) {
  const names = columns.map((c) => c.name);
  const byName = names.find((n) => ["strain", "line", "colony"].includes(n.trim().toLowerCase()));
  if (byName) return byName;
  for (const name of names) {
    const values = data.map((row) => String(row[name] ?? "").trim().toUpperCase()).filter(Boolean);
    if (values.length === 0) continue;
    const hits = values.filter((v) => v === "BPAN" || v === "BPAN-M" || v === "BPANM").length;
    if (hits / values.length > 0.8) return name;
  }
  return null;
}

/** True when the sheet is laid out one-row-per-mouse with (experiment, timepoint) columns. */
export function isWideMasterSheet(columns: DatasetColumn[]) {
  if (!findAnimalColumn(columns)) return false;
  const parsed = columns.filter((c) => parseWideHeader(c.name)).length;
  return parsed >= 3;
}

function toMeasureValue(raw: unknown, scale?: number): number | string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text || text === "-" || text === "—" || text.toUpperCase() === "NA" || text.toUpperCase() === "N/A") return null;
  if (/^#(DIV\/0!|N\/A|REF!|VALUE!|NAME\?|NUM!)$/i.test(text)) return null;
  const n = Number(text.replace(/,/g, ""));
  if (Number.isFinite(n)) return scale ? Math.round(n * scale * 1e6) / 1e6 : n;
  return text;
}

export function unpivotWideMasterSheet(columns: DatasetColumn[], data: Record<string, unknown>[]) {
  const animalColumn = findAnimalColumn(columns);
  if (!animalColumn) throw new Error("Master sheet needs a Mouse ID column.");
  const strainColumn = findStrainColumn(columns, data);
  const specs = columns.map((c) => parseWideHeader(c.name)).filter((s): s is WideMeasureSpec => Boolean(s));
  const ignoredHeaders = columns
    .map((c) => c.name)
    .filter((name) => name !== animalColumn && name !== strainColumn && !/^Column_\d+$/.test(name) && !parseWideHeader(name));

  const rows: LongRow[] = [];
  for (const row of data) {
    const animalRaw = String(row[animalColumn] ?? "").trim();
    if (!animalRaw) continue;
    const strain = strainColumn ? String(row[strainColumn] ?? "").trim() : "";
    const grouped = new Map<string, LongRow>();
    for (const spec of specs) {
      const value = toMeasureValue(row[spec.header], spec.scale);
      const groupKey = `${spec.experiment}|${spec.timepoint}`;
      let entry = grouped.get(groupKey);
      if (!entry) {
        entry = { strain, animalRaw, timepoint: spec.timepoint, experiment: spec.experiment, measures: {} };
        grouped.set(groupKey, entry);
      }
      entry.measures[spec.key] = value;
    }
    for (const entry of grouped.values()) {
      const hasValue = Object.values(entry.measures).some((v) => v !== null);
      if (hasValue) rows.push(entry);
    }
  }
  return { rows, ignoredHeaders, animalColumn, strainColumn, specs };
}

// ─── Animal resolution ──────────────────────────────────────────────────

function strainPrefix(strain: string) {
  const s = strain.trim().toUpperCase().replace(/\s+/g, "");
  if (!s || s === "BPAN") return "";
  if (s === "BPAN-M" || s === "BPANM" || s === "M") return "m";
  return s.toLowerCase();
}

/** "BPAN 3" -> "3", "M4" -> "m4", "BPAN-M 4" -> "m4". */
function cohortKey(name: string) {
  const s = name.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(bpan-?m|bpanm|m|bpan)?-?(\d+)$/);
  if (!m) return s;
  const prefix = m[1] && m[1] !== "bpan" ? "m" : "";
  return `${prefix}${Number(m[2])}`;
}

/** "M4-7" -> 7, "BPAN 11-4" -> 4, "8-2" -> 2, "5" -> 5. */
function animalNumber(identifier: string) {
  const m = identifier.trim().match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

type AnimalRef = { strain: string; animalRaw: string };

export async function resolveMasterSheetAnimals(client: SupabaseClient, userId: string, refs: AnimalRef[]) {
  const [{ data: animals, error: animalsError }, { data: cohorts, error: cohortsError }] = await Promise.all([
    client.from("animals").select("id,identifier,cohort_id").eq("user_id", userId).limit(5000),
    client.from("cohorts").select("id,name").eq("user_id", userId).limit(2000),
  ]);
  if (animalsError) throw new Error(animalsError.message);
  if (cohortsError) throw new Error(cohortsError.message);

  const cohortKeyById = new Map<string, string>();
  for (const cohort of (cohorts || []) as Array<{ id: string; name: string }>) {
    cohortKeyById.set(cohort.id, cohortKey(cohort.name));
  }

  const byCohortNumber = new Map<string, string[]>();
  const byIdentifier = new Map<string, string[]>();
  for (const animal of (animals || []) as Array<{ id: string; identifier: string; cohort_id: string }>) {
    const ident = String(animal.identifier ?? "").trim();
    const identKey = ident.toLowerCase().replace(/\s+/g, "");
    byIdentifier.set(identKey, [...(byIdentifier.get(identKey) || []), animal.id]);
    const ck = cohortKeyById.get(animal.cohort_id);
    const num = animalNumber(ident);
    if (ck && num !== null) {
      const key = `${ck}|${num}`;
      byCohortNumber.set(key, [...(byCohortNumber.get(key) || []), animal.id]);
    }
  }

  const resolved = new Map<string, string>();
  const unmatched: string[] = [];
  for (const ref of refs) {
    const mapKey = `${ref.strain}|${ref.animalRaw}`;
    if (resolved.has(mapKey)) continue;
    const raw = ref.animalRaw.trim();
    let animalId: string | null = null;

    const dashed = raw.replace(/\s+/g, "").match(/^(?:bpan-?m|bpanm|bpan|m)?-?(\d+)-(\d+)$/i);
    if (dashed) {
      const explicitPrefix = raw.trim().toLowerCase().startsWith("m") && !raw.trim().toLowerCase().startsWith("bpan") ? "m" : null;
      const prefix = explicitPrefix ?? strainPrefix(ref.strain);
      const hits = byCohortNumber.get(`${prefix}${Number(dashed[1])}|${Number(dashed[2])}`) || [];
      if (hits.length === 1) animalId = hits[0];
    }
    if (!animalId) {
      const hits = byIdentifier.get(raw.toLowerCase().replace(/\s+/g, "")) || [];
      if (hits.length === 1) animalId = hits[0];
    }

    if (animalId) resolved.set(mapKey, animalId);
    else unmatched.push(ref.strain ? `${ref.strain} ${raw}` : raw);
  }
  return { resolved, unmatched };
}

// ─── Sync ───────────────────────────────────────────────────────────────

async function ensureTimepoints(client: SupabaseClient, userId: string, timepoints: number[]) {
  const { data: existing, error } = await client
    .from("colony_timepoints")
    .select("age_days,sort_order")
    .eq("user_id", userId);
  if (error) return; // best effort: the results still save, the tab just won't show until added
  const have = new Set(((existing || []) as Array<{ age_days: number }>).map((t) => Number(t.age_days)));
  let sortOrder = Math.max(0, ...((existing || []) as Array<{ sort_order: number | null }>).map((t) => t.sort_order ?? 0));
  for (const age of Array.from(new Set(timepoints)).sort((a, b) => a - b)) {
    if (have.has(age)) continue;
    sortOrder += 1;
    await client.from("colony_timepoints").insert({
      user_id: userId,
      name: `${age}-day`,
      age_days: age,
      experiments: [],
      sort_order: sortOrder,
      notes: "Added automatically by the master sheet sync.",
    });
  }
}

export async function syncWideMasterSheetIntoColony(
  client: SupabaseClient,
  userId: string,
  linkId: string,
  columns: DatasetColumn[],
  data: Record<string, unknown>[]
) {
  const { rows, ignoredHeaders } = unpivotWideMasterSheet(columns, data);
  const refs = Array.from(new Map(rows.map((r) => [`${r.strain}|${r.animalRaw}`, { strain: r.strain, animalRaw: r.animalRaw }])).values());
  const { resolved, unmatched } = await resolveMasterSheetAnimals(client, userId, refs);

  await ensureTimepoints(client, userId, rows.map((r) => r.timepoint));

  // colony_results is guarded by a *partial* unique index for legacy rows
  // (experiment_run_id is null), which PostgREST upsert can't target, so
  // look up the existing row ids once and update/insert explicitly.
  const { data: existingRows, error: existingError } = await client
    .from("colony_results")
    .select("id,animal_id,timepoint_age_days,experiment_type")
    .eq("user_id", userId)
    .is("experiment_run_id", null)
    .is("run_timepoint_experiment_id", null)
    .limit(20000);
  if (existingError) throw new Error(existingError.message);
  const existingId = new Map<string, string>();
  for (const r of (existingRows || []) as Array<{ id: string; animal_id: string; timepoint_age_days: number; experiment_type: string }>) {
    existingId.set(`${r.animal_id}|${Number(r.timepoint_age_days)}|${r.experiment_type}`, r.id);
  }

  let synced = 0;
  let skipped = 0;
  const recordedAt = new Date().toISOString();
  const today = recordedAt.slice(0, 10);

  for (const row of rows) {
    const animalId = resolved.get(`${row.strain}|${row.animalRaw}`);
    if (!animalId) {
      skipped++;
      continue;
    }
    const key = `${animalId}|${row.timepoint}|${row.experiment}`;
    const payload = {
      user_id: userId,
      animal_id: animalId,
      timepoint_age_days: row.timepoint,
      experiment_type: row.experiment,
      measures: row.measures,
      source_sheet_link_id: linkId,
      recorded_at: recordedAt,
    };
    const id = existingId.get(key);
    if (id) {
      const { error } = await client.from("colony_results").update(payload).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      // Explicit id, no post-insert select (avoids the RLS select-after-insert pitfall).
      const newId = crypto.randomUUID();
      const { error } = await client.from("colony_results").insert({ id: newId, ...payload });
      if (error) throw new Error(error.message);
      existingId.set(key, newId);
    }

    await client
      .from("animal_experiments")
      .update({ status: "completed", completed_date: today })
      .eq("user_id", userId)
      .eq("animal_id", animalId)
      .eq("experiment_type", row.experiment)
      .eq("timepoint_age_days", row.timepoint)
      .neq("status", "completed");

    synced++;
  }

  return { rowCount: synced, skipped, unmatched, ignoredHeaders };
}
