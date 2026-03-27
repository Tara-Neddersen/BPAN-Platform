import type { DatasetColumn } from "@/types";

export interface ResultSchemaSnapshotColumn {
  key?: string | null;
  name?: string | null;
  label?: string | null;
  column_type?: string | null;
  columnType?: string | null;
  type?: string | null;
  is_enabled?: boolean | null;
  isEnabled?: boolean | null;
  required?: boolean | null;
  default_value?: unknown;
  defaultValue?: unknown;
  unit?: string | null;
  sort_order?: number | null;
  sortOrder?: number | null;
}

export interface SnapshotReconciliationGuardrails {
  missingRequiredColumnsWithoutDefault: string[];
  missingRequiredValuesWithoutDefault: string[];
  addedFromSnapshotWithDefault: string[];
  addedFromSnapshotWithoutDefault: string[];
  extraIncomingColumns: string[];
  typeMismatches: string[];
}

export interface SnapshotReconciliationResult {
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  hasSnapshot: boolean;
  guardrails: SnapshotReconciliationGuardrails;
  canImport: boolean;
}

function normalizeColumnKey(value: string) {
  return value.trim().toLowerCase();
}

function getSnapshotColumnKey(column: ResultSchemaSnapshotColumn): string | null {
  const rawKey = column.key || column.name || column.label;
  if (!rawKey || typeof rawKey !== "string") return null;
  return rawKey.trim() || null;
}

function getSnapshotColumnType(column: ResultSchemaSnapshotColumn) {
  return column.column_type || column.columnType || column.type;
}

function getSnapshotColumnSortOrder(column: ResultSchemaSnapshotColumn) {
  return column.sort_order ?? column.sortOrder ?? Number.MAX_SAFE_INTEGER;
}

function getSnapshotDefaultValue(column: ResultSchemaSnapshotColumn): unknown {
  return column.default_value ?? column.defaultValue ?? null;
}

function isRequiredColumn(column: ResultSchemaSnapshotColumn) {
  return Boolean(column.required);
}

function isMissingValue(value: unknown) {
  return value === null || value === undefined || value === "";
}

function mapSchemaColumnType(rawType: string | null | undefined): DatasetColumn["type"] | null {
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
    case "text":
    case "long_text":
    case "url":
    case "file":
      return "text";
    default:
      return null;
  }
}

export function normalizeSchemaSnapshot(snapshot: unknown): ResultSchemaSnapshotColumn[] {
  const snapshotColumns = Array.isArray(snapshot)
    ? snapshot
    : snapshot && typeof snapshot === "object"
      ? (
          (snapshot as { result_columns?: unknown }).result_columns ||
          (snapshot as { resultColumns?: unknown }).resultColumns ||
          (snapshot as { columns?: unknown }).columns
        )
      : null;

  if (!Array.isArray(snapshotColumns)) return [];

  return snapshotColumns
    .filter((entry): entry is ResultSchemaSnapshotColumn => Boolean(entry) && typeof entry === "object")
    .sort((a, b) => getSnapshotColumnSortOrder(a) - getSnapshotColumnSortOrder(b));
}

export function reconcileDataWithSchemaSnapshot(
  detectedColumns: DatasetColumn[],
  data: Record<string, unknown>[],
  snapshot: unknown
): SnapshotReconciliationResult {
  const normalizedSnapshot = normalizeSchemaSnapshot(snapshot);

  if (normalizedSnapshot.length === 0) {
    return {
      columns: detectedColumns,
      data,
      hasSnapshot: false,
      canImport: true,
      guardrails: {
        missingRequiredColumnsWithoutDefault: [],
        missingRequiredValuesWithoutDefault: [],
        addedFromSnapshotWithDefault: [],
        addedFromSnapshotWithoutDefault: [],
        extraIncomingColumns: [],
        typeMismatches: [],
      },
    };
  }

  const incomingByKey = new Map(
    detectedColumns.map((column) => [normalizeColumnKey(column.name), column] as const)
  );

  const baselineColumns: DatasetColumn[] = [];
  const usedIncomingKeys = new Set<string>();
  const missingRequiredColumnsWithoutDefault: string[] = [];
  const addedFromSnapshotWithDefault: string[] = [];
  const addedFromSnapshotWithoutDefault: string[] = [];
  const typeMismatches: string[] = [];
  const baselineInfo: Array<{
    outputName: string;
    incomingName: string | null;
    required: boolean;
    defaultValue: unknown;
    hasDefaultValue: boolean;
  }> = [];

  for (const snapshotColumn of normalizedSnapshot) {
    const key = getSnapshotColumnKey(snapshotColumn);
    if (!key) continue;

    const normalizedKey = normalizeColumnKey(key);
    const incomingColumn = incomingByKey.get(normalizedKey) || null;
    const mappedType = mapSchemaColumnType(getSnapshotColumnType(snapshotColumn));
    const outputName = incomingColumn?.name || key;
    const hasDefaultValue =
      snapshotColumn.default_value !== undefined || snapshotColumn.defaultValue !== undefined;
    const defaultValue = getSnapshotDefaultValue(snapshotColumn);
    const required = isRequiredColumn(snapshotColumn);

    if (incomingColumn) {
      usedIncomingKeys.add(normalizedKey);
      if (mappedType && incomingColumn.type !== mappedType) {
        typeMismatches.push(outputName);
      }
    } else if (hasDefaultValue) {
      addedFromSnapshotWithDefault.push(outputName);
    } else {
      addedFromSnapshotWithoutDefault.push(outputName);
      if (required) {
        missingRequiredColumnsWithoutDefault.push(outputName);
      }
    }

    baselineColumns.push({
      name: outputName,
      type: mappedType || incomingColumn?.type || "text",
      unit: snapshotColumn.unit || incomingColumn?.unit,
    });

    baselineInfo.push({
      outputName,
      incomingName: incomingColumn?.name || null,
      required,
      defaultValue,
      hasDefaultValue,
    });
  }

  const extraIncomingColumns = detectedColumns.filter(
    (column) => !usedIncomingKeys.has(normalizeColumnKey(column.name))
  );

  const reconciledData = data.map((row) => {
    const nextRow = { ...row };

    for (const info of baselineInfo) {
      const lookupKey = info.incomingName || info.outputName;
      const currentValue = row[lookupKey];

      if (isMissingValue(currentValue)) {
        nextRow[info.outputName] = info.hasDefaultValue ? info.defaultValue : null;
      } else {
        nextRow[info.outputName] = currentValue;
      }
    }

    return nextRow;
  });

  const missingRequiredValuesWithoutDefault = baselineInfo
    .filter((info) => info.required && !info.hasDefaultValue)
    .filter((info) =>
      reconciledData.some((row) => isMissingValue(row[info.outputName]))
    )
    .map((info) => info.outputName);

  return {
    columns: [...baselineColumns, ...extraIncomingColumns],
    data: reconciledData,
    hasSnapshot: true,
    canImport:
      missingRequiredColumnsWithoutDefault.length === 0 &&
      missingRequiredValuesWithoutDefault.length === 0,
    guardrails: {
      missingRequiredColumnsWithoutDefault,
      missingRequiredValuesWithoutDefault,
      addedFromSnapshotWithDefault,
      addedFromSnapshotWithoutDefault,
      extraIncomingColumns: extraIncomingColumns.map((column) => column.name),
      typeMismatches,
    },
  };
}
