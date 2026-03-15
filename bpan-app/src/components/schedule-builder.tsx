"use client";

import { useMemo, useState, useTransition } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  Experiment,
  ExperimentTimepoint,
  PlatformSlotKind,
  ScheduleTemplate,
  ScheduleDay,
  ScheduleSlot,
  ScheduledBlock,
} from "@/types";
import type { ExperimentTemplateRecord } from "@/components/experiment-template-builder";
import { saveScheduleTemplate } from "@/app/(protected)/experiments/schedule-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Layers3,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

type BuilderBlock = {
  id: string;
  experiment_template_id: string;
  protocol_id: string | null;
  title_override: string;
  notes: string;
  sort_order: number;
  repeat_key: string | null;
  metadata: Record<string, unknown>;
};

type BuilderSlot = {
  id: string;
  slot_kind: PlatformSlotKind;
  label: string;
  start_time: string;
  sort_order: number;
  blocks: BuilderBlock[];
};

type BuilderDay = {
  id: string;
  day_index: number;
  label: string;
  sort_order: number;
  slots: BuilderSlot[];
};

type ScheduleDraft = {
  schedule_template_id: string | null;
  template_id: string;
  name: string;
  description: string;
  days: BuilderDay[];
};

type DragPayload =
  | { kind: "day"; dayId: string }
  | { kind: "slot"; dayId: string; slotId: string }
  | { kind: "block"; dayId: string; slotId: string; blockId: string };

type DayDraft = {
  customLabel: string;
  exactTime: string;
};

type SlotDraft = {
  blockTemplateId: string;
  titleOverride: string;
};

interface ScheduleBuilderProps {
  experiments: Experiment[];
  timepoints: ExperimentTimepoint[];
  experimentTemplates: ExperimentTemplateRecord[];
  scheduleTemplates: ScheduleTemplate[];
  scheduleDays: ScheduleDay[];
  scheduleSlots: ScheduleSlot[];
  scheduledBlocks: ScheduledBlock[];
  persistenceEnabled: boolean;
}

const DEFAULT_DAY_DRAFT: DayDraft = {
  customLabel: "",
  exactTime: "",
};

const DEFAULT_SLOT_DRAFT: SlotDraft = {
  blockTemplateId: "",
  titleOverride: "",
};

let localIdCounter = 0;

function createLocalId(prefix: string) {
  localIdCounter += 1;
  return `local-${prefix}-${localIdCounter}`;
}

function createDefaultSlot(slotKind: PlatformSlotKind = "am", overrides?: Partial<BuilderSlot>): BuilderSlot {
  return {
    id: createLocalId("slot"),
    slot_kind: slotKind,
    label:
      slotKind === "am"
        ? "AM"
        : slotKind === "pm"
          ? "PM"
          : slotKind === "midday"
            ? "Midday"
            : slotKind === "evening"
              ? "Evening"
              : slotKind === "exact_time"
                ? "Exact Time"
                : "Custom",
    start_time: "",
    sort_order: 0,
    blocks: [],
    ...overrides,
  };
}

function createDefaultDay(overrides?: Partial<BuilderDay>): BuilderDay {
  return {
    id: createLocalId("day"),
    day_index: 1,
    label: "",
    sort_order: 0,
    slots: [
      createDefaultSlot("am", { sort_order: 0 }),
      createDefaultSlot("pm", { sort_order: 1 }),
    ],
    ...overrides,
  };
}

function createEmptyDay(dayIndex: number, overrides?: Partial<BuilderDay>): BuilderDay {
  return {
    id: createLocalId("day"),
    day_index: dayIndex,
    label: "",
    sort_order: 0,
    slots: [],
    ...overrides,
  };
}

function reorder<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function normalizeDays(days: BuilderDay[]) {
  return days.map((day, dayIndex) => ({
    ...day,
    day_index: dayIndex + 1,
    sort_order: dayIndex,
    slots: day.slots.map((slot, slotIndex) => ({
      ...slot,
      sort_order: slotIndex,
      blocks: slot.blocks.map((block, blockIndex) => ({
        ...block,
        sort_order: blockIndex,
      })),
    })),
  }));
}

function slotTone(slotKind: PlatformSlotKind) {
  switch (slotKind) {
    case "am":
      return "bg-amber-100 text-amber-800";
    case "pm":
      return "bg-indigo-100 text-indigo-800";
    case "midday":
      return "bg-sky-100 text-sky-800";
    case "evening":
      return "bg-violet-100 text-violet-800";
    case "custom":
      return "bg-slate-100 text-slate-800";
    case "exact_time":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function buildDraftForTemplate(
  templateId: string,
  scheduleTemplates: ScheduleTemplate[],
  scheduleDays: ScheduleDay[],
  scheduleSlots: ScheduleSlot[],
  scheduledBlocks: ScheduledBlock[],
): ScheduleDraft {
  const activeSchedule =
    scheduleTemplates.find((schedule) => schedule.template_id === templateId && schedule.is_active) ||
    scheduleTemplates.find((schedule) => schedule.template_id === templateId) ||
    null;

  if (!activeSchedule) {
    return {
      schedule_template_id: null,
      template_id: templateId,
      name: "Default schedule",
      description: "",
      days: normalizeDays([createDefaultDay()]),
    };
  }

  const dayRows = scheduleDays
    .filter((day) => day.schedule_template_id === activeSchedule.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.day_index - b.day_index);

  const days: BuilderDay[] = dayRows.map((day) => {
    const slotRows = scheduleSlots
      .filter((slot) => slot.schedule_day_id === day.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    return {
      id: day.id,
      day_index: day.day_index,
      label: day.label || "",
      sort_order: day.sort_order,
      slots: slotRows.map((slot) => ({
        id: slot.id,
        slot_kind: slot.slot_kind,
        label:
          slot.slot_kind === "custom"
            ? slot.label || "Custom"
            : slot.slot_kind === "exact_time"
              ? slot.label || slot.start_time || "Exact Time"
              : slot.slot_kind === "midday"
                ? "Midday"
                : slot.slot_kind === "evening"
                  ? "Evening"
                  : slot.slot_kind.toUpperCase(),
        start_time: slot.start_time || "",
        sort_order: slot.sort_order,
        blocks: scheduledBlocks
          .filter((block) => block.schedule_slot_id === slot.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((block) => ({
            id: block.id,
            experiment_template_id: block.experiment_template_id,
            protocol_id: block.protocol_id,
            title_override: block.title_override || "",
            notes: block.notes || "",
            sort_order: block.sort_order,
            repeat_key: block.repeat_key,
            metadata:
              block.metadata && typeof block.metadata === "object" && !Array.isArray(block.metadata)
                ? block.metadata
                : {},
          })),
      })),
    };
  });

  return {
    schedule_template_id: activeSchedule.id,
    template_id: templateId,
    name: activeSchedule.name,
    description: activeSchedule.description || "",
    days: days.length > 0 ? normalizeDays(days) : normalizeDays([createDefaultDay()]),
  };
}

function findSlot(days: BuilderDay[], dayId: string, slotId: string) {
  const day = days.find((entry) => entry.id === dayId);
  const slot = day?.slots.find((entry) => entry.id === slotId);
  return { day, slot };
}

function buildRepeatKey(templateId: string) {
  return `repeat-${templateId}-${createLocalId("group")}`;
}

function nextDayIndex(days: BuilderDay[]) {
  return Math.max(...days.map((day) => day.day_index), 0) + 1;
}

function getDaySummary(day: BuilderDay, templateTitleById: Map<string, string>) {
  if (day.label.trim()) {
    return day.label.trim();
  }

  const blockTitles = day.slots
    .flatMap((slot) => slot.blocks)
    .map((block) => block.title_override.trim() || templateTitleById.get(block.experiment_template_id) || "")
    .filter(Boolean);

  if (blockTitles.length === 0) {
    return day.slots.length === 0 ? "No work scheduled" : "Work day";
  }

  if (blockTitles.length === 1) {
    return blockTitles[0];
  }

  return `${blockTitles[0]} +${blockTitles.length - 1} more`;
}

function parseBatteryTag(tags: string[], prefix: string) {
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) || null;
}

function getInitialScheduleTemplateId(
  experiments: Experiment[],
  experimentTemplates: ExperimentTemplateRecord[],
) {
  const firstBatteryTemplateId =
    experiments
      .filter((experiment) => experiment.tags.includes("kind:battery"))
      .map((experiment) => parseBatteryTag(experiment.tags, "battery_template:"))
      .find((value): value is string => Boolean(value)) || null;

  return firstBatteryTemplateId || experimentTemplates[0]?.id || "";
}

function getWindowNameFromMetadata(metadata: Record<string, unknown>) {
  const singleName = typeof metadata.timepointWindowName === "string" ? metadata.timepointWindowName.trim() : "";
  if (singleName) return singleName;

  const names = Array.isArray(metadata.timepointWindowNames)
    ? metadata.timepointWindowNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  return names[0] || "";
}

function blockMatchesWindow(block: BuilderBlock, selectedWindowName: string) {
  if (!selectedWindowName) return true;
  const blockWindowName = getWindowNameFromMetadata(block.metadata);
  if (!blockWindowName) return true;
  return blockWindowName === selectedWindowName;
}

export function ScheduleBuilder({
  experiments,
  timepoints,
  experimentTemplates,
  scheduleTemplates,
  scheduleDays,
  scheduleSlots,
  scheduledBlocks,
  persistenceEnabled,
}: ScheduleBuilderProps) {
  const router = useRouter();
  const initialTemplateId = getInitialScheduleTemplateId(experiments, experimentTemplates);
  const [isPending, startTransition] = useTransition();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId);
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    buildDraftForTemplate(
      initialTemplateId,
      scheduleTemplates,
      scheduleDays,
      scheduleSlots,
      scheduledBlocks,
    ),
  );
  const [dayDrafts, setDayDrafts] = useState<Record<string, DayDraft>>({});
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>({});
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() => {
    const initialDraft = buildDraftForTemplate(
      initialTemplateId,
      scheduleTemplates,
      scheduleDays,
      scheduleSlots,
      scheduledBlocks,
    );
    const firstDayId = initialDraft.days[0]?.id;
    return firstDayId ? { [firstDayId]: true } : {};
  });

  const templateTitleById = new Map(experimentTemplates.map((template) => [template.id, template.title]));
  const batteryOptions = useMemo(
    () =>
      experiments
        .filter((experiment) => experiment.tags.includes("kind:battery"))
        .map((experiment) => {
          const templateId = parseBatteryTag(experiment.tags, "battery_template:");
          if (!templateId) return null;
          return {
            experimentId: experiment.id,
            templateId,
            label: experiment.title,
            timepointCount: timepoints.filter((timepoint) => timepoint.experiment_id === experiment.id).length,
          };
        })
        .filter(
          (
            option,
          ): option is { experimentId: string; templateId: string; label: string; timepointCount: number } =>
            Boolean(option),
        ),
    [experiments, timepoints],
  );
  const selectedBatteryOption =
    batteryOptions.find((option) => option.templateId === selectedTemplateId) || null;
  const windowOptions = useMemo(() => {
    const batteryExperiment = experiments.find((experiment) => parseBatteryTag(experiment.tags, "battery_template:") === selectedTemplateId) || null;
    const fromTimepoints = batteryExperiment
      ? timepoints
          .filter((timepoint) => timepoint.experiment_id === batteryExperiment.id)
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((timepoint) => ({
            id: timepoint.id,
            name: timepoint.label,
            rangeLabel: timepoint.notes || "",
          }))
      : [];

    if (fromTimepoints.length > 0) {
      return fromTimepoints;
    }

    const discoveredNames = Array.from(
      new Set(
        draft.days.flatMap((day) =>
          day.slots.flatMap((slot) =>
            slot.blocks
              .map((block) => getWindowNameFromMetadata(block.metadata))
              .filter(Boolean),
          ),
        ),
      ),
    );

    return discoveredNames.map((name, index) => ({
      id: `window-${index}-${name}`,
      name,
      rangeLabel: "",
    }));
  }, [draft.days, experiments, selectedTemplateId, timepoints]);
  const [selectedWindowName, setSelectedWindowName] = useState("");
  const activeWindowName =
    windowOptions.length === 0
      ? ""
      : windowOptions.some((window) => window.name === selectedWindowName)
        ? selectedWindowName
        : (windowOptions[0]?.name || "");

  const loadTemplate = (templateId: string) => {
    const nextDraft = buildDraftForTemplate(
      templateId,
      scheduleTemplates,
      scheduleDays,
      scheduleSlots,
      scheduledBlocks,
    );
    setSelectedTemplateId(templateId);
    setDraft(nextDraft);
    setDayDrafts({});
    setSlotDrafts({});
    setDragging(null);
    setSelectedWindowName("");
    setExpandedDays(nextDraft.days[0]?.id ? { [nextDraft.days[0].id]: true } : {});
  };

  const setDayExpanded = (dayId: string, isExpanded: boolean) => {
    setExpandedDays((current) => ({
      ...current,
      [dayId]: isExpanded,
    }));
  };

  const toggleDayExpanded = (dayId: string) => {
    setExpandedDays((current) => ({
      ...current,
      [dayId]: !current[dayId],
    }));
  };

  const updateDayDraft = (dayId: string, patch: Partial<DayDraft>) => {
    setDayDrafts((current) => ({
      ...current,
      [dayId]: {
        ...(current[dayId] ?? DEFAULT_DAY_DRAFT),
        ...patch,
      },
    }));
  };

  const updateSlotDraft = (slotId: string, patch: Partial<SlotDraft>) => {
    setSlotDrafts((current) => ({
      ...current,
      [slotId]: {
        ...(current[slotId] ?? DEFAULT_SLOT_DRAFT),
        ...patch,
      },
    }));
  };

  const resetDayDraft = (dayId: string, keys?: (keyof DayDraft)[]) => {
    setDayDrafts((current) => {
      if (!current[dayId]) {
        return current;
      }

      if (!keys?.length) {
        const next = { ...current };
        delete next[dayId];
        return next;
      }

      return {
        ...current,
        [dayId]: {
          ...current[dayId],
          ...Object.fromEntries(keys.map((key) => [key, DEFAULT_DAY_DRAFT[key]])),
        },
      };
    });
  };

  const resetSlotDraft = (slotId: string, keys?: (keyof SlotDraft)[]) => {
    setSlotDrafts((current) => {
      if (!current[slotId]) {
        return current;
      }

      if (!keys?.length) {
        const next = { ...current };
        delete next[slotId];
        return next;
      }

      return {
        ...current,
        [slotId]: {
          ...current[slotId],
          ...Object.fromEntries(keys.map((key) => [key, DEFAULT_SLOT_DRAFT[key]])),
        },
      };
    });
  };

  const updateDraft = (patch: Partial<ScheduleDraft>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const updateDays = (updater: (current: BuilderDay[]) => BuilderDay[]) => {
    setDraft((current) => ({
      ...current,
      days: normalizeDays(updater(current.days)),
    }));
  };

  const addDay = () => {
    const nextDay = createDefaultDay({ day_index: nextDayIndex(draft.days) });
    updateDays((current) => [...current, nextDay]);
    setDayExpanded(nextDay.id, true);
  };

  const addEmptyDay = () => {
    const nextDay = createEmptyDay(nextDayIndex(draft.days));
    updateDays((current) => [...current, nextDay]);
    setDayExpanded(nextDay.id, true);
  };

  const insertGapDaysAfter = (dayId: string, count: number) => {
    if (count <= 0) {
      return;
    }

    const insertedDayIds: string[] = [];
    updateDays((current) => {
      const dayIndex = current.findIndex((day) => day.id === dayId);
      if (dayIndex === -1) {
        return current;
      }

      const baseDayIndex = current[dayIndex].day_index;
      const shifted = current.map((day) =>
        day.day_index > baseDayIndex
          ? { ...day, day_index: day.day_index + count }
          : day,
      );
      const gapDays = Array.from({ length: count }, (_, offset) =>
        createEmptyDay(baseDayIndex + offset + 1),
      );
      insertedDayIds.push(...gapDays.map((day) => day.id));
      shifted.splice(dayIndex + 1, 0, ...gapDays);
      return shifted;
    });
    if (insertedDayIds.length > 0) {
      setExpandedDays((current) => ({
        ...current,
        ...Object.fromEntries(insertedDayIds.map((id) => [id, true])),
      }));
    }
  };

  const insertWorkDayAfter = (dayId: string) => {
    const insertedDayIds: string[] = [];
    updateDays((current) => {
      const dayIndex = current.findIndex((day) => day.id === dayId);
      if (dayIndex === -1) {
        return current;
      }

      const baseDayIndex = current[dayIndex].day_index;
      const shifted = current.map((day) =>
        day.day_index > baseDayIndex
          ? { ...day, day_index: day.day_index + 1 }
          : day,
      );
      const nextDay = createDefaultDay({ day_index: baseDayIndex + 1 });
      insertedDayIds.push(nextDay.id);
      shifted.splice(dayIndex + 1, 0, nextDay);
      return shifted;
    });

    if (insertedDayIds.length > 0) {
      setExpandedDays((current) => ({
        ...current,
        ...Object.fromEntries(insertedDayIds.map((id) => [id, true])),
      }));
    }
  };

  const deleteDay = (dayId: string) => {
    updateDays((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((day) => day.id !== dayId);
    });
    setExpandedDays((current) => {
      const next = { ...current };
      delete next[dayId];
      return next;
    });
  };

  const updateDayLabel = (dayId: string, label: string) => {
    updateDays((current) =>
      current.map((day) => (day.id === dayId ? { ...day, label } : day)),
    );
  };

  const addSlot = (dayId: string, slotKind: PlatformSlotKind, value?: string) => {
    updateDays((current) =>
      current.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        const slot =
          slotKind === "custom"
            ? createDefaultSlot("custom", { label: value?.trim() || "Custom" })
            : slotKind === "exact_time"
              ? createDefaultSlot("exact_time", {
                  label: value?.trim() || "Exact Time",
                  start_time: value?.trim() || "",
                })
              : createDefaultSlot(slotKind);

        return {
          ...day,
          slots: [...day.slots, slot],
        };
      }),
    );
  };

  const deleteSlot = (dayId: string, slotId: string) => {
    updateDays((current) =>
      current.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        return {
          ...day,
          slots: day.slots.filter((slot) => slot.id !== slotId),
        };
      }),
    );
    resetSlotDraft(slotId);
  };

  const addBlock = (dayId: string, slotId: string) => {
    const slotDraft = slotDrafts[slotId] ?? DEFAULT_SLOT_DRAFT;
    if (!slotDraft.blockTemplateId) {
      return;
    }

    updateDays((current) =>
      current.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        return {
          ...day,
          slots: day.slots.map((slot) =>
            slot.id === slotId
              ? {
                  ...slot,
                  blocks: [
                    ...slot.blocks,
                    {
                      id: createLocalId("block"),
                      experiment_template_id: slotDraft.blockTemplateId,
                      protocol_id: null,
                      title_override: slotDraft.titleOverride.trim(),
                      notes: "",
                      sort_order: slot.blocks.length,
                      repeat_key: null,
                      metadata: activeWindowName
                        ? {
                            timepointWindowName: activeWindowName,
                            timepointWindowNames: [activeWindowName],
                          }
                        : {},
                    },
                  ],
                }
              : slot,
          ),
        };
      }),
    );

    resetSlotDraft(slotId, ["blockTemplateId", "titleOverride"]);
  };

  const deleteBlock = (dayId: string, slotId: string, blockId: string) => {
    updateDays((current) =>
      current.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        return {
          ...day,
          slots: day.slots.map((slot) =>
            slot.id === slotId
              ? {
                  ...slot,
                  blocks: slot.blocks.filter((block) => block.id !== blockId),
                }
              : slot,
          ),
        };
      }),
    );
  };

  const updateBlock = (
    dayId: string,
    slotId: string,
    blockId: string,
    patch: Partial<Pick<BuilderBlock, "title_override" | "notes">>,
  ) => {
    updateDays((current) =>
      current.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        return {
          ...day,
          slots: day.slots.map((slot) =>
            slot.id === slotId
              ? {
                  ...slot,
                  blocks: slot.blocks.map((block) =>
                    block.id === blockId
                      ? {
                          ...block,
                          ...patch,
                        }
                      : block,
                  ),
                }
              : slot,
          ),
        };
      }),
    );
  };

  const duplicateBlock = (dayId: string, slotId: string, blockId: string) => {
    updateDays((current) =>
      current.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        return {
          ...day,
          slots: day.slots.map((slot) => {
            if (slot.id !== slotId) {
              return slot;
            }

            const blockIndex = slot.blocks.findIndex((block) => block.id === blockId);
            if (blockIndex === -1) {
              return slot;
            }

            const source = slot.blocks[blockIndex];
            const repeatKey = source.repeat_key || buildRepeatKey(source.experiment_template_id);
            const copy: BuilderBlock = {
              ...source,
              id: createLocalId("block"),
              repeat_key: repeatKey,
            };

            const blocks = slot.blocks.map((block, index) =>
              index === blockIndex && !block.repeat_key
                ? {
                    ...block,
                    repeat_key: repeatKey,
                  }
                : block,
            );
            blocks.splice(blockIndex + 1, 0, copy);

            return {
              ...slot,
              blocks,
            };
          }),
        };
      }),
    );
  };

  const moveDay = (sourceDayId: string, targetDayId: string) => {
    updateDays((current) => {
      const fromIndex = current.findIndex((day) => day.id === sourceDayId);
      const toIndex = current.findIndex((day) => day.id === targetDayId);
      return reorder(current, fromIndex, toIndex);
    });
  };

  const moveSlot = (sourceDayId: string, slotId: string, targetDayId: string, targetSlotId: string) => {
    updateDays((current) => {
      const sourceMatch = findSlot(current, sourceDayId, slotId);
      if (!sourceMatch.slot) {
        return current;
      }
      const sourceSlot = sourceMatch.slot;

      const stripped = current.map((day) =>
        day.id === sourceDayId
          ? {
              ...day,
              slots: day.slots.filter((slot) => slot.id !== slotId),
            }
          : day,
      );

      return stripped.map((day) => {
        if (day.id !== targetDayId) {
          return day;
        }

        const targetIndex = day.slots.findIndex((slot) => slot.id === targetSlotId);
        if (targetIndex === -1) {
          return day;
        }

        const slots = [...day.slots];
        slots.splice(targetIndex, 0, sourceSlot);

        return {
          ...day,
          slots,
        };
      });
    });
  };

  const moveBlock = (
    sourceDayId: string,
    sourceSlotId: string,
    blockId: string,
    targetDayId: string,
    targetSlotId: string,
    targetBlockId?: string,
  ) => {
    updateDays((current) => {
      const sourceSlotMatch = findSlot(current, sourceDayId, sourceSlotId);
      const block = sourceSlotMatch.slot?.blocks.find((entry) => entry.id === blockId);
      if (!block) {
        return current;
      }

      const stripped = current.map((day) => ({
        ...day,
        slots: day.slots.map((slot) =>
          day.id === sourceDayId && slot.id === sourceSlotId
            ? {
                ...slot,
                blocks: slot.blocks.filter((entry) => entry.id !== blockId),
              }
            : slot,
        ),
      }));

      return stripped.map((day) => {
        if (day.id !== targetDayId) {
          return day;
        }

        return {
          ...day,
          slots: day.slots.map((slot) => {
            if (slot.id !== targetSlotId) {
              return slot;
            }

            const blocks = [...slot.blocks];
            const targetIndex = targetBlockId
              ? slot.blocks.findIndex((entry) => entry.id === targetBlockId)
              : slot.blocks.length;

            if (targetIndex === -1) {
              blocks.push(block);
            } else {
              blocks.splice(targetIndex, 0, block);
            }

            return {
              ...slot,
              blocks,
            };
          }),
        };
      });
    });
  };

  const handleDropOnDay = (targetDayId: string) => {
    if (dragging?.kind === "day" && dragging.dayId !== targetDayId) {
      moveDay(dragging.dayId, targetDayId);
    }
    setDragging(null);
  };

  const handleDropOnSlot = (targetDayId: string, targetSlotId: string) => {
    if (dragging?.kind === "slot") {
      if (dragging.dayId !== targetDayId || dragging.slotId !== targetSlotId) {
        moveSlot(dragging.dayId, dragging.slotId, targetDayId, targetSlotId);
      }
    } else if (dragging?.kind === "block") {
      moveBlock(dragging.dayId, dragging.slotId, dragging.blockId, targetDayId, targetSlotId);
    }

    setDragging(null);
  };

  const handleDropOnBlock = (targetDayId: string, targetSlotId: string, targetBlockId: string) => {
    if (dragging?.kind === "block") {
      if (
        dragging.dayId !== targetDayId ||
        dragging.slotId !== targetSlotId ||
        dragging.blockId !== targetBlockId
      ) {
        moveBlock(
          dragging.dayId,
          dragging.slotId,
          dragging.blockId,
          targetDayId,
          targetSlotId,
          targetBlockId,
        );
      }
    }

    setDragging(null);
  };

  const handleSave = () => {
    if (!draft.template_id) {
      toast.error("Select a template before saving a schedule.");
      return;
    }

    if (!persistenceEnabled) {
      toast.error("Scheduling persistence is not available in this environment yet.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        if (draft.schedule_template_id) {
          formData.append("schedule_template_id", draft.schedule_template_id);
        }
        formData.append("template_id", draft.template_id);
        formData.append("name", draft.name);
        formData.append("description", draft.description);
        formData.append(
          "days",
          JSON.stringify(
            draft.days.map((day) => ({
              day_index: day.day_index,
              label: day.label || null,
              sort_order: day.sort_order,
              slots: day.slots.map((slot) => ({
                slot_kind: slot.slot_kind,
                label: slot.slot_kind === "custom" ? slot.label || null : slot.slot_kind === "exact_time" ? slot.label || null : null,
                start_time: slot.slot_kind === "exact_time" ? slot.start_time || null : null,
                sort_order: slot.sort_order,
                blocks: slot.blocks.map((block) => ({
                  experiment_template_id: block.experiment_template_id,
                  protocol_id: block.protocol_id,
                  title_override: block.title_override.trim() || null,
                  notes: block.notes.trim() || null,
                  sort_order: block.sort_order,
                  repeat_key: block.repeat_key,
                  metadata: block.metadata,
                })),
              })),
            })),
          ),
        );

        const result = await saveScheduleTemplate(formData);
        setDraft((current) => ({
          ...current,
          schedule_template_id: result.schedule_template_id,
        }));
        router.refresh();
        toast.success("Schedule saved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save schedule.");
      }
    });
  };

  if (experimentTemplates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Create a reusable experiment template first. Phase 2 scheduling blocks must reference real
          `experiment_templates`, so schedule persistence stays disabled until a template exists.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={cn("border-dashed", !persistenceEnabled && "border-amber-300 bg-amber-50/50")}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {persistenceEnabled ? "This battery layout is editable and saveable." : "Draft-only mode."}
            </p>
            <p className="text-sm text-muted-foreground">
              {persistenceEnabled
                ? "Arrange work days, no-work days, and experiment timing here."
                : "Saving is not available in this environment yet."}
            </p>
          </div>
          <Button type="button" onClick={handleSave} disabled={!persistenceEnabled || isPending || !draft.template_id} className="gap-2">
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Schedule"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">{batteryOptions.length > 0 ? "Battery" : "Template"}</p>
            <select
              value={selectedTemplateId}
              onChange={(event) => loadTemplate(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {batteryOptions.length > 0
                ? batteryOptions.map((battery) => (
                    <option key={battery.templateId} value={battery.templateId}>
                      {battery.label}
                    </option>
                  ))
                : experimentTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
            </select>
            {selectedBatteryOption ? (
              <p className="text-xs text-muted-foreground">
                Editing the same saved battery used in `Create Battery`. Changes here will show there too.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Schedule Name</p>
            <Input
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="Default schedule"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Description</p>
            <Input
              value={draft.description}
              onChange={(event) => updateDraft({ description: event.target.value })}
              placeholder="Optional schedule notes"
            />
          </div>
        </div>
        <Button type="button" variant="outline" className="gap-2" onClick={() => loadTemplate(selectedTemplateId)} disabled={!selectedTemplateId}>
          Reload Saved
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Relative Schedule Builder</h2>
          <p className="text-sm text-muted-foreground">
            Build the battery day by day. Use empty days to keep the timing right when no experiment happens.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={addDay} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Work Day
          </Button>
          <Button type="button" variant="outline" onClick={addEmptyDay} className="gap-2">
            <Plus className="h-4 w-4" />
            Add No-Work Day
          </Button>
        </div>
      </div>

      {windowOptions.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-700">Timepoint layout:</p>
              {windowOptions.map((window) => (
                <button
                  key={window.id}
                  type="button"
                  onClick={() => setSelectedWindowName(window.name)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    activeWindowName === window.name
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700",
                  )}
                >
                  {window.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              You are editing the schedule for {activeWindowName || "all timepoints"} here.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {draft.days.map((day) => (
          <Card
            key={day.id}
            draggable
            onDragStart={() => setDragging({ kind: "day", dayId: day.id })}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDropOnDay(day.id)}
            className={cn(
              "border-2 transition-colors",
              dragging?.kind === "day" && dragging.dayId === day.id
                ? "border-primary/60 bg-primary/5"
                : "border-border",
            )}
          >
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleDayExpanded(day.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">Day {day.day_index}</CardTitle>
                    <p className="truncate text-sm text-muted-foreground">
                      {getDaySummary(
                        {
                          ...day,
                          slots: day.slots.map((slot) => ({
                            ...slot,
                            blocks: slot.blocks.filter((block) => blockMatchesWindow(block, activeWindowName)),
                          })),
                        },
                        templateTitleById,
                      )}
                    </p>
                  </div>
                  {expandedDays[day.id] ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => deleteDay(day.id)} disabled={draft.days.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {expandedDays[day.id] ? (
              <CardContent className="space-y-4">
                <Input
                  value={day.label}
                  onChange={(event) => updateDayLabel(day.id, event.target.value)}
                  placeholder="Optional note for this day"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => insertWorkDayAfter(day.id)}>
                    Insert Work Day
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => insertGapDaysAfter(day.id, 1)}>
                    Insert 1 No-Work Day
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => insertGapDaysAfter(day.id, 2)}>
                    Insert 2 No-Work Days
                  </Button>
                </div>
              {day.slots.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  This is an intentional no-work day. Keep it to preserve spacing, or add slots if work should happen here.
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => addSlot(day.id, "am")}>
                  Add AM
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => addSlot(day.id, "pm")}>
                  Add PM
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => addSlot(day.id, "midday")}>
                  Add Midday
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => addSlot(day.id, "evening")}>
                  Add Evening
                </Button>
                <div className="flex min-w-[220px] flex-1 gap-2">
                  <Input
                    value={dayDrafts[day.id]?.customLabel ?? ""}
                    onChange={(event) => updateDayDraft(day.id, { customLabel: event.target.value })}
                    placeholder="Custom slot label"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const label = (dayDrafts[day.id]?.customLabel ?? "").trim();
                      if (!label) {
                        return;
                      }
                      addSlot(day.id, "custom", label);
                      resetDayDraft(day.id, ["customLabel"]);
                    }}
                  >
                    Add Custom
                  </Button>
                </div>
                <div className="flex min-w-[220px] flex-1 gap-2">
                  <Input
                    type="time"
                    value={dayDrafts[day.id]?.exactTime ?? ""}
                    onChange={(event) => updateDayDraft(day.id, { exactTime: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const exactTime = dayDrafts[day.id]?.exactTime ?? "";
                      if (!exactTime) {
                        return;
                      }
                      addSlot(day.id, "exact_time", exactTime);
                      resetDayDraft(day.id, ["exactTime"]);
                    }}
                  >
                    Add Exact Time
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {day.slots.map((slot) => {
                  const slotDraft = slotDrafts[slot.id] ?? DEFAULT_SLOT_DRAFT;
                  const visibleBlocks = slot.blocks.filter((block) => blockMatchesWindow(block, activeWindowName));

                  return (
                    <div
                      key={slot.id}
                      draggable
                      onDragStart={() => setDragging({ kind: "slot", dayId: day.id, slotId: slot.id })}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleDropOnSlot(day.id, slot.id)}
                      className={cn(
                        "space-y-3 rounded-xl border bg-background p-4",
                        dragging?.kind === "slot" && dragging.slotId === slot.id
                          ? "border-primary/60"
                          : "border-border",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <Badge className={cn("border-0", slotTone(slot.slot_kind))}>{slot.label}</Badge>
                          {slot.slot_kind === "exact_time" && slot.start_time ? (
                            <span className="text-xs text-muted-foreground">{slot.start_time}</span>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteSlot(day.id, slot.id)}
                          disabled={day.slots.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <select
                          value={slotDraft.blockTemplateId}
                          onChange={(event) => updateSlotDraft(slot.id, { blockTemplateId: event.target.value })}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Choose experiment</option>
                          {experimentTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={slotDraft.titleOverride}
                          onChange={(event) => updateSlotDraft(slot.id, { titleOverride: event.target.value })}
                          placeholder="Optional custom name"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => addBlock(day.id, slot.id)}
                          disabled={!slotDraft.blockTemplateId}
                        >
                          Add
                        </Button>
                      </div>

                      <div
                        className={cn(
                          "space-y-2 rounded-lg border border-dashed p-3",
                          dragging?.kind === "block" ? "border-primary/40" : "border-border",
                        )}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDropOnSlot(day.id, slot.id)}
                      >
                        {visibleBlocks.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Drop blocks here or add one from the controls above.
                          </p>
                        ) : (
                          visibleBlocks.map((block) => (
                            <div
                              key={block.id}
                              draggable
                              onDragStart={(event: DragEvent<HTMLDivElement>) => {
                                event.stopPropagation();
                                setDragging({
                                  kind: "block",
                                  dayId: day.id,
                                  slotId: slot.id,
                                  blockId: block.id,
                                });
                              }}
                              onDragEnd={() => setDragging(null)}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleDropOnBlock(day.id, slot.id, block.id);
                              }}
                              className={cn(
                                "space-y-2 rounded-lg border bg-background px-3 py-3",
                                dragging?.kind === "block" && dragging.blockId === block.id
                                  ? "border-primary/60"
                                  : "border-border",
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {block.title_override.trim() || templateTitleById.get(block.experiment_template_id) || "Untitled template"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      <span className="inline-flex items-center gap-1">
                                        <Layers3 className="h-3 w-3" />
                                        {templateTitleById.get(block.experiment_template_id) || "Unknown template"}
                                      </span>
                                      {block.repeat_key ? " • repeat group" : ""}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => duplicateBlock(day.id, slot.id, block.id)}
                                    title="Repeat block"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteBlock(day.id, slot.id, block.id)}
                                    title="Delete block"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="grid gap-2 md:grid-cols-2">
                                <Input
                                  value={block.title_override}
                                  onChange={(event) =>
                                    updateBlock(day.id, slot.id, block.id, { title_override: event.target.value })
                                  }
                                  placeholder="Optional title override"
                                />
                                <Input
                                  value={block.notes}
                                  onChange={(event) =>
                                    updateBlock(day.id, slot.id, block.id, { notes: event.target.value })
                                  }
                                  placeholder="Optional block notes"
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
