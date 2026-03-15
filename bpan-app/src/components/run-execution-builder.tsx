"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  Animal,
  Cohort,
  ExperimentRun,
  PlatformAssignmentScope,
  PlatformRunStatus,
  PlatformSlotKind,
  Protocol,
  RunAssignment,
  RunScheduleBlock,
  ScheduleDay,
  ScheduledBlock,
  ScheduleSlot,
  ScheduleTemplate,
} from "@/types";
import type { ExperimentTemplateRecord } from "@/components/experiment-template-builder";
import {
  cloneExperimentRun,
  createExperimentRunFromTemplate,
  resetRunToTemplateSchedule,
  saveRunAssignment,
  saveRunScheduleBlocks,
  updateExperimentRunNotes,
  updateExperimentRunStatus,
} from "@/app/(protected)/experiments/run-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Copy,
  GripVertical,
  Layers2,
  Play,
  RefreshCcw,
  Save,
  Shuffle,
} from "lucide-react";

type EditableRunBlock = Omit<RunScheduleBlock, "metadata"> & {
  metadata: Record<string, unknown>;
};

type AssignmentDraft = {
  scope_type: PlatformAssignmentScope;
  study_id: string;
  cohort_id: string;
  animal_id: string;
};

type ConflictEntry = {
  key: string;
  day_index: number;
  slot_kind: PlatformSlotKind;
  scheduled_time: string | null;
  blockIds: string[];
  reason: string;
  severity: "warning" | "critical";
};

type SourceBlockSnapshot = {
  day_index: number;
  slot_kind: PlatformSlotKind;
  slot_label: string | null;
  scheduled_time: string | null;
  experiment_template_id: string | null;
  protocol_id: string | null;
  title: string;
  notes: string | null;
};

const RUN_STATUS_OPTIONS: PlatformRunStatus[] = [
  "draft",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
];

const QUICK_STATUS_OPTIONS: PlatformRunStatus[] = ["draft", "planned", "in_progress", "completed"];

const SLOT_KIND_OPTIONS: PlatformSlotKind[] = [
  "am",
  "pm",
  "midday",
  "evening",
  "custom",
  "exact_time",
];

let localBlockCounter = 0;
function localBlockId() {
  localBlockCounter += 1;
  return `local-run-block-${localBlockCounter}`;
}

interface Props {
  experimentTemplates: ExperimentTemplateRecord[];
  scheduleTemplates: ScheduleTemplate[];
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
  runs: ExperimentRun[];
  runScheduleBlocks: RunScheduleBlock[];
  runAssignments: RunAssignment[];
  protocols: Protocol[];
  cohorts: Cohort[];
  animals: Animal[];
  persistenceEnabled: boolean;
  dataWarning?: string | null;
}

function resolveInitialRunCreateSelection(
  templates: ExperimentTemplateRecord[],
  schedules: ScheduleTemplate[],
) {
  const firstTemplateId = templates[0]?.id || "";
  if (!firstTemplateId) {
    return { templateId: "", scheduleTemplateId: "" };
  }

  const firstTemplateWithSchedule =
    templates.find((template) =>
      schedules.some((schedule) => schedule.template_id === template.id && schedule.is_active),
    ) || templates[0];

  const selectedSchedule =
    schedules.find((schedule) => schedule.template_id === firstTemplateWithSchedule.id && schedule.is_active) ||
    schedules.find((schedule) => schedule.template_id === firstTemplateWithSchedule.id) ||
    null;

  return {
    templateId: firstTemplateWithSchedule.id,
    scheduleTemplateId: selectedSchedule?.id || "",
  };
}

function slotKindLabel(slotKind: PlatformSlotKind) {
  switch (slotKind) {
    case "am":
      return "AM";
    case "pm":
      return "PM";
    case "midday":
      return "Midday";
    case "evening":
      return "Evening";
    case "custom":
      return "Custom";
    case "exact_time":
      return "Exact Time";
    default:
      return slotKind;
  }
}

function getAssignmentDraft(assignment: RunAssignment | undefined): AssignmentDraft {
  if (!assignment) {
    return {
      scope_type: "study",
      study_id: "",
      cohort_id: "",
      animal_id: "",
    };
  }

  return {
    scope_type: assignment.scope_type,
    study_id: assignment.study_id || "",
    cohort_id: assignment.cohort_id || "",
    animal_id: assignment.animal_id || "",
  };
}

function normalizeRunBlocks(blocks: EditableRunBlock[]) {
  const sorted = [...blocks].sort((a, b) => {
    if (a.day_index !== b.day_index) return a.day_index - b.day_index;
    return a.sort_order - b.sort_order;
  });

  let currentDay = -1;
  let daySort = 0;
  return sorted.map((block) => {
    if (block.day_index !== currentDay) {
      currentDay = block.day_index;
      daySort = 0;
    }
    const next = { ...block, sort_order: daySort };
    daySort += 1;
    return next;
  });
}

function normalizeSlotLabelForKind(slotKind: PlatformSlotKind, value: string | null) {
  if (slotKind === "custom") return value && value.trim() ? value.trim() : "Custom";
  if (slotKind === "exact_time") return value && value.trim() ? value.trim() : "Exact Time";
  return null;
}

function snapToNearestMonday(isoDate: string) {
  if (!isoDate) {
    return "";
  }

  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  const weekday = date.getDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const daysUntilMonday = weekday === 0 ? 1 : 8 - weekday;

  if (daysSinceMonday <= daysUntilMonday) {
    date.setDate(date.getDate() - daysSinceMonday);
  } else {
    date.setDate(date.getDate() + daysUntilMonday);
  }

  return date.toISOString().slice(0, 10);
}

export function RunExecutionBuilder({
  experimentTemplates,
  scheduleTemplates,
  scheduleDays,
  scheduleSlots,
  scheduledBlocks,
  runs,
  runScheduleBlocks,
  runAssignments,
  protocols,
  cohorts,
  animals,
  persistenceEnabled,
  dataWarning = null,
}: Props) {
  const initialCreateSelection = resolveInitialRunCreateSelection(experimentTemplates, scheduleTemplates);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | "create"
    | "save_timeline"
    | "save_assignment"
    | "status"
    | "reset"
    | "clone"
    | "save_notes"
    | null
  >(null);

  const [createDraft, setCreateDraft] = useState({
    template_id: initialCreateSelection.templateId,
    schedule_template_id: initialCreateSelection.scheduleTemplateId,
    name: "",
    description: "",
    selected_protocol_id: "",
    status: "planned" as PlatformRunStatus,
    start_anchor_date: "",
    start_alignment: "exact" as "exact" | "nearest_monday",
    assignment: {
      scope_type: "study" as PlatformAssignmentScope,
      study_id: "",
      cohort_id: "",
      animal_id: "",
    },
  });

  const [selectedRunId, setSelectedRunId] = useState<string>(runs[0]?.id || "");
  const [runBlocksDraftByRunId, setRunBlocksDraftByRunId] = useState<Record<string, EditableRunBlock[]>>({});
  const [assignmentDraftByRunId, setAssignmentDraftByRunId] = useState<Record<string, AssignmentDraft>>({});
  const [notesDraftByRunId, setNotesDraftByRunId] = useState<Record<string, string>>({});
  const [dayShiftOffset, setDayShiftOffset] = useState<string>("1");
  const [optimisticRuns, setOptimisticRuns] = useState<ExperimentRun[]>([]);

  useEffect(() => {
    setOptimisticRuns((current) =>
      current.filter((optimisticRun) => !runs.some((persistedRun) => persistedRun.id === optimisticRun.id)),
    );
  }, [runs]);

  const protocolTitleById = useMemo(
    () => new Map(protocols.map((protocol) => [protocol.id, protocol.title])),
    [protocols],
  );
  const templateById = useMemo(
    () => new Map(experimentTemplates.map((template) => [template.id, template])),
    [experimentTemplates],
  );

  const sourceBlockSnapshotById = useMemo(() => {
    const slotById = new Map(scheduleSlots.map((slot) => [slot.id, slot]));
    const dayById = new Map(scheduleDays.map((day) => [day.id, day]));
    const map = new Map<string, SourceBlockSnapshot>();

    for (const sourceBlock of scheduledBlocks) {
      const slot = slotById.get(sourceBlock.schedule_slot_id);
      if (!slot) continue;
      const day = dayById.get(slot.schedule_day_id);
      if (!day) continue;

      const templateTitle = templateById.get(sourceBlock.experiment_template_id)?.title || "Untitled block";
      const title = (sourceBlock.title_override || "").trim() || templateTitle;

      map.set(sourceBlock.id, {
        day_index: day.day_index,
        slot_kind: slot.slot_kind,
        slot_label: slot.label,
        scheduled_time: slot.start_time,
        experiment_template_id: sourceBlock.experiment_template_id,
        protocol_id: sourceBlock.protocol_id,
        title,
        notes: sourceBlock.notes,
      });
    }

    return map;
  }, [scheduledBlocks, scheduleDays, scheduleSlots, templateById]);

  const visibleRuns = useMemo(() => {
    const merged = [...optimisticRuns, ...runs];
    const byId = new Map<string, ExperimentRun>();
    for (const run of merged) {
      if (!byId.has(run.id)) {
        byId.set(run.id, run);
      }
    }
    return Array.from(byId.values());
  }, [optimisticRuns, runs]);

  const selectedRun = visibleRuns.find((run) => run.id === selectedRunId) || null;
  const selectedRunTemplate =
    selectedRun?.template_id ? templateById.get(selectedRun.template_id) || null : null;
  const selectedRunBlocks =
    runBlocksDraftByRunId[selectedRunId] ||
    normalizeRunBlocks(
      runScheduleBlocks
        .filter((block) => block.experiment_run_id === selectedRunId)
        .map((block) => ({
          ...block,
          metadata:
            block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
              ? block.metadata
              : {},
        })),
    );
  const persistedSelectedRunBlocks = normalizeRunBlocks(
    runScheduleBlocks
      .filter((block) => block.experiment_run_id === selectedRunId)
      .map((block) => ({
        ...block,
        metadata:
          block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
            ? block.metadata
            : {},
      })),
  );

  const selectedAssignment =
    assignmentDraftByRunId[selectedRunId] ||
    getAssignmentDraft(runAssignments.find((assignment) => assignment.experiment_run_id === selectedRunId));
  const persistedSelectedAssignment = getAssignmentDraft(
    runAssignments.find((assignment) => assignment.experiment_run_id === selectedRunId),
  );
  const selectedRunNotes = notesDraftByRunId[selectedRunId] ?? selectedRun?.notes ?? "";

  const filteredSchedules = scheduleTemplates.filter(
    (schedule) => schedule.template_id === createDraft.template_id,
  );
  const selectedCreateSchedule =
    filteredSchedules.find((schedule) => schedule.id === createDraft.schedule_template_id) || null;
  const selectedTemplate = templateById.get(createDraft.template_id);
  const selectedCreateScheduleBlockCount = useMemo(() => {
    if (!selectedCreateSchedule) return 0;
    const dayIds = scheduleDays
      .filter((day) => day.schedule_template_id === selectedCreateSchedule.id)
      .map((day) => day.id);
    if (dayIds.length === 0) return 0;
    const slotIds = scheduleSlots.filter((slot) => dayIds.includes(slot.schedule_day_id)).map((slot) => slot.id);
    if (slotIds.length === 0) return 0;
    return scheduledBlocks.filter((block) => slotIds.includes(block.schedule_slot_id)).length;
  }, [scheduleDays, scheduleSlots, scheduledBlocks, selectedCreateSchedule]);

  const blocksByDay = useMemo(() => {
    const days = [...new Set(selectedRunBlocks.map((block) => block.day_index))].sort((a, b) => a - b);
    return days.map((dayIndex) => ({
      day_index: dayIndex,
      blocks: selectedRunBlocks
        .filter((block) => block.day_index === dayIndex)
        .sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [selectedRunBlocks]);

  const runComparisonRows = useMemo(() => {
    return visibleRuns.map((run) => {
      const blocks = runScheduleBlocks.filter((block) => block.experiment_run_id === run.id);
      const completed = blocks.filter((block) => block.status === "completed").length;
      const inProgress = blocks.filter((block) => block.status === "in_progress").length;
      const planned = blocks.filter((block) => block.status === "planned").length;
      const draft = blocks.filter((block) => block.status === "draft").length;
      const total = blocks.length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        run,
        total,
        completed,
        inProgress,
        planned,
        draft,
        progress,
      };
    });
  }, [visibleRuns, runScheduleBlocks]);

  const conflicts = useMemo<ConflictEntry[]>(() => {
    const list: ConflictEntry[] = [];
    const slotBuckets = new Map<string, EditableRunBlock[]>();
    for (const block of selectedRunBlocks) {
      const key = `${block.day_index}|${block.slot_kind}|${block.scheduled_time || ""}`;
      const existing = slotBuckets.get(key) || [];
      slotBuckets.set(key, [...existing, block]);
    }

    for (const [key, blocks] of slotBuckets.entries()) {
      if (blocks.length > 1 && blocks[0].slot_kind === "exact_time") {
        list.push({
          key,
          day_index: blocks[0].day_index,
          slot_kind: blocks[0].slot_kind,
          scheduled_time: blocks[0].scheduled_time || null,
          blockIds: blocks.map((block) => block.id),
          reason: "Multiple blocks share the same exact-time slot.",
          severity: "critical",
        });
      }
    }

    for (const block of selectedRunBlocks) {
      if (block.slot_kind === "exact_time" && !block.scheduled_time) {
        list.push({
          key: `missing-time-${block.id}`,
          day_index: block.day_index,
          slot_kind: block.slot_kind,
          scheduled_time: null,
          blockIds: [block.id],
          reason: "Exact-time block is missing a scheduled time.",
          severity: "critical",
        });
      }
      if (block.slot_kind === "custom" && !block.slot_label?.trim()) {
        list.push({
          key: `missing-label-${block.id}`,
          day_index: block.day_index,
          slot_kind: block.slot_kind,
          scheduled_time: null,
          blockIds: [block.id],
          reason: "Custom slot is missing a label.",
          severity: "warning",
        });
      }
    }

    return list;
  }, [selectedRunBlocks]);
  const criticalConflicts = conflicts.filter((conflict) => conflict.severity === "critical");
  const warningConflicts = conflicts.filter((conflict) => conflict.severity === "warning");
  const conflictCountByBlockId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conflict of conflicts) {
      for (const blockId of conflict.blockIds) {
        counts.set(blockId, (counts.get(blockId) || 0) + 1);
      }
    }
    return counts;
  }, [conflicts]);

  const notesHistoryLines = useMemo(() => {
    return (selectedRun?.notes || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\[\d{4}-\d{2}-\d{2}T/.test(line));
  }, [selectedRun?.notes]);

  const updateRunBlocksDraft = (next: EditableRunBlock[]) => {
    setRunBlocksDraftByRunId((current) => ({
      ...current,
      [selectedRunId]: normalizeRunBlocks(next),
    }));
  };

  const serializeBlocks = (blocks: EditableRunBlock[]) =>
    blocks.map((block) => ({
      id: block.id,
      day_index: block.day_index,
      slot_kind: block.slot_kind,
      slot_label: block.slot_label || null,
      scheduled_time: block.scheduled_time || null,
      sort_order: block.sort_order,
      experiment_template_id: block.experiment_template_id || null,
      protocol_id: block.protocol_id || null,
      title: block.title,
      notes: block.notes || null,
      status: block.status,
      source_scheduled_block_id: block.source_scheduled_block_id || null,
    }));

  const timelineDirty =
    JSON.stringify(serializeBlocks(selectedRunBlocks)) !== JSON.stringify(serializeBlocks(persistedSelectedRunBlocks));
  const assignmentDirty =
    JSON.stringify(selectedAssignment) !== JSON.stringify(persistedSelectedAssignment);

  const discardUnsavedEdits = () => {
    if (!selectedRunId) return;
    setRunBlocksDraftByRunId((current) => {
      const next = { ...current };
      delete next[selectedRunId];
      return next;
    });
    setAssignmentDraftByRunId((current) => {
      const next = { ...current };
      delete next[selectedRunId];
      return next;
    });
    toast.success("Unsaved run edits discarded.");
  };

  const createRun = () => {
    if (!createDraft.template_id) {
      toast.error("Template is required.");
      return;
    }
    if (!persistenceEnabled) {
      toast.error("Run execution persistence is not available in this environment.");
      return;
    }

    setPendingAction("create");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("template_id", createDraft.template_id);
        fd.append("schedule_template_id", createDraft.schedule_template_id);
        fd.append("name", createDraft.name.trim() || `${selectedTemplate?.title || "Template"} Run`);
        fd.append("description", createDraft.description.trim());
        fd.append("selected_protocol_id", createDraft.selected_protocol_id);
        fd.append("status", createDraft.status);
        fd.append(
          "start_anchor_date",
          createDraft.start_alignment === "nearest_monday"
            ? snapToNearestMonday(createDraft.start_anchor_date)
            : createDraft.start_anchor_date,
        );
        fd.append(
          "assignment",
          JSON.stringify({
            scope_type: createDraft.assignment.scope_type,
            study_id: createDraft.assignment.scope_type === "study" ? createDraft.assignment.study_id || null : null,
            cohort_id: createDraft.assignment.scope_type === "cohort" ? createDraft.assignment.cohort_id || null : null,
            animal_id: createDraft.assignment.scope_type === "animal" ? createDraft.assignment.animal_id || null : null,
          }),
        );

        const result = await createExperimentRunFromTemplate(fd);
        if (!result?.run_id || !result?.run) {
          throw new Error("Run was not created. Please retry.");
        }
        setOptimisticRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run_id)]);
        setSelectedRunId(result.run_id);
        setCreateDraft((current) => ({
          ...current,
          name: "",
          description: "",
          start_anchor_date: "",
          start_alignment: "exact",
        }));
        toast.success(
          createDraft.schedule_template_id
            ? `Run created from template schedule (ID: ${result.run_id}).`
            : `Run created without a linked schedule (ID: ${result.run_id}).`,
        );
        router.refresh();
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Unknown error.";
        toast.error(`Create run failed: ${message}`);
      } finally {
        setPendingAction(null);
      }
    });
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    const index = selectedRunBlocks.findIndex((block) => block.id === blockId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= selectedRunBlocks.length) {
      return;
    }
    const next = [...selectedRunBlocks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    updateRunBlocksDraft(next);
  };

  const insertDraggedBefore = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = selectedRunBlocks.findIndex((block) => block.id === sourceId);
    const targetIndex = selectedRunBlocks.findIndex((block) => block.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...selectedRunBlocks];
    const [moved] = next.splice(sourceIndex, 1);
    const nextTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    next.splice(nextTargetIndex, 0, moved);
    updateRunBlocksDraft(next);
  };

  const updateBlock = (blockId: string, patch: Partial<EditableRunBlock>) => {
    updateRunBlocksDraft(
      selectedRunBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              ...patch,
            }
          : block,
      ),
    );
  };

  const duplicateBlock = (blockId: string) => {
    const index = selectedRunBlocks.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    const source = selectedRunBlocks[index];
    const copy: EditableRunBlock = {
      ...source,
      id: localBlockId(),
      source_scheduled_block_id: source.source_scheduled_block_id,
      status: "planned",
    };
    const next = [...selectedRunBlocks];
    next.splice(index + 1, 0, copy);
    updateRunBlocksDraft(next);
    toast.info("Block duplicated. Save timeline to persist, or discard unsaved edits to undo.");
  };

  const duplicateDaySegment = (dayIndex: number) => {
    const dayBlocks = selectedRunBlocks.filter((block) => block.day_index === dayIndex);
    if (dayBlocks.length === 0) return;
    const maxDay = Math.max(...selectedRunBlocks.map((block) => block.day_index), 0);
    const nextDay = maxDay + 1;
    const copies = dayBlocks.map((block) => ({
      ...block,
      id: localBlockId(),
      day_index: nextDay,
      status: "planned" as PlatformRunStatus,
    }));
    updateRunBlocksDraft([...selectedRunBlocks, ...copies]);
    toast.info("Day segment duplicated to a new day. Save timeline to persist, or discard unsaved edits to undo.");
  };

  const isRunOverride = (block: EditableRunBlock) => {
    if (!block.source_scheduled_block_id) return true;
    const source = sourceBlockSnapshotById.get(block.source_scheduled_block_id);
    if (!source) return true;
    if (block.day_index !== source.day_index) return true;
    if (block.slot_kind !== source.slot_kind) return true;
    if ((block.slot_label || null) !== normalizeSlotLabelForKind(source.slot_kind, source.slot_label)) return true;
    if ((block.scheduled_time || null) !== (source.scheduled_time || null)) return true;
    if ((block.experiment_template_id || null) !== (source.experiment_template_id || null)) return true;
    if ((block.protocol_id || null) !== (source.protocol_id || null)) return true;
    if (block.title.trim() !== source.title.trim()) return true;
    if ((block.notes || "").trim() !== (source.notes || "").trim()) return true;
    if (block.status !== "planned") return true;
    return false;
  };

  const saveBlocks = () => {
    if (!selectedRunId) return;

    setPendingAction("save_timeline");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("run_id", selectedRunId);
        fd.append(
          "blocks",
          JSON.stringify(
            selectedRunBlocks.map((block) => ({
              day_index: block.day_index,
              slot_kind: block.slot_kind,
              slot_label:
                block.slot_kind === "custom" || block.slot_kind === "exact_time"
                  ? normalizeSlotLabelForKind(block.slot_kind, block.slot_label)
                  : null,
              scheduled_time: block.slot_kind === "exact_time" ? block.scheduled_time : null,
              sort_order: block.sort_order,
              experiment_template_id: block.experiment_template_id,
              protocol_id: block.protocol_id,
              title: block.title,
              notes: block.notes,
              status: block.status,
              metadata: block.metadata,
              source_scheduled_block_id: block.source_scheduled_block_id,
            })),
          ),
        );
        await saveRunScheduleBlocks(fd);
        router.refresh();
        toast.success(`Run timeline saved (${selectedRunBlocks.length} blocks).`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save run timeline.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const saveAssignmentForRun = () => {
    if (!selectedRunId) return;
    const assignment = assignmentDraftByRunId[selectedRunId] || selectedAssignment;

    setPendingAction("save_assignment");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("run_id", selectedRunId);
        fd.append(
          "assignment",
          JSON.stringify({
            scope_type: assignment.scope_type,
            study_id: assignment.scope_type === "study" ? assignment.study_id || null : null,
            cohort_id: assignment.scope_type === "cohort" ? assignment.cohort_id || null : null,
            animal_id: assignment.scope_type === "animal" ? assignment.animal_id || null : null,
          }),
        );
        await saveRunAssignment(fd);
        router.refresh();
        toast.success("Run assignment saved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save run assignment.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const saveRunNotes = () => {
    if (!selectedRunId) return;
    setPendingAction("save_notes");
    startTransition(async () => {
      try {
        await updateExperimentRunNotes(selectedRunId, selectedRunNotes);
        router.refresh();
        toast.success("Run notes saved. History entry added.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save run notes.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const cloneRun = (runId: string) => {
    const ok = window.confirm(
      "Clone this run with its schedule blocks and assignments? The clone starts in draft status.",
    );
    if (!ok) return;
    setPendingAction("clone");
    startTransition(async () => {
      try {
        const result = await cloneExperimentRun(runId);
        setSelectedRunId(result.run_id);
        router.refresh();
        toast.success("Run cloned.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to clone run.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const shiftAllBlocksByOffset = () => {
    const offset = Number(dayShiftOffset);
    if (!Number.isFinite(offset) || offset === 0) {
      toast.error("Enter a non-zero day offset.");
      return;
    }

    const next = selectedRunBlocks.map((block) => ({
      ...block,
      day_index: Math.max(1, block.day_index + offset),
    }));
    updateRunBlocksDraft(next);
    toast.info(
      `Shifted all blocks by ${offset > 0 ? "+" : ""}${offset} day(s). Save timeline to persist, or discard unsaved changes to undo.`,
    );
  };

  const setRunStatus = (status: PlatformRunStatus) => {
    if (!selectedRunId) return;
    if (selectedRun?.status === status) return;

    const movingToCompleted = status === "completed";
    const leavingCompleted = selectedRun?.status === "completed" && status !== "completed";
    if (movingToCompleted) {
      const ok = window.confirm(
        "Mark this run as completed? You can still reopen it later if needed.",
      );
      if (!ok) return;
    }
    if (leavingCompleted) {
      const ok = window.confirm(
        "This run is completed. Move it back to an active state?",
      );
      if (!ok) return;
    }

    setPendingAction("status");
    startTransition(async () => {
      try {
        await updateExperimentRunStatus(selectedRunId, status);
        router.refresh();
        toast.success(`Run moved to ${status}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update run status.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const resetRunSchedule = () => {
    if (!selectedRunId) return;
    if (!selectedRun?.schedule_template_id) {
      toast.error("This run has no schedule template link to reset from.");
      return;
    }
    const ok = window.confirm(
      "Reset this run timeline back to template defaults? Current run-level overrides will be replaced.",
    );
    if (!ok) return;

    setPendingAction("reset");
    startTransition(async () => {
      try {
        await resetRunToTemplateSchedule(selectedRunId);
        setRunBlocksDraftByRunId((current) => {
          const next = { ...current };
          delete next[selectedRunId];
          return next;
        });
        router.refresh();
        toast.success("Run timeline reset to template schedule.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reset run timeline.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const assignmentLabel = (runId: string) => {
    const assignment = runAssignments.find((item) => item.experiment_run_id === runId);
    if (!assignment) return "No assignment";
    if (assignment.scope_type === "study") return `Study ${assignment.study_id}`;
    if (assignment.scope_type === "cohort") return `Cohort ${assignment.cohort_id}`;
    return `Animal ${assignment.animal_id}`;
  };

  const goToCreateDatasetFromRun = () => {
    if (!selectedRun) return;

    const params = new URLSearchParams();
    params.set("tab", "data");
    params.set("open_import", "1");
    params.set("prefill_run_id", selectedRun.id);
    params.set("prefill_dataset_name", `${selectedRun.name} Results`);
    if (selectedRun.description) {
      params.set("prefill_dataset_description", selectedRun.description);
    } else if (selectedRunTemplate?.title) {
      params.set("prefill_dataset_description", `Derived from template: ${selectedRunTemplate.title}`);
    }
    if (selectedRun.legacy_experiment_id) {
      params.set("prefill_experiment_id", selectedRun.legacy_experiment_id);
    }
    params.set("prefill_starter_analyses", "1");

    router.push(`/results?${params.toString()}`);
  };

  const hasDraftEdits = timelineDirty || assignmentDirty;

  return (
    <div className="space-y-6">
      <details className="group rounded-lg border bg-card/50">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          <span>Multi-Run Comparison</span>
          <span className="text-xs text-muted-foreground">
            {runComparisonRows.length} run{runComparisonRows.length === 1 ? "" : "s"} ▾
          </span>
        </summary>
        <div className="px-4 pb-4">
          <div className="overflow-x-auto rounded-lg border">
            <div className="grid grid-cols-[minmax(180px,2fr)_120px_120px_120px_120px_120px] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Run</span>
              <span>Status</span>
              <span>Progress</span>
              <span>Completed</span>
              <span>In Progress</span>
              <span>Total</span>
            </div>
            {runComparisonRows.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              runComparisonRows.map((row) => (
                <button
                  key={row.run.id}
                  type="button"
                  onClick={() => setSelectedRunId(row.run.id)}
                  className={cn(
                    "grid w-full grid-cols-[minmax(180px,2fr)_120px_120px_120px_120px_120px] items-center border-b px-3 py-2 text-left text-sm",
                    row.run.id === selectedRunId ? "bg-primary/5" : "hover:bg-muted/20",
                  )}
                >
                  <span className="truncate">{row.run.name}</span>
                  <span>{row.run.status}</span>
                  <span>{row.progress}%</span>
                  <span>{row.completed}</span>
                  <span>{row.inProgress}</span>
                  <span>{row.total}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </details>

      <Card className={cn("border-dashed", !persistenceEnabled && "border-amber-300 bg-amber-50/50")}>
        <CardHeader>
          <CardTitle className="text-base">Create Run From Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Template</p>
              <select
                value={createDraft.template_id}
                onChange={(event) =>
                  {
                    const nextTemplateId = event.target.value;
                    const nextSchedule =
                      scheduleTemplates.find(
                        (schedule) => schedule.template_id === nextTemplateId && schedule.is_active,
                      ) ||
                      scheduleTemplates.find((schedule) => schedule.template_id === nextTemplateId) ||
                      null;
                  setCreateDraft((current) => ({
                    ...current,
                    template_id: nextTemplateId,
                    schedule_template_id: nextSchedule?.id || "",
                    selected_protocol_id: "",
                  }));
                  }
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select template</option>
                {experimentTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Saved Schedule</p>
              <select
                value={createDraft.schedule_template_id}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, schedule_template_id: event.target.value }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select schedule</option>
                {filteredSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </option>
                ))}
              </select>
              {filteredSchedules.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No saved schedule yet for this template. Run creation will still work, but timeline blocks start empty.
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Protocol Override</p>
              <select
                value={createDraft.selected_protocol_id}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, selected_protocol_id: event.target.value }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Use template defaults</option>
                {(selectedTemplate?.protocolLinks || []).map((link) => (
                  <option key={link.protocolId} value={link.protocolId}>
                    {protocolTitleById.get(link.protocolId) || link.protocolId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              value={createDraft.name}
              onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Run name"
            />
            <Input
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Description"
            />
            <Input
              type="date"
              value={createDraft.start_anchor_date}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, start_anchor_date: event.target.value }))
              }
            />
            <select
              value={createDraft.start_alignment}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  start_alignment: event.target.value as "exact" | "nearest_monday",
                }))
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="exact">Start on exact selected day</option>
              <option value="nearest_monday">Snap day 1 to nearest Monday</option>
            </select>
            <select
              value={createDraft.status}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, status: event.target.value as PlatformRunStatus }))
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {RUN_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            The Monday option is optional. When selected, day 1 moves to the closer Monday before or after the target-age date, so the battery stays close to the intended age while fitting a work week.
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_minmax(0,1fr)_auto]">
            <select
              value={createDraft.assignment.scope_type}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  assignment: {
                    scope_type: event.target.value as PlatformAssignmentScope,
                    study_id: "",
                    cohort_id: "",
                    animal_id: "",
                  },
                }))
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="study">Study</option>
              <option value="cohort">Cohort</option>
              <option value="animal">Animal</option>
            </select>

            {createDraft.assignment.scope_type === "study" ? (
              <Input
                value={createDraft.assignment.study_id}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    assignment: { ...current.assignment, study_id: event.target.value },
                  }))
                }
                placeholder="Study UUID"
              />
            ) : createDraft.assignment.scope_type === "cohort" ? (
              <select
                value={createDraft.assignment.cohort_id}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    assignment: { ...current.assignment, cohort_id: event.target.value },
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select cohort</option>
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={createDraft.assignment.animal_id}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    assignment: { ...current.assignment, animal_id: event.target.value },
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select animal</option>
                {animals.map((animal) => (
                  <option key={animal.id} value={animal.id}>
                    {animal.ear_tag || animal.id}
                  </option>
                ))}
              </select>
            )}

            <Button onClick={createRun} disabled={!persistenceEnabled || isPending} className="gap-2 w-full xl:w-auto">
              <Play className="h-4 w-4" />
              {pendingAction === "create" ? "Creating Run..." : "Create Run"}
            </Button>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="font-medium">Template/Schedule handoff:</span>{" "}
            {!createDraft.template_id
              ? "Select a template to enable run creation."
              : !selectedCreateSchedule
                ? "No saved schedule selected. Run will be created with an empty timeline that you can build in Runs."
                : `Using "${selectedCreateSchedule.name}" with ${selectedCreateScheduleBlockCount} block${selectedCreateScheduleBlockCount === 1 ? "" : "s"} preloaded into the run timeline.`}
          </div>
          <p className="text-xs text-muted-foreground">
            Run creation and timeline/assignment saves are independent. A run can be created first and refined in the timeline editor below.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              visibleRuns.map((run) => (
                <div
                  key={run.id}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    run.id === selectedRunId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30",
                  )}
                >
                  <button type="button" onClick={() => setSelectedRunId(run.id)} className="w-full text-left">
                    <p className="truncate text-sm font-medium">{run.name}</p>
                    <p className="text-xs text-muted-foreground">{assignmentLabel(run.id)}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge variant="secondary">{run.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {(runScheduleBlocks.filter((block) => block.experiment_run_id === run.id)).length} blocks
                      </span>
                    </div>
                  </button>
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => cloneRun(run.id)} disabled={isPending} className="w-full gap-1">
                      <Layers2 className="h-3.5 w-3.5" />
                      {pendingAction === "clone" ? "Cloning..." : "Clone Run"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

      <Card>
        <CardHeader className="space-y-3">
          {dataWarning ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">{dataWarning}</p>
          ) : null}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-base">
                {selectedRun ? `${selectedRun.name} Execution Timeline` : "Select a run"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={goToCreateDatasetFromRun}
                  disabled={!selectedRunId || isPending}
                  className="w-full gap-2 sm:w-auto"
                >
                  <BarChart3 className="h-4 w-4" />
                  Create Dataset from Run
                </Button>
                <Button size="sm" variant="outline" onClick={saveAssignmentForRun} disabled={!selectedRunId || isPending || !assignmentDirty} className="w-full sm:w-auto">
                  {pendingAction === "save_assignment" ? "Saving Assignment..." : "Save Assignment"}
                </Button>
                <Button size="sm" onClick={saveBlocks} disabled={!selectedRunId || isPending || !timelineDirty} className="w-full gap-2 sm:w-auto">
                  <Save className="h-4 w-4" />
                  {pendingAction === "save_timeline" ? "Saving Timeline..." : "Save Timeline"}
                </Button>
                <Button size="sm" variant="outline" onClick={saveRunNotes} disabled={!selectedRunId || isPending} className="w-full sm:w-auto">
                  {pendingAction === "save_notes" ? "Saving Notes..." : "Save Notes"}
                </Button>
              </div>
            </div>

            {selectedRun ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Run Status</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_STATUS_OPTIONS.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={selectedRun.status === status ? "default" : "outline"}
                      onClick={() => setRunStatus(status)}
                      disabled={isPending}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Current: {selectedRun.status}</Badge>
                  {timelineDirty ? <Badge variant="outline">Unsaved timeline edits</Badge> : null}
                  {assignmentDirty ? <Badge variant="outline">Unsaved assignment edits</Badge> : null}
                  {hasDraftEdits ? (
                    <Button size="sm" variant="outline" onClick={discardUnsavedEdits} disabled={isPending}>
                      Discard Unsaved Changes
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetRunSchedule}
                    disabled={!selectedRun.schedule_template_id || isPending}
                    className="gap-1"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    {pendingAction === "reset" ? "Resetting..." : "Reset Run To Template Schedule"}
                  </Button>
                </div>
                {pendingAction === "status" ? (
                  <p className="mt-1 text-xs text-muted-foreground">Updating run status...</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Duplicate and drag actions are local until you save timeline. Use discard to undo local edits quickly.
                </p>
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-4">
            {!selectedRun ? (
              <p className="text-sm text-muted-foreground">Select a run from the left to edit execution blocks.</p>
            ) : (
              <>
                {hasDraftEdits ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    You have unsaved run edits. Save timeline/assignment to persist, or discard unsaved changes to revert.
                  </div>
                ) : null}
                <div className="grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <select
                    value={selectedAssignment.scope_type}
                    onChange={(event) =>
                      setAssignmentDraftByRunId((current) => ({
                        ...current,
                        [selectedRunId]: {
                          scope_type: event.target.value as PlatformAssignmentScope,
                          study_id: "",
                          cohort_id: "",
                          animal_id: "",
                        },
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="study">Study</option>
                    <option value="cohort">Cohort</option>
                    <option value="animal">Animal</option>
                  </select>

                  {selectedAssignment.scope_type === "study" ? (
                    <Input
                      value={selectedAssignment.study_id}
                      onChange={(event) =>
                        setAssignmentDraftByRunId((current) => ({
                          ...current,
                          [selectedRunId]: { ...selectedAssignment, study_id: event.target.value },
                        }))
                      }
                      placeholder="Study UUID"
                    />
                  ) : selectedAssignment.scope_type === "cohort" ? (
                    <select
                      value={selectedAssignment.cohort_id}
                      onChange={(event) =>
                        setAssignmentDraftByRunId((current) => ({
                          ...current,
                          [selectedRunId]: { ...selectedAssignment, cohort_id: event.target.value },
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select cohort</option>
                      {cohorts.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={selectedAssignment.animal_id}
                      onChange={(event) =>
                        setAssignmentDraftByRunId((current) => ({
                          ...current,
                          [selectedRunId]: { ...selectedAssignment, animal_id: event.target.value },
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select animal</option>
                      {animals.map((animal) => (
                        <option key={animal.id} value={animal.id}>
                          {animal.ear_tag || animal.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-lg border p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Quick Shift All Blocks</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        value={dayShiftOffset}
                        onChange={(event) => setDayShiftOffset(event.target.value)}
                        className="w-28"
                      />
                      <Button size="sm" variant="outline" onClick={shiftAllBlocksByOffset} disabled={isPending || selectedRunBlocks.length === 0} className="gap-1">
                        <Shuffle className="h-3.5 w-3.5" />
                        Shift All Days
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Positive numbers push blocks later; negative numbers pull earlier (minimum Day 1).
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Run Notes & History</p>
                    <Input
                      value={selectedRunNotes}
                      onChange={(event) =>
                        setNotesDraftByRunId((current) => ({ ...current, [selectedRunId]: event.target.value }))
                      }
                      placeholder="Operational notes for this run"
                    />
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Recent History</p>
                      {notesHistoryLines.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No history entries yet.</p>
                      ) : (
                        notesHistoryLines.slice(-5).reverse().map((line) => (
                          <p key={line} className="text-xs text-muted-foreground">{line}</p>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border bg-slate-50 p-2 text-xs text-slate-700">
                  <span className="font-medium">Legend:</span> <span className="inline-block rounded bg-emerald-100 px-2 py-0.5">Template default</span> {" "}
                  <span className="inline-block rounded bg-amber-100 px-2 py-0.5">Run override</span>
                </div>

                <div className={cn("rounded-lg border p-2 text-xs", conflicts.length > 0 ? "border-red-300 bg-red-50 text-red-900" : "border-emerald-300 bg-emerald-50 text-emerald-900")}>
                  <span className="font-medium">Conflict Detection:</span>{" "}
                  {conflicts.length === 0
                    ? "No timeline conflicts detected."
                    : `${conflicts.length} conflict(s): ${criticalConflicts.length} critical, ${warningConflicts.length} warning.`}
                  {conflicts.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {conflicts.slice(0, 5).map((conflict) => (
                        <p key={conflict.key} className="flex items-start gap-1">
                          <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5", conflict.severity === "critical" ? "text-red-700" : "text-amber-700")} />
                          <span>
                          Day {conflict.day_index} {slotKindLabel(conflict.slot_kind)}
                          {conflict.scheduled_time ? ` @ ${conflict.scheduled_time}` : ""}: {conflict.reason}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {blocksByDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This run has no timeline blocks yet.
                    </p>
                  ) : (
                    blocksByDay.map((dayGroup) => (
                      <div key={`day-${dayGroup.day_index}`} className="rounded-xl border p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium">Day {dayGroup.day_index}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => duplicateDaySegment(dayGroup.day_index)} className="gap-1">
                            <Copy className="h-3.5 w-3.5" />
                            Duplicate Day Segment
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {dayGroup.blocks.map((block) => {
                            const isOverride = isRunOverride(block);

                            return (
                              <div
                                key={block.id}
                                draggable
                                onDragStart={(event: DragEvent<HTMLDivElement>) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDraggingBlockId(block.id);
                                }}
                                onDragEnd={() => {
                                  setDraggingBlockId(null);
                                  setDragOverBlockId(null);
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  setDragOverBlockId(block.id);
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (draggingBlockId) {
                                    insertDraggedBefore(draggingBlockId, block.id);
                                  }
                                  setDraggingBlockId(null);
                                  setDragOverBlockId(null);
                                }}
                                className={cn(
                                  "rounded-lg border p-3 transition-colors",
                                  isOverride ? "border-amber-300 bg-amber-50/50" : "border-emerald-300 bg-emerald-50/50",
                                  conflictCountByBlockId.get(block.id) ? "ring-2 ring-red-300/70" : "",
                                  dragOverBlockId === block.id && draggingBlockId !== block.id && "ring-2 ring-primary/40",
                                  draggingBlockId === block.id && "opacity-70",
                                )}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <GripVertical className="h-3.5 w-3.5" />
                                    <Badge variant="outline">{slotKindLabel(block.slot_kind)}</Badge>
                                    <Badge className={isOverride ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}>
                                      {isOverride ? "Run override" : "Template default"}
                                    </Badge>
                                    {conflictCountByBlockId.get(block.id) ? (
                                      <Badge className="bg-red-100 text-red-900">
                                        {conflictCountByBlockId.get(block.id)} conflict
                                        {(conflictCountByBlockId.get(block.id) || 0) > 1 ? "s" : ""}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" onClick={() => moveBlock(block.id, -1)} title="Move up">
                                      <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={() => moveBlock(block.id, 1)} title="Move down">
                                      <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={() => duplicateBlock(block.id)} title="Duplicate block">
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={block.day_index}
                                    onChange={(event) =>
                                      updateBlock(block.id, { day_index: Math.max(1, Number(event.target.value) || 1) })
                                    }
                                  />
                                  <select
                                    value={block.slot_kind}
                                    onChange={(event) =>
                                      updateBlock(block.id, { slot_kind: event.target.value as PlatformSlotKind })
                                    }
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  >
                                    {SLOT_KIND_OPTIONS.map((slotKind) => (
                                      <option key={slotKind} value={slotKind}>
                                        {slotKindLabel(slotKind)}
                                      </option>
                                    ))}
                                  </select>
                                  <Input
                                    type={block.slot_kind === "exact_time" ? "time" : "text"}
                                    value={block.slot_kind === "exact_time" ? block.scheduled_time || "" : block.slot_label || ""}
                                    onChange={(event) =>
                                      block.slot_kind === "exact_time"
                                        ? updateBlock(block.id, { scheduled_time: event.target.value || null })
                                        : updateBlock(block.id, { slot_label: event.target.value || null })
                                    }
                                    placeholder={block.slot_kind === "exact_time" ? "Exact time" : "Slot label"}
                                  />
                                  <select
                                    value={block.status}
                                    onChange={(event) =>
                                      updateBlock(block.id, { status: event.target.value as PlatformRunStatus })
                                    }
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  >
                                    {RUN_STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <Input
                                    value={block.title}
                                    onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                                    placeholder="Block title"
                                  />
                                  <Input
                                    value={block.notes || ""}
                                    onChange={(event) => updateBlock(block.id, { notes: event.target.value || null })}
                                    placeholder="Block notes"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
