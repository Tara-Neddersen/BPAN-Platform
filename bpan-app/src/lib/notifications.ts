export const NOTIFICATION_TAGS = new Set([
  "automation",
  "notification",
  "protocol_change",
  "low_stock",
  "booking_conflict",
  "template_workflow",
  "ai_assist",
  "ops_update",
]);

export const READ_TAG = "notification_read";

export type NotificationCategory =
  | "run"
  | "reagent"
  | "booking"
  | "protocol"
  | "ai"
  | "chat"
  | "system";

export type NotificationLinkRef = {
  objectType: string;
  objectId: string;
};

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}

export function isNotificationTask(record: {
  source_type: string | null;
  tags: string[];
}) {
  if (record.source_type === "reminder") return true;
  return record.tags.some((tag) => NOTIFICATION_TAGS.has(tag));
}

export function isNotificationRead(tags: string[]) {
  return tags.includes(READ_TAG);
}

export function withReadTag(tags: string[], read: boolean) {
  const withoutRead = tags.filter((tag) => tag !== READ_TAG);
  return read ? [...withoutRead, READ_TAG] : withoutRead;
}

function parseSourceObjectId(sourceId: string | null, prefix: string) {
  if (!sourceId || !sourceId.startsWith(`${prefix}:`)) return null;
  const parts = sourceId.split(":");
  return parts[1] || null;
}

export function inferNotificationCategory(
  sourceId: string | null,
  tags: string[],
  links: NotificationLinkRef[],
): NotificationCategory {
  const linkedTypes = links.map((link) => link.objectType);

  if (tags.includes("ai_assist") || sourceId?.startsWith("template:")) return "ai";
  if (sourceId?.startsWith("chat_message:") || tags.includes("chat_message")) return "chat";
  if (sourceId?.startsWith("protocol:")) return "protocol";
  if (sourceId?.startsWith("reagent:")) return "reagent";
  if (sourceId?.startsWith("calendar_event:")) return "booking";

  if (linkedTypes.includes("protocol")) return "protocol";
  if (linkedTypes.includes("reagent") || linkedTypes.includes("lab_reagent") || linkedTypes.includes("lab_reagent_stock_event")) return "reagent";
  if (
    linkedTypes.includes("workspace_calendar_event") ||
    linkedTypes.includes("lab_equipment_booking") ||
    linkedTypes.includes("lab_equipment")
  ) return "booking";
  if (linkedTypes.includes("experiment_run") || linkedTypes.includes("experiment_template")) return "run";

  return "system";
}

function linkHrefForObject(link: NotificationLinkRef) {
  switch (link.objectType) {
    case "experiment_template":
      return `/experiments?tab=templates&templateId=${link.objectId}`;
    case "experiment_run":
      return `/results?run=${link.objectId}`;
    case "lab_reagent":
      return `/operations?reagentId=${link.objectId}`;
    case "lab_reagent_stock_event":
      return `/operations?stockEventId=${link.objectId}`;
    case "lab_equipment":
      return `/operations?equipmentId=${link.objectId}`;
    case "lab_equipment_booking":
      return `/operations?bookingId=${link.objectId}`;
    case "workspace_calendar_event":
      return `/experiments?tab=calendar&eventId=${link.objectId}`;
    case "reagent":
      return `/experiments?tab=reagents&reagentId=${link.objectId}`;
    case "protocol":
      return `/experiments?tab=protocols&protocolId=${link.objectId}`;
    case "task":
      return `/tasks?task=${link.objectId}`;
    default:
      return null;
  }
}

export function resolveNotificationHref({
  category,
  sourceId,
  links,
}: {
  category: NotificationCategory;
  sourceId: string | null;
  links: NotificationLinkRef[];
}) {
  if (sourceId?.startsWith("announcement:")) {
    return "/labs?panel=announcements";
  }

  for (const link of links) {
    const href = linkHrefForObject(link);
    if (href) return href;
  }

  if (category === "protocol") {
    const protocolId = parseSourceObjectId(sourceId, "protocol");
    return protocolId ? `/experiments?tab=protocols&protocolId=${protocolId}` : "/experiments?tab=protocols";
  }

  if (category === "reagent") {
    const reagentId = parseSourceObjectId(sourceId, "reagent");
    return reagentId ? `/experiments?tab=reagents&reagentId=${reagentId}` : "/experiments?tab=reagents";
  }

  if (category === "booking") {
    const eventId = parseSourceObjectId(sourceId, "calendar_event");
    return eventId ? `/experiments?tab=calendar&eventId=${eventId}` : "/experiments?tab=calendar";
  }

  if (category === "ai" || category === "run") {
    const templateId = parseSourceObjectId(sourceId, "template");
    if (templateId) return `/experiments?tab=templates&templateId=${templateId}`;
    return "/results";
  }

  if (category === "chat") {
    return "/labs/chat";
  }

  return "/tasks";
}
