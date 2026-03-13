import * as XLSX from "xlsx";
import type { Dataset, Analysis, Figure, Animal, Cohort, ColonyResult } from "@/types";

type ResultsDatasetRecord = Dataset & {
  experiment_run_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
};

function clampSheetName(name: string, fallback: string) {
  const cleaned = (name || fallback).replace(/[\\/*?:[\]]/g, " ").trim();
  return cleaned.slice(0, 31) || fallback;
}

function appendSheet(
  workbook: XLSX.WorkBook,
  rows: Record<string, unknown>[],
  preferredName: string,
  fallbackName: string
) {
  const baseName = clampSheetName(preferredName, fallbackName);
  let sheetName = baseName;
  let index = 2;

  while (workbook.SheetNames.includes(sheetName)) {
    const suffix = `_${index}`;
    const maxBaseLength = Math.max(1, 31 - suffix.length);
    sheetName = `${baseName.slice(0, maxBaseLength)}${suffix}`;
    index += 1;
  }

  const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ empty: "" }]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename, { compression: true });
}

export type SheetRecordRow = Record<string, unknown>;
export type ExportSheet = {
  title: string;
  rows: SheetRecordRow[];
};

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => normalizeCellValue(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function orderedRow(row: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, normalizeCellValue(row[key])]));
}

function buildOrderedRows(rows: Record<string, unknown>[]) {
  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return rows.map((row) => orderedRow(row, keys));
}

export function buildResultsWorkspaceSheets(
  datasets: ResultsDatasetRecord[],
  analyses: Analysis[],
  figures: Figure[]
): ExportSheet[] {
  const sheets: ExportSheet[] = [];

  sheets.push({
    title: "Datasets Index",
    rows: buildOrderedRows(
      datasets.map((dataset, index) => ({
        dataset_id: dataset.id,
        sheet_title: clampSheetName(`${index + 1}_${dataset.name}`, `Dataset_${index + 1}`),
        name: dataset.name,
        description: dataset.description || "",
        row_count: dataset.row_count,
        column_count: dataset.columns.length,
        source: dataset.source,
        experiment_id: dataset.experiment_id || "",
        experiment_run_id: dataset.experiment_run_id || "",
        result_schema_id: dataset.result_schema_id || "",
        tags: (dataset.tags || []).join(", "),
        created_at: dataset.created_at,
        updated_at: dataset.updated_at,
      }))
    ),
  });

  sheets.push({
    title: "Analyses",
    rows: buildOrderedRows(
      analyses.map((analysis) => ({
        analysis_id: analysis.id,
        dataset_id: analysis.dataset_id,
        name: analysis.name,
        test_type: analysis.test_type,
        ai_interpretation: analysis.ai_interpretation || "",
        created_at: analysis.created_at,
        config_json: JSON.stringify(analysis.config || {}),
        results_json: JSON.stringify(analysis.results || {}),
      }))
    ),
  });

  sheets.push({
    title: "Figures",
    rows: buildOrderedRows(
      figures.map((figure) => ({
        figure_id: figure.id,
        dataset_id: figure.dataset_id,
        analysis_id: figure.analysis_id || "",
        name: figure.name,
        chart_type: figure.chart_type,
        created_at: figure.created_at,
        updated_at: figure.updated_at,
        config_json: JSON.stringify(figure.config || {}),
      }))
    ),
  });

  datasets.forEach((dataset, index) => {
    sheets.push({
      title: clampSheetName(`${index + 1}_${dataset.name}`, `Dataset_${index + 1}`),
      rows: buildOrderedRows(
        dataset.data.map((row, rowIndex) =>
          Object.fromEntries([
            ["row_number", rowIndex + 1],
            ...dataset.columns.map((column) => [column.name, row[column.name]]),
          ])
        )
      ),
    });
  });

  return sheets;
}

export function buildColonyResultsSheets(
  colonyResults: ColonyResult[],
  animals: Animal[],
  cohorts: Cohort[]
): ExportSheet[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));

  const summaryRows = buildOrderedRows(
    colonyResults.map((result) => {
      const animal = animalById.get(result.animal_id);
      const cohort = animal?.cohort_id ? cohortById.get(animal.cohort_id) : null;
      return {
        result_id: result.id,
        animal_id: result.animal_id,
        animal_identifier: animal?.identifier || "",
        ear_tag: animal?.ear_tag || "",
        cohort: cohort?.name || "",
        genotype: animal?.genotype || "",
        sex: animal?.sex || "",
        timepoint_age_days: result.timepoint_age_days,
        experiment_type: result.experiment_type,
        notes: result.notes || "",
        recorded_at: result.recorded_at,
        created_at: result.created_at,
        updated_at: result.updated_at,
        ...result.measures,
      };
    })
  );

  const sheets: ExportSheet[] = [{ title: "All Colony Results", rows: summaryRows }];
  const grouped = new Map<string, SheetRecordRow[]>();

  for (const row of summaryRows) {
    const key = `${row.experiment_type}__${row.timepoint_age_days}`;
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, rows], index) => {
      const [experimentType, timepointAgeDays] = key.split("__");
      sheets.push({
        title: clampSheetName(`${experimentType}_${timepointAgeDays}d`, `Results_${index + 1}`),
        rows,
      });
    });

  return sheets;
}

export function exportResultsWorkspaceWorkbook(
  datasets: ResultsDatasetRecord[],
  analyses: Analysis[],
  figures: Figure[]
) {
  const workbook = XLSX.utils.book_new();
  buildResultsWorkspaceSheets(datasets, analyses, figures).forEach((sheet, index) => {
    appendSheet(workbook, sheet.rows, sheet.title, `Sheet_${index + 1}`);
  });

  downloadWorkbook(workbook, `bpan-results-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportColonyResultsWorkbook(
  colonyResults: ColonyResult[],
  animals: Animal[],
  cohorts: Cohort[]
) {
  const workbook = XLSX.utils.book_new();
  buildColonyResultsSheets(colonyResults, animals, cohorts).forEach((sheet, index) => {
    appendSheet(workbook, sheet.rows, sheet.title, `Sheet_${index + 1}`);
  });

  downloadWorkbook(workbook, `bpan-colony-results-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
