"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Upload,
  Trash2,
  BarChart3,
  FlaskConical,
  Brain,
  Download,
  Loader2,
  Plus,
  Table as TableIcon,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  FileSpreadsheet,
  Info,
  Sparkles,
  X,
  Save,
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
  saveFigure,
  deleteFigure,
} from "@/app/(protected)/results/actions";
import type { Dataset, DatasetColumn, Analysis, Figure, Experiment } from "@/types";

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

// ─── Chart Colors ────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  initialDatasets: Dataset[];
  initialAnalyses: Analysis[];
  initialFigures: Figure[];
  experiments: Pick<Experiment, "id" | "title">[];
  initialDatasetId?: string | null;
  initialTab?: "data" | "analyze" | "visualize";
  initialAnalysisId?: string | null;
  initialFigureId?: string | null;
}

export function ResultsClient({
  initialDatasets,
  initialAnalyses,
  initialFigures,
  experiments,
  initialDatasetId = null,
  initialTab = "data",
  initialAnalysisId = null,
  initialFigureId = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [datasets, setDatasets] = useState(initialDatasets);
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [figures] = useState(initialFigures);
  const [activeTab, setActiveTab] = useState<"data" | "analyze" | "visualize">(initialTab);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    initialDatasets.find((d) => d.id === initialDatasetId)?.id || initialDatasets[0]?.id || null
  );
  const [showImport, setShowImport] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  );

  const datasetAnalyses = useMemo(
    () =>
      selectedDatasetId
        ? analyses.filter((a) => a.dataset_id === selectedDatasetId)
        : [],
    [analyses, selectedDatasetId]
  );

  const highlightedAnalysisId = initialAnalysisId;
  const highlightedFigureId = initialFigureId;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Results Analyzer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import data, run statistics, create publication-ready figures.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPaste(true)} className="gap-2">
            <ClipboardPaste className="h-4 w-4" /> Paste Data
          </Button>
          <Button onClick={() => setShowImport(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Import File
          </Button>
        </div>
      </div>

      {/* Dataset selector */}
      {datasets.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-sm font-medium">Dataset:</Label>
          <Select
            value={selectedDatasetId || ""}
            onValueChange={setSelectedDatasetId}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select a dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} ({d.row_count} rows)
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
      )}

      {/* Main content */}
      {!selectedDataset ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-lg mb-2">No data yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Import a CSV or Excel file, or paste data from a spreadsheet to get started with analysis.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setShowPaste(true)} className="gap-2">
              <ClipboardPaste className="h-4 w-4" /> Paste Data
            </Button>
            <Button onClick={() => setShowImport(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Import File
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "data" | "analyze" | "visualize")} className="space-y-4">
          <TabsList>
            <TabsTrigger value="data" className="gap-1.5">
              <TableIcon className="h-3.5 w-3.5" /> Data
            </TabsTrigger>
            <TabsTrigger value="analyze" className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Analyze
            </TabsTrigger>
            <TabsTrigger value="visualize" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Visualize
            </TabsTrigger>
          </TabsList>

          {/* ─── DATA TAB ─── */}
          <TabsContent value="data">
            <DataTable dataset={selectedDataset} />
          </TabsContent>

          {/* ─── ANALYZE TAB ─── */}
          <TabsContent value="analyze">
            <AnalyzePanel
              dataset={selectedDataset}
              analyses={datasetAnalyses}
              highlightedAnalysisId={highlightedAnalysisId}
              onNewAnalysis={(a) => setAnalyses((prev) => [a, ...prev])}
              onDeleteAnalysis={(id) =>
                setAnalyses((prev) => prev.filter((a) => a.id !== id))
              }
            />
          </TabsContent>

          {/* ─── VISUALIZE TAB ─── */}
          <TabsContent value="visualize">
            <VisualizePanel
              dataset={selectedDataset}
              figures={figures.filter((f) => f.dataset_id === selectedDatasetId)}
              highlightedFigureId={highlightedFigureId}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Import Dialog */}
      {showImport && (
        <ImportDialog
          experiments={experiments}
          onClose={() => setShowImport(false)}
          onImported={(ds) => {
            setDatasets((prev) => [ds, ...prev]);
            setSelectedDatasetId(ds.id);
            setShowImport(false);
          }}
        />
      )}

      {/* Paste Dialog */}
      {showPaste && (
        <PasteDialog
          experiments={experiments}
          onClose={() => setShowPaste(false)}
          onImported={(ds) => {
            setDatasets((prev) => [ds, ...prev]);
            setSelectedDatasetId(ds.id);
            setShowPaste(false);
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

function AnalyzePanel({
  dataset,
  analyses,
  highlightedAnalysisId,
  onNewAnalysis,
  onDeleteAnalysis,
}: {
  dataset: Dataset;
  analyses: Analysis[];
  highlightedAnalysisId?: string | null;
  onNewAnalysis: (a: Analysis) => void;
  onDeleteAnalysis: (id: string) => void;
}) {
  const [testType, setTestType] = useState("descriptive");
  const [col1, setCol1] = useState("");
  const [col2, setCol2] = useState("");
  const [groupCol, setGroupCol] = useState("");
  const [running, setRunning] = useState(false);
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const numericCols = getNumericColumns(dataset.columns);
  const categoricalCols = getCategoricalColumns(dataset.columns);

  const TEST_OPTIONS = [
    { value: "descriptive", label: "Descriptive Statistics", desc: "Mean, median, SD, quartiles" },
    { value: "t_test", label: "t-Test (two groups)", desc: "Compare means between two groups" },
    { value: "anova", label: "ANOVA (3+ groups)", desc: "Compare means across multiple groups" },
    { value: "mann_whitney", label: "Mann-Whitney U", desc: "Non-parametric comparison of two groups" },
    { value: "correlation", label: "Correlation", desc: "Relationship between two variables" },
  ];

  async function runAnalysis() {
    setRunning(true);
    setCurrentResult(null);
    setInterpretation(null);

    try {
      let inputData: Record<string, unknown> = {};

      switch (testType) {
        case "descriptive":
          inputData = { values: extractColumnValues(dataset.data, col1) };
          break;
        case "t_test":
        case "mann_whitney": {
          const { groups } = groupByColumn(dataset.data, groupCol, col1);
          if (groups.length < 2) throw new Error("Need at least 2 groups");
          inputData = { group1: groups[0], group2: groups[1] };
          break;
        }
        case "anova": {
          const { groups } = groupByColumn(dataset.data, groupCol, col1);
          inputData = { groups };
          break;
        }
        case "correlation":
          inputData = {
            x: extractColumnValues(dataset.data, col1),
            y: extractColumnValues(dataset.data, col2),
          };
          break;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_type: testType,
          data: inputData,
          config: { col1, col2, groupCol },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data = await res.json();
      setCurrentResult(data.results);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Analysis failed");
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
      const id = await saveAnalysis({
        dataset_id: dataset.id,
        name: `${TEST_OPTIONS.find((t) => t.value === testType)?.label || testType} — ${col1}${col2 ? ` vs ${col2}` : ""}${groupCol ? ` by ${groupCol}` : ""}`,
        test_type: testType,
        config: { col1, col2, groupCol },
        results: currentResult,
        ai_interpretation: interpretation || undefined,
      });
      onNewAnalysis({
        id,
        user_id: "",
        dataset_id: dataset.id,
        name: `${testType} — ${col1}`,
        test_type: testType as Analysis["test_type"],
        config: { col1, col2, groupCol },
        results: currentResult,
        ai_interpretation: interpretation,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const needsGroupCol = ["t_test", "anova", "mann_whitney"].includes(testType);
  const needsCol2 = testType === "correlation";
  const canRun =
    col1 &&
    (!needsGroupCol || groupCol) &&
    (!needsCol2 || col2);

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

          <div className="flex gap-2">
            <Button onClick={runAnalysis} disabled={!canRun || running} className="gap-1.5">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Run Analysis
            </Button>

            {numericCols.length === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Info className="h-3 w-3" /> No numeric columns detected — make sure your data has numbers.
              </p>
            )}
          </div>
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
      {analyses.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Saved Analyses</h3>
          <div className="space-y-2">
            {analyses.map((a) => (
              <SavedAnalysisCard
                key={a.id}
                analysis={a}
                highlighted={a.id === highlightedAnalysisId}
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
  onDelete,
}: {
  analysis: Analysis;
  highlighted?: boolean;
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
}: {
  dataset: Dataset;
  figures: Figure[];
  highlightedFigureId?: string | null;
}) {
  const [chartType, setChartType] = useState("bar");
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [groupCol, setGroupCol] = useState("");
  const [title, setTitle] = useState("");
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
        if (groupCol) {
          const { labels, groups } = groupByColumn(dataset.data, groupCol, xCol);
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
              xaxis: { title: { text: groupCol } },
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
  }, [chartType, xCol, yCol, groupCol, dataset.data, dataset.columns, title]);

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

  return (
    <div className="space-y-4">
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
                  {fig.analysis_id && (
                    <Badge variant="secondary" className="text-[10px]">linked analysis</Badge>
                  )}
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

function ImportDialog({
  experiments,
  onClose,
  onImported,
}: {
  experiments: Pick<Experiment, "id" | "title">[];
  onClose: () => void;
  onImported: (ds: Dataset) => void;
}) {
  const [name, setName] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    columns: DatasetColumn[];
    data: Record<string, unknown>[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!name) setName(file.name.replace(/\.\w+$/, ""));

    if (ext === "csv" || ext === "tsv") {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete(result) {
          const data = result.data as Record<string, unknown>[];
          const colNames = result.meta.fields || [];
          const columns: DatasetColumn[] = colNames.map((n) => ({
            name: n,
            type: detectColumnType(data.map((r) => r[n])),
          }));
          setPreview({ columns, data });
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
        const colNames = Object.keys(data[0] || {});
        const columns: DatasetColumn[] = colNames.map((n) => ({
          name: n,
          type: detectColumnType(data.map((r) => r[n])),
        }));
        setPreview({ columns, data });
      };
      reader.readAsArrayBuffer(file);
    }
  }

  async function handleImport() {
    if (!preview || !name) return;
    setLoading(true);
    try {
      const id = await createDataset({
        name,
        experiment_id: experimentId || undefined,
        columns: preview.columns,
        data: preview.data,
        source: "csv",
      });
      onImported({
        id,
        user_id: "",
        name,
        description: null,
        experiment_id: experimentId || null,
        columns: preview.columns,
        data: preview.data,
        row_count: preview.data.length,
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs mb-1 block">Dataset Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Western blot results" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Link to Experiment (optional)</Label>
              <Select value={experimentId} onValueChange={setExperimentId}>
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

          {preview && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Preview: {preview.data.length} rows, {preview.columns.length} columns
              </p>
              <div className="flex gap-2 flex-wrap">
                {preview.columns.map((col) => (
                  <Badge key={col.name} variant="secondary" className="text-xs">
                    {col.name} <span className="opacity-60 ml-1">({col.type})</span>
                  </Badge>
                ))}
              </div>
              <ScrollArea className="max-h-[200px] border rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c.name} className="px-2 py-1 text-left font-medium">{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t">
                        {preview.columns.map((c) => (
                          <td key={c.name} className="px-2 py-1">{String(row[c.name] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={!preview || !name || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Import {preview ? `(${preview.data.length} rows)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Paste Dialog ────────────────────────────────────────────────────────────

function PasteDialog({
  experiments,
  onClose,
  onImported,
}: {
  experiments: Pick<Experiment, "id" | "title">[];
  onClose: () => void;
  onImported: (ds: Dataset) => void;
}) {
  const [name, setName] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);

  const preview = useMemo(() => {
    if (!rawText.trim()) return null;
    // Try tab-separated first, then comma
    const delimiter = rawText.includes("\t") ? "\t" : ",";
    const result = Papa.parse(rawText.trim(), {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimiter,
    });
    const data = result.data as Record<string, unknown>[];
    const colNames = result.meta.fields || [];
    const columns: DatasetColumn[] = colNames.map((n) => ({
      name: n,
      type: detectColumnType(data.map((r) => r[n])),
    }));
    return { columns, data };
  }, [rawText]);

  async function handleImport() {
    if (!preview || !name) return;
    setLoading(true);
    try {
      const id = await createDataset({
        name,
        experiment_id: experimentId || undefined,
        columns: preview.columns,
        data: preview.data,
        source: "paste",
      });
      onImported({
        id,
        user_id: "",
        name,
        description: null,
        experiment_id: experimentId || null,
        columns: preview.columns,
        data: preview.data,
        row_count: preview.data.length,
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
            <ClipboardPaste className="h-5 w-5" /> Paste Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs mb-1 block">Dataset Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cell counts Day 3" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Link to Experiment (optional)</Label>
              <Select value={experimentId} onValueChange={setExperimentId}>
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

          {preview && preview.data.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Detected: {preview.data.length} rows, {preview.columns.length} columns
              </p>
              <div className="flex gap-2 flex-wrap">
                {preview.columns.map((col) => (
                  <Badge key={col.name} variant="secondary" className="text-xs">
                    {col.name} <span className="opacity-60 ml-1">({col.type})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={!preview || preview.data.length === 0 || !name || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Import {preview ? `(${preview.data.length} rows)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
