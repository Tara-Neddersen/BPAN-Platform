import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getWorkspaceCalendarFeedEvents } from "@/lib/workspace-calendar-feed";

const PI_EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling",
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Nesting",
  data_collection: "Transport to Core",
  core_acclimation: "Core Acclimation",
  catwalk: "CatWalk",
  rotarod_hab: "Rotarod Habituation",
  rotarod_test1: "Rotarod Test 1",
  rotarod_test2: "Rotarod Test 2",
  rotarod_recovery: "RR Recovery",
  stamina: "Rotarod Stamina",
  blood_draw: "Plasma Collection",
  eeg_implant: "EEG Implant",
  eeg_recording: "EEG Recording",
  rotarod: "Rotarod (Legacy)",
};

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
        const { data: colonyRows, error: colonyErr } = await supabase
          .from("animal_experiments")
          .select("animal_id,experiment_type,status,timepoint_age_days")
          .eq("user_id", userId)
          .eq("scheduled_date", date)
          .order("experiment_type");

        if (colonyErr || !colonyRows || colonyRows.length === 0) {
          return NextResponse.json({ response: `No calendar events found on ${date}.` });
        }

        const animalIds = [...new Set(colonyRows.map((r) => String(r.animal_id)).filter(Boolean))];
        const { data: animalRows } = animalIds.length
          ? await supabase
              .from("animals")
              .select("id,identifier,cohorts(name)")
              .eq("user_id", userId)
              .in("id", animalIds)
          : { data: [] as Array<{ id: string; identifier: string | null; cohorts: { name?: string } | null }> };
        const animalMap = new Map(
          (animalRows || []).map((a) => [
            String(a.id),
            {
              identifier: a.identifier ? String(a.identifier) : "?",
              cohortName: (a.cohorts as { name?: string } | null)?.name ? String((a.cohorts as { name?: string }).name) : "",
            },
          ])
        );

        const colonyLines = colonyRows.slice(0, 30).map((r) => {
          const animalMeta = animalMap.get(String(r.animal_id));
          const animal = animalMeta?.identifier || "?";
          const cohort = animalMeta?.cohortName ? ` · ${animalMeta.cohortName}` : "";
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

    const cohortDoneMatch =
      message.match(
        /(?:what\s+(?:experiments?|experimetns?|exp(?:eriments?)?)\s+have\s+been\s+done\s+for|what(?:'s| is)\s+done\s+for|progress\s+for)\s+(.+)$/i
      ) ||
      message.match(/(?:done|completed)\s+(?:for|in)\s+(.+)$/i);
    if (cohortDoneMatch && (canSee.includes("experiments") || canSee.includes("timeline") || canSee.includes("results") || canSee.includes("animals"))) {
      const q = cohortDoneMatch[1].trim().replace(/[?.!]+$/, "");
      const { data: cohorts } = await supabase
        .from("cohorts")
        .select("id,name")
        .eq("user_id", userId)
        .order("name");

      const cohort = (cohorts || []).find((c) => String(c.name || "").toLowerCase().includes(q.toLowerCase()));
      if (!cohort) {
        return NextResponse.json({ response: `I couldn't find a cohort matching "${q}".` });
      }

      const { data: animalsInCohort } = await supabase
        .from("animals")
        .select("id,identifier")
        .eq("user_id", userId)
        .eq("cohort_id", cohort.id);
      const animalIds = (animalsInCohort || []).map((a) => String(a.id));
      if (animalIds.length === 0) {
        return NextResponse.json({ response: `No animals found in cohort ${cohort.name}.` });
      }

      const { data: exps } = await supabase
        .from("animal_experiments")
        .select("experiment_type,status,timepoint_age_days,scheduled_date,completed_date,notes")
        .eq("user_id", userId)
        .in("animal_id", animalIds);

      if (!exps || exps.length === 0) {
        return NextResponse.json({ response: `No experiment records found for cohort ${cohort.name}.` });
      }

      const byType = new Map<string, { completed: number; in_progress: number; scheduled: number; skipped: number; pending: number; latest?: string | null }>();
      const byTpAndType = new Map<string, { completed: number; total: number }>();
      for (const e of exps) {
        const type = String(e.experiment_type || "unknown");
        const status = String(e.status || "pending");
        const cur = byType.get(type) || { completed: 0, in_progress: 0, scheduled: 0, skipped: 0, pending: 0, latest: null };
        if (status === "completed") cur.completed++;
        else if (status === "in_progress") cur.in_progress++;
        else if (status === "scheduled") cur.scheduled++;
        else if (status === "skipped") cur.skipped++;
        else cur.pending++;
        const date = String(e.completed_date || e.scheduled_date || "");
        if (date && (!cur.latest || date > cur.latest)) cur.latest = date;
        byType.set(type, cur);

        if (e.timepoint_age_days != null) {
          const key = `${String(e.timepoint_age_days)}::${type}`;
          const tpCur = byTpAndType.get(key) || { completed: 0, total: 0 };
          tpCur.total++;
          if (status === "completed") tpCur.completed++;
          byTpAndType.set(key, tpCur);
        }
      }

      const completedFirst = [...byType.entries()].sort((a, b) => {
        const ca = a[1].completed;
        const cb = b[1].completed;
        if (ca !== cb) return cb - ca;
        return a[0].localeCompare(b[0]);
      });

      const topLines = completedFirst.slice(0, 10).map(([type, counts]) => {
        const label = PI_EXPERIMENT_LABELS[type] || type.replace(/_/g, " ");
        return `• ${label}: ${counts.completed} done, ${counts.in_progress} in progress, ${counts.scheduled} scheduled, ${counts.skipped} skipped`;
      });

      const tpCompletion = [...byTpAndType.entries()]
        .map(([key, v]) => {
          const [tp, type] = key.split("::");
          return { tp: Number(tp), type, completed: v.completed, total: v.total };
        })
        .sort((a, b) => a.tp - b.tp || a.type.localeCompare(b.type))
        .slice(0, 12)
        .map((r) => `• ${r.tp}d — ${(PI_EXPERIMENT_LABELS[r.type] || r.type.replace(/_/g, " "))}: ${r.completed}/${r.total} done`);

      return NextResponse.json({
        response:
          `Cohort progress for ${cohort.name} (${animalIds.length} animals):\n` +
          `Top experiment status summary:\n${topLines.join("\n") || "• No experiments yet"}\n\n` +
          `Timepoint completion snapshot:\n${tpCompletion.join("\n") || "• No timepoint-linked experiments yet"}`,
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
