import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ReagentRow = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  needs_reorder: boolean;
  last_ordered_at: string | null;
  storage_location: string | null;
  supplier: string | null;
  notes: string | null;
};

type StockEventRow = {
  id: string;
  lab_reagent_id: string;
  event_type: string;
  quantity_delta: number | null;
  vendor: string | null;
  purchase_order_number: string | null;
  expected_arrival_at: string | null;
  notes: string | null;
  created_at: string;
};

type EquipmentRow = {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
  booking_requires_approval: boolean;
};

type BookingRow = {
  id: string;
  equipment_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type Citation = {
  id: string;
  label: string;
  kind: "reagent" | "stock_event" | "equipment" | "booking" | "thread" | "message";
};

type LabMemberOption = {
  userId: string;
  label: string;
  email: string | null;
};

type LabNoteSnippet = {
  messageId: string;
  threadId: string;
  threadSubject: string | null;
  createdAt: string;
  body: string;
};

type ActionLogRow = {
  id: string;
  action_kind: string;
  outcome: "planned" | "confirmed" | "executed" | "denied" | "failed" | "cancelled";
  outcome_message: string | null;
  actor_user_id: string;
  created_at: string;
};

type ActionPlan =
  | {
      kind: "create_booking";
      equipmentId: string;
      equipmentName: string;
      title: string;
      startsAt: string;
      endsAt: string;
      notes?: string | null;
    }
  | {
      kind: "announcement_draft";
      title: string;
      body: string;
    }
  | {
      kind: "announcement_post";
      title: string;
      body: string;
    }
  | {
      kind: "direct_message";
      recipientUserIds: string[];
      recipientLabels: string[];
      title: string;
      body: string;
    }
  | {
      kind: "group_message";
      recipientUserIds: string[];
      recipientLabels: string[];
      title: string;
      body: string;
    }
  | {
      kind: "create_group_chat";
      recipientUserIds: string[];
      recipientLabels: string[];
      title: string;
    }
  | {
      kind: "add_reagent";
      name: string;
      quantity: number;
      unit?: string | null;
      supplier?: string | null;
      storageLocation?: string | null;
      notes?: string | null;
    }
  | {
      kind: "remove_reagent";
      reagentId: string;
      reagentName: string;
    }
  | {
      kind: "add_equipment";
      name: string;
      location?: string | null;
      description?: string | null;
      bookingRequiresApproval?: boolean;
    }
  | {
      kind: "remove_equipment";
      equipmentId: string;
      equipmentName: string;
    }
  | {
      kind: "update_booking_status";
      bookingId: string;
      equipmentName: string;
      status: "cancelled" | "confirmed" | "completed" | "in_use";
    }
  | {
      kind: "create_meeting";
      title: string;
      meetingDate: string;
    }
  | {
      kind: "clarification_required";
      title: string;
      options: string[];
      body: string;
    };

const HIGH_IMPACT_ACTIONS = new Set<ActionPlan["kind"]>([
  "announcement_post",
  "remove_reagent",
  "remove_equipment",
  "update_booking_status",
  "direct_message",
  "group_message",
  "create_group_chat",
]);

function requiresConfirmation(action: ActionPlan) {
  return HIGH_IMPACT_ACTIONS.has(action.kind);
}

function normalizeName(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeWordsToDigits(input: string) {
  return input
    .toLowerCase()
    .replace(/\bone\b/g, "1")
    .replace(/\btwo\b/g, "2")
    .replace(/\bthree\b/g, "3")
    .replace(/\bfour\b/g, "4")
    .replace(/\bfive\b/g, "5")
    .replace(/\bsix\b/g, "6")
    .replace(/\bseven\b/g, "7")
    .replace(/\beight\b/g, "8")
    .replace(/\bnine\b/g, "9")
    .replace(/\bten\b/g, "10");
}

function tokenizeName(input: string) {
  return normalizeWordsToDigits(input)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function fuzzyFindEquipment(question: string, equipment: EquipmentRow[]) {
  const qTokens = tokenizeName(question);
  if (qTokens.length === 0 || equipment.length === 0) return [];
  const scored = equipment.map((item) => {
    const eTokens = tokenizeName(item.name);
    let score = 0;
    for (const eToken of eTokens) {
      if (eToken.length < 2) continue;
      for (const qToken of qTokens) {
        if (qToken === eToken) {
          score += 3;
          break;
        }
        if (qToken.length >= 4 && eToken.length >= 4 && levenshtein(qToken, eToken) <= 1) {
          score += 2;
          break;
        }
      }
    }
    return { item, score };
  });
  const best = scored.reduce((max, current) => Math.max(max, current.score), 0);
  if (best < 2) return [];
  return scored
    .filter((entry) => entry.score >= best - 1)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, 8);
}

function resolveEntityByName<T extends { id: string; name: string }>(
  items: T[],
  requestedName: string,
) {
  const needle = normalizeName(requestedName);
  if (!needle) return { exact: null as T | null, partial: [] as T[] };
  const exact = items.find((item) => normalizeName(item.name) === needle) ?? null;
  if (exact) return { exact, partial: [exact] };
  const partial = items.filter((item) => normalizeName(item.name).includes(needle));
  return { exact: null, partial };
}

function parseActionPlan(raw: unknown): ActionPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  switch (kind) {
    case "create_booking":
      if (
        typeof payload.equipmentId !== "string" ||
        typeof payload.equipmentName !== "string" ||
        typeof payload.title !== "string" ||
        typeof payload.startsAt !== "string" ||
        typeof payload.endsAt !== "string"
      ) return null;
      return {
        kind,
        equipmentId: payload.equipmentId,
        equipmentName: payload.equipmentName,
        title: payload.title,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        notes: typeof payload.notes === "string" ? payload.notes : null,
      };
    case "announcement_draft":
    case "announcement_post":
      if (typeof payload.title !== "string" || typeof payload.body !== "string") return null;
      return { kind, title: payload.title, body: payload.body };
    case "direct_message":
    case "group_message":
      if (
        !Array.isArray(payload.recipientUserIds) ||
        !Array.isArray(payload.recipientLabels) ||
        typeof payload.title !== "string" ||
        typeof payload.body !== "string"
      ) return null;
      return {
        kind,
        recipientUserIds: payload.recipientUserIds.filter((v): v is string => typeof v === "string"),
        recipientLabels: payload.recipientLabels.filter((v): v is string => typeof v === "string"),
        title: payload.title,
        body: payload.body,
      };
    case "create_group_chat":
      if (
        !Array.isArray(payload.recipientUserIds) ||
        !Array.isArray(payload.recipientLabels) ||
        typeof payload.title !== "string"
      ) return null;
      return {
        kind,
        recipientUserIds: payload.recipientUserIds.filter((v): v is string => typeof v === "string"),
        recipientLabels: payload.recipientLabels.filter((v): v is string => typeof v === "string"),
        title: payload.title,
      };
    case "add_reagent":
      if (typeof payload.name !== "string") return null;
      return {
        kind,
        name: payload.name,
        quantity: typeof payload.quantity === "number" ? payload.quantity : Number(payload.quantity ?? 0) || 0,
        unit: typeof payload.unit === "string" ? payload.unit : null,
        supplier: typeof payload.supplier === "string" ? payload.supplier : null,
        storageLocation: typeof payload.storageLocation === "string" ? payload.storageLocation : null,
        notes: typeof payload.notes === "string" ? payload.notes : null,
      };
    case "remove_reagent":
      if (typeof payload.reagentId !== "string" || typeof payload.reagentName !== "string") return null;
      return { kind, reagentId: payload.reagentId, reagentName: payload.reagentName };
    case "add_equipment":
      if (typeof payload.name !== "string") return null;
      return {
        kind,
        name: payload.name,
        location: typeof payload.location === "string" ? payload.location : null,
        description: typeof payload.description === "string" ? payload.description : null,
        bookingRequiresApproval: payload.bookingRequiresApproval === true,
      };
    case "remove_equipment":
      if (typeof payload.equipmentId !== "string" || typeof payload.equipmentName !== "string") return null;
      return { kind, equipmentId: payload.equipmentId, equipmentName: payload.equipmentName };
    case "update_booking_status":
      if (
        typeof payload.bookingId !== "string" ||
        typeof payload.equipmentName !== "string" ||
        (payload.status !== "cancelled" &&
          payload.status !== "confirmed" &&
          payload.status !== "completed" &&
          payload.status !== "in_use")
      ) return null;
      return { kind, bookingId: payload.bookingId, equipmentName: payload.equipmentName, status: payload.status };
    case "create_meeting":
      if (typeof payload.title !== "string" || typeof payload.meetingDate !== "string") return null;
      return { kind, title: payload.title, meetingDate: payload.meetingDate };
    case "clarification_required":
      if (typeof payload.title !== "string" || typeof payload.body !== "string" || !Array.isArray(payload.options)) return null;
      return {
        kind,
        title: payload.title,
        body: payload.body,
        options: payload.options.filter((v): v is string => typeof v === "string"),
      };
    default:
      return null;
  }
}

function looksLikeLocationQuestion(input: string) {
  return /\b(where|location|stored|store|shelf|freezer|fridge|rack)\b/i.test(input);
}

function looksLikeArrivalQuestion(input: string) {
  return /\b(arrive|arrival|eta|when|ordered|order|delivery|delivered|receive|received)\b/i.test(input);
}

function looksLikeEquipmentQuestion(input: string) {
  return /\b(equipment|microscope|centrifuge|incubator|hood|book|booking|available|free|calendar)\b/i.test(input);
}

function looksLikeBookingRequest(input: string) {
  return /\b(book|booking|reserve|schedule)\b/i.test(input);
}

function looksLikeAnnouncementRequest(input: string) {
  return /\b(announcement|announce|post update|lab update|notice)\b/i.test(input);
}

function looksLikeDraftRequest(input: string) {
  return /\b(draft|prepare|write)\b/i.test(input);
}

function looksLikeMessageRequest(input: string) {
  return /\b(message|dm|direct message|group chat|chat with|tell)\b/i.test(input);
}

function looksLikeGroupChatCreate(input: string) {
  return /\b(create|start|open)\b.*\b(group chat|group thread|chat thread)\b/i.test(input);
}

function looksLikeAddReagent(input: string) {
  return /\b(add|create|new)\b.*\breagent\b/i.test(input);
}

function looksLikeRemoveReagent(input: string) {
  return /\b(remove|delete)\b.*\breagent\b/i.test(input);
}

function looksLikeAddEquipment(input: string) {
  return /\b(add|create|new)\b.*\bequipment\b/i.test(input);
}

function looksLikeRemoveEquipment(input: string) {
  return /\b(remove|delete)\b.*\bequipment\b/i.test(input);
}

function looksLikeBookingStatusChange(input: string) {
  return /\b(cancel|confirm|complete|mark in use)\b.*\bbooking\b/i.test(input);
}

function looksLikeMeetingCreateRequest(input: string) {
  return /\b(create|start|schedule|add|open)\b.*\bmeeting\b/i.test(input);
}

function findReagentMentions(question: string, reagents: ReagentRow[]) {
  const q = question.toLowerCase();
  return reagents.filter((r) => q.includes(r.name.toLowerCase()));
}

function findEquipmentMentions(question: string, equipment: EquipmentRow[]) {
  const q = question.toLowerCase();
  return equipment.filter((e) => q.includes(e.name.toLowerCase()));
}

function formatDate(value: string | null) {
  if (!value) return "unknown date";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string | null) {
  if (!value) return "unknown time";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function callHuggingFace(prompt: string) {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  if (!apiKey) return null;

  const model = process.env.HUGGINGFACE_MODEL || "Qwen/Qwen3.5-27B";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  let res: Response;
  try {
    res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 180,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    return null;
  }
  clearTimeout(timeout);

  if (!res.ok) return null;
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return null;
}

function enforceConciseAnswer(answer: string) {
  const cleaned = answer
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 320) return cleaned;
  return `${cleaned.slice(0, 320).trimEnd()}...`;
}

function parseRequestedBookingWindow(question: string, now: Date) {
  const q = question.toLowerCase();
  const match = q.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const minute = match?.[2] ? Number(match[2]) : 0;
  let hour = match?.[1] ? Number(match[1]) : NaN;
  const meridiem = match?.[3];
  if (Number.isFinite(hour)) {
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  }

  const start = new Date(now);
  if (q.includes("tomorrow")) {
    start.setDate(start.getDate() + 1);
  }
  if (q.includes("tonight") && (!Number.isFinite(hour) || hour < 12)) {
    hour = 19;
  }

  if (!Number.isFinite(hour)) {
    const fallbackStart = new Date(now.getTime() + 60 * 60 * 1000);
    const fallbackEnd = new Date(fallbackStart.getTime() + 60 * 60 * 1000);
    return { startsAt: fallbackStart.toISOString(), endsAt: fallbackEnd.toISOString() };
  }

  start.setHours(hour, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (start.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 1);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function parseRequestedDurationMinutes(question: string) {
  const q = question.toLowerCase();
  const hours = q.match(/for\s+(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs)\b/);
  if (hours) {
    const value = Number(hours[1]);
    if (Number.isFinite(value) && value > 0) return Math.round(value * 60);
  }
  const minutes = q.match(/for\s+(\d+)\s*(minute|minutes|min|mins)\b/);
  if (minutes) {
    const value = Number(minutes[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function inferMeetingDate(question: string) {
  const q = question.toLowerCase();
  const explicit = q.match(/\bon\s+(\d{4}-\d{2}-\d{2})\b/);
  if (explicit?.[1]) return explicit[1];
  const now = new Date();
  if (q.includes("tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function inferMeetingTitle(question: string) {
  const cleaned = question
    .replace(/^(please\s+)?(can you\s+)?/i, "")
    .replace(/\b(create|start|schedule|add|open)\b\s+(a\s+|new\s+)?(lab\s+)?meeting(\s+(called|titled))?/i, "")
    .replace(/\bon\s+\d{4}-\d{2}-\d{2}\b/i, "")
    .replace(/\b(today|tomorrow)\b/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "";
}

function hasExplicitBookingEndOrDuration(question: string) {
  const q = question.toLowerCase();
  if (/\bfor\s+\d/.test(q)) return true;
  if (/\buntil\s+\d/.test(q)) return true;
  if (/\bfrom\b.+\bto\b/.test(q)) return true;
  return false;
}

function uniqueEquipmentByName(items: EquipmentRow[]) {
  const map = new Map<string, EquipmentRow>();
  for (const item of items) {
    const key = normalizeName(item.name);
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }
    const existing = map.get(key)!;
    if (!existing.is_active && item.is_active) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function extractExplicitEquipmentName(question: string) {
  const match = question.match(/selected equipment\s*:\s*(.+)$/im) || question.match(/equipment\s*:\s*(.+)$/im);
  return match?.[1]?.trim() || "";
}

function shouldUseHfForFinalAnswer(question: string, actionPlan: ActionPlan | null) {
  if (actionPlan) return false;
  if (looksLikeLocationQuestion(question)) return false;
  if (looksLikeArrivalQuestion(question)) return false;
  if (looksLikeEquipmentQuestion(question)) return false;
  if (looksLikeBookingRequest(question)) return false;
  if (looksLikeAnnouncementRequest(question)) return false;
  if (looksLikeMessageRequest(question)) return false;
  if (looksLikeAddReagent(question) || looksLikeRemoveReagent(question)) return false;
  if (looksLikeAddEquipment(question) || looksLikeRemoveEquipment(question)) return false;
  if (looksLikeBookingStatusChange(question)) return false;
  if (looksLikeMeetingCreateRequest(question)) return false;
  return true;
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function buildActionPlan(
  question: string,
  equipment: EquipmentRow[],
  members: LabMemberOption[],
  reagents: ReagentRow[],
  bookingsByEquipment: Map<string, BookingRow[]>,
): Promise<ActionPlan | null> {
  const mentionedEquipment = findEquipmentMentions(question, equipment);
  const mentionedReagents = findReagentMentions(question, reagents);

  if (looksLikeAnnouncementRequest(question) && looksLikeDraftRequest(question)) {
    const draftPrompt = [
      "Draft a concise lab announcement.",
      "Return JSON with keys: title, body.",
      `Request: ${question}`,
    ].join("\n");
    const draft = await callHuggingFace(draftPrompt);
    const parsed = draft ? extractJsonObject(draft) : null;
    const title = typeof parsed?.title === "string" ? parsed.title.trim() : "Lab update";
    const body = typeof parsed?.body === "string" ? parsed.body.trim() : question;
    return { kind: "announcement_draft", title, body };
  }

  if (looksLikeAnnouncementRequest(question) && /\b(post|publish|send)\b/i.test(question)) {
    const draftPrompt = [
      "Convert this into a clear lab announcement.",
      "Return JSON with keys: title, body.",
      `Request: ${question}`,
    ].join("\n");
    const draft = await callHuggingFace(draftPrompt);
    const parsed = draft ? extractJsonObject(draft) : null;
    const title = typeof parsed?.title === "string" ? parsed.title.trim() : "Lab update";
    const body = typeof parsed?.body === "string" ? parsed.body.trim() : question;
    return { kind: "announcement_post", title, body };
  }

  if (looksLikeBookingRequest(question)) {
    const explicitEquipmentName = extractExplicitEquipmentName(question);
    const explicitResolved = explicitEquipmentName
      ? resolveEntityByName(equipment, explicitEquipmentName)
      : { exact: null as EquipmentRow | null, partial: [] as EquipmentRow[] };
    const fuzzyMatches = mentionedEquipment.length > 0 ? mentionedEquipment : fuzzyFindEquipment(question, equipment);
    const uniqueMatches = uniqueEquipmentByName(fuzzyMatches);
    if (!explicitResolved.exact && uniqueMatches.length > 1) {
      return {
        kind: "clarification_required",
        title: "Multiple equipment matches",
        body: "Which equipment did you mean?",
        options: uniqueMatches.slice(0, 8).map((item) => item.name),
      };
    }

    const now = new Date();
    const parsePrompt = [
      "Extract booking intent as JSON.",
      "Return JSON only with keys: equipmentName, title, startsAtIso, endsAtIso, notes.",
      "Use timezone from the user locale and if missing, choose startsAtIso=now+1h and endsAtIso=startsAtIso+1h.",
      `Now: ${now.toISOString()}`,
      `Request: ${question}`,
    ].join("\n");

    const parsedRaw = await callHuggingFace(parsePrompt);
    const parsed = parsedRaw ? extractJsonObject(parsedRaw) : null;
    const parsedEquipmentName = typeof parsed?.equipmentName === "string" ? parsed.equipmentName.trim() : "";
    const resolvedFromParsed = parsedEquipmentName ? resolveEntityByName(equipment, parsedEquipmentName) : { exact: null, partial: [] };
    const parsedWindow = parseRequestedBookingWindow(question, now);
    const equip =
      explicitResolved.exact ||
      uniqueMatches[0] ||
      resolvedFromParsed.exact ||
      (resolvedFromParsed.partial.length === 1 ? resolvedFromParsed.partial[0] : null);
    if (!equip) {
      if (resolvedFromParsed.partial.length > 1) {
        return {
          kind: "clarification_required",
          title: "Equipment not unique",
          body: `I found multiple matches for "${parsedEquipmentName}". Which one should I use?`,
          options: resolvedFromParsed.partial.slice(0, 8).map((item) => item.name),
        };
      }
      return null;
    }

    if (!hasExplicitBookingEndOrDuration(question)) {
      return {
        kind: "clarification_required",
        title: "Booking duration needed",
        body: `How long should I book ${equip.name} for?`,
        options: ["30 minutes", "1 hour", "2 hours"],
      };
    }

    const startsRaw = typeof parsed?.startsAtIso === "string" ? parsed.startsAtIso : null;
    const endsRaw = typeof parsed?.endsAtIso === "string" ? parsed.endsAtIso : null;

    const fallbackStart = parsedWindow.startsAt;
    const requestedDuration = parseRequestedDurationMinutes(question);
    const fallbackEnd = requestedDuration
      ? new Date(new Date(fallbackStart).getTime() + requestedDuration * 60 * 1000).toISOString()
      : parsedWindow.endsAt;

    const starts = startsRaw && !Number.isNaN(new Date(startsRaw).getTime()) ? new Date(startsRaw).toISOString() : fallbackStart;
    const ends = endsRaw && !Number.isNaN(new Date(endsRaw).getTime()) ? new Date(endsRaw).toISOString() : fallbackEnd;

    const title = typeof parsed?.title === "string" && parsed.title.trim().length > 0
      ? parsed.title.trim()
      : `Booking: ${equip.name}`;

    const notes = typeof parsed?.notes === "string" ? parsed.notes.trim() : null;

    return {
      kind: "create_booking",
      equipmentId: equip.id,
      equipmentName: equip.name,
      title,
      startsAt: starts,
      endsAt: ends,
      notes,
    };
  }

  if (looksLikeMeetingCreateRequest(question)) {
    const title = inferMeetingTitle(question);
    if (!title) {
      return {
        kind: "clarification_required",
        title: "Meeting title needed",
        body: "What should I call this meeting?",
        options: ["Weekly Lab Meeting", "PI Sync", "Project Update"],
      };
    }
    return {
      kind: "create_meeting",
      title,
      meetingDate: inferMeetingDate(question),
    };
  }

  if (looksLikeMessageRequest(question) && members.length > 0) {
    const parserPrompt = [
      "Extract a chat action from this request as JSON.",
      "Allowed keys: recipientLabels(array), title(string), body(string).",
      "Use recipient labels from this list only:",
      members.map((m) => `- ${m.label}${m.email ? ` (${m.email})` : ""}`).join("\n"),
      `Request: ${question}`,
      "If no message intent exists, return {}.",
    ].join("\n");
    const raw = await callHuggingFace(parserPrompt);
    const parsed = raw ? extractJsonObject(raw) : null;
    const recipientLabelsRaw = Array.isArray(parsed?.recipientLabels)
      ? (parsed?.recipientLabels as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const normalizedRecipients = recipientLabelsRaw.map((v) => v.toLowerCase().trim());
    const matched = members.filter((m) =>
      normalizedRecipients.some((label) =>
        m.label.toLowerCase() === label || (m.email ? m.email.toLowerCase() === label : false)
      )
    );

    const fallbackMatched = matched.length > 0
      ? matched
      : members.filter((m) => question.toLowerCase().includes(m.label.toLowerCase()));

    if (fallbackMatched.length > 0) {
      const title = typeof parsed?.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : fallbackMatched.length > 1
          ? "Group chat"
          : `DM: ${fallbackMatched[0].label}`;
      const body = typeof parsed?.body === "string" && parsed.body.trim()
        ? parsed.body.trim()
        : question;

      if (fallbackMatched.length === 1) {
        return {
          kind: "direct_message",
          recipientUserIds: [fallbackMatched[0].userId],
          recipientLabels: [fallbackMatched[0].label],
          title,
          body,
        };
      }

      return {
        kind: "group_message",
        recipientUserIds: fallbackMatched.map((m) => m.userId),
        recipientLabels: fallbackMatched.map((m) => m.label),
        title,
        body,
      };
    }
  }

  if (looksLikeGroupChatCreate(question) && members.length > 0) {
    const parserPrompt = [
      "Extract a group chat creation request as JSON.",
      "Return JSON with keys: recipientLabels(array), title(string).",
      "Use recipient labels from this list only:",
      members.map((m) => `- ${m.label}${m.email ? ` (${m.email})` : ""}`).join("\n"),
      `Request: ${question}`,
    ].join("\n");
    const raw = await callHuggingFace(parserPrompt);
    const parsed = raw ? extractJsonObject(raw) : null;
    const recipientLabelsRaw = Array.isArray(parsed?.recipientLabels)
      ? (parsed?.recipientLabels as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const normalized = recipientLabelsRaw.map((v) => v.toLowerCase().trim());
    const matched = members.filter((m) => normalized.includes(m.label.toLowerCase()) || (m.email ? normalized.includes(m.email.toLowerCase()) : false));
    const fallbackMatched = matched.length > 0
      ? matched
      : members.filter((m) => question.toLowerCase().includes(m.label.toLowerCase()));
    if (fallbackMatched.length >= 2) {
      return {
        kind: "create_group_chat",
        recipientUserIds: fallbackMatched.map((m) => m.userId),
        recipientLabels: fallbackMatched.map((m) => m.label),
        title: typeof parsed?.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Group chat",
      };
    }
  }

  if (looksLikeAddReagent(question)) {
    const parsePrompt = [
      "Extract reagent creation fields as JSON.",
      "Return JSON keys: name, quantity, unit, supplier, storageLocation, notes.",
      `Request: ${question}`,
    ].join("\n");
    const raw = await callHuggingFace(parsePrompt);
    const parsed = raw ? extractJsonObject(raw) : null;
    const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
    if (name) {
      const quantity = typeof parsed?.quantity === "number" ? parsed.quantity : Number(parsed?.quantity ?? 0) || 0;
      return {
        kind: "add_reagent",
        name,
        quantity,
        unit: typeof parsed?.unit === "string" ? parsed.unit.trim() : null,
        supplier: typeof parsed?.supplier === "string" ? parsed.supplier.trim() : null,
        storageLocation: typeof parsed?.storageLocation === "string" ? parsed.storageLocation.trim() : null,
        notes: typeof parsed?.notes === "string" ? parsed.notes.trim() : null,
      };
    }
  }

  if (looksLikeRemoveReagent(question)) {
    if (mentionedReagents.length > 1) {
      return {
        kind: "clarification_required",
        title: "Multiple reagents matched",
        body: "I found multiple reagent names in your request. Choose one and resend.",
        options: mentionedReagents.slice(0, 8).map((item) => item.name),
      };
    }
    if (mentionedReagents.length === 0) return null;
    return {
      kind: "remove_reagent",
      reagentId: mentionedReagents[0].id,
      reagentName: mentionedReagents[0].name,
    };
  }

  if (looksLikeAddEquipment(question)) {
    const parsePrompt = [
      "Extract equipment creation fields as JSON.",
      "Return JSON keys: name, location, description, bookingRequiresApproval.",
      `Request: ${question}`,
    ].join("\n");
    const raw = await callHuggingFace(parsePrompt);
    const parsed = raw ? extractJsonObject(raw) : null;
    const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
    if (name) {
      return {
        kind: "add_equipment",
        name,
        location: typeof parsed?.location === "string" ? parsed.location.trim() : null,
        description: typeof parsed?.description === "string" ? parsed.description.trim() : null,
        bookingRequiresApproval: parsed?.bookingRequiresApproval === true,
      };
    }
  }

  if (looksLikeRemoveEquipment(question)) {
    if (mentionedEquipment.length > 1) {
      return {
        kind: "clarification_required",
        title: "Multiple equipment matched",
        body: "I found multiple equipment names in your request. Choose one and resend.",
        options: mentionedEquipment.slice(0, 8).map((item) => item.name),
      };
    }
    if (mentionedEquipment.length === 0) return null;
    return {
      kind: "remove_equipment",
      equipmentId: mentionedEquipment[0].id,
      equipmentName: mentionedEquipment[0].name,
    };
  }

  if (looksLikeBookingStatusChange(question)) {
    if (mentionedEquipment.length > 1) {
      return {
        kind: "clarification_required",
        title: "Multiple equipment matched",
        body: "I found multiple equipment names in your request. Choose one and resend.",
        options: mentionedEquipment.slice(0, 8).map((item) => item.name),
      };
    }
    if (mentionedEquipment.length === 0) return null;
    const equip = mentionedEquipment[0];
    const list = (bookingsByEquipment.get(equip.id) ?? [])
      .filter((b) => b.status !== "cancelled" && b.status !== "completed")
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const target = list[0];
    if (target) {
      const q = question.toLowerCase();
      const status: "cancelled" | "confirmed" | "completed" | "in_use" =
        q.includes("cancel")
          ? "cancelled"
          : q.includes("confirm")
          ? "confirmed"
          : q.includes("in use")
          ? "in_use"
          : "completed";
      return {
        kind: "update_booking_status",
        bookingId: target.id,
        equipmentName: equip.name,
        status,
      };
    }
  }

  return null;
}

function actionPlanPreview(actionPlan: ActionPlan) {
  if (actionPlan.kind === "create_booking") {
    return `Ready to book ${actionPlan.equipmentName} at ${formatDateTime(actionPlan.startsAt)}. Click Execute to confirm.`;
  }
  if (actionPlan.kind === "announcement_draft") {
    return `Draft ready: "${actionPlan.title}". Click Execute to generate it.`;
  }
  if (actionPlan.kind === "announcement_post") {
    return `Ready to post announcement "${actionPlan.title}". Click Review Action to confirm.`;
  }
  if (actionPlan.kind === "direct_message") {
    return `Ready to send a DM to ${actionPlan.recipientLabels[0]}.`;
  }
  if (actionPlan.kind === "group_message") {
    return `Ready to send a group message to ${actionPlan.recipientLabels.join(", ")}.`;
  }
  if (actionPlan.kind === "create_group_chat") {
    return `Ready to create group chat "${actionPlan.title}".`;
  }
  if (actionPlan.kind === "add_reagent") {
    return `Ready to add reagent "${actionPlan.name}".`;
  }
  if (actionPlan.kind === "remove_reagent") {
    return `Ready to remove reagent "${actionPlan.reagentName}".`;
  }
  if (actionPlan.kind === "add_equipment") {
    return `Ready to add equipment "${actionPlan.name}".`;
  }
  if (actionPlan.kind === "remove_equipment") {
    return `Ready to remove equipment "${actionPlan.equipmentName}".`;
  }
  if (actionPlan.kind === "update_booking_status") {
    return `Ready to set ${actionPlan.equipmentName} booking to "${actionPlan.status}".`;
  }
  if (actionPlan.kind === "create_meeting") {
    return `Ready to create meeting "${actionPlan.title}" on ${actionPlan.meetingDate}. Click Execute to confirm.`;
  }
  return actionPlan.body;
}

function answerFromStructuredData(
  question: string,
  reagents: ReagentRow[],
  eventsByReagent: Map<string, StockEventRow[]>,
  equipment: EquipmentRow[],
  bookingsByEquipment: Map<string, BookingRow[]>
) {
  const citations: Citation[] = [];
  const mentioned = findReagentMentions(question, reagents);
  const mentionedEquipment = findEquipmentMentions(question, equipment);
  const targets = mentioned.length > 0 ? mentioned : reagents.slice(0, 4);

  if (looksLikeEquipmentQuestion(question) && mentionedEquipment.length > 0) {
    const lines = mentionedEquipment.map((item) => {
      citations.push({ kind: "equipment", id: item.id, label: item.name });
      const list = (bookingsByEquipment.get(item.id) ?? [])
        .filter((b) => b.status !== "cancelled" && b.status !== "completed")
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

      const now = Date.now();
      const current = list.find((b) => new Date(b.starts_at).getTime() <= now && new Date(b.ends_at).getTime() >= now);
      if (current) {
        citations.push({ kind: "booking", id: current.id, label: `${item.name} booking` });
        return `- ${item.name}: at ${item.location || "no location recorded"}, currently booked until ${formatDateTime(current.ends_at)}.`;
      }
      const upcoming = list.find((b) => new Date(b.starts_at).getTime() > now);
      if (upcoming) {
        citations.push({ kind: "booking", id: upcoming.id, label: `${item.name} booking` });
        return `- ${item.name}: at ${item.location || "no location recorded"}, currently free; next booking starts ${formatDateTime(upcoming.starts_at)}.`;
      }
      return `- ${item.name}: at ${item.location || "no location recorded"}, currently free (no upcoming booking recorded).`;
    });
    return { answer: lines.join("\n"), citations };
  }

  if (looksLikeEquipmentQuestion(question) && mentionedEquipment.length === 0) {
    const names = equipment.slice(0, 8).map((e) => e.name).join(", ");
    return {
      answer: names
        ? `Please include the equipment name. Available equipment includes: ${names}.`
        : "No equipment is recorded for this lab yet.",
      citations,
    };
  }

  if (looksLikeLocationQuestion(question) && mentioned.length > 0) {
    const lines = mentioned.map((r) => {
      citations.push({ kind: "reagent", id: r.id, label: r.name });
      return `- ${r.name}: ${r.storage_location || "no storage location recorded"}`;
    });
    return { answer: `Here are the recorded storage locations:\n${lines.join("\n")}`, citations };
  }

  if (looksLikeArrivalQuestion(question) && mentioned.length > 0) {
    const lines = mentioned.map((r) => {
      citations.push({ kind: "reagent", id: r.id, label: r.name });
      const events = eventsByReagent.get(r.id) ?? [];
      const placed = events.find((e) => e.event_type === "reorder_placed");
      const received = events.find((e) => e.event_type === "reorder_received");
      const requested = events.find((e) => e.event_type === "reorder_request");
      if (received) {
        citations.push({ kind: "stock_event", id: received.id, label: `${r.name} received` });
        return `- ${r.name}: received on ${formatDate(received.created_at)}.`;
      }
      if (placed) {
        citations.push({ kind: "stock_event", id: placed.id, label: `${r.name} placed` });
        const eta = placed.expected_arrival_at ? ` ETA ${formatDateTime(placed.expected_arrival_at)}.` : " ETA is not recorded.";
        const po = placed.purchase_order_number ? ` PO ${placed.purchase_order_number}.` : "";
        return `- ${r.name}: order placed on ${formatDate(placed.created_at)}${placed.vendor ? ` with ${placed.vendor}` : ""}.${po}${eta}`;
      }
      if (requested) {
        citations.push({ kind: "stock_event", id: requested.id, label: `${r.name} requested` });
        return `- ${r.name}: reorder requested on ${formatDate(requested.created_at)}, but no placed order is recorded yet.`;
      }
      return `- ${r.name}: no active reorder event is recorded.`;
    });
    return { answer: `From the reorder timeline:\n${lines.join("\n")}`, citations };
  }

  if (mentioned.length === 0 && (looksLikeLocationQuestion(question) || looksLikeArrivalQuestion(question))) {
    return {
      answer: "I can answer that precisely if you include the reagent name (for example: \"Where is DMEM High Glucose?\").",
      citations,
    };
  }

  const snapshot = targets.map((r) => {
    citations.push({ kind: "reagent", id: r.id, label: r.name });
    const events = eventsByReagent.get(r.id) ?? [];
    const latest = events[0];
    if (latest) citations.push({ kind: "stock_event", id: latest.id, label: `${r.name} latest event` });
    return `- ${r.name}: qty ${r.quantity}${r.unit ? ` ${r.unit}` : ""}, location ${r.storage_location || "n/a"}, reorder ${r.needs_reorder ? "needed" : "not needed"}${latest ? `, latest event ${latest.event_type} (${formatDate(latest.created_at)})` : ""}`;
  });
  return { answer: `Here is a quick inventory snapshot for this lab:\n${snapshot.join("\n")}`, citations };
}

async function ensureGeneralLabThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labId: string,
  userId: string,
) {
  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("lab_id", labId)
    .eq("linked_object_type", "lab")
    .eq("linked_object_id", labId)
    .ilike("subject", "General")
    .limit(1)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data: created, error } = await supabase
    .from("message_threads")
    .insert({
      lab_id: labId,
      owner_user_id: null,
      recipient_scope: "lab",
      subject: "General",
      linked_object_type: "lab",
      linked_object_id: labId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created?.id) return null;
  return String(created.id);
}

async function ensureParticipantThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labId: string,
  userId: string,
  participantUserIds: string[],
  subject: string,
) {
  const allParticipants = [...new Set([userId, ...participantUserIds])];

  const { data: candidateThreads } = await supabase
    .from("message_threads")
    .select("id")
    .eq("lab_id", labId)
    .eq("recipient_scope", "participants")
    .eq("linked_object_type", "lab")
    .eq("linked_object_id", labId)
    .limit(200);

  const threadIds = (candidateThreads || []).map((t) => String(t.id));
  if (threadIds.length > 0) {
    const { data: participants } = await supabase
      .from("message_thread_participants")
      .select("thread_id,user_id")
      .in("thread_id", threadIds);

    const byThread = new Map<string, Set<string>>();
    for (const row of participants || []) {
      const tid = String(row.thread_id);
      if (!byThread.has(tid)) byThread.set(tid, new Set());
      byThread.get(tid)!.add(String(row.user_id));
    }

    const wanted = new Set(allParticipants);
    for (const tid of threadIds) {
      const actual = byThread.get(tid) || new Set<string>();
      if (actual.size !== wanted.size) continue;
      let exact = true;
      for (const uid of wanted) {
        if (!actual.has(uid)) {
          exact = false;
          break;
        }
      }
      if (exact) return tid;
    }
  }

  const { data: createdThread, error: createErr } = await supabase
    .from("message_threads")
    .insert({
      lab_id: labId,
      owner_user_id: null,
      recipient_scope: "participants",
      subject,
      linked_object_type: "lab",
      linked_object_id: labId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (createErr || !createdThread?.id) return null;

  const { error: participantErr } = await supabase
    .from("message_thread_participants")
    .insert(allParticipants.map((uid) => ({ thread_id: String(createdThread.id), user_id: uid, added_by: userId })));
  if (participantErr) return null;

  return String(createdThread.id);
}

async function logAssistantAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    labId: string;
    actorUserId: string;
    actionKind: ActionPlan["kind"] | "none";
    payload: Record<string, unknown>;
    outcome: "planned" | "confirmed" | "executed" | "denied" | "failed" | "cancelled";
    outcomeMessage?: string;
  },
) {
  await supabase.from("lab_assistant_action_logs").insert({
    lab_id: input.labId,
    actor_user_id: input.actorUserId,
    action_kind: input.actionKind,
    action_payload: input.payload,
    outcome: input.outcome,
    outcome_message: input.outcomeMessage || null,
  });
}

function canExecuteAction(
  action: ActionPlan,
  ctx: { canManage: boolean },
) {
  switch (action.kind) {
    case "remove_reagent":
    case "add_equipment":
    case "remove_equipment":
      return ctx.canManage
        ? { ok: true as const }
        : { ok: false as const, error: "Only lab managers/admins can execute this action." };
    case "clarification_required":
      return { ok: false as const, error: "Clarification required before action execution." };
    default:
      return { ok: true as const };
  }
}

function answerFromLabNotes(question: string, notes: LabNoteSnippet[]) {
  if (notes.length === 0) return null;
  const q = question.toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/i).filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  const scored = notes
    .map((note) => {
      const text = note.body.toLowerCase();
      const score = tokens.reduce((sum, token) => (text.includes(token) ? sum + 1 : sum), 0);
      return { note, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const top = scored.slice(0, 3);
  const citations: Citation[] = [];
  const lines = top.map(({ note }) => {
    citations.push({ kind: "thread", id: note.threadId, label: note.threadSubject || "Lab thread" });
    citations.push({ kind: "message", id: note.messageId, label: `Message ${formatDateTime(note.createdAt)}` });
    return `- ${note.threadSubject || "Lab thread"} (${formatDateTime(note.createdAt)}): ${note.body.slice(0, 180)}`;
  });
  return {
    answer: `From recent lab communications:\n${lines.join("\n")}`,
    citations,
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const labId = url.searchParams.get("labId") || "";
    const limitRaw = Number(url.searchParams.get("limit") || "20");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20;
    if (!labId) return NextResponse.json({ error: "labId is required" }, { status: 400 });

    const { data: membership } = await supabase
      .from("lab_members")
      .select("id")
      .eq("lab_id", labId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: logsRaw, error } = await supabase
      .from("lab_assistant_action_logs")
      .select("id,action_kind,outcome,outcome_message,actor_user_id,created_at")
      .eq("lab_id", labId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message || "Failed to load action logs." }, { status: 400 });

    const logs = (logsRaw || []) as ActionLogRow[];
    const actorIds = [...new Set(logs.map((row) => row.actor_user_id))];
    const { data: profiles } = actorIds.length > 0
      ? await supabase.from("profiles").select("id,display_name,email").in("id", actorIds)
      : { data: [] };
    const profileById = new Map(
      (profiles || []).map((row) => [
        String((row as { id: string }).id),
        row as { display_name: string | null; email: string | null },
      ]),
    );

    return NextResponse.json({
      logs: logs.map((row) => {
        const profile = profileById.get(row.actor_user_id);
        const actorLabel = profile?.display_name?.trim() || profile?.email?.trim() || "Lab member";
        return {
          id: row.id,
          actionKind: row.action_kind,
          outcome: row.outcome,
          outcomeMessage: row.outcome_message,
          actorLabel,
          createdAt: row.created_at,
        };
      }),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load logs" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const labId = url.searchParams.get("labId") || "";
    if (!labId) return NextResponse.json({ error: "labId is required" }, { status: 400 });

    const { data: membership } = await supabase
      .from("lab_members")
      .select("id")
      .eq("lab_id", labId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabase
      .from("lab_assistant_action_logs")
      .delete()
      .eq("lab_id", labId)
      .eq("actor_user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to clear action history." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear action history" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const labId = typeof body.labId === "string" ? body.labId : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const execute = body.execute === true;
    const confirm = body.confirm === true;
    const actionPlanRaw = parseActionPlan(body.actionPlan);

    if (!labId) return NextResponse.json({ error: "labId is required" }, { status: 400 });
    if (!question && !execute) return NextResponse.json({ error: "question is required" }, { status: 400 });
    if (execute && !actionPlanRaw) {
      return NextResponse.json({ error: "Valid actionPlan is required for execute." }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("lab_members")
      .select("id,role")
      .eq("lab_id", labId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const canManage = membership.role === "manager" || membership.role === "admin";

    const [{ data: reagentsRaw }, { data: equipmentRaw }, { data: membersRaw }, { data: noteThreadsRaw }] = await Promise.all([
      supabase
        .from("lab_reagents")
        .select("id,name,quantity,unit,needs_reorder,last_ordered_at,storage_location,supplier,notes")
        .eq("lab_id", labId)
        .order("updated_at", { ascending: false })
        .limit(300),
      supabase
        .from("lab_equipment")
        .select("id,name,location,is_active,booking_requires_approval")
        .eq("lab_id", labId)
        .order("name", { ascending: true })
        .limit(300),
      supabase
        .from("lab_members")
        .select("user_id,display_title")
        .eq("lab_id", labId)
        .eq("is_active", true),
      supabase
        .from("message_threads")
        .select("id,subject")
        .eq("lab_id", labId)
        .eq("linked_object_type", "lab")
        .eq("linked_object_id", labId)
        .order("updated_at", { ascending: false })
        .limit(30),
    ]);

    const reagents = (reagentsRaw || []) as ReagentRow[];
    const equipment = (equipmentRaw || []) as EquipmentRow[];
    const memberRows = (membersRaw || []) as Array<{ user_id: string; display_title: string | null }>;
    const memberUserIds = [...new Set(memberRows.map((m) => m.user_id))];
    const { data: memberProfiles } = memberUserIds.length > 0
      ? await supabase.from("profiles").select("id,email,display_name").in("id", memberUserIds)
      : { data: [] };
    const profileById = new Map((memberProfiles || []).map((p) => [String((p as { id: string }).id), p as { email: string | null; display_name: string | null }]));
    const members: LabMemberOption[] = memberRows.map((row) => {
      const profile = profileById.get(row.user_id);
      const label = row.display_title?.trim() || profile?.display_name?.trim() || profile?.email?.trim() || "Lab member";
      return { userId: row.user_id, label, email: profile?.email || null };
    });
    const noteThreads = (noteThreadsRaw || []) as Array<{ id: string; subject: string | null }>;
    const noteThreadIds = noteThreads.map((row) => row.id);
    const { data: noteMessagesRaw } = noteThreadIds.length > 0
      ? await supabase
          .from("messages")
          .select("id,thread_id,body,created_at")
          .in("thread_id", noteThreadIds)
          .order("created_at", { ascending: false })
          .limit(120)
      : { data: [] };
    const threadSubjectById = new Map(noteThreads.map((row) => [String(row.id), row.subject]));
    const noteSnippets = ((noteMessagesRaw || []) as Array<{ id: string; thread_id: string; body: string; created_at: string }>)
      .map((row) => ({
        messageId: String(row.id),
        threadId: String(row.thread_id),
        threadSubject: threadSubjectById.get(String(row.thread_id)) || "Lab thread",
        createdAt: String(row.created_at),
        body: String(row.body || "").replace(/\s+/g, " ").trim(),
      }))
      .filter((row) => row.body.length > 0)
      .slice(0, 80);

    const reagentIds = reagents.map((r) => r.id);
    const equipmentIds = equipment.map((e) => e.id);

    const [{ data: eventsRaw }, { data: bookingsRaw }] = await Promise.all([
      reagentIds.length
        ? supabase
            .from("lab_reagent_stock_events")
            .select("id,lab_reagent_id,event_type,quantity_delta,vendor,purchase_order_number,expected_arrival_at,notes,created_at")
            .in("lab_reagent_id", reagentIds)
            .order("created_at", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [] }),
      equipmentIds.length
        ? supabase
            .from("lab_equipment_bookings")
            .select("id,equipment_id,title,starts_at,ends_at,status")
            .in("equipment_id", equipmentIds)
            .order("starts_at", { ascending: true })
            .limit(3000)
        : Promise.resolve({ data: [] }),
    ]);

    const eventsByReagent = new Map<string, StockEventRow[]>();
    for (const raw of (eventsRaw || []) as StockEventRow[]) {
      const list = eventsByReagent.get(raw.lab_reagent_id) ?? [];
      list.push(raw);
      eventsByReagent.set(raw.lab_reagent_id, list);
    }

    const bookingsByEquipment = new Map<string, BookingRow[]>();
    for (const raw of (bookingsRaw || []) as BookingRow[]) {
      const list = bookingsByEquipment.get(raw.equipment_id) ?? [];
      list.push(raw);
      bookingsByEquipment.set(raw.equipment_id, list);
    }

    if (execute && actionPlanRaw) {
      const citations: Citation[] = [];
      const access = canExecuteAction(actionPlanRaw, { canManage });
      if (!access.ok) {
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "denied",
          outcomeMessage: access.error,
        }).catch(() => undefined);
        return NextResponse.json({ error: access.error }, { status: 403 });
      }
      if (requiresConfirmation(actionPlanRaw) && !confirm) {
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "planned",
          outcomeMessage: "Awaiting user confirmation",
        }).catch(() => undefined);
        return NextResponse.json(
          {
            error: "Confirmation required before executing this action.",
            requiresConfirmation: true,
            actionPlan: actionPlanRaw,
          },
          { status: 409 },
        );
      }
      await logAssistantAction(supabase, {
        labId,
        actorUserId: user.id,
        actionKind: actionPlanRaw.kind,
        payload: actionPlanRaw as unknown as Record<string, unknown>,
        outcome: "confirmed",
      }).catch(() => undefined);

      if (actionPlanRaw.kind === "create_booking") {
        const equipmentMatch = equipment.find((e) => e.id === actionPlanRaw.equipmentId);
        if (!equipmentMatch) {
          return NextResponse.json({ error: "Equipment no longer available for this lab." }, { status: 400 });
        }

        const start = new Date(actionPlanRaw.startsAt);
        const end = new Date(actionPlanRaw.endsAt);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
          return NextResponse.json({ error: "Invalid booking times." }, { status: 400 });
        }

        const { data: booking, error } = await supabase
          .from("lab_equipment_bookings")
          .insert({
            equipment_id: actionPlanRaw.equipmentId,
            booked_by: user.id,
            title: actionPlanRaw.title,
            notes: actionPlanRaw.notes || null,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            status: "draft",
          })
          .select("id,equipment_id,title,starts_at,ends_at,status")
          .single();

        if (error || !booking?.id) {
          return NextResponse.json({ error: error?.message || "Failed to create booking." }, { status: 400 });
        }

        citations.push({ kind: "equipment", id: actionPlanRaw.equipmentId, label: actionPlanRaw.equipmentName });
        citations.push({ kind: "booking", id: String(booking.id), label: String(booking.title) });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Created booking ${String(booking.id)}`,
        }).catch(() => undefined);

        return NextResponse.json({
          executed: true,
          answer: `Booked ${actionPlanRaw.equipmentName} from ${formatDateTime(String(booking.starts_at))} to ${formatDateTime(String(booking.ends_at))} as draft status.`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "announcement_post" || actionPlanRaw.kind === "announcement_draft") {
        if (actionPlanRaw.kind === "announcement_draft") {
          await logAssistantAction(supabase, {
            labId,
            actorUserId: user.id,
            actionKind: actionPlanRaw.kind,
            payload: actionPlanRaw as unknown as Record<string, unknown>,
            outcome: "executed",
            outcomeMessage: "Draft generated",
          }).catch(() => undefined);
          return NextResponse.json({
            executed: true,
            answer: `Draft prepared:\n\n${actionPlanRaw.title}\n${actionPlanRaw.body}`,
            citations,
          });
        }

        const threadId = await ensureGeneralLabThread(supabase, labId, user.id);
        if (!threadId) {
          return NextResponse.json({ error: "Could not find or create General lab thread." }, { status: 400 });
        }

        const bodyText = `ANNOUNCEMENT\n${actionPlanRaw.title}\n\n${actionPlanRaw.body}`;
        const { data: msg, error } = await supabase
          .from("messages")
          .insert({
            thread_id: threadId,
            author_user_id: user.id,
            body: bodyText,
            metadata: { kind: "announcement" },
          })
          .select("id")
          .single();

        if (error || !msg?.id) {
          return NextResponse.json({ error: error?.message || "Failed to post announcement." }, { status: 400 });
        }

        citations.push({ kind: "thread", id: threadId, label: "General" });
        citations.push({ kind: "message", id: String(msg.id), label: actionPlanRaw.title });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Posted announcement message ${String(msg.id)}`,
        }).catch(() => undefined);

        return NextResponse.json({
          executed: true,
          answer: `Posted announcement to the General lab chat thread: ${actionPlanRaw.title}`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "direct_message" || actionPlanRaw.kind === "group_message") {
        const threadId = await ensureParticipantThread(
          supabase,
          labId,
          user.id,
          actionPlanRaw.recipientUserIds,
          actionPlanRaw.title || (actionPlanRaw.kind === "group_message" ? "Group chat" : "Direct message"),
        );
        if (!threadId) {
          return NextResponse.json({ error: "Could not create participant chat thread." }, { status: 400 });
        }

        const { data: msg, error } = await supabase
          .from("messages")
          .insert({
            thread_id: threadId,
            author_user_id: user.id,
            body: actionPlanRaw.body,
            metadata: { kind: actionPlanRaw.kind },
          })
          .select("id")
          .single();
        if (error || !msg?.id) {
          return NextResponse.json({ error: error?.message || "Failed to send message." }, { status: 400 });
        }

        citations.push({ kind: "thread", id: threadId, label: actionPlanRaw.title });
        citations.push({ kind: "message", id: String(msg.id), label: actionPlanRaw.title });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Sent message ${String(msg.id)}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer:
            actionPlanRaw.kind === "group_message"
              ? `Sent group message to ${actionPlanRaw.recipientLabels.join(", ")}.`
              : `Sent direct message to ${actionPlanRaw.recipientLabels[0]}.`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "create_group_chat") {
        if (actionPlanRaw.recipientUserIds.length < 2) {
          return NextResponse.json({ error: "A group chat needs at least two recipients." }, { status: 400 });
        }

        const threadId = await ensureParticipantThread(
          supabase,
          labId,
          user.id,
          actionPlanRaw.recipientUserIds,
          actionPlanRaw.title || "Group chat",
        );
        if (!threadId) {
          return NextResponse.json({ error: "Could not create group chat thread." }, { status: 400 });
        }

        citations.push({ kind: "thread", id: threadId, label: actionPlanRaw.title || "Group chat" });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Created thread ${threadId}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Created group chat "${actionPlanRaw.title || "Group chat"}" with ${actionPlanRaw.recipientLabels.join(", ")}.`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "add_reagent") {
        const { data: reagent, error } = await supabase
          .from("lab_reagents")
          .insert({
            lab_id: labId,
            name: actionPlanRaw.name,
            quantity: actionPlanRaw.quantity,
            unit: actionPlanRaw.unit || null,
            supplier: actionPlanRaw.supplier || null,
            storage_location: actionPlanRaw.storageLocation || null,
            notes: actionPlanRaw.notes || null,
            created_by: user.id,
          })
          .select("id,name")
          .single();

        if (error || !reagent?.id) {
          return NextResponse.json({ error: error?.message || "Failed to add reagent." }, { status: 400 });
        }

        citations.push({ kind: "reagent", id: String(reagent.id), label: String(reagent.name) });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Added reagent ${String(reagent.id)}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Added reagent "${String(reagent.name)}" with quantity ${actionPlanRaw.quantity}${actionPlanRaw.unit ? ` ${actionPlanRaw.unit}` : ""}.`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "remove_reagent") {
        if (!canManage) {
          return NextResponse.json({ error: "Only lab managers/admins can remove reagents." }, { status: 403 });
        }

        const { data: existing } = await supabase
          .from("lab_reagents")
          .select("id,name,lab_id")
          .eq("id", actionPlanRaw.reagentId)
          .maybeSingle();
        if (!existing || String(existing.lab_id) !== labId) {
          return NextResponse.json({ error: "Reagent no longer available in this lab." }, { status: 400 });
        }

        const { error } = await supabase.from("lab_reagents").delete().eq("id", actionPlanRaw.reagentId);
        if (error) {
          return NextResponse.json({ error: error.message || "Failed to remove reagent." }, { status: 400 });
        }

        citations.push({ kind: "reagent", id: actionPlanRaw.reagentId, label: actionPlanRaw.reagentName });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Removed reagent ${actionPlanRaw.reagentId}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Removed reagent "${actionPlanRaw.reagentName}".`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "add_equipment") {
        if (!canManage) {
          return NextResponse.json({ error: "Only lab managers/admins can add equipment." }, { status: 403 });
        }

        const { data: equipmentItem, error } = await supabase
          .from("lab_equipment")
          .insert({
            lab_id: labId,
            name: actionPlanRaw.name,
            description: actionPlanRaw.description || null,
            location: actionPlanRaw.location || null,
            booking_requires_approval: actionPlanRaw.bookingRequiresApproval === true,
            is_active: true,
            created_by: user.id,
          })
          .select("id,name")
          .single();
        if (error || !equipmentItem?.id) {
          return NextResponse.json({ error: error?.message || "Failed to add equipment." }, { status: 400 });
        }

        citations.push({ kind: "equipment", id: String(equipmentItem.id), label: String(equipmentItem.name) });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Added equipment ${String(equipmentItem.id)}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Added equipment "${String(equipmentItem.name)}"${actionPlanRaw.location ? ` at ${actionPlanRaw.location}` : ""}.`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "remove_equipment") {
        if (!canManage) {
          return NextResponse.json({ error: "Only lab managers/admins can remove equipment." }, { status: 403 });
        }

        const { data: existing } = await supabase
          .from("lab_equipment")
          .select("id,name,lab_id")
          .eq("id", actionPlanRaw.equipmentId)
          .maybeSingle();
        if (!existing || String(existing.lab_id) !== labId) {
          return NextResponse.json({ error: "Equipment no longer available in this lab." }, { status: 400 });
        }

        const { error } = await supabase.from("lab_equipment").delete().eq("id", actionPlanRaw.equipmentId);
        if (error) {
          return NextResponse.json({ error: error.message || "Failed to remove equipment." }, { status: 400 });
        }

        citations.push({ kind: "equipment", id: actionPlanRaw.equipmentId, label: actionPlanRaw.equipmentName });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Removed equipment ${actionPlanRaw.equipmentId}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Removed equipment "${actionPlanRaw.equipmentName}".`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "update_booking_status") {
        const { data: booking } = await supabase
          .from("lab_equipment_bookings")
          .select("id,equipment_id,booked_by,status")
          .eq("id", actionPlanRaw.bookingId)
          .maybeSingle();
        if (!booking) {
          return NextResponse.json({ error: "Booking no longer available." }, { status: 400 });
        }

        const { data: equipmentItem } = await supabase
          .from("lab_equipment")
          .select("id,lab_id,name")
          .eq("id", String(booking.equipment_id))
          .maybeSingle();
        if (!equipmentItem || String(equipmentItem.lab_id) !== labId) {
          return NextResponse.json({ error: "Booking does not belong to this lab." }, { status: 400 });
        }

        const isOwner = String(booking.booked_by || "") === user.id;
        if (!isOwner && !canManage) {
          return NextResponse.json(
            { error: "Only booking owners, lab managers, or admins can update booking status." },
            { status: 403 },
          );
        }

        const { data: updated, error } = await supabase
          .from("lab_equipment_bookings")
          .update({ status: actionPlanRaw.status })
          .eq("id", actionPlanRaw.bookingId)
          .select("id,status,equipment_id")
          .single();
        if (error || !updated?.id) {
          return NextResponse.json({ error: error?.message || "Failed to update booking status." }, { status: 400 });
        }

        citations.push({ kind: "equipment", id: String(updated.equipment_id), label: actionPlanRaw.equipmentName });
        citations.push({ kind: "booking", id: String(updated.id), label: `${actionPlanRaw.equipmentName} booking` });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Updated booking ${String(updated.id)} to ${actionPlanRaw.status}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Updated ${actionPlanRaw.equipmentName} booking to status "${actionPlanRaw.status}".`,
          citations,
        });
      }

      if (actionPlanRaw.kind === "create_meeting") {
        const { data: meeting, error } = await supabase
          .from("lab_meetings")
          .insert({
            lab_id: labId,
            created_by: user.id,
            title: actionPlanRaw.title,
            meeting_date: actionPlanRaw.meetingDate,
            attendees: [],
            content: "",
            ai_summary: null,
          })
          .select("id,title,meeting_date")
          .single();
        if (error || !meeting?.id) {
          const rawMessage = error?.message || "Failed to create meeting.";
          const message = rawMessage.includes("public.lab_meetings")
            ? "Meetings database table is not available in this environment yet."
            : rawMessage;
          return NextResponse.json({ error: message }, { status: 400 });
        }
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Created meeting ${String(meeting.id)}`,
        }).catch(() => undefined);
        return NextResponse.json({
          executed: true,
          answer: `Created meeting "${String(meeting.title)}" on ${String(meeting.meeting_date)}.`,
          citations,
        });
      }
    }

    const grounded = answerFromStructuredData(question, reagents, eventsByReagent, equipment, bookingsByEquipment);
    const noteGrounded = answerFromLabNotes(question, noteSnippets);
    const actionPlan = await buildActionPlan(question, equipment, members, reagents, bookingsByEquipment);
    if (actionPlan && actionPlan.kind === "clarification_required") {
      return NextResponse.json({
        answer: actionPlan.body,
        source: "rules",
        citations: noteGrounded?.citations || [],
        actionPlan,
      });
    }
    if (actionPlan) {
      await logAssistantAction(supabase, {
        labId,
        actorUserId: user.id,
        actionKind: actionPlan.kind,
        payload: actionPlan as unknown as Record<string, unknown>,
        outcome: "planned",
      }).catch(() => undefined);
      return NextResponse.json({
        answer: actionPlanPreview(actionPlan),
        source: "rules",
        citations: [...grounded.citations, ...(noteGrounded?.citations || [])],
        actionPlan,
      });
    }

    const reagentFacts = reagents.slice(0, 80).map((r) => {
      const events = eventsByReagent.get(r.id) ?? [];
      const recent = events
        .slice(0, 4)
        .map((e) => `${e.event_type} on ${formatDate(e.created_at)}${e.vendor ? ` (${e.vendor})` : ""}${e.expected_arrival_at ? ` ETA ${formatDateTime(e.expected_arrival_at)}` : ""}${e.purchase_order_number ? ` PO ${e.purchase_order_number}` : ""}`)
        .join("; ");
      return `${r.name} | qty=${r.quantity}${r.unit ? ` ${r.unit}` : ""} | location=${r.storage_location || "n/a"} | needs_reorder=${r.needs_reorder} | last_ordered=${formatDate(r.last_ordered_at)} | recent_events=${recent || "none"}`;
    }).join("\n");

    const equipmentFacts = equipment.slice(0, 60).map((item) => {
      const upcoming = (bookingsByEquipment.get(item.id) ?? [])
        .filter((b) => b.status !== "cancelled" && b.status !== "completed")
        .slice(0, 3);
      const sched = upcoming.map((b) => `${formatDateTime(b.starts_at)}->${formatDateTime(b.ends_at)} (${b.status})`).join("; ");
      return `${item.name} | location=${item.location || "n/a"} | active=${item.is_active} | bookings=${sched || "none"}`;
    }).join("\n");
    const labNoteFacts = noteSnippets
      .slice(0, 20)
      .map((note) => `${note.threadSubject || "Lab thread"} | ${formatDateTime(note.createdAt)} | ${note.body.slice(0, 180)}`)
      .join("\n");

    const prompt = [
      "You are a lab operations assistant. Use only the provided lab data and do not invent facts.",
      "If data is missing, say 'not recorded'.",
      "Respond in plain language with max 2 short sentences.",
      "Do not include long lists unless explicitly asked.",
      "If the request is ambiguous, ask exactly 1 clarifying question.",
      "",
      "Reagent data:",
      reagentFacts || "No reagents found.",
      "",
      "Equipment data:",
      equipmentFacts || "No equipment found.",
      "",
      "Recent lab communications:",
      labNoteFacts || "No recent lab messages found.",
      "",
      `Question: ${question}`,
      "",
      `Structured answer draft: ${noteGrounded ? `${noteGrounded.answer}\n\n${grounded.answer}` : grounded.answer}`,
      actionPlan ? `Potential action plan detected: ${JSON.stringify(actionPlan)}` : "No action plan detected.",
      "",
      "Return only the user-facing answer text.",
    ].join("\n");

    const hfAnswer = shouldUseHfForFinalAnswer(question, actionPlan) ? await callHuggingFace(prompt) : null;
    const answer = enforceConciseAnswer(hfAnswer || noteGrounded?.answer || grounded.answer);
    const citations = [...grounded.citations, ...(noteGrounded?.citations || [])];

    return NextResponse.json({
      answer,
      source: hfAnswer ? "huggingface" : "rules",
      citations,
      actionPlan,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to answer" },
      { status: 500 },
    );
  }
}
