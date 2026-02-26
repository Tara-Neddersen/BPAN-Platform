import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listGoogleCalendarEvents,
  refreshGoogleCalendarToken,
} from "@/lib/google-calendar";
import {
  getGoogleCalendarEventIdForFeedEvent,
  getWorkspaceCalendarFeedEvents,
} from "@/lib/workspace-calendar-feed";

function parseGoogleEventWindow(ev: {
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}) {
  const isAllDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  const startAt = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00.000Z` : null);
  let endAt = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T00:00:00.000Z` : null);
  // Google all-day end date is exclusive; convert to inclusive single-day by nulling same-day-like end.
  if (isAllDay && startAt && endAt) {
    const s = String(startAt).slice(0, 10);
    const e = String(endAt).slice(0, 10);
    if (s === e) endAt = null;
  }
  return { isAllDay, startAt, endAt };
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_calendar_tokens")
    .select("access_token, refresh_token, expires_at, calendar_id")
    .eq("user_id", user.id)
    .single();
  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  let accessToken = String(tokenRow.access_token);
  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshGoogleCalendarToken(String(tokenRow.refresh_token));
    accessToken = refreshed.access_token;
    await supabase
      .from("google_calendar_tokens")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", user.id);
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 120);
  const providerEvents = await listGoogleCalendarEvents(accessToken, String(tokenRow.calendar_id || "primary"), {
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 500,
  });

  const feedEvents = await getWorkspaceCalendarFeedEvents(supabase, user.id);
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
    ? await supabase
        .from("workspace_calendar_events")
        .select("id,source_id")
        .eq("user_id", user.id)
        .eq("source_type", "google_external")
        .in("source_id", providerIds)
    : { data: [] as Array<{ id: string; source_id: string }> };
  const existingBySourceId = new Map((existingRes.data || []).map((r) => [String(r.source_id), String(r.id)]));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ev of importable) {
    try {
      const { isAllDay, startAt, endAt } = parseGoogleEventWindow(ev);
      if (!startAt) {
        skipped++;
        continue;
      }
      const status = ev.status === "cancelled" ? "cancelled" : "scheduled";
      const payload = {
        user_id: user.id,
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
        },
      };
      const existingId = existingBySourceId.get(String(ev.id));
      if (existingId) {
        await supabase
          .from("workspace_calendar_events")
          .update(payload)
          .eq("id", existingId)
          .eq("user_id", user.id);
        updated++;
      } else {
        await supabase.from("workspace_calendar_events").insert(payload);
        imported++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "google_import_failed");
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    updated,
    skipped,
    scanned: providerEvents.length,
    errors: errors.slice(0, 10),
  });
}
