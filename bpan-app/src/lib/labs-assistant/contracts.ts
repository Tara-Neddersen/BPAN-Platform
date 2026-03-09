import { z } from "zod";

export const citationKindSchema = z.enum([
  "reagent",
  "stock_event",
  "equipment",
  "booking",
  "thread",
  "message",
  "announcement",
  "shared_task",
  "meeting",
]);

export const citationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: citationKindSchema,
});

export const labsAssistantIntentSchema = z.enum([
  "greeting",
  "smalltalk",
  "booking.read.mine",
  "booking.create",
  "booking.reschedule",
  "booking.status.update",
  "equipment.read",
  "reagent.location.read",
  "reagent.arrival.read",
  "announcement.create.draft",
  "announcement.create.post",
  "announcement.read",
  "task.shared.read",
  "meeting.create",
  "meeting.read",
  "message.send",
  "group_chat.create",
  "reagent.add",
  "reagent.remove",
  "equipment.add",
  "equipment.remove",
  "unknown",
]);

export const chatHistoryTurnSchema = z.object({
  question: z.string().default(""),
  answer: z.string().default(""),
  citations: z.array(citationSchema).default([]),
});

const createBookingSchema = z.object({
  kind: z.literal("create_booking"),
  equipmentId: z.string().min(1),
  equipmentName: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const announcementDraftSchema = z.object({
  kind: z.literal("announcement_draft"),
  title: z.string().min(1),
  body: z.string().min(1),
});

const announcementPostSchema = z.object({
  kind: z.literal("announcement_post"),
  title: z.string().min(1),
  body: z.string().min(1),
});

const directMessageSchema = z.object({
  kind: z.literal("direct_message"),
  recipientUserIds: z.array(z.string().min(1)),
  recipientLabels: z.array(z.string().min(1)),
  title: z.string().min(1),
  body: z.string().min(1),
});

const groupMessageSchema = z.object({
  kind: z.literal("group_message"),
  recipientUserIds: z.array(z.string().min(1)),
  recipientLabels: z.array(z.string().min(1)),
  title: z.string().min(1),
  body: z.string().min(1),
});

const createGroupChatSchema = z.object({
  kind: z.literal("create_group_chat"),
  recipientUserIds: z.array(z.string().min(1)),
  recipientLabels: z.array(z.string().min(1)),
  title: z.string().min(1),
});

const addReagentSchema = z.object({
  kind: z.literal("add_reagent"),
  name: z.string().min(1),
  quantity: z.number(),
  unit: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  storageLocation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const removeReagentSchema = z.object({
  kind: z.literal("remove_reagent"),
  reagentId: z.string().min(1),
  reagentName: z.string().min(1),
});

const addEquipmentSchema = z.object({
  kind: z.literal("add_equipment"),
  name: z.string().min(1),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  bookingRequiresApproval: z.boolean().optional(),
});

const removeEquipmentSchema = z.object({
  kind: z.literal("remove_equipment"),
  equipmentId: z.string().min(1),
  equipmentName: z.string().min(1),
});

const updateBookingStatusSchema = z.object({
  kind: z.literal("update_booking_status"),
  bookingId: z.string().min(1),
  equipmentName: z.string().min(1),
  status: z.enum(["cancelled", "confirmed", "completed", "in_use"]),
});

const updateBookingTimeSchema = z.object({
  kind: z.literal("update_booking_time"),
  bookingId: z.string().min(1),
  equipmentName: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

const createMeetingSchema = z.object({
  kind: z.literal("create_meeting"),
  title: z.string().min(1),
  meetingDate: z.string().min(1),
});

const clarificationRequiredSchema = z.object({
  kind: z.literal("clarification_required"),
  title: z.string().min(1),
  options: z.array(z.string().min(1)),
  body: z.string().min(1),
});

export const actionPlanSchema = z.discriminatedUnion("kind", [
  createBookingSchema,
  announcementDraftSchema,
  announcementPostSchema,
  directMessageSchema,
  groupMessageSchema,
  createGroupChatSchema,
  addReagentSchema,
  removeReagentSchema,
  addEquipmentSchema,
  removeEquipmentSchema,
  updateBookingStatusSchema,
  updateBookingTimeSchema,
  createMeetingSchema,
  clarificationRequiredSchema,
]);

export const assistantPostBodySchema = z.object({
  labId: z.string().default(""),
  question: z.string().default(""),
  execute: z.boolean().optional(),
  confirm: z.boolean().optional(),
  actionPlan: actionPlanSchema.optional(),
  chatHistory: z.array(chatHistoryTurnSchema).optional(),
});

export const conversationLayerSchema = z.object({
  intent: labsAssistantIntentSchema,
  rewrittenQuestion: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const actionPlannerLayerSchema = z.object({
  intent: labsAssistantIntentSchema,
  equipmentName: z.string().optional(),
  bookingId: z.string().optional(),
  startsAtIso: z.string().optional(),
  endsAtIso: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export type AssistantActionPlanContract = z.infer<typeof actionPlanSchema>;
export type AssistantPostBodyContract = z.infer<typeof assistantPostBodySchema>;
export type ChatHistoryTurnContract = z.infer<typeof chatHistoryTurnSchema>;
export type LabsAssistantIntentContract = z.infer<typeof labsAssistantIntentSchema>;
export type ConversationLayerContract = z.infer<typeof conversationLayerSchema>;
export type ActionPlannerLayerContract = z.infer<typeof actionPlannerLayerSchema>;
