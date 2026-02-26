import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getWorkspaceCalendarFeedEvents } from "@/lib/workspace-calendar-feed";

function esc(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function dtStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function fmtDate(dateStr: string) {
  return dateStr.replace(/-/g, "");
}

export async function GET(_: Request, context: { params: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await context.params;
  const tokenParam = params.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  if (!token) return new NextResponse("Not found", { status: 404 });
  const supabase = createServiceClient();

  const { data: feed } = await supabase
    .from("calendar_feed_tokens")
    .select("user_id")
    .eq("token", token.replace(/\.ics$/i, ""))
    .maybeSingle();
  if (!feed?.user_id) return new NextResponse("Not found", { status: 404 });

  const userId = feed.user_id as string;
  const feedEvents = await getWorkspaceCalendarFeedEvents(supabase, userId);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BPAN Platform//Workspace Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BPAN Workspace",
  ];

  const pushEvent = (uid: string, summary: string, startDateOrDateTime: string, opts?: { end?: string | null; allDay?: boolean; description?: string | null; location?: string | null }) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}@bpan`);
    lines.push(`DTSTAMP:${dtStamp()}`);
    if (opts?.allDay) {
      const start = fmtDate(startDateOrDateTime.slice(0, 10));
      const endDate = opts.end ? fmtDate(String(opts.end).slice(0, 10)) : start;
      const endJs = new Date(`${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(6, 8)}T00:00:00Z`);
      if (!opts.end || endDate === start) endJs.setUTCDate(endJs.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${endJs.toISOString().slice(0, 10).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${dtStamp(new Date(startDateOrDateTime))}`);
      if (opts?.end) lines.push(`DTEND:${dtStamp(new Date(opts.end))}`);
    }
    lines.push(`SUMMARY:${esc(summary)}`);
    if (opts?.description) lines.push(`DESCRIPTION:${esc(opts.description)}`);
    if (opts?.location) lines.push(`LOCATION:${esc(opts.location)}`);
    lines.push("END:VEVENT");
  };

  for (const ev of feedEvents) {
    pushEvent(ev.uid, ev.summary, ev.startAt, {
      end: ev.endAt || null,
      allDay: ev.allDay,
      description: ev.description || null,
      location: ev.location || null,
    });
  }

  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
