import type { DatasetColumn } from "@/types";

export type TabularPreview = {
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  headerWarnings: string[];
};

const RESERVED_COLONY_KEYS = new Set([
  "animal_id",
  "animal_identifier",
  "animal",
  "mouse",
  "mouse_id",
  "identifier",
  "timepoint_age_days",
  "age_days",
  "timepoint",
  "day",
  "experiment_type",
  "experiment",
  "assay",
  "test",
  "notes",
  "note",
  "comment",
  "comments",
]);

function normalizeHeaderName(header: unknown) {
  return String(header || "").trim();
}

function detectColumnType(values: unknown[]): DatasetColumn["type"] {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return "text";
  const numericCount = nonNull.filter((v) => !Number.isNaN(Number(v))).length;
  if (numericCount / nonNull.length > 0.8) return "numeric";
  const dateCount = nonNull.filter((v) => !Number.isNaN(Date.parse(String(v)))).length;
  if (dateCount / nonNull.length > 0.8) return "date";
  const uniqueCount = new Set(nonNull.map((v) => String(v))).size;
  if (uniqueCount <= 20) return "categorical";
  return "text";
}

export function parseRowsToTabularPreview(rows: string[][]): TabularPreview {
  if (rows.length === 0) return { columns: [], data: [], headerWarnings: ["No rows found."] };

  const rawHeaders = rows[0] || [];
  const normalizedHeaders = rawHeaders.map(normalizeHeaderName);
  const blankHeaders = normalizedHeaders.filter((h) => !h);
  const duplicateHeaders = normalizedHeaders.filter(
    (h, idx) => h && normalizedHeaders.indexOf(h) !== idx
  );

  const headerWarnings: string[] = [];
  if (blankHeaders.length > 0) headerWarnings.push("One or more column headers are blank.");
  if (duplicateHeaders.length > 0) {
    headerWarnings.push(`Duplicate headers: ${Array.from(new Set(duplicateHeaders)).join(", ")}`);
  }

  if (normalizedHeaders.length === 0 || normalizedHeaders.every((h) => !h)) {
    return { columns: [], data: [], headerWarnings: ["No header row detected."] };
  }

  const safeHeaders = normalizedHeaders.map((header, idx) => header || `Column_${idx + 1}`);
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  const data = dataRows.map((row) => {
    const mapped: Record<string, unknown> = {};
    safeHeaders.forEach((header, idx) => {
      mapped[header] = row[idx] ?? "";
    });
    return mapped;
  });
  const columns: DatasetColumn[] = safeHeaders.map((name) => ({
    name,
    type: detectColumnType(data.map((row) => row[name])),
  }));

  return { columns, data, headerWarnings };
}

function normalizeKey(value: string) {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function findMatchingKey(keys: string[], aliases: string[]) {
  const keyMap = new Map(keys.map((k) => [normalizeKey(k), k]));
  for (const alias of aliases) {
    const match = keyMap.get(alias);
    if (match) return match;
  }
  return null;
}

export function detectImportTarget(
  columns: DatasetColumn[],
  forcedTarget: "auto" | "dataset" | "colony_results" = "auto"
) {
  if (forcedTarget !== "auto") return forcedTarget;
  const keys = columns.map((c) => c.name);
  const animalKey = findMatchingKey(keys, [
    "animal_id",
    "animal_identifier",
    "animal",
    "mouse",
    "mouse_id",
    "identifier",
  ]);
  const timepointKey = findMatchingKey(keys, [
    "timepoint_age_days",
    "age_days",
    "timepoint",
    "day",
  ]);
  const experimentKey = findMatchingKey(keys, [
    "experiment_type",
    "experiment",
    "assay",
    "test",
  ]);
  if (animalKey && timepointKey && experimentKey) return "colony_results";
  return "dataset";
}

export function buildColonyMapping(columns: DatasetColumn[]) {
  const keys = columns.map((c) => c.name);
  const animalKey = findMatchingKey(keys, [
    "animal_id",
    "animal_identifier",
    "animal",
    "mouse",
    "mouse_id",
    "identifier",
  ]);
  const timepointKey = findMatchingKey(keys, [
    "timepoint_age_days",
    "age_days",
    "timepoint",
    "day",
  ]);
  const experimentKey = findMatchingKey(keys, [
    "experiment_type",
    "experiment",
    "assay",
    "test",
  ]);
  const notesKey = findMatchingKey(keys, ["notes", "note", "comment", "comments"]);

  const measureKeys = keys.filter((key) => !RESERVED_COLONY_KEYS.has(normalizeKey(key)));
  return {
    animalKey,
    timepointKey,
    experimentKey,
    notesKey,
    measureKeys,
  };
}
