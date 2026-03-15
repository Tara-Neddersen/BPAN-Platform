"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { ArrowLeft, ArrowRight, Loader2, Pencil, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createExperiment, createProtocol, replaceExperimentTimepoints, updateExperiment } from "@/app/(protected)/experiments/actions";
import { saveScheduleTemplate } from "@/app/(protected)/experiments/schedule-actions";
import { saveExperimentTemplate } from "@/app/(protected)/experiments/template-actions";
import type { ExperimentTemplateRecord } from "@/components/experiment-template-builder";
import type { Experiment, ExperimentTimepoint, PlatformSlotKind, Protocol, ScheduleDay, ScheduleSlot, ScheduledBlock, ScheduleTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { detectDatasetColumnType, parseTextDatasetPreview } from "@/lib/dataset-preview";

type ColumnType =
  | "text"
  | "long_text"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "select"
  | "multi_select"
  | "file"
  | "url"
  | "animal_ref"
  | "cohort_ref"
  | "batch_ref";

const GUIDED_COLUMN_TYPE_OPTIONS: Array<{ value: ColumnType; label: string }> = [
  { value: "text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "select", label: "Pick one" },
  { value: "multi_select", label: "Pick multiple" },
  { value: "file", label: "File" },
  { value: "url", label: "Link" },
];

type WizardStep = "experiments" | "details" | "timepoints" | "layout" | "review";

type ResultColumnDraft = {
  key: string;
  label: string;
  columnType: ColumnType;
  required: boolean;
  defaultValue: string;
  options: string[];
  averageSourceKeys: string[];
  unit: string;
  helpText: string;
  groupKey: string;
  sortOrder: number;
  isSystemDefault: boolean;
  isEnabled: boolean;
};

type ProtocolLinkDraft = {
  protocolId: string;
  sortOrder: number;
  isDefault: boolean;
  notes: string;
};

type SelectableColumnDraft = {
  id: string;
  selected: boolean;
  column: ResultColumnDraft;
};

type ExperimentDraft = {
  id: string;
  templateId: string | null;
  name: string;
  description: string;
  category: string;
  protocolLinks: ProtocolLinkDraft[];
  sourceMode: "extract" | "manual";
  extractedColumns: SelectableColumnDraft[];
  manualColumns: ResultColumnDraft[];
};

type TimepointWindowDraft = {
  id: string;
  name: string;
  minAgeDays: string;
  maxAgeDays: string;
};

type LayoutItemDraft = {
  id: string;
  experimentId: string;
  dayIndex: string;
  slotKind: PlatformSlotKind;
  customLabel: string;
  exactTime: string;
  timepointWindowId: string;
  notes: string;
};

type BatteryRecordSummary = {
  experiment: Experiment;
  timepoints: ExperimentTimepoint[];
  templateId: string | null;
  template: ExperimentTemplateRecord | null;
  scheduleTemplate: ScheduleTemplate | null;
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
};

type EditingBatteryState = {
  experimentId: string;
  batteryTemplateId: string | null;
  scheduleTemplateId: string | null;
  timepointIds: string[];
};

const WIZARD_STEPS: Array<{ key: WizardStep; label: string; description: string }> = [
  { key: "experiments", label: "Setup", description: "Name the battery and its single experiments." },
  { key: "details", label: "Results", description: "Define the researcher-facing result fields for each experiment." },
  { key: "timepoints", label: "Windows", description: "Name the age windows this battery uses." },
  { key: "layout", label: "Schedule", description: "Place each experiment on the right days and time windows." },
  { key: "review", label: "Review", description: "Check the full battery and save it." },
];

const SYSTEM_LEADING_COLUMNS: ResultColumnDraft[] = [
  {
    key: "animal_id",
    label: "Animal ID",
    columnType: "animal_ref",
    required: true,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Link each result row to the source animal.",
    groupKey: "colony",
    sortOrder: 0,
    isSystemDefault: true,
    isEnabled: true,
  },
  {
    key: "timepoint_window",
    label: "Timepoint Window",
    columnType: "text",
    required: true,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Named age window for this result set.",
    groupKey: "timepoint",
    sortOrder: 1,
    isSystemDefault: true,
    isEnabled: true,
  },
];

const SYSTEM_TRAILING_COLUMNS: ResultColumnDraft[] = [
  {
    key: "notes",
    label: "Notes",
    columnType: "long_text",
    required: false,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Free-form operator notes.",
    groupKey: "",
    sortOrder: 0,
    isSystemDefault: false,
    isEnabled: true,
  },
  {
    key: "attachment_link",
    label: "Files",
    columnType: "file",
    required: false,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Uploads files to Google Drive and stores only their links in LabLynx.",
    groupKey: "files",
    sortOrder: 0,
    isSystemDefault: false,
    isEnabled: true,
  },
  {
    key: "reference_url",
    label: "URL",
    columnType: "url",
    required: false,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Reference link for videos, sheets, or external result pages.",
    groupKey: "files",
    sortOrder: 0,
    isSystemDefault: false,
    isEnabled: true,
  },
];

const HIDDEN_SYSTEM_COLUMN_KEYS = new Set([
  ...SYSTEM_LEADING_COLUMNS.map((column) => column.key),
  ...SYSTEM_TRAILING_COLUMNS.map((column) => column.key),
]);

let localIdCounter = 0;

function makeId(prefix: string) {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function createEmptyExperiment(name = ""): ExperimentDraft {
  return {
    id: makeId("exp"),
    templateId: null,
    name,
    description: "",
    category: "",
    protocolLinks: [],
    sourceMode: "manual",
    extractedColumns: [],
    manualColumns: [],
  };
}

function createEmptyWindow(): TimepointWindowDraft {
  return {
    id: makeId("window"),
    name: "",
    minAgeDays: "",
    maxAgeDays: "",
  };
}

function createEmptyLayoutItem(experimentId = "", windowId = ""): LayoutItemDraft {
  return {
    id: makeId("layout"),
    experimentId,
    dayIndex: "1",
    slotKind: "am",
    customLabel: "",
    exactTime: "",
    timepointWindowId: windowId,
    notes: "",
  };
}

function createManualColumn(label = ""): ResultColumnDraft {
  return {
    key: slugifyKey(label) || makeId("field"),
    label: label || "New Field",
    columnType: "text",
    required: false,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "",
    groupKey: "",
    sortOrder: 0,
    isSystemDefault: false,
    isEnabled: true,
  };
}

function createDoneColumn(): ResultColumnDraft {
  return {
    key: "completed",
    label: "Done",
    columnType: "boolean",
    required: false,
    defaultValue: "",
    options: ["Done", "Not done"],
    averageSourceKeys: [],
    unit: "",
    helpText: "Simple completion flag for checklist-style experiments.",
    groupKey: "status",
    sortOrder: 0,
    isSystemDefault: false,
    isEnabled: true,
  };
}

function isChoiceColumnType(columnType: ColumnType) {
  return columnType === "select" || columnType === "multi_select";
}

function isNumericColumnType(columnType: ColumnType) {
  return columnType === "number" || columnType === "integer";
}

function formatColumnTypeLabel(columnType: ColumnType) {
  switch (columnType) {
    case "long_text":
      return "Long text";
    case "integer":
      return "Whole number";
    case "datetime":
      return "Date and time";
    case "multi_select":
      return "Pick multiple";
    case "animal_ref":
      return "Animal reference";
    case "cohort_ref":
      return "Cohort reference";
    case "batch_ref":
      return "Batch reference";
    default:
      return columnType.charAt(0).toUpperCase() + columnType.slice(1).replace(/_/g, " ");
  }
}

function getGuidedColumnTypeOptions(currentType: ColumnType) {
  if (GUIDED_COLUMN_TYPE_OPTIONS.some((option) => option.value === currentType)) {
    return GUIDED_COLUMN_TYPE_OPTIONS;
  }

  return [...GUIDED_COLUMN_TYPE_OPTIONS, { value: currentType, label: formatColumnTypeLabel(currentType) }];
}

function createAverageColumn(): ResultColumnDraft {
  return {
    key: "average_score",
    label: "Average",
    columnType: "number",
    required: false,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Derived average of selected numeric fields.",
    groupKey: "derived",
    sortOrder: 0,
    isSystemDefault: false,
    isEnabled: true,
  };
}

function cloneColumn(column: ResultColumnDraft): ResultColumnDraft {
  return {
    ...column,
    options: [...column.options],
    averageSourceKeys: [...column.averageSourceKeys],
  };
}

function parseStoredColumn(column: ResultColumnDraft): ResultColumnDraft {
  const averageSourceKeys = column.options
    .filter((option) => option.startsWith("field:"))
    .map((option) => option.slice("field:".length));

  return {
    ...column,
    options: column.options.filter((option) => option !== "__average__" && !option.startsWith("field:")),
    averageSourceKeys,
  };
}

function buildPersistedColumns(columns: ResultColumnDraft[]) {
  const researchColumns = normalizeColumns(
    columns
      .filter((column) => !HIDDEN_SYSTEM_COLUMN_KEYS.has(column.key))
      .map((column) => cloneColumn(column)),
  );

  return [...SYSTEM_LEADING_COLUMNS, ...researchColumns, ...SYSTEM_TRAILING_COLUMNS].map((column, index) => ({
    ...cloneColumn(column),
    sortOrder: index,
  }));
}

function serializeColumn(column: ResultColumnDraft) {
  const averageMetadata =
    column.averageSourceKeys.length > 0
      ? [`__average__`, ...column.averageSourceKeys.map((key) => `field:${key}`)]
      : [];

  return {
    ...column,
    options: [...column.options, ...averageMetadata],
  };
}

function reorderList<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

function mapDatasetColumnType(values: unknown[]): ColumnType {
  const detectedType = detectDatasetColumnType(values);
  if (detectedType === "numeric") return "number";
  if (detectedType === "date") return "date";

  const nonEmpty = values
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
  if (nonEmpty.length > 0) {
    const uniqueCount = new Set(nonEmpty).size;
    return uniqueCount <= 12 ? "select" : "text";
  }

  return "text";
}

function columnsFromRows(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || {});
  return headers.map((header, index) => {
    const values = rows.map((row) => row[header]);
    const nonEmpty = values
      .map((value) => (value == null ? "" : String(value).trim()))
      .filter(Boolean);

    return {
      id: makeId("column"),
      selected: true,
      column: {
        key: slugifyKey(header) || `field_${index + 1}`,
        label: header,
        columnType: mapDatasetColumnType(values),
        required: false,
        defaultValue: "",
        options: new Set(nonEmpty).size <= 12 ? Array.from(new Set(nonEmpty)).slice(0, 12) : [],
        averageSourceKeys: [],
        unit: "",
        helpText: "",
        groupKey: "",
        sortOrder: index,
        isSystemDefault: false,
        isEnabled: true,
      } satisfies ResultColumnDraft,
    };
  });
}

function normalizeColumns(columns: ResultColumnDraft[]) {
  return columns.map((column, index) => ({
    ...column,
    sortOrder: index,
    key: slugifyKey(column.key || column.label) || `field_${index + 1}`,
  }));
}

function parseBatteryTag(tags: string[], prefix: string) {
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) || null;
}

function slotLabel(item: LayoutItemDraft) {
  if (item.slotKind === "custom") {
    return item.customLabel.trim() || "Custom";
  }
  if (item.slotKind === "exact_time") {
    return item.exactTime.trim() || "Exact Time";
  }
  return item.slotKind.toUpperCase();
}

function buildBatteryRecords(
  experiments: Experiment[],
  timepoints: ExperimentTimepoint[],
  templates: ExperimentTemplateRecord[],
  scheduleTemplates: ScheduleTemplate[],
  scheduleDays: ScheduleDay[],
  scheduleSlots: ScheduleSlot[],
  scheduledBlocks: ScheduledBlock[],
) {
  const batteries = experiments
    .filter((experiment) => experiment.tags.includes("kind:battery"))
    .map((experiment) => {
      const templateId = parseBatteryTag(experiment.tags, "battery_template:");
      const scheduleTemplateId = parseBatteryTag(experiment.tags, "battery_schedule:");
      const scheduleTemplate = scheduleTemplates.find((item) => item.id === scheduleTemplateId) || null;
      const batteryDays = scheduleTemplate ? scheduleDays.filter((day) => day.schedule_template_id === scheduleTemplate.id) : [];
      const batterySlots = scheduleSlots.filter((slot) => batteryDays.some((day) => day.id === slot.schedule_day_id));
      const batteryBlocks = scheduledBlocks.filter((block) => batterySlots.some((slot) => slot.id === block.schedule_slot_id));

      return {
        experiment,
        timepoints: timepoints.filter((timepoint) => timepoint.experiment_id === experiment.id),
        templateId,
        template: templates.find((template) => template.id === templateId) || null,
        scheduleTemplate,
        scheduleDays: batteryDays,
        scheduleSlots: batterySlots,
        scheduledBlocks: batteryBlocks,
      } satisfies BatteryRecordSummary;
    })
    .sort((a, b) => new Date(b.experiment.updated_at).getTime() - new Date(a.experiment.updated_at).getTime());

  return batteries;
}

function parseWindowRange(notes: string | null) {
  const match = String(notes || "").match(/(\d+)\s*-\s*(\d+)\s*days/i);
  return {
    minAgeDays: match?.[1] || "",
    maxAgeDays: match?.[2] || "",
  };
}

function buildDraftsFromBatteryRecord(
  record: BatteryRecordSummary,
  templates: ExperimentTemplateRecord[],
) {
  const windows = [...record.timepoints]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((timepoint) => {
      const range = parseWindowRange(timepoint.notes);
      return {
        id: makeId("window"),
        name: timepoint.label,
        minAgeDays: range.minAgeDays,
        maxAgeDays: range.maxAgeDays,
      } satisfies TimepointWindowDraft;
    });

  const windowIdByName = new Map(windows.map((window) => [window.name, window.id]));
  const slotById = new Map(record.scheduleSlots.map((slot) => [slot.id, slot]));
  const dayById = new Map(record.scheduleDays.map((day) => [day.id, day]));
  const experimentIdByTemplateId = new Map<string, string>();
  const experimentDrafts: ExperimentDraft[] = [];

  const orderedTemplateIds = Array.from(
    new Set(
      record.scheduledBlocks
        .slice()
        .sort((a, b) => {
          const slotA = slotById.get(a.schedule_slot_id);
          const slotB = slotById.get(b.schedule_slot_id);
          const dayA = slotA ? dayById.get(slotA.schedule_day_id) : null;
          const dayB = slotB ? dayById.get(slotB.schedule_day_id) : null;
          if ((dayA?.day_index || 0) !== (dayB?.day_index || 0)) {
            return (dayA?.day_index || 0) - (dayB?.day_index || 0);
          }
          if ((slotA?.sort_order || 0) !== (slotB?.sort_order || 0)) {
            return (slotA?.sort_order || 0) - (slotB?.sort_order || 0);
          }
          return a.sort_order - b.sort_order;
        })
        .map((block) => block.experiment_template_id),
    ),
  );

  for (const templateId of orderedTemplateIds) {
    const template = templates.find((entry) => entry.id === templateId) || null;
    const draft = createEmptyExperiment(template?.title || "Untitled experiment");
    draft.templateId = templateId;
    draft.description = template?.description || "";
    draft.category = template?.category || "";
    draft.protocolLinks = (template?.protocolLinks || []).map((link, index) => ({
      ...link,
      sortOrder: index,
    }));
    draft.manualColumns = normalizeColumns(
      (template?.schema?.columns || [])
        .map((column) => parseStoredColumn({
          ...column,
          options: [...column.options],
          averageSourceKeys: [],
          defaultValue: column.defaultValue || "",
          unit: column.unit || "",
          helpText: column.helpText || "",
          groupKey: column.groupKey || "",
        }))
        .filter((column) => !HIDDEN_SYSTEM_COLUMN_KEYS.has(column.key)),
    );
    draft.sourceMode = draft.manualColumns.length > 0 ? "manual" : "extract";
    experimentIdByTemplateId.set(templateId, draft.id);
    experimentDrafts.push(draft);
  }

  const layoutItems = record.scheduledBlocks
    .slice()
    .sort((a, b) => {
      const slotA = slotById.get(a.schedule_slot_id);
      const slotB = slotById.get(b.schedule_slot_id);
      const dayA = slotA ? dayById.get(slotA.schedule_day_id) : null;
      const dayB = slotB ? dayById.get(slotB.schedule_day_id) : null;
      if ((dayA?.day_index || 0) !== (dayB?.day_index || 0)) {
        return (dayA?.day_index || 0) - (dayB?.day_index || 0);
      }
      if ((slotA?.sort_order || 0) !== (slotB?.sort_order || 0)) {
        return (slotA?.sort_order || 0) - (slotB?.sort_order || 0);
      }
      return a.sort_order - b.sort_order;
    })
    .map((block) => {
      const slot = slotById.get(block.schedule_slot_id);
      const day = slot ? dayById.get(slot.schedule_day_id) : null;
      const metadata =
        block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
          ? (block.metadata as Record<string, unknown>)
          : {};
      const windowNames = Array.isArray(metadata.timepointWindowNames)
        ? metadata.timepointWindowNames.filter((value): value is string => typeof value === "string")
        : [];
      const singularWindowName =
        typeof metadata.timepointWindowName === "string" ? metadata.timepointWindowName : "";
      const resolvedWindowIds = [
        ...windowNames.map((name) => windowIdByName.get(name)).filter((value): value is string => Boolean(value)),
        ...(singularWindowName ? [windowIdByName.get(singularWindowName)].filter((value): value is string => Boolean(value)) : []),
      ];
      const uniqueWindowIds = Array.from(new Set(resolvedWindowIds));
      const fallbackWindowId = windows[0]?.id || "";
      const itemWindowIds = uniqueWindowIds.length > 0 ? uniqueWindowIds : [fallbackWindowId].filter(Boolean);

      return itemWindowIds.map((windowId) => ({
        id: makeId("layout"),
        experimentId: experimentIdByTemplateId.get(block.experiment_template_id) || "",
        dayIndex: String(day?.day_index || 1),
        slotKind: slot?.slot_kind || "am",
        customLabel: slot?.slot_kind === "custom" ? slot.label || "" : "",
        exactTime: slot?.slot_kind === "exact_time" ? slot.start_time || "" : "",
        timepointWindowId: windowId,
        notes: block.notes || "",
      } satisfies LayoutItemDraft));
    })
    .flat();

  return {
    batteryName: record.experiment.title,
    batteryDescription: record.experiment.description || "",
    experimentDrafts: experimentDrafts.length > 0 ? experimentDrafts : [createEmptyExperiment()],
    timepointWindows: windows.length > 0 ? windows : [createEmptyWindow()],
    layoutItems,
    editingState: {
      experimentId: record.experiment.id,
      batteryTemplateId: record.templateId,
      scheduleTemplateId: record.scheduleTemplate?.id || null,
      timepointIds: record.timepoints.map((timepoint) => timepoint.id),
    } satisfies EditingBatteryState,
  };
}

export function BatteryCreationWizard({
  experiments,
  timepoints,
  protocols,
  templates,
  scheduleTemplates,
  scheduleDays,
  scheduleSlots,
  scheduledBlocks,
  persistenceEnabled,
}: {
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  protocols: Protocol[];
  templates: ExperimentTemplateRecord[];
  scheduleTemplates: ScheduleTemplate[];
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
  persistenceEnabled: boolean;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [batteryName, setBatteryName] = useState("");
  const [batteryDescription, setBatteryDescription] = useState("");
  const [experimentDrafts, setExperimentDrafts] = useState<ExperimentDraft[]>([createEmptyExperiment()]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("");
  const [timepointWindows, setTimepointWindows] = useState<TimepointWindowDraft[]>([createEmptyWindow()]);
  const [layoutItems, setLayoutItems] = useState<LayoutItemDraft[]>([]);
  const [selectedLayoutWindowId, setSelectedLayoutWindowId] = useState<string>("");
  const [showCopyLayoutTargets, setShowCopyLayoutTargets] = useState(false);
  const [copyLayoutTargetIds, setCopyLayoutTargetIds] = useState<string[]>([]);
  const [editingBattery, setEditingBattery] = useState<EditingBatteryState | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [openChoiceEditors, setOpenChoiceEditors] = useState<Record<string, boolean>>({});

  const currentStep = WIZARD_STEPS[stepIndex];
  const selectedExperiment =
    experimentDrafts.find((experiment) => experiment.id === selectedExperimentId) || experimentDrafts[0] || null;
  const batteryRecords = useMemo(
    () => buildBatteryRecords(experiments, timepoints, templates, scheduleTemplates, scheduleDays, scheduleSlots, scheduledBlocks),
    [experiments, scheduleDays, scheduleSlots, scheduleTemplates, scheduledBlocks, templates, timepoints],
  );

  useEffect(() => {
    if (!selectedExperimentId && experimentDrafts[0]?.id) {
      setSelectedExperimentId(experimentDrafts[0].id);
      return;
    }

    if (selectedExperimentId && !experimentDrafts.some((experiment) => experiment.id === selectedExperimentId)) {
      setSelectedExperimentId(experimentDrafts[0]?.id || "");
    }
  }, [experimentDrafts, selectedExperimentId]);

  useEffect(() => {
    if (!selectedLayoutWindowId && timepointWindows[0]?.id) {
      setSelectedLayoutWindowId(timepointWindows[0].id);
      return;
    }

    if (selectedLayoutWindowId && !timepointWindows.some((window) => window.id === selectedLayoutWindowId)) {
      setSelectedLayoutWindowId(timepointWindows[0]?.id || "");
    }
  }, [selectedLayoutWindowId, timepointWindows]);

  const activeLayoutWindow =
    timepointWindows.find((window) => window.id === selectedLayoutWindowId) || timepointWindows[0] || null;
  const activeLayoutItems = useMemo(
    () => layoutItems.filter((item) => item.timepointWindowId === activeLayoutWindow?.id),
    [activeLayoutWindow?.id, layoutItems],
  );
  const availableCopyTargets = useMemo(
    () => timepointWindows.filter((window) => window.id !== activeLayoutWindow?.id),
    [activeLayoutWindow?.id, timepointWindows],
  );

  const canMoveNext =
    currentStep.key === "experiments"
      ? batteryName.trim().length > 0 && experimentDrafts.every((experiment) => experiment.name.trim().length > 0)
      : currentStep.key === "details"
        ? experimentDrafts.every((experiment) => {
            const chosenColumns = [
              ...experiment.extractedColumns.filter((column) => column.selected).map((column) => column.column),
              ...experiment.manualColumns,
            ].filter((column) => !HIDDEN_SYSTEM_COLUMN_KEYS.has(column.key));
            return chosenColumns.length > 0;
          })
        : currentStep.key === "timepoints"
          ? timepointWindows.every((window) => window.name.trim() && window.minAgeDays.trim() && window.maxAgeDays.trim())
          : currentStep.key === "layout"
            ? layoutItems.length > 0 &&
              layoutItems.every((item) =>
                item.experimentId &&
                item.dayIndex.trim() &&
                item.timepointWindowId &&
                (item.slotKind !== "custom" || item.customLabel.trim()) &&
                (item.slotKind !== "exact_time" || item.exactTime.trim()),
              )
            : true;

  const updateExperimentDraft = (experimentId: string, patch: Partial<ExperimentDraft>) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => (experiment.id === experimentId ? { ...experiment, ...patch } : experiment)),
    );
  };

  const setChoiceEditorOpen = (editorKey: string, isOpen: boolean) => {
    setOpenChoiceEditors((current) => ({
      ...current,
      [editorKey]: isOpen,
    }));
  };

  const addProtocolLink = (experimentId: string, protocolId: string) => {
    if (!protocolId) return;
    setExperimentDrafts((current) =>
      current.map((experiment) => {
        if (experiment.id !== experimentId) return experiment;
        if (experiment.protocolLinks.some((link) => link.protocolId === protocolId)) return experiment;
        return {
          ...experiment,
          protocolLinks: [
            ...experiment.protocolLinks,
            {
              protocolId,
              sortOrder: experiment.protocolLinks.length,
              isDefault: experiment.protocolLinks.length === 0,
              notes: "",
            },
          ],
        };
      }),
    );
  };

  const updateProtocolLink = (experimentId: string, index: number, patch: Partial<ProtocolLinkDraft>) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => {
        if (experiment.id !== experimentId) return experiment;
        return {
          ...experiment,
          protocolLinks: experiment.protocolLinks.map((link, linkIndex) =>
            linkIndex === index ? { ...link, ...patch } : link,
          ),
        };
      }),
    );
  };

  const setDefaultProtocolLink = (experimentId: string, index: number) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => {
        if (experiment.id !== experimentId) return experiment;
        return {
          ...experiment,
          protocolLinks: experiment.protocolLinks.map((link, linkIndex) => ({
            ...link,
            isDefault: linkIndex === index,
          })),
        };
      }),
    );
  };

  const removeProtocolLink = (experimentId: string, index: number) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => {
        if (experiment.id !== experimentId) return experiment;
        const next = experiment.protocolLinks
          .filter((_, linkIndex) => linkIndex !== index)
          .map((link, linkIndex) => ({
            ...link,
            sortOrder: linkIndex,
          }));
        if (next.length > 0 && !next.some((link) => link.isDefault)) {
          next[0] = { ...next[0], isDefault: true };
        }
        return { ...experiment, protocolLinks: next };
      }),
    );
  };

  const moveProtocolLink = (experimentId: string, index: number, direction: -1 | 1) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => {
        if (experiment.id !== experimentId) return experiment;
        return {
          ...experiment,
          protocolLinks: reorderList(experiment.protocolLinks, index, direction).map((link, linkIndex) => ({
            ...link,
            sortOrder: linkIndex,
          })),
        };
      }),
    );
  };

  const updateManualColumn = (experimentId: string, columnIndex: number, patch: Partial<ResultColumnDraft>) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => {
        if (experiment.id !== experimentId) return experiment;
        const next = [...experiment.manualColumns];
        const previous = next[columnIndex];
        const merged = { ...previous, ...patch };
        if (typeof patch.label === "string" && !("key" in patch)) {
          const previousAutoKey = slugifyKey(previous.label);
          const shouldAutoKey = previous.key === previousAutoKey || !previous.key;
          if (shouldAutoKey) {
            merged.key = slugifyKey(patch.label) || previous.key;
          }
        }
        next[columnIndex] = merged;
        return { ...experiment, manualColumns: normalizeColumns(next) };
      }),
    );
  };

  const addManualColumn = (experimentId: string) => {
    setExperimentDrafts((current) =>
      current.map((experiment) =>
        experiment.id === experimentId
          ? { ...experiment, manualColumns: normalizeColumns([...experiment.manualColumns, createManualColumn()]) }
          : experiment,
      ),
    );
  };

  const addPresetColumn = (experimentId: string, columnFactory: () => ResultColumnDraft) => {
    setExperimentDrafts((current) =>
      current.map((experiment) =>
        experiment.id === experimentId
          ? { ...experiment, manualColumns: normalizeColumns([...experiment.manualColumns, columnFactory()]) }
          : experiment,
      ),
    );
  };

  const removeManualColumn = (experimentId: string, columnIndex: number) => {
    setExperimentDrafts((current) =>
      current.map((experiment) =>
        experiment.id === experimentId
          ? {
              ...experiment,
              manualColumns: normalizeColumns(experiment.manualColumns.filter((_, index) => index !== columnIndex)),
            }
          : experiment,
      ),
    );
  };

  const handleExampleFile = (experimentId: string, file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    const applyRows = (rows: Record<string, unknown>[]) => {
      const columns = columnsFromRows(rows);
      if (columns.length === 0) {
        throw new Error("No columns were detected in that file.");
      }
      updateExperimentDraft(experimentId, { extractedColumns: columns, sourceMode: "extract" });
      toast.success(`Detected ${columns.length} columns. Keep only the ones you want.`);
    };

    if (ext === "csv" || ext === "tsv" || ext === "txt" || ext === "rtf") {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const raw = String(event.target?.result || "");
          const preview = parseTextDatasetPreview(raw);
          if (!preview.columns.length) {
            throw new Error(preview.parseError || "No header row detected.");
          }
          applyRows(preview.data as Record<string, unknown>[]);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to parse example file.");
        }
      };
      reader.onerror = () => toast.error("Failed to read selected file.");
      reader.readAsText(file, ext === "rtf" ? "windows-1252" : undefined);
      return;
    }

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const workbook = XLSX.read(event.target?.result, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            throw new Error("No worksheet found in the workbook.");
          }
          const sheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
          applyRows(rows);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to parse workbook.");
        }
      };
      reader.onerror = () => toast.error("Failed to read selected file.");
      reader.readAsArrayBuffer(file);
      return;
    }

    toast.error("Unsupported file type. Use CSV, TSV, TXT, RTF, XLSX, or XLS.");
  };

  const startNewBattery = () => {
    setBatteryName("");
    setBatteryDescription("");
    setExperimentDrafts([createEmptyExperiment()]);
    setSelectedExperimentId("");
    setTimepointWindows([createEmptyWindow()]);
    setLayoutItems([]);
    setSelectedLayoutWindowId("");
    setShowCopyLayoutTargets(false);
    setCopyLayoutTargetIds([]);
    setEditingBattery(null);
    setStepIndex(0);
  };

  const startEditingBattery = (record: BatteryRecordSummary) => {
    const draft = buildDraftsFromBatteryRecord(record, templates);
    setBatteryName(draft.batteryName);
    setBatteryDescription(draft.batteryDescription);
    setExperimentDrafts(draft.experimentDrafts);
    setSelectedExperimentId(draft.experimentDrafts[0]?.id || "");
    setTimepointWindows(draft.timepointWindows);
    setLayoutItems(draft.layoutItems);
    setSelectedLayoutWindowId(draft.timepointWindows[0]?.id || "");
    setShowCopyLayoutTargets(false);
    setCopyLayoutTargetIds([]);
    setEditingBattery(draft.editingState);
    setStepIndex(1);
  };

  const cloneLayoutItemToWindow = (item: LayoutItemDraft, windowId: string): LayoutItemDraft => ({
    ...item,
    id: makeId("layout"),
    timepointWindowId: windowId,
  });

  const applyLayoutToSelectedWindows = () => {
    if (!activeLayoutWindow || copyLayoutTargetIds.length === 0) return;

    setLayoutItems((current) => {
      const sourceItems = current
        .filter((item) => item.timepointWindowId === activeLayoutWindow.id)
        .map((item) => ({ ...item }));

      const withoutTargets = current.filter((item) => !copyLayoutTargetIds.includes(item.timepointWindowId));
      const copiedItems = copyLayoutTargetIds.flatMap((windowId) =>
        sourceItems.map((item) => cloneLayoutItemToWindow(item, windowId)),
      );

      return [...withoutTargets, ...copiedItems];
    });

    setShowCopyLayoutTargets(false);
    setCopyLayoutTargetIds([]);
    toast.success("Layout copied to selected timepoints.");
  };

  const saveBattery = () => {
    if (!persistenceEnabled) {
      toast.error("This workspace is still in draft mode. Saving is not available yet.");
      return;
    }

    startTransition(async () => {
      try {
        const experimentEntries = await Promise.all(
          experimentDrafts.map(async (experiment) => {
            let protocolLinks = experiment.protocolLinks.map((link, index) => ({
              protocolId: link.protocolId,
              sortOrder: index,
              isDefault: link.isDefault,
              notes: link.notes,
            }));

            if (protocolLinks.length === 0) {
              const protocolForm = new FormData();
              protocolForm.set("title", experiment.name.trim());
              protocolForm.set("description", experiment.description.trim());
              protocolForm.set("category", experiment.category.trim());
              protocolForm.set("steps", "[]");

              const createdProtocol = await createProtocol(protocolForm);
              if (!createdProtocol?.id) {
                throw new Error(`Could not create the "${experiment.name}" single experiment.`);
              }

              protocolLinks = [
                {
                  protocolId: createdProtocol.id,
                  sortOrder: 0,
                  isDefault: true,
                  notes: "",
                },
              ];
            }

            const defaultProtocolId =
              protocolLinks.find((link) => link.isDefault)?.protocolId || protocolLinks[0]?.protocolId || "";
            if (!defaultProtocolId) {
              throw new Error(`Could not resolve the default protocol for "${experiment.name}".`);
            }

            const chosenColumns = buildPersistedColumns([
              ...experiment.extractedColumns.filter((column) => column.selected).map((column) => column.column),
              ...experiment.manualColumns,
            ]);

            const templateForm = new FormData();
            if (experiment.templateId) {
              templateForm.set("template_id", experiment.templateId);
            }
            templateForm.set("title", experiment.name.trim());
            templateForm.set("description", experiment.description.trim());
            templateForm.set("category", experiment.category.trim());
            templateForm.set("default_assignment_scope", "animal");
            templateForm.set("schema_name", `${experiment.name.trim()} results`);
            templateForm.set("schema_description", `Result fields for ${experiment.name.trim()}.`);
            templateForm.set("protocol_links", JSON.stringify(protocolLinks));
            templateForm.set("result_columns", JSON.stringify(chosenColumns.map(serializeColumn)));

            const savedTemplate = await saveExperimentTemplate(templateForm);
            if (!savedTemplate?.templateId) {
              throw new Error(`Could not create the "${experiment.name}" experiment definition.`);
            }

            return [
              experiment.id,
              {
                protocolId: defaultProtocolId,
                templateId: savedTemplate.templateId,
                name: experiment.name.trim(),
              },
            ] as const;
          }),
        );

        const experimentMap = new Map(experimentEntries);

        const batteryTemplateForm = new FormData();
        if (editingBattery?.batteryTemplateId) {
          batteryTemplateForm.set("template_id", editingBattery.batteryTemplateId);
        }
        batteryTemplateForm.set("title", batteryName.trim());
        batteryTemplateForm.set("description", batteryDescription.trim());
        batteryTemplateForm.set("category", "Battery");
        batteryTemplateForm.set("default_assignment_scope", "cohort");
        batteryTemplateForm.set("schema_name", `${batteryName.trim()} overview`);
        batteryTemplateForm.set("schema_description", "Top-level battery metadata.");
        batteryTemplateForm.set(
          "protocol_links",
          JSON.stringify(
            experimentDrafts.map((experiment, index) => {
              const saved = experimentMap.get(experiment.id);
              return {
                protocolId: saved?.protocolId || "",
                sortOrder: index,
                isDefault: index === 0,
                notes: "",
              };
            }),
          ),
        );
        batteryTemplateForm.set("result_columns", JSON.stringify(buildPersistedColumns([]).map(serializeColumn)));

        const batteryTemplate = await saveExperimentTemplate(batteryTemplateForm);
        if (!batteryTemplate?.templateId) {
          throw new Error("Could not create the battery record.");
        }

        const groupedByDay = new Map<number, LayoutItemDraft[]>();
        for (const item of layoutItems) {
          const dayIndex = Number(item.dayIndex);
          const current = groupedByDay.get(dayIndex) || [];
          groupedByDay.set(dayIndex, [...current, item]);
        }

        const scheduleDaysPayload = Array.from(groupedByDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([dayIndex, items], daySortOrder) => {
            const slotBuckets = new Map<string, LayoutItemDraft[]>();
            for (const item of items) {
              const slotKey =
                item.slotKind === "custom"
                  ? `${item.slotKind}|${item.customLabel.trim()}`
                  : item.slotKind === "exact_time"
                    ? `${item.slotKind}|${item.exactTime.trim()}`
                    : item.slotKind;
              const current = slotBuckets.get(slotKey) || [];
              slotBuckets.set(slotKey, [...current, item]);
            }

            return {
              day_index: dayIndex,
              label: `Day ${dayIndex}`,
              sort_order: daySortOrder,
              slots: Array.from(slotBuckets.values()).map((bucket, slotIndex) => {
                const first = bucket[0];
                return {
                  slot_kind: first.slotKind,
                  label:
                    first.slotKind === "custom"
                      ? first.customLabel.trim()
                      : first.slotKind === "exact_time"
                        ? first.exactTime.trim()
                        : first.slotKind.toUpperCase(),
                  start_time: first.slotKind === "exact_time" ? first.exactTime.trim() : null,
                  sort_order: slotIndex,
                  blocks: bucket.map((item, blockIndex) => {
                    const saved = experimentMap.get(item.experimentId);
                    const matchedWindow = timepointWindows.find((window) => window.id === item.timepointWindowId);
                    const windowName = matchedWindow?.name.trim() || "";
                    const windowRange = matchedWindow
                      ? `${matchedWindow.minAgeDays.trim()}-${matchedWindow.maxAgeDays.trim()} days`
                      : "";

                    return {
                      experiment_template_id: saved?.templateId || "",
                      protocol_id: saved?.protocolId || null,
                      title_override: saved?.name || null,
                      notes: item.notes.trim() || null,
                      sort_order: blockIndex,
                      repeat_key: null,
                      metadata: {
                        timepointWindowId: item.timepointWindowId,
                        timepointWindowName: windowName,
                        timepointWindowRange: windowRange,
                        timepointWindowIds: item.timepointWindowId ? [item.timepointWindowId] : [],
                        timepointWindowNames: windowName ? [windowName] : [],
                        timepointWindowRanges: windowRange ? [windowRange] : [],
                      },
                    };
                  }),
                };
              }),
            };
          });

        const scheduleForm = new FormData();
        if (editingBattery?.scheduleTemplateId) {
          scheduleForm.set("schedule_template_id", editingBattery.scheduleTemplateId);
        }
        scheduleForm.set("template_id", batteryTemplate.templateId);
        scheduleForm.set("name", `${batteryName.trim()} layout`);
        scheduleForm.set("description", "Guided battery layout generated from the setup wizard.");
        scheduleForm.set("days", JSON.stringify(scheduleDaysPayload));

        const scheduleSave = await saveScheduleTemplate(scheduleForm);

        const batteryExperimentForm = new FormData();
        batteryExperimentForm.set("title", batteryName.trim());
        batteryExperimentForm.set("description", batteryDescription.trim());
        batteryExperimentForm.set("status", "planned");
        batteryExperimentForm.set("priority", "medium");
        batteryExperimentForm.set(
          "tags",
          [
            "kind:battery",
            `battery_template:${batteryTemplate.templateId}`,
            scheduleSave?.schedule_template_id ? `battery_schedule:${scheduleSave.schedule_template_id}` : null,
          ]
            .filter(Boolean)
            .join(","),
        );

        let batteryExperimentId = editingBattery?.experimentId || "";

        if (editingBattery?.experimentId) {
          batteryExperimentForm.set("id", editingBattery.experimentId);
          await updateExperiment(batteryExperimentForm);
        } else {
          const createdBatteryExperiment = await createExperiment(batteryExperimentForm);
          if (!createdBatteryExperiment?.id) {
            throw new Error("Could not create the battery summary record.");
          }
          batteryExperimentId = createdBatteryExperiment.id;
        }

        const timepointForm = new FormData();
        timepointForm.set("experiment_id", batteryExperimentId);
        timepointForm.set(
          "windows",
          JSON.stringify(
            timepointWindows.map((window) => ({
              label: window.name.trim(),
              scheduled_at: new Date().toISOString(),
              notes: `${window.minAgeDays.trim()}-${window.maxAgeDays.trim()} days`,
            })),
          ),
        );
        await replaceExperimentTimepoints(timepointForm);

        router.refresh();
        toast.success(editingBattery ? "Battery updated." : "Battery created.");
        startNewBattery();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save battery.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <Card className="border-slate-200/80 bg-white/90 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-xl">{editingBattery ? "Edit Battery" : "Guided Battery Builder"}</CardTitle>
              <CardDescription>
                Build the full battery in one place. LabLynx adds the system fields automatically so you only define the fields researchers actually use.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editingBattery ? (
                <Button type="button" variant="outline" onClick={startNewBattery} disabled={isPending}>
                  Start a new battery
                </Button>
              ) : null}
              {WIZARD_STEPS.map((step, index) => (
                <Badge
                  key={step.key}
                  variant={index === stepIndex ? "default" : "secondary"}
                  className="px-3 py-1"
                >
                  {index + 1}. {step.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {batteryRecords.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Continue a saved battery</p>
                  <p className="mt-1 text-sm text-slate-600">Open any saved battery back into this same guided flow.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {batteryRecords.slice(0, 6).map((record) => (
                    <Button
                      key={record.experiment.id}
                      type="button"
                      variant={editingBattery?.experimentId === record.experiment.id ? "default" : "outline"}
                      onClick={() => startEditingBattery(record)}
                      disabled={isPending}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {record.experiment.title}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">{currentStep.label}</p>
            <p className="mt-1 text-sm text-slate-600">{currentStep.description}</p>
          </div>

          {currentStep.key === "experiments" ? (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="battery-name">Battery Name</Label>
                  <Input id="battery-name" value={batteryName} onChange={(event) => setBatteryName(event.target.value)} placeholder="Behavioral baseline battery" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="battery-description">Battery Description</Label>
                  <Textarea id="battery-description" value={batteryDescription} onChange={(event) => setBatteryDescription(event.target.value)} rows={2} placeholder="What this battery is for and when it gets used." />
                </div>
              </div>
              <div className="space-y-3">
                {experimentDrafts.map((experiment, index) => (
                  <div key={experiment.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <Input
                        value={experiment.name}
                        onChange={(event) => updateExperimentDraft(experiment.id, { name: event.target.value })}
                        placeholder="Y-Maze"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setExperimentDrafts((current) => current.filter((item) => item.id !== experiment.id))
                        }
                        disabled={experimentDrafts.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={() => setExperimentDrafts((current) => [...current, createEmptyExperiment()])}>
                <Plus className="mr-2 h-4 w-4" />
                Add another experiment
              </Button>
            </section>
          ) : null}

          {currentStep.key === "details" ? (
            <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-2">
                {experimentDrafts.map((experiment) => (
                  <button
                    key={experiment.id}
                    type="button"
                    onClick={() => setSelectedExperimentId(experiment.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left ${
                      (selectedExperiment?.id || experimentDrafts[0]?.id) === experiment.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white"
                    }`}
                    >
                    <p className="font-semibold">{experiment.name || "Untitled experiment"}</p>
                    <p className={`text-xs ${((selectedExperiment?.id || experimentDrafts[0]?.id) === experiment.id) ? "text-slate-200" : "text-slate-500"}`}>
                      {[...experiment.extractedColumns.filter((column) => column.selected), ...experiment.manualColumns].length} researcher field{[...experiment.extractedColumns.filter((column) => column.selected), ...experiment.manualColumns].length === 1 ? "" : "s"}
                    </p>
                  </button>
                ))}
              </div>

              {selectedExperiment ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={selectedExperiment.name} onChange={(event) => updateExperimentDraft(selectedExperiment.id, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input value={selectedExperiment.category} onChange={(event) => updateExperimentDraft(selectedExperiment.id, { category: event.target.value })} placeholder="Behavior" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Experiment Details</Label>
                      <Textarea value={selectedExperiment.description} onChange={(event) => updateExperimentDraft(selectedExperiment.id, { description: event.target.value })} rows={4} placeholder="Add the details someone needs for this single experiment." />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Linked Protocols</p>
                        <p className="text-sm text-slate-500">
                          Attach existing protocols to this single experiment. The default protocol will be used when the battery saves.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            if (event.target.value) {
                              addProtocolLink(selectedExperiment.id, event.target.value);
                              event.currentTarget.value = "";
                            }
                          }}
                          className="flex h-10 min-w-[220px] rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                        >
                          <option value="">Add protocol…</option>
                          {protocols
                            .filter((protocol) => !selectedExperiment.protocolLinks.some((link) => link.protocolId === protocol.id))
                            .map((protocol) => (
                              <option key={protocol.id} value={protocol.id}>
                                {protocol.title}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {selectedExperiment.protocolLinks.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No protocol linked yet. If you leave this empty, LabLynx will create a simple protocol automatically from the experiment name.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selectedExperiment.protocolLinks.map((link, index) => {
                          const protocol = protocols.find((item) => item.id === link.protocolId);
                          return (
                            <div key={`${link.protocolId}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{protocol?.title || "Linked protocol"}</p>
                                  <p className="text-xs text-slate-500">
                                    Position {index + 1}
                                    {link.isDefault ? " • Default protocol" : ""}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => moveProtocolLink(selectedExperiment.id, index, -1)} disabled={index === 0}>
                                    <ArrowLeft className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={() => moveProtocolLink(selectedExperiment.id, index, 1)} disabled={index === selectedExperiment.protocolLinks.length - 1}>
                                    <ArrowRight className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" variant={link.isDefault ? "default" : "outline"} size="sm" onClick={() => setDefaultProtocolLink(selectedExperiment.id, index)}>
                                    Default
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={() => removeProtocolLink(selectedExperiment.id, index)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 space-y-2">
                                <Label>Protocol Notes</Label>
                                <Textarea
                                  value={link.notes}
                                  onChange={(event) => updateProtocolLink(selectedExperiment.id, index, { notes: event.target.value })}
                                  placeholder="Prep details, operator notes, or when to use this protocol."
                                  rows={2}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Result fields</p>
                        <p className="text-sm text-slate-500">
                          Upload an example results file if you have one, then keep only the fields researchers should fill in.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => addPresetColumn(selectedExperiment.id, createDoneColumn)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add done/not done
                      </Button>
                      <Button type="button" variant="outline" onClick={() => addPresetColumn(selectedExperiment.id, createAverageColumn)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add average field
                      </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                        <input
                          ref={(node) => {
                            fileInputRefs.current[selectedExperiment.id] = node;
                          }}
                          type="file"
                          accept=".csv,.tsv,.txt,.rtf,.xlsx,.xls"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              handleExampleFile(selectedExperiment.id, file);
                            }
                            event.currentTarget.value = "";
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => fileInputRefs.current[selectedExperiment.id]?.click()}>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload example results file
                        </Button>
                        <div className="space-y-3">
                          {selectedExperiment.extractedColumns.length === 0 ? (
                            <p className="text-sm text-slate-500">Upload a sample file to detect columns, then uncheck anything you do not want.</p>
                          ) : (
                            selectedExperiment.extractedColumns.map((entry, index) => (
                              <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={entry.selected}
                                    onChange={(event) =>
                                      updateExperimentDraft(selectedExperiment.id, {
                                        extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                          columnIndex === index ? { ...column, selected: event.target.checked } : column,
                                        ),
                                      })
                                    }
                                    className="mt-1 h-4 w-4"
                                  />
                                  <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    <div className="space-y-2">
                                      <Label>Label</Label>
                                      <Input
                                        value={entry.column.label}
                                        onChange={(event) =>
                                          updateExperimentDraft(selectedExperiment.id, {
                                            extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                              columnIndex === index
                                                ? {
                                                    ...column,
                                                    column: {
                                                      ...column.column,
                                                      label: event.target.value,
                                                      key: slugifyKey(event.target.value) || column.column.key,
                                                    },
                                                  }
                                                : column,
                                            ),
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Type</Label>
                                      <select
                                        value={entry.column.columnType}
                                        onChange={(event) =>
                                          updateExperimentDraft(selectedExperiment.id, {
                                            extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                              columnIndex === index
                                                ? {
                                                    ...column,
                                                    column: {
                                                      ...column.column,
                                                      columnType: event.target.value as ColumnType,
                                                      options: isChoiceColumnType(event.target.value as ColumnType)
                                                        ? column.column.options
                                                        : [],
                                                    },
                                                  }
                                                : column,
                                            ),
                                          })
                                        }
                                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                                      >
                                        {getGuidedColumnTypeOptions(entry.column.columnType).map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {isChoiceColumnType(entry.column.columnType) ? (() => {
                                      const editorKey = `extract:${selectedExperiment.id}:${entry.id}`;
                                      const editorState = openChoiceEditors[editorKey];
                                      const isOpen = editorState ?? entry.column.options.length > 0;
                                      return (
                                        <div className="space-y-2">
                                          <Label>Choices</Label>
                                          {isOpen ? (
                                            <>
                                              <Input
                                                value={entry.column.options.join(", ")}
                                                onChange={(event) =>
                                                  updateExperimentDraft(selectedExperiment.id, {
                                                    extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                                      columnIndex === index
                                                        ? {
                                                            ...column,
                                                            column: {
                                                              ...column.column,
                                                              options: event.target.value
                                                                .split(",")
                                                                .map((item) => item.trim())
                                                                .filter(Boolean),
                                                            },
                                                          }
                                                        : column,
                                                    ),
                                                  })
                                                }
                                                placeholder="Comma-separated choices"
                                              />
                                              <div className="flex gap-2">
                                                <Button type="button" variant="outline" size="sm" onClick={() => setChoiceEditorOpen(editorKey, false)}>
                                                  Hide choices
                                                </Button>
                                              </div>
                                            </>
                                          ) : (
                                            <Button type="button" variant="outline" size="sm" onClick={() => setChoiceEditorOpen(editorKey, true)}>
                                              Add choices
                                            </Button>
                                          )}
                                        </div>
                                      );
                                    })() : null}
                                  </div>
                                </div>
                                {entry.column.averageSourceKeys.length > 0 || entry.column.groupKey === "derived" ? (
                                  <div className="mt-3 space-y-2">
                                    <Label>Average these numeric fields</Label>
                                    <div className="flex flex-wrap gap-2">
                                      {selectedExperiment.extractedColumns
                                        .filter((candidate) => candidate.selected)
                                        .map((candidate) => candidate.column)
                                        .filter((candidate) => candidate.key !== entry.column.key && isNumericColumnType(candidate.columnType))
                                        .map((candidate) => {
                                          const selected = entry.column.averageSourceKeys.includes(candidate.key);
                                          return (
                                            <button
                                              key={`${entry.id}-${candidate.key}`}
                                              type="button"
                                              onClick={() =>
                                                updateExperimentDraft(selectedExperiment.id, {
                                                  extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                                    columnIndex === index
                                                      ? {
                                                          ...column,
                                                          column: {
                                                            ...column.column,
                                                            averageSourceKeys: selected
                                                              ? column.column.averageSourceKeys.filter((key) => key !== candidate.key)
                                                              : [...column.column.averageSourceKeys, candidate.key],
                                                            groupKey: "derived",
                                                            helpText:
                                                              column.column.helpText || "Derived average of selected numeric fields.",
                                                          },
                                                        }
                                                      : column,
                                                  ),
                                                })
                                              }
                                              className={`rounded-full border px-3 py-1 text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                                            >
                                              {candidate.label}
                                            </button>
                                          );
                                        })}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>

                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Extra fields</p>
                            <p className="text-sm text-slate-500">
                              Add any extra fields that were not present in the example file.
                            </p>
                          </div>
                          {selectedExperiment.manualColumns.map((column, index) => (
                            <div key={`${column.key}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                  <Label>Label</Label>
                                  <Input value={column.label} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { label: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Type</Label>
                                  <select
                                    value={column.columnType}
                                    onChange={(event) =>
                                      updateManualColumn(selectedExperiment.id, index, {
                                        columnType: event.target.value as ColumnType,
                                        options: isChoiceColumnType(event.target.value as ColumnType) ? column.options : [],
                                      })
                                    }
                                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                                  >
                                    {getGuidedColumnTypeOptions(column.columnType).map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-end">
                                  <Button type="button" variant="outline" onClick={() => removeManualColumn(selectedExperiment.id, index)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              {isChoiceColumnType(column.columnType) ? (() => {
                                const editorKey = `manual:${selectedExperiment.id}:${column.key}:${index}`;
                                const editorState = openChoiceEditors[editorKey];
                                const isOpen = editorState ?? column.options.length > 0;
                                return (
                                  <div className="mt-3">
                                    <div className="space-y-2">
                                      <Label>Choices</Label>
                                      {isOpen ? (
                                        <>
                                          <Input
                                            value={column.options.join(", ")}
                                            onChange={(event) =>
                                              updateManualColumn(selectedExperiment.id, index, {
                                                options: event.target.value
                                                  .split(",")
                                                  .map((item) => item.trim())
                                                  .filter(Boolean),
                                              })
                                            }
                                            placeholder="Comma-separated choices"
                                          />
                                          <div className="flex gap-2">
                                            <Button type="button" variant="outline" size="sm" onClick={() => setChoiceEditorOpen(editorKey, false)}>
                                              Hide choices
                                            </Button>
                                          </div>
                                        </>
                                      ) : (
                                        <Button type="button" variant="outline" size="sm" onClick={() => setChoiceEditorOpen(editorKey, true)}>
                                          Add choices
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })() : null}
                              {column.averageSourceKeys.length > 0 || column.groupKey === "derived" ? (
                                <div className="mt-3 space-y-2">
                                  <Label>Average these numeric fields</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {[
                                      ...selectedExperiment.extractedColumns.filter((candidate) => candidate.selected).map((candidate) => candidate.column),
                                      ...selectedExperiment.manualColumns,
                                    ]
                                      .filter((candidate) => candidate.key !== column.key && isNumericColumnType(candidate.columnType))
                                      .map((candidate) => {
                                        const selected = column.averageSourceKeys.includes(candidate.key);
                                        return (
                                          <button
                                            key={`${column.key}-${candidate.key}`}
                                            type="button"
                                            onClick={() =>
                                              updateManualColumn(selectedExperiment.id, index, {
                                                averageSourceKeys: selected
                                                  ? column.averageSourceKeys.filter((key) => key !== candidate.key)
                                                  : [...column.averageSourceKeys, candidate.key],
                                                groupKey: "derived",
                                                helpText: column.helpText || "Derived average of selected numeric fields.",
                                              })
                                            }
                                            className={`rounded-full border px-3 py-1 text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                                          >
                                            {candidate.label}
                                          </button>
                                        );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                          <Button type="button" variant="outline" onClick={() => addManualColumn(selectedExperiment.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add extra field
                          </Button>
                        </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {currentStep.key === "timepoints" ? (
            <section className="space-y-4">
              {timepointWindows.map((window, index) => (
                <div key={window.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Window {index + 1}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTimepointWindows((current) => current.filter((item) => item.id !== window.id));
                        setLayoutItems((current) => current.filter((item) => item.timepointWindowId !== window.id));
                      }}
                      disabled={timepointWindows.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={window.name} onChange={(event) => setTimepointWindows((current) => current.map((item) => item.id === window.id ? { ...item, name: event.target.value } : item))} placeholder="Young Adult" />
                    </div>
                    <div className="space-y-2">
                      <Label>Min Age (days)</Label>
                      <Input value={window.minAgeDays} onChange={(event) => setTimepointWindows((current) => current.map((item) => item.id === window.id ? { ...item, minAgeDays: event.target.value } : item))} placeholder="30" />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Age (days)</Label>
                      <Input value={window.maxAgeDays} onChange={(event) => setTimepointWindows((current) => current.map((item) => item.id === window.id ? { ...item, maxAgeDays: event.target.value } : item))} placeholder="60" />
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const nextWindow = createEmptyWindow();
                  setTimepointWindows((current) => [...current, nextWindow]);
                  setSelectedLayoutWindowId(nextWindow.id);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add timepoint window
              </Button>
            </section>
          ) : null}

          {currentStep.key === "layout" ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap gap-2">
                  {timepointWindows.map((window) => (
                    <button
                      key={window.id}
                      type="button"
                      onClick={() => setSelectedLayoutWindowId(window.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        window.id === activeLayoutWindow?.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {window.name || "Untitled window"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{activeLayoutWindow?.name || "Select a timepoint window"}</p>
                    <p className="text-xs text-slate-600">
                      Build the battery layout specifically for this timepoint window. Other windows can have a different schedule.
                    </p>
                  </div>
                  {availableCopyTargets.length > 0 ? (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCopyLayoutTargets((current) => !current)}
                      >
                        {showCopyLayoutTargets ? "Cancel Copy" : "Apply To Other Timepoints"}
                      </Button>
                      {showCopyLayoutTargets ? (
                        <div className="min-w-[260px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-900">Copy this layout to:</p>
                          <div className="mt-2 space-y-2">
                            {availableCopyTargets.map((window) => {
                              const selected = copyLayoutTargetIds.includes(window.id);
                              return (
                                <label key={window.id} className="flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      setCopyLayoutTargetIds((current) =>
                                        selected
                                          ? current.filter((id) => id !== window.id)
                                          : [...current, window.id],
                                      )
                                    }
                                  />
                                  <span>{window.name || "Untitled window"}</span>
                                </label>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">
                            This replaces the current layout in the selected timepoints.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            onClick={applyLayoutToSelectedWindows}
                            disabled={copyLayoutTargetIds.length === 0}
                          >
                            Copy Layout
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {activeLayoutItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm text-slate-600">Add the first battery item for this timepoint window.</p>
                </div>
              ) : null}

              {activeLayoutItems.map((item, index) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Battery Item {index + 1}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setLayoutItems((current) => current.filter((entry) => entry.id !== item.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Experiment</Label>
                      <select
                        value={item.experimentId}
                        onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, experimentId: event.target.value } : entry))}
                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                      >
                        <option value="">Choose an experiment</option>
                        {experimentDrafts.map((experiment) => (
                          <option key={experiment.id} value={experiment.id}>{experiment.name || "Untitled experiment"}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Day</Label>
                      <Input value={item.dayIndex} onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, dayIndex: event.target.value } : entry))} placeholder="1" />
                    </div>
                    <div className="space-y-2">
                      <Label>Time of Day</Label>
                      <select
                        value={item.slotKind}
                        onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, slotKind: event.target.value as PlatformSlotKind } : entry))}
                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                      >
                        <option value="am">AM</option>
                        <option value="midday">Midday</option>
                        <option value="pm">PM</option>
                        <option value="evening">Evening</option>
                        <option value="custom">Custom label</option>
                        <option value="exact_time">Exact time</option>
                      </select>
                    </div>
                    {item.slotKind === "custom" ? (
                      <div className="space-y-2">
                        <Label>Custom Label</Label>
                        <Input value={item.customLabel} onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, customLabel: event.target.value } : entry))} placeholder="Late afternoon" />
                      </div>
                    ) : null}
                    {item.slotKind === "exact_time" ? (
                      <div className="space-y-2">
                        <Label>Exact Time</Label>
                        <Input value={item.exactTime} onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, exactTime: event.target.value } : entry))} placeholder="14:30" />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={item.notes} onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry))} rows={2} placeholder="Optional notes for this battery item." />
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setLayoutItems((current) => [
                    ...current,
                    createEmptyLayoutItem(experimentDrafts[0]?.id || "", activeLayoutWindow?.id || timepointWindows[0]?.id || ""),
                  ])
                }
                disabled={!activeLayoutWindow}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add battery item
              </Button>
            </section>
          ) : null}

          {currentStep.key === "review" ? (
            <section className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-base font-semibold text-slate-900">{batteryName || "Untitled battery"}</p>
                <p className="mt-1 text-sm text-slate-600">{batteryDescription || "No battery description yet."}</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card>
                  <CardHeader><CardTitle className="text-base">Single Experiments</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {experimentDrafts.map((experiment) => {
                      const selectedColumns =
                        experiment.extractedColumns.filter((column) => column.selected).length + experiment.manualColumns.length;
                      return (
                        <div key={experiment.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                          <p className="font-semibold text-slate-900">{experiment.name || "Untitled experiment"}</p>
                          <p className="text-xs text-slate-600">{selectedColumns} result column{selectedColumns === 1 ? "" : "s"}</p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Timepoint Windows</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {timepointWindows.map((window) => (
                      <div key={window.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                        <p className="font-semibold text-slate-900">{window.name || "Untitled window"}</p>
                        <p className="text-xs text-slate-600">{window.minAgeDays || "?"}-{window.maxAgeDays || "?"} days</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Battery Layout</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {timepointWindows.map((window) => {
                      const windowItems = layoutItems.filter((item) => item.timepointWindowId === window.id);
                      return (
                        <div key={window.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                          <p className="font-semibold text-slate-900">{window.name || "Untitled window"}</p>
                          <p className="text-xs text-slate-600">{window.minAgeDays || "?"}-{window.maxAgeDays || "?"} days</p>
                          <div className="mt-3 space-y-2">
                            {windowItems.length === 0 ? (
                              <p className="text-xs text-slate-500">No battery items added yet.</p>
                            ) : (
                              windowItems.map((item) => {
                                const experiment = experimentDrafts.find((entry) => entry.id === item.experimentId);
                                return (
                                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="font-semibold text-slate-900">Day {item.dayIndex} • {slotLabel(item)}</p>
                                    <p className="text-sm text-slate-700">{experiment?.name || "Choose experiment"}</p>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                LabLynx will automatically add the built-in Notes, Files, and URL result fields to every experiment when you save.
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStepIndex((current) => Math.max(current - 1, 0))} disabled={stepIndex === 0 || isPending}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>
            <div className="flex gap-2">
              {currentStep.key === "review" ? (
                <Button type="button" onClick={saveBattery} disabled={isPending || !canMoveNext}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {editingBattery ? "Save changes" : "Save battery"}
                </Button>
              ) : (
                <Button type="button" onClick={() => setStepIndex((current) => Math.min(current + 1, WIZARD_STEPS.length - 1))} disabled={!canMoveNext || isPending}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
