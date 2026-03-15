"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Loader2, Save, ChevronDown, ChevronRight, Plus, Check, Upload, Eye, EyeOff, Camera, ExternalLink, Image as ImageIcon, Download, MoreHorizontal, Trash2, RotateCcw, FolderOpen, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { Animal, Cohort, ColonyTimepoint, ColonyResult } from "@/types";
import { MiniEarTag } from "@/components/ear-tag-selector";
import { BehaviorImportDialog } from "@/components/behavior-import-dialog";
import { exportColonyResultsMigrationWorkbook, exportColonyResultsWorkbook } from "@/lib/results-export";

// ─── Default experiment measures per type ─────────────────────────────

export interface MeasureField {
  key: string;
  label: string;
  unit?: string;
  type?: "number" | "text";
}

type MeasureValue = string | number | null | string[];
type MeasureMap = Record<string, MeasureValue>;

const ROTAROD_AVG_LATENCY_KEY = "latency_to_fall_sec";
const ROTAROD_AVG_RPM_KEY = "rpm_at_fall";
const ROTAROD_TRIAL_LATENCY_KEYS = ["trial_1_sec", "trial_2_sec", "trial_3_sec"] as const;
const ROTAROD_TRIAL_RPM_KEYS = ["trial_1_rpm", "trial_2_rpm", "trial_3_rpm"] as const;
const STAMINA_AVG_KEY = "avg_duration_sec";
const STAMINA_TRIAL_KEYS = ["test_1_sec", "test_2_sec", "test_3_sec"] as const;
const CAGE_IMAGE_KEY = "__cage_image";
const CAGE_IMAGE_LIST_KEY = "__cage_images";
const RAW_DATA_URL_KEY = "__raw_data_url";
const RAW_DATA_URL_LIST_KEY = "__raw_data_urls";
const ATTACHMENT_FOLDER_URL_KEY = "__attachment_folder_url";
const ATTACHMENT_FOLDER_URL_LIST_KEY = "__attachment_folder_urls";

function isRotarodTrialWithAveragesExperiment(exp: string) {
  return exp === "rotarod_test1" || exp === "rotarod_test2";
}

function isStaminaWithAverageExperiment(exp: string) {
  return exp === "stamina";
}

function getAttachmentUrls(measures: MeasureMap, arrayKey: string, legacyKey: string) {
  const arrayVal = measures[arrayKey];
  if (Array.isArray(arrayVal)) {
    return arrayVal.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }
  const legacyVal = measures[legacyKey];
  if (typeof legacyVal === "string" && legacyVal.trim()) return [legacyVal.trim()];
  return [];
}

function applyAttachmentUrls(measures: MeasureMap, arrayKey: string, legacyKey: string, urls: string[]): MeasureMap {
  const normalized = urls
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter((url, index, arr) => url.length > 0 && arr.indexOf(url) === index);
  return {
    ...measures,
    [arrayKey]: normalized,
    [legacyKey]: normalized[0] ?? null,
  };
}

function normalizeUrlList(urls: string[]) {
  return urls
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter((url, index, arr) => url.length > 0 && arr.indexOf(url) === index);
}

function toNumericOrNull(value: MeasureValue | undefined) {
  if (Array.isArray(value)) return null;
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyDerivedMeasuresForExperiment(
  exp: string,
  measures: MeasureMap
): MeasureMap {
  if (isStaminaWithAverageExperiment(exp)) {
    const next = { ...measures };
    const staminaValues = STAMINA_TRIAL_KEYS.map((key) => toNumericOrNull(next[key])).filter(
      (value): value is number => value !== null
    );
    next[STAMINA_AVG_KEY] =
      staminaValues.length > 0
        ? Number((staminaValues.reduce((sum, value) => sum + value, 0) / staminaValues.length).toFixed(2))
        : toNumericOrNull(next[STAMINA_AVG_KEY]) ?? toNumericOrNull(next.duration_sec);
    return next;
  }

  if (!isRotarodTrialWithAveragesExperiment(exp)) return measures;

  const next = { ...measures };
  const latencyValues = ROTAROD_TRIAL_LATENCY_KEYS.map((key) => toNumericOrNull(next[key])).filter(
    (value): value is number => value !== null
  );
  const rpmValues = ROTAROD_TRIAL_RPM_KEYS.map((key) => toNumericOrNull(next[key])).filter(
    (value): value is number => value !== null
  );

  next[ROTAROD_AVG_LATENCY_KEY] =
    latencyValues.length > 0
      ? Number((latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length).toFixed(2))
      : null;
  next[ROTAROD_AVG_RPM_KEY] =
    rpmValues.length > 0
      ? Number((rpmValues.reduce((sum, value) => sum + value, 0) / rpmValues.length).toFixed(2))
      : null;

  return next;
}

function isDerivedReadOnlyField(exp: string, fieldKey: string) {
  return (
    (isRotarodTrialWithAveragesExperiment(exp) &&
      (fieldKey === ROTAROD_AVG_LATENCY_KEY || fieldKey === ROTAROD_AVG_RPM_KEY)) ||
    (isStaminaWithAverageExperiment(exp) && fieldKey === STAMINA_AVG_KEY)
  );
}

const DEFAULT_MEASURES: Record<string, MeasureField[]> = {
  y_maze: [
    { key: "spontaneous_alternation_pct", label: "Spontaneous Alternation", unit: "%", type: "number" },
    { key: "total_entries", label: "Total Arm Entries", type: "number" },
    { key: "distance_cm", label: "Distance", unit: "cm", type: "number" },
    { key: "duration_sec", label: "Test Duration", unit: "sec", type: "number" },
  ],
  ldb: [
    { key: "time_in_light_sec", label: "Time in Light", unit: "sec", type: "number" },
    { key: "time_in_dark_sec", label: "Time in Dark", unit: "sec", type: "number" },
    { key: "transitions", label: "Transitions", type: "number" },
    { key: "latency_to_light_sec", label: "Latency to Light", unit: "sec", type: "number" },
    { key: "distance_cm", label: "Distance", unit: "cm", type: "number" },
  ],
  marble: [
    { key: "marbles_buried", label: "Marbles Buried", type: "number" },
    { key: "marbles_total", label: "Total Marbles", type: "number" },
    { key: "time_to_first_bury_sec", label: "Time to First Bury", unit: "sec", type: "number" },
  ],
  nesting: [
    { key: "nest_score", label: "Nest Score (1–5)", type: "number" },
    { key: "shredded_pct", label: "Material Shredded", unit: "%", type: "number" },
  ],
  catwalk: [
    { key: "stride_length_cm", label: "Stride Length", unit: "cm", type: "number" },
    { key: "print_area_cm2", label: "Print Area", unit: "cm²", type: "number" },
    { key: "swing_speed_cm_s", label: "Swing Speed", unit: "cm/s", type: "number" },
    { key: "regularity_index_pct", label: "Regularity Index", unit: "%", type: "number" },
    { key: "base_of_support_cm", label: "Base of Support", unit: "cm", type: "number" },
  ],
  rotarod: [
    { key: "trial_1_sec", label: "Trial 1", unit: "sec", type: "number" },
    { key: "trial_2_sec", label: "Trial 2", unit: "sec", type: "number" },
    { key: "trial_3_sec", label: "Trial 3", unit: "sec", type: "number" },
    { key: "latency_to_fall_sec", label: "Avg Latency to Fall", unit: "sec", type: "number" },
    { key: "rpm_at_fall", label: "RPM at Fall", type: "number" },
  ],
  rotarod_hab: [
    { key: "trial_1_sec", label: "Habituation Trial 1", unit: "sec", type: "number" },
    { key: "trial_2_sec", label: "Habituation Trial 2", unit: "sec", type: "number" },
  ],
  rotarod_test1: [
    { key: "trial_1_sec", label: "Trial 1 - Latency to Fall", unit: "sec", type: "number" },
    { key: "trial_1_rpm", label: "Trial 1 - RPM at Fall", type: "number" },
    { key: "trial_2_sec", label: "Trial 2 - Latency to Fall", unit: "sec", type: "number" },
    { key: "trial_2_rpm", label: "Trial 2 - RPM at Fall", type: "number" },
    { key: "trial_3_sec", label: "Trial 3 - Latency to Fall", unit: "sec", type: "number" },
    { key: "trial_3_rpm", label: "Trial 3 - RPM at Fall", type: "number" },
    { key: "latency_to_fall_sec", label: "Avg Latency to Fall", unit: "sec", type: "number" },
    { key: "rpm_at_fall", label: "Avg RPM at Fall", type: "number" },
  ],
  rotarod_test2: [
    { key: "trial_1_sec", label: "Trial 1 - Latency to Fall", unit: "sec", type: "number" },
    { key: "trial_1_rpm", label: "Trial 1 - RPM at Fall", type: "number" },
    { key: "trial_2_sec", label: "Trial 2 - Latency to Fall", unit: "sec", type: "number" },
    { key: "trial_2_rpm", label: "Trial 2 - RPM at Fall", type: "number" },
    { key: "trial_3_sec", label: "Trial 3 - Latency to Fall", unit: "sec", type: "number" },
    { key: "trial_3_rpm", label: "Trial 3 - RPM at Fall", type: "number" },
    { key: "latency_to_fall_sec", label: "Avg Latency to Fall", unit: "sec", type: "number" },
    { key: "rpm_at_fall", label: "Avg RPM at Fall", type: "number" },
  ],
  stamina: [
    { key: "test_1_sec", label: "Test 1", unit: "sec", type: "number" },
    { key: "test_2_sec", label: "Test 2", unit: "sec", type: "number" },
    { key: "test_3_sec", label: "Test 3", unit: "sec", type: "number" },
    { key: STAMINA_AVG_KEY, label: "Average", unit: "sec", type: "number" },
  ],
  blood_draw: [
    { key: "volume_ul", label: "Volume Collected", unit: "µL", type: "number" },
    { key: "hemolysis", label: "Hemolysis (Y/N)", type: "text" },
    { key: "cort_ng_ml", label: "Corticosterone", unit: "ng/mL", type: "number" },
  ],
  eeg_recording: [
    { key: "recording_hours", label: "Recording Duration", unit: "hrs", type: "number" },
    { key: "seizure_count", label: "Seizure Count", type: "number" },
    { key: "spike_frequency_hz", label: "Spike Frequency", unit: "Hz", type: "number" },
    { key: "signal_quality", label: "Signal Quality (1–5)", type: "number" },
  ],
};

// Experiment types to show result entry for (skip handling, data_collection, core_acclimation as they don't produce data)
const RESULT_EXPERIMENT_TYPES = [
  "y_maze",
  "ldb",
  "marble",
  "nesting",
  "catwalk",
  "rotarod_hab",
  "rotarod_test1",
  "rotarod_test2",
  "rotarod",
  "stamina",
  "blood_draw",
  "eeg_recording",
];

const EXPERIMENT_LABELS: Record<string, string> = {
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Overnight Nesting",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Habituation",
  rotarod_test1: "Rotarod Test 1",
  rotarod_test2: "Rotarod Test 2",
  rotarod: "Rotarod Testing",
  stamina: "Stamina Test",
  blood_draw: "Plasma Collection",
  eeg_recording: "EEG Recording",
};

const GENOTYPE_LABELS: Record<string, string> = {
  hemi: "Hemi",
  wt: "WT",
  het: "Het",
};

// Experiments that use cage image uploads vs raw data URL links
const IMAGE_EXPERIMENTS = new Set(["nesting", "marble"]);

// ─── Props ───────────────────────────────────────────────────────────

interface ColonyResultsTabProps {
  animals: Animal[];
  cohorts: Cohort[];
  timepoints: ColonyTimepoint[];
  colonyResults: ColonyResult[];
  batchUpsertColonyResults: (
    timepointAgeDays: number,
    experimentType: string,
    entries: {
      animalId: string;
      measures: MeasureMap;
      notes?: string;
    }[],
    options?: { emptyResultStatus?: "skipped" | "pending" | "scheduled" | "leave" }
  ) => Promise<{ success?: boolean; error?: string; saved?: number; errors?: string[] }>;
  reconcileTrackerFromExistingColonyResults: () => Promise<{ success?: boolean; error?: string; completed?: number; ignored?: number }>;
  deleteColonyResultMeasureColumn: (
    timepointAgeDays: number,
    experimentType: string,
    fieldKey: string
  ) => Promise<{ success?: boolean; error?: string; updated?: number }>;
}

// ─── Component ───────────────────────────────────────────────────────

export function ColonyResultsTab({
  animals,
  cohorts,
  timepoints,
  colonyResults,
  batchUpsertColonyResults,
  reconcileTrackerFromExistingColonyResults,
  deleteColonyResultMeasureColumn,
}: ColonyResultsTabProps) {
  type SaveEntry = {
    animalId: string;
    measures: MeasureMap;
    notes?: string;
  };

  const hasMeaningfulMeasures = useCallback((measures: MeasureMap | null | undefined) => {
    if (!measures) return false;
    return Object.values(measures).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return v !== null && v !== "" && v !== undefined;
    });
  }, []);

  // State
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [showEmptyStatusDialog, setShowEmptyStatusDialog] = useState(false);
  const [pendingSaveEntries, setPendingSaveEntries] = useState<SaveEntry[] | null>(null);
  const [pendingClearedRowsCount, setPendingClearedRowsCount] = useState(0);
  const [emptyStatusChoice, setEmptyStatusChoice] = useState<"skipped" | "pending" | "scheduled" | "leave">("skipped");
  const [activeTimepoint, setActiveTimepoint] = useState<string>(
    timepoints.length > 0 ? String(timepoints[0].age_days) : "30"
  );
  const [activeExperiment, setActiveExperiment] = useState<string>("y_maze");
  // Custom fields per experiment type
  const [customFields, setCustomFields] = useState<Record<string, MeasureField[]>>({});
  // Hidden fields per experiment type (persisted in localStorage)
  const [hiddenFields, setHiddenFields] = useState<Record<string, Set<string>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("colony_hidden_fields");
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string[]>;
        const result: Record<string, Set<string>> = {};
        for (const [k, v] of Object.entries(parsed)) result[k] = new Set(v);
        return result;
      }
    } catch { /* ignore */ }
    return {};
  });
  const [showHiddenFields, setShowHiddenFields] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exportingGoogleBackup, setExportingGoogleBackup] = useState(false);
  const [creatingLiveSyncSheet, setCreatingLiveSyncSheet] = useState(false);
  const [pendingDeleteField, setPendingDeleteField] = useState<MeasureField | null>(null);
  const [deletingField, setDeletingField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldUnit, setNewFieldUnit] = useState("");

  // Persist hidden fields to localStorage
  useEffect(() => {
    try {
      const serializable: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(hiddenFields)) {
        if (v.size > 0) serializable[k] = Array.from(v);
      }
      localStorage.setItem("colony_hidden_fields", JSON.stringify(serializable));
    } catch { /* ignore */ }
  }, [hiddenFields]);

  // Keep the core rotarod average columns visible even if they were hidden in an older layout.
  useEffect(() => {
    setHiddenFields((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const exp of ["rotarod_test1", "rotarod_test2"] as const) {
        const current = next[exp];
        if (!current || current.size === 0) continue;
        if (!current.has(ROTAROD_AVG_LATENCY_KEY) && !current.has(ROTAROD_AVG_RPM_KEY)) continue;
        const updated = new Set(current);
        updated.delete(ROTAROD_AVG_LATENCY_KEY);
        updated.delete(ROTAROD_AVG_RPM_KEY);
        next[exp] = updated;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    setHiddenFields((prev) => {
      const current = prev.stamina;
      if (!current || current.size === 0 || !current.has(STAMINA_AVG_KEY)) return prev;
      const next = { ...prev, stamina: new Set(current) };
      next.stamina.delete(STAMINA_AVG_KEY);
      return next;
    });
  }, []);

  // Local editable data: keyed by `${animalId}-${timepoint}-${experiment}`
  const [editData, setEditData] = useState<
    Record<string, { measures: MeasureMap; notes: string }>
  >({});
  // Track which rows were changed
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // Sort timepoints
  const sortedTimepoints = useMemo(
    () => [...timepoints].sort((a, b) => a.age_days - b.age_days),
    [timepoints]
  );

  // Default timepoints if none configured
  const timepointOptions = useMemo(() => {
    if (sortedTimepoints.length > 0) return sortedTimepoints.map((tp) => tp.age_days);
    return [60, 120, 180];
  }, [sortedTimepoints]);

  // Active animals sorted by cohort → sex → genotype
  const activeAnimals = useMemo(() => {
    return animals
      .filter((a) => a.status === "active")
      .sort((a, b) => {
        // Sort by cohort name
        const cohortA = cohorts.find((c) => c.id === a.cohort_id)?.name || "";
        const cohortB = cohorts.find((c) => c.id === b.cohort_id)?.name || "";
        if (cohortA !== cohortB) return cohortA.localeCompare(cohortB);
        // Then sex
        if (a.sex !== b.sex) return a.sex === "male" ? -1 : 1;
        // Then genotype
        const gSort: Record<string, number> = { hemi: 0, het: 1, wt: 2 };
        return (gSort[a.genotype] || 0) - (gSort[b.genotype] || 0);
      });
  }, [animals, cohorts]);

  // Get existing result for an animal + timepoint + experiment
  const getExistingResult = useCallback(
    (animalId: string, tp: number, exp: string): ColonyResult | undefined => {
      return colonyResults.find(
        (r) =>
          r.animal_id === animalId &&
          r.timepoint_age_days === tp &&
          r.experiment_type === exp
      );
    },
    [colonyResults]
  );

  // Get the data for an animal row (from edits, then from existing, then empty)
  const getRowData = useCallback(
    (animalId: string, tp: number, exp: string) => {
      const key = `${animalId}-${tp}-${exp}`;
      if (editData[key]) return editData[key];
      const existing = getExistingResult(animalId, tp, exp);
      if (existing)
        return {
          measures: applyDerivedMeasuresForExperiment(
            exp,
            (existing.measures as MeasureMap) || {}
          ),
          notes: existing.notes || "",
        };
      return { measures: applyDerivedMeasuresForExperiment(exp, {}), notes: "" };
    },
    [editData, getExistingResult]
  );

  // Auto-detect extra measure fields from existing colony results (e.g. from tracking imports)
  const detectedFields = useMemo(() => {
    const detected: Record<string, MeasureField[]> = {};

    for (const result of colonyResults) {
      const exp = result.experiment_type;
      const defaultKeys = new Set((DEFAULT_MEASURES[exp] || []).map((f) => f.key));
      const customKeys = new Set((customFields[exp] || []).map((f) => f.key));
      if (!detected[exp]) detected[exp] = [];
      const detectedKeys = new Set(detected[exp].map((f) => f.key));

      const measures = result.measures as Record<string, unknown>;
      for (const key of Object.keys(measures)) {
        if (key.startsWith("__")) continue; // Skip internal fields (__cage_image, __raw_data_url)
        if (measures[key] === null) continue;
        if (defaultKeys.has(key) || customKeys.has(key) || detectedKeys.has(key)) continue;

        detected[exp].push({
          key,
          label: key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          type: typeof measures[key] === "number" ? "number" : "text",
        });
        detectedKeys.add(key);
      }
    }

    return detected;
  }, [colonyResults, customFields]);

  // Get ALL fields for an experiment (before hiding), with data-filled first
  const getAllFields = useCallback(
    (exp: string): MeasureField[] => {
      const defaults = DEFAULT_MEASURES[exp] || [];
      const custom = customFields[exp] || [];
      const autoDetected = detectedFields[exp] || [];
      const allFields = [...defaults, ...custom, ...autoDetected];

      // De-duplicate by key (imported fields may overlap with defaults)
      const seen = new Set<string>();
      const unique: MeasureField[] = [];
      for (const f of allFields) {
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        unique.push(f);
      }

      // Determine which field keys actually have data in any colonyResult for the active experiment
      const keysWithData = new Set<string>();
      for (const r of colonyResults) {
        if (r.experiment_type !== exp) continue;
        const m = r.measures as Record<string, unknown>;
        for (const [k, v] of Object.entries(m)) {
          if (k.startsWith("__")) continue; // Skip internal fields
          if (v !== null && v !== undefined && v !== "") keysWithData.add(k);
        }
      }

      // Sort: fields with data first, then empty defaults
      const withData = unique.filter((f) => keysWithData.has(f.key));
      const withoutData = unique.filter((f) => !keysWithData.has(f.key));
      return [...withData, ...withoutData];
    },
    [customFields, detectedFields, colonyResults]
  );

  // Get visible fields (filter out hidden)
  const getFields = useCallback(
    (exp: string): MeasureField[] => {
      const all = getAllFields(exp);
      const hidden = hiddenFields[exp];
      if (!hidden || hidden.size === 0) return all;
      return all.filter((f) => !hidden.has(f.key));
    },
    [getAllFields, hiddenFields]
  );

  // Update a specific measure for an animal
  const updateMeasure = useCallback(
    (animalId: string, tp: number, exp: string, fieldKey: string, value: MeasureValue) => {
      const key = `${animalId}-${tp}-${exp}`;
      setEditData((prev) => {
        const current = prev[key] || getRowData(animalId, tp, exp);
        const nextMeasures = applyDerivedMeasuresForExperiment(exp, {
          ...current.measures,
          [fieldKey]: value === "" ? null : value,
        });
        return {
          ...prev,
          [key]: {
            ...current,
            measures: nextMeasures,
          },
        };
      });
      setDirtyKeys((prev) => new Set(prev).add(key));
    },
    [getRowData]
  );

  const updateAttachments = useCallback(
    (animalId: string, tp: number, exp: string, arrayKey: string, legacyKey: string, urls: string[]) => {
      const key = `${animalId}-${tp}-${exp}`;
      setEditData((prev) => {
        const current = prev[key] || getRowData(animalId, tp, exp);
        return {
          ...prev,
          [key]: {
            ...current,
            measures: applyDerivedMeasuresForExperiment(
              exp,
              applyAttachmentUrls(current.measures, arrayKey, legacyKey, urls)
            ),
          },
        };
      });
      setDirtyKeys((prev) => new Set(prev).add(key));
    },
    [getRowData]
  );

  // Update notes for an animal
  const updateNotes = useCallback(
    (animalId: string, tp: number, exp: string, notes: string) => {
      const key = `${animalId}-${tp}-${exp}`;
      setEditData((prev) => {
        const current = prev[key] || getRowData(animalId, tp, exp);
        return {
          ...prev,
          [key]: { ...current, notes },
        };
      });
      setDirtyKeys((prev) => new Set(prev).add(key));
    },
    [getRowData]
  );

  // Save all dirty rows for the current timepoint + experiment
  const executeSave = useCallback(async (
    tp: number,
    exp: string,
    entries: SaveEntry[],
    emptyResultStatus?: "skipped" | "pending" | "scheduled" | "leave"
  ) => {
    setSaving(true);
    try {
      const result = await batchUpsertColonyResults(tp, exp, entries, emptyResultStatus ? { emptyResultStatus } : undefined);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Saved results for ${result.saved} animal${(result.saved || 0) > 1 ? "s" : ""}`);
        setDirtyKeys(new Set());
        setPendingSaveEntries(null);
        setPendingClearedRowsCount(0);
      }
    } catch {
      toast.error("Failed to save results");
    } finally {
      setSaving(false);
    }
  }, [batchUpsertColonyResults]);

  const handleSave = useCallback(async () => {
    const tp = Number(activeTimepoint);
    const exp = activeExperiment;

    const entries: SaveEntry[] = [];

    for (const animal of activeAnimals) {
      const key = `${animal.id}-${tp}-${exp}`;
      if (dirtyKeys.has(key)) {
        const data = editData[key] || getRowData(animal.id, tp, exp);
        // Convert string numbers to actual numbers
        const cleanMeasures: MeasureMap = {};
        const normalizedMeasures = applyDerivedMeasuresForExperiment(exp, data.measures);
        for (const [k, v] of Object.entries(normalizedMeasures)) {
          if (Array.isArray(v)) {
            cleanMeasures[k] = v.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
          } else if (v === null || v === "") {
            cleanMeasures[k] = null;
          } else if (typeof v === "string" && !isNaN(Number(v))) {
            cleanMeasures[k] = Number(v);
          } else {
            cleanMeasures[k] = v;
          }
        }
        entries.push({
          animalId: animal.id,
          measures: cleanMeasures,
          notes: data.notes || undefined,
        });
      }
    }

    if (entries.length === 0) {
      toast.info("No changes to save");
      return;
    }

    const clearedRows = entries.filter((entry) => {
      const existing = getExistingResult(entry.animalId, tp, exp);
      if (!existing) return false;
      const existingHasData = hasMeaningfulMeasures(existing.measures as MeasureMap);
      const nextHasData = hasMeaningfulMeasures(entry.measures);
      return existingHasData && !nextHasData;
    });

    if (clearedRows.length > 0) {
      setPendingSaveEntries(entries);
      setPendingClearedRowsCount(clearedRows.length);
      setEmptyStatusChoice("skipped");
      setShowEmptyStatusDialog(true);
      return;
    }

    await executeSave(tp, exp, entries);
  }, [activeTimepoint, activeExperiment, activeAnimals, dirtyKeys, editData, getRowData, getExistingResult, hasMeaningfulMeasures, executeSave]);

  const handleReconcileTracker = useCallback(async () => {
    setReconciling(true);
    try {
      const result = await reconcileTrackerFromExistingColonyResults();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Reconciled tracker from results (${result.completed ?? 0} completed, ${result.ignored ?? 0} empty ignored)`
      );
    } catch {
      toast.error("Failed to reconcile tracker statuses");
    } finally {
      setReconciling(false);
    }
  }, [reconcileTrackerFromExistingColonyResults]);

  // Export current view as CSV
  const handleExport = useCallback(() => {
    const tp = Number(activeTimepoint);
    const exp = activeExperiment;
    const fields = getFields(exp);

    // Build CSV headers
    const headers = ["Animal", "Cohort", "Genotype", "Sex", "Ear Tag", ...fields.map(f => f.label + (f.unit ? ` (${f.unit})` : ""))];
    const rows: string[][] = [];

    for (const animal of activeAnimals) {
      const data = getRowData(animal.id, tp, exp);
      const cohort = cohorts.find(c => c.id === animal.cohort_id);
      const row = [
        animal.identifier,
        cohort?.name || "",
        animal.genotype,
        animal.sex,
        animal.ear_tag || "",
        ...fields.map(f => {
          const v = data.measures[f.key];
          return v != null && v !== "" ? String(v) : "";
        }),
      ];
      rows.push(row);
    }

    // Build CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exp}_${tp}d_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  }, [activeTimepoint, activeExperiment, activeAnimals, getFields, getRowData, cohorts]);

  const handleExportAll = useCallback(() => {
    exportColonyResultsWorkbook(colonyResults, animals, cohorts);
    toast.success("Exported full colony backup workbook.");
  }, [animals, cohorts, colonyResults]);

  const handleExportMigration = useCallback(() => {
    exportColonyResultsMigrationWorkbook(colonyResults, animals, cohorts, timepoints);
    toast.success("Exported migration-ready colony workbook.");
  }, [animals, cohorts, colonyResults, timepoints]);

  const startGoogleSheetsConnect = useCallback(async () => {
    const authRes = await fetch("/api/sheets/google/auth");
    const authJson = await authRes.json().catch(() => ({}));
    if (!authRes.ok || !authJson.url) {
      toast.error(authJson.error || "Could not start Google Sheets authorization.");
      return false;
    }
    window.location.href = String(authJson.url);
    return true;
  }, []);

  const handleExportAllToGoogleSheets = useCallback(async () => {
    setExportingGoogleBackup(true);
    try {
      const res = await fetch("/api/sheets/google/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "colony_results" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof json.error === "string" && /Google Sheets not connected|needs to be reconnected/i.test(json.error)) {
          toast.error("Google Sheets needs to be connected first. Opening authorization.");
          await startGoogleSheetsConnect();
          return;
        }
        toast.error(json.error || "Failed to create Google Sheets backup.");
        return;
      }
      if (json.spreadsheetUrl) {
        window.open(String(json.spreadsheetUrl), "_blank", "noopener,noreferrer");
      }
      toast.success("Google Sheets backup created.");
    } finally {
      setExportingGoogleBackup(false);
    }
  }, [startGoogleSheetsConnect]);

  const handleCreateLiveSyncSheet = useCallback(async () => {
    setCreatingLiveSyncSheet(true);
    try {
      const res = await fetch("/api/sheets/google/mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "colony_results" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.needsReconnect && json.authUrl) {
          toast.error("Google Sheets needs to be reconnected. Opening Google authorization again.");
          window.location.href = String(json.authUrl);
          return;
        }
        if (typeof json.error === "string" && /Google Sheets not connected|needs to be reconnected/i.test(json.error)) {
          toast.error("Google Sheets needs to be connected first. Opening authorization.");
          await startGoogleSheetsConnect();
          return;
        }
        toast.error(json.error || "Failed to create live sync Google Sheet.");
        return;
      }
      if (json.spreadsheetUrl) {
        window.open(String(json.spreadsheetUrl), "_blank", "noopener,noreferrer");
      }
      toast.success("Live sync Google Sheet created.");
    } finally {
      setCreatingLiveSyncSheet(false);
    }
  }, [startGoogleSheetsConnect]);

  // Add custom field
  const handleAddField = useCallback(() => {
    if (!newFieldLabel.trim()) return;
    const key = newFieldKey.trim() || newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setCustomFields((prev) => ({
      ...prev,
      [activeExperiment]: [
        ...(prev[activeExperiment] || []),
        { key, label: newFieldLabel.trim(), unit: newFieldUnit.trim() || undefined, type: "number" as const },
      ],
    }));
    setNewFieldKey("");
    setNewFieldLabel("");
    setNewFieldUnit("");
    setShowAddField(false);
    toast.success(`Added "${newFieldLabel.trim()}" field`);
  }, [activeExperiment, newFieldKey, newFieldLabel, newFieldUnit]);

  // Hide a field (works for any field type)
  const handleHideField = useCallback(
    (fieldKey: string) => {
      setHiddenFields((prev) => {
        const current = prev[activeExperiment] || new Set<string>();
        const next = new Set(current);
        next.add(fieldKey);
        return { ...prev, [activeExperiment]: next };
      });
      // Also remove from custom fields if it's a custom one
      setCustomFields((prev) => ({
        ...prev,
        [activeExperiment]: (prev[activeExperiment] || []).filter((f) => f.key !== fieldKey),
      }));
    },
    [activeExperiment]
  );

  // Unhide a field
  const handleUnhideField = useCallback(
    (fieldKey: string) => {
      setHiddenFields((prev) => {
        const current = prev[activeExperiment] || new Set<string>();
        const next = new Set(current);
        next.delete(fieldKey);
        return { ...prev, [activeExperiment]: next };
      });
    },
    [activeExperiment]
  );

  const handleDeleteFieldValues = useCallback(async (field: MeasureField) => {
    const tp = Number(activeTimepoint);
    if (!Number.isFinite(tp)) return;
    setDeletingField(true);
    try {
      const result = await deleteColonyResultMeasureColumn(tp, activeExperiment, field.key);
      if (!result.success) {
        toast.error(result.error || "Failed to delete column values");
        return;
      }
      if ((customFields[activeExperiment] || []).some((f) => f.key === field.key)) {
        setCustomFields((prev) => ({
          ...prev,
          [activeExperiment]: (prev[activeExperiment] || []).filter((f) => f.key !== field.key),
        }));
      } else {
        setHiddenFields((prev) => {
          const current = prev[activeExperiment] || new Set<string>();
          const next = new Set(current);
          next.add(field.key);
          return { ...prev, [activeExperiment]: next };
        });
      }
      const count = result.updated ?? 0;
      toast.success(
        count > 0
          ? `Deleted stored values in "${field.label}" for ${count} row${count === 1 ? "" : "s"}`
          : `No saved values found in "${field.label}" for this view`
      );
    } finally {
      setDeletingField(false);
      setPendingDeleteField(null);
    }
  }, [activeExperiment, activeTimepoint, customFields, deleteColonyResultMeasureColumn]);

  // Handle import completion: add imported measures as custom fields
  const handleImportComplete = useCallback(
    (experimentType: string, importedMeasures: { key: string; name: string; unit?: string }[]) => {
      // Get existing keys to avoid duplicates
      const defaults = DEFAULT_MEASURES[experimentType] || [];
      const existing = customFields[experimentType] || [];
      const existingKeys = new Set([
        ...defaults.map((f) => f.key),
        ...existing.map((f) => f.key),
      ]);

      const newFields: MeasureField[] = [];
      for (const m of importedMeasures) {
        if (existingKeys.has(m.key)) continue;
        newFields.push({
          key: m.key,
          label: m.name,
          unit: m.unit,
          type: "number",
        });
      }

      if (newFields.length > 0) {
        setCustomFields((prev) => ({
          ...prev,
          [experimentType]: [...(prev[experimentType] || []), ...newFields],
        }));
      }

      // Unhide any of the imported measures that were previously hidden
      setHiddenFields((prev) => {
        const current = prev[experimentType] || new Set<string>();
        if (current.size === 0) return prev;
        const next = new Set(current);
        for (const m of importedMeasures) next.delete(m.key);
        return { ...prev, [experimentType]: next };
      });
    },
    [customFields]
  );

  const currentFields = getFields(activeExperiment);
  const allFieldsForExp = getAllFields(activeExperiment);
  const hiddenCount = (hiddenFields[activeExperiment]?.size || 0);
  const hiddenFieldsList = allFieldsForExp.filter(
    (f) => hiddenFields[activeExperiment]?.has(f.key)
  );
  const tp = Number(activeTimepoint);

  // Count how many animals have results for current view
  const filledCount = activeAnimals.filter((a) => {
    const data = getRowData(a.id, tp, activeExperiment);
    return hasMeaningfulMeasures(data.measures);
  }).length;

  // Group animals by cohort for display
  const animalsByCohort = useMemo(() => {
    const map = new Map<string, { cohort: Cohort | undefined; animals: Animal[] }>();
    for (const a of activeAnimals) {
      const cohort = cohorts.find((c) => c.id === a.cohort_id);
      const key = a.cohort_id;
      if (!map.has(key)) map.set(key, { cohort, animals: [] });
      map.get(key)!.animals.push(a);
    }
    return Array.from(map.values());
  }, [activeAnimals, cohorts]);

  // Available experiment types for the active timepoint (from timepoint config)
  const availableExperiments = useMemo(() => {
    const tp = sortedTimepoints.find((t) => t.age_days === Number(activeTimepoint));
    if (tp && tp.experiments.length > 0) {
      // Filter to only experiments that produce results
      const configured = tp.experiments.filter((e) => RESULT_EXPERIMENT_TYPES.includes(e));
      // Always include EEG recording if the timepoint has it
      if (tp.includes_eeg_implant && !configured.includes("eeg_recording")) {
        configured.push("eeg_recording");
      }
      return configured.length > 0 ? configured : RESULT_EXPERIMENT_TYPES;
    }
    return RESULT_EXPERIMENT_TYPES;
  }, [activeTimepoint, sortedTimepoints]);

  // Switch to first available experiment when timepoint changes
  const handleTimepointChange = useCallback(
    (val: string) => {
      setActiveTimepoint(val);
      // Reset experiment if not available in new timepoint
      const tp = sortedTimepoints.find((t) => t.age_days === Number(val));
      if (tp) {
        const configured = tp.experiments.filter((e) => RESULT_EXPERIMENT_TYPES.includes(e));
        if (configured.length > 0 && !configured.includes(activeExperiment)) {
          setActiveExperiment(configured[0]);
        }
      }
    },
    [sortedTimepoints, activeExperiment]
  );

  if (activeAnimals.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No active animals</p>
          <p className="text-sm mt-1">Add animals in the Animals tab to start recording results.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog
        open={showEmptyStatusDialog}
        onOpenChange={(open) => {
          setShowEmptyStatusDialog(open);
          if (!open && !saving) {
            setPendingSaveEntries(null);
            setPendingClearedRowsCount(0);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply tracker status for cleared results</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You cleared values for {pendingClearedRowsCount} row{pendingClearedRowsCount === 1 ? "" : "s"}.
              Choose what tracker status should be set for those rows when saving.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Status for cleared rows</Label>
              <Select value={emptyStatusChoice} onValueChange={(v) => setEmptyStatusChoice(v as typeof emptyStatusChoice)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="leave">Leave unchanged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setShowEmptyStatusDialog(false);
                setPendingSaveEntries(null);
                setPendingClearedRowsCount(0);
                toast.info("Save cancelled");
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !pendingSaveEntries}
              onClick={async () => {
                if (!pendingSaveEntries) return;
                setShowEmptyStatusDialog(false);
                await executeSave(Number(activeTimepoint), activeExperiment, pendingSaveEntries, emptyStatusChoice);
              }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Save Results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteField} onOpenChange={(open) => !open && !deletingField && setPendingDeleteField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete column values?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              This will remove all saved values in <span className="font-medium">{pendingDeleteField?.label}</span> for
              <span className="font-medium"> {EXPERIMENT_LABELS[activeExperiment] || activeExperiment}</span> at
              <span className="font-medium"> {activeTimepoint} days</span>.
            </p>
            <p className="text-muted-foreground">
              Use <span className="font-medium">Hide</span> if you only want to hide the column visually.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" disabled={deletingField} onClick={() => setPendingDeleteField(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!pendingDeleteField || deletingField}
              onClick={() => pendingDeleteField && handleDeleteFieldValues(pendingDeleteField)}
            >
              {deletingField ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
              Delete Values
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Timepoint Master Tabs ─────────────────────────────── */}
      <Tabs value={activeTimepoint} onValueChange={handleTimepointChange}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="h-auto gap-1 rounded-xl bg-muted/60 p-1">
            {timepointOptions.map((age) => (
              <TabsTrigger
                key={age}
                value={String(age)}
                className="px-4 py-2 text-sm font-semibold"
              >
                {age} Day
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {filledCount}/{activeAnimals.length} animals recorded
            </Badge>
            {dirtyKeys.size > 0 && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {dirtyKeys.size} unsaved
              </Badge>
            )}
          </div>
        </div>

        {timepointOptions.map((age) => (
          <TabsContent key={age} value={String(age)} className="mt-4">
            {/* ─── Experiment Sub-tabs ───────────────────────── */}
            <Tabs value={activeExperiment} onValueChange={setActiveExperiment}>
              <TabsList className="mb-4 h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-xl bg-muted/40 p-1.5 whitespace-nowrap">
                {availableExperiments.map((exp) => {
                  // Count animals with data for this experiment
                  const count = activeAnimals.filter((a) => {
                    const existing = getExistingResult(a.id, age, exp);
                    if (existing && Object.values(existing.measures as Record<string, unknown>).some((v) => v !== null)) return true;
                    const key = `${a.id}-${age}-${exp}`;
                    if (editData[key]) return Object.values(editData[key].measures).some((v) => v !== null && v !== "");
                    return false;
                  }).length;
                  return (
                    <TabsTrigger
                      key={exp}
                      value={exp}
                      className="relative h-8 flex-none rounded-lg px-3 text-xs font-medium"
                    >
                      {EXPERIMENT_LABELS[exp] || exp}
                      {count > 0 && (
                        <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {availableExperiments.map((exp) => (
                <TabsContent key={exp} value={exp}>
                  <Card className="border-slate-200/80 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {EXPERIMENT_LABELS[exp] || exp} — {age} Day Results
                          </CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Enter measured values for each animal. Changes are saved when you click Save.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleReconcileTracker}
                            disabled={reconciling || saving}
                            className="h-8 w-8 p-0"
                            title="Reconcile Tracker"
                            aria-label="Reconcile Tracker"
                          >
                            {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportMigration}
                            className="h-8 text-xs"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Export Migration
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportAll}
                            className="h-8 text-xs"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Export All Backup
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportAllToGoogleSheets}
                            className="h-8 text-xs"
                            disabled={exportingGoogleBackup}
                          >
                            {exportingGoogleBackup ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="mr-1 h-3.5 w-3.5" />}
                            Backup to Google Sheets
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCreateLiveSyncSheet}
                            className="h-8 text-xs"
                            disabled={creatingLiveSyncSheet}
                          >
                            {creatingLiveSyncSheet ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
                            Create Live Sync Sheet
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExport}
                            className="h-8 text-xs"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Export CSV
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowImport(true)}
                            className="h-8 text-xs"
                          >
                            <Upload className="mr-1 h-3.5 w-3.5" />
                            Import Data
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAddField(!showAddField)}
                            className="h-8 text-xs"
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Field
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving || dirtyKeys.size === 0}
                            className="h-8 bg-slate-900 text-xs text-white hover:bg-slate-800"
                          >
                            {saving ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="mr-1 h-3.5 w-3.5" />
                            )}
                            Save All
                          </Button>
                        </div>
                      </div>

                      {/* Add custom field form */}
                      {showAddField && (
                        <div className="flex items-end gap-2 mt-3 p-3 bg-muted/50 rounded-lg">
                          <div className="flex-1">
                            <Label className="text-xs">Field Label *</Label>
                            <Input
                              placeholder="e.g. Freezing Time"
                              value={newFieldLabel}
                              onChange={(e) => setNewFieldLabel(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="w-24">
                            <Label className="text-xs">Unit</Label>
                            <Input
                              placeholder="e.g. sec"
                              value={newFieldUnit}
                              onChange={(e) => setNewFieldUnit(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <Button size="sm" onClick={handleAddField} className="h-8">
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}

                      {/* Hidden fields indicator + restore UI */}
                      {hiddenCount > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => setShowHiddenFields(!showHiddenFields)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            {hiddenCount} hidden column{hiddenCount !== 1 ? "s" : ""}
                            <ChevronDown className={`w-3 h-3 transition-transform ${showHiddenFields ? "rotate-180" : ""}`} />
                          </button>
                          {showHiddenFields && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {hiddenFieldsList.map((f) => (
                                <button
                                  key={f.key}
                                  onClick={() => handleUnhideField(f.key)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-dashed"
                                  title={`Show "${f.label}" column`}
                                >
                                  <Eye className="w-3 h-3" />
                                  {f.label}
                                  {f.unit && <span className="text-muted-foreground/50">({f.unit})</span>}
                                </button>
                              ))}
                              <button
                                onClick={() => {
                                  setHiddenFields((prev) => ({
                                    ...prev,
                                    [activeExperiment]: new Set<string>(),
                                  }));
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors"
                              >
                                Show all
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardHeader>

                    <CardContent className="p-0">
                      {/* ─── Data Grid ─────────────────────────── */}
                      <div className="max-h-[70vh] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 z-20">
                            <tr className="border-b bg-background shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground sticky left-0 z-30 bg-background min-w-[150px]">
                                Animal
                              </th>
                              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground bg-background min-w-[90px]">
                                Cohort
                              </th>
                              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground bg-background min-w-[55px]">
                                Sex
                              </th>
                              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground bg-background min-w-[65px]">
                                GT
                              </th>
                              {currentFields.map((field) => (
                                <th
                                  key={field.key}
                                  className="group/col min-w-[120px] bg-background px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{field.label}</span>
                                    {field.unit && (
                                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                        ({field.unit})
                                      </span>
                                    )}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          className="text-muted-foreground/30 hover:text-foreground ml-auto opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
                                          title="Column options"
                                          type="button"
                                        >
                                          <MoreHorizontal className="w-3.5 h-3.5" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem onClick={() => handleHideField(field.key)}>
                                          <EyeOff className="w-3.5 h-3.5 mr-2" />
                                          Hide column
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => setPendingDeleteField(field)}
                                          className="text-red-600 focus:text-red-600"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                                          Delete values
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </th>
                              ))}
                              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground bg-background min-w-[140px]">
                                Notes
                              </th>
                              <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground bg-background min-w-[85px]">
                                {IMAGE_EXPERIMENTS.has(exp) ? "📷 Cage" : "🔗 Data"}
                              </th>
                              <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground bg-background w-[50px]">
                                ✓
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {animalsByCohort.map(({ cohort, animals: cohortAnimals }) => (
                              <CohortGroup
                                key={cohort?.id || "unknown"}
                                cohort={cohort}
                                animals={cohortAnimals}
                                timepoint={age}
                                experiment={exp}
                                fields={currentFields}
                                getRowData={getRowData}
                                getExistingResult={getExistingResult}
                                updateMeasure={updateMeasure}
                                updateAttachments={updateAttachments}
                                updateNotes={updateNotes}
                                dirtyKeys={dirtyKeys}
                                isImageExperiment={IMAGE_EXPERIMENTS.has(exp)}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>

      {/* ─── Import Dialog ─── */}
      {showImport && (
        <BehaviorImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          animals={animals}
          cohorts={cohorts}
          timepoints={timepoints}
          colonyResults={colonyResults}
          defaultTimepointAge={Number(activeTimepoint)}
          defaultExperimentType={activeExperiment}
          batchUpsertColonyResults={batchUpsertColonyResults}
          onImportComplete={handleImportComplete}
        />
      )}
    </div>
  );
}

// ─── Cohort Group (collapsible) ─────────────────────────────────────

interface CohortGroupProps {
  cohort: Cohort | undefined;
  animals: Animal[];
  timepoint: number;
  experiment: string;
  fields: MeasureField[];
  getRowData: (animalId: string, tp: number, exp: string) => { measures: MeasureMap; notes: string };
  getExistingResult: (animalId: string, tp: number, exp: string) => ColonyResult | undefined;
  updateMeasure: (animalId: string, tp: number, exp: string, fieldKey: string, value: MeasureValue) => void;
  updateAttachments: (animalId: string, tp: number, exp: string, arrayKey: string, legacyKey: string, urls: string[]) => void;
  updateNotes: (animalId: string, tp: number, exp: string, notes: string) => void;
  dirtyKeys: Set<string>;
  isImageExperiment: boolean;
}

function CohortGroup({
  cohort,
  animals,
  timepoint,
  experiment,
  fields,
  getRowData,
  getExistingResult,
  updateMeasure,
  updateAttachments,
  updateNotes,
  dirtyKeys,
  isImageExperiment,
}: CohortGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const filledInGroup = animals.filter((a) => {
    const existing = getExistingResult(a.id, timepoint, experiment);
    return existing && Object.values(existing.measures as Record<string, unknown>).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== ""));
  }).length;

  return (
    <>
      {/* Cohort header row */}
      <tr
        className="border-b bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <td colSpan={fields.length + 6} className="px-3 py-2">
          <div className="flex items-center gap-2">
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="font-semibold text-sm">{cohort?.name || "Unknown Cohort"}</span>
            <Badge variant="outline" className="text-[10px] font-normal">
              {filledInGroup}/{animals.length} recorded
            </Badge>
          </div>
        </td>
      </tr>

      {/* Animal rows */}
      {!collapsed &&
        animals.map((animal) => {
          const data = getRowData(animal.id, timepoint, experiment);
          const key = `${animal.id}-${timepoint}-${experiment}`;
          const isDirty = dirtyKeys.has(key);
          const hasData = getExistingResult(animal.id, timepoint, experiment) !== undefined;

          const genotypeRowColor =
            animal.genotype === "hemi"
              ? "border-l-4 border-l-red-400 dark:border-l-red-600"
              : animal.genotype === "het"
              ? "border-l-4 border-l-orange-400 dark:border-l-orange-600"
              : "border-l-4 border-l-slate-300 dark:border-l-slate-600";

          return (
            <tr
              key={animal.id}
              className={`border-b transition-colors ${genotypeRowColor} ${
                isDirty
                  ? "bg-amber-50/50 dark:bg-amber-950/20"
                  : hasData
                  ? "bg-emerald-50/30 dark:bg-emerald-950/10"
                  : "bg-background"
              } hover:bg-slate-50/70 dark:hover:bg-slate-900/30`}
            >
              <td className="px-3 py-2 sticky left-0 bg-inherit font-medium text-xs">
                <div className="flex items-center gap-1.5">
                  <MiniEarTag earTag={animal.ear_tag} size={20} />
                  <span>{animal.identifier}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {cohort?.name || "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                <span className={animal.sex === "male" ? "text-blue-600" : "text-pink-600"}>
                  {animal.sex === "male" ? "♂" : "♀"}
                </span>
              </td>
              <td className="px-3 py-2 text-xs">
                <Badge
                  variant="outline"
                  className={`text-[10px] py-0 ${
                    animal.genotype === "hemi"
                      ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                      : animal.genotype === "het"
                      ? "border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  {GENOTYPE_LABELS[animal.genotype] || animal.genotype}
                </Badge>
              </td>
              {fields.map((field) => (
                <td key={field.key} className="px-1.5 py-1.5">
                  {(() => {
                    const readOnly = isDerivedReadOnlyField(experiment, field.key);
                    return (
                  <Input
                    type={field.type === "text" ? "text" : "text"}
                    inputMode={field.type === "text" ? "text" : "decimal"}
                    className={`h-7 text-xs w-full min-w-[100px] ${readOnly ? "bg-slate-50 text-slate-600" : ""}`}
                    placeholder={readOnly ? "auto" : "—"}
                    value={data.measures[field.key] ?? ""}
                    readOnly={readOnly}
                    onChange={(e) =>
                      updateMeasure(animal.id, timepoint, experiment, field.key, e.target.value)
                    }
                  />
                    );
                  })()}
                </td>
              ))}
              <td className="px-1.5 py-1.5">
                <Input
                  className="h-7 text-xs w-full min-w-[120px]"
                  placeholder="Notes..."
                  value={data.notes || ""}
                  onChange={(e) => updateNotes(animal.id, timepoint, experiment, e.target.value)}
                />
              </td>
              <td className="px-1.5 py-1.5">
                {isImageExperiment ? (
                  <CageImageCell
                    cohortName={cohort?.name || "Unknown Cohort"}
                    animalIdentifier={animal.identifier}
                    experiment={experiment}
                    timepoint={timepoint}
                    currentUrls={getAttachmentUrls(data.measures, CAGE_IMAGE_LIST_KEY, CAGE_IMAGE_KEY)}
                    currentFolderUrls={getAttachmentUrls(data.measures, ATTACHMENT_FOLDER_URL_LIST_KEY, ATTACHMENT_FOLDER_URL_KEY)}
                    onChange={(urls) =>
                      updateAttachments(animal.id, timepoint, experiment, CAGE_IMAGE_LIST_KEY, CAGE_IMAGE_KEY, urls)
                    }
                    onFoldersChange={(urls) =>
                      updateAttachments(animal.id, timepoint, experiment, ATTACHMENT_FOLDER_URL_LIST_KEY, ATTACHMENT_FOLDER_URL_KEY, urls)
                    }
                  />
                ) : (
                  <RawDataLinkCell
                    cohortName={cohort?.name || "Unknown Cohort"}
                    animalIdentifier={animal.identifier}
                    experiment={experiment}
                    timepoint={timepoint}
                    currentUrls={getAttachmentUrls(data.measures, RAW_DATA_URL_LIST_KEY, RAW_DATA_URL_KEY)}
                    currentFolderUrls={getAttachmentUrls(data.measures, ATTACHMENT_FOLDER_URL_LIST_KEY, ATTACHMENT_FOLDER_URL_KEY)}
                    onChange={(urls) =>
                      updateAttachments(animal.id, timepoint, experiment, RAW_DATA_URL_LIST_KEY, RAW_DATA_URL_KEY, urls)
                    }
                    onFoldersChange={(urls) =>
                      updateAttachments(animal.id, timepoint, experiment, ATTACHMENT_FOLDER_URL_LIST_KEY, ATTACHMENT_FOLDER_URL_KEY, urls)
                    }
                  />
                )}
              </td>
              <td className="px-3 py-2 text-center">
                {hasData ? (
                  <span className="text-green-600">
                    <Check className="w-4 h-4 inline" />
                  </span>
                ) : isDirty ? (
                  <span className="text-amber-500 text-xs">●</span>
                ) : (
                  <span className="text-muted-foreground/30 text-xs">—</span>
                )}
              </td>
            </tr>
          );
        })}
    </>
  );
}

// ─── Cage Image Upload Cell (nesting/marble burying) — via Google Drive ─────

function CageImageCell({
  cohortName,
  animalIdentifier,
  experiment,
  timepoint,
  currentUrls,
  currentFolderUrls,
  onChange,
  onFoldersChange,
}: {
  cohortName: string;
  animalIdentifier: string;
  experiment: string;
  timepoint: number;
  currentUrls: string[];
  currentFolderUrls: string[];
  onChange: (urls: string[]) => void;
  onFoldersChange: (urls: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderInputVal, setFolderInputVal] = useState("");
  const [editingFolderIndex, setEditingFolderIndex] = useState<number | null>(null);
  const fileRef = useCallback((input: HTMLInputElement | null) => {
    if (input) input.value = "";
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setUploading(true);
      try {
        const nextUrls = [...currentUrls];
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("cohort_name", cohortName);
          formData.append("animal_identifier", animalIdentifier);
          formData.append("experiment_type", `${experiment}_${timepoint}d`);

          const res = await fetch("/api/gdrive/upload", {
            method: "POST",
            body: formData,
          });

          const json = await res.json();
          if (json.error) {
            toast.error(json.error);
            continue;
          }
          if (typeof json.url === "string" && json.url.trim()) {
            nextUrls.push(json.url);
          }
        }
        onChange(nextUrls);
        toast.success(`Uploaded ${files.length} image${files.length === 1 ? "" : "s"} to Google Drive`);
      } catch {
        toast.error("Upload failed — is Google Drive connected?");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [cohortName, animalIdentifier, experiment, timepoint, currentUrls, onChange]
  );

  return (
    <div className="min-w-[120px] space-y-1">
      {currentUrls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {currentUrls.map((url, index) => (
            <div key={`${url}-${index}`} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-800 transition-colors"
                title="View on Google Drive"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                className="text-red-500 hover:text-red-700"
                title="Remove image"
                onClick={() => onChange(currentUrls.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {editingFolder ? (
        <div className="flex items-center gap-1">
          <Input
            className="h-6 text-[10px] w-full min-w-[120px]"
            placeholder="Paste folder URL..."
            value={folderInputVal}
            autoFocus
            onChange={(e) => setFolderInputVal(e.target.value)}
            onBlur={() => {
              const nextUrls = [...currentFolderUrls];
              const trimmed = folderInputVal.trim();
              if (editingFolderIndex === null) {
                if (trimmed) nextUrls.push(trimmed);
              } else if (trimmed) {
                nextUrls[editingFolderIndex] = trimmed;
              } else {
                nextUrls.splice(editingFolderIndex, 1);
              }
              onFoldersChange(normalizeUrlList(nextUrls));
              setEditingFolder(false);
              setEditingFolderIndex(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const nextUrls = [...currentFolderUrls];
                const trimmed = folderInputVal.trim();
                if (editingFolderIndex === null) {
                  if (trimmed) nextUrls.push(trimmed);
                } else if (trimmed) {
                  nextUrls[editingFolderIndex] = trimmed;
                } else {
                  nextUrls.splice(editingFolderIndex, 1);
                }
                onFoldersChange(normalizeUrlList(nextUrls));
                setEditingFolder(false);
                setEditingFolderIndex(null);
              }
              if (e.key === "Escape") {
                setEditingFolder(false);
                setEditingFolderIndex(null);
              }
            }}
          />
        </div>
      ) : null}
      {currentFolderUrls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {currentFolderUrls.map((url, index) => (
            <div key={`${url}-${index}`} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:text-amber-800 transition-colors"
                title={url}
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                title="Edit folder URL"
                onClick={() => {
                  setFolderInputVal(url);
                  setEditingFolderIndex(index);
                  setEditingFolder(true);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="text-red-500 hover:text-red-700"
                title="Remove folder"
                onClick={() => onFoldersChange(currentFolderUrls.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="cursor-pointer flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors" title={currentUrls.length > 0 ? "Upload more images to Google Drive" : "Upload cage image to Google Drive"}>
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          <span className="text-[10px]">{currentUrls.length > 0 ? "Add more" : "Upload"}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
      </label>
      <button
        type="button"
        onClick={() => {
          setFolderInputVal("");
          setEditingFolderIndex(null);
          setEditingFolder(true);
        }}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        title="Attach folder link"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span className="text-[10px]">{currentFolderUrls.length > 0 ? "Add folder" : "Folder"}</span>
      </button>
    </div>
  );
}

// ─── Raw Data Link/Upload Cell (all other tests) ────────────────────

function RawDataLinkCell({
  cohortName,
  animalIdentifier,
  experiment,
  timepoint,
  currentUrls,
  currentFolderUrls,
  onChange,
  onFoldersChange,
}: {
  cohortName: string;
  animalIdentifier: string;
  experiment: string;
  timepoint: number;
  currentUrls: string[];
  currentFolderUrls: string[];
  onChange: (urls: string[]) => void;
  onFoldersChange: (urls: string[]) => void;
}) {
  const [editing, setEditing] = useState<"file" | "folder" | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setUploading(true);
      try {
        const nextUrls = [...currentUrls];
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("cohort_name", cohortName);
          formData.append("animal_identifier", animalIdentifier);
          formData.append("experiment_type", `${experiment}_${timepoint}d`);

          const res = await fetch("/api/gdrive/upload", {
            method: "POST",
            body: formData,
          });

          const json = await res.json();
          if (json.error) {
            toast.error(json.error);
            continue;
          }
          if (typeof json.url === "string" && json.url.trim()) {
            nextUrls.push(json.url);
          }
        }
        onChange(nextUrls);
        toast.success(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"} to Google Drive`);
      } catch {
        toast.error("Upload failed — is Google Drive connected?");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [cohortName, animalIdentifier, experiment, timepoint, currentUrls, onChange]
  );

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[70px]">
        <Input
          className="h-6 text-[10px] w-full min-w-[120px]"
          placeholder={editing === "folder" ? "Paste folder URL..." : "Paste file URL..."}
          value={inputVal}
          autoFocus
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={() => {
            const sourceUrls = editing === "folder" ? currentFolderUrls : currentUrls;
            const nextUrls = [...sourceUrls];
            const trimmed = inputVal.trim();
            if (editingIndex === null) {
              if (trimmed) nextUrls.push(trimmed);
            } else if (trimmed) {
              nextUrls[editingIndex] = trimmed;
            } else if (editingIndex !== null) {
              nextUrls.splice(editingIndex, 1);
            }
            if (editing === "folder") onFoldersChange(normalizeUrlList(nextUrls));
            else onChange(normalizeUrlList(nextUrls));
            setEditing(null);
            setEditingIndex(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const sourceUrls = editing === "folder" ? currentFolderUrls : currentUrls;
              const nextUrls = [...sourceUrls];
              const trimmed = inputVal.trim();
              if (editingIndex === null) {
                if (trimmed) nextUrls.push(trimmed);
              } else if (trimmed) {
                nextUrls[editingIndex] = trimmed;
              } else {
                nextUrls.splice(editingIndex, 1);
              }
              if (editing === "folder") onFoldersChange(normalizeUrlList(nextUrls));
              else onChange(normalizeUrlList(nextUrls));
              setEditing(null);
              setEditingIndex(null);
            }
            if (e.key === "Escape") {
              setEditing(null);
              setEditingIndex(null);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-w-[145px] space-y-1">
      {currentUrls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {currentUrls.map((url, index) => (
            <div key={`${url}-${index}`} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title={url}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                title="Edit URL"
                onClick={() => {
                  setInputVal(url);
                  setEditingIndex(index);
                  setEditing("file");
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="text-red-500 hover:text-red-700"
                title="Remove file"
                onClick={() => onChange(currentUrls.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {currentFolderUrls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {currentFolderUrls.map((url, index) => (
            <div key={`${url}-${index}`} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:text-amber-800 transition-colors"
                title={url}
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                title="Edit folder URL"
                onClick={() => {
                  setInputVal(url);
                  setEditingIndex(index);
                  setEditing("folder");
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="text-red-500 hover:text-red-700"
                title="Remove folder"
                onClick={() => onFoldersChange(currentFolderUrls.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            setInputVal("");
            setEditingIndex(null);
            setEditing("file");
          }}
          className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Paste a file URL"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="text-[10px]">{currentUrls.length > 0 ? "Add link" : "Link"}</span>
        </button>
        <span className="text-muted-foreground/30 text-[10px]">|</span>
        <button
          type="button"
          onClick={() => {
            setInputVal("");
            setEditingIndex(null);
            setEditing("folder");
          }}
          className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Paste a folder URL"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="text-[10px]">{currentFolderUrls.length > 0 ? "Add folder" : "Folder"}</span>
        </button>
        <span className="text-muted-foreground/30 text-[10px]">|</span>
        <label className="cursor-pointer flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" title="Upload file to Google Drive">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span className="text-[10px]">{currentUrls.length > 0 ? "Add file" : "Upload"}</span>
          <input
            type="file"
            className="hidden"
            multiple
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
}
