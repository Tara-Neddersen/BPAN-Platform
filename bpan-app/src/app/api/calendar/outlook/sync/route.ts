import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceCalendarFeedEvents } from "@/lib/workspace-calendar-feed";
import {
  refreshOutlookCalendarToken,
  upsertOutlookCalendarEvent,
} from "@/lib/outlook-calendar";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("outlook_calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single();
  if (tokenErr || !tokenRow) return NextResponse.json({ error: "Outlook Calendar not connected" }, { status: 400 });

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

  const events = await getWorkspaceCalendarFeedEvents(supabase, user.id);
  const sourceUids = events.map((e) => e.uid);
  const { data: existingMaps } = sourceUids.length
    ? await supabase
        .from("outlook_calendar_event_map")
        .select("source_uid, outlook_event_id")
        .eq("user_id", user.id)
        .in("source_uid", sourceUids)
    : { data: [] as Array<{ source_uid: string; outlook_event_id: string }> };
  const mapByUid = new Map((existingMaps || []).map((r) => [String(r.source_uid), String(r.outlook_event_id)]));

  let synced = 0;
  const errors: string[] = [];

  for (const ev of events) {
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
      await supabase
        .from("outlook_calendar_event_map")
        .upsert({
          user_id: user.id,
          source_uid: ev.uid,
          outlook_event_id: result.id,
        }, { onConflict: "user_id,source_uid" });
      synced++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "outlook_sync_failed");
    }
  }

  return NextResponse.json({ success: true, synced, errors: errors.slice(0, 10) });
}
