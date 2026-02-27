import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listGoogleCalendarEvents,
  refreshGoogleCalendarToken,
  upsertGoogleCalendarEvent,
} from "@/lib/google-calendar";
import {
  listOutlookCalendarEvents,
  refreshOutlookCalendarToken,
  upsertOutlookCalendarEvent,
} from "@/lib/outlook-calendar";
import {
  getGoogleCalendarEventIdForFeedEvent,
  getWorkspaceCalendarFeedEvents,
} from "@/lib/workspace-calendar-feed";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

type GoogleTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id: string | null;
};

type OutlookTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

function parseGoogleEventWindow(ev: {
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}) {
  const isAllDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  const startAt = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00.000Z` : null);
  let endAt = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T00:00:00.000Z` : null);
  if (isAllDay && startAt && endAt) {
    const s = String(startAt).slice(0, 10);
    const e = String(endAt).slice(0, 10);
    if (s === e) endAt = null;
  }
  return { isAllDay, startAt, endAt };
}

function normalizeOutlookDateTime(dateTime?: string | null) {
  if (!dateTime) return null;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function syncAndImportGoogleForUser(admin: ReturnType<typeof createAdminClient>, row: GoogleTokenRow) {
  let accessToken = String(row.access_token);
  if (new Date(String(row.expires_at)).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshGoogleCalendarToken(String(row.refresh_token));
    accessToken = refreshed.access_token;
    await admin
      .from("google_calendar_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", row.user_id);
  }

  const feedEvents = await getWorkspaceCalendarFeedEvents(admin, row.user_id);

  let syncedOut = 0;
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  // Push BPAN feed -> Google
  for (const ev of feedEvents) {
    try {
      const meta = ev.workspaceMetadata || {};
      const googleEventId =
        ev.sourceKind === "workspace"
          ? (typeof meta.google_calendar_event_id === "string" ? meta.google_calendar_event_id : null)
          : getGoogleCalendarEventIdForFeedEvent(ev);
      const googleResult = await upsertGoogleCalendarEvent(accessToken, String(row.calendar_id || "primary"), {
        eventId: googleEventId,
        summary: String(ev.summary),
        description: ev.description || undefined,
        location: ev.location || undefined,
        startAt: String(ev.startAt),
        endAt: ev.endAt || undefined,
        allDay: Boolean(ev.allDay),
      });
      if (ev.sourceKind === "workspace" && ev.workspaceEventId) {
        const nextMeta = { ...meta, google_calendar_event_id: googleResult.id };
        await admin
          .from("workspace_calendar_events")
          .update({ metadata: nextMeta })
          .eq("id", ev.workspaceEventId)
          .eq("user_id", row.user_id);
      }
      syncedOut++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "google_sync_failed");
    }
  }

  // Pull Google external -> BPAN
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 120);
  const providerEvents = await listGoogleCalendarEvents(accessToken, String(row.calendar_id || "primary"), {
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 500,
  });

  const managedGoogleIds = new Set<string>();
  for (const ev of feedEvents) {
    if (ev.sourceKind === "workspace") {
      const meta = ev.workspaceMetadata || {};
      if (typeof meta.google_calendar_event_id === "string") managedGoogleIds.add(meta.google_calendar_event_id);
    } else {
      managedGoogleIds.add(getGoogleCalendarEventIdForFeedEvent(ev));
    }
  }

  const importable = providerEvents.filter((ev) => ev.id && !managedGoogleIds.has(String(ev.id)));
  const providerIds = importable.map((ev) => String(ev.id));
  const existingRes = providerIds.length
    ? await admin
        .from("workspace_calendar_events")
        .select("id,source_id")
        .eq("user_id", row.user_id)
        .eq("source_type", "google_external")
        .in("source_id", providerIds)
    : { data: [] as Array<{ id: string; source_id: string }> };
  const existingBySourceId = new Map((existingRes.data || []).map((r) => [String(r.source_id), String(r.id)]));

  for (const ev of importable) {
    try {
      const { isAllDay, startAt, endAt } = parseGoogleEventWindow(ev);
      if (!startAt) continue;
      const status = ev.status === "cancelled" ? "cancelled" : "scheduled";
      const payload = {
        user_id: row.user_id,
        title: String(ev.summary || "Google Calendar event"),
        description: ev.description || null,
        location: ev.location || null,
        start_at: startAt,
        end_at: endAt,
        all_day: isAllDay,
        status,
        category: "external",
        source_type: "google_external",
        source_id: String(ev.id),
        source_label: "Google Calendar",
        metadata: {
          provider: "google",
          provider_event_id: String(ev.id),
          provider_html_link: ev.htmlLink || null,
          provider_updated_at: ev.updated || null,
          imported_at: new Date().toISOString(),
        },
      };
      const existingId = existingBySourceId.get(String(ev.id));
      if (existingId) {
        await admin
          .from("workspace_calendar_events")
          .update(payload)
          .eq("id", existingId)
          .eq("user_id", row.user_id);
        updated++;
      } else {
        await admin.from("workspace_calendar_events").insert(payload);
        imported++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "google_import_failed");
    }
  }

  await refreshWorkspaceBackstageIndexBestEffort(admin, row.user_id);
  return { syncedOut, imported, updated, errors: errors.slice(0, 20) };
}

async function syncAndImportOutlookForUser(admin: ReturnType<typeof createAdminClient>, row: OutlookTokenRow) {
  let accessToken = String(row.access_token);
  let refreshToken = String(row.refresh_token);
  if (new Date(String(row.expires_at)).getTime() < Date.now() + 60_000) {
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
      .eq("user_id", row.user_id);
  }

  const feedEvents = await getWorkspaceCalendarFeedEvents(admin, row.user_id);
  const sourceUids = feedEvents.map((e) => e.uid);
  const { data: existingMaps } = sourceUids.length
    ? await admin
        .from("outlook_calendar_event_map")
        .select("source_uid,outlook_event_id")
        .eq("user_id", row.user_id)
        .in("source_uid", sourceUids)
    : { data: [] as Array<{ source_uid: string; outlook_event_id: string }> };
  const mapByUid = new Map((existingMaps || []).map((r) => [String(r.source_uid), String(r.outlook_event_id)]));

  let syncedOut = 0;
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  // Push BPAN feed -> Outlook
  for (const ev of feedEvents) {
    try {
      const result = await upsertOutlookCalendarEvent(accessToken, {
        eventId: mapByUid.get(ev.uid) || null,
        subject: ev.summary,
        body: ev.description || undefined,
        location: ev.location || undefined,
        startAt: ev.startAt,
        endAt: ev.endAt || undefined,
        allDay: ev.allDay,
      });
      await admin
        .from("outlook_calendar_event_map")
        .upsert(
          {
            user_id: row.user_id,
            source_uid: ev.uid,
            outlook_event_id: result.id,
          },
          { onConflict: "user_id,source_uid" }
        );
      syncedOut++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "outlook_sync_failed");
    }
  }

  // Pull Outlook external -> BPAN
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 120);
  const providerEvents = await listOutlookCalendarEvents(accessToken, {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    top: 500,
  });

  const { data: mappedRows } = await admin
    .from("outlook_calendar_event_map")
    .select("outlook_event_id")
    .eq("user_id", row.user_id);
  const managedOutlookIds = new Set((mappedRows || []).map((r) => String(r.outlook_event_id)));

  const importable = providerEvents.filter((ev) => ev.id && !managedOutlookIds.has(String(ev.id)));
  const providerIds = importable.map((ev) => String(ev.id));
  const existingRes = providerIds.length
    ? await admin
        .from("workspace_calendar_events")
        .select("id,source_id")
        .eq("user_id", row.user_id)
        .eq("source_type", "outlook_external")
        .in("source_id", providerIds)
    : { data: [] as Array<{ id: string; source_id: string }> };
  const existingBySourceId = new Map((existingRes.data || []).map((r) => [String(r.source_id), String(r.id)]));

  for (const ev of importable) {
    try {
      const startAt = normalizeOutlookDateTime(ev.start?.dateTime);
      const endAt = normalizeOutlookDateTime(ev.end?.dateTime);
      if (!startAt) continue;
      const payload = {
        user_id: row.user_id,
        title: String(ev.subject || "Outlook Calendar event"),
        description: ev.bodyPreview || null,
        location: ev.location?.displayName || null,
        start_at: startAt,
        end_at: endAt,
        all_day: Boolean(ev.isAllDay),
        status: "scheduled",
        category: "external",
        source_type: "outlook_external",
        source_id: String(ev.id),
        source_label: "Outlook Calendar",
        metadata: {
          provider: "outlook",
          provider_event_id: String(ev.id),
          provider_web_link: ev.webLink || null,
          provider_updated_at: ev.lastModifiedDateTime || null,
          imported_at: new Date().toISOString(),
        },
      };
      const existingId = existingBySourceId.get(String(ev.id));
      if (existingId) {
        await admin
          .from("workspace_calendar_events")
          .update(payload)
          .eq("id", existingId)
          .eq("user_id", row.user_id);
        updated++;
      } else {
        await admin.from("workspace_calendar_events").insert(payload);
        imported++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "outlook_import_failed");
    }
  }

  await refreshWorkspaceBackstageIndexBestEffort(admin, row.user_id);
  return { syncedOut, imported, updated, errors: errors.slice(0, 20) };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CALENDAR_CRON_SECRET || process.env.DIGEST_CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [{ data: googleRows, error: googleErr }, { data: outlookRows, error: outlookErr }] = await Promise.all([
    admin
      .from("google_calendar_tokens")
      .select("user_id,access_token,refresh_token,expires_at,calendar_id")
      .limit(500),
    admin
      .from("outlook_calendar_tokens")
      .select("user_id,access_token,refresh_token,expires_at")
      .limit(500),
  ]);

  if (googleErr || outlookErr) {
    return NextResponse.json(
      { error: googleErr?.message || outlookErr?.message || "Failed to load calendar tokens" },
      { status: 500 }
    );
  }

  const report = {
    google: { users: 0, syncedOut: 0, imported: 0, updated: 0, failedUsers: 0, errors: [] as string[] },
    outlook: { users: 0, syncedOut: 0, imported: 0, updated: 0, failedUsers: 0, errors: [] as string[] },
  };

  for (const row of (googleRows || []) as GoogleTokenRow[]) {
    try {
      const res = await syncAndImportGoogleForUser(admin, row);
      report.google.users++;
      report.google.syncedOut += res.syncedOut;
      report.google.imported += res.imported;
      report.google.updated += res.updated;
      if (res.errors.length > 0) report.google.errors.push(...res.errors.slice(0, 2));
    } catch (e) {
      report.google.failedUsers++;
      report.google.errors.push(e instanceof Error ? e.message : "google_user_sync_failed");
    }
  }

  for (const row of (outlookRows || []) as OutlookTokenRow[]) {
    try {
      const res = await syncAndImportOutlookForUser(admin, row);
      report.outlook.users++;
      report.outlook.syncedOut += res.syncedOut;
      report.outlook.imported += res.imported;
      report.outlook.updated += res.updated;
      if (res.errors.length > 0) report.outlook.errors.push(...res.errors.slice(0, 2));
    } catch (e) {
      report.outlook.failedUsers++;
      report.outlook.errors.push(e instanceof Error ? e.message : "outlook_user_sync_failed");
    }
  }

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    report: {
      google: { ...report.google, errors: report.google.errors.slice(0, 20) },
      outlook: { ...report.outlook, errors: report.outlook.errors.slice(0, 20) },
    },
  });
}

