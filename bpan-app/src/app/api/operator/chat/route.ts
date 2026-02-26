import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type OperatorReply = {
  response: string;
  executed?: boolean;
  action?: string;
  result?: Record<string, unknown>;
};

function parseDate(input: string): string | null {
  const m = input.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const message = String(body?.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const lower = message.toLowerCase();

    // create task: "add task Review X by 2026-03-01"
    if (lower.startsWith("add task ") || lower.startsWith("create task ")) {
      const title = message.replace(/^(add|create)\s+task\s+/i, "").trim();
      const due = parseDate(title);
      const finalTitle = title.replace(/\s+by\s+\d{4}-\d{2}-\d{2}\b/i, "").trim();
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "task.create", input: { title: finalTitle, dueDate: due } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to create task" } as OperatorReply);
      return NextResponse.json({ response: `Created task: ${finalTitle}${due ? ` (due ${due})` : ""}.`, executed: true, action: "task.create", result: data } as OperatorReply);
    }

    // schedule calendar event: "schedule <title> on YYYY-MM-DD"
    const scheduleMatch = message.match(/^schedule\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})$/i);
    if (scheduleMatch) {
      const [, title, date] = scheduleMatch;
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({
          action: "calendar.create",
          input: { title: title.trim(), startAt: `${date}T12:00:00.000Z`, allDay: true, category: "operator" },
        }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to schedule event" } as OperatorReply);
      return NextResponse.json({ response: `Scheduled "${title.trim()}" on ${date}.`, executed: true, action: "calendar.create", result: data } as OperatorReply);
    }

    // move calendar event: "move event <title> to YYYY-MM-DD"
    const moveMatch = message.match(/^move\s+event\s+(.+?)\s+to\s+(\d{4}-\d{2}-\d{2})$/i);
    if (moveMatch) {
      const [, title, targetDate] = moveMatch;
      const { data: ev } = await supabase
        .from("workspace_calendar_events")
        .select("id,title")
        .eq("user_id", user.id)
        .ilike("title", `%${title.trim()}%`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ev) return NextResponse.json({ response: `I couldn't find a workspace event matching "${title.trim()}".` } as OperatorReply);
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "calendar.move", input: { id: ev.id, targetDate } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to move event" } as OperatorReply);
      return NextResponse.json({ response: `Moved "${ev.title}" to ${targetDate}.`, executed: true, action: "calendar.move", result: data } as OperatorReply);
    }

    // delete event/task by title contains
    const delEventMatch = message.match(/^delete\s+event\s+(.+)$/i);
    if (delEventMatch) {
      const title = delEventMatch[1].trim();
      const { data: ev } = await supabase
        .from("workspace_calendar_events")
        .select("id,title")
        .eq("user_id", user.id)
        .ilike("title", `%${title}%`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ev) return NextResponse.json({ response: `I couldn't find a workspace event matching "${title}".` } as OperatorReply);
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "calendar.delete", input: { id: ev.id } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to delete event" } as OperatorReply);
      return NextResponse.json({ response: `Deleted event "${ev.title}".`, executed: true, action: "calendar.delete", result: data } as OperatorReply);
    }

    const delTaskMatch = message.match(/^delete\s+task\s+(.+)$/i);
    if (delTaskMatch) {
      const title = delTaskMatch[1].trim();
      const { data: task } = await supabase
        .from("tasks")
        .select("id,title")
        .eq("user_id", user.id)
        .ilike("title", `%${title}%`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!task) return NextResponse.json({ response: `I couldn't find a task matching "${title}".` } as OperatorReply);
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "task.delete", input: { id: task.id } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to delete task" } as OperatorReply);
      return NextResponse.json({ response: `Deleted task "${task.title}".`, executed: true, action: "task.delete", result: data } as OperatorReply);
    }

    // meeting create: "create meeting Lab sync on 2026-03-01"
    const meetingMatch = message.match(/^create\s+meeting\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})$/i);
    if (meetingMatch) {
      const [, title, date] = meetingMatch;
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "meeting.create", input: { title: title.trim(), meetingDate: date } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to create meeting" } as OperatorReply);
      return NextResponse.json({ response: `Created meeting "${title.trim()}" on ${date}.`, executed: true, action: "meeting.create", result: data } as OperatorReply);
    }

    // Fallback helper text
    const { data: counts } = await Promise.all([
      supabase.from("workspace_calendar_events").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    return NextResponse.json({
      response:
        "I can execute workspace actions. Try commands like:\n" +
        '• "schedule RR recovery planning on 2026-03-10"\n' +
        '• "move event RR recovery to 2026-03-11"\n' +
        '• "add task review rotarod plots by 2026-03-12"\n' +
        '• "create meeting PI update on 2026-03-15"\n' +
        '• "delete event RR recovery"\n\n' +
        `Workspace events currently tracked: ${counts.count ?? 0}.`,
      executed: false,
    } as OperatorReply);
  } catch (err) {
    console.error("operator chat error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Operator failed" }, { status: 500 });
  }
}

