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

type ResolveResult = { id: string; title: string } | null;

async function findWorkspaceEventByTitle(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, title: string): Promise<ResolveResult> {
  const { data } = await supabase
    .from("workspace_calendar_events")
    .select("id,title")
    .eq("user_id", userId)
    .ilike("title", `%${title}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: String(data.id), title: String(data.title) } : null;
}

async function findTaskByTitle(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, title: string): Promise<ResolveResult> {
  const { data } = await supabase
    .from("tasks")
    .select("id,title")
    .eq("user_id", userId)
    .ilike("title", `%${title}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: String(data.id), title: String(data.title) } : null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const message = String(body?.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const multiParts = message
      .split(/\s*(?:\n+|;\s*|(?:and\s+then)|(?:then))\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (multiParts.length > 1) {
      const responses: string[] = [];
      let executedAny = false;
      for (const part of multiParts) {
        const res = await fetch(new URL("/api/operator/chat", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
          body: JSON.stringify({ message: part }),
        });
        const data = await res.json();
        const line = data?.response || data?.error || "Operator step failed.";
        responses.push(`• ${part}\n${line}`);
        if (data?.executed) executedAny = true;
      }
      return NextResponse.json({ response: responses.join("\n\n"), executed: executedAny } as OperatorReply);
    }

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
      const ev = await findWorkspaceEventByTitle(supabase, user.id, title.trim());
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
    const confirmDelEventMatch = message.match(/^confirm\s+delete\s+event\s+(.+)$/i);
    if (confirmDelEventMatch) {
      const title = confirmDelEventMatch[1].trim();
      const ev = await findWorkspaceEventByTitle(supabase, user.id, title);
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

    const delEventMatch = message.match(/^delete\s+event\s+(.+)$/i);
    if (delEventMatch) {
      const title = delEventMatch[1].trim();
      const ev = await findWorkspaceEventByTitle(supabase, user.id, title);
      if (!ev) return NextResponse.json({ response: `I couldn't find a workspace event matching "${title}".` } as OperatorReply);
      return NextResponse.json({
        response: `I found event "${ev.title}". Reply exactly: "confirm delete event ${ev.title}" to delete it.`,
        executed: false,
      } as OperatorReply);
    }

    const confirmDelTaskMatch = message.match(/^confirm\s+delete\s+task\s+(.+)$/i);
    if (confirmDelTaskMatch) {
      const title = confirmDelTaskMatch[1].trim();
      const task = await findTaskByTitle(supabase, user.id, title);
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

    const delTaskMatch = message.match(/^delete\s+task\s+(.+)$/i);
    if (delTaskMatch) {
      const title = delTaskMatch[1].trim();
      const task = await findTaskByTitle(supabase, user.id, title);
      if (!task) return NextResponse.json({ response: `I couldn't find a task matching "${title}".` } as OperatorReply);
      return NextResponse.json({
        response: `I found task "${task.title}". Reply exactly: "confirm delete task ${task.title}" to delete it.`,
        executed: false,
      } as OperatorReply);
    }

    const completeTaskMatch = message.match(/^(complete|finish)\s+task\s+(.+)$/i);
    if (completeTaskMatch) {
      const title = completeTaskMatch[2].trim();
      const task = await findTaskByTitle(supabase, user.id, title);
      if (!task) return NextResponse.json({ response: `I couldn't find a task matching "${title}".` } as OperatorReply);
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "task.update", input: { id: task.id, status: "completed" } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to complete task" } as OperatorReply);
      return NextResponse.json({ response: `Marked task "${task.title}" completed.`, executed: true, action: "task.update", result: data } as OperatorReply);
    }

    const reopenTaskMatch = message.match(/^(reopen|uncomplete)\s+task\s+(.+)$/i);
    if (reopenTaskMatch) {
      const title = reopenTaskMatch[2].trim();
      const task = await findTaskByTitle(supabase, user.id, title);
      if (!task) return NextResponse.json({ response: `I couldn't find a task matching "${title}".` } as OperatorReply);
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "task.update", input: { id: task.id, status: "pending" } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to update task" } as OperatorReply);
      return NextResponse.json({ response: `Marked task "${task.title}" pending.`, executed: true, action: "task.update", result: data } as OperatorReply);
    }

    const eventStatusMatch = message.match(/^(mark|set)\s+event\s+(.+?)\s+(?:as\s+)?(scheduled|in progress|completed|cancelled)$/i);
    if (eventStatusMatch) {
      const title = eventStatusMatch[2].trim();
      const status = eventStatusMatch[3].toLowerCase().replace(/\s+/g, "_") as "scheduled" | "in_progress" | "completed" | "cancelled";
      const ev = await findWorkspaceEventByTitle(supabase, user.id, title);
      if (!ev) return NextResponse.json({ response: `I couldn't find a workspace event matching "${title}".` } as OperatorReply);
      const res = await fetch(new URL("/api/operator/actions", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ action: "calendar.update", input: { id: ev.id, status } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ response: data.error || "Failed to update event" } as OperatorReply);
      return NextResponse.json({ response: `Updated "${ev.title}" to ${status.replace(/_/g, " ")}.`, executed: true, action: "calendar.update", result: data } as OperatorReply);
    }

    const whatsOnMatch = message.match(/^(what('| i)?s|show)\s+(on|for)\s+(\d{4}-\d{2}-\d{2})\??$/i);
    if (whatsOnMatch) {
      const date = whatsOnMatch[4];
      const [{ data: events }, { data: tasks }, { data: meetings }] = await Promise.all([
        supabase
          .from("workspace_calendar_events")
          .select("title,status,start_at")
          .eq("user_id", user.id)
          .gte("start_at", `${date}T00:00:00.000Z`)
          .lte("start_at", `${date}T23:59:59.999Z`)
          .order("start_at"),
        supabase.from("tasks").select("title,status,due_date").eq("user_id", user.id).eq("due_date", date).order("title"),
        supabase.from("meeting_notes").select("title,meeting_date").eq("user_id", user.id).eq("meeting_date", date).order("title"),
      ]);
      const lines: string[] = [];
      for (const ev of events || []) lines.push(`• Event: ${ev.title} (${String(ev.status || "scheduled")})`);
      for (const t of tasks || []) lines.push(`• Task due: ${t.title} (${String(t.status)})`);
      for (const m of meetings || []) lines.push(`• Meeting: ${m.title}`);
      return NextResponse.json({
        response: lines.length ? `On ${date}:\n${lines.join("\n")}` : `No workspace events, due tasks, or meetings found on ${date}.`,
      } as OperatorReply);
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
    const counts = await supabase
      .from("workspace_calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    return NextResponse.json({
      response:
        "I can execute workspace actions. Try commands like:\n" +
        '• "schedule RR recovery planning on 2026-03-10"\n' +
        '• "move event RR recovery to 2026-03-11"\n' +
        '• "add task review rotarod plots by 2026-03-12"\n' +
        '• "create meeting PI update on 2026-03-15"\n' +
        '• "delete event RR recovery" (then confirm)\n' +
        '• "complete task review rotarod plots"\n' +
        '• "mark event EEG review as completed"\n' +
        "• \"what's on 2026-03-10\"\n\n" +
        `Workspace events currently tracked: ${counts.count ?? 0}.`,
      executed: false,
    } as OperatorReply);
  } catch (err) {
    console.error("operator chat error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Operator failed" }, { status: 500 });
  }
}
