"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  BarChart3,
  FlaskConical,
  Brain,
  Copy,
  Download,
  Loader2,
  Table as TableIcon,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  FileSpreadsheet,
  Info,
  Sparkles,
  Save,
  Link2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/ui/help-hint";
import { UI_SURFACE_TITLES } from "@/lib/ui-copy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createDataset,
  deleteDataset,
  saveAnalysis,
  deleteAnalysis,
} from "@/app/(protected)/results/actions";
import type { Dataset, DatasetColumn, Analysis, Figure, Experiment } from "@/types";
import {
  normalizeSchemaSnapshot,
  reconcileDataWithSchemaSnapshot,
  type SnapshotReconciliationGuardrails,
} from "@/lib/results-run-adapters";

// Dynamically import Plotly (it's heavy and client-only)
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectColumnType(values: unknown[]): DatasetColumn["type"] {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return "text";
  const numericCount = nonNull.filter((v) => !isNaN(Number(v))).length;
  if (numericCount / nonNull.length > 0.8) return "numeric";
  // Try date
  const dateCount = nonNull.filter((v) => !isNaN(Date.parse(String(v)))).length;
  if (dateCount / nonNull.length > 0.8) return "date";
  // Check if categorical (few unique values)
  const uniqueCount = new Set(nonNull.map(String)).size;
  if (uniqueCount <= 20) return "categorical";
  return "text";
}

function getNumericColumns(columns: DatasetColumn[]): string[] {
  return columns.filter((c) => c.type === "numeric").map((c) => c.name);
}

function getCategoricalColumns(columns: DatasetColumn[]): string[] {
  return columns.filter((c) => c.type === "categorical").map((c) => c.name);
}

function extractColumnValues(
  data: Record<string, unknown>[],
  col: string
): number[] {
  return data
    .map((r) => Number(r[col]))
    .filter((v) => !isNaN(v));
}

function groupByColumn(
  data: Record<string, unknown>[],
  groupCol: string,
  valueCol: string
): { labels: string[]; groups: number[][] } {
  const grouped: Record<string, number[]> = {};
  for (const row of data) {
    const key = String(row[groupCol] ?? "");
    if (!grouped[key]) grouped[key] = [];
    const val = Number(row[valueCol]);
    if (!isNaN(val)) grouped[key].push(val);
  }
  return {
    labels: Object.keys(grouped),
    groups: Object.values(grouped),
  };
}

function formatColumnList(columns: string[]) {
  if (columns.length <= 3) return columns.join(", ");
  return `${columns.slice(0, 3).join(", ")} +${columns.length - 3} more`;
}

function downloadTextFile(filename: string, content: string, contentType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCsvFromRows(rows: Record<string, unknown>[], columns: string[]) {
  const header = columns.map(escapeCsvCell).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","));
  return [header, ...lines].join("\n");
}

function normalizeHeaders(rawHeaders: string[]) {
  const normalized = rawHeaders.map((header) => String(header || "").trim());
  const blankHeaders = normalized.filter((header) => !header);
  const duplicateHeaders = normalized.filter((header, index) => header && normalized.indexOf(header) !== index);
  return {
    normalized,
    blankHeaders,
    duplicateHeaders: Array.from(new Set(duplicateHeaders)),
  };
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

// ─── Chart Colors ────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

const VISUALIZE_CHART_TYPES = new Set(["bar", "scatter", "box", "histogram", "line", "violin"]);

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  initialDatasets: ResultsDatasetRecord[];
  initialAnalyses: Analysis[];
  initialFigures: Figure[];
  experiments: Pick<Experiment, "id" | "title">[];
  runs: ExperimentRunOption[];
  initialDatasetId?: string | null;
  initialTab?: "data" | "visualize";
  initialAnalysisId?: string | null;
  initialFigureId?: string | null;
  initialPrefillTitle?: string | null;
  initialPrefillChartType?: string | null;
  initialPrefillPrompt?: string | null;
  initialOpenImport?: boolean;
  initialPrefillRunId?: string | null;
  initialPrefillDatasetName?: string | null;
  initialPrefillDatasetDescription?: string | null;
  initialPrefillExperimentId?: string | null;
  initialPrefillStarterAnalyses?: boolean;
}

type ResultsDatasetRecord = Dataset & {
  experiment_run_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
};

type ExperimentRunOption = {
  id: string;
  name: string;
  legacy_experiment_id?: string | null;
  result_schema_id?: string | null;
  schema_snapshot?: unknown;
  status?: string | null;
};

type DatasetRunLinkResolution = {
  run: ExperimentRunOption | null;
  mode: "explicit" | "legacy_inferred" | null;
};

export function ResultsClient({
  initialDatasets,
  initialAnalyses,
  initialFigures,
  experiments,
  runs,
  initialDatasetId = null,
  initialTab = "data",
  initialAnalysisId = null,
  initialFigureId = null,
  initialPrefillTitle = null,
  initialPrefillChartType = null,
  initialPrefillPrompt = null,
  initialOpenImport = false,
  initialPrefillRunId = null,
  initialPrefillDatasetName = null,
  initialPrefillDatasetDescription = null,
  initialPrefillExperimentId = null,
  initialPrefillStarterAnalyses = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [datasets, setDatasets] = useState<ResultsDatasetRecord[]>(initialDatasets);
  const [analyses] = useState(initialAnalyses);
  const [figures] = useState(initialFigures);
  const [activeTab, setActiveTab] = useState<"data" | "visualize">(initialTab);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    initialDatasets.find((d) => d.id === initialDatasetId)?.id || initialDatasets[0]?.id || null
  );
  const [showImport, setShowImport] = useState(initialOpenImport);
  const [showPaste, setShowPaste] = useState(false);
  const [showSheets, setShowSheets] = useState(false);

  const resolveDatasetRunLink = useCallback(
    (dataset: ResultsDatasetRecord | null): DatasetRunLinkResolution => {
      if (!dataset) return { run: null, mode: null };

      if (dataset.experiment_run_id) {
        const explicitRun = runs.find((run) => run.id === dataset.experiment_run_id) || null;
        if (explicitRun) return { run: explicitRun, mode: "explicit" };
      }

      if (!dataset.experiment_id) return { run: null, mode: null };
      const inferredCandidates = runs.filter(
        (run) => run.legacy_experiment_id && run.legacy_experiment_id === dataset.experiment_id
      );

      // Only infer when the mapping is unambiguous.
      if (inferredCandidates.length === 1) {
        return { run: inferredCandidates[0], mode: "legacy_inferred" };
      }

      return { run: null, mode: null };
    },
    [runs]
  );

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  );
  const selectedRunResolution = useMemo(
    () => resolveDatasetRunLink(selectedDataset),
    [resolveDatasetRunLink, selectedDataset]
  );
  const selectedRun = selectedRunResolution.run;

  const datasetAnalyses = useMemo(
    () =>
      selectedDatasetId
        ? analyses.filter((a) => a.dataset_id === selectedDatasetId)
        : [],
    [analyses, selectedDatasetId]
  );
  const datasetFigures = useMemo(
    () =>
      selectedDatasetId
        ? figures.filter((figure) => figure.dataset_id === selectedDatasetId)
        : [],
    [figures, selectedDatasetId]
  );

  const highlightedAnalysisId = initialAnalysisId;
  const highlightedFigureId = initialFigureId;
  const exportSelectedDatasetCsv = useCallback(() => {
    if (!selectedDataset) {
      toast.message("Select a dataset first.");
      return;
    }
    const csv = buildCsvFromRows(
      selectedDataset.data,
      selectedDataset.columns.map((column) => column.name)
    );
    downloadTextFile(
      `${selectedDataset.name.replace(/\s+/g, "_").toLowerCase()}-dataset.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  }, [selectedDataset]);

  const exportSelectedReportPack = useCallback(() => {
    if (!selectedDataset) {
      toast.message("Select a dataset first.");
      return;
    }
    const pack = {
      exported_at: new Date().toISOString(),
      dataset: {
        id: selectedDataset.id,
        name: selectedDataset.name,
        description: selectedDataset.description,
        row_count: selectedDataset.row_count,
        column_count: selectedDataset.columns.length,
        columns: selectedDataset.columns,
        experiment_id: selectedDataset.experiment_id,
        experiment_run_id: selectedDataset.experiment_run_id || null,
        run_link_mode: selectedRunResolution.mode,
      },
      analyses: datasetAnalyses,
      figures: datasetFigures,
    };
    downloadTextFile(
      `${selectedDataset.name.replace(/\s+/g, "_").toLowerCase()}-report-pack.json`,
      JSON.stringify(pack, null, 2),
      "application/json;charset=utf-8"
    );
  }, [datasetAnalyses, datasetFigures, selectedDataset, selectedRunResolution.mode]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("dataset", selectedDatasetId);
    next.set("tab", activeTab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [selectedDatasetId, activeTab, router, pathname, searchParams]);

  useEffect(() => {
    if (!highlightedAnalysisId && !highlightedFigureId) return;
    const targetId = highlightedAnalysisId ? `analysis-${highlightedAnalysisId}` : `figure-${highlightedFigureId}`;
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedAnalysisId, highlightedFigureId, selectedDatasetId, activeTab]);

  useEffect(() => {
    const status = searchParams?.get("sheets");
    const msg = searchParams?.get("msg");
    if (!status || !msg) return;
    if (status === "connected") toast.success(msg);
    else toast.error(msg);
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.delete("sheets");
    next.delete("msg");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div className="page-shell">
      <section className="results-hero section-card card-density-comfy space-y-4">
        <div className="page-header">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{UI_SURFACE_TITLES.results}</h1>
              <HelpHint text="Import data, run statistics, and build figures." />
            </div>
            <p className="text-sm text-muted-foreground">
              Unified workspace for datasets, exports, and publication-ready figures.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <TableIcon className="h-3 w-3" /> {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <FlaskConical className="h-3 w-3" />{" "}
                {selectedDataset ? datasetAnalyses.length : analyses.length}{" "}
                {selectedDataset ? "selected analys" : "total analys"}
                {(selectedDataset ? datasetAnalyses.length : analyses.length) === 1 ? "is" : "es"}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <BarChart3 className="h-3 w-3" />{" "}
                {selectedDataset ? datasetFigures.length : figures.length}{" "}
                {selectedDataset ? "selected figure" : "total figure"}
                {(selectedDataset ? datasetFigures.length : figures.length) === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button onClick={() => setShowImport(true)} className="touch-target gap-2">
              <Upload className="h-4 w-4" /> Import file
            </Button>
            {datasets.length > 0 && (
              <>
                <Button variant="outline" onClick={() => setShowPaste(true)} className="touch-target gap-2 hidden sm:inline-flex">
                  <ClipboardPaste className="h-4 w-4" /> Paste data
                </Button>
                <Button variant="outline" onClick={() => setShowSheets(true)} className="touch-target gap-2 hidden sm:inline-flex">
                  <Link2 className="h-4 w-4" /> Link Google Sheet
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setShowPaste(true)}
                  className="touch-target sm:hidden"
                  aria-label="Paste data"
                  title="Paste data"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setShowSheets(true)}
                  className="touch-target sm:hidden"
                  aria-label="Link Google Sheet"
                  title="Link Google Sheet"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {datasets.length > 0 && (
          <div className="results-hero-inner space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm font-medium">Dataset:</Label>
                <HelpHint text="Choose the dataset to review, analyze, or chart." />
              </div>
              <Select
                value={selectedDatasetId || ""}
                onValueChange={setSelectedDatasetId}
              >
                <SelectTrigger className="w-full sm:w-[320px]">
                  <SelectValue placeholder="Select a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.row_count} rows)
                      {resolveDatasetRunLink(d).mode === "legacy_inferred" ? " • legacy linked" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDataset && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive gap-1"
                  onClick={async () => {
                    if (confirm(`Delete "${selectedDataset.name}"?`)) {
                      await deleteDataset(selectedDataset.id);
                      setDatasets((prev) => prev.filter((d) => d.id !== selectedDataset.id));
                      setSelectedDatasetId(datasets.find((d) => d.id !== selectedDataset.id)?.id || null);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>

            {selectedDataset && (selectedRun || selectedDataset.experiment_id) && (
              <div className="flex flex-wrap gap-2">
                {selectedRun && (
                  <Badge variant="outline" className="gap-1">
                    <FlaskConical className="h-3 w-3" />
                    From run: {selectedRun.name}{selectedRun.status ? ` (${selectedRun.status})` : ""}
                  </Badge>
                )}
                {selectedRunResolution.mode === "legacy_inferred" && (
                  <Badge variant="outline">
                    Legacy linked (inferred)
                  </Badge>
                )}
                {selectedDataset.experiment_id && (
                  <Badge variant="secondary">
                    Experiment: linked
                  </Badge>
                )}
                {normalizeSchemaSnapshot(selectedDataset.schema_snapshot).length > 0 && (
                  <Badge variant="outline">
                    Schema applied
                  </Badge>
                )}
              </div>
            )}
            {selectedDataset && (
              <div className="rounded-xl border bg-background/85 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {datasetAnalyses.length} analyses • {datasetFigures.length} figures • {selectedDataset.columns.length} columns • {selectedDataset.row_count} rows
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/colony/analysis")}>
                      Open Analysis
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveTab("visualize")}>
                      Open Visualize
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs hidden sm:inline-flex" onClick={exportSelectedDatasetCsv}>
                      Export CSV
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs hidden sm:inline-flex" onClick={exportSelectedReportPack}>
                      Report Pack
                    </Button>
                    <details className="sm:hidden text-xs">
                      <summary className="cursor-pointer list-none rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                        Exports
                      </summary>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportSelectedDatasetCsv}>
                          Export CSV
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportSelectedReportPack}>
                          Report Pack
                        </Button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main content */}
      {!selectedDataset ? (
        <div className="rounded-2xl border border-dashed bg-gradient-to-b from-white to-slate-50/80 p-8 text-center sm:p-12">
          <div className="mb-4 inline-flex rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <BarChart3 className="h-8 w-8 text-primary" />
          </div>
          <div className="mb-4 flex items-center justify-center gap-1.5">
            <h3 className="font-medium text-lg">No data yet</h3>
            <HelpHint text="Upload a CSV or Excel file, or paste table data to create your first dataset." />
          </div>
          <p className="mx-auto mb-5 max-w-xl text-sm text-muted-foreground">
            For run-linked capture, use <span className="font-medium">Create Dataset from Run</span> on the run screen.
          </p>
          <div className="mx-auto mb-6 grid max-w-lg grid-cols-1 gap-2 text-left text-xs text-muted-foreground sm:grid-cols-3">
            <div className="rounded-lg border bg-background/80 px-3 py-2">
              <span className="font-medium text-foreground">1.</span> Import or paste raw values
            </div>
            <div className="rounded-lg border bg-background/80 px-3 py-2">
              <span className="font-medium text-foreground">2.</span> Run analyses and compare outcomes
            </div>
            <div className="rounded-lg border bg-background/80 px-3 py-2">
              <span className="font-medium text-foreground">3.</span> Export figures and report packs
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use the <span className="font-medium">Import file</span> button in the header to get started.
          </p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "data" | "visualize")} className="space-y-4">
          <TabsList className="sticky-section-switcher h-auto w-full justify-start gap-1 px-1 py-1">
            <TabsTrigger value="data" className="touch-target gap-1.5">
              <TableIcon className="h-3.5 w-3.5" /> Data
            </TabsTrigger>
            <TabsTrigger value="visualize" className="touch-target gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Visualize
            </TabsTrigger>
          </TabsList>

          {/* ─── DATA TAB ─── */}
          <TabsContent value="data">
            <DataTable dataset={selectedDataset} />
          </TabsContent>

          {/* ─── VISUALIZE TAB ─── */}
          <TabsContent value="visualize">
            <VisualizePanel
              dataset={selectedDataset}
              figures={datasetFigures}
              highlightedFigureId={highlightedFigureId}
              initialPrefillTitle={initialPrefillTitle}
              initialPrefillChartType={initialPrefillChartType}
              initialPrefillPrompt={initialPrefillPrompt}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Import Dialog */}
      {showImport && (
        <ImportDialog
          experiments={experiments}
          runs={runs}
          prefillRunId={initialPrefillRunId}
          prefillDatasetName={initialPrefillDatasetName}
          prefillDatasetDescription={initialPrefillDatasetDescription}
          prefillExperimentId={initialPrefillExperimentId}
          onClose={() => setShowImport(false)}
          onImported={(ds) => {
            setDatasets((prev) => [ds, ...prev]);
            setSelectedDatasetId(ds.id);
            if (initialPrefillStarterAnalyses) router.push("/colony/analysis");
            setShowImport(false);
          }}
        />
      )}

      {/* Paste Dialog */}
      {showPaste && (
        <PasteDialog
          experiments={experiments}
          runs={runs}
          prefillRunId={initialPrefillRunId}
          prefillDatasetName={initialPrefillDatasetName}
          prefillDatasetDescription={initialPrefillDatasetDescription}
          prefillExperimentId={initialPrefillExperimentId}
          onClose={() => setShowPaste(false)}
          onImported={(ds) => {
            setDatasets((prev) => [ds, ...prev]);
            setSelectedDatasetId(ds.id);
            if (initialPrefillStarterAnalyses) router.push("/colony/analysis");
            setShowPaste(false);
          }}
        />
      )}

      {showSheets && (
        <GoogleSheetsDialog
          experiments={experiments}
          runs={runs}
          onClose={() => setShowSheets(false)}
          onDatasetSynced={(dataset) => {
            setDatasets((prev) => {
              const idx = prev.findIndex((item) => item.id === dataset.id);
              if (idx === -1) return [dataset, ...prev];
              const next = [...prev];
              next[idx] = dataset;
              return next;
            });
            setSelectedDatasetId(dataset.id);
          }}
        />
      )}
    </div>
  );
}

// ─── Data Table ──────────────────────────────────────────────────────────────

function DataTable({ dataset }: { dataset: Dataset }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const rows = dataset.data.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(dataset.data.length / pageSize);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {dataset.name} — {dataset.row_count} rows, {dataset.columns.length} columns
          </CardTitle>
          <div className="flex items-center gap-2">
            {dataset.columns.map((col) => (
              <Badge key={col.name} variant="secondary" className="text-xs">
                {col.name}
                <span className="ml-1 opacity-60">({col.type})</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                {dataset.columns.map((col) => (
                  <th key={col.name} className="px-3 py-2 text-left font-medium">
                    {col.name}
                    {col.unit && (
                      <span className="ml-1 text-muted-foreground">({col.unit})</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t hover:bg-accent/50">
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {page * pageSize + i + 1}
                  </td>
                  {dataset.columns.map((col) => (
                    <td key={col.name} className="px-3 py-1.5">
                      {String(row[col.name] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t text-xs">
            <span className="text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Analyze Panel ───────────────────────────────────────────────────────────

// Analysis stays in this file for reuse, but is currently mounted from the dedicated Analysis surface.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AnalyzePanel({
  dataset,
  analyses,
  allAnalyses,
  highlightedAnalysisId,
  prefillStarterAnalyses,
  onNewAnalysis,
  onDeleteAnalysis,
}: {
  dataset: Dataset;
  analyses: Analysis[];
  allAnalyses: Analysis[];
  highlightedAnalysisId?: string | null;
  prefillStarterAnalyses?: boolean;
  onNewAnalysis: (a: Analysis) => void;
  onDeleteAnalysis: (id: string) => void;
}) {
  type AnalysisConfigLike = {
    test_type: Analysis["test_type"];
    config: { col1?: string; col2?: string; groupCol?: string };
  };
  type AnalysisPreset = {
    id: string;
    name: string;
    test_type: Analysis["test_type"];
    col1: string;
    col2: string;
    groupCol: string;
    created_at: string;
  };
  const PRESET_STORAGE_KEY = "bpan.analysis-presets.v1";
  const [testType, setTestType] = useState("descriptive");
  const [col1, setCol1] = useState("");
  const [col2, setCol2] = useState("");
  const [groupCol, setGroupCol] = useState("");
  const [running, setRunning] = useState(false);
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingStarters, setCreatingStarters] = useState(false);
  const [hasAttemptedStarterPrefill, setHasAttemptedStarterPrefill] = useState(false);
  const [starterProgress, setStarterProgress] = useState<string>("");
  const [presets, setPresets] = useState<AnalysisPreset[]>([]);
  const [presetDraftName, setPresetDraftName] = useState("");
  const [showManagePresets, setShowManagePresets] = useState(false);

  const numericCols = getNumericColumns(dataset.columns);
  const categoricalCols = getCategoricalColumns(dataset.columns);

  const TEST_OPTIONS = [
    { value: "descriptive", label: "Descriptive Statistics", desc: "Mean, median, SD, quartiles" },
    { value: "t_test", label: "t-Test (two groups)", desc: "Compare means between two groups" },
    { value: "anova", label: "ANOVA (3+ groups)", desc: "Compare means across multiple groups" },
    { value: "mann_whitney", label: "Mann-Whitney U", desc: "Non-parametric comparison of two groups" },
    { value: "correlation", label: "Correlation", desc: "Relationship between two variables" },
  ];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AnalysisPreset[];
      if (!Array.isArray(parsed)) return;
      setPresets(
        parsed.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.test_type === "string"
        )
      );
    } catch {
      // Ignore invalid persisted data.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  function buildInputData(
    analysisType: string,
    valueCol: string,
    secondaryCol: string,
    groupingCol: string
  ) {
    switch (analysisType) {
      case "descriptive":
        return { values: extractColumnValues(dataset.data, valueCol) };
      case "t_test":
      case "mann_whitney": {
        const { groups } = groupByColumn(dataset.data, groupingCol, valueCol);
        if (groups.length < 2) throw new Error("Need at least 2 groups");
        return { group1: groups[0], group2: groups[1] };
      }
      case "anova": {
        const { groups } = groupByColumn(dataset.data, groupingCol, valueCol);
        if (groups.length < 3) throw new Error("Need at least 3 groups");
        return { groups };
      }
      case "correlation":
        return {
          x: extractColumnValues(dataset.data, valueCol),
          y: extractColumnValues(dataset.data, secondaryCol),
        };
      default:
        throw new Error("Unsupported analysis type");
    }
  }

  async function runAnalysisRequest(
    analysisType: string,
    valueCol: string,
    secondaryCol: string,
    groupingCol: string
  ) {
    const inputData = buildInputData(analysisType, valueCol, secondaryCol, groupingCol);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        test_type: analysisType,
        data: inputData,
        config: { col1: valueCol, col2: secondaryCol, groupCol: groupingCol },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Analysis failed");
    }

    const data = await res.json();
    return data.results as Record<string, unknown>;
  }

  async function saveAnalysisResult(
    analysisType: string,
    valueCol: string,
    secondaryCol: string,
    groupingCol: string,
    results: Record<string, unknown>,
    starterLabel?: string,
    aiInterpretation?: string | null
  ) {
    const label = TEST_OPTIONS.find((t) => t.value === analysisType)?.label || analysisType;
    const namePrefix = starterLabel ? `${starterLabel}: ` : "";
    const name = `${namePrefix}${label} — ${valueCol}${secondaryCol ? ` vs ${secondaryCol}` : ""}${groupingCol ? ` by ${groupingCol}` : ""}`;

    const id = await saveAnalysis({
      dataset_id: dataset.id,
      name,
      test_type: analysisType,
      config: { col1: valueCol, col2: secondaryCol, groupCol: groupingCol },
      results,
      ai_interpretation: aiInterpretation || undefined,
    });

    onNewAnalysis({
      id,
      user_id: "",
      dataset_id: dataset.id,
      name,
      test_type: analysisType as Analysis["test_type"],
      config: { col1: valueCol, col2: secondaryCol, groupCol: groupingCol },
      results,
      ai_interpretation: aiInterpretation || null,
      created_at: new Date().toISOString(),
    });
  }

  function applyConfig(configLike: AnalysisConfigLike) {
    const nextType = configLike.test_type || "descriptive";
    const nextCol1 = (configLike.config?.col1 || "").trim();
    const nextCol2 = (configLike.config?.col2 || "").trim();
    const nextGroup = (configLike.config?.groupCol || "").trim();
    setTestType(nextType);
    setCol1(nextCol1);
    setCol2(nextCol2);
    setGroupCol(nextGroup);
  }

  function isConfigCompatible(configLike: AnalysisConfigLike) {
    const nextCol1 = (configLike.config?.col1 || "").trim();
    const nextCol2 = (configLike.config?.col2 || "").trim();
    const nextGroup = (configLike.config?.groupCol || "").trim();
    const allNames = new Set(dataset.columns.map((column) => column.name));
    if (nextCol1 && !allNames.has(nextCol1)) return false;
    if (nextCol2 && !allNames.has(nextCol2)) return false;
    if (nextGroup && !allNames.has(nextGroup)) return false;
    return true;
  }

  async function rerunConfig(configLike: AnalysisConfigLike) {
    if (!isConfigCompatible(configLike)) {
      toast.warning("This config uses columns that are missing on the selected dataset.");
      return;
    }

    const rerunCol1 = (configLike.config?.col1 || "").trim();
    const rerunCol2 = (configLike.config?.col2 || "").trim();
    const rerunGroup = (configLike.config?.groupCol || "").trim();
    if (!rerunCol1) {
      toast.warning("Analysis config is missing the primary value column.");
      return;
    }

    try {
      const results = await runAnalysisRequest(configLike.test_type, rerunCol1, rerunCol2, rerunGroup);
      await saveAnalysisResult(configLike.test_type, rerunCol1, rerunCol2, rerunGroup, results, "Re-run");
      applyConfig(configLike);
      setCurrentResult(results);
      setInterpretation(null);
      toast.success("Re-run completed and saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to re-run analysis.");
    }
  }

  function saveCurrentConfigAsPreset() {
    if (!col1) {
      toast.warning("Pick at least a primary column before saving a preset.");
      return;
    }
    const label = TEST_OPTIONS.find((option) => option.value === testType)?.label || testType;
    const defaultPresetName = `${label} (${col1}${col2 ? ` vs ${col2}` : ""}${groupCol ? ` by ${groupCol}` : ""})`;
    const presetName = presetDraftName.trim() || defaultPresetName;
    const preset: AnalysisPreset = {
      id: crypto.randomUUID(),
      name: presetName,
      test_type: testType as Analysis["test_type"],
      col1,
      col2,
      groupCol,
      created_at: new Date().toISOString(),
    };
    setPresets((current) => [preset, ...current].slice(0, 30));
    setPresetDraftName("");
    toast.success("Saved analysis preset.");
  }

  function removePreset(presetId: string) {
    setPresets((current) => current.filter((item) => item.id !== presetId));
  }

  function exportAnalysisSummary(format: "json" | "csv") {
    if (analyses.length === 0) {
      toast.message("No analyses to export for this dataset.");
      return;
    }
    if (format === "json") {
      downloadTextFile(
        `${dataset.name.replace(/\s+/g, "_").toLowerCase()}-analysis-summary.json`,
        JSON.stringify(analyses, null, 2),
        "application/json;charset=utf-8"
      );
      return;
    }

    const rows: string[] = [];
    rows.push("id,name,test_type,created_at,config");
    for (const analysis of analyses) {
      const fields = [
        analysis.id,
        analysis.name,
        analysis.test_type,
        analysis.created_at,
        JSON.stringify(analysis.config || {}),
      ].map((field) => `"${String(field).replace(/"/g, '""')}"`);
      rows.push(fields.join(","));
    }
    downloadTextFile(
      `${dataset.name.replace(/\s+/g, "_").toLowerCase()}-analysis-summary.csv`,
      rows.join("\n"),
      "text/csv;charset=utf-8"
    );
  }

  async function runAnalysis() {
    setRunning(true);
    setCurrentResult(null);
    setInterpretation(null);

    try {
      const results = await runAnalysisRequest(testType, col1, col2, groupCol);
      setCurrentResult(results);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  async function getInterpretation() {
    if (!currentResult) return;
    setInterpreting(true);
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_type: testType,
          results: currentResult,
          dataset_name: dataset.name,
          column_names: [col1, col2, groupCol].filter(Boolean),
        }),
      });
      const data = await res.json();
      setInterpretation(data.interpretation || "No interpretation available.");
    } catch {
      setInterpretation("Failed to get AI interpretation.");
    } finally {
      setInterpreting(false);
    }
  }

  async function handleSave() {
    if (!currentResult) return;
    setSaving(true);
    try {
      await saveAnalysisResult(testType, col1, col2, groupCol, currentResult, undefined, interpretation);
      toast.success("Analysis saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save analysis.");
    } finally {
      setSaving(false);
    }
  }

  async function createStarterAnalyses() {
    if (numericCols.length === 0) return;
    setCreatingStarters(true);
    setStarterProgress("Preparing starter analyses...");
    try {
      const starterSpecs: Array<{
        analysisType: "descriptive" | "correlation" | "t_test" | "anova";
        col1: string;
        col2: string;
        groupCol: string;
      }> = [];

      const primaryNumeric = numericCols[0];
      starterSpecs.push({ analysisType: "descriptive", col1: primaryNumeric, col2: "", groupCol: "" });

      if (numericCols.length >= 2) {
        starterSpecs.push({
          analysisType: "correlation",
          col1: numericCols[0],
          col2: numericCols[1],
          groupCol: "",
        });
      }

      if (categoricalCols.length > 0) {
        const starterGroupCol = categoricalCols[0];
        const grouped = groupByColumn(dataset.data, starterGroupCol, primaryNumeric).groups.filter(
          (group) => group.length > 0
        );
        if (grouped.length >= 3) {
          starterSpecs.push({
            analysisType: "anova",
            col1: primaryNumeric,
            col2: "",
            groupCol: starterGroupCol,
          });
        } else if (grouped.length >= 2) {
          starterSpecs.push({
            analysisType: "t_test",
            col1: primaryNumeric,
            col2: "",
            groupCol: starterGroupCol,
          });
        }
      }

      const existingKeys = new Set(
        analyses.map((analysis) =>
          JSON.stringify({
            test: analysis.test_type,
            col1: (analysis.config?.col1 as string) || "",
            col2: (analysis.config?.col2 as string) || "",
            groupCol: (analysis.config?.groupCol as string) || "",
          })
        )
      );

      let createdCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const failedReasons: string[] = [];
      for (const spec of starterSpecs) {
        const key = JSON.stringify({
          test: spec.analysisType,
          col1: spec.col1,
          col2: spec.col2,
          groupCol: spec.groupCol,
        });
        if (existingKeys.has(key)) {
          skippedCount += 1;
          continue;
        }

        try {
          setStarterProgress(
            `Running ${spec.analysisType.replace("_", " ")} on ${spec.col1}${spec.groupCol ? ` by ${spec.groupCol}` : ""}...`
          );
          const results = await runAnalysisRequest(spec.analysisType, spec.col1, spec.col2, spec.groupCol);
          await saveAnalysisResult(spec.analysisType, spec.col1, spec.col2, spec.groupCol, results, "Starter");
          existingKeys.add(key);
          createdCount += 1;
        } catch (error) {
          failedCount += 1;
          const reason = error instanceof Error ? error.message : "Unknown error";
          failedReasons.push(`${spec.analysisType}: ${reason}`);
        }
      }

      if (createdCount > 0) {
        const summary = [
          `Created ${createdCount} starter ${createdCount === 1 ? "analysis" : "analyses"}.`,
          skippedCount > 0 ? `Skipped ${skippedCount} existing.` : null,
          failedCount > 0 ? `Failed ${failedCount}.` : null,
        ].filter(Boolean).join(" ");
        toast.success(summary);
      } else {
        toast.message("No new starter analyses were added.");
      }

      if (failedReasons.length > 0) {
        toast.warning(`Some starter analyses failed: ${formatColumnList(failedReasons)}.`);
      }
    } finally {
      setCreatingStarters(false);
      setStarterProgress("");
    }
  }

  const needsGroupCol = ["t_test", "anova", "mann_whitney"].includes(testType);
  const needsCol2 = testType === "correlation";
  const canRun =
    col1 &&
    (!needsGroupCol || groupCol) &&
    (!needsCol2 || col2);

  const priorConfigs = useMemo(() => {
    const unique = new Map<string, AnalysisConfigLike>();
    for (const analysis of allAnalyses) {
      if (analysis.dataset_id === dataset.id) continue;
      const configLike: AnalysisConfigLike = {
        test_type: analysis.test_type,
        config: {
          col1: (analysis.config?.col1 as string) || "",
          col2: (analysis.config?.col2 as string) || "",
          groupCol: (analysis.config?.groupCol as string) || "",
        },
      };
      const key = JSON.stringify(configLike);
      if (!unique.has(key)) unique.set(key, configLike);
    }
    return Array.from(unique.values()).slice(0, 12);
  }, [allAnalyses, dataset.id]);

  const incompatiblePresetCount = presets.filter(
    (preset) =>
      !isConfigCompatible({
        test_type: preset.test_type,
        config: { col1: preset.col1, col2: preset.col2, groupCol: preset.groupCol },
      })
  ).length;

  useEffect(() => {
    if (!prefillStarterAnalyses || hasAttemptedStarterPrefill) return;
    setHasAttemptedStarterPrefill(true);
    void createStarterAnalyses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillStarterAnalyses, hasAttemptedStarterPrefill, dataset.id]);

  return (
    <div className="space-y-4">
      {/* Test selector */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Label className="text-xs mb-1 block">Statistical Test</Label>
              <Select value={testType} onValueChange={(v) => { setTestType(v); setCurrentResult(null); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">
                {testType === "correlation" ? "X Variable" : "Value Column"} (numeric)
              </Label>
              <Select value={col1} onValueChange={setCol1}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {numericCols.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsGroupCol && (
              <div>
                <Label className="text-xs mb-1 block">Group Column (categorical)</Label>
                <Select value={groupCol} onValueChange={setGroupCol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grouping" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoricalCols.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    {/* Also allow numeric columns as groups */}
                    {numericCols.map((c) => (
                      <SelectItem key={`n-${c}`} value={c}>{c} (numeric)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsCol2 && (
              <div>
                <Label className="text-xs mb-1 block">Y Variable (numeric)</Label>
                <Select value={col2} onValueChange={setCol2}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericCols
                      .filter((c) => c !== col1)
                      .map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runAnalysis} disabled={!canRun || running} className="gap-1.5">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Run Analysis
            </Button>
            <Button
              variant="outline"
              onClick={() => void createStarterAnalyses()}
              disabled={numericCols.length === 0 || creatingStarters}
              className="gap-1.5"
            >
              {creatingStarters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Starter Analyses
            </Button>
            {creatingStarters && (
              <p className="text-xs text-muted-foreground self-center">{starterProgress || "Creating starters..."}</p>
            )}

            {numericCols.length === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Info className="h-3 w-3" /> No numeric columns detected — make sure your data has numbers.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Productivity</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={saveCurrentConfigAsPreset}>
                Save Preset
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowManagePresets((current) => !current)}
              >
                {showManagePresets ? "Hide Presets" : "Manage Presets"}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => exportAnalysisSummary("json")}>
                Export Summary JSON
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => exportAnalysisSummary("csv")}>
                Export Summary CSV
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={presetDraftName}
              onChange={(event) => setPresetDraftName(event.target.value)}
              placeholder="Preset name (optional)"
            />
            <Button variant="outline" size="sm" className="h-9" onClick={saveCurrentConfigAsPreset}>
              Save Current Config
            </Button>
          </div>

          {presets.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Saved presets ({presets.length})
                </p>
                {incompatiblePresetCount > 0 && (
                  <p className="text-xs text-amber-700">
                    {incompatiblePresetCount} preset{incompatiblePresetCount === 1 ? "" : "s"} incompatible with this dataset.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                {(showManagePresets ? presets : presets.slice(0, 6)).map((preset) => {
                  const compatible = isConfigCompatible({
                    test_type: preset.test_type,
                    config: { col1: preset.col1, col2: preset.col2, groupCol: preset.groupCol },
                  });
                  return (
                    <div key={preset.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                      <button
                        type="button"
                        className="truncate text-left hover:text-primary"
                        onClick={() =>
                          applyConfig({
                            test_type: preset.test_type,
                            config: { col1: preset.col1, col2: preset.col2, groupCol: preset.groupCol },
                          })
                        }
                      >
                        {preset.name}
                      </button>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() =>
                            applyConfig({
                              test_type: preset.test_type,
                              config: { col1: preset.col1, col2: preset.col2, groupCol: preset.groupCol },
                            })
                          }
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() =>
                            void rerunConfig({
                              test_type: preset.test_type,
                              config: { col1: preset.col1, col2: preset.col2, groupCol: preset.groupCol },
                            })
                          }
                          disabled={!compatible}
                        >
                          Re-run
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => removePreset(preset.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {showManagePresets && presets.length > 0 && (
                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => {
                      if (!confirm("Delete all saved analysis presets?")) return;
                      setPresets([]);
                    }}
                  >
                    Clear All Presets
                  </Button>
                </div>
              )}
            </div>
          )}
          {presets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Save a preset to quickly apply the same analysis config to future datasets.
            </p>
          )}

          {priorConfigs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick re-run prior configs on this dataset</p>
              <div className="flex flex-wrap gap-2">
                {priorConfigs.slice(0, 8).map((configLike, index) => {
                  const label = TEST_OPTIONS.find((option) => option.value === configLike.test_type)?.label || configLike.test_type;
                  const configCol1 = (configLike.config.col1 || "").trim();
                  const configCol2 = (configLike.config.col2 || "").trim();
                  const configGroup = (configLike.config.groupCol || "").trim();
                  const tag = `${label}: ${configCol1}${configCol2 ? ` vs ${configCol2}` : ""}${configGroup ? ` by ${configGroup}` : ""}`;
                  const compatible = isConfigCompatible(configLike);
                  return (
                    <Button
                      key={`${configLike.test_type}-${index}-${configCol1}-${configCol2}-${configGroup}`}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void rerunConfig(configLike)}
                      disabled={!compatible}
                    >
                      {tag}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          {priorConfigs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Prior analysis configs from other datasets will appear here for one-click re-runs.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current result */}
      {currentResult && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                {TEST_OPTIONS.find((t) => t.value === testType)?.label} Results
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={getInterpretation} disabled={interpreting}>
                  {interpreting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI Interpret
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResultsDisplay results={currentResult} />

            {interpretation && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 mb-1.5">
                  <Brain className="h-3.5 w-3.5" /> AI Interpretation
                </div>
                <p className="text-sm leading-relaxed">{interpretation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Saved analyses */}
      {analyses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No saved analyses yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run a custom test or click <span className="font-medium">Starter Analyses</span> to generate suggested analyses.
          </p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-medium mb-2">Saved analyses</h3>
          <div className="space-y-2">
            {analyses.map((a) => (
              <SavedAnalysisCard
                key={a.id}
                analysis={a}
                highlighted={a.id === highlightedAnalysisId}
                onRerun={() =>
                  void rerunConfig({
                    test_type: a.test_type,
                    config: {
                      col1: (a.config?.col1 as string) || "",
                      col2: (a.config?.col2 as string) || "",
                      groupCol: (a.config?.groupCol as string) || "",
                    },
                  })
                }
                onExportConfig={() =>
                  downloadTextFile(
                    `${a.name.replace(/\s+/g, "_").toLowerCase()}-config.json`,
                    JSON.stringify({ test_type: a.test_type, config: a.config }, null, 2),
                    "application/json;charset=utf-8"
                  )
                }
                onDelete={() => {
                  deleteAnalysis(a.id);
                  onDeleteAnalysis(a.id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results Display ─────────────────────────────────────────────────────────

function ResultsDisplay({ results }: { results: Record<string, unknown> }) {
  const entries = Object.entries(results).filter(
    ([k]) => !["group_stats", "group1_stats", "group2_stats"].includes(k)
  );

  const formatValue = (key: string, value: unknown): string => {
    if (typeof value === "boolean") return value ? "Yes ✓" : "No ✗";
    if (typeof value === "number") {
      if (key.includes("p_value")) return value < 0.001 ? "< 0.001" : value.toFixed(4);
      return value.toFixed(4);
    }
    return String(value);
  };

  const pValue = results.p_value as number | undefined;
  const isSignificant = pValue !== undefined && pValue < 0.05;

  return (
    <div className="space-y-3">
      {pValue !== undefined && (
        <div
          className={`rounded-lg px-4 py-3 text-center font-medium ${
            isSignificant
              ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-900"
              : "bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border"
          }`}
        >
          {isSignificant
            ? `Statistically significant (p = ${pValue < 0.001 ? "< 0.001" : pValue.toFixed(4)})`
            : `Not statistically significant (p = ${pValue.toFixed(4)})`}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-md border px-3 py-2">
            <div className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</div>
            <div className="text-sm font-medium mt-0.5">{formatValue(key, value)}</div>
          </div>
        ))}
      </div>

      {/* Group stats */}
      {(results.group_stats || results.group1_stats) ? (
        <div className="text-xs">
          <span className="font-medium">Group Statistics:</span>
          <pre className="mt-1 rounded bg-muted p-2 overflow-auto text-xs">
            {JSON.stringify(
              results.group_stats || { group1: results.group1_stats, group2: results.group2_stats },
              null,
              2
            )}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

// ─── Saved Analysis Card ────────────────────────────────────────────────────

function SavedAnalysisCard({
  analysis,
  highlighted = false,
  onRerun,
  onExportConfig,
  onDelete,
}: {
  analysis: Analysis;
  highlighted?: boolean;
  onRerun: () => void;
  onExportConfig: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(highlighted);

  return (
    <Card id={`analysis-${analysis.id}`} className={highlighted ? "ring-2 ring-cyan-300 border-cyan-300" : ""}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-left group"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="text-sm font-medium group-hover:text-primary">
              {analysis.name}
            </span>
            <Badge variant="secondary" className="text-xs">
              {analysis.test_type.replace(/_/g, " ")}
            </Badge>
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onRerun}>
              Re-run
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onExportConfig}>
              Export Config
            </Button>
            <span className="text-xs text-muted-foreground">
              {new Date(analysis.created_at).toLocaleDateString()}
            </span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="mt-3 space-y-2">
            <ResultsDisplay results={analysis.results as Record<string, unknown>} />
            {analysis.ai_interpretation && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                  <Brain className="h-3.5 w-3.5" /> AI Interpretation
                </div>
                <p className="text-sm leading-relaxed">{analysis.ai_interpretation}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Visualize Panel ─────────────────────────────────────────────────────────

function VisualizePanel({
  dataset,
  figures,
  highlightedFigureId,
  initialPrefillTitle,
  initialPrefillChartType,
  initialPrefillPrompt,
}: {
  dataset: Dataset;
  figures: Figure[];
  highlightedFigureId?: string | null;
  initialPrefillTitle?: string | null;
  initialPrefillChartType?: string | null;
  initialPrefillPrompt?: string | null;
}) {
  const [chartType, setChartType] = useState(
    initialPrefillChartType && VISUALIZE_CHART_TYPES.has(initialPrefillChartType)
      ? initialPrefillChartType
      : "bar"
  );
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [groupCol, setGroupCol] = useState("__none__");
  const [title, setTitle] = useState(initialPrefillTitle || "");
  const plotRef = useRef<HTMLDivElement>(null);

  const numericCols = getNumericColumns(dataset.columns);
  const allCols = dataset.columns.map((c) => c.name);

  const CHART_OPTIONS = [
    { value: "bar", label: "Bar Chart" },
    { value: "scatter", label: "Scatter Plot" },
    { value: "box", label: "Box Plot" },
    { value: "histogram", label: "Histogram" },
    { value: "line", label: "Line Chart" },
    { value: "violin", label: "Violin Plot" },
  ];

  const normalizedGroupCol = groupCol === "__none__" ? "" : groupCol;

  const plotData = useMemo(() => {
    if (!xCol) return null;

    const chartTitle = title || `${yCol || xCol} ${chartType === "scatter" ? "vs" : "by"} ${xCol}`;

    switch (chartType) {
      case "histogram": {
        const values = extractColumnValues(dataset.data, xCol);
        return {
          data: [{
            x: values,
            type: "histogram" as const,
            marker: { color: COLORS[0] },
            name: xCol,
          }],
          layout: {
            title: { text: chartTitle, font: { size: 14 } },
            xaxis: { title: { text: xCol } },
            yaxis: { title: { text: "Frequency" } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 11 },
          },
        };
      }

      case "scatter": {
        if (!yCol) return null;
        const x = extractColumnValues(dataset.data, xCol);
        const y = extractColumnValues(dataset.data, yCol);
        const n = Math.min(x.length, y.length);
        return {
          data: [{
            x: x.slice(0, n),
            y: y.slice(0, n),
            type: "scatter" as const,
            mode: "markers" as const,
            marker: { color: COLORS[0], size: 8, opacity: 0.7 },
            name: `${xCol} vs ${yCol}`,
          }],
          layout: {
            title: { text: chartTitle, font: { size: 14 } },
            xaxis: { title: { text: xCol } },
            yaxis: { title: { text: yCol } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 11 },
          },
        };
      }

      case "bar":
      case "box":
      case "violin": {
        if (normalizedGroupCol) {
          const { labels, groups } = groupByColumn(dataset.data, normalizedGroupCol, xCol);
          const traces = labels.map((label, i) => ({
            y: groups[i],
            x: chartType === "bar" ? [label] : groups[i].map(() => label),
            name: label,
            type: (chartType === "bar" ? "bar" : chartType) as "bar" | "box" | "violin",
            marker: { color: COLORS[i % COLORS.length] },
            ...(chartType === "box" ? { boxpoints: "outliers" as const } : {}),
          }));
          return {
            data: traces,
            layout: {
              title: { text: chartTitle, font: { size: 14 } },
              xaxis: { title: { text: normalizedGroupCol } },
              yaxis: { title: { text: xCol } },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { size: 11 },
              showlegend: true,
            },
          };
        }
        // Single column
        const values = extractColumnValues(dataset.data, xCol);
        return {
          data: [{
            y: values,
            type: (chartType === "bar" ? "bar" : chartType) as "bar" | "box" | "violin",
            name: xCol,
            marker: { color: COLORS[0] },
          }],
          layout: {
            title: { text: chartTitle, font: { size: 14 } },
            yaxis: { title: { text: xCol } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 11 },
          },
        };
      }

      case "line": {
        if (!yCol) {
          const values = extractColumnValues(dataset.data, xCol);
          return {
            data: [{
              y: values,
              type: "scatter" as const,
              mode: "lines+markers" as const,
              marker: { color: COLORS[0] },
              name: xCol,
            }],
            layout: {
              title: { text: chartTitle, font: { size: 14 } },
              yaxis: { title: { text: xCol } },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { size: 11 },
            },
          };
        }
        const xVals = dataset.data.map((r) => r[xCol]);
        const yVals = extractColumnValues(dataset.data, yCol);
        return {
          data: [{
            x: xVals,
            y: yVals,
            type: "scatter" as const,
            mode: "lines+markers" as const,
            marker: { color: COLORS[0] },
            name: yCol,
          }],
          layout: {
            title: { text: chartTitle, font: { size: 14 } },
            xaxis: { title: { text: xCol } },
            yaxis: { title: { text: yCol } },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 11 },
          },
        };
      }

      default:
        return null;
    }
  }, [chartType, xCol, yCol, normalizedGroupCol, dataset.data, title]);

  const handleExport = useCallback(
    async (format: "svg" | "png") => {
      const plotlyModule = await import("plotly.js-dist-min");
      const Plotly = plotlyModule.default || plotlyModule;
      const gd = plotRef.current?.querySelector(".js-plotly-plot") as HTMLElement | null;
      if (!gd) return;
      await Plotly.downloadImage(gd, {
        format,
        width: 1200,
        height: 800,
        filename: title || "bpan-figure",
      });
    },
    [title]
  );

  const currentChartConfig = useMemo(
    () => ({
      chart_type: chartType,
      config: {
        xCol,
        yCol,
        groupCol: normalizedGroupCol || null,
        title,
      },
      dataset_id: dataset.id,
      dataset_name: dataset.name,
    }),
    [chartType, xCol, yCol, normalizedGroupCol, title, dataset.id, dataset.name]
  );

  const exportCurrentChartConfig = () => {
    downloadTextFile(
      `${(title || chartType).replace(/\s+/g, "_").toLowerCase()}-chart-config.json`,
      JSON.stringify(currentChartConfig, null, 2),
      "application/json;charset=utf-8"
    );
  };

  const copyCurrentChartConfig = async () => {
    await navigator.clipboard.writeText(JSON.stringify(currentChartConfig, null, 2));
    toast.success("Chart config copied.");
  };

  return (
    <div className="space-y-4">
      {initialPrefillPrompt && (
        <Card className="border-cyan-200 bg-cyan-50/70">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-cyan-900">Figure placeholder request</p>
                <p className="mt-1 text-xs text-cyan-900/80 whitespace-pre-wrap">{initialPrefillPrompt}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs bg-white"
                onClick={() => navigator.clipboard.writeText(initialPrefillPrompt)}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label className="text-xs mb-1 block">Chart Type</Label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">
                {chartType === "scatter" ? "X Axis" : "Value Column"}
              </Label>
              <Select value={xCol} onValueChange={setXCol}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {(chartType === "scatter" ? numericCols : numericCols).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(chartType === "scatter" || chartType === "line") && (
              <div>
                <Label className="text-xs mb-1 block">Y Axis</Label>
                <Select value={yCol} onValueChange={setYCol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericCols.filter((c) => c !== xCol).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs mb-1 block">Group By (optional)</Label>
              <Select value={groupCol} onValueChange={setGroupCol}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {allCols.filter((c) => c !== xCol && c !== yCol).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Figure Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-generated"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {plotData && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Preview</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleExport("svg")}>
                  <Download className="h-3 w-3" /> SVG
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleExport("png")}>
                  <Download className="h-3 w-3" /> PNG (300 DPI)
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={exportCurrentChartConfig}>
                  <Download className="h-3 w-3" /> Config JSON
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => void copyCurrentChartConfig()}>
                  <Copy className="h-3 w-3" /> Copy Config
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={plotRef}>
              <Plot
                data={plotData.data as Plotly.Data[]}
                layout={{
                  ...plotData.layout,
                  autosize: true,
                  margin: { l: 60, r: 30, t: 50, b: 60 },
                } as Partial<Plotly.Layout>}
                config={{
                  responsive: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ["lasso2d", "select2d"],
                  toImageButtonOptions: {
                    format: "svg",
                    filename: title || "bpan-figure",
                  },
                }}
                useResizeHandler
                style={{ width: "100%", height: 450 }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {figures.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Saved Figures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {figures.map((fig) => (
              <div
                key={fig.id}
                id={`figure-${fig.id}`}
                className={`rounded-lg border px-3 py-2 ${fig.id === highlightedFigureId ? "border-cyan-300 ring-2 ring-cyan-200" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fig.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fig.chart_type} • {new Date(fig.updated_at || fig.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {fig.analysis_id && (
                      <Badge variant="secondary" className="text-[10px]">linked analysis</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() =>
                        downloadTextFile(
                          `${fig.name.replace(/\s+/g, "_").toLowerCase()}-saved-chart-config.json`,
                          JSON.stringify({ chart_type: fig.chart_type, config: fig.config }, null, 2),
                          "application/json;charset=utf-8"
                        )
                      }
                    >
                      Export Config
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Import Dialog ───────────────────────────────────────────────────────────

function SnapshotGuardrailsSummary({
  guardrails,
}: {
  guardrails: SnapshotReconciliationGuardrails;
}) {
  const blockingIssues = [
    ...guardrails.missingRequiredColumnsWithoutDefault,
    ...guardrails.missingRequiredValuesWithoutDefault,
  ];
  const hasNonBlockingChanges =
    guardrails.addedFromSnapshotWithDefault.length > 0 ||
    guardrails.addedFromSnapshotWithoutDefault.length > 0 ||
    guardrails.extraIncomingColumns.length > 0 ||
    guardrails.typeMismatches.length > 0;

  return (
    <div className="space-y-2 text-xs">
      {blockingIssues.length === 0 && !hasNonBlockingChanges && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          Run schema check passed. Import is aligned with the snapshot baseline.
        </div>
      )}
      {blockingIssues.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          <p className="font-medium">Import blocked: required run schema fields are missing and have no defaults.</p>
          <p className="mt-1">Fix by adding these columns/values in your file or paste input: {formatColumnList(blockingIssues)}.</p>
        </div>
      )}
      {guardrails.addedFromSnapshotWithDefault.length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          Added from snapshot using defaults: {formatColumnList(guardrails.addedFromSnapshotWithDefault)}.
        </div>
      )}
      {guardrails.addedFromSnapshotWithoutDefault.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
          Snapshot columns added with empty values (no defaults): {formatColumnList(guardrails.addedFromSnapshotWithoutDefault)}.
        </div>
      )}
      {guardrails.extraIncomingColumns.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
          Run-level extra columns kept: {formatColumnList(guardrails.extraIncomingColumns)}.
        </div>
      )}
      {guardrails.typeMismatches.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
          Type mismatches detected (analyzer-compatible type kept): {formatColumnList(guardrails.typeMismatches)}.
        </div>
      )}
    </div>
  );
}

function ImportDialog({
  experiments,
  runs,
  prefillRunId,
  prefillDatasetName,
  prefillDatasetDescription,
  prefillExperimentId,
  onClose,
  onImported,
}: {
  experiments: Pick<Experiment, "id" | "title">[];
  runs: ExperimentRunOption[];
  prefillRunId?: string | null;
  prefillDatasetName?: string | null;
  prefillDatasetDescription?: string | null;
  prefillExperimentId?: string | null;
  onClose: () => void;
  onImported: (ds: ResultsDatasetRecord) => void;
}) {
  const [name, setName] = useState(prefillDatasetName || "");
  const [description, setDescription] = useState(prefillDatasetDescription || "");
  const [experimentId, setExperimentId] = useState(prefillExperimentId || "");
  const [runId, setRunId] = useState(prefillRunId || "");
  const [loading, setLoading] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    columns: DatasetColumn[];
    data: Record<string, unknown>[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === runId) || null,
    [runs, runId]
  );
  const missingPrefillRun = Boolean(prefillRunId) && !selectedRun && runId === prefillRunId;
  const reconciliation = useMemo(
    () =>
      preview
        ? reconcileDataWithSchemaSnapshot(preview.columns, preview.data, selectedRun?.schema_snapshot)
        : null,
    [preview, selectedRun]
  );
  const resolvedExperimentId = useMemo(
    () => experimentId || selectedRun?.legacy_experiment_id || "",
    [experimentId, selectedRun]
  );
  const hasRunExperimentOverride = Boolean(
    selectedRun?.legacy_experiment_id &&
      experimentId &&
      experimentId !== selectedRun.legacy_experiment_id
  );
  const resolvedExperimentTitle = useMemo(
    () => experiments.find((exp) => exp.id === resolvedExperimentId)?.title || null,
    [experiments, resolvedExperimentId]
  );

  function handleFile(file: File) {
    setParseError(null);
    setIsParsingFile(true);
    setPreview(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!name) setName(file.name.replace(/\.\w+$/, ""));

    if (ext === "csv" || ext === "tsv") {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete(result) {
          const data = result.data as Record<string, unknown>[];
          const rawHeaders = result.meta.fields || [];
          const { normalized: colNames, blankHeaders, duplicateHeaders } = normalizeHeaders(rawHeaders);
          if (result.errors?.length) {
            setParseError(`CSV parse warning: ${result.errors[0]?.message || "Unknown parsing issue"}`);
          }
          if (blankHeaders.length > 0) {
            setParseError("Column header is blank. Add a name to every header cell in the first row.");
            setIsParsingFile(false);
            return;
          }
          if (duplicateHeaders.length > 0) {
            setParseError(`Duplicate header names found: ${formatColumnList(duplicateHeaders)}. Rename duplicates before import.`);
            setIsParsingFile(false);
            return;
          }
          if (colNames.length === 0) {
            setParseError("No header row detected. Add a first row with column names and try again.");
            setIsParsingFile(false);
            return;
          }
          const columns: DatasetColumn[] = colNames.map((n) => ({
            name: n,
            type: detectColumnType(data.map((r) => r[n])),
          }));
          if (data.length === 0) {
            setParseError("No data rows detected. Keep the header row and add at least one data row.");
          }
          setPreview({ columns, data });
          setIsParsingFile(false);
        },
        error(error) {
          setParseError(error.message || "Failed to parse file.");
          setIsParsingFile(false);
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const firstSheetName = wb.SheetNames[0];
          if (!firstSheetName) {
            setParseError("No worksheet found in the selected workbook.");
            return;
          }
          const sheet = wb.Sheets[firstSheetName];
          const data = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
          const { normalized: colNames, blankHeaders, duplicateHeaders } = normalizeHeaders(Object.keys(data[0] || {}));
          if (blankHeaders.length > 0) {
            setParseError("Column header is blank. Add a name to every header cell in the first row.");
            return;
          }
          if (duplicateHeaders.length > 0) {
            setParseError(`Duplicate header names found: ${formatColumnList(duplicateHeaders)}. Rename duplicates before import.`);
            return;
          }
          if (colNames.length === 0) {
            setParseError("No header row detected in the first sheet. Add column names and try again.");
            return;
          }
          const columns: DatasetColumn[] = colNames.map((n) => ({
            name: n,
            type: detectColumnType(data.map((r) => r[n])),
          }));
          if (data.length === 0) {
            setParseError("No data rows detected. Keep the header row and add at least one data row.");
          }
          setPreview({ columns, data });
        } catch (error) {
          setParseError(error instanceof Error ? error.message : "Failed to read Excel file.");
        } finally {
          setIsParsingFile(false);
        }
      };
      reader.onerror = () => {
        setParseError("Failed to read selected file.");
        setIsParsingFile(false);
      };
      reader.readAsArrayBuffer(file);
    } else {
      setParseError("Unsupported file type. Use CSV, TSV, XLSX, or XLS.");
      setIsParsingFile(false);
    }
  }

  async function handleImport() {
    if (!preview || !reconciliation || preview.data.length === 0 || !name || !reconciliation.canImport) return;
    setLoading(true);
    try {
      const id = await createDataset({
        name,
        description: description || undefined,
        experiment_id: resolvedExperimentId || undefined,
        experiment_run_id: selectedRun?.id,
        result_schema_id: selectedRun?.result_schema_id || undefined,
        schema_snapshot: selectedRun?.schema_snapshot,
        columns: reconciliation.columns,
        data: reconciliation.data,
        source: "csv",
      });
      onImported({
        id,
        user_id: "",
        name,
        description: description || null,
        experiment_id: resolvedExperimentId || null,
        experiment_run_id: selectedRun?.id || null,
        result_schema_id: selectedRun?.result_schema_id || null,
        schema_snapshot: selectedRun?.schema_snapshot,
        columns: reconciliation.columns,
        data: reconciliation.data,
        row_count: reconciliation.data.length,
        source: "csv",
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import Data File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs mb-1 block">Dataset Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Western blot results" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Run notes, cohort, or source context" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Link to Run (optional)</Label>
              <Select
                value={runId || "__none__"}
                onValueChange={(value) => setRunId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {runs.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {run.name}
                      {run.status ? ` (${run.status})` : ""}
                      {run.result_schema_id ? " • snapshot" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Link to Experiment (optional)</Label>
              <Select
                value={experimentId || "__none__"}
                onValueChange={(value) => setExperimentId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {experiments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedRun && (
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 space-y-1">
              <p>
                From run: <span className="font-medium">{selectedRun.name}</span>
                {selectedRun.status ? ` (${selectedRun.status})` : ""}
              </p>
              <p>
                Experiment: {resolvedExperimentTitle || "Not set"}
                {selectedRun.result_schema_id ? ` • Schema ${selectedRun.result_schema_id.slice(0, 8)}` : ""}
              </p>
              <p>
                {experimentId
                  ? "Using explicit experiment selection."
                  : "No explicit experiment selected: run-linked experiment will be used automatically."}
              </p>
              {hasRunExperimentOverride && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setExperimentId(selectedRun?.legacy_experiment_id || "")}
                >
                  Use run-linked experiment
                </Button>
              )}
            </div>
          )}
          {!selectedRun && runs.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              No run selected. Import will follow the legacy dataset path with no snapshot guardrails.
            </div>
          )}
          {runs.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              No runs available in this workspace yet. You can still import as a legacy dataset.
            </div>
          )}
          {missingPrefillRun && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Prefilled run was not found. Choose a run manually or continue with legacy dataset import.
            </div>
          )}
          {parseError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {parseError}
            </div>
          )}

          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium">Click to upload CSV or Excel file</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv, .tsv, .xlsx, .xls</p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".csv,.tsv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
          {!preview && !isParsingFile && (
            <p className="text-xs text-muted-foreground">
              Upload a file to preview rows, reconcile run schema, and validate required fields before import.
            </p>
          )}

          {preview && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Preview: {preview.data.length} rows, {(reconciliation?.columns || preview.columns).length} columns
              </p>
              {selectedRun && reconciliation && (
                <SnapshotGuardrailsSummary guardrails={reconciliation.guardrails} />
              )}
              <div className="flex gap-2 flex-wrap">
                {(reconciliation?.columns || preview.columns).map((col) => (
                  <Badge key={col.name} variant="secondary" className="text-xs">
                    {col.name} <span className="opacity-60 ml-1">({col.type})</span>
                  </Badge>
                ))}
              </div>
              <ScrollArea className="max-h-[200px] border rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {(reconciliation?.columns || preview.columns).map((c) => (
                        <th key={c.name} className="px-2 py-1 text-left font-medium">{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(reconciliation?.data || preview.data).slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t">
                        {(reconciliation?.columns || preview.columns).map((c) => (
                          <td key={c.name} className="px-2 py-1">{String(row[c.name] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
          {preview && preview.data.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Zero rows detected. Add data rows to the file before importing.
            </div>
          )}
          {isParsingFile && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Parsing file and preparing run schema checks...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={!preview || !reconciliation || preview.data.length === 0 || !reconciliation.canImport || !name || loading || isParsingFile}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Import {preview ? `(${preview.data.length} rows)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type GoogleSheetsStatus = {
  configured: boolean;
  connected: boolean;
  email?: string | null;
};

type GoogleSheetLink = {
  id: string;
  name: string;
  sheet_url: string;
  target: "auto" | "dataset" | "colony_results";
  import_config?: {
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
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_row_count: number;
  dataset_id: string | null;
};

function GoogleSheetsDialog({
  experiments,
  runs,
  onClose,
  onDatasetSynced,
}: {
  experiments: Pick<Experiment, "id" | "title">[];
  runs: ExperimentRunOption[];
  onClose: () => void;
  onDatasetSynced: (dataset: ResultsDatasetRecord) => void;
}) {
  const [status, setStatus] = useState<GoogleSheetsStatus | null>(null);
  const [links, setLinks] = useState<GoogleSheetLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [target, setTarget] = useState<"auto" | "dataset" | "colony_results">("auto");
  const [runId, setRunId] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [rowStart, setRowStart] = useState("1");
  const [rowEnd, setRowEnd] = useState("");
  const [colonyAnimalKey, setColonyAnimalKey] = useState("");
  const [colonyTimepointKey, setColonyTimepointKey] = useState("");
  const [colonyExperimentKey, setColonyExperimentKey] = useState("");
  const [colonyNotesKey, setColonyNotesKey] = useState("");

  const refreshState = useCallback(async () => {
    const [statusRes, linksRes] = await Promise.all([
      fetch("/api/sheets/google/status", { cache: "no-store" }),
      fetch("/api/sheets/google/links", { cache: "no-store" }),
    ]);
    const statusJson = await statusRes.json();
    setStatus(statusJson);
    if (linksRes.ok) {
      const linksJson = await linksRes.json();
      setLinks((linksJson.links || []) as GoogleSheetLink[]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refreshState();
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load Google Sheets integration state.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshState]);

  async function connectGoogleSheets() {
    const res = await fetch("/api/sheets/google/auth");
    const json = await res.json();
    if (!res.ok || !json.url) {
      toast.error(json.error || "Could not start Google Sheets authorization.");
      return;
    }
    window.location.href = json.url;
  }

  async function disconnectGoogleSheets() {
    const res = await fetch("/api/sheets/google/disconnect", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || "Failed to disconnect Google Sheets.");
      return;
    }
    await refreshState();
    toast.success("Google Sheets disconnected.");
  }

  async function createLink() {
    if (!name.trim() || !sheetUrl.trim()) {
      toast.error("Provide a link name and Google Sheets URL.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sheets/google/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sheetUrl: sheetUrl.trim(),
          target,
          experimentRunId: runId || null,
          experimentId: experimentId || null,
          importConfig: {
            selectedColumns: selectedColumns.length > 0 ? selectedColumns : undefined,
            rowStart: Number(rowStart) > 0 ? Number(rowStart) : 1,
            rowEnd: Number(rowEnd) > 0 ? Number(rowEnd) : undefined,
            colonyMapping: {
              animalKey: colonyAnimalKey || undefined,
              timepointKey: colonyTimepointKey || undefined,
              experimentKey: colonyExperimentKey || undefined,
              notesKey: colonyNotesKey || undefined,
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to save Google Sheet link.");
        return;
      }
      setName("");
      setSheetUrl("");
      setPreviewColumns([]);
      setSelectedColumns([]);
      setRowStart("1");
      setRowEnd("");
      setColonyAnimalKey("");
      setColonyTimepointKey("");
      setColonyExperimentKey("");
      setColonyNotesKey("");
      await refreshState();
      toast.success("Sheet linked. Syncing now...");
      await syncLinks(json.link?.id ? String(json.link.id) : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(linkId: string) {
    const res = await fetch(`/api/sheets/google/links/${linkId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || "Failed to remove linked sheet.");
      return;
    }
    await refreshState();
  }

  async function purgeLinkData(linkId: string) {
    const confirmed = window.confirm("Remove imported data from this sheet too? This deletes synced dataset/rows.");
    if (!confirmed) return;
    const res = await fetch(`/api/sheets/google/links/${linkId}/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeLink: true }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || "Failed to remove linked sheet data.");
      return;
    }
    toast.success("Linked sheet and imported data removed.");
    await refreshState();
  }

  async function loadSheetPreview() {
    if (!sheetUrl.trim()) {
      toast.error("Paste a Google Sheets URL first.");
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/sheets/google/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim(), maxRows: 2000 }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to load sheet preview.");
        return;
      }
      const cols = ((json.columns || []) as Array<{ name: string }>).map((c) => c.name);
      setPreviewColumns(cols);
      setSelectedColumns(cols);
      if (target === "auto" && (json.target === "dataset" || json.target === "colony_results")) {
        setTarget(json.target);
      }
      toast.success(`Loaded ${json.rowCount || 0} rows and ${cols.length} columns.`);
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleSelectedColumn(column: string) {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]
    );
  }

  async function syncLinks(linkId?: string) {
    setSyncing(true);
    try {
      const res = await fetch("/api/sheets/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkId ? { linkId } : {}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Google Sheets sync failed.");
        return;
      }

      const synced = (json.synced || []) as Array<Record<string, unknown>>;
      const syncedDatasets = synced
        .map((entry) => entry.dataset as ResultsDatasetRecord | undefined)
        .filter((entry): entry is ResultsDatasetRecord => !!entry && !!entry.id);

      syncedDatasets.forEach((dataset) => onDatasetSynced(dataset));

      if ((json.errors || []).length > 0) {
        toast.error(`Synced ${synced.length} link(s) with ${(json.errors || []).length} error(s).`);
      } else {
        toast.success(`Synced ${synced.length} link(s).`);
      }
      await refreshState();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Link Google Sheets
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading integration status...
          </div>
        ) : null}

        {!loading && status?.configured === false ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Google OAuth is not configured on this deployment (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
          </div>
        ) : null}

        {!loading && status?.configured !== false && !status?.connected ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 space-y-2">
            <p>Connect a Google account first to read Sheets.</p>
            <Button onClick={connectGoogleSheets} className="gap-2">
              <Link2 className="h-4 w-4" /> Connect Google Sheets
            </Button>
          </div>
        ) : null}

        {!loading && status?.connected ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center justify-between">
              <span>
                Connected as {status.email || "Google account"}.
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => syncLinks()} disabled={syncing}>
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync all
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={disconnectGoogleSheets}>
                  Disconnect
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs mb-1 block">Link name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Behavioral cohort sheet" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Import target</Label>
                <Select value={target} onValueChange={(value) => setTarget(value as "auto" | "dataset" | "colony_results")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto detect</SelectItem>
                    <SelectItem value="dataset">Results dataset</SelectItem>
                    <SelectItem value="colony_results">Colony results</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1 block">Google Sheets URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                  <Button type="button" variant="outline" className="shrink-0" onClick={loadSheetPreview} disabled={previewLoading}>
                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Link to Run (optional)</Label>
                <Select value={runId || "__none__"} onValueChange={(value) => setRunId(value === "__none__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {runs.map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        {run.name}
                        {run.status ? ` (${run.status})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Link to Experiment (optional)</Label>
                <Select value={experimentId || "__none__"} onValueChange={(value) => setExperimentId(value === "__none__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {experiments.map((experiment) => (
                      <SelectItem key={experiment.id} value={experiment.id}>
                        {experiment.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {previewColumns.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-xs font-medium text-slate-700">Import controls</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs mb-1 block">Row start (1-based, after header)</Label>
                    <Input value={rowStart} onChange={(e) => setRowStart(e.target.value)} placeholder="1" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Row end (optional)</Label>
                    <Input value={rowEnd} onChange={(e) => setRowEnd(e.target.value)} placeholder="Leave empty for all" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Columns to import ({selectedColumns.length}/{previewColumns.length})</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {previewColumns.map((column) => (
                      <Button
                        key={column}
                        type="button"
                        size="sm"
                        variant={selectedColumns.includes(column) ? "default" : "outline"}
                        className="h-6 px-2 text-[11px]"
                        onClick={() => toggleSelectedColumn(column)}
                      >
                        {column}
                      </Button>
                    ))}
                  </div>
                </div>

                {(target === "colony_results" || target === "auto") && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs mb-1 block">Animal column (optional override)</Label>
                      <Select value={colonyAnimalKey || "__auto__"} onValueChange={(value) => setColonyAnimalKey(value === "__auto__" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Auto detect" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto detect</SelectItem>
                          {previewColumns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Timepoint column (optional override)</Label>
                      <Select value={colonyTimepointKey || "__auto__"} onValueChange={(value) => setColonyTimepointKey(value === "__auto__" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Auto detect" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto detect</SelectItem>
                          {previewColumns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Experiment column (optional override)</Label>
                      <Select value={colonyExperimentKey || "__auto__"} onValueChange={(value) => setColonyExperimentKey(value === "__auto__" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Auto detect" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto detect</SelectItem>
                          {previewColumns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Notes column (optional)</Label>
                      <Select value={colonyNotesKey || "__auto__"} onValueChange={(value) => setColonyNotesKey(value === "__auto__" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Auto detect" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto detect</SelectItem>
                          {previewColumns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={createLink} disabled={saving || syncing} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save link and sync now
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Linked sheets</p>
              {links.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                  No linked sheets yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {links.map((link) => (
                    <div key={link.id} className="rounded-md border px-3 py-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{link.name}</p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => syncLinks(link.id)}
                            disabled={syncing}
                          >
                            Sync now
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-destructive"
                            onClick={() => removeLink(link.id)}
                            disabled={syncing}
                          >
                            Remove
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-destructive"
                            onClick={() => purgeLinkData(link.id)}
                            disabled={syncing}
                          >
                            Remove + data
                          </Button>
                        </div>
                      </div>
                      <p className="text-muted-foreground truncate">{link.sheet_url}</p>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <Badge variant="secondary">{link.target}</Badge>
                        {link.last_synced_at ? <span>Last sync: {new Date(link.last_synced_at).toLocaleString()}</span> : <span>Never synced</span>}
                        <span>Rows: {link.last_row_count || 0}</span>
                        {link.last_sync_status === "error" && link.last_sync_error ? (
                          <span className="text-rose-600">{link.last_sync_error}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Paste Dialog ────────────────────────────────────────────────────────────

function PasteDialog({
  experiments,
  runs,
  prefillRunId,
  prefillDatasetName,
  prefillDatasetDescription,
  prefillExperimentId,
  onClose,
  onImported,
}: {
  experiments: Pick<Experiment, "id" | "title">[];
  runs: ExperimentRunOption[];
  prefillRunId?: string | null;
  prefillDatasetName?: string | null;
  prefillDatasetDescription?: string | null;
  prefillExperimentId?: string | null;
  onClose: () => void;
  onImported: (ds: ResultsDatasetRecord) => void;
}) {
  const [name, setName] = useState(prefillDatasetName || "");
  const [description, setDescription] = useState(prefillDatasetDescription || "");
  const [experimentId, setExperimentId] = useState(prefillExperimentId || "");
  const [runId, setRunId] = useState(prefillRunId || "");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === runId) || null,
    [runs, runId]
  );
  const missingPrefillRun = Boolean(prefillRunId) && !selectedRun && runId === prefillRunId;

  const preview = useMemo(() => {
    if (!rawText.trim()) return null;
    const delimiter = detectPasteDelimiter(rawText);
    const result = Papa.parse(rawText.trim(), {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimiter,
    });
    const parseError = result.errors?.length
      ? `Paste parse warning: ${result.errors[0]?.message || "Unknown parsing issue"}`
      : null;
    const data = result.data as Record<string, unknown>[];
    const { normalized: colNames, blankHeaders, duplicateHeaders } = normalizeHeaders(result.meta.fields || []);
    if (blankHeaders.length > 0) {
      return {
        columns: [],
        data: [],
        parseError: "Column header is blank. Add a name to every header cell in the first row.",
      };
    }
    if (duplicateHeaders.length > 0) {
      return {
        columns: [],
        data: [],
        parseError: `Duplicate header names found: ${formatColumnList(duplicateHeaders)}. Rename duplicates before import.`,
      };
    }
    if (colNames.length === 0) {
      return {
        columns: [],
        data: [],
        parseError: "No header row detected. Include a first row with column names.",
      };
    }
    const columns: DatasetColumn[] = colNames.map((n) => ({
      name: n,
      type: detectColumnType(data.map((r) => r[n])),
    }));
    return { columns, data, parseError };
  }, [rawText]);
  const reconciliation = useMemo(
    () =>
      preview
        ? reconcileDataWithSchemaSnapshot(preview.columns, preview.data, selectedRun?.schema_snapshot)
        : null,
    [preview, selectedRun]
  );
  const resolvedExperimentId = useMemo(
    () => experimentId || selectedRun?.legacy_experiment_id || "",
    [experimentId, selectedRun]
  );
  const hasRunExperimentOverride = Boolean(
    selectedRun?.legacy_experiment_id &&
      experimentId &&
      experimentId !== selectedRun.legacy_experiment_id
  );
  const resolvedExperimentTitle = useMemo(
    () => experiments.find((exp) => exp.id === resolvedExperimentId)?.title || null,
    [experiments, resolvedExperimentId]
  );

  async function handleImport() {
    if (!preview || !reconciliation || !name || !reconciliation.canImport) return;
    setLoading(true);
    try {
      const id = await createDataset({
        name,
        description: description || undefined,
        experiment_id: resolvedExperimentId || undefined,
        experiment_run_id: selectedRun?.id,
        result_schema_id: selectedRun?.result_schema_id || undefined,
        schema_snapshot: selectedRun?.schema_snapshot,
        columns: reconciliation.columns,
        data: reconciliation.data,
        source: "paste",
      });
      onImported({
        id,
        user_id: "",
        name,
        description: description || null,
        experiment_id: resolvedExperimentId || null,
        experiment_run_id: selectedRun?.id || null,
        result_schema_id: selectedRun?.result_schema_id || null,
        schema_snapshot: selectedRun?.schema_snapshot,
        columns: reconciliation.columns,
        data: reconciliation.data,
        row_count: reconciliation.data.length,
        source: "paste",
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5" /> Paste data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs mb-1 block">Dataset Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cell counts Day 3" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Run notes, cohort, or source context" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Link to Run (optional)</Label>
              <Select
                value={runId || "__none__"}
                onValueChange={(value) => setRunId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {runs.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {run.name}
                      {run.status ? ` (${run.status})` : ""}
                      {run.result_schema_id ? " • snapshot" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Link to Experiment (optional)</Label>
              <Select
                value={experimentId || "__none__"}
                onValueChange={(value) => setExperimentId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {experiments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedRun && (
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 space-y-1">
              <p>
                From run: <span className="font-medium">{selectedRun.name}</span>
                {selectedRun.status ? ` (${selectedRun.status})` : ""}
              </p>
              <p>
                Experiment: {resolvedExperimentTitle || "Not set"}
                {selectedRun.result_schema_id ? ` • Schema ${selectedRun.result_schema_id.slice(0, 8)}` : ""}
              </p>
              <p>
                {experimentId
                  ? "Using explicit experiment selection."
                  : "No explicit experiment selected: run-linked experiment will be used automatically."}
              </p>
              {hasRunExperimentOverride && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setExperimentId(selectedRun?.legacy_experiment_id || "")}
                >
                  Use run-linked experiment
                </Button>
              )}
            </div>
          )}
          {!selectedRun && runs.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              No run selected. Paste import will follow the legacy dataset path with no snapshot guardrails.
            </div>
          )}
          {runs.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              No runs available in this workspace yet. You can still paste as a legacy dataset.
            </div>
          )}
          {missingPrefillRun && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Prefilled run was not found. Choose a run manually or continue with legacy dataset paste.
            </div>
          )}
          {preview?.parseError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {preview.parseError}
            </div>
          )}

          <div>
            <Label className="text-xs mb-1 block">
              Paste from Excel, Google Sheets, or type CSV
            </Label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Group\tValue\tReplicate\nControl\t12.3\t1\nControl\t13.1\t2\nTreated\t8.7\t1\nTreated\t9.2\t2`}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none h-40"
            />
          </div>
          {!preview && (
            <p className="text-xs text-muted-foreground">
              Tip: include a header row first, then tab- or comma-separated values.
            </p>
          )}

          {preview && preview.data.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Detected: {preview.data.length} rows, {(reconciliation?.columns || preview.columns).length} columns
              </p>
              {selectedRun && reconciliation && (
                <SnapshotGuardrailsSummary guardrails={reconciliation.guardrails} />
              )}
              <div className="flex gap-2 flex-wrap">
                {(reconciliation?.columns || preview.columns).map((col) => (
                  <Badge key={col.name} variant="secondary" className="text-xs">
                    {col.name} <span className="opacity-60 ml-1">({col.type})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {preview && preview.data.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No rows detected. Ensure the first line is a header row and values are comma- or tab-separated.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={!preview || !reconciliation || !reconciliation.canImport || preview.data.length === 0 || !name || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Import {preview ? `(${preview.data.length} rows)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
