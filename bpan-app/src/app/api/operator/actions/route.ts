import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createWorkspaceCalendarEvent,
  updateWorkspaceCalendarEvent,
  moveWorkspaceCalendarEvent,
  deleteWorkspaceCalendarEvent,
} from "@/app/(protected)/experiments/calendar-actions";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

type OperatorActionRequest =
  | {
      action: "calendar.create";
      input: {
        title: string;
        startAt: string;
        endAt?: string | null;
        allDay?: boolean;
        description?: string | null;
        category?: string | null;
        location?: string | null;
        sourceType?: string | null;
        sourceId?: string | null;
        sourceLabel?: string | null;
        metadata?: Record<string, unknown>;
      };
    }
  | { action: "calendar.move"; input: { id: string; targetDate: string } }
  | {
      action: "calendar.update";
      input: {
        id: string;
        title?: string;
        description?: string | null;
        category?: string | null;
        location?: string | null;
        status?: "scheduled" | "in_progress" | "completed" | "cancelled";
      };
    }
  | { action: "calendar.delete"; input: { id: string } }
  | {
      action: "task.create";
      input: { title: string; dueDate?: string | null; sourceType?: string | null; sourceId?: string | null; sourceLabel?: string | null };
    }
  | { action: "task.update"; input: { id: string; status?: "pending" | "in_progress" | "completed" | "skipped"; title?: string; dueDate?: string | null } }
  | { action: "task.delete"; input: { id: string } }
  | {
      action: "meeting.create";
      input: { title: string; meetingDate: string; attendees?: string[]; content?: string; actionItems?: Array<{ text: string; done?: boolean; due_date?: string }> };
    }
  | { action: "meeting.delete"; input: { id: string } };

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as OperatorActionRequest;

    switch (body.action) {
      case "calendar.create": {
        const result = await createWorkspaceCalendarEvent(body.input);
        if (result.error) return NextResponse.json(result, { status: 400 });
        return NextResponse.json({ success: true, result });
      }
      case "calendar.move": {
        const result = await moveWorkspaceCalendarEvent(body.input.id, body.input.targetDate);
        if (result.error) return NextResponse.json(result, { status: 400 });
        return NextResponse.json({ success: true, result });
      }
      case "calendar.update": {
        const { id, ...patch } = body.input;
        const result = await updateWorkspaceCalendarEvent(id, patch);
        if (result.error) return NextResponse.json(result, { status: 400 });
        return NextResponse.json({ success: true, result });
      }
      case "calendar.delete": {
        const result = await deleteWorkspaceCalendarEvent(body.input.id);
        if (result.error) return NextResponse.json(result, { status: 400 });
        return NextResponse.json({ success: true, result });
      }
      case "task.create": {
        const title = body.input.title?.trim();
        if (!title) return NextResponse.json({ error: "Task title is required" }, { status: 400 });
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: user.id,
            title,
            status: "pending",
            due_date: body.input.dueDate || null,
            source_type: body.input.sourceType || null,
            source_id: body.input.sourceId || null,
            source_label: body.input.sourceLabel || null,
          })
          .select("id")
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
        return NextResponse.json({ success: true, id: data.id });
      }
      case "task.delete": {
        const { error } = await supabase.from("tasks").delete().eq("id", body.input.id).eq("user_id", user.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
        return NextResponse.json({ success: true });
      }
      case "task.update": {
        const patch: Record<string, unknown> = {};
        if (body.input.title !== undefined) patch.title = body.input.title.trim();
        if (body.input.status !== undefined) patch.status = body.input.status;
        if (body.input.dueDate !== undefined) patch.due_date = body.input.dueDate || null;
        if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No task updates provided" }, { status: 400 });
        const { error } = await supabase.from("tasks").update(patch).eq("id", body.input.id).eq("user_id", user.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
        return NextResponse.json({ success: true });
      }
      case "meeting.create": {
        const title = body.input.title?.trim();
        if (!title) return NextResponse.json({ error: "Meeting title is required" }, { status: 400 });
        const { data, error } = await supabase
          .from("meeting_notes")
          .insert({
            user_id: user.id,
            title,
            meeting_date: body.input.meetingDate,
            attendees: body.input.attendees || [],
            content: body.input.content || "",
            action_items: body.input.actionItems || [],
          })
          .select("id")
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
        return NextResponse.json({ success: true, id: data.id });
      }
      case "meeting.delete": {
        const { error } = await supabase.from("meeting_notes").delete().eq("id", body.input.id).eq("user_id", user.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operator action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
