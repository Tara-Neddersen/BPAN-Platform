"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingLabRelationError,
} from "@/lib/labs";
import {
  deleteEquipmentBookingFromOutlook,
  syncEquipmentBookingToOutlook,
} from "@/lib/outlook-equipment-calendar";
import type {
  PlatformBookingStatus,
  PlatformInventoryEventType,
  PlatformLabRole,
  PlatformLinkedObjectType,
} from "@/types";

type ActionResult = {
  success?: boolean;
  error?: string;
  message?: {
    id: string;
    body: string;
    created_at: string;
    linked_object_type: PlatformLinkedObjectType;
    linked_object_id: string;
  };
  equipment?: {
    id: string;
    name: string;
    description: string | null;
    location: string | null;
    booking_requires_approval: boolean;
    outlook_calendar_id: string | null;
    outlook_calendar_name: string | null;
    outlook_sync_owner_user_id: string | null;
    is_active: boolean;
  };
  booking?: {
    id: string;
    equipment_id: string;
    booked_by: string | null;
    title: string;
    starts_at: string;
    ends_at: string;
    status: PlatformBookingStatus;
    task_id: string | null;
    notes: string | null;
  };
};

const INVENTORY_EVENT_TYPES = new Set<PlatformInventoryEventType>([
  "receive",
  "consume",
  "adjust",
  "reorder_request",
  "reorder_placed",
  "reorder_received",
]);

const BOOKING_STATUSES = new Set<PlatformBookingStatus>([
  "draft",
  "confirmed",
  "in_use",
  "completed",
  "cancelled",
]);

const LINKED_OBJECT_TYPES = new Set<PlatformLinkedObjectType>([
  "experiment_template",
  "experiment_run",
  "lab_reagent",
  "lab_reagent_stock_event",
  "lab_equipment",
  "lab_equipment_booking",
  "task",
]);

function normalizeOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumericInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "on" || normalized === "1";
}

function parseDateTimeInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function withOperationsSchemaGuidance(message: string) {
  return `${message} Lab operations may still be initializing for this workspace. Please try again shortly.`;
}

function parseActiveLabId(formData: FormData) {
  return normalizeOptionalString(formData.get("active_lab_id"));
}

function ensureActiveLabId(activeLabId: string | null): ActionResult | null {
  if (!activeLabId) {
    return { error: "Select an active lab before making shared operations changes." };
  }
  return null;
}

function isRowLevelSecurityError(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) return false;
  if (error.code === "42501") return true;
  return (error.message ?? "").toLowerCase().includes("row-level security");
}

async function getCurrentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return { supabase, userId: user.id };
}

async function getLabMemberRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labId: string,
  userId: string,
): Promise<PlatformLabRole | null> {
  const { data, error } = await supabase
    .from("lab_members")
    .select("role")
    .eq("lab_id", labId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to validate lab membership.");
  }

  return (data?.role as PlatformLabRole | undefined) ?? null;
}

async function ensureManagerOrAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labId: string,
  userId: string,
): Promise<ActionResult | null> {
  const role = await getLabMemberRole(supabase, labId, userId);
  if (role !== "manager" && role !== "admin") {
    return { error: "Only lab managers or admins can perform this action." };
  }
  return null;
}

async function ensureActiveLabMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labId: string,
  userId: string,
): Promise<ActionResult | null> {
  const role = await getLabMemberRole(supabase, labId, userId);
  if (!role) {
    return { error: "You need active lab access to perform this action." };
  }
  return null;
}

async function refreshOperationsPage() {
  revalidatePath("/operations");
}

function toEquipmentResult(
  equipment: Record<string, unknown> | null | undefined,
): ActionResult["equipment"] | undefined {
  if (!equipment) return undefined;
  return {
    id: equipment.id as string,
    name: equipment.name as string,
    description: equipment.description as string | null,
    location: equipment.location as string | null,
    booking_requires_approval: equipment.booking_requires_approval as boolean,
    outlook_calendar_id: equipment.outlook_calendar_id as string | null,
    outlook_calendar_name: equipment.outlook_calendar_name as string | null,
    outlook_sync_owner_user_id: equipment.outlook_sync_owner_user_id as string | null,
    is_active: equipment.is_active as boolean,
  };
}

function quartzyHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function pushQuartzyInventoryUpdateForReagent({
  labReagentId,
  nextQuantity,
  eventType,
}: {
  labReagentId: string;
  nextQuantity: number;
  eventType: PlatformInventoryEventType;
}) {
  const token = process.env.QUARTZY_ACCESS_TOKEN;
  if (!token) return;

  const baseUrl = process.env.QUARTZY_API_BASE_URL || "https://api.quartzy.com";
  const admin = createAdminClient();
  const { data: link, error } = await admin
    .from("quartzy_inventory_links")
    .select("quartzy_item_id")
    .eq("lab_reagent_id", labReagentId)
    .maybeSingle();

  if (error || !link?.quartzy_item_id) {
    return;
  }

  const payload: Record<string, string | number> = {
    quantity: nextQuantity,
  };
  if (eventType === "reorder_received") {
    payload.status = "received";
  }

  try {
    const response = await fetch(
      `${baseUrl}/inventory-items/${encodeURIComponent(link.quartzy_item_id)}`,
      {
        method: "PUT",
        headers: quartzyHeaders(token),
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );

    if (!response.ok && eventType === "reorder_received") {
      const fallback = await fetch(
        `${baseUrl}/inventory-items/${encodeURIComponent(link.quartzy_item_id)}`,
        {
          method: "PUT",
          headers: quartzyHeaders(token),
          body: JSON.stringify({ quantity: nextQuantity, state: "received" }),
          cache: "no-store",
        },
      );
      if (fallback.ok) return;
    }
  } catch {
    // Best-effort only: local inventory updates should not fail when external sync is down.
  }
}

export async function createLabReagent(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const labId = normalizeOptionalString(formData.get("lab_id"));
    const name = normalizeOptionalString(formData.get("name"));
    const quantity = parseNumericInput(formData.get("quantity")) ?? 0;
    const reorderThreshold = parseNumericInput(formData.get("reorder_threshold"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!labId || labId !== activeLabId) {
      return { error: "Lab context is required before creating a shared reagent." };
    }

    if (!name) {
      return { error: "Reagent name is required." };
    }

    const { error } = await supabase.from("lab_reagents").insert({
      lab_id: labId,
      name,
      catalog_number: normalizeOptionalString(formData.get("catalog_number")),
      supplier: normalizeOptionalString(formData.get("supplier")),
      lot_number: normalizeOptionalString(formData.get("lot_number")),
      quantity,
      unit: normalizeOptionalString(formData.get("unit")),
      reorder_threshold: reorderThreshold,
      needs_reorder: reorderThreshold !== null ? quantity <= reorderThreshold : false,
      storage_location: normalizeOptionalString(formData.get("storage_location")),
      notes: normalizeOptionalString(formData.get("notes")),
      created_by: userId,
    });

    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to create reagent.",
      );
    }

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create reagent.",
    };
  }
}

export async function updateLabReagent(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const reagentId = normalizeOptionalString(formData.get("lab_reagent_id"));
    const name = normalizeOptionalString(formData.get("name"));
    const quantity = parseNumericInput(formData.get("quantity"));
    const reorderThreshold = parseNumericInput(formData.get("reorder_threshold"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!reagentId) return { error: "Reagent id is required." };
    if (!name) return { error: "Reagent name is required." };
    if (quantity === null) return { error: "Quantity is required." };

    const { data: reagent, error: reagentError } = await supabase
      .from("lab_reagents")
      .select("id,lab_id")
      .eq("id", reagentId)
      .maybeSingle();

    if (reagentError) {
      throw new Error(reagentError.message || "Unable to validate reagent context.");
    }
    if (!reagent || reagent.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before editing this reagent." };
    }

    const { error: updateError } = await supabase
      .from("lab_reagents")
      .update({
        name,
        catalog_number: normalizeOptionalString(formData.get("catalog_number")),
        supplier: normalizeOptionalString(formData.get("supplier")),
        lot_number: normalizeOptionalString(formData.get("lot_number")),
        quantity,
        unit: normalizeOptionalString(formData.get("unit")),
        reorder_threshold: reorderThreshold,
        needs_reorder: reorderThreshold !== null ? quantity <= reorderThreshold : false,
        storage_location: normalizeOptionalString(formData.get("storage_location")),
        notes: normalizeOptionalString(formData.get("notes")),
      })
      .eq("id", reagentId);

    if (updateError) {
      throw new Error(
        isMissingLabRelationError(updateError)
          ? withOperationsSchemaGuidance(updateError.message)
          : updateError.message || "Unable to update reagent.",
      );
    }

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update reagent.",
    };
  }
}

export async function deleteLabReagent(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const reagentId = normalizeOptionalString(formData.get("lab_reagent_id"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;
    if (!reagentId) return { error: "Reagent id is required." };

    const { data: reagent, error: reagentError } = await supabase
      .from("lab_reagents")
      .select("id,lab_id")
      .eq("id", reagentId)
      .maybeSingle();

    if (reagentError) {
      throw new Error(reagentError.message || "Unable to validate reagent context.");
    }
    if (!reagent || reagent.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before deleting this reagent." };
    }

    const roleCheck = await ensureActiveLabMember(supabase, activeLabId!, userId);
    if (roleCheck) return roleCheck;

    const { error } = await supabase.from("lab_reagents").delete().eq("id", reagentId);
    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to delete reagent.",
      );
    }

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete reagent.",
    };
  }
}

export async function createReagentStockEvent(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const labReagentId = normalizeOptionalString(formData.get("lab_reagent_id"));
    const eventTypeRaw = normalizeOptionalString(formData.get("event_type"));
    const quantityDelta = parseNumericInput(formData.get("quantity_delta")) ?? 0;

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!labReagentId) {
      return { error: "A reagent is required before recording a stock event." };
    }

    if (!eventTypeRaw || !INVENTORY_EVENT_TYPES.has(eventTypeRaw as PlatformInventoryEventType)) {
      return { error: "Choose a valid inventory event type." };
    }

    const eventType = eventTypeRaw as PlatformInventoryEventType;

    const { data: reagent, error: reagentError } = await supabase
      .from("lab_reagents")
      .select("id,lab_id,quantity,reorder_threshold,last_ordered_at")
      .eq("id", labReagentId)
      .maybeSingle();

    if (reagentError) {
      throw new Error(
        isMissingLabRelationError(reagentError)
          ? withOperationsSchemaGuidance(reagentError.message)
          : reagentError.message || "Unable to load reagent state.",
      );
    }

    if (!reagent) {
      return { error: "That reagent is no longer available." };
    }

    if (reagent.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before recording stock events." };
    }

    const { error: eventError } = await supabase.from("lab_reagent_stock_events").insert({
      lab_reagent_id: labReagentId,
      event_type: eventType,
      quantity_delta: quantityDelta,
      unit: normalizeOptionalString(formData.get("unit")),
      vendor: normalizeOptionalString(formData.get("vendor")),
      reference_number: normalizeOptionalString(formData.get("reference_number")),
      purchase_order_number: normalizeOptionalString(formData.get("purchase_order_number")),
      expected_arrival_at: parseDateTimeInput(formData.get("expected_arrival_at")),
      notes: normalizeOptionalString(formData.get("notes")),
      created_by: userId,
    });

    if (eventError) {
      throw new Error(
        isMissingLabRelationError(eventError)
          ? withOperationsSchemaGuidance(eventError.message)
          : eventError.message || "Unable to record the stock event.",
      );
    }

    const currentQuantity = typeof reagent.quantity === "number" ? reagent.quantity : Number(reagent.quantity ?? 0);
    const threshold =
      typeof reagent.reorder_threshold === "number"
        ? reagent.reorder_threshold
        : reagent.reorder_threshold === null
          ? null
          : Number(reagent.reorder_threshold);
    const nextQuantity = currentQuantity + quantityDelta;
    const updateLastOrderedAt =
      eventType === "reorder_placed" || eventType === "reorder_received" ? new Date().toISOString() : reagent.last_ordered_at;

    const { error: updateError } = await supabase
      .from("lab_reagents")
      .update({
        quantity: nextQuantity,
        needs_reorder: threshold !== null ? nextQuantity <= threshold : false,
        last_ordered_at: updateLastOrderedAt,
      })
      .eq("id", labReagentId);

    if (updateError) {
      throw new Error(updateError.message || "Unable to update reagent inventory totals.");
    }

    await pushQuartzyInventoryUpdateForReagent({
      labReagentId,
      nextQuantity,
      eventType,
    });

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to record the stock event.",
    };
  }
}

export async function createEquipmentBooking(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const equipmentId = normalizeOptionalString(formData.get("equipment_id"));
    const title = normalizeOptionalString(formData.get("title"));
    const startsAt = normalizeOptionalString(formData.get("starts_at"));
    const endsAt = normalizeOptionalString(formData.get("ends_at"));
    const taskId = normalizeOptionalString(formData.get("task_id"));
    const experimentRunId = normalizeOptionalString(formData.get("experiment_run_id"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!equipmentId) {
      return { error: "Choose a piece of equipment before creating a booking." };
    }

    if (!title) {
      return { error: "Booking title is required." };
    }

    if (!startsAt || !endsAt) {
      return { error: "Booking start and end times are required." };
    }

    const startsAtIso = new Date(startsAt).toISOString();
    const endsAtIso = new Date(endsAt).toISOString();

    if (Number.isNaN(new Date(startsAtIso).getTime()) || Number.isNaN(new Date(endsAtIso).getTime())) {
      return { error: "Enter valid booking times." };
    }

    if (new Date(endsAtIso) <= new Date(startsAtIso)) {
      return { error: "Booking end time must be after the start time." };
    }

    const { data: equipmentRecord, error: equipmentError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id,booking_requires_approval")
      .eq("id", equipmentId)
      .maybeSingle();

    if (equipmentError) {
      throw new Error(equipmentError.message || "Unable to validate equipment context.");
    }

    if (!equipmentRecord || equipmentRecord.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before booking this equipment." };
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from("lab_equipment_bookings")
      .select("id")
      .eq("equipment_id", equipmentId)
      .lt("starts_at", endsAtIso)
      .gt("ends_at", startsAtIso)
      .not("status", "in", '("cancelled","completed")')
      .limit(1);

    if (conflictError) {
      throw new Error(
        isMissingLabRelationError(conflictError)
          ? withOperationsSchemaGuidance(conflictError.message)
          : conflictError.message || "Unable to validate booking conflicts.",
      );
    }

    if ((conflicts ?? []).length > 0) {
      return { error: "That time window overlaps an existing active booking." };
    }

    const initialStatus: PlatformBookingStatus =
      equipmentRecord.booking_requires_approval === true ? "draft" : "confirmed";

    const { data: booking, error } = await supabase
      .from("lab_equipment_bookings")
      .insert({
        equipment_id: equipmentId,
        booked_by: userId,
        experiment_run_id: experimentRunId,
        task_id: taskId,
        title,
        notes: normalizeOptionalString(formData.get("notes")),
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        status: initialStatus,
      })
      .select("id,equipment_id,booked_by,title,starts_at,ends_at,status,task_id,notes")
      .single();

    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to create the booking.",
      );
    }

    if (booking?.id) {
      try {
        await syncEquipmentBookingToOutlook(booking.id as string, { admin: createAdminClient() });
      } catch (syncError) {
        await supabase.from("lab_equipment_bookings").delete().eq("id", booking.id as string);
        throw syncError;
      }
    }

    await refreshOperationsPage();
    return {
      success: true,
      booking: booking
        ? {
            id: booking.id as string,
            equipment_id: booking.equipment_id as string,
            booked_by: booking.booked_by as string | null,
            title: booking.title as string,
            starts_at: booking.starts_at as string,
            ends_at: booking.ends_at as string,
            status: booking.status as PlatformBookingStatus,
            task_id: booking.task_id as string | null,
            notes: booking.notes as string | null,
          }
        : undefined,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create the booking.",
    };
  }
}

export async function createLabEquipment(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const labId = normalizeOptionalString(formData.get("lab_id"));
    const name = normalizeOptionalString(formData.get("name"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!labId || labId !== activeLabId) {
      return { error: "Lab context is required before creating equipment." };
    }

    if (!name) {
      return { error: "Equipment name is required." };
    }

    const roleCheck = await ensureManagerOrAdmin(supabase, activeLabId!, userId);
    if (roleCheck) return roleCheck;

    const outlookCalendarId = normalizeOptionalString(formData.get("outlook_calendar_id"));
    const outlookCalendarName = normalizeOptionalString(formData.get("outlook_calendar_name"));

    const { data: equipment, error } = await supabase
      .from("lab_equipment")
      .insert({
        lab_id: labId,
        name,
        description: normalizeOptionalString(formData.get("description")),
        location: normalizeOptionalString(formData.get("location")),
        booking_requires_approval: parseBooleanInput(formData.get("booking_requires_approval")),
        outlook_calendar_id: outlookCalendarId,
        outlook_calendar_name: outlookCalendarId ? (outlookCalendarName ?? name) : null,
        is_active: true,
        created_by: userId,
      })
      .select("id,name,description,location,booking_requires_approval,outlook_calendar_id,outlook_calendar_name,outlook_sync_owner_user_id,is_active")
      .single();

    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to create equipment.",
      );
    }

    await refreshOperationsPage();
    return {
      success: true,
      equipment: toEquipmentResult(equipment),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create equipment.",
    };
  }
}

export async function updateLabEquipment(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const equipmentId = normalizeOptionalString(formData.get("equipment_id"));
    const name = normalizeOptionalString(formData.get("name"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;
    if (!equipmentId) return { error: "Equipment id is required." };
    if (!name) return { error: "Equipment name is required." };

    const { data: equipmentRecord, error: equipmentLookupError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id,is_active")
      .eq("id", equipmentId)
      .maybeSingle();

    if (equipmentLookupError) {
      throw new Error(equipmentLookupError.message || "Unable to validate equipment context.");
    }
    if (!equipmentRecord || equipmentRecord.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before editing this equipment." };
    }

    const roleCheck = await ensureManagerOrAdmin(supabase, activeLabId!, userId);
    if (roleCheck) return roleCheck;

    const outlookCalendarId = normalizeOptionalString(formData.get("outlook_calendar_id"));
    const outlookCalendarName = normalizeOptionalString(formData.get("outlook_calendar_name"));

    const { data: equipment, error } = await supabase
      .from("lab_equipment")
      .update({
        name,
        description: normalizeOptionalString(formData.get("description")),
        location: normalizeOptionalString(formData.get("location")),
        booking_requires_approval: parseBooleanInput(formData.get("booking_requires_approval")),
        outlook_calendar_id: outlookCalendarId,
        outlook_calendar_name: outlookCalendarId ? (outlookCalendarName ?? name) : null,
      })
      .eq("id", equipmentId)
      .select("id,name,description,location,booking_requires_approval,outlook_calendar_id,outlook_calendar_name,outlook_sync_owner_user_id,is_active")
      .single();

    if (error) {
      throw new Error(error.message || "Unable to update equipment.");
    }

    await refreshOperationsPage();
    return {
      success: true,
      equipment: toEquipmentResult(equipment),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update equipment.",
    };
  }
}

export async function setLabEquipmentActive(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const equipmentId = normalizeOptionalString(formData.get("equipment_id"));
    const isActive = parseBooleanInput(formData.get("is_active"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;
    if (!equipmentId) return { error: "Equipment id is required." };

    const { data: equipmentRecord, error: equipmentLookupError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id")
      .eq("id", equipmentId)
      .maybeSingle();

    if (equipmentLookupError) {
      throw new Error(equipmentLookupError.message || "Unable to validate equipment context.");
    }
    if (!equipmentRecord || equipmentRecord.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before updating this equipment." };
    }

    const roleCheck = await ensureManagerOrAdmin(supabase, activeLabId!, userId);
    if (roleCheck) return roleCheck;

    const { data: equipment, error } = await supabase
      .from("lab_equipment")
      .update({ is_active: isActive })
      .eq("id", equipmentId)
      .select("id,name,description,location,booking_requires_approval,outlook_calendar_id,outlook_calendar_name,outlook_sync_owner_user_id,is_active")
      .single();

    if (error) {
      throw new Error(error.message || "Unable to update equipment status.");
    }

    await refreshOperationsPage();
    return {
      success: true,
      equipment: toEquipmentResult(equipment),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update equipment status.",
    };
  }
}

export async function deleteLabEquipment(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const equipmentId = normalizeOptionalString(formData.get("equipment_id"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;
    if (!equipmentId) return { error: "Equipment id is required." };

    const { data: equipmentRecord, error: equipmentLookupError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id")
      .eq("id", equipmentId)
      .maybeSingle();

    if (equipmentLookupError) {
      throw new Error(equipmentLookupError.message || "Unable to validate equipment context.");
    }
    if (!equipmentRecord || equipmentRecord.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before deleting this equipment." };
    }

    const roleCheck = await ensureManagerOrAdmin(supabase, activeLabId!, userId);
    if (roleCheck) return roleCheck;

    const { data: bookingsToDelete, error: bookingLookupError } = await supabase
      .from("lab_equipment_bookings")
      .select("id")
      .eq("equipment_id", equipmentId);
    if (bookingLookupError) {
      throw new Error(bookingLookupError.message || "Unable to load equipment bookings before deletion.");
    }

    const admin = createAdminClient();
    for (const booking of bookingsToDelete ?? []) {
      await deleteEquipmentBookingFromOutlook(String(booking.id), { admin });
    }

    const { error } = await supabase.from("lab_equipment").delete().eq("id", equipmentId);
    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to delete equipment.",
      );
    }

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete equipment.",
    };
  }
}

export async function updateEquipmentBookingStatus(
  bookingId: string,
  status: PlatformBookingStatus,
  activeLabId: string | null,
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!bookingId) {
      return { error: "Booking id is required." };
    }

    if (!BOOKING_STATUSES.has(status)) {
      return { error: "Choose a valid booking status." };
    }

    const { data: bookingRecord, error: bookingLookupError } = await supabase
      .from("lab_equipment_bookings")
      .select("id,equipment_id,booked_by,status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingLookupError) {
      throw new Error(bookingLookupError.message || "Unable to validate booking context.");
    }

    if (!bookingRecord) {
      return { error: "That booking is no longer available." };
    }

    const { data: equipmentRecord, error: equipmentLookupError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id,booking_requires_approval")
      .eq("id", bookingRecord.equipment_id)
      .maybeSingle();

    if (equipmentLookupError) {
      throw new Error(equipmentLookupError.message || "Unable to validate equipment context.");
    }

    if (!equipmentRecord || equipmentRecord.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before updating this booking." };
    }

    const role = await getLabMemberRole(supabase, activeLabId!, userId);
    const isManagerOrAdmin = role === "manager" || role === "admin";
    const isOwner = bookingRecord.booked_by === userId;
    if (!isOwner && !isManagerOrAdmin) {
      return { error: "Only booking owners, lab managers, or admins can change booking status." };
    }

    const requiresApproval = equipmentRecord.booking_requires_approval === true;
    if (requiresApproval && status === "confirmed" && !isManagerOrAdmin) {
      return { error: "Only lab managers or admins can approve this booking." };
    }

    const admin = createAdminClient();
    const previousStatus = bookingRecord.status as PlatformBookingStatus;
    const { data: booking, error } = await supabase
      .from("lab_equipment_bookings")
      .update({ status })
      .eq("id", bookingId)
      .select("id,equipment_id,booked_by,title,starts_at,ends_at,status,task_id,notes")
      .single();

    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to update the booking.",
      );
    }

    if (booking?.id) {
      try {
        if (status === "cancelled") {
          await deleteEquipmentBookingFromOutlook(booking.id as string, { admin });
        } else {
          await syncEquipmentBookingToOutlook(booking.id as string, { admin });
        }
      } catch (syncError) {
        await supabase
          .from("lab_equipment_bookings")
          .update({ status: previousStatus })
          .eq("id", booking.id as string);
        throw syncError;
      }
    }

    await refreshOperationsPage();
    return {
      success: true,
      booking: booking
        ? {
            id: booking.id as string,
            equipment_id: booking.equipment_id as string,
            booked_by: booking.booked_by as string | null,
            title: booking.title as string,
            starts_at: booking.starts_at as string,
            ends_at: booking.ends_at as string,
            status: booking.status as PlatformBookingStatus,
            task_id: booking.task_id as string | null,
            notes: booking.notes as string | null,
          }
        : undefined,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update the booking.",
    };
  }
}

export async function updateEquipmentBooking(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const bookingId = normalizeOptionalString(formData.get("booking_id"));
    const title = normalizeOptionalString(formData.get("title"));
    const startsAt = normalizeOptionalString(formData.get("starts_at"));
    const endsAt = normalizeOptionalString(formData.get("ends_at"));
    const notes = normalizeOptionalString(formData.get("notes"));
    const taskId = normalizeOptionalString(formData.get("task_id"));
    const statusRaw = normalizeOptionalString(formData.get("status"));
    const equipmentId = normalizeOptionalString(formData.get("equipment_id"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!bookingId) {
      return { error: "Booking id is required." };
    }
    if (!title) {
      return { error: "Booking title is required." };
    }
    if (!startsAt || !endsAt) {
      return { error: "Booking start and end times are required." };
    }
    if (!equipmentId) {
      return { error: "Equipment is required." };
    }

    const startsAtIso = new Date(startsAt).toISOString();
    const endsAtIso = new Date(endsAt).toISOString();
    if (Number.isNaN(new Date(startsAtIso).getTime()) || Number.isNaN(new Date(endsAtIso).getTime())) {
      return { error: "Enter valid booking times." };
    }
    if (new Date(endsAtIso) <= new Date(startsAtIso)) {
      return { error: "Booking end time must be after the start time." };
    }

    const status = statusRaw as PlatformBookingStatus | null;
    if (status && !BOOKING_STATUSES.has(status)) {
      return { error: "Choose a valid booking status." };
    }

    const { data: bookingRecord, error: bookingLookupError } = await supabase
      .from("lab_equipment_bookings")
      .select("id,equipment_id,booked_by,status,title,notes,task_id,starts_at,ends_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingLookupError) {
      throw new Error(bookingLookupError.message || "Unable to validate booking context.");
    }
    if (!bookingRecord) {
      return { error: "That booking is no longer available." };
    }

    const { data: targetEquipment, error: equipmentLookupError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id")
      .eq("id", equipmentId)
      .maybeSingle();
    if (equipmentLookupError) {
      throw new Error(equipmentLookupError.message || "Unable to validate equipment context.");
    }
    if (!targetEquipment || targetEquipment.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before editing this booking." };
    }

    const { data: memberRecord, error: memberError } = await supabase
      .from("lab_members")
      .select("role")
      .eq("lab_id", activeLabId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message || "Unable to validate booking permissions.");
    }

    const isManagerOrAdmin = memberRecord?.role === "manager" || memberRecord?.role === "admin";
    const isOwner = bookingRecord.booked_by === userId;
    if (!isOwner && !isManagerOrAdmin) {
      return { error: "Only booking owners, lab managers, or admins can edit this booking." };
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from("lab_equipment_bookings")
      .select("id")
      .eq("equipment_id", equipmentId)
      .lt("starts_at", endsAtIso)
      .gt("ends_at", startsAtIso)
      .not("status", "in", '("cancelled","completed")')
      .neq("id", bookingId)
      .limit(1);

    if (conflictError) {
      throw new Error(
        isMissingLabRelationError(conflictError)
          ? withOperationsSchemaGuidance(conflictError.message)
          : conflictError.message || "Unable to validate booking conflicts.",
      );
    }

    if ((conflicts ?? []).length > 0) {
      return { error: "That time window overlaps an existing active booking." };
    }

    const nextStatus = status ?? (bookingRecord.status as PlatformBookingStatus);
    const previousBookingValues = {
      equipment_id: bookingRecord.equipment_id as string,
      title: bookingRecord.title as string,
      notes: bookingRecord.notes as string | null,
      task_id: bookingRecord.task_id as string | null,
      starts_at: bookingRecord.starts_at as string,
      ends_at: bookingRecord.ends_at as string,
      status: bookingRecord.status as PlatformBookingStatus,
    };
    const { data: booking, error } = await supabase
      .from("lab_equipment_bookings")
      .update({
        equipment_id: equipmentId,
        title,
        notes,
        task_id: taskId,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        status: nextStatus,
      })
      .eq("id", bookingId)
      .select("id,equipment_id,booked_by,title,starts_at,ends_at,status,task_id,notes")
      .single();

    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to update the booking.",
      );
    }

    if (booking?.id) {
      try {
        await syncEquipmentBookingToOutlook(booking.id as string, { admin: createAdminClient() });
      } catch (syncError) {
        await supabase
          .from("lab_equipment_bookings")
          .update(previousBookingValues)
          .eq("id", booking.id as string);
        throw syncError;
      }
    }

    await refreshOperationsPage();
    return {
      success: true,
      booking: booking
        ? {
            id: booking.id as string,
            equipment_id: booking.equipment_id as string,
            booked_by: booking.booked_by as string | null,
            title: booking.title as string,
            starts_at: booking.starts_at as string,
            ends_at: booking.ends_at as string,
            status: booking.status as PlatformBookingStatus,
            task_id: booking.task_id as string | null,
            notes: booking.notes as string | null,
          }
        : undefined,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update the booking.",
    };
  }
}

export async function deleteEquipmentBooking(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const bookingId = normalizeOptionalString(formData.get("booking_id"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;
    if (!bookingId) {
      return { error: "Booking id is required." };
    }

    const { data: bookingRecord, error: bookingLookupError } = await supabase
      .from("lab_equipment_bookings")
      .select("id,equipment_id,booked_by")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingLookupError) {
      throw new Error(bookingLookupError.message || "Unable to validate booking context.");
    }
    if (!bookingRecord) {
      return { error: "That booking is no longer available." };
    }

    const { data: equipmentRecord, error: equipmentLookupError } = await supabase
      .from("lab_equipment")
      .select("id,lab_id")
      .eq("id", bookingRecord.equipment_id)
      .maybeSingle();

    if (equipmentLookupError) {
      throw new Error(equipmentLookupError.message || "Unable to validate equipment context.");
    }
    if (!equipmentRecord || equipmentRecord.lab_id !== activeLabId) {
      return { error: "Switch to the matching active lab before deleting this booking." };
    }

    const role = await getLabMemberRole(supabase, activeLabId!, userId);
    const isManagerOrAdmin = role === "manager" || role === "admin";
    const isOwner = bookingRecord.booked_by === userId;
    if (!isOwner && !isManagerOrAdmin) {
      return { error: "Only booking owners, lab managers, or admins can delete this booking." };
    }

    try {
      await deleteEquipmentBookingFromOutlook(bookingId, { admin: createAdminClient() });
    } catch (syncError) {
      throw syncError;
    }

    const { error } = await supabase.from("lab_equipment_bookings").delete().eq("id", bookingId);
    if (error) {
      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to delete the booking.",
      );
    }

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete the booking.",
    };
  }
}

export async function createTaskLink(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const activeLabId = parseActiveLabId(formData);
    const taskId = normalizeOptionalString(formData.get("task_id"));
    const linkedObjectId = normalizeOptionalString(formData.get("linked_object_id"));
    const linkedObjectTypeRaw = normalizeOptionalString(formData.get("linked_object_type"));

    const activeLabCheck = ensureActiveLabId(activeLabId);
    if (activeLabCheck) return activeLabCheck;

    if (!taskId || !linkedObjectId) {
      return { error: "Task and target object are required." };
    }

    if (!linkedObjectTypeRaw || !LINKED_OBJECT_TYPES.has(linkedObjectTypeRaw as PlatformLinkedObjectType)) {
      return { error: "Choose a valid link target." };
    }

    const linkedObjectType = linkedObjectTypeRaw as PlatformLinkedObjectType;

    if (linkedObjectType === "lab_reagent") {
      const { data: reagent, error: reagentError } = await supabase
        .from("lab_reagents")
        .select("id,lab_id")
        .eq("id", linkedObjectId)
        .maybeSingle();

      if (reagentError) {
        throw new Error(reagentError.message || "Unable to validate reagent context.");
      }

      if (!reagent || reagent.lab_id !== activeLabId) {
        return { error: "Switch to the matching active lab before linking tasks." };
      }
    }

    if (linkedObjectType === "lab_equipment_booking") {
      const { data: booking, error: bookingError } = await supabase
        .from("lab_equipment_bookings")
        .select("id,equipment_id")
        .eq("id", linkedObjectId)
        .maybeSingle();

      if (bookingError) {
        throw new Error(bookingError.message || "Unable to validate booking context.");
      }

      if (!booking) {
        return { error: "That booking is no longer available." };
      }

      const { data: equipment, error: equipmentError } = await supabase
        .from("lab_equipment")
        .select("id,lab_id")
        .eq("id", booking.equipment_id)
        .maybeSingle();

      if (equipmentError) {
        throw new Error(equipmentError.message || "Unable to validate equipment context.");
      }

      if (!equipment || equipment.lab_id !== activeLabId) {
        return { error: "Switch to the matching active lab before linking tasks." };
      }
    }

    const { error } = await supabase.from("task_links").insert({
      task_id: taskId,
      linked_object_type: linkedObjectType,
      linked_object_id: linkedObjectId,
      created_by: userId,
    });

    if (error) {
      if (error.code === "23505") {
        return { success: true };
      }

      throw new Error(
        isMissingLabRelationError(error)
          ? withOperationsSchemaGuidance(error.message)
          : error.message || "Unable to attach the task link.",
      );
    }

    await refreshOperationsPage();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to attach the task link.",
    };
  }
}

export async function createObjectMessage(input: {
  labId: string;
  linkedObjectType: PlatformLinkedObjectType;
  linkedObjectId: string;
  body: string;
  subject?: string | null;
}): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const labId = typeof input.labId === "string" ? input.labId.trim() : "";
    const linkedObjectId = typeof input.linkedObjectId === "string" ? input.linkedObjectId.trim() : "";
    const linkedObjectTypeRaw =
      typeof input.linkedObjectType === "string" ? input.linkedObjectType.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const subject =
      typeof input.subject === "string" && input.subject.trim().length > 0
        ? input.subject.trim()
        : null;

    if (!labId) {
      return { error: "A shared lab context is required before posting a shared message." };
    }

    if (!linkedObjectId || !body) {
      return { error: "A target object and message body are required." };
    }

    if (!linkedObjectTypeRaw || !LINKED_OBJECT_TYPES.has(linkedObjectTypeRaw as PlatformLinkedObjectType)) {
      return { error: "Choose a valid message target." };
    }

    const linkedObjectType = linkedObjectTypeRaw as PlatformLinkedObjectType;
    const { data: hasObjectAccess, error: objectAccessError } = await supabase.rpc(
      "can_access_operations_linked_object",
      {
        target_object_type: linkedObjectType,
        target_object_id: linkedObjectId,
      },
    );

    if (objectAccessError) {
      throw new Error(objectAccessError.message || "Unable to validate message access.");
    }

    if (!hasObjectAccess) {
      return { error: "You do not have access to post in this thread." };
    }

    const { data: isLabMember, error: isLabMemberError } = await supabase.rpc("is_lab_member", {
      target_lab_id: labId,
    });

    if (isLabMemberError) {
      throw new Error(isLabMemberError.message || "Unable to validate lab membership.");
    }

    if (!isLabMember) {
      return { error: "A shared lab context is required before posting a shared message." };
    }

    const { data: existingThreads, error: threadLookupError } = await supabase
      .from("message_threads")
      .select("id")
      .eq("lab_id", labId)
      .eq("linked_object_type", linkedObjectType)
      .eq("linked_object_id", linkedObjectId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (threadLookupError) {
      throw new Error(
        isMissingLabRelationError(threadLookupError)
          ? withOperationsSchemaGuidance(threadLookupError.message)
          : threadLookupError.message || "Unable to load the discussion thread.",
      );
    }

    let threadId = existingThreads?.[0]?.id as string | undefined;
    const admin = createAdminClient();

    if (!threadId) {
      const { data: createdLabThread, error: labThreadCreateError } = await supabase
        .from("message_threads")
        .insert({
          lab_id: labId,
          owner_user_id: null,
          subject,
          linked_object_type: linkedObjectType,
          linked_object_id: linkedObjectId,
          created_by: userId,
        })
        .select("id")
        .single();

      if (createdLabThread?.id) {
        threadId = createdLabThread.id as string;
      } else {
        if (!isRowLevelSecurityError(labThreadCreateError)) {
          throw new Error(
            labThreadCreateError
              ? isMissingLabRelationError(labThreadCreateError)
                ? withOperationsSchemaGuidance(labThreadCreateError.message || "Operations threads are unavailable.")
                : labThreadCreateError.message || "Unable to create the discussion thread."
              : "Unable to create the discussion thread.",
          );
        }

        const { data: existingAdminThreads, error: adminLookupError } = await admin
          .from("message_threads")
          .select("id")
          .eq("lab_id", labId)
          .eq("linked_object_type", linkedObjectType)
          .eq("linked_object_id", linkedObjectId)
          .order("created_at", { ascending: true })
          .limit(1);

        if (adminLookupError) {
          throw new Error(adminLookupError.message || "Unable to load the discussion thread.");
        }

        if ((existingAdminThreads ?? []).length > 0) {
          threadId = existingAdminThreads?.[0]?.id as string;
        } else {
          const { data: createdAdminThread, error: adminCreateError } = await admin
            .from("message_threads")
            .insert({
              lab_id: labId,
              owner_user_id: null,
              subject,
              linked_object_type: linkedObjectType,
              linked_object_id: linkedObjectId,
              created_by: userId,
            })
            .select("id")
            .single();

          if (adminCreateError || !createdAdminThread?.id) {
            throw new Error(
              adminCreateError
                ? adminCreateError.message || "Unable to create the discussion thread."
                : "Unable to create the discussion thread.",
            );
          }

          threadId = createdAdminThread.id as string;
        }
      }
    }

    const { data: threadRecord, error: threadRecordError } = await admin
      .from("message_threads")
      .select("id,lab_id,owner_user_id,linked_object_type,linked_object_id")
      .eq("id", threadId)
      .single();

    if (threadRecordError || !threadRecord?.id) {
      throw new Error(
        threadRecordError
          ? isMissingLabRelationError(threadRecordError)
            ? withOperationsSchemaGuidance(threadRecordError.message)
            : threadRecordError.message || "Unable to confirm message thread state."
          : "Unable to confirm message thread state.",
      );
    }

    const authoritativeType = threadRecord.linked_object_type as PlatformLinkedObjectType;
    const authoritativeObjectId = threadRecord.linked_object_id as string;
    const authoritativeLabId = threadRecord.lab_id as string | null;
    const authoritativeOwnerUserId = threadRecord.owner_user_id as string | null;

    if (
      authoritativeType !== linkedObjectType
      || authoritativeObjectId !== linkedObjectId
      || (
        authoritativeLabId === null
          ? authoritativeOwnerUserId !== userId
          : authoritativeLabId !== labId
      )
    ) {
      return {
        error: "Message thread key mismatch detected. Message was not posted.",
      };
    }

    let insertedMessage:
      | { id: string; body: string; created_at: string }
      | null = null;

    const { data: insertedMessageByUser, error: messageError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        author_user_id: userId,
        body,
        metadata: {},
      })
      .select("id,body,created_at")
      .single();

    if (insertedMessageByUser?.id) {
      insertedMessage = {
        id: insertedMessageByUser.id as string,
        body: insertedMessageByUser.body as string,
        created_at: insertedMessageByUser.created_at as string,
      };
    } else if (isRowLevelSecurityError(messageError)) {
      const { data: insertedMessageByAdmin, error: adminMessageError } = await admin
        .from("messages")
        .insert({
          thread_id: threadId,
          author_user_id: userId,
          body,
          metadata: {},
        })
        .select("id,body,created_at")
        .single();

      if (adminMessageError || !insertedMessageByAdmin?.id) {
        throw new Error(
          adminMessageError
            ? adminMessageError.message || "Unable to post the message."
            : "Unable to post the message.",
        );
      }

      insertedMessage = {
        id: insertedMessageByAdmin.id as string,
        body: insertedMessageByAdmin.body as string,
        created_at: insertedMessageByAdmin.created_at as string,
      };
    } else {
      throw new Error(
        messageError
          ? isMissingLabRelationError(messageError)
            ? withOperationsSchemaGuidance(messageError.message)
            : messageError.message || "Unable to post the message."
          : "Unable to post the message.",
      );
    }

    await refreshOperationsPage();
    return {
      success: true,
      message: {
        id: insertedMessage.id,
        body: insertedMessage.body,
        created_at: insertedMessage.created_at,
        linked_object_type: authoritativeType,
        linked_object_id: authoritativeObjectId,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to post the message.",
    };
  }
}
