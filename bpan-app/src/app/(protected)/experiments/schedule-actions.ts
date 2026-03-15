"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PLATFORM_SLOT_KINDS,
  type PlatformSlotKind,
  type ScheduleDay,
  type ScheduleSlot,
  type ScheduledBlock,
} from "@/types";

type ScheduleBlockInput = Pick<
  ScheduledBlock,
  "experiment_template_id" | "protocol_id" | "title_override" | "notes" | "sort_order" | "repeat_key" | "metadata"
>;

type ScheduleSlotInput = Pick<ScheduleSlot, "slot_kind" | "label" | "start_time" | "sort_order"> & {
  blocks: ScheduleBlockInput[];
};

type ScheduleDayInput = Pick<ScheduleDay, "day_index" | "label" | "sort_order"> & {
  slots: ScheduleSlotInput[];
};

function withScheduleSchemaGuidance(message: string) {
  return `${message} If Agent 1's Phase 2 scheduling migration is not applied yet, keep using draft mode until the new tables are available.`;
}

function parseJsonField<T>(formData: FormData, key: string, fallback: T): T {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeSlotKind(value: unknown): PlatformSlotKind {
  const slotKind = typeof value === "string" ? value : "";
  return PLATFORM_SLOT_KINDS.includes(slotKind as PlatformSlotKind)
    ? (slotKind as PlatformSlotKind)
    : "am";
}

function normalizeBlockInputs(value: unknown): ScheduleBlockInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const experimentTemplateId =
        typeof record.experiment_template_id === "string" ? record.experiment_template_id.trim() : "";

      if (!experimentTemplateId) {
        return null;
      }

      return {
        experiment_template_id: experimentTemplateId,
        protocol_id: typeof record.protocol_id === "string" && record.protocol_id.trim() ? record.protocol_id.trim() : null,
        title_override:
          typeof record.title_override === "string" && record.title_override.trim() ? record.title_override.trim() : null,
        notes: typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : null,
        sort_order: typeof record.sort_order === "number" ? record.sort_order : index,
        repeat_key:
          typeof record.repeat_key === "string" && record.repeat_key.trim() ? record.repeat_key.trim() : null,
        metadata:
          record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
            ? (record.metadata as Record<string, unknown>)
            : {},
      } satisfies ScheduleBlockInput;
    })
    .filter((item): item is ScheduleBlockInput => Boolean(item))
    .map((item, index) => ({
      ...item,
      sort_order: index,
    }));
}

function normalizeSlotInputs(value: unknown): ScheduleSlotInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const slotKind = normalizeSlotKind(record.slot_kind);
      const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : null;
      const startTime = typeof record.start_time === "string" && record.start_time.trim() ? record.start_time.trim() : null;

      if (slotKind === "custom" && !label) {
        return null;
      }

      if (slotKind === "exact_time" && !startTime) {
        return null;
      }

      return {
        slot_kind: slotKind,
        label,
        start_time: startTime,
        sort_order: typeof record.sort_order === "number" ? record.sort_order : index,
        blocks: normalizeBlockInputs(record.blocks),
      } satisfies ScheduleSlotInput;
    })
    .filter((item): item is ScheduleSlotInput => Boolean(item))
    .map((item, index) => ({
      ...item,
      sort_order: index,
      blocks: item.blocks.map((block, blockIndex) => ({
        ...block,
        sort_order: blockIndex,
      })),
    }));
}

function normalizeDayInputs(value: unknown): ScheduleDayInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const dayIndex = typeof record.day_index === "number" ? record.day_index : index + 1;

      return {
        day_index: dayIndex,
        label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : null,
        sort_order: typeof record.sort_order === "number" ? record.sort_order : index,
        slots: normalizeSlotInputs(record.slots),
      } satisfies ScheduleDayInput;
    })
    .filter((item): item is ScheduleDayInput => Boolean(item))
    .map((item, index) => ({
      ...item,
      day_index: item.day_index > 0 ? item.day_index : index + 1,
      sort_order: index,
      slots: item.slots.map((slot, slotIndex) => ({
        ...slot,
        sort_order: slotIndex,
        blocks: slot.blocks.map((block, blockIndex) => ({
          ...block,
          sort_order: blockIndex,
        })),
      })),
    }));
}

export async function saveScheduleTemplate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const scheduleTemplateId =
    typeof formData.get("schedule_template_id") === "string" ? (formData.get("schedule_template_id") as string).trim() : "";
  const templateId = typeof formData.get("template_id") === "string" ? (formData.get("template_id") as string).trim() : "";
  const name = typeof formData.get("name") === "string" ? (formData.get("name") as string).trim() : "";
  const description = typeof formData.get("description") === "string" ? (formData.get("description") as string).trim() : "";

  if (!templateId) {
    throw new Error("A template is required before a schedule can be saved.");
  }

  const days = normalizeDayInputs(parseJsonField(formData, "days", []));

  let persistedScheduleTemplateId = scheduleTemplateId;

  if (scheduleTemplateId) {
    const { error } = await supabase
      .from("schedule_templates")
      .update({
        template_id: templateId,
        name: name || "Default schedule",
        description: description || null,
        is_active: true,
      })
      .eq("id", scheduleTemplateId);

    if (error) {
      throw new Error(withScheduleSchemaGuidance(error.message));
    }
  } else {
    const { data, error } = await supabase
      .from("schedule_templates")
      .insert({
        template_id: templateId,
        name: name || "Default schedule",
        description: description || null,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(withScheduleSchemaGuidance(error?.message || "Failed to create schedule template."));
    }

    persistedScheduleTemplateId = data.id as string;
  }

  if (!persistedScheduleTemplateId) {
    throw new Error("Failed to resolve the schedule template id.");
  }

  const { error: deleteDaysError } = await supabase
    .from("schedule_days")
    .delete()
    .eq("schedule_template_id", persistedScheduleTemplateId);

  if (deleteDaysError) {
    throw new Error(withScheduleSchemaGuidance(deleteDaysError.message));
  }

  for (const day of days) {
    const { data: insertedDay, error: dayError } = await supabase
      .from("schedule_days")
      .insert({
        schedule_template_id: persistedScheduleTemplateId,
        day_index: day.day_index,
        label: day.label,
        sort_order: day.sort_order,
      })
      .select("id")
      .single();

    if (dayError || !insertedDay?.id) {
      throw new Error(withScheduleSchemaGuidance(dayError?.message || "Failed to save schedule day."));
    }

    const persistedDayId = insertedDay.id as string;

    for (const slot of day.slots) {
      const { data: insertedSlot, error: slotError } = await supabase
        .from("schedule_slots")
        .insert({
          schedule_day_id: persistedDayId,
          slot_kind: slot.slot_kind,
          label: slot.slot_kind === "custom" ? slot.label : slot.label,
          start_time: slot.slot_kind === "exact_time" ? slot.start_time : slot.start_time,
          sort_order: slot.sort_order,
        })
        .select("id")
        .single();

      if (slotError || !insertedSlot?.id) {
        throw new Error(withScheduleSchemaGuidance(slotError?.message || "Failed to save schedule slot."));
      }

      const persistedSlotId = insertedSlot.id as string;

      if (slot.blocks.length === 0) {
        continue;
      }

      const { error: blockError } = await supabase.from("scheduled_blocks").insert(
        slot.blocks.map((block) => ({
          schedule_slot_id: persistedSlotId,
          experiment_template_id: block.experiment_template_id,
          protocol_id: block.protocol_id,
          title_override: block.title_override,
          notes: block.notes,
          sort_order: block.sort_order,
          repeat_key: block.repeat_key,
          metadata: block.metadata,
        })),
      );

      if (blockError) {
        throw new Error(withScheduleSchemaGuidance(blockError.message));
      }
    }
  }

  revalidatePath("/experiments");

  return {
    schedule_template_id: persistedScheduleTemplateId,
  };
}
