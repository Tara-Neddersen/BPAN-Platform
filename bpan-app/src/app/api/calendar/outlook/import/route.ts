import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listOutlookCalendarEvents,
  refreshOutlookCalendarToken,
} from "@/lib/outlook-calendar";

function normalizeOutlookDateTime(dateTime?: string | null) {
  if (!dateTime) return null;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("outlook_calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single();
  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: "Outlook Calendar not connected" }, { status: 400 });
  }

  let accessToken = String(tokenRow.access_token);
  let refreshToken = String(tokenRow.refresh_token);
  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshOutlookCalendarToken(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token;
    await supabase
      .from("outlook_calendar_tokens")
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", user.id);
  }

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 120);
  const providerEvents = await listOutlookCalendarEvents(accessToken, {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    top: 500,
  });

  // Skip BPAN-origin Outlook events using the write-sync mapping table.
  const { data: mappedRows } = await supabase
    .from("outlook_calendar_event_map")
    .select("outlook_event_id")
    .eq("user_id", user.id);
  const managedOutlookIds = new Set((mappedRows || []).map((r) => String(r.outlook_event_id)));

  const importable = providerEvents.filter((ev) => ev.id && !managedOutlookIds.has(String(ev.id)));
  const providerIds = importable.map((ev) => String(ev.id));
  const existingRes = providerIds.length
    ? await supabase
        .from("workspace_calendar_events")
        .select("id,source_id")
        .eq("user_id", user.id)
        .eq("source_type", "outlook_external")
        .in("source_id", providerIds)
    : { data: [] as Array<{ id: string; source_id: string }> };
  const existingBySourceId = new Map((existingRes.data || []).map((r) => [String(r.source_id), String(r.id)]));

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ev of importable) {
    try {
      const startAt = normalizeOutlookDateTime(ev.start?.dateTime);
      const endAt = normalizeOutlookDateTime(ev.end?.dateTime);
      if (!startAt) {
        skipped++;
        continue;
      }
      const payload = {
        user_id: user.id,
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
      errors.push(e instanceof Error ? e.message : "outlook_import_failed");
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
