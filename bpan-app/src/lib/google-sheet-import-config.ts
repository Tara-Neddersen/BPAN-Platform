import type { DatasetColumn } from "@/types";
import { buildColonyMapping } from "@/lib/google-sheet-sync";

export type GoogleSheetImportConfig = {
  selectedColumns?: string[];
  rowStart?: number;
  rowEnd?: number;
  colonyMapping?: {
    animalKey?: string;
    timepointKey?: string;
    experimentKey?: string;
    notesKey?: string;
  };
};

function toPositiveInt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

export function sanitizeImportConfig(raw: unknown): GoogleSheetImportConfig {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const selectedColumns = Array.isArray(input.selectedColumns)
    ? input.selectedColumns.map((v) => String(v)).filter(Boolean)
    : undefined;
  const rowStart = toPositiveInt(input.rowStart);
  const rowEnd = toPositiveInt(input.rowEnd);
  const colonyMappingRaw =
    input.colonyMapping && typeof input.colonyMapping === "object"
      ? (input.colonyMapping as Record<string, unknown>)
      : {};
  const colonyMapping = {
    animalKey: colonyMappingRaw.animalKey ? String(colonyMappingRaw.animalKey) : undefined,
    timepointKey: colonyMappingRaw.timepointKey ? String(colonyMappingRaw.timepointKey) : undefined,
    experimentKey: colonyMappingRaw.experimentKey ? String(colonyMappingRaw.experimentKey) : undefined,
    notesKey: colonyMappingRaw.notesKey ? String(colonyMappingRaw.notesKey) : undefined,
  };

  return {
    selectedColumns: selectedColumns && selectedColumns.length > 0 ? selectedColumns : undefined,
    rowStart: rowStart ?? undefined,
    rowEnd: rowEnd ?? undefined,
    colonyMapping:
      colonyMapping.animalKey ||
      colonyMapping.timepointKey ||
      colonyMapping.experimentKey ||
      colonyMapping.notesKey
        ? colonyMapping
        : undefined,
  };
}

export function applyImportConfig(
  columns: DatasetColumn[],
  data: Record<string, unknown>[],
  config: GoogleSheetImportConfig
) {
  let nextColumns = columns;
  let nextData = data;

  if (config.selectedColumns && config.selectedColumns.length > 0) {
    const allowed = new Set(config.selectedColumns);
    nextColumns = columns.filter((col) => allowed.has(col.name));
    nextData = data.map((row) => {
      const filtered: Record<string, unknown> = {};
      for (const col of nextColumns) filtered[col.name] = row[col.name];
      return filtered;
    });
  }

  const rowStart = config.rowStart && config.rowStart > 0 ? config.rowStart : 1;
  const rowEnd = config.rowEnd && config.rowEnd > 0 ? config.rowEnd : null;
  const startIndex = Math.max(0, rowStart - 1);
  const endIndex = rowEnd ? Math.max(startIndex, rowEnd) : undefined;
  nextData = nextData.slice(startIndex, endIndex);

  return { columns: nextColumns, data: nextData };
}

export function resolveColonyMapping(
  columns: DatasetColumn[],
  config: GoogleSheetImportConfig
) {
  const base = buildColonyMapping(columns);
  const columnNames = new Set(columns.map((c) => c.name));
  const override = config.colonyMapping || {};
  const animalKey = override.animalKey && columnNames.has(override.animalKey) ? override.animalKey : base.animalKey;
  const timepointKey =
    override.timepointKey && columnNames.has(override.timepointKey) ? override.timepointKey : base.timepointKey;
  const experimentKey =
    override.experimentKey && columnNames.has(override.experimentKey) ? override.experimentKey : base.experimentKey;
  const notesKey = override.notesKey && columnNames.has(override.notesKey) ? override.notesKey : base.notesKey;
  return {
    ...base,
    animalKey,
    timepointKey,
    experimentKey,
    notesKey,
  };
}
