import type { DatasetColumn } from "@/types";
import { normalizeSchemaSnapshot } from "@/lib/results-run-adapters";

export function normalizeLooseKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function serializeDatasetCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function isAnimalIdentityColumn(columnName: string) {
  const key = normalizeLooseKey(columnName);
  return [
    "__animalid",
    "animal",
    "animalid",
    "animalnumber",
    "animalno",
    "animalidentifier",
    "bpananimalnumber",
    "identifier",
    "mouse",
    "mouseid",
    "mousenumber",
    "eartag",
  ].includes(key);
}

export function isCohortIdentityColumn(columnName: string) {
  const key = normalizeLooseKey(columnName);
  return [
    "cohort",
    "cohortid",
    "cohortname",
    "cohortnumber",
    "bpancohort",
    "bpancohortnumber",
  ].includes(key);
}

export function extractNumericTokens(value: string) {
  const matches = value.match(/\d+/g) || [];
  return matches.map((entry) => entry.trim()).filter(Boolean);
}

export function buildLookupTokens(values: Array<string | null | undefined>) {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const serialized = String(value).trim();
    if (!serialized) continue;
    tokens.add(normalizeLooseKey(serialized));
    extractNumericTokens(serialized).forEach((token) => tokens.add(normalizeLooseKey(token)));
  }
  return tokens;
}

export function getImportedRowIdentityValues(row: Record<string, unknown>) {
  const animalValues: string[] = [];
  const cohortValues: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    const serialized = serializeDatasetCellValue(value).trim();
    if (!serialized) continue;
    if (isAnimalIdentityColumn(key)) animalValues.push(serialized);
    if (isCohortIdentityColumn(key)) cohortValues.push(serialized);
  }
  return { animalValues, cohortValues };
}

export type SyncableRunField = {
  key: string;
  name: string;
  type: DatasetColumn["type"];
  unit?: string;
  aliases: string[];
};

export function mapSnapshotColumnTypeToDatasetType(rawType: string | null | undefined): DatasetColumn["type"] {
  switch (rawType) {
    case "number":
    case "integer":
      return "numeric";
    case "select":
    case "multi_select":
    case "boolean":
    case "animal_ref":
    case "cohort_ref":
    case "batch_ref":
      return "categorical";
    case "date":
    case "datetime":
    case "time":
      return "date";
    default:
      return "text";
  }
}

export function buildSyncableRunFields(snapshot: unknown): SyncableRunField[] {
  return normalizeSchemaSnapshot(snapshot)
    .filter((column) => column.is_enabled !== false && column.isEnabled !== false)
    .map((column) => {
      const aliasCandidates = [column.label, column.name, column.key].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      );

      return {
        key: column.key || column.name || column.label || "field",
        name: column.label || column.name || column.key || "Field",
        type: mapSnapshotColumnTypeToDatasetType(column.column_type || column.columnType || column.type),
        unit: typeof column.unit === "string" && column.unit.trim() ? column.unit : undefined,
        aliases: Array.from(new Set(aliasCandidates)),
      };
    });
}

export type ImportedRowWithIdentity = {
  row: Record<string, unknown>;
  animalTokens: Set<string>;
  cohortTokens: Set<string>;
};

export function buildImportedRowsWithIdentity(data: Record<string, unknown>[]) {
  return data.map((row) => {
    const identities = getImportedRowIdentityValues(row);
    return {
      row,
      animalTokens: buildLookupTokens(identities.animalValues),
      cohortTokens: buildLookupTokens(identities.cohortValues),
    } satisfies ImportedRowWithIdentity;
  });
}

export function findImportedRowForAnimal(
  importedRows: ImportedRowWithIdentity[],
  animalIdentifiers: Array<string | null | undefined>,
  cohortIdentifiers: Array<string | null | undefined>
) {
  const animalTokens = buildLookupTokens(animalIdentifiers);
  const cohortTokens = buildLookupTokens(cohortIdentifiers);

  const importedMatch = importedRows.find((entry) => {
    const animalMatch = Array.from(animalTokens).some((token) => entry.animalTokens.has(token));
    if (!animalMatch) return false;
    if (entry.cohortTokens.size === 0) return true;
    return Array.from(cohortTokens).some((token) => entry.cohortTokens.has(token));
  });

  return importedMatch?.row || null;
}

export function buildImportedColumnAliasMap(columns: DatasetColumn[]) {
  const map = new Map<string, string>();
  for (const column of columns) {
    map.set(normalizeLooseKey(column.name), column.name);
  }
  return map;
}

export function findImportedColumnName(field: SyncableRunField, importedColumnByAlias: Map<string, string>) {
  return (
    field.aliases
      .map((alias) => importedColumnByAlias.get(normalizeLooseKey(alias)) || null)
      .find(Boolean) || null
  );
}

export function normalizeMeasureValue(value: unknown, fieldType: DatasetColumn["type"]): string | number | boolean | null | string[] {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "boolean") return value;
  if (fieldType === "numeric") {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : serializeDatasetCellValue(value);
  }
  return serializeDatasetCellValue(value);
}

export function buildColonyMeasuresFromImportedRow(args: {
  fields: SyncableRunField[];
  importedRow: Record<string, unknown>;
  importedColumnByAlias: Map<string, string>;
  existingMeasures?: Record<string, string | number | boolean | null | string[]> | null;
  existingNotes?: string | null;
}) {
  const measures = { ...(args.existingMeasures || {}) };
  let notes = args.existingNotes || null;

  for (const field of args.fields) {
    const importedColumnName = findImportedColumnName(field, args.importedColumnByAlias);
    if (!importedColumnName) continue;
    const importedValue = args.importedRow[importedColumnName];
    if (importedValue === undefined) continue;

    if (normalizeLooseKey(field.key) === "notes") {
      notes = serializeDatasetCellValue(importedValue) || null;
      continue;
    }

    measures[field.key] = normalizeMeasureValue(importedValue, field.type);
  }

  return { measures, notes };
}
