import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteOutlookCalendarEvent,
  listOutlookCalendarEvents,
  refreshOutlookCalendarToken,
  upsertOutlookCalendarEvent,
} from "@/lib/outlook-calendar";
import type { PlatformBookingStatus } from "@/types";

type AdminClient = SupabaseClient;

type EquipmentSyncConfig = {
  id: string;
  name: string;
  location: string | null;
  booking_requires_approval: boolean;
  outlook_calendar_id: string | null;
  outlook_calendar_name: string | null;
};

type BookingRecord = {
  id: string;
  equipment_id: string;
  booked_by: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: PlatformBookingStatus;
};

type OutlookEventMapRecord = {
  id: string;
  equipment_id: string;
  booking_id: string | null;
  outlook_sync_owner_user_id: string;
  outlook_calendar_id: string;
  outlook_event_id: string;
  source: "bpan" | "outlook";
};

type OutlookTokenRecord = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

function normalizeOutlookDateTime(dateTime?: string | null) {
  if (!dateTime) return null;
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildBookingSubject(booking: BookingRecord, equipment: EquipmentSyncConfig) {
  if (booking.status === "draft") return `[Pending] ${booking.title}`;
  if (booking.status === "cancelled") return `[Cancelled] ${booking.title}`;
  return booking.title || equipment.name;
}

function buildBookingBody(booking: BookingRecord, equipment: EquipmentSyncConfig) {
  const segments = [
    `Equipment: ${equipment.name}`,
    booking.notes ? `Notes: ${booking.notes}` : null,
    `BPAN booking id: ${booking.id}`,
  ].filter((segment): segment is string => Boolean(segment));
  return segments.join("\n");
}

async function getValidOutlookAccessToken(admin: AdminClient, userId: string) {
  const { data: tokenRow, error } = await admin
    .from("outlook_calendar_tokens")
    .select("access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to load Outlook Calendar token.");
  }
  if (!tokenRow) {
    throw new Error("Outlook Calendar is not connected for the equipment sync owner.");
  }

  let accessToken = String((tokenRow as OutlookTokenRecord).access_token);
  let refreshToken = String((tokenRow as OutlookTokenRecord).refresh_token);
  if (new Date(String((tokenRow as OutlookTokenRecord).expires_at)).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshOutlookCalendarToken(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token;
    await admin
      .from("outlook_calendar_tokens")
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", userId);
  }

  return accessToken;
}

async function loadEquipmentSyncContext(admin: AdminClient, bookingId: string) {
  const { data: booking, error: bookingError } = await admin
    .from("lab_equipment_bookings")
    .select("id,equipment_id,booked_by,title,notes,starts_at,ends_at,status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message || "Unable to load equipment booking.");
  if (!booking) return null;

  const { data: equipment, error: equipmentError } = await admin
    .from("lab_equipment")
    .select("id,lab_id,name,location,booking_requires_approval,outlook_calendar_id,outlook_calendar_name")
    .eq("id", String((booking as BookingRecord).equipment_id))
    .maybeSingle();
  if (equipmentError) throw new Error(equipmentError.message || "Unable to load equipment sync settings.");
  if (!equipment) return null;

  const { data: lab, error: labError } = await admin
    .from("labs")
    .select("id,outlook_sync_owner_user_id")
    .eq("id", String((equipment as Record<string, unknown>).lab_id))
    .maybeSingle();
  if (labError) throw new Error(labError.message || "Unable to load lab Outlook sync settings.");
  if (!lab) return null;

  return {
    booking: booking as BookingRecord,
    equipment: equipment as EquipmentSyncConfig,
    labSyncOwnerUserId:
      typeof (lab as Record<string, unknown>).outlook_sync_owner_user_id === "string"
        ? ((lab as Record<string, unknown>).outlook_sync_owner_user_id as string)
        : null,
  };
}

export async function syncEquipmentBookingToOutlook(
  bookingId: string,
  options?: { admin?: AdminClient },
) {
  const admin = options?.admin ?? createAdminClient();
  const context = await loadEquipmentSyncContext(admin, bookingId);
  if (!context) return { synced: false, reason: "booking_missing" as const };

  const { booking, equipment, labSyncOwnerUserId } = context;
  if (!equipment.outlook_calendar_id || !labSyncOwnerUserId) {
    return { synced: false, reason: "equipment_not_configured" as const };
  }

  const { data: mapRow, error: mapError } = await admin
    .from("lab_equipment_outlook_event_map")
    .select("id,equipment_id,booking_id,outlook_sync_owner_user_id,outlook_calendar_id,outlook_event_id,source")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (mapError) throw new Error(mapError.message || "Unable to load equipment Outlook event map.");

  const accessToken = await getValidOutlookAccessToken(admin, labSyncOwnerUserId);

  if (booking.status === "cancelled") {
    if (mapRow?.outlook_event_id) {
      await deleteOutlookCalendarEvent(accessToken, {
        calendarId: equipment.outlook_calendar_id,
        eventId: String(mapRow.outlook_event_id),
      });
      await admin
        .from("lab_equipment_outlook_event_map")
        .delete()
        .eq("id", String((mapRow as OutlookEventMapRecord).id));
    }
    return { synced: true, deleted: true };
  }

  const result = await upsertOutlookCalendarEvent(accessToken, {
    calendarId: equipment.outlook_calendar_id,
    eventId: mapRow?.outlook_event_id ? String(mapRow.outlook_event_id) : null,
    subject: buildBookingSubject(booking, equipment),
    body: buildBookingBody(booking, equipment),
    location: equipment.location,
    startAt: booking.starts_at,
    endAt: booking.ends_at,
    allDay: false,
  });

  await admin
    .from("lab_equipment_outlook_event_map")
    .upsert(
      {
        equipment_id: equipment.id,
        booking_id: booking.id,
        outlook_sync_owner_user_id: labSyncOwnerUserId,
        outlook_calendar_id: equipment.outlook_calendar_id,
        outlook_event_id: result.id,
        source: mapRow?.source ?? "bpan",
      },
      { onConflict: "booking_id" },
    );

  return { synced: true, outlookEventId: result.id };
}

export async function deleteEquipmentBookingFromOutlook(
  bookingId: string,
  options?: { admin?: AdminClient },
) {
  const admin = options?.admin ?? createAdminClient();
  const { data: mapRow, error: mapError } = await admin
    .from("lab_equipment_outlook_event_map")
    .select("id,equipment_id,booking_id,outlook_sync_owner_user_id,outlook_calendar_id,outlook_event_id,source")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (mapError) throw new Error(mapError.message || "Unable to load booking Outlook mapping.");
  if (!mapRow) return { synced: false, reason: "mapping_missing" as const };

  const accessToken = await getValidOutlookAccessToken(admin, String((mapRow as OutlookEventMapRecord).outlook_sync_owner_user_id));
  await deleteOutlookCalendarEvent(accessToken, {
    calendarId: String((mapRow as OutlookEventMapRecord).outlook_calendar_id),
    eventId: String((mapRow as OutlookEventMapRecord).outlook_event_id),
  });
  await admin.from("lab_equipment_outlook_event_map").delete().eq("id", String((mapRow as OutlookEventMapRecord).id));
  return { synced: true };
}

async function syncOutlookCalendarForEquipment(
  admin: AdminClient,
  equipment: EquipmentSyncConfig,
  syncOwnerUserId: string,
  input: { windowStart: string; windowEnd: string },
) {
  if (!equipment.outlook_calendar_id) {
    return { created: 0, updated: 0, cancelled: 0 };
  }

  const accessToken = await getValidOutlookAccessToken(admin, syncOwnerUserId);
  const providerEvents = await listOutlookCalendarEvents(accessToken, {
    calendarId: equipment.outlook_calendar_id,
    startDateTime: input.windowStart,
    endDateTime: input.windowEnd,
    top: 500,
  });

  const { data: bookingRows, error: bookingError } = await admin
    .from("lab_equipment_bookings")
    .select("id,equipment_id,booked_by,title,notes,starts_at,ends_at,status")
    .eq("equipment_id", equipment.id);
  if (bookingError) throw new Error(bookingError.message || "Unable to load equipment bookings for Outlook sync.");

  const { data: mapRows, error: mapError } = await admin
    .from("lab_equipment_outlook_event_map")
    .select("id,equipment_id,booking_id,outlook_sync_owner_user_id,outlook_calendar_id,outlook_event_id,source")
    .eq("equipment_id", equipment.id)
    .eq("outlook_calendar_id", equipment.outlook_calendar_id);
  if (mapError) throw new Error(mapError.message || "Unable to load equipment Outlook mappings.");

  const bookingsById = new Map(((bookingRows ?? []) as BookingRecord[]).map((row) => [row.id, row]));
  const mapsByEventId = new Map(((mapRows ?? []) as OutlookEventMapRecord[]).map((row) => [row.outlook_event_id, row]));
  const seenEventIds = new Set<string>();

  let created = 0;
  let updated = 0;
  let cancelled = 0;

  for (const event of providerEvents) {
    if (!event.id) continue;
    const eventId = String(event.id);
    seenEventIds.add(eventId);

    const startAt = normalizeOutlookDateTime(event.start?.dateTime);
    const endAt = normalizeOutlookDateTime(event.end?.dateTime)
      ?? (startAt ? new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString() : null);
    if (!startAt || !endAt) continue;

    const mapped = mapsByEventId.get(eventId);
    const subject = cleanText(event.subject) ?? equipment.name;
    const notes = cleanText(event.bodyPreview || event.body?.content);
    const status: PlatformBookingStatus = event.isCancelled ? "cancelled" : "confirmed";

    if (mapped?.booking_id && bookingsById.has(mapped.booking_id)) {
      const existing = bookingsById.get(mapped.booking_id)!;
      const nextStatus =
        status === "cancelled"
          ? "cancelled"
          : existing.status === "in_use" || existing.status === "completed"
            ? existing.status
            : "confirmed";

      const hasChanges =
        existing.title !== subject
        || existing.notes !== notes
        || existing.starts_at !== startAt
        || existing.ends_at !== endAt
        || existing.status !== nextStatus;

      if (hasChanges) {
        await admin
          .from("lab_equipment_bookings")
          .update({
            title: subject,
            notes,
            starts_at: startAt,
            ends_at: endAt,
            status: nextStatus,
          })
          .eq("id", existing.id);
        updated++;
      }
      continue;
    }

    const { data: insertedBooking, error: insertError } = await admin
      .from("lab_equipment_bookings")
      .insert({
        equipment_id: equipment.id,
        booked_by: null,
        title: subject,
        notes,
        starts_at: startAt,
        ends_at: endAt,
        status,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message || "Unable to import Outlook equipment booking.");

    await admin
      .from("lab_equipment_outlook_event_map")
      .upsert(
        {
          equipment_id: equipment.id,
          booking_id: String(insertedBooking.id),
          outlook_sync_owner_user_id: syncOwnerUserId,
          outlook_calendar_id: equipment.outlook_calendar_id,
          outlook_event_id: eventId,
          source: "outlook",
        },
        { onConflict: "outlook_sync_owner_user_id,outlook_calendar_id,outlook_event_id" },
      );
    created++;
  }

  for (const row of (mapRows ?? []) as OutlookEventMapRecord[]) {
    if (!row.booking_id || seenEventIds.has(row.outlook_event_id)) continue;
    const existing = bookingsById.get(row.booking_id);
    if (!existing) continue;
    if (existing.starts_at >= input.windowEnd || existing.ends_at <= input.windowStart) continue;
    if (existing.status === "cancelled" || existing.status === "completed") continue;
    await admin
      .from("lab_equipment_bookings")
      .update({ status: "cancelled" })
      .eq("id", existing.id);
    cancelled++;
  }

  return { created, updated, cancelled };
}

export async function syncLabEquipmentBookingsFromOutlook(
  labId: string,
  options?: {
    admin?: AdminClient;
    horizonDays?: number;
  },
) {
  const admin = options?.admin ?? createAdminClient();
  const horizonDays = options?.horizonDays ?? 120;
  const windowStartDate = new Date();
  windowStartDate.setDate(windowStartDate.getDate() - 30);
  const windowEndDate = new Date();
  windowEndDate.setDate(windowEndDate.getDate() + horizonDays);

  const { data: labRow, error: labError } = await admin
    .from("labs")
    .select("id,outlook_sync_owner_user_id")
    .eq("id", labId)
    .maybeSingle();
  if (labError) throw new Error(labError.message || "Unable to load lab Outlook sync settings.");
  const syncOwnerUserId =
    typeof (labRow as Record<string, unknown> | null)?.outlook_sync_owner_user_id === "string"
      ? (((labRow as Record<string, unknown>).outlook_sync_owner_user_id) as string)
      : null;
  if (!syncOwnerUserId) return { created: 0, updated: 0, cancelled: 0, errors: [] as string[] };

  const { data: equipmentRows, error } = await admin
    .from("lab_equipment")
    .select("id,name,location,booking_requires_approval,outlook_calendar_id,outlook_calendar_name")
    .eq("lab_id", labId)
    .not("outlook_calendar_id", "is", null);
  if (error) throw new Error(error.message || "Unable to load equipment Outlook sync settings.");

  const report = { created: 0, updated: 0, cancelled: 0, errors: [] as string[] };
  for (const equipment of (equipmentRows ?? []) as EquipmentSyncConfig[]) {
    try {
      const result = await syncOutlookCalendarForEquipment(admin, equipment, syncOwnerUserId, {
        windowStart: windowStartDate.toISOString(),
        windowEnd: windowEndDate.toISOString(),
      });
      report.created += result.created;
      report.updated += result.updated;
      report.cancelled += result.cancelled;
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : `Outlook sync failed for ${equipment.name}.`);
    }
  }

  return report;
}

export async function syncLabEquipmentBookingsFromOutlookBestEffort(
  labId: string,
  options?: { admin?: AdminClient; horizonDays?: number },
) {
  try {
    return await syncLabEquipmentBookingsFromOutlook(labId, options);
  } catch {
    return null;
  }
}
