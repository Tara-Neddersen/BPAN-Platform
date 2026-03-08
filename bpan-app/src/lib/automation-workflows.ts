import type { SupabaseClient } from "@supabase/supabase-js";
import { callAI } from "@/lib/ai";

type DbClient = SupabaseClient;

type DomainObjectType =
  | "protocol"
  | "reagent"
  | "workspace_calendar_event"
  | "experiment_template";

const SUPPORTED_TASK_LINK_OBJECT_TYPES = new Set<string>([
  "experiment_template",
  "experiment_run",
  "lab_reagent",
  "lab_reagent_stock_event",
  "lab_equipment",
  "lab_equipment_booking",
  "task",
]);

type ReminderUpsertInput = {
  userId: string;
  sourceId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  tags?: string[];
  resolve?: boolean;
};

type ProtocolChangeInput = {
  supabase: DbClient;
  userId: string;
  protocolId: string;
  previous: {
    title: string;
    description: string | null;
    category: string | null;
    steps: unknown;
  };
  next: {
    title: string;
    description: string | null;
    category: string | null;
    steps: unknown;
  };
};

type ReagentStockInput = {
  supabase: DbClient;
  userId: string;
  reagentId: string;
  name: string;
  quantity: number | null;
  previousQuantity?: number | null;
  reorderThreshold?: number | null;
};

type CalendarConflictInput = {
  supabase: DbClient;
  userId: string;
  eventId: string;
  title: string;
  startAt: string;
  endAt: string | null;
  status?: string | null;
  location?: string | null;
};

type TemplateAiSuggestionInput = {
  supabase: DbClient;
  userId: string;
  templateId: string;
  title: string;
  description: string | null;
  protocols: Array<{ title: string; notes?: string | null }>;
  columns: Array<{ label: string; columnType: string; required: boolean; isEnabled: boolean }>;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.filter(Boolean))];
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toComparableJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? "");
  }
}

function getChangedProtocolFields(
  previous: ProtocolChangeInput["previous"],
  next: ProtocolChangeInput["next"],
) {
  const changed: string[] = [];

  if ((previous.title || "") !== (next.title || "")) changed.push("title");
  if ((previous.description || "") !== (next.description || "")) changed.push("description");
  if ((previous.category || "") !== (next.category || "")) changed.push("category");
  if (toComparableJson(previous.steps) !== toComparableJson(next.steps)) changed.push("steps");

  return changed;
}

function parseSuggestionList(text: string) {
  return text
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function rangesOverlap(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null,
) {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA || startA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB || startB).getTime();

  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

async function recordWorkspaceEvent(
  supabase: DbClient,
  {
    userId,
    entityType,
    entityId,
    eventType,
    title,
    detail,
    payload,
  }: {
    userId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    title: string;
    detail?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  await supabase.from("workspace_events").insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    title,
    detail: detail || null,
    event_at: new Date().toISOString(),
    payload: payload || {},
  });
}

async function upsertReminderTask(
  supabase: DbClient,
  {
    userId,
    sourceId,
    title,
    description,
    dueDate,
    tags,
    resolve,
  }: ReminderUpsertInput,
) {
  const { data: existing } = await supabase
    .from("tasks")
    .select("id,status,tags")
    .eq("user_id", userId)
    .eq("source_type", "reminder")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();

  if (!existing && resolve) {
    return null;
  }

  const baseTags = uniqueTags(["automation", "notification", ...(tags || [])]);

  if (existing?.id) {
    const nextTags = uniqueTags([
      ...baseTags,
      ...((Array.isArray(existing.tags) ? existing.tags : []) as string[]),
    ]);

    const { error } = await supabase
      .from("tasks")
      .update({
        title,
        description: description || null,
        due_date: dueDate || null,
        status: resolve ? "completed" : "pending",
        completed_at: resolve ? new Date().toISOString() : null,
        tags: nextTags,
        source_label: "Automation reminder",
      })
      .eq("id", existing.id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return String(existing.id);
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      description: description || null,
      due_date: dueDate || null,
      priority: "high",
      status: "pending",
      source_type: "reminder",
      source_id: sourceId,
      source_label: "Automation reminder",
      tags: baseTags,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return String(data.id);
}

async function linkTaskToObject(
  supabase: DbClient,
  {
    userId,
    taskId,
    objectType,
    objectId,
    linkType,
  }: {
    userId: string;
    taskId: string;
    objectType: DomainObjectType;
    objectId: string;
    linkType: string;
  },
) {
  if (SUPPORTED_TASK_LINK_OBJECT_TYPES.has(objectType)) {
    const taskLinkResult = await supabase.from("task_links").upsert(
      {
        task_id: taskId,
        linked_object_type: objectType,
        linked_object_id: objectId,
        created_by: userId,
      },
      {
        onConflict: "task_id,linked_object_type,linked_object_id",
      },
    );

    if (taskLinkResult.error && !["PGRST205", "42P01"].includes(String(taskLinkResult.error.code || ""))) {
      throw new Error(taskLinkResult.error.message);
    }
  }

  await supabase.from("workspace_entity_links").upsert(
    {
      user_id: userId,
      source_type: "task",
      source_id: taskId,
      target_type: objectType,
      target_id: objectId,
      link_type: linkType,
      confidence: 1,
      metadata: {},
    },
    {
      onConflict: "user_id,source_type,source_id,target_type,target_id,link_type",
    },
  );
}

export async function notifyProtocolChange(input: ProtocolChangeInput) {
  const changedFields = getChangedProtocolFields(input.previous, input.next);
  if (changedFields.length === 0) return;

  const { supabase, userId, protocolId } = input;

  const [{ data: experiments }, { data: templateLinks }] = await Promise.all([
    supabase
      .from("experiments")
      .select("id,title,status")
      .eq("user_id", userId)
      .eq("protocol_id", protocolId),
    supabase
      .from("template_protocol_links")
      .select("template_id")
      .eq("protocol_id", protocolId),
  ]);

  const templateIds = [...new Set((templateLinks || []).map((row) => String(row.template_id || "")).filter(Boolean))];
  const { data: templates } = templateIds.length
    ? await supabase
        .from("experiment_templates")
        .select("id,title")
        .in("id", templateIds)
    : { data: [] as Array<{ id: string; title: string }> };

  const impactedExperiments = (experiments || []).map((row) => String(row.title || "Untitled experiment"));
  const impactedTemplates = (templates || []).map((row) => String(row.title || "Untitled template"));

  const totalImpact = impactedExperiments.length + impactedTemplates.length;

  await recordWorkspaceEvent(supabase, {
    userId,
    entityType: "protocol",
    entityId: protocolId,
    eventType: "automation.protocol_changed",
    title: `Protocol updated: ${input.next.title || "Untitled protocol"}`,
    detail:
      totalImpact > 0
        ? `${totalImpact} linked records may need review after changes to ${changedFields.join(", ")}.`
        : `No linked records found, but changes to ${changedFields.join(", ")} were recorded.`,
    payload: {
      changedFields,
      linkedExperiments: impactedExperiments.length,
      linkedTemplates: impactedTemplates.length,
    },
  });

  if (totalImpact === 0) return;

  const summaryLines = [
    `Changed fields: ${changedFields.join(", ")}.`,
    impactedExperiments.length
      ? `Experiments: ${impactedExperiments.slice(0, 3).join(", ")}${impactedExperiments.length > 3 ? ", ..." : ""}.`
      : null,
    impactedTemplates.length
      ? `Templates: ${impactedTemplates.slice(0, 3).join(", ")}${impactedTemplates.length > 3 ? ", ..." : ""}.`
      : null,
  ].filter(Boolean);

  const taskId = await upsertReminderTask(supabase, {
    userId,
    sourceId: `protocol:${protocolId}:change-review`,
    title: `Review linked records after protocol update`,
    description: summaryLines.join("\n"),
    dueDate: todayDate(),
    tags: ["protocol_change"],
  });

  if (!taskId) return;

  await linkTaskToObject(supabase, {
    userId,
    taskId,
    objectType: "protocol",
    objectId: protocolId,
    linkType: "requires_review",
  });
}

export async function notifyReagentStock(input: ReagentStockInput) {
  const { supabase, userId, reagentId, name, quantity } = input;
  const threshold = normalizeNumber(input.reorderThreshold);
  const previousQuantity = normalizeNumber(input.previousQuantity);

  const isLow = quantity !== null && quantity <= (threshold ?? 0);
  const wasLow = previousQuantity !== null && previousQuantity <= (threshold ?? 0);

  if (!isLow && !wasLow) return;

  await recordWorkspaceEvent(supabase, {
    userId,
    entityType: "reagent",
    entityId: reagentId,
    eventType: isLow ? "automation.low_stock" : "automation.low_stock_resolved",
    title: isLow ? `Low stock: ${name}` : `Stock restored: ${name}`,
    detail: isLow
      ? threshold !== null
        ? `Quantity ${quantity ?? "unknown"} is at or below the threshold of ${threshold}.`
        : `Quantity ${quantity ?? "unknown"} is depleted or below zero.`
      : `Quantity is back above the active alert threshold.`,
    payload: {
      quantity,
      previousQuantity,
      reorderThreshold: threshold,
    },
  });

  const taskId = await upsertReminderTask(supabase, {
    userId,
    sourceId: `reagent:${reagentId}:restock`,
    title: isLow ? `Restock reagent: ${name}` : `Restock reagent: ${name}`,
    description: isLow
      ? threshold !== null
        ? `Current quantity is ${quantity ?? "unknown"}, which is at or below the active threshold of ${threshold}.`
        : `Current quantity is ${quantity ?? "unknown"}. This alert only auto-fires for depleted stock until a stable reorder threshold contract exists.`
      : `Stock alert resolved automatically after quantity increased.`,
    dueDate: isLow ? todayDate() : null,
    tags: ["low_stock"],
    resolve: !isLow,
  });

  if (!taskId) return;

  await linkTaskToObject(supabase, {
    userId,
    taskId,
    objectType: "reagent",
    objectId: reagentId,
    linkType: "tracks_stock_alert",
  });
}

export async function notifyCalendarConflicts(input: CalendarConflictInput) {
  const { supabase, userId, eventId, title, startAt, endAt, status, location } = input;

  if (!startAt) return;

  const inactive = status === "completed" || status === "cancelled";
  const { data: events } = await supabase
    .from("workspace_calendar_events")
    .select("id,title,start_at,end_at,location,status")
    .eq("user_id", userId);

  const conflicts = inactive
    ? []
    : (events || []).filter((row) => {
        if (String(row.id) === eventId) return false;
        const rowStatus = String(row.status || "scheduled");
        if (rowStatus === "completed" || rowStatus === "cancelled") return false;
        if (!rangesOverlap(startAt, endAt, String(row.start_at), row.end_at ? String(row.end_at) : null)) return false;
        if (location && row.location) {
          return String(location).trim().toLowerCase() === String(row.location).trim().toLowerCase();
        }
        return true;
      });

  await recordWorkspaceEvent(supabase, {
    userId,
    entityType: "workspace_calendar_event",
    entityId: eventId,
    eventType: conflicts.length > 0 ? "automation.calendar_conflict" : "automation.calendar_clear",
    title: conflicts.length > 0 ? `Scheduling conflict: ${title}` : `Scheduling clear: ${title}`,
    detail:
      conflicts.length > 0
        ? `${conflicts.length} overlapping event(s) found${location ? ` at ${location}` : ""}.`
        : `No overlapping event remains for this booking window.`,
    payload: {
      conflictCount: conflicts.length,
      location: location || null,
    },
  });

  const taskId = await upsertReminderTask(supabase, {
    userId,
    sourceId: `calendar_event:${eventId}:conflict`,
    title: `Resolve scheduling conflict for ${title}`,
    description:
      conflicts.length > 0
        ? `Overlaps with: ${conflicts
            .slice(0, 3)
            .map((row) => String(row.title || "Untitled event"))
            .join(", ")}${conflicts.length > 3 ? ", ..." : ""}.`
        : `Scheduling conflict resolved.`,
    dueDate: conflicts.length > 0 ? todayDate() : null,
    tags: ["booking_conflict"],
    resolve: conflicts.length === 0,
  });

  if (!taskId) return;

  await linkTaskToObject(supabase, {
    userId,
    taskId,
    objectType: "workspace_calendar_event",
    objectId: eventId,
    linkType: "tracks_conflict",
  });
}

export async function createTemplateAiWorkflowSuggestion(input: TemplateAiSuggestionInput) {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY) {
    return;
  }

  const enabledColumns = input.columns.filter((column) => column.isEnabled);
  if (!input.title.trim() || enabledColumns.length === 0) {
    return;
  }

  const protocolSummary = input.protocols.length
    ? input.protocols
        .slice(0, 4)
        .map((protocol) => `${protocol.title}${protocol.notes ? ` (${protocol.notes})` : ""}`)
        .join("; ")
    : "No linked protocols yet";

  const columnSummary = enabledColumns
    .slice(0, 8)
    .map((column) => `${column.label} [${column.columnType}${column.required ? ", required" : ""}]`)
    .join("; ");

  try {
    const raw = await callAI(
      "You help research teams set up experiments. Produce 3 short workflow suggestions that are safe, practical, and tied to the provided template. Return plain text as three bullet points.",
      [
        `Template title: ${input.title}`,
        `Template description: ${input.description || "None"}`,
        `Linked protocols: ${protocolSummary}`,
        `Enabled result columns: ${columnSummary}`,
      ].join("\n"),
      220,
    );

    const suggestions = parseSuggestionList(raw);
    if (suggestions.length === 0) return;

    const description = suggestions.map((line) => `- ${line}`).join("\n");

    const taskId = await upsertReminderTask(input.supabase, {
      userId: input.userId,
      sourceId: `template:${input.templateId}:ai-workflow`,
      title: `Review AI workflow suggestions for ${input.title}`,
      description,
      dueDate: todayDate(),
      tags: ["ai_assist", "template_workflow"],
    });

    if (!taskId) return;

    await linkTaskToObject(input.supabase, {
      userId: input.userId,
      taskId,
      objectType: "experiment_template",
      objectId: input.templateId,
      linkType: "ai_suggested",
    });

    await recordWorkspaceEvent(input.supabase, {
      userId: input.userId,
      entityType: "experiment_template",
      entityId: input.templateId,
      eventType: "automation.ai_suggestion",
      title: `AI workflow suggestions ready for ${input.title}`,
      detail: suggestions[0],
      payload: {
        suggestions,
      },
    });
  } catch {
    // Best-effort only: save flows must continue even if AI is unavailable.
  }
}
