import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshGoogleCalendarToken, upsertGoogleCalendarEvent } from "@/lib/google-calendar";

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

  const { data: events, error: eventsErr } = await supabase
    .from("workspace_calendar_events")
    .select("id,title,description,start_at,end_at,all_day,location,metadata")
    .eq("user_id", user.id)
    .order("start_at", { ascending: true })
    .limit(500);
  if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 });

  let synced = 0;
  const errors: string[] = [];
  for (const ev of events || []) {
    try {
      const meta = (ev.metadata as Record<string, unknown> | null) || {};
      const googleEventId = typeof meta.google_calendar_event_id === "string" ? meta.google_calendar_event_id : null;
      const googleResult = await upsertGoogleCalendarEvent(accessToken, String(tokenRow.calendar_id || "primary"), {
        eventId: googleEventId,
        summary: String(ev.title),
        description: (ev.description as string | null) || undefined,
        location: (ev.location as string | null) || undefined,
        startAt: String(ev.start_at),
        endAt: (ev.end_at as string | null) || undefined,
        allDay: Boolean(ev.all_day),
      });
      const nextMeta = { ...meta, google_calendar_event_id: googleResult.id };
      await supabase.from("workspace_calendar_events").update({ metadata: nextMeta }).eq("id", ev.id).eq("user_id", user.id);
      synced++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "sync_failed");
    }
  }

  return NextResponse.json({ success: true, synced, errors: errors.slice(0, 10) });
}

