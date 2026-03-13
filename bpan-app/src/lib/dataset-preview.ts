import Papa from "papaparse";
import type { DatasetColumn } from "@/types";
import { maybeDecodeRtf, parseMetricReportPreview } from "@/lib/results-import";

function normalizeHeaders(headers: string[]) {
  const normalized = headers.map((header) => header.trim());
  const blankHeaders = normalized.filter((header) => header.length === 0);
  const duplicateHeaders = normalized.filter((header, index) => header && normalized.indexOf(header) !== index);
  return {
    normalized,
    blankHeaders,
    duplicateHeaders: Array.from(new Set(duplicateHeaders)),
  };
}

export function detectDatasetColumnType(values: unknown[]): DatasetColumn["type"] {
  const nonNull = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (nonNull.length === 0) return "text";

  const numericCount = nonNull.filter((value) => !Number.isNaN(Number(value))).length;
  if (numericCount / nonNull.length > 0.8) return "numeric";

  const dateCount = nonNull.filter((value) => !Number.isNaN(Date.parse(String(value)))).length;
  if (dateCount / nonNull.length > 0.8) return "date";

  const uniqueCount = new Set(nonNull.map(String)).size;
  if (uniqueCount <= 20) return "categorical";
  return "text";
}

function detectPasteDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) return "\t";
  if (semicolonCount > commaCount && semicolonCount > 0) return ";";
  return ",";
}

export function parseDelimitedDatasetPreview(text: string) {
  const delimiter = detectPasteDelimiter(text);
  const result = Papa.parse(text.trim(), {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    delimiter,
  });
  const parseError = result.errors?.length
    ? `Parse warning: ${result.errors[0]?.message || "Unknown parsing issue"}`
    : null;
  const data = result.data as Record<string, unknown>[];
  const { normalized: colNames, blankHeaders, duplicateHeaders } = normalizeHeaders(result.meta.fields || []);
  if (blankHeaders.length > 0) {
    return {
      columns: [] as DatasetColumn[],
      data: [] as Record<string, unknown>[],
      parseError: "Column header is blank. Add a name to every header cell in the first row.",
    };
  }
  if (duplicateHeaders.length > 0) {
    return {
      columns: [] as DatasetColumn[],
      data: [] as Record<string, unknown>[],
      parseError: `Duplicate header names found: ${duplicateHeaders.join(", ")}.`,
    };
  }
  if (colNames.length === 0) {
    return {
      columns: [] as DatasetColumn[],
      data: [] as Record<string, unknown>[],
      parseError: "No header row detected. Include a first row with column names.",
    };
  }
  const columns: DatasetColumn[] = colNames.map((name) => ({
    name,
    type: detectDatasetColumnType(data.map((row) => row[name])),
  }));
  return { columns, data, parseError };
}

export function parseTextDatasetPreview(rawText: string) {
  const reportPreview = parseMetricReportPreview(rawText);
  if (reportPreview) {
    return {
      columns: reportPreview.columns,
      data: reportPreview.data,
      parseError: reportPreview.errors[0] || null,
    };
  }

  return parseDelimitedDatasetPreview(maybeDecodeRtf(rawText));
}
