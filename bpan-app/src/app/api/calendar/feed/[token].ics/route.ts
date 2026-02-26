import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
  const [workspaceEventsRes, plannerExpsRes, timepointsRes, colonyRes] = await Promise.all([
    supabase.from("workspace_calendar_events").select("id,title,description,start_at,end_at,all_day,status,location").eq("user_id", userId).order("start_at"),
    supabase.from("experiments").select("id,title,description,start_date,end_date,status").eq("user_id", userId),
    supabase.from("experiment_timepoints").select("id,label,scheduled_at,completed_at,experiment_id,experiments(title)").eq("user_id", userId),
    supabase.from("animal_experiments").select("id,experiment_type,scheduled_date,status,timepoint_age_days,animal_id,animals(identifier),cohorts(name)").eq("user_id", userId).not("scheduled_date", "is", null),
  ]);

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

  for (const ev of workspaceEventsRes.data || []) {
    pushEvent(`workspace-${ev.id}`, String(ev.title), String(ev.start_at), {
      end: (ev.end_at as string | null) || null,
      allDay: Boolean(ev.all_day),
      description: (ev.description as string | null) || null,
      location: (ev.location as string | null) || null,
    });
  }

  for (const e of plannerExpsRes.data || []) {
    if (!e.start_date && !e.end_date) continue;
    pushEvent(`planner-${e.id}`, `[Planner] ${String(e.title)}`, String(e.start_date || e.end_date), {
      end: (e.end_date as string | null) || (e.start_date as string | null) || null,
      allDay: true,
      description: (e.description as string | null) || null,
    });
  }

  for (const tp of timepointsRes.data || []) {
    pushEvent(`timepoint-${tp.id}`, `[Timepoint] ${String(tp.label)}${tp.experiments?.title ? ` · ${String(tp.experiments.title)}` : ""}`, String(tp.scheduled_at), {
      allDay: false,
    });
  }

  for (const ae of colonyRes.data || []) {
    if (!ae.scheduled_date) continue;
    const label = String(ae.experiment_type).replace(/_/g, " ");
    const animal = (ae.animals as { identifier?: string } | null)?.identifier || "?";
    const tp = ae.timepoint_age_days != null ? ` @ ${ae.timepoint_age_days}d` : "";
    pushEvent(`colony-${ae.id}`, `[Colony] ${label} · #${animal}${tp}`, String(ae.scheduled_date), {
      allDay: true,
      description: `Status: ${ae.status}`,
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
