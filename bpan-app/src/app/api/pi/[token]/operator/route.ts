import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getWorkspaceCalendarFeedEvents } from "@/lib/workspace-calendar-feed";

function fmtDateLabel(date: string) {
  return date;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createServiceClient();
    const { data: portal } = await supabase
      .from("advisor_portal")
      .select("user_id, advisor_name, can_see")
      .eq("token", token)
      .maybeSingle();
    if (!portal) return NextResponse.json({ error: "Access denied" }, { status: 404 });

    const body = await req.json();
    const message = String(body?.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    const lower = message.toLowerCase();
    const userId = String(portal.user_id);
    const canSee = Array.isArray(portal.can_see) ? portal.can_see.map(String) : [];

    if (/(summary|overview|status)/i.test(lower)) {
      const [{ count: animalCount }, { count: taskCount }, { count: meetingCount }] = await Promise.all([
        supabase.from("animals").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["pending", "in_progress"]),
        supabase.from("meeting_notes").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      const calendarEvents = canSee.includes("calendar") ? await getWorkspaceCalendarFeedEvents(supabase, userId) : [];
      return NextResponse.json({
        response:
          `PI Summary for ${portal.advisor_name} view:\n` +
          `• Animals: ${animalCount ?? 0}\n` +
          `• Open tasks: ${taskCount ?? 0}\n` +
          `• Meetings logged: ${meetingCount ?? 0}\n` +
          `• Calendar events in feed: ${calendarEvents.length}`,
      });
    }

    const dateMatch = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (dateMatch && /(what('| i)?s|show).*(on|for)|schedule|calendar/i.test(lower)) {
      const date = dateMatch[1];
      const feed = await getWorkspaceCalendarFeedEvents(supabase, userId);
      const items = feed.filter((e) => String(e.startAt).slice(0, 10) === date).slice(0, 25);
      if (items.length === 0) {
        const { data: colonyRows } = await supabase
          .from("animal_experiments")
          .select("experiment_type,status,timepoint_age_days,animals(identifier),cohorts(name)")
          .eq("user_id", userId)
          .eq("scheduled_date", date)
          .order("experiment_type");

        if (!colonyRows || colonyRows.length === 0) {
          return NextResponse.json({ response: `No calendar events found on ${date}.` });
        }

        const colonyLines = colonyRows.slice(0, 30).map((r) => {
          const animalRel = r.animals as { identifier?: string } | null;
          const cohortRel = r.cohorts as { name?: string } | null;
          const animal = animalRel?.identifier || "?";
          const cohort = cohortRel?.name ? ` · ${String(cohortRel.name)}` : "";
          const tp = r.timepoint_age_days != null ? ` @ ${String(r.timepoint_age_days)}d` : "";
          return `• [Colony] ${String(r.experiment_type).replace(/_/g, " ")} · #${animal}${tp}${cohort} (${String(r.status || "scheduled")})`;
        });

        return NextResponse.json({
          response: `PI calendar on ${fmtDateLabel(date)}:\n${colonyLines.join("\n")}`,
        });
      }
      return NextResponse.json({
        response: `PI calendar on ${fmtDateLabel(date)}:\n` + items.map((e) => `• ${e.summary}${e.allDay ? " (all day)" : ` (${String(e.startAt).slice(11, 16)})`}`).join("\n"),
      });
    }

    if (/upcoming/i.test(lower)) {
      const feed = await getWorkspaceCalendarFeedEvents(supabase, userId);
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = feed.filter((e) => String(e.startAt).slice(0, 10) >= today).slice(0, 15);
      return NextResponse.json({
        response: upcoming.length
          ? "Upcoming calendar events:\n" + upcoming.map((e) => `• ${String(e.startAt).slice(0, 10)} — ${e.summary}`).join("\n")
          : "No upcoming events found.",
      });
    }

    const cohortMatch = message.match(/cohort\s+(.+)$/i);
    if (cohortMatch && canSee.includes("animals")) {
      const q = cohortMatch[1].trim();
      const { data: animals } = await supabase
        .from("animals")
        .select("id,identifier,cohorts(name)")
        .eq("user_id", userId);
      const filtered = (animals || []).filter((a) => {
        const rel = a.cohorts as { name?: string } | null;
        return String(rel?.name || "").toLowerCase().includes(q.toLowerCase());
      });
      return NextResponse.json({
        response: filtered.length
          ? `Cohort matches for "${q}" (${filtered.length} animals):\n` +
            filtered.slice(0, 20).map((a) => {
              const rel = a.cohorts as { name?: string } | null;
              return `• ${rel?.name || "Unknown"} — ${String(a.identifier || "?")}`;
            }).join("\n")
          : `No animals found for cohort "${q}".`,
      });
    }

    return NextResponse.json({
      response:
        "PI Operator is read-only. Try:\n" +
        '• "summary"\n' +
        "• \"what's on 2026-03-20\"\n" +
        '• "show upcoming"\n' +
        '• "cohort BPAN 5"\n',
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "PI operator failed" }, { status: 500 });
  }
}
