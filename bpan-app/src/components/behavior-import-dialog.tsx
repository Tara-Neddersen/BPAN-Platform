"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  Check,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Animal, Cohort, ColonyTimepoint, ColonyResult } from "@/types";

// ─── Parser ──────────────────────────────────────────────────────────────────

export interface ParsedMeasure {
  key: string;
  name: string;
  unit?: string;
  type: "numeric" | "text";
  data: Record<string, number | string>; // fileAnimalId → value
}

function measureNameToKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Parse raw text output from behavioral tracking systems (Noldus EthoVision, ABET II, etc.)
 * Expects sections with a measure header followed by rows of animal data.
 */
export function parseBehaviorTrackingOutput(rawText: string): ParsedMeasure[] {
  const lines = rawText.split("\n");
  const measures: ParsedMeasure[] = [];
  let currentMeasure: ParsedMeasure | null = null;
  let inNotes = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // ── Skip notes section ──
    if (trimmed.startsWith("Notes:")) {
      inNotes = true;
      continue;
    }
    if (inNotes) {
      if (/^\d+\.\s/.test(trimmed)) continue; // numbered note line
      inNotes = false; // new section starts
    }

    // ── Skip column header line ──
    if (trimmed.startsWith("Animal number")) continue;

    // ── Check for data line: ends with (digit-digit) ──
    const animalRefMatch = trimmed.match(/\((\d+-\d+)\)\s*$/);
    if (animalRefMatch) {
      const animalId = animalRefMatch[1];

      // Create default section if data appears before any header
      if (!currentMeasure) {
        currentMeasure = {
          key: "unknown_measure",
          name: "Unknown Measure",
          type: "numeric",
          data: {},
        };
        measures.push(currentMeasure);
      }

      // Extract the value before (animal_id)
      const beforeRef = trimmed
        .substring(0, trimmed.lastIndexOf("(" + animalId + ")"))
        .trim();

      // Split by tabs to isolate fields
      const fields = beforeRef
        .split("\t")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Last non-empty field is the data value
      const dataField = fields[fields.length - 1];

      if (!dataField || dataField === "#N/A" || dataField === "-") continue;

      const numVal = parseFloat(dataField);
      if (!isNaN(numVal)) {
        currentMeasure.data[animalId] = numVal;
      } else {
        currentMeasure.data[animalId] = dataField;
        currentMeasure.type = "text";
      }
      continue;
    }

    // ── Skip numbered note continuation ──
    if (/^\d+\.\s/.test(trimmed)) continue;

    // ── Otherwise it's a section header ──
    // Parse optional unit from trailing parentheses
    const unitMatch = trimmed.match(/\(([^)]+)\)\s*$/);
    let name = trimmed;
    let unit: string | undefined;

    if (unitMatch) {
      const candidate = unitMatch[1];
      // Don't treat animal IDs or "note X" as units
      if (!/^\d+-\d+$/.test(candidate) && !candidate.startsWith("note")) {
        name = trimmed
          .substring(0, trimmed.lastIndexOf("(" + candidate + ")"))
          .trim();
        unit = candidate;
      }
    }

    currentMeasure = {
      key: measureNameToKey(name),
      name,
      unit,
      type: "numeric",
      data: {},
    };
    measures.push(currentMeasure);
  }

  // Filter out measures with no data
  return measures.filter((m) => Object.keys(m.data).length > 0);
}

// ─── Dialog Props ────────────────────────────────────────────────────────────

const EXPERIMENT_LABELS: Record<string, string> = {
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Overnight Nesting",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Habituation",
  rotarod: "Rotarod Testing",
  stamina: "Stamina Test",
  blood_draw: "Plasma Collection",
  eeg_recording: "EEG Recording",
};

interface BehaviorImportDialogProps {
  open: boolean;
  onClose: () => void;
  animals: Animal[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
  colonyResults: ColonyResult[];
  defaultTimepointAge: number;
  defaultExperimentType: string;
  batchUpsertColonyResults: (
    timepointAgeDays: number,
    experimentType: string,
    entries: {
      animalId: string;
      measures: Record<string, string | number | null>;
      notes?: string;
    }[]
  ) => Promise<{
    success?: boolean;
    error?: string;
    saved?: number;
    errors?: string[];
  }>;
  onImportComplete?: (
    experimentType: string,
    importedMeasures: { key: string; name: string; unit?: string }[]
  ) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BehaviorImportDialog({
  open,
  onClose,
  animals,
  cohorts,
  timepoints,
  colonyResults,
  defaultTimepointAge,
  defaultExperimentType,
  batchUpsertColonyResults,
  onImportComplete,
}: BehaviorImportDialogProps) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedMeasure[] | null>(null);
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(
    new Set()
  );
  const [timepointAge, setTimepointAge] = useState(
    String(defaultTimepointAge)
  );
  const [experimentType, setExperimentType] = useState(
    defaultExperimentType
  );
  const [importing, setImporting] = useState(false);
  const [selectedAnimals, setSelectedAnimals] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when dialog closes/opens
  useEffect(() => {
    if (open) {
      setRawText("");
      setParsed(null);
      setSelectedMeasures(new Set());
      setSelectedAnimals(new Set());
      setImporting(false);
      setTimepointAge(String(defaultTimepointAge));
      setExperimentType(defaultExperimentType);
    }
  }, [open, defaultTimepointAge, defaultExperimentType]);

  // ── Parse the raw text ──
  const doParse = useCallback((text: string) => {
    const result = parseBehaviorTrackingOutput(text);
    setParsed(result);

    // Auto-select measures that have meaningful (non-all-zero) data
    const autoSelect = new Set<string>();
    for (const m of result) {
      const values = Object.values(m.data);
      if (values.length === 0) continue;
      const numericValues = values.filter(
        (v) => typeof v === "number"
      ) as number[];
      const allZero =
        numericValues.length > 0 && numericValues.every((v) => v === 0);
      if (!allZero) {
        autoSelect.add(m.key);
      }
    }
    setSelectedMeasures(autoSelect);
  }, []);

  // ── File upload ──
  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          setRawText(text);
          doParse(text);
        }
      };
      reader.readAsText(file);
    },
    [doParse]
  );

  // ── Animal matching ──
  const { matched, unmatched, allFileIds } = useMemo(() => {
    if (!parsed)
      return {
        matched: new Map<string, Animal>(),
        unmatched: [] as string[],
        allFileIds: [] as string[],
      };

    const idSet = new Set<string>();
    for (const m of parsed) {
      for (const id of Object.keys(m.data)) idSet.add(id);
    }
    const allIds = Array.from(idSet).sort((a, b) => {
      const na = a.split("-").map(Number);
      const nb = b.split("-").map(Number);
      if (na[0] !== nb[0]) return (na[0] || 0) - (nb[0] || 0);
      return (na[1] || 0) - (nb[1] || 0);
    });

    // Build a lookup: cohort number → cohort id
    // e.g. "BPAN 3" → extract "3", "BPAN 4" → extract "4"
    const cohortNumToId = new Map<string, string>();
    for (const c of cohorts) {
      const numMatch = c.name.match(/(\d+)/);
      if (numMatch) cohortNumToId.set(numMatch[1], c.id);
    }

    const matchMap = new Map<string, Animal>();
    const unmatchedIds: string[] = [];

    for (const id of allIds) {
      // Strategy 1: Exact identifier match
      let animal = animals.find((a) => a.identifier === id);

      // Strategy 2: File ID is "X-Y" → find animal with identifier "Y" in cohort with number X
      if (!animal && id.includes("-")) {
        const [cohortNum, animalNum] = id.split("-");
        const cohortId = cohortNumToId.get(cohortNum);
        if (cohortId) {
          animal = animals.find(
            (a) => a.cohort_id === cohortId && a.identifier === animalNum
          );
        }
      }

      // Strategy 3: Try matching just the last part of the ID as identifier (for single-cohort imports)
      if (!animal && id.includes("-")) {
        const animalNum = id.split("-").pop()!;
        const candidates = animals.filter((a) => a.identifier === animalNum);
        if (candidates.length === 1) animal = candidates[0];
      }

      // Strategy 4: Try matching the full ID against identifier with different separators
      if (!animal) {
        animal = animals.find(
          (a) => a.identifier.replace(/[-_\s]/g, "") === id.replace(/[-_\s]/g, "")
        );
      }

      if (animal) matchMap.set(id, animal);
      else unmatchedIds.push(id);
    }

    return { matched: matchMap, unmatched: unmatchedIds, allFileIds: allIds };
  }, [parsed, animals, cohorts]);

  // ── Auto-select all matched animals when matching changes ──
  useEffect(() => {
    if (matched.size > 0) {
      setSelectedAnimals(new Set(Array.from(matched.keys())));
    }
  }, [matched]);

  // ── Measure stats ──
  const getMeasureStats = useCallback((measure: ParsedMeasure) => {
    const values = Object.values(measure.data);
    const numericValues = values.filter(
      (v) => typeof v === "number"
    ) as number[];
    const nonZero = numericValues.filter((v) => v !== 0);
    const allZero =
      numericValues.length > 0 && numericValues.every((v) => v === 0);
    const min = numericValues.length > 0 ? Math.min(...numericValues) : null;
    const max = numericValues.length > 0 ? Math.max(...numericValues) : null;

    return {
      totalAnimals: values.length,
      nonZeroCount: nonZero.length,
      allZero,
      min,
      max,
      isText: measure.type === "text",
    };
  }, []);

  // ── Import handler ──
  const handleImport = useCallback(async () => {
    if (!parsed || selectedMeasures.size === 0) return;
    setImporting(true);

    try {
      const tp = Number(timepointAge);

      // Build one entry per matched animal, merging with any existing results
      const entriesMap = new Map<
        string,
        {
          animalId: string;
          measures: Record<string, string | number | null>;
        }
      >();

      for (const measure of parsed) {
        if (!selectedMeasures.has(measure.key)) continue;

        for (const [fileId, value] of Object.entries(measure.data)) {
          if (!selectedAnimals.has(fileId)) continue;
          const animal = matched.get(fileId);
          if (!animal) continue;

          if (!entriesMap.has(animal.id)) {
            // Seed with existing measures so we merge, not overwrite
            const existing = colonyResults.find(
              (r) =>
                r.animal_id === animal.id &&
                r.timepoint_age_days === tp &&
                r.experiment_type === experimentType
            );
            const existingMeasures = existing
              ? (existing.measures as Record<string, string | number | null>)
              : {};
            entriesMap.set(animal.id, {
              animalId: animal.id,
              measures: { ...existingMeasures },
            });
          }
          entriesMap.get(animal.id)!.measures[measure.key] = value;
        }
      }

      const entries = Array.from(entriesMap.values());
      if (entries.length === 0) {
        toast.error("No matching animals found to import");
        setImporting(false);
        return;
      }

      const result = await batchUpsertColonyResults(
        tp,
        experimentType,
        entries
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          `Imported ${selectedMeasures.size} measures for ${result.saved} animals`
        );
        // Notify parent of which measures were imported so columns can be added
        if (onImportComplete && parsed) {
          const importedMeasures = parsed
            .filter((m) => selectedMeasures.has(m.key))
            .map((m) => ({ key: m.key, name: m.name, unit: m.unit }));
          onImportComplete(experimentType, importedMeasures);
        }
        onClose();
      }
    } catch (err) {
      toast.error("Import failed");
      console.error(err);
    } finally {
      setImporting(false);
    }
  }, [
    parsed,
    selectedMeasures,
    selectedAnimals,
    matched,
    timepointAge,
    experimentType,
    colonyResults,
    batchUpsertColonyResults,
    onImportComplete,
    onClose,
  ]);

  // ── Timepoint options ──
  const timepointOptions = useMemo(() => {
    if (timepoints.length > 0)
      return timepoints.map((t) => t.age_days).sort((a, b) => a - b);
    return [60, 120, 180];
  }, [timepoints]);

  // ── Selected count that have actual matching animals ──
  const selectedAnimalCount = Array.from(selectedAnimals).filter((id) => matched.has(id)).length;
  const selectedCount = selectedMeasures.size;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Tracking System Data
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* ─── Step 1: Input ─── */}
          {!parsed ? (
            <div className="space-y-3">
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium">
                  Upload tracking output file
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag & drop or click — supports .txt files from EthoVision,
                  ABET II, and similar systems
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".txt,.text,.csv,.tsv,.dat"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    or paste below
                  </span>
                </div>
              </div>

              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-none h-48 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Paste tracking system output here..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />

              {rawText.trim() && (
                <Button
                  onClick={() => doParse(rawText)}
                  className="w-full gap-1.5"
                >
                  <FileText className="h-4 w-4" /> Parse Data
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* ─── Parsed header bar ─── */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {parsed.length} measures detected
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {allFileIds.length} animals in file
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => {
                    setRawText("");
                    setParsed(null);
                    setSelectedMeasures(new Set());
                    setSelectedAnimals(new Set());
                  }}
                >
                  <X className="h-3 w-3" /> Clear & Re-paste
                </Button>
              </div>

              {/* ─── Timepoint + Experiment Type ─── */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs mb-1 block">Timepoint</Label>
                  <Select value={timepointAge} onValueChange={setTimepointAge}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timepointOptions.map((age) => (
                        <SelectItem key={age} value={String(age)}>
                          {age} Day
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Experiment Type</Label>
                  <Select value={experimentType} onValueChange={setExperimentType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPERIMENT_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ─── Two-column: Measures | Animals ─── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ─── Left: Measure Selection ─── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Measures</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() =>
                          setSelectedMeasures(new Set(parsed.map((m) => m.key)))
                        }
                      >
                        All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => setSelectedMeasures(new Set())}
                      >
                        None
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-[280px] border rounded-lg">
                    <div className="p-1.5 space-y-0.5">
                      {parsed.map((measure) => {
                        const stats = getMeasureStats(measure);
                        const isSelected = selectedMeasures.has(measure.key);

                        return (
                          <label
                            key={measure.key}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/30"
                                : "hover:bg-muted/50"
                            } ${stats.allZero && stats.totalAnimals > 0 ? "opacity-50" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedMeasures);
                                if (e.target.checked) next.add(measure.key);
                                else next.delete(measure.key);
                                setSelectedMeasures(next);
                              }}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">
                                  {measure.name}
                                </span>
                                {measure.unit && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    ({measure.unit})
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {stats.allZero && stats.totalAnimals > 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    All zeros
                                  </span>
                                ) : stats.isText ? (
                                  <span>{stats.totalAnimals} animals · text</span>
                                ) : stats.totalAnimals === 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    No data
                                  </span>
                                ) : (
                                  <span>
                                    {stats.totalAnimals} animals ·{" "}
                                    {stats.min !== null
                                      ? stats.min % 1 === 0
                                        ? stats.min
                                        : stats.min.toFixed(2)
                                      : "?"}{" "}
                                    –{" "}
                                    {stats.max !== null
                                      ? stats.max % 1 === 0
                                        ? stats.max
                                        : stats.max.toFixed(2)
                                      : "?"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* ─── Right: Animal Selection ─── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Animals
                      <span className="ml-1.5 font-normal text-xs text-muted-foreground">
                        <span className="text-green-600 dark:text-green-400">{matched.size}</span>
                        {unmatched.length > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 ml-1">
                            +{unmatched.length} unmatched
                          </span>
                        )}
                      </span>
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() =>
                          setSelectedAnimals(new Set(Array.from(matched.keys())))
                        }
                      >
                        All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => setSelectedAnimals(new Set())}
                      >
                        None
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-[280px] border rounded-lg">
                    <div className="p-1.5 space-y-0.5">
                      {allFileIds.map((fileId) => {
                        const animal = matched.get(fileId);
                        const isMatched = !!animal;
                        const isSelected = selectedAnimals.has(fileId);
                        const cohort = animal
                          ? cohorts.find((c) => c.id === animal.cohort_id)
                          : null;

                        return (
                          <label
                            key={fileId}
                            className={`flex items-center gap-2 px-2 py-1 rounded-md transition-colors ${
                              !isMatched
                                ? "opacity-40 cursor-not-allowed"
                                : isSelected
                                ? "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30 cursor-pointer"
                                : "hover:bg-muted/50 cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected && isMatched}
                              disabled={!isMatched}
                              onChange={(e) => {
                                const next = new Set(selectedAnimals);
                                if (e.target.checked) next.add(fileId);
                                else next.delete(fileId);
                                setSelectedAnimals(next);
                              }}
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5 shrink-0"
                            />
                            <span className="text-[11px] font-mono text-muted-foreground w-7 shrink-0 text-right">
                              {fileId}
                            </span>
                            {isMatched ? (
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="text-[11px]">→</span>
                                <span className="text-xs font-medium truncate">
                                  {animal.identifier}
                                </span>
                                {cohort && (
                                  <Badge variant="secondary" className="text-[9px] h-3.5 px-1 shrink-0">
                                    {cohort.name}
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {animal.sex === "male" ? "♂" : "♀"}{" "}
                                  {animal.genotype === "hemi"
                                    ? "Hemi"
                                    : animal.genotype === "wt"
                                    ? "WT"
                                    : "Het"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                No match
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  {unmatched.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Unmatched animals cannot be selected.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── Footer ─── */}
        {parsed && (
          <DialogFooter className="border-t pt-3 mt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                importing || selectedCount === 0 || selectedAnimalCount === 0
              }
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Import {selectedCount} measure{selectedCount !== 1 ? "s" : ""} for{" "}
              {selectedAnimalCount} animal{selectedAnimalCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

