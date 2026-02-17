"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Loader2, Save, ChevronDown, ChevronRight, Plus, Trash2, Check, Upload, Eye, EyeOff, X, Camera, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Animal, Cohort, ColonyTimepoint, ColonyResult } from "@/types";
import { MiniEarTag } from "@/components/ear-tag-selector";
import { BehaviorImportDialog } from "@/components/behavior-import-dialog";

// ─── Default experiment measures per type ─────────────────────────────

export interface MeasureField {
  key: string;
  label: string;
  unit?: string;
  type?: "number" | "text";
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
  stamina: [
    { key: "duration_sec", label: "Duration at 10 RPM", unit: "sec", type: "number" },
    { key: "distance_m", label: "Distance", unit: "m", type: "number" },
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
      measures: Record<string, string | number | null>;
      notes?: string;
    }[]
  ) => Promise<{ success?: boolean; error?: string; saved?: number; errors?: string[] }>;
}

// ─── Component ───────────────────────────────────────────────────────

export function ColonyResultsTab({
  animals,
  cohorts,
  timepoints,
  colonyResults,
  batchUpsertColonyResults,
}: ColonyResultsTabProps) {
  // State
  const [saving, setSaving] = useState(false);
  const [activeTimepoint, setActiveTimepoint] = useState<string>(
    timepoints.length > 0 ? String(timepoints[0].age_days) : "60"
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

  // Local editable data: keyed by `${animalId}-${timepoint}-${experiment}`
  const [editData, setEditData] = useState<
    Record<string, { measures: Record<string, string | number | null>; notes: string }>
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
          measures: existing.measures as Record<string, string | number | null>,
          notes: existing.notes || "",
        };
      return { measures: {}, notes: "" };
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
    (animalId: string, tp: number, exp: string, fieldKey: string, value: string) => {
      const key = `${animalId}-${tp}-${exp}`;
      setEditData((prev) => {
        const current = prev[key] || getRowData(animalId, tp, exp);
        return {
          ...prev,
          [key]: {
            ...current,
            measures: {
              ...current.measures,
              [fieldKey]: value === "" ? null : value,
            },
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
  const handleSave = useCallback(async () => {
    const tp = Number(activeTimepoint);
    const exp = activeExperiment;

    const entries: {
      animalId: string;
      measures: Record<string, string | number | null>;
      notes?: string;
    }[] = [];

    for (const animal of activeAnimals) {
      const key = `${animal.id}-${tp}-${exp}`;
      if (dirtyKeys.has(key)) {
        const data = editData[key] || getRowData(animal.id, tp, exp);
        // Convert string numbers to actual numbers
        const cleanMeasures: Record<string, string | number | null> = {};
        for (const [k, v] of Object.entries(data.measures)) {
          if (v === null || v === "") {
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

    setSaving(true);
    try {
      const result = await batchUpsertColonyResults(tp, exp, entries);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Saved results for ${result.saved} animal${(result.saved || 0) > 1 ? "s" : ""}`);
        setDirtyKeys(new Set());
      }
    } catch {
      toast.error("Failed to save results");
    } finally {
      setSaving(false);
    }
  }, [activeTimepoint, activeExperiment, activeAnimals, dirtyKeys, editData, getRowData, batchUpsertColonyResults]);

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
    return Object.values(data.measures).some((v) => v !== null && v !== "");
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
      {/* ─── Timepoint Master Tabs ─────────────────────────────── */}
      <Tabs value={activeTimepoint} onValueChange={handleTimepointChange}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="h-auto gap-1 p-1">
            {timepointOptions.map((age) => (
              <TabsTrigger
                key={age}
                value={String(age)}
                className="px-4 py-2 font-semibold"
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
              <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1 mb-4">
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
                      className="flex-1 min-w-[80px] text-[11px] sm:text-xs relative px-2 py-1.5"
                    >
                      {EXPERIMENT_LABELS[exp] || exp}
                      {count > 0 && (
                        <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 px-1.5 py-0.5 rounded-full">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {availableExperiments.map((exp) => (
                <TabsContent key={exp} value={exp}>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {EXPERIMENT_LABELS[exp] || exp} — {age} Day Results
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            Enter measured values for each animal. Changes are saved when you click Save.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowImport(true)}
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />
                            Import Data
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAddField(!showAddField)}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Field
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving || dirtyKeys.size === 0}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5 mr-1" />
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
                      <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 z-20">
                            <tr className="border-b bg-background shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                              <th className="text-left px-2 py-2 font-medium text-xs text-muted-foreground sticky left-0 z-30 bg-background min-w-[140px]">
                                Animal
                              </th>
                              <th className="text-left px-2 py-2 font-medium text-xs text-muted-foreground bg-background min-w-[80px]">
                                Cohort
                              </th>
                              <th className="text-left px-2 py-2 font-medium text-xs text-muted-foreground bg-background min-w-[60px]">
                                Sex
                              </th>
                              <th className="text-left px-2 py-2 font-medium text-xs text-muted-foreground bg-background min-w-[60px]">
                                GT
                              </th>
                              {currentFields.map((field) => (
                                <th
                                  key={field.key}
                                  className="text-left px-2 py-2 font-medium text-xs text-muted-foreground bg-background min-w-[100px] group/col"
                                >
                                  <div className="flex items-center gap-1">
                                    <span className="truncate">{field.label}</span>
                                    {field.unit && (
                                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                        ({field.unit})
                                      </span>
                                    )}
                                    <button
                                      onClick={() => handleHideField(field.key)}
                                      className="text-muted-foreground/30 hover:text-red-500 ml-auto opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
                                      title="Hide this column"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </th>
                              ))}
                              <th className="text-left px-2 py-2 font-medium text-xs text-muted-foreground bg-background min-w-[120px]">
                                Notes
                              </th>
                              <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground bg-background min-w-[80px]">
                                {IMAGE_EXPERIMENTS.has(exp) ? "📷 Cage" : "🔗 Data"}
                              </th>
                              <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground bg-background w-[50px]">
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
  getRowData: (animalId: string, tp: number, exp: string) => { measures: Record<string, string | number | null>; notes: string };
  getExistingResult: (animalId: string, tp: number, exp: string) => ColonyResult | undefined;
  updateMeasure: (animalId: string, tp: number, exp: string, fieldKey: string, value: string) => void;
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
  updateNotes,
  dirtyKeys,
  isImageExperiment,
}: CohortGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const filledInGroup = animals.filter((a) => {
    const existing = getExistingResult(a.id, timepoint, experiment);
    return existing && Object.values(existing.measures as Record<string, unknown>).some((v) => v !== null);
  }).length;

  return (
    <>
      {/* Cohort header row */}
      <tr
        className="border-b bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <td colSpan={fields.length + 6} className="px-2 py-1.5">
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

          const genotypeRowBg =
            animal.genotype === "hemi"
              ? "bg-red-50/30 dark:bg-red-950/10"
              : animal.genotype === "het"
              ? "bg-orange-50/30 dark:bg-orange-950/10"
              : "bg-slate-50/30 dark:bg-slate-950/10";

          return (
            <tr
              key={animal.id}
              className={`border-b transition-colors ${genotypeRowColor} ${
                isDirty
                  ? "bg-amber-50/50 dark:bg-amber-950/20"
                  : hasData
                  ? "bg-green-50/30 dark:bg-green-950/10"
                  : genotypeRowBg
              } hover:bg-muted/20`}
            >
              <td className="px-2 py-1.5 sticky left-0 bg-inherit font-medium text-xs">
                <div className="flex items-center gap-1">
                  <MiniEarTag earTag={animal.ear_tag} size={20} />
                  <span>{animal.identifier}</span>
                </div>
              </td>
              <td className="px-2 py-1.5 text-xs text-muted-foreground">
                {cohort?.name || "—"}
              </td>
              <td className="px-2 py-1.5 text-xs">
                <span className={animal.sex === "male" ? "text-blue-600" : "text-pink-600"}>
                  {animal.sex === "male" ? "♂" : "♀"}
                </span>
              </td>
              <td className="px-2 py-1.5 text-xs">
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
                <td key={field.key} className="px-1 py-1">
                  <Input
                    type={field.type === "text" ? "text" : "text"}
                    inputMode={field.type === "text" ? "text" : "decimal"}
                    className="h-7 text-xs w-full min-w-[80px]"
                    placeholder="—"
                    value={data.measures[field.key] ?? ""}
                    onChange={(e) =>
                      updateMeasure(animal.id, timepoint, experiment, field.key, e.target.value)
                    }
                  />
                </td>
              ))}
              <td className="px-1 py-1">
                <Input
                  className="h-7 text-xs w-full min-w-[100px]"
                  placeholder="Notes..."
                  value={data.notes || ""}
                  onChange={(e) => updateNotes(animal.id, timepoint, experiment, e.target.value)}
                />
              </td>
              <td className="px-1 py-1">
                {isImageExperiment ? (
                  <CageImageCell
                    animalId={animal.id}
                    experiment={experiment}
                    timepoint={timepoint}
                    currentPath={data.measures.__cage_image as string | null}
                    onUploaded={(path) =>
                      updateMeasure(animal.id, timepoint, experiment, "__cage_image", path)
                    }
                  />
                ) : (
                  <RawDataLinkCell
                    currentUrl={data.measures.__raw_data_url as string | null}
                    onChange={(url) =>
                      updateMeasure(animal.id, timepoint, experiment, "__raw_data_url", url)
                    }
                  />
                )}
              </td>
              <td className="px-2 py-1.5 text-center">
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

// ─── Cage Image Upload Cell (nesting/marble burying) ────────────────

function CageImageCell({
  animalId,
  experiment,
  timepoint,
  currentPath,
  onUploaded,
}: {
  animalId: string;
  experiment: string;
  timepoint: number;
  currentPath: string | null;
  onUploaded: (path: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useCallback((input: HTMLInputElement | null) => {
    if (input) input.value = "";
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("animal_id", animalId);
        formData.append("experiment_type", experiment);
        formData.append("timepoint_age", String(timepoint));

        const res = await fetch("/api/colony-image", {
          method: "POST",
          body: formData,
        });

        const json = await res.json();
        if (json.error) {
          toast.error(json.error);
        } else {
          toast.success("Image uploaded!");
          onUploaded(json.path);
          if (json.url) setPreviewUrl(json.url);
        }
      } catch {
        toast.error("Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [animalId, experiment, timepoint, onUploaded]
  );

  const handleView = useCallback(async () => {
    if (previewUrl) {
      setShowPreview(true);
      return;
    }
    if (!currentPath) return;

    try {
      const res = await fetch(`/api/colony-image?path=${encodeURIComponent(currentPath)}`);
      const json = await res.json();
      if (json.url) {
        setPreviewUrl(json.url);
        setShowPreview(true);
      }
    } catch {
      toast.error("Could not load image");
    }
  }, [currentPath, previewUrl]);

  return (
    <div className="flex items-center gap-1 min-w-[70px]">
      {currentPath ? (
        <>
          <button
            onClick={handleView}
            className="text-green-600 hover:text-green-800 transition-colors"
            title="View cage image"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors" title="Replace image">
            <Camera className="w-3.5 h-3.5" />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </>
      ) : (
        <label className="cursor-pointer flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors" title="Upload cage image">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          <span className="text-[10px]">Upload</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}

      {/* Image preview modal */}
      {showPreview && previewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] bg-white dark:bg-zinc-900 rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 z-10 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80"
              onClick={() => setShowPreview(false)}
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Cage image"
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Raw Data URL Link Cell (all other tests) ───────────────────────

function RawDataLinkCell({
  currentUrl,
  onChange,
}: {
  currentUrl: string | null;
  onChange: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(currentUrl || "");

  const hasUrl = !!(currentUrl && currentUrl.trim());

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[70px]">
        <Input
          className="h-6 text-[10px] w-full min-w-[120px]"
          placeholder="Paste Google Drive URL..."
          value={inputVal}
          autoFocus
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={() => {
            onChange(inputVal);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onChange(inputVal);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-[70px]">
      {hasUrl ? (
        <>
          <a
            href={currentUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 transition-colors"
            title={currentUrl!}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={() => {
              setInputVal(currentUrl || "");
              setEditing(true);
            }}
            className="text-muted-foreground hover:text-foreground text-[10px]"
            title="Edit URL"
          >
            ✎
          </button>
        </>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Add Google Drive or data URL"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="text-[10px]">Add link</span>
        </button>
      )}
    </div>
  );
}

