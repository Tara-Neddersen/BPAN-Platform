import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshGoogleCalendarToken, upsertGoogleCalendarEvent } from "@/lib/google-calendar";
import { getGoogleCalendarEventIdForFeedEvent, getWorkspaceCalendarFeedEvents } from "@/lib/workspace-calendar-feed";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_calendar_tokens")
    .select("access_token, refresh_token, expires_at, calendar_id")
    .eq("user_id", user.id)
    .single();
  if (tokenErr || !tokenRow) return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });

  let accessToken = tokenRow.access_token as string;
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

  const events = await getWorkspaceCalendarFeedEvents(supabase, user.id);

  let synced = 0;
  const errors: string[] = [];
  for (const ev of events || []) {
    try {
      const meta = ev.workspaceMetadata || {};
      const googleEventId =
        ev.sourceKind === "workspace"
          ? (typeof meta.google_calendar_event_id === "string" ? meta.google_calendar_event_id : null)
          : getGoogleCalendarEventIdForFeedEvent(ev);
      const googleResult = await upsertGoogleCalendarEvent(accessToken, String(tokenRow.calendar_id || "primary"), {
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
        await supabase
          .from("workspace_calendar_events")
          .update({ metadata: nextMeta })
          .eq("id", ev.workspaceEventId)
          .eq("user_id", user.id);
      }
      synced++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "sync_failed");
    }
  }

  return NextResponse.json({ success: true, synced, errors: errors.slice(0, 10) });
}
