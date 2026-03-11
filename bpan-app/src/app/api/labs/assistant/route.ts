import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai";
import {
  actionPlanSchema,
  actionPlannerLayerSchema,
  assistantPostBodySchema,
  chatHistoryTurnSchema,
  conversationLayerSchema,
  citationSchema,
} from "@/lib/labs-assistant/contracts";
import { routeLabsAssistantIntent, type LabsAssistantIntent } from "@/lib/labs-assistant/intent-router";
import { deliverLabAnnouncementNotifications } from "@/lib/lab-announcement-notification-delivery";

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
  booked_by: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type Citation = {
  id: string;
  label: string;
  kind: "reagent" | "stock_event" | "equipment" | "booking" | "thread" | "message" | "announcement" | "shared_task" | "meeting";
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

type LabAnnouncementRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
};

type LabSharedTaskRow = {
  id: string;
  list_type: string;
  title: string;
  details: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
};

type LabMeetingRow = {
  id: string;
  title: string;
  meeting_date: string;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

type ChatHistoryTurn = {
  question: string;
  answer: string;
  citations: Citation[];
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
      kind: "update_booking_time";
      bookingId: string;
      equipmentName: string;
      startsAt: string;
      endsAt: string;
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
  "update_booking_time",
  "direct_message",
  "group_message",
  "create_group_chat",
]);

function requiresConfirmation(action: ActionPlan) {
  return HIGH_IMPACT_ACTIONS.has(action.kind);
}

function parseActionPlan(raw: unknown): ActionPlan | null {
  const parsed = actionPlanSchema.safeParse(raw);
  return parsed.success ? (parsed.data as ActionPlan) : null;
}

function parseChatHistory(raw: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => chatHistoryTurnSchema.safeParse(item))
    .filter((result): result is { success: true; data: ChatHistoryTurn } => result.success)
    .map((result) => ({
      question: result.data.question.trim(),
      answer: result.data.answer.trim(),
      citations: result.data.citations
        .map((citation) => citationSchema.safeParse(citation))
        .filter((citation): citation is { success: true; data: Citation } => citation.success)
        .map((citation) => citation.data),
    }))
    .filter((item) => item.question.length > 0 || item.answer.length > 0)
    .slice(-12);
}

function looksLikeFollowUpQuestion(input: string) {
  const q = input.trim().toLowerCase();
  if (!q) return false;
  if (q.length <= 20) return true;
  if (/^(and|also|what about|how about|same|that one|this one|it)\b/.test(q)) return true;
  if (/^(for|until|from)\b/.test(q)) return true;
  if (/\b(it|that|this|those|them|same one|same thing|there)\b/.test(q)) return true;
  return false;
}

function buildContextualQuestion(question: string, history: ChatHistoryTurn[]) {
  const q = question.trim();
  if (!q) return q;
  const latest = [...history].reverse().find((item) => item.question.trim().length > 0);
  if (!latest) return q;
  if (!looksLikeFollowUpQuestion(q)) return q;
  const priorQ = latest.question.trim();
  const priorA = latest.answer.trim().slice(0, 220);
  return `${q}\nPrevious user question: ${priorQ}\nPrevious assistant answer: ${priorA}`;
}

function looksLikeCorrectionMessage(input: string) {
  return /\b(not correct|not right|wrong|doesn'?t sound correct|that is wrong|this is wrong)\b/i.test(input);
}

function hasBookingCitationInHistory(history: ChatHistoryTurn[]) {
  return history.some((turn) => turn.citations.some((citation) => citation.kind === "booking"));
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

async function callLabsModel(prompt: string) {
  try {
    const text = await callAI(
      "You are a reliable lab assistant model. Follow instructions exactly. If asked to return JSON only, return valid JSON only.",
      prompt,
      900,
    );
    if (text) return text;
  } catch {
    // fall through to Hugging Face fallback
  }

  const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  if (!hfKey) return null;
  const hfModel = process.env.HUGGINGFACE_MODEL || "Qwen/Qwen3.5-27B";
  try {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: hfModel,
        messages: [
          {
            role: "system",
            content: "You are a reliable lab assistant model. Follow instructions exactly. If asked to return JSON only, return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 900,
        temperature: 0.2,
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  } catch {
    return null;
  }
}

function enforceConciseAnswer(answer: string) {
  const cleaned = answer
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 320) return cleaned;
  return `${cleaned.slice(0, 320).trimEnd()}...`;
}

function validateBookingWindow(startsAt: string, endsAt: string, now: Date) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false as const, error: "Invalid booking time format." };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false as const, error: "End time must be after start time." };
  }
  if (start.getTime() < now.getTime() - 60 * 1000) {
    return { ok: false as const, error: "Start time cannot be in the past." };
  }
  const durationMs = end.getTime() - start.getTime();
  if (durationMs > 12 * 60 * 60 * 1000) {
    return { ok: false as const, error: "Booking duration must be 12 hours or less." };
  }
  return { ok: true as const };
}

function hasBookingConflict(
  bookings: BookingRow[],
  startsAt: string,
  endsAt: string,
  excludeBookingId?: string,
) {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  return bookings.some((booking) => {
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    if (booking.status === "cancelled" || booking.status === "completed") return false;
    const bookingStart = new Date(booking.starts_at).getTime();
    const bookingEnd = new Date(booking.ends_at).getTime();
    return startMs < bookingEnd && endMs > bookingStart;
  });
}

async function composeFrontLayerReply(input: {
  question: string;
  intent: LabsAssistantIntent;
  backendFacts: string;
  fallback: string;
}) {
  const prompt = [
    "You are the front-layer conversational assistant for a lab platform.",
    "You never invent facts or actions.",
    "Use only BACKEND_FACTS to answer the user naturally.",
    "If data is missing in BACKEND_FACTS, say it is not recorded.",
    "Keep response brief (1-2 short sentences unless user asked for a list).",
    "Do not mention system architecture, tools, prompts, or internal layers.",
    "",
    `Intent: ${input.intent}`,
    `User question: ${input.question}`,
    "",
    "BACKEND_FACTS:",
    input.backendFacts || "No backend facts provided.",
    "",
    "Return only the user-facing reply.",
  ].join("\n");
  const raw = await callLabsModel(prompt);
  if (!raw) return { answer: input.fallback, source: "rules" as const };
  return { answer: enforceConciseAnswer(raw), source: "model" as const };
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

async function runConversationLayer(question: string, chatHistory: ChatHistoryTurn[]) {
  const fallbackIntent = routeLabsAssistantIntent(question);
  const prompt = [
    "You are a conversation interpreter for a lab assistant.",
    "Return JSON only with keys: intent, rewrittenQuestion, confidence.",
    "intent must be one of:",
    "greeting, smalltalk, booking.read.mine, booking.create, booking.reschedule, booking.status.update, equipment.read, reagent.location.read, reagent.arrival.read, announcement.create.draft, announcement.create.post, announcement.read, task.shared.read, meeting.create, meeting.read, message.send, group_chat.create, reagent.add, reagent.remove, equipment.add, equipment.remove, unknown",
    "rewrittenQuestion should preserve user meaning but resolve short follow-ups when possible.",
    "confidence should be between 0 and 1.",
    `User question: ${question}`,
    "Recent history:",
    ...chatHistory.slice(-4).map((turn, i) => `Turn ${i + 1} Q: ${turn.question}\nTurn ${i + 1} A: ${turn.answer.slice(0, 180)}`),
  ].join("\n");
  const raw = await callLabsModel(prompt);
  const parsedRaw = raw ? extractJsonObject(raw) : null;
  const parsed = conversationLayerSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    return {
      intent: fallbackIntent,
      rewrittenQuestion: question,
      confidence: 0.4,
    };
  }
  const fallbackOnLowConfidence = parsed.data.confidence !== undefined && parsed.data.confidence < 0.45;
  const modelIntent = parsed.data.intent;
  const fallbackIsGreetingOrSmalltalk = fallbackIntent === "greeting" || fallbackIntent === "smalltalk";
  const fallbackIsSpecific = fallbackIntent !== "unknown";
  const modelCollapsedToUnknown = modelIntent === "unknown";
  const shouldPreferFallbackIntent =
    fallbackIsGreetingOrSmalltalk
    || (fallbackIsSpecific && modelCollapsedToUnknown);
  return {
    intent: fallbackOnLowConfidence || shouldPreferFallbackIntent ? fallbackIntent : modelIntent,
    rewrittenQuestion: parsed.data.rewrittenQuestion?.trim() || question,
    confidence: parsed.data.confidence ?? 0.7,
  };
}

async function runActionPlannerLayer(
  intent: LabsAssistantIntent,
  question: string,
  chatHistory: ChatHistoryTurn[],
) {
  const actionIntents = new Set<LabsAssistantIntent>([
    "booking.create",
    "booking.reschedule",
    "booking.status.update",
    "meeting.create",
    "message.send",
    "group_chat.create",
    "reagent.add",
    "reagent.remove",
    "equipment.add",
    "equipment.remove",
    "announcement.create.draft",
    "announcement.create.post",
  ]);
  if (!actionIntents.has(intent)) return null;

  const prompt = [
    "You are an action planner extractor for a lab assistant.",
    "Return JSON only with keys:",
    "intent, equipmentName, bookingId, startsAtIso, endsAtIso, durationMinutes",
    `Intent: ${intent}`,
    `User question: ${question}`,
    "Recent history:",
    ...chatHistory.slice(-4).map((turn, i) => `Turn ${i + 1} Q: ${turn.question}\nTurn ${i + 1} A: ${turn.answer.slice(0, 180)}`),
  ].join("\n");
  const raw = await callLabsModel(prompt);
  const parsedRaw = raw ? extractJsonObject(raw) : null;
  const parsed = actionPlannerLayerSchema.safeParse(parsedRaw);
  if (!parsed.success) return null;
  if (parsed.data.intent !== intent) return null;
  return parsed.data;
}

async function proposeActionPlanFromModel(
  question: string,
  equipment: EquipmentRow[],
  members: LabMemberOption[],
  reagents: ReagentRow[],
  bookingsByEquipment: Map<string, BookingRow[]>,
  chatHistory: ChatHistoryTurn[],
) {
  const equipmentFacts = equipment
    .slice(0, 80)
    .map((item) => `- id=${item.id} | name=${item.name} | location=${item.location || "n/a"}`)
    .join("\n");
  const reagentFacts = reagents
    .slice(0, 100)
    .map((item) => `- id=${item.id} | name=${item.name}`)
    .join("\n");
  const memberFacts = members
    .slice(0, 80)
    .map((member) => `- userId=${member.userId} | label=${member.label}${member.email ? ` | email=${member.email}` : ""}`)
    .join("\n");
  const bookingFacts = [...bookingsByEquipment.values()]
    .flat()
    .slice(0, 120)
    .map((booking) => `- id=${booking.id} | equipmentId=${booking.equipment_id} | startsAt=${booking.starts_at} | endsAt=${booking.ends_at} | status=${booking.status}`)
    .join("\n");
  const recentHistory = chatHistory
    .slice(-6)
    .map((turn, index) => `Turn ${index + 1} Q: ${turn.question}\nTurn ${index + 1} A: ${turn.answer.slice(0, 180)}`)
    .join("\n");

  const prompt = [
    "You are an action planner for a lab assistant backend.",
    "Decide if the user is asking to perform an operation.",
    "Return JSON only.",
    "If no operation is requested, return: {\"kind\":\"none\"}.",
    "If operation is requested, return one valid ActionPlan JSON with one of these kinds:",
    "create_booking, announcement_draft, announcement_post, direct_message, group_message, create_group_chat, add_reagent, remove_reagent, add_equipment, remove_equipment, update_booking_status, update_booking_time, create_meeting, clarification_required",
    "Never invent ids. Use ids only from the provided lists.",
    "If required details are missing or ambiguous, return clarification_required with title/body/options.",
    "For direct/group messages and group chat: recipientUserIds and recipientLabels must align to member list.",
    "For booking update actions: bookingId must exist in BOOKINGS.",
    "For booking create: equipmentId must exist in EQUIPMENT and include equipmentName.",
    "",
    `User question: ${question}`,
    "",
    "Recent chat history:",
    recentHistory || "None.",
    "",
    "EQUIPMENT:",
    equipmentFacts || "None.",
    "",
    "REAGENTS:",
    reagentFacts || "None.",
    "",
    "MEMBERS:",
    memberFacts || "None.",
    "",
    "BOOKINGS:",
    bookingFacts || "None.",
  ].join("\n");

  const raw = await callLabsModel(prompt);
  const parsedRaw = raw ? extractJsonObject(raw) : null;
  if (!parsedRaw || typeof parsedRaw !== "object") return null;
  if ((parsedRaw as Record<string, unknown>).kind === "none") return null;
  const parsed = parseActionPlan(parsedRaw);
  if (!parsed) return null;

  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const reagentById = new Map(reagents.map((item) => [item.id, item]));
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const bookingById = new Map([...bookingsByEquipment.values()].flat().map((booking) => [booking.id, booking]));

  if (parsed.kind === "create_booking") {
    const equip = equipmentById.get(parsed.equipmentId);
    if (!equip) return null;
    return { ...parsed, equipmentName: equip.name };
  }
  if (parsed.kind === "remove_reagent") {
    const reagent = reagentById.get(parsed.reagentId);
    if (!reagent) return null;
    return { ...parsed, reagentName: reagent.name };
  }
  if (parsed.kind === "remove_equipment") {
    const equip = equipmentById.get(parsed.equipmentId);
    if (!equip) return null;
    return { ...parsed, equipmentName: equip.name };
  }
  if (parsed.kind === "update_booking_status" || parsed.kind === "update_booking_time") {
    const booking = bookingById.get(parsed.bookingId);
    if (!booking) return null;
    const equipName = equipmentById.get(booking.equipment_id)?.name || parsed.equipmentName;
    return { ...parsed, equipmentName: equipName };
  }
  if (parsed.kind === "direct_message" || parsed.kind === "group_message" || parsed.kind === "create_group_chat") {
    const matched = parsed.recipientUserIds
      .map((id) => memberById.get(id))
      .filter((member): member is LabMemberOption => Boolean(member));
    const minimum = parsed.kind === "direct_message" ? 1 : 2;
    if (matched.length < minimum) return null;
    return {
      ...parsed,
      recipientUserIds: matched.map((member) => member.userId),
      recipientLabels: matched.map((member) => member.label),
    };
  }

  return parsed;
}

async function buildActionPlan(
  question: string,
  equipment: EquipmentRow[],
  members: LabMemberOption[],
  reagents: ReagentRow[],
  bookingsByEquipment: Map<string, BookingRow[]>,
  _currentUserId: string,
  chatHistory: ChatHistoryTurn[],
): Promise<ActionPlan | null> {
  const modelFirstPlan = await proposeActionPlanFromModel(
    question,
    equipment,
    members,
    reagents,
    bookingsByEquipment,
    chatHistory,
  );
  if (modelFirstPlan) return modelFirstPlan;
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
  if (actionPlan.kind === "update_booking_time") {
    return `Ready to move ${actionPlan.equipmentName} booking to ${formatDateTime(actionPlan.startsAt)} - ${formatDateTime(actionPlan.endsAt)}. Click Review Action to confirm.`;
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
  bookingsByEquipment: Map<string, BookingRow[]>,
  currentUserId: string,
  forcedIntent?: LabsAssistantIntent,
) {
  const routedIntent = forcedIntent ?? routeLabsAssistantIntent(question);
  const citations: Citation[] = [];
  const mentioned = findReagentMentions(question, reagents);
  const mentionedEquipment = findEquipmentMentions(question, equipment);
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));

  if (routedIntent === "greeting") {
    return {
      answer: "Hey, good to see you. I can chat naturally, and I can also help with bookings, equipment, reagents, meetings, announcements, and shared tasks.",
      citations,
    };
  }
  if (routedIntent === "smalltalk") {
    return {
      answer: "I am doing well, thanks for asking. If you want, we can chat, or I can jump into any lab task for you.",
      citations,
    };
  }

  if (routedIntent === "booking.read.mine") {
    const now = Date.now();
    const mineRaw = [...bookingsByEquipment.values()]
      .flat()
      .filter((booking) => booking.booked_by === currentUserId)
      .filter((booking) => booking.status !== "cancelled" && booking.status !== "completed")
      .filter((booking) => new Date(booking.ends_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const maxExpectedDurationMs = 12 * 60 * 60 * 1000;
    const anomalous = mineRaw.filter(
      (booking) => new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime() > maxExpectedDurationMs,
    );
    const mine = mineRaw.filter(
      (booking) => new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime() <= maxExpectedDurationMs,
    );

    if (mine.length === 0 && anomalous.length === 0) {
      return {
        answer: "You have no upcoming active bookings recorded.",
        citations,
      };
    }
    if (mine.length === 0 && anomalous.length > 0) {
      const anomaly = anomalous[0];
      const equipmentName = equipmentById.get(anomaly.equipment_id)?.name || "Equipment";
      citations.push({ kind: "booking", id: anomaly.id, label: anomaly.title || "Booking" });
      return {
        answer: `I found an anomalous booking for ${equipmentName} from ${formatDateTime(anomaly.starts_at)} to ${formatDateTime(anomaly.ends_at)}. Please reschedule or delete it in Equipment booking.`,
        citations,
      };
    }

    const top = mine.slice(0, 3);
    const lines = top.map((booking, index) => {
      const equipmentName = equipmentById.get(booking.equipment_id)?.name || "Equipment";
      citations.push({ kind: "booking", id: booking.id, label: booking.title || "Booking" });
      if (equipmentById.get(booking.equipment_id)) {
        citations.push({ kind: "equipment", id: booking.equipment_id, label: equipmentName });
      }
      const prefix = index === 0 ? "Next" : `Then ${index + 1}`;
      return `${prefix}: ${equipmentName} from ${formatDateTime(booking.starts_at)} to ${formatDateTime(booking.ends_at)}.`;
    });

    return {
      answer: anomalous.length > 0 ? `${lines.join("\n")}\nNote: I excluded ${anomalous.length} anomalous long booking(s).` : lines.join("\n"),
      citations,
    };
  }

  if (routedIntent === "equipment.read" && mentionedEquipment.length > 0) {
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

  if (routedIntent === "equipment.read" && mentionedEquipment.length === 0) {
    const names = equipment.slice(0, 8).map((e) => e.name).join(", ");
    return {
      answer: names
        ? `Please include the equipment name. Available equipment includes: ${names}.`
        : "No equipment is recorded for this lab yet.",
      citations,
    };
  }

  if (routedIntent === "reagent.location.read" && mentioned.length > 0) {
    const lines = mentioned.map((r) => {
      citations.push({ kind: "reagent", id: r.id, label: r.name });
      return `- ${r.name}: ${r.storage_location || "no storage location recorded"}`;
    });
    return { answer: `Here are the recorded storage locations:\n${lines.join("\n")}`, citations };
  }

  if (routedIntent === "reagent.arrival.read" && mentioned.length > 0) {
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

  if (mentioned.length === 0 && (routedIntent === "reagent.location.read" || routedIntent === "reagent.arrival.read")) {
    return {
      answer: "I can answer that precisely if you include the reagent name (for example: \"Where is DMEM High Glucose?\").",
      citations,
    };
  }

  return {
    answer: "Got it. I can still chat, and for lab work I can handle bookings, equipment, reagents, meetings, announcements, and shared tasks. Tell me what you want next.",
    citations,
  };
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

function answerFromLabOpsData(
  question: string,
  announcements: LabAnnouncementRow[],
  sharedTasks: LabSharedTaskRow[],
  meetings: LabMeetingRow[],
  forcedIntent?: LabsAssistantIntent,
) {
  const routedIntent = forcedIntent ?? routeLabsAssistantIntent(question);
  const citations: Citation[] = [];
  const now = Date.now();

  if (routedIntent === "announcement.read") {
    if (announcements.length === 0) {
      return { answer: "No lab announcements are recorded yet.", citations };
    }
    const latest = announcements[0];
    citations.push({ kind: "announcement", id: latest.id, label: latest.title });
    return {
      answer: `Latest announcement: ${latest.title} (${formatDateTime(latest.created_at)}).`,
      citations,
    };
  }

  if (routedIntent === "task.shared.read") {
    const openTasks = sharedTasks.filter((task) => !task.done);
    if (openTasks.length === 0) {
      return { answer: "No open shared inspection tasks are recorded.", citations };
    }
    const top = openTasks.slice(0, 3);
    const lines = top.map((task) => {
      citations.push({ kind: "shared_task", id: task.id, label: task.title });
      return `- ${task.title}`;
    });
    return {
      answer: `Open shared tasks:\n${lines.join("\n")}`,
      citations,
    };
  }

  if (routedIntent === "meeting.read") {
    const upcoming = meetings
      .filter((meeting) => new Date(meeting.meeting_date).getTime() >= now)
      .sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime());
    const target = upcoming[0] ?? meetings[0];
    if (!target) {
      return { answer: "No lab meetings are recorded yet.", citations };
    }
    citations.push({ kind: "meeting", id: target.id, label: target.title });
    return {
      answer: `Next meeting: ${target.title} on ${formatDate(target.meeting_date)}.`,
      citations,
    };
  }

  return null;
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

    const bodyRaw = await req.json().catch(() => ({}));
    const bodyParsed = assistantPostBodySchema.safeParse(bodyRaw);
    if (!bodyParsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const body = bodyParsed.data;
    const labId = body.labId;
    const question = body.question.trim();
    const chatHistory = parseChatHistory(body.chatHistory ?? []);
    const execute = body.execute === true;
    const confirm = body.confirm === true;
    const actionPlanRaw = parseActionPlan(body.actionPlan);
    const contextualQuestion = buildContextualQuestion(question, chatHistory);
    const conversationLayer = !execute
      ? await runConversationLayer(contextualQuestion, chatHistory)
      : { intent: routeLabsAssistantIntent(contextualQuestion), rewrittenQuestion: contextualQuestion, confidence: 1 };
    let effectiveIntent = conversationLayer.intent;
    let effectiveQuestion = conversationLayer.rewrittenQuestion.trim() || contextualQuestion;
    if (!execute && looksLikeCorrectionMessage(question) && hasBookingCitationInHistory(chatHistory)) {
      effectiveIntent = "booking.read.mine";
      effectiveQuestion = "List my upcoming bookings separately with exact start and end times.";
    }
    const plannerLayer = !execute
      ? await runActionPlannerLayer(effectiveIntent, effectiveQuestion, chatHistory)
      : null;

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

    const [
      { data: reagentsRaw },
      { data: equipmentRaw },
      { data: membersRaw },
      { data: noteThreadsRaw },
      { data: announcementsRaw },
      { data: sharedTasksRaw },
      { data: meetingsRaw },
    ] = await Promise.all([
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
      supabase
        .from("lab_announcements")
        .select("id,type,title,body,created_at")
        .eq("lab_id", labId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("lab_shared_tasks")
        .select("id,list_type,title,details,done,created_at,updated_at")
        .eq("lab_id", labId)
        .order("updated_at", { ascending: false })
        .limit(120),
      supabase
        .from("lab_meetings")
        .select("id,title,meeting_date,ai_summary,created_at,updated_at")
        .eq("lab_id", labId)
        .order("meeting_date", { ascending: true })
        .limit(80),
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
    const announcements = (announcementsRaw || []) as LabAnnouncementRow[];
    const sharedTasks = (sharedTasksRaw || []) as LabSharedTaskRow[];
    const meetings = (meetingsRaw || []) as LabMeetingRow[];
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
            .select("id,equipment_id,booked_by,title,starts_at,ends_at,status")
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
      async function composeExecutedReply(backendFacts: string, fallback: string) {
        const composed = await composeFrontLayerReply({
          question: effectiveQuestion,
          intent: effectiveIntent,
          backendFacts,
          fallback,
        });
        return composed.answer;
      }
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
        const createValidity = validateBookingWindow(actionPlanRaw.startsAt, actionPlanRaw.endsAt, new Date());
        if (!createValidity.ok) {
          return NextResponse.json({ error: createValidity.error }, { status: 400 });
        }
        const equipmentBookings = bookingsByEquipment.get(actionPlanRaw.equipmentId) ?? [];
        if (hasBookingConflict(equipmentBookings, actionPlanRaw.startsAt, actionPlanRaw.endsAt)) {
          return NextResponse.json({ error: "Booking conflicts with an existing reservation for this equipment." }, { status: 409 });
        }

        const initialStatus: "draft" | "confirmed" =
          equipmentMatch.booking_requires_approval === true ? "draft" : "confirmed";

        const { data: booking, error } = await supabase
          .from("lab_equipment_bookings")
          .insert({
            equipment_id: actionPlanRaw.equipmentId,
            booked_by: user.id,
            title: actionPlanRaw.title,
            notes: actionPlanRaw.notes || null,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            status: initialStatus,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: booking created",
            `Equipment: ${actionPlanRaw.equipmentName}`,
            `Starts at: ${formatDateTime(String(booking.starts_at))}`,
            `Ends at: ${formatDateTime(String(booking.ends_at))}`,
            `Status: ${String(booking.status)}`,
          ].join("\n"),
          `Booked ${actionPlanRaw.equipmentName} from ${formatDateTime(String(booking.starts_at))} to ${formatDateTime(String(booking.ends_at))} as ${String(booking.status)} status.`,
        );

        return NextResponse.json({
          executed: true,
          answer,
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
          const answer = await composeExecutedReply(
            [
              "Execution result: announcement draft prepared",
              `Title: ${actionPlanRaw.title}`,
              `Body: ${actionPlanRaw.body}`,
            ].join("\n"),
            `Draft prepared:\n\n${actionPlanRaw.title}\n${actionPlanRaw.body}`,
          );
          return NextResponse.json({
            executed: true,
            answer,
            citations,
          });
        }

        const announcementType: "general" | "inspection" =
          /\binspection\b/i.test(`${actionPlanRaw.title} ${actionPlanRaw.body}`) ? "inspection" : "general";
        const { data: announcementRow, error: announcementError } = await supabase
          .from("lab_announcements")
          .insert({
            lab_id: labId,
            type: announcementType,
            title: actionPlanRaw.title,
            body: actionPlanRaw.body,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (announcementError || !announcementRow?.id) {
          return NextResponse.json({ error: announcementError?.message || "Failed to post announcement." }, { status: 400 });
        }

        void deliverLabAnnouncementNotifications({
          labId,
          senderUserId: user.id,
          announcementId: String(announcementRow.id),
          title: String(actionPlanRaw.title),
          body: String(actionPlanRaw.body),
        });

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

        citations.push({ kind: "announcement", id: String(announcementRow.id), label: actionPlanRaw.title });
        citations.push({ kind: "thread", id: threadId, label: "General" });
        citations.push({ kind: "message", id: String(msg.id), label: actionPlanRaw.title });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Posted announcement ${String(announcementRow.id)} and message ${String(msg.id)}`,
        }).catch(() => undefined);
        const answer = await composeExecutedReply(
          [
            "Execution result: announcement posted",
            `Announcement id: ${String(announcementRow.id)}`,
            `Thread: General`,
            `Title: ${actionPlanRaw.title}`,
            `Message id: ${String(msg.id)}`,
          ].join("\n"),
          `Posted announcement and shared it in General chat: ${actionPlanRaw.title}`,
        );

        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: message sent",
            `Type: ${actionPlanRaw.kind}`,
            `Recipients: ${actionPlanRaw.recipientLabels.join(", ")}`,
            `Title: ${actionPlanRaw.title}`,
            `Message id: ${String(msg.id)}`,
          ].join("\n"),
          actionPlanRaw.kind === "group_message"
            ? `Sent group message to ${actionPlanRaw.recipientLabels.join(", ")}.`
            : `Sent direct message to ${actionPlanRaw.recipientLabels[0]}.`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: group chat created",
            `Thread id: ${threadId}`,
            `Title: ${actionPlanRaw.title || "Group chat"}`,
            `Members: ${actionPlanRaw.recipientLabels.join(", ")}`,
          ].join("\n"),
          `Created group chat "${actionPlanRaw.title || "Group chat"}" with ${actionPlanRaw.recipientLabels.join(", ")}.`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: reagent added",
            `Reagent: ${String(reagent.name)}`,
            `Quantity: ${actionPlanRaw.quantity}${actionPlanRaw.unit ? ` ${actionPlanRaw.unit}` : ""}`,
          ].join("\n"),
          `Added reagent "${String(reagent.name)}" with quantity ${actionPlanRaw.quantity}${actionPlanRaw.unit ? ` ${actionPlanRaw.unit}` : ""}.`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: reagent removed",
            `Reagent: ${actionPlanRaw.reagentName}`,
            `Reagent id: ${actionPlanRaw.reagentId}`,
          ].join("\n"),
          `Removed reagent "${actionPlanRaw.reagentName}".`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: equipment added",
            `Equipment: ${String(equipmentItem.name)}`,
            `Location: ${actionPlanRaw.location || "not recorded"}`,
          ].join("\n"),
          `Added equipment "${String(equipmentItem.name)}"${actionPlanRaw.location ? ` at ${actionPlanRaw.location}` : ""}.`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: equipment removed",
            `Equipment: ${actionPlanRaw.equipmentName}`,
            `Equipment id: ${actionPlanRaw.equipmentId}`,
          ].join("\n"),
          `Removed equipment "${actionPlanRaw.equipmentName}".`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
          .select("id,lab_id,name,booking_requires_approval")
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

        if (equipmentItem.booking_requires_approval === true && actionPlanRaw.status === "confirmed" && !canManage) {
          return NextResponse.json(
            { error: "Only lab managers or admins can approve this booking." },
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
        const answer = await composeExecutedReply(
          [
            "Execution result: booking status updated",
            `Equipment: ${actionPlanRaw.equipmentName}`,
            `Booking id: ${String(updated.id)}`,
            `New status: ${actionPlanRaw.status}`,
          ].join("\n"),
          `Updated ${actionPlanRaw.equipmentName} booking to status "${actionPlanRaw.status}".`,
        );
        return NextResponse.json({
          executed: true,
          answer,
          citations,
        });
      }

      if (actionPlanRaw.kind === "update_booking_time") {
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
            { error: "Only booking owners, lab managers, or admins can reschedule this booking." },
            { status: 403 },
          );
        }

        const start = new Date(actionPlanRaw.startsAt);
        const end = new Date(actionPlanRaw.endsAt);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
          return NextResponse.json({ error: "Invalid booking time range." }, { status: 400 });
        }
        const rescheduleValidity = validateBookingWindow(actionPlanRaw.startsAt, actionPlanRaw.endsAt, new Date());
        if (!rescheduleValidity.ok) {
          return NextResponse.json({ error: rescheduleValidity.error }, { status: 400 });
        }
        const equipmentBookings = bookingsByEquipment.get(String(booking.equipment_id)) ?? [];
        if (hasBookingConflict(equipmentBookings, actionPlanRaw.startsAt, actionPlanRaw.endsAt, actionPlanRaw.bookingId)) {
          return NextResponse.json({ error: "New time conflicts with an existing booking for this equipment." }, { status: 409 });
        }

        const { data: updated, error } = await supabase
          .from("lab_equipment_bookings")
          .update({
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
          })
          .eq("id", actionPlanRaw.bookingId)
          .select("id,equipment_id,starts_at,ends_at")
          .single();
        if (error || !updated?.id) {
          return NextResponse.json({ error: error?.message || "Failed to reschedule booking." }, { status: 400 });
        }

        citations.push({ kind: "equipment", id: String(updated.equipment_id), label: actionPlanRaw.equipmentName });
        citations.push({ kind: "booking", id: String(updated.id), label: `${actionPlanRaw.equipmentName} booking` });
        await logAssistantAction(supabase, {
          labId,
          actorUserId: user.id,
          actionKind: actionPlanRaw.kind,
          payload: actionPlanRaw as unknown as Record<string, unknown>,
          outcome: "executed",
          outcomeMessage: `Rescheduled booking ${String(updated.id)}`,
        }).catch(() => undefined);
        const answer = await composeExecutedReply(
          [
            "Execution result: booking rescheduled",
            `Equipment: ${actionPlanRaw.equipmentName}`,
            `Booking id: ${String(updated.id)}`,
            `Starts at: ${formatDateTime(String(updated.starts_at))}`,
            `Ends at: ${formatDateTime(String(updated.ends_at))}`,
          ].join("\n"),
          `Rescheduled ${actionPlanRaw.equipmentName} booking to ${formatDateTime(String(updated.starts_at))} - ${formatDateTime(String(updated.ends_at))}.`,
        );
        return NextResponse.json({
          executed: true,
          answer,
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
        const answer = await composeExecutedReply(
          [
            "Execution result: meeting created",
            `Title: ${String(meeting.title)}`,
            `Date: ${String(meeting.meeting_date)}`,
            `Meeting id: ${String(meeting.id)}`,
          ].join("\n"),
          `Created meeting "${String(meeting.title)}" on ${String(meeting.meeting_date)}.`,
        );
        return NextResponse.json({
          executed: true,
          answer,
          citations,
        });
      }
    }

    const grounded = answerFromStructuredData(
      effectiveQuestion,
      reagents,
      eventsByReagent,
      equipment,
      bookingsByEquipment,
      user.id,
      effectiveIntent,
    );
    const noteGrounded = answerFromLabNotes(effectiveQuestion, noteSnippets);
    const opsGrounded = answerFromLabOpsData(effectiveQuestion, announcements, sharedTasks, meetings, effectiveIntent);
    const actionPlan = await buildActionPlan(
      effectiveQuestion,
      equipment,
      members,
      reagents,
      bookingsByEquipment,
      user.id,
      chatHistory,
    );
    if (actionPlan && actionPlan.kind === "clarification_required") {
      const clarificationReply = await composeFrontLayerReply({
        question: effectiveQuestion,
        intent: effectiveIntent,
        backendFacts: [
          `Clarification title: ${actionPlan.title}`,
          `Clarification body: ${actionPlan.body}`,
          `Options: ${actionPlan.options.join(" | ") || "none"}`,
        ].join("\n"),
        fallback: actionPlan.body,
      });
      return NextResponse.json({
        answer: clarificationReply.answer,
        source: clarificationReply.source,
        citations: [...(noteGrounded?.citations || []), ...(opsGrounded?.citations || [])],
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
      const actionPreview = actionPlanPreview(actionPlan);
      const actionReply = await composeFrontLayerReply({
        question: effectiveQuestion,
        intent: effectiveIntent,
        backendFacts: [
          `Action kind: ${actionPlan.kind}`,
          `Action preview: ${actionPreview}`,
          `Action payload: ${JSON.stringify(actionPlan)}`,
        ].join("\n"),
        fallback: actionPreview,
      });
      return NextResponse.json({
        answer: actionReply.answer,
        source: actionReply.source,
        citations: [...grounded.citations, ...(noteGrounded?.citations || []), ...(opsGrounded?.citations || [])],
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
    const announcementFacts = announcements
      .slice(0, 20)
      .map((item) => `${item.type || "general"} | ${formatDateTime(item.created_at)} | ${item.title}: ${item.body.slice(0, 180)}`)
      .join("\n");
    const sharedTaskFacts = sharedTasks
      .slice(0, 30)
      .map((item) => `${item.list_type || "general"} | done=${item.done} | ${item.title}${item.details ? `: ${item.details.slice(0, 120)}` : ""}`)
      .join("\n");
    const meetingFacts = meetings
      .slice(0, 20)
      .map((item) => `${item.title} | date=${item.meeting_date} | summary=${item.ai_summary ? item.ai_summary.slice(0, 160) : "none"}`)
      .join("\n");
    const recentConversationFacts = chatHistory
      .slice(-6)
      .map((turn, index) => `Turn ${index + 1} Q: ${turn.question}\nTurn ${index + 1} A: ${turn.answer.slice(0, 160)}`)
      .join("\n");

    const backendFacts = [
      `Reagent data:\n${reagentFacts || "No reagents found."}`,
      `Equipment data:\n${equipmentFacts || "No equipment found."}`,
      `Recent lab communications:\n${labNoteFacts || "No recent lab messages found."}`,
      `Recent announcements:\n${announcementFacts || "No announcements found."}`,
      `Shared tasks:\n${sharedTaskFacts || "No shared tasks found."}`,
      `Lab meetings:\n${meetingFacts || "No meetings found."}`,
      `Recent conversation history:\n${recentConversationFacts || "No prior turns."}`,
      `Conversation layer confidence: ${conversationLayer.confidence}`,
      plannerLayer ? `Planner layer draft: ${JSON.stringify(plannerLayer)}` : "Planner layer draft: none",
      `Structured answer draft:\n${[opsGrounded?.answer, noteGrounded?.answer, grounded.answer].filter(Boolean).join("\n\n")}`,
    ].join("\n\n");
    const answer = await composeFrontLayerReply({
      question: effectiveQuestion,
      intent: effectiveIntent,
      backendFacts,
      fallback: grounded.answer || opsGrounded?.answer || noteGrounded?.answer || "I could not generate a response from available lab data.",
    });
    const citations = [...grounded.citations, ...(noteGrounded?.citations || []), ...(opsGrounded?.citations || [])];

    return NextResponse.json({
      answer: answer.answer,
      source: answer.source,
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
