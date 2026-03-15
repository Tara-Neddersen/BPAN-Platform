"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { ArrowLeft, ArrowRight, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createExperiment, createProtocol, createTimepoint } from "@/app/(protected)/experiments/actions";
import { saveScheduleTemplate } from "@/app/(protected)/experiments/schedule-actions";
import { saveExperimentTemplate } from "@/app/(protected)/experiments/template-actions";
import type { Experiment, ExperimentTimepoint, PlatformSlotKind, Protocol, ScheduleDay, ScheduleSlot, ScheduledBlock, ScheduleTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { detectDatasetColumnType, parseTextDatasetPreview } from "@/lib/dataset-preview";

const COLUMN_TYPE_OPTIONS = [
  "text",
  "long_text",
  "number",
  "integer",
  "boolean",
  "date",
  "time",
  "datetime",
  "select",
  "multi_select",
  "file",
  "url",
  "animal_ref",
  "cohort_ref",
  "batch_ref",
] as const;

type ColumnType = (typeof COLUMN_TYPE_OPTIONS)[number];

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
  timepointWindowIds: string[];
  notes: string;
};

type BatteryRecordSummary = {
  experiment: Experiment;
  timepoints: ExperimentTimepoint[];
  templateId: string | null;
  scheduleTemplate: ScheduleTemplate | null;
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
};

const WIZARD_STEPS: Array<{ key: WizardStep; label: string; description: string }> = [
  { key: "experiments", label: "Experiments", description: "Name the single experiments in this battery." },
  { key: "details", label: "Details", description: "Add protocol details and result columns for each experiment." },
  { key: "timepoints", label: "Timepoints", description: "Create named windows with age ranges underneath." },
  { key: "layout", label: "Battery Layout", description: "Place experiments across days, times, and windows." },
  { key: "review", label: "Review", description: "Check everything once, then save the battery." },
];

const DEFAULT_COLUMNS: ResultColumnDraft[] = [
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
    sortOrder: 2,
    isSystemDefault: false,
    isEnabled: true,
  },
];

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
    name,
    description: "",
    category: "",
    protocolLinks: [],
    sourceMode: "extract",
    extractedColumns: [],
    manualColumns: DEFAULT_COLUMNS.map((column, index) => ({
      ...column,
      options: [...column.options],
      sortOrder: index,
    })),
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

function createEmptyLayoutItem(experimentId = "", windowIds: string[] = []): LayoutItemDraft {
  return {
    id: makeId("layout"),
    experimentId,
    dayIndex: "1",
    slotKind: "am",
    customLabel: "",
    exactTime: "",
    timepointWindowIds: windowIds,
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

function createFileColumn(): ResultColumnDraft {
  return {
    key: "attachment_link",
    label: "Attachment",
    columnType: "file",
    required: false,
    defaultValue: "",
    options: [],
    averageSourceKeys: [],
    unit: "",
    helpText: "Uploads the file to Google Drive and stores only the share link in BPAN.",
    groupKey: "files",
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

function mergeColumns(baseColumns: ResultColumnDraft[], extraColumns: ResultColumnDraft[]) {
  const merged = [...baseColumns.map((column) => ({ ...column })), ...extraColumns.map((column) => ({ ...column }))];
  const byKey = new Map<string, ResultColumnDraft>();

  for (const column of merged) {
    byKey.set(column.key, column);
  }

  return normalizeColumns(Array.from(byKey.values()));
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
        scheduleTemplate,
        scheduleDays: batteryDays,
        scheduleSlots: batterySlots,
        scheduledBlocks: batteryBlocks,
      } satisfies BatteryRecordSummary;
    })
    .sort((a, b) => new Date(b.experiment.updated_at).getTime() - new Date(a.experiment.updated_at).getTime());

  return batteries;
}

function BatteryOverview({
  records,
  protocols,
  templates,
}: {
  records: BatteryRecordSummary[];
  protocols: Protocol[];
  templates: Array<{ id: string; title: string }>;
}) {
  const templateTitleById = new Map(templates.map((template) => [template.id, template.title]));
  const protocolTitleById = new Map(protocols.map((protocol) => [protocol.id, protocol.title]));

  if (records.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Batteries</CardTitle>
          <CardDescription>Your saved batteries will show up here after you finish the guided flow.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {records.map((record) => {
        const slotById = new Map(record.scheduleSlots.map((slot) => [slot.id, slot]));
        const dayById = new Map(record.scheduleDays.map((day) => [day.id, day]));
        const windows = [...record.timepoints].sort((a, b) => a.label.localeCompare(b.label));

        return (
          <Card key={record.experiment.id} className="border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{record.experiment.title}</CardTitle>
                  <CardDescription>{record.experiment.description || "No battery description yet."}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{windows.length} timepoint window{windows.length === 1 ? "" : "s"}</Badge>
                  <Badge variant="secondary">{record.scheduledBlocks.length} battery item{record.scheduledBlocks.length === 1 ? "" : "s"}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Timepoint Windows</p>
                <div className="flex flex-wrap gap-2">
                  {windows.length === 0 ? (
                    <span className="text-sm text-slate-500">No linked windows.</span>
                  ) : (
                    windows.map((window) => (
                      <Badge key={window.id} className="bg-slate-100 text-slate-800 hover:bg-slate-100">
                        {window.label}
                        {window.notes ? ` • ${window.notes}` : ""}
                      </Badge>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">Battery Layout</p>
                {record.scheduledBlocks.length === 0 ? (
                  <p className="text-sm text-slate-500">No saved layout yet.</p>
                ) : (
                  <div className="space-y-3">
                    {record.scheduledBlocks
                      .slice()
                      .sort((a, b) => {
                        const slotA = slotById.get(a.schedule_slot_id);
                        const slotB = slotById.get(b.schedule_slot_id);
                        const dayA = slotA ? dayById.get(slotA.schedule_day_id) : null;
                        const dayB = slotB ? dayById.get(slotB.schedule_day_id) : null;
                        if ((dayA?.day_index || 0) !== (dayB?.day_index || 0)) {
                          return (dayA?.day_index || 0) - (dayB?.day_index || 0);
                        }
                        return a.sort_order - b.sort_order;
                      })
                      .map((block) => {
                        const slot = slotById.get(block.schedule_slot_id);
                        const day = slot ? dayById.get(slot.schedule_day_id) : null;
                        const metadata =
                          block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
                            ? block.metadata as Record<string, unknown>
                            : {};
                        const windowNames = Array.isArray(metadata.timepointWindowNames)
                          ? metadata.timepointWindowNames.filter((value): value is string => typeof value === "string")
                          : [];
                        const protocolTitle = block.protocol_id ? protocolTitleById.get(block.protocol_id) : null;
                        const templateTitle = templateTitleById.get(block.experiment_template_id);

                        return (
                          <div key={block.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Day {day?.day_index || "?"} • {slot?.slot_kind === "exact_time" ? slot.start_time : slot?.label || slot?.slot_kind?.toUpperCase() || "Slot"}
                                </p>
                                <p className="text-sm text-slate-700">
                                  {block.title_override || protocolTitle || templateTitle || "Experiment block"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {windowNames.map((name) => (
                                  <Badge key={`${block.id}-${name}`} variant="outline">{name}</Badge>
                                ))}
                              </div>
                            </div>
                            {block.notes ? <p className="mt-2 text-xs text-slate-600">{block.notes}</p> : null}
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
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
  onOpenDirectEditors,
}: {
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  protocols: Protocol[];
  templates: Array<{ id: string; title: string }>;
  scheduleTemplates: ScheduleTemplate[];
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
  persistenceEnabled: boolean;
  onOpenDirectEditors?: () => void;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [batteryName, setBatteryName] = useState("");
  const [batteryDescription, setBatteryDescription] = useState("");
  const [experimentDrafts, setExperimentDrafts] = useState<ExperimentDraft[]>([createEmptyExperiment()]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("");
  const [timepointWindows, setTimepointWindows] = useState<TimepointWindowDraft[]>([createEmptyWindow()]);
  const [layoutItems, setLayoutItems] = useState<LayoutItemDraft[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const currentStep = WIZARD_STEPS[stepIndex];
  const selectedExperiment =
    experimentDrafts.find((experiment) => experiment.id === selectedExperimentId) || experimentDrafts[0] || null;
  const batteryRecords = useMemo(
    () => buildBatteryRecords(experiments, timepoints, scheduleTemplates, scheduleDays, scheduleSlots, scheduledBlocks),
    [experiments, scheduleDays, scheduleSlots, scheduleTemplates, scheduledBlocks, timepoints],
  );

  const canMoveNext =
    currentStep.key === "experiments"
      ? batteryName.trim().length > 0 && experimentDrafts.every((experiment) => experiment.name.trim().length > 0)
      : currentStep.key === "details"
        ? experimentDrafts.every((experiment) => {
            const chosenColumns =
              experiment.sourceMode === "extract"
                ? [
                    ...experiment.extractedColumns.filter((column) => column.selected).map((column) => column.column),
                    ...experiment.manualColumns,
                  ]
                : experiment.manualColumns;
            return chosenColumns.length > 0;
          })
        : currentStep.key === "timepoints"
          ? timepointWindows.every((window) => window.name.trim() && window.minAgeDays.trim() && window.maxAgeDays.trim())
          : currentStep.key === "layout"
            ? layoutItems.length > 0 &&
              layoutItems.every((item) =>
                item.experimentId &&
                item.dayIndex.trim() &&
                item.timepointWindowIds.length > 0 &&
                (item.slotKind !== "custom" || item.customLabel.trim()) &&
                (item.slotKind !== "exact_time" || item.exactTime.trim()),
              )
            : true;

  const updateExperiment = (experimentId: string, patch: Partial<ExperimentDraft>) => {
    setExperimentDrafts((current) =>
      current.map((experiment) => (experiment.id === experimentId ? { ...experiment, ...patch } : experiment)),
    );
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
      updateExperiment(experimentId, { extractedColumns: columns, sourceMode: "extract" });
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

  const saveBattery = () => {
    if (!persistenceEnabled) {
      toast.error("This workspace is still in draft mode. Saving is not available yet.");
      return;
    }

    startTransition(async () => {
      try {
        const experimentMap = new Map<string, { protocolId: string; templateId: string; name: string }>();

        for (const experiment of experimentDrafts) {
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

          const chosenColumns =
            experiment.sourceMode === "extract"
              ? mergeColumns(
                  DEFAULT_COLUMNS,
                  [
                    ...experiment.extractedColumns.filter((column) => column.selected).map((column) => column.column),
                    ...experiment.manualColumns,
                  ],
                )
              : mergeColumns(DEFAULT_COLUMNS, experiment.manualColumns);

          const templateForm = new FormData();
          templateForm.set("title", experiment.name.trim());
          templateForm.set("description", experiment.description.trim());
          templateForm.set("category", experiment.category.trim());
          templateForm.set("default_assignment_scope", "animal");
          templateForm.set("schema_name", `${experiment.name.trim()} results`);
          templateForm.set("schema_description", `Result fields for ${experiment.name.trim()}.`);
          templateForm.set("protocol_links", JSON.stringify(protocolLinks));
          templateForm.set(
            "result_columns",
            JSON.stringify(chosenColumns.map(serializeColumn)),
          );

          const savedTemplate = await saveExperimentTemplate(templateForm);
          if (!savedTemplate?.templateId) {
            throw new Error(`Could not create the "${experiment.name}" experiment definition.`);
          }

          experimentMap.set(experiment.id, {
            protocolId: defaultProtocolId,
            templateId: savedTemplate.templateId,
            name: experiment.name.trim(),
          });
        }

        const batteryTemplateForm = new FormData();
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
        batteryTemplateForm.set("result_columns", JSON.stringify(normalizeColumns(DEFAULT_COLUMNS).map(serializeColumn)));

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
                    const windowNames = item.timepointWindowIds
                      .map((windowId) => timepointWindows.find((window) => window.id === windowId))
                      .filter((window): window is TimepointWindowDraft => Boolean(window))
                      .map((window) => ({
                        id: window.id,
                        name: window.name.trim(),
                        range: `${window.minAgeDays.trim()}-${window.maxAgeDays.trim()} days`,
                      }));

                    return {
                      experiment_template_id: saved?.templateId || "",
                      protocol_id: saved?.protocolId || null,
                      title_override: saved?.name || null,
                      notes: item.notes.trim() || null,
                      sort_order: blockIndex,
                      repeat_key: null,
                      metadata: {
                        timepointWindowIds: windowNames.map((window) => window.id),
                        timepointWindowNames: windowNames.map((window) => window.name),
                        timepointWindowRanges: windowNames.map((window) => window.range),
                      },
                    };
                  }),
                };
              }),
            };
          });

        const scheduleForm = new FormData();
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

        const createdBatteryExperiment = await createExperiment(batteryExperimentForm);
        if (!createdBatteryExperiment?.id) {
          throw new Error("Could not create the battery summary record.");
        }

        for (const window of timepointWindows) {
          const timepointForm = new FormData();
          timepointForm.set("experiment_id", createdBatteryExperiment.id);
          timepointForm.set("label", window.name.trim());
          timepointForm.set("scheduled_at", new Date().toISOString());
          timepointForm.set("notes", `${window.minAgeDays.trim()}-${window.maxAgeDays.trim()} days`);
          await createTimepoint(timepointForm);
        }

        router.refresh();
        toast.success("Battery created. You can now edit it from the one-page summary or the direct editors.");
        setBatteryName("");
        setBatteryDescription("");
        setExperimentDrafts([createEmptyExperiment()]);
        setSelectedExperimentId("");
        setTimepointWindows([createEmptyWindow()]);
        setLayoutItems([]);
        setStepIndex(0);
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
              <CardTitle className="text-xl">Guided Battery Builder</CardTitle>
              <CardDescription>
                Create a full battery step by step the first time, then use the saved summaries and direct editors later.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
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
                        onChange={(event) => updateExperiment(experiment.id, { name: event.target.value })}
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
                      {experiment.sourceMode === "extract" ? "Extract from example file" : "Manual columns"}
                    </p>
                  </button>
                ))}
              </div>

              {selectedExperiment ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={selectedExperiment.name} onChange={(event) => updateExperiment(selectedExperiment.id, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input value={selectedExperiment.category} onChange={(event) => updateExperiment(selectedExperiment.id, { category: event.target.value })} placeholder="Behavior" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Experiment Details</Label>
                      <Textarea value={selectedExperiment.description} onChange={(event) => updateExperiment(selectedExperiment.id, { description: event.target.value })} rows={4} placeholder="Add the details someone needs for this single experiment." />
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
                        No protocol linked yet. If you leave this empty, BPAN will create a simple protocol automatically from the experiment name.
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
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant={selectedExperiment.sourceMode === "extract" ? "default" : "outline"} onClick={() => updateExperiment(selectedExperiment.id, { sourceMode: "extract" })}>
                        Extract from file
                      </Button>
                      <Button type="button" variant={selectedExperiment.sourceMode === "manual" ? "default" : "outline"} onClick={() => updateExperiment(selectedExperiment.id, { sourceMode: "manual" })}>
                        Build manually
                      </Button>
                      <Button type="button" variant="outline" onClick={() => addPresetColumn(selectedExperiment.id, createDoneColumn)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add done/not done
                      </Button>
                      <Button type="button" variant="outline" onClick={() => addPresetColumn(selectedExperiment.id, createFileColumn)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add file link field
                      </Button>
                      <Button type="button" variant="outline" onClick={() => addPresetColumn(selectedExperiment.id, createAverageColumn)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add average field
                      </Button>
                    </div>

                    {selectedExperiment.sourceMode === "extract" ? (
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
                                      updateExperiment(selectedExperiment.id, {
                                        extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                          columnIndex === index ? { ...column, selected: event.target.checked } : column,
                                        ),
                                      })
                                    }
                                    className="mt-1 h-4 w-4"
                                  />
                                  <div className="grid flex-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label>Label</Label>
                                      <Input
                                        value={entry.column.label}
                                        onChange={(event) =>
                                          updateExperiment(selectedExperiment.id, {
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
                                          updateExperiment(selectedExperiment.id, {
                                            extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                              columnIndex === index
                                                ? {
                                                    ...column,
                                                    column: {
                                                      ...column.column,
                                                      columnType: event.target.value as ColumnType,
                                                    },
                                                  }
                                                : column,
                                            ),
                                          })
                                        }
                                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                                      >
                                        {COLUMN_TYPE_OPTIONS.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Default Value</Label>
                                      <Input
                                        value={entry.column.defaultValue}
                                        onChange={(event) =>
                                          updateExperiment(selectedExperiment.id, {
                                            extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                              columnIndex === index
                                                ? {
                                                    ...column,
                                                    column: {
                                                      ...column.column,
                                                      defaultValue: event.target.value,
                                                    },
                                                  }
                                                : column,
                                            ),
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Options</Label>
                                      <Input
                                        value={entry.column.options.join(", ")}
                                        onChange={(event) =>
                                          updateExperiment(selectedExperiment.id, {
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
                                        placeholder={isChoiceColumnType(entry.column.columnType) ? "Comma-separated choices" : "Used for select / multi select"}
                                        disabled={!isChoiceColumnType(entry.column.columnType)}
                                      />
                                    </div>
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
                                                updateExperiment(selectedExperiment.id, {
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
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Help Text</Label>
                                    <Input
                                      value={entry.column.helpText}
                                      onChange={(event) =>
                                        updateExperiment(selectedExperiment.id, {
                                          extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                            columnIndex === index
                                              ? {
                                                  ...column,
                                                  column: {
                                                    ...column.column,
                                                    helpText: event.target.value,
                                                  },
                                                }
                                              : column,
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={entry.column.required}
                                        onChange={(event) =>
                                          updateExperiment(selectedExperiment.id, {
                                            extractedColumns: selectedExperiment.extractedColumns.map((column, columnIndex) =>
                                              columnIndex === index
                                                ? {
                                                    ...column,
                                                    column: {
                                                      ...column.column,
                                                      required: event.target.checked,
                                                    },
                                                  }
                                                : column,
                                            ),
                                          })
                                        }
                                      />
                                      Required
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Extra fields to add on top</p>
                            <p className="text-sm text-slate-500">
                              Use this for BPAN-only fields like file uploads, completion checkboxes, or notes that are not in the sample file.
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
                                  <Label>Key</Label>
                                  <Input value={column.key} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { key: slugifyKey(event.target.value) })} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Type</Label>
                                  <select
                                    value={column.columnType}
                                    onChange={(event) => updateManualColumn(selectedExperiment.id, index, { columnType: event.target.value as ColumnType })}
                                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                                  >
                                    {COLUMN_TYPE_OPTIONS.map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-end">
                                  <Button type="button" variant="outline" onClick={() => removeManualColumn(selectedExperiment.id, index)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                  <Label>Default Value</Label>
                                  <Input value={column.defaultValue} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { defaultValue: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Options</Label>
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
                                    placeholder={isChoiceColumnType(column.columnType) ? "Comma-separated choices" : "Used for select / multi select"}
                                    disabled={!isChoiceColumnType(column.columnType)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Group Key</Label>
                                  <Input value={column.groupKey} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { groupKey: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Help Text</Label>
                                  <Input value={column.helpText} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { helpText: event.target.value })} />
                                </div>
                              </div>
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
                              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={column.required} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { required: event.target.checked })} />
                                  Required
                                </label>
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={column.isEnabled} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { isEnabled: event.target.checked })} />
                                  Enabled
                                </label>
                              </div>
                            </div>
                          ))}
                          <Button type="button" variant="outline" onClick={() => addManualColumn(selectedExperiment.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add extra field
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedExperiment.manualColumns.map((column, index) => (
                          <div key={`${column.key}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="space-y-2">
                                <Label>Label</Label>
                                <Input value={column.label} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { label: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label>Key</Label>
                                <Input value={column.key} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { key: slugifyKey(event.target.value) })} />
                              </div>
                              <div className="space-y-2">
                                <Label>Type</Label>
                                <select
                                  value={column.columnType}
                                  onChange={(event) => updateManualColumn(selectedExperiment.id, index, { columnType: event.target.value as ColumnType })}
                                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none"
                                >
                                  {COLUMN_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-end">
                                <Button type="button" variant="outline" onClick={() => removeManualColumn(selectedExperiment.id, index)} disabled={selectedExperiment.manualColumns.length === 1}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="space-y-2">
                                <Label>Default Value</Label>
                                <Input value={column.defaultValue} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { defaultValue: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label>Options</Label>
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
                                  placeholder={isChoiceColumnType(column.columnType) ? "Comma-separated choices" : "Used for select / multi select"}
                                  disabled={!isChoiceColumnType(column.columnType)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Group Key</Label>
                                <Input value={column.groupKey} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { groupKey: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label>Help Text</Label>
                                <Input value={column.helpText} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { helpText: event.target.value })} />
                              </div>
                            </div>
                            {column.averageSourceKeys.length > 0 || column.groupKey === "derived" ? (
                              <div className="mt-3 space-y-2">
                                <Label>Average these numeric fields</Label>
                                <div className="flex flex-wrap gap-2">
                                  {selectedExperiment.manualColumns
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
                            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                              <label className="flex items-center gap-2">
                                <input type="checkbox" checked={column.required} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { required: event.target.checked })} />
                                Required
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="checkbox" checked={column.isEnabled} onChange={(event) => updateManualColumn(selectedExperiment.id, index, { isEnabled: event.target.checked })} />
                                Enabled
                              </label>
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" onClick={() => addManualColumn(selectedExperiment.id)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add column
                        </Button>
                      </div>
                    )}
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
                    <Button type="button" variant="outline" size="sm" onClick={() => setTimepointWindows((current) => current.filter((item) => item.id !== window.id))} disabled={timepointWindows.length === 1}>
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
              <Button type="button" variant="outline" onClick={() => setTimepointWindows((current) => [...current, createEmptyWindow()])}>
                <Plus className="mr-2 h-4 w-4" />
                Add timepoint window
              </Button>
            </section>
          ) : null}

          {currentStep.key === "layout" ? (
            <section className="space-y-4">
              {layoutItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm text-slate-600">Add the first battery item to place an experiment into a day and time window.</p>
                </div>
              ) : null}

              {layoutItems.map((item, index) => (
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
                    <Label>Timepoint Windows</Label>
                    <div className="flex flex-wrap gap-2">
                      {timepointWindows.map((window) => {
                        const selected = item.timepointWindowIds.includes(window.id);
                        return (
                          <button
                            key={window.id}
                            type="button"
                            onClick={() =>
                              setLayoutItems((current) =>
                                current.map((entry) =>
                                  entry.id === item.id
                                    ? {
                                        ...entry,
                                        timepointWindowIds: selected
                                          ? entry.timepointWindowIds.filter((windowId) => windowId !== window.id)
                                          : [...entry.timepointWindowIds, window.id],
                                      }
                                    : entry,
                                ),
                              )
                            }
                            className={`rounded-full border px-3 py-1 text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                          >
                            {window.name || "Untitled window"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={item.notes} onChange={(event) => setLayoutItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry))} rows={2} placeholder="Optional notes for this battery item." />
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={() => setLayoutItems((current) => [...current, createEmptyLayoutItem(experimentDrafts[0]?.id || "", timepointWindows[0]?.id ? [timepointWindows[0].id] : [])])}>
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
                        experiment.sourceMode === "extract"
                          ? experiment.extractedColumns.filter((column) => column.selected).length
                          : experiment.manualColumns.length;
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
                  <CardHeader><CardTitle className="text-base">Battery Items</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {layoutItems.map((item) => {
                      const experiment = experimentDrafts.find((entry) => entry.id === item.experimentId);
                      const windows = item.timepointWindowIds
                        .map((windowId) => timepointWindows.find((window) => window.id === windowId)?.name)
                        .filter((value): value is string => Boolean(value));

                      return (
                        <div key={item.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                          <p className="font-semibold text-slate-900">Day {item.dayIndex} • {slotLabel(item)}</p>
                          <p className="text-sm text-slate-700">{experiment?.name || "Choose experiment"}</p>
                          <p className="text-xs text-slate-600">{windows.join(", ") || "No windows selected"}</p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                Saving will create reusable single-experiment definitions, save the battery layout, and create a linked battery summary record with named timepoint windows.
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStepIndex((current) => Math.max(current - 1, 0))} disabled={stepIndex === 0 || isPending}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {onOpenDirectEditors ? (
                <Button type="button" variant="ghost" onClick={onOpenDirectEditors} disabled={isPending}>
                  Open direct editors
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              {currentStep.key === "review" ? (
                <Button type="button" onClick={saveBattery} disabled={isPending || !canMoveNext}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save battery
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

      <BatteryOverview records={batteryRecords} protocols={protocols} templates={templates} />
    </div>
  );
}
