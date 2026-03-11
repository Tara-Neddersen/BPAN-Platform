import type { DatasetColumn } from "@/types";

export type ParsedImportPreview = {
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  format: "report";
  errors: string[];
};

function extractAnimalIdentifiers(animalId: string) {
  const match = animalId.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return {
      cohortNumber: null as number | null,
      animalNumber: null as number | null,
    };
  }

  return {
    cohortNumber: Number(match[1]),
    animalNumber: Number(match[2]),
  };
}

function detectColumnType(values: unknown[]): DatasetColumn["type"] {
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

function splitReportLine(line: string) {
  if (line.includes("\t")) {
    return line
      .split(/\t+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return line
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeHeaderCell(header: string) {
  return header.replace(/\s*\((?:notes?|note)\s*[^)]*\)\s*/gi, "").replace(/\s+/g, " ").trim();
}

function cleanMetricValue(rawValue: string | undefined, animalId: string) {
  if (!rawValue) return null;

  const stripped = rawValue
    .replace(new RegExp(`\\s*\\(${animalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`), "")
    .trim();

  if (!stripped || stripped === "-" || stripped.toUpperCase() === "#N/A") {
    return null;
  }

  const numericCandidate = Number(stripped);
  if (!Number.isNaN(numericCandidate) && /^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(stripped)) {
    return numericCandidate;
  }

  return stripped;
}

function extractTaggedAnimalId(rawValue: string | undefined) {
  if (!rawValue) return null;
  const match = rawValue.match(/\(([^()]+)\)\s*$/);
  return match ? match[1].trim() : null;
}

function isAnimalId(value: string | undefined) {
  if (!value) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*$/.test(value);
}

function compareAnimalIds(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function makeUniqueMetricName(metric: string, used: Set<string>) {
  if (!used.has(metric)) {
    used.add(metric);
    return metric;
  }

  let suffix = 2;
  let candidate = `${metric} (${suffix})`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${metric} (${suffix})`;
  }
  used.add(candidate);
  return candidate;
}

function findNextNonEmptyLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index]?.trim()) return index;
  }
  return -1;
}

export function maybeDecodeRtf(rawText: string) {
  if (!rawText.trim().startsWith("{\\rtf")) return rawText;

  let text = rawText.replace(/\r\n/g, "\n");
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  text = text.replace(/\\u(-?\d+)\??/g, (_, rawCode: string) => {
    let code = Number(rawCode);
    if (Number.isNaN(code)) return "";
    if (code < 0) code += 65536;
    return String.fromCharCode(code);
  });
  text = text.replace(/\\par[d]?/g, "\n");
  text = text.replace(/\\line/g, "\n");
  text = text.replace(/\\tab/g, "\t");
  text = text.replace(/\\[a-zA-Z]+-?\d* ?/g, "");
  text = text.replace(/\\~/g, " ");
  text = text.replace(/\\-/g, "-");
  text = text.replace(/\\\\/g, "\\");
  text = text.replace(/\\\{/g, "{").replace(/\\\}/g, "}");
  text = text.replace(/[{}]/g, "");
  return text;
}

export function parseMetricReportPreview(rawInput: string): ParsedImportPreview | null {
  const text = maybeDecodeRtf(rawInput)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = text.split("\n").map((line) => line.replace(/\s+$/g, ""));

  const rowsByAnimal = new Map<string, Record<string, unknown>>();
  const metricOrder: string[] = [];
  const usedMetricNames = new Set<string>();
  const errors: string[] = [];
  let parsedMetricBlocks = 0;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const metricTitle = lines[index]?.trim();
    if (!metricTitle || metricTitle === "Notes:" || /^\d+\./.test(metricTitle)) {
      continue;
    }

    const headerIndex = findNextNonEmptyLine(lines, index + 1);
    if (headerIndex === -1) continue;
    const headerLine = lines[headerIndex]?.trim();

    if (!metricTitle || !headerLine || !headerLine.startsWith("Animal number")) {
      continue;
    }

    const headerCells = splitReportLine(headerLine).map(normalizeHeaderCell);
    const animalIndex = headerCells.findIndex((cell) => cell.toLowerCase() === "animal number");
    if (animalIndex === -1) continue;

    const metricName = makeUniqueMetricName(metricTitle, usedMetricNames);
    const meanIndex = headerCells.findIndex((cell) => cell.toLowerCase() === "mean");
    const dataIndex = headerCells.findIndex((cell) => cell.toLowerCase() === "data");
    const blockAnimals = new Set<string>();
    let blockRowCount = 0;

    for (let rowIndex = headerIndex + 1; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex]?.trim();
      if (!rowLine) continue;

      if (rowLine === "Notes:") {
        parsedMetricBlocks += blockRowCount > 0 ? 1 : 0;
        metricOrder.push(metricName);
        index = rowIndex;
        while (index + 1 < lines.length) {
          const nextIndex = findNextNonEmptyLine(lines, index + 1);
          if (nextIndex === -1) break;
          const titleCandidate = lines[nextIndex]?.trim();
          const headerCandidateIndex = findNextNonEmptyLine(lines, nextIndex + 1);
          const headerCandidate = headerCandidateIndex >= 0 ? lines[headerCandidateIndex]?.trim() : "";
          if (titleCandidate && headerCandidate?.startsWith("Animal number")) {
            index = nextIndex - 1;
            break;
          }
          index += 1;
        }
        break;
      }

      const cells = splitReportLine(rowLine);
      const animalId = cells[animalIndex];
      if (!isAnimalId(animalId)) {
        const nextIndex = findNextNonEmptyLine(lines, rowIndex + 1);
        if (nextIndex >= 0 && lines[nextIndex]?.trim().startsWith("Animal number")) {
          parsedMetricBlocks += blockRowCount > 0 ? 1 : 0;
          metricOrder.push(metricName);
          index = nextIndex - 2;
          break;
        }
        continue;
      }

      if (blockAnimals.has(animalId)) {
        errors.push(`Duplicate animal '${animalId}' found in metric '${metricName}'.`);
        continue;
      }
      blockAnimals.add(animalId);

      const taggedAnimalId = extractTaggedAnimalId(
        (dataIndex >= 0 ? cells[dataIndex] : undefined) ?? cells[cells.length - 1]
      );
      if (taggedAnimalId && taggedAnimalId !== animalId) {
        errors.push(
          `Animal mismatch in metric '${metricName}': row '${animalId}' contains value tagged for '${taggedAnimalId}'.`
        );
        continue;
      }

      const preferredValue =
        (meanIndex >= 0 ? cells[meanIndex] : undefined) ??
        (dataIndex >= 0 ? cells[dataIndex] : undefined) ??
        cells[cells.length - 1];
      const fallbackValue =
        (dataIndex >= 0 ? cells[dataIndex] : undefined) ?? cells[cells.length - 1];
      const value = cleanMetricValue(preferredValue, animalId) ?? cleanMetricValue(fallbackValue, animalId);

      const row: Record<string, unknown> = rowsByAnimal.get(animalId) ?? (() => {
        const identifiers = extractAnimalIdentifiers(animalId);
        return {
          "Animal number": animalId,
          "BPAN cohort number": identifiers.cohortNumber,
          "BPAN animal number": identifiers.animalNumber,
        };
      })();
      row[metricName] = value;
      rowsByAnimal.set(animalId, row);
      blockRowCount += 1;

      if (rowIndex === lines.length - 1) {
        parsedMetricBlocks += blockRowCount > 0 ? 1 : 0;
        metricOrder.push(metricName);
        index = rowIndex;
      }
    }
  }

  if (parsedMetricBlocks === 0 || rowsByAnimal.size === 0 || metricOrder.length === 0) {
    return null;
  }

  const animalIds = Array.from(rowsByAnimal.keys()).sort(compareAnimalIds);
  for (const metricName of metricOrder) {
    for (const animalId of animalIds) {
      const row = rowsByAnimal.get(animalId);
      if (!row) continue;
      if (!(metricName in row)) {
        errors.push(`Metric '${metricName}' is missing animal '${animalId}'.`);
      }
    }
  }

  const data = Array.from(rowsByAnimal.values()).sort((left, right) =>
    compareAnimalIds(String(left["Animal number"] ?? ""), String(right["Animal number"] ?? ""))
  );
  const columnNames = ["Animal number", "BPAN cohort number", "BPAN animal number", ...metricOrder];
  const columns: DatasetColumn[] = columnNames.map((name) => ({
    name,
    type: detectColumnType(data.map((row) => row[name])),
  }));

  return {
    columns,
    data,
    format: "report",
    errors,
  };
}
