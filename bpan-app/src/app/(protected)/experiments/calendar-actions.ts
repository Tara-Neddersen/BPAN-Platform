"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

type CalendarEventInput = {
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

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

function revalidateCalendarSurfaces() {
  revalidatePath("/experiments");
  revalidatePath("/dashboard");
  revalidatePath("/colony");
}

export async function createWorkspaceCalendarEvent(input: CalendarEventInput) {
  const { supabase, user } = await requireUser();
  const title = input.title?.trim();
  if (!title) return { error: "Title is required" };
  if (!input.startAt) return { error: "Start time is required" };

  const { data, error } = await supabase
    .from("workspace_calendar_events")
    .insert({
      user_id: user.id,
      title,
      description: input.description || null,
      start_at: input.startAt,
      end_at: input.endAt || null,
      all_day: input.allDay ?? true,
      category: input.category || "general",
      location: input.location || null,
      source_type: input.sourceType || null,
      source_id: input.sourceId || null,
      source_label: input.sourceLabel || null,
      metadata: input.metadata || {},
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidateCalendarSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, id: data.id as string };
}

export async function updateWorkspaceCalendarEvent(
  id: string,
  patch: Partial<CalendarEventInput> & { status?: "scheduled" | "in_progress" | "completed" | "cancelled" }
) {
  const { supabase, user } = await requireUser();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title?.trim() || "Untitled";
  if (patch.startAt !== undefined) update.start_at = patch.startAt;
  if (patch.endAt !== undefined) update.end_at = patch.endAt || null;
  if (patch.allDay !== undefined) update.all_day = patch.allDay;
  if (patch.description !== undefined) update.description = patch.description || null;
  if (patch.category !== undefined) update.category = patch.category || "general";
  if (patch.location !== undefined) update.location = patch.location || null;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.metadata !== undefined) update.metadata = patch.metadata || {};

  const { error } = await supabase
    .from("workspace_calendar_events")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidateCalendarSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function moveWorkspaceCalendarEvent(id: string, targetDate: string) {
  const { supabase, user } = await requireUser();
  const { data: event, error: fetchError } = await supabase
    .from("workspace_calendar_events")
    .select("id,start_at,end_at,all_day")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (fetchError) return { error: fetchError.message };

  const start = new Date(String(event.start_at));
  if (Number.isNaN(start.getTime())) return { error: "Invalid event start time" };
  const target = new Date(`${targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return { error: "Invalid target date" };

  const newStart = new Date(start);
  newStart.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());

  let newEnd: string | null = null;
  if (event.end_at) {
    const end = new Date(String(event.end_at));
    const diffMs = end.getTime() - start.getTime();
    newEnd = new Date(newStart.getTime() + diffMs).toISOString();
  }

  const { error } = await supabase
    .from("workspace_calendar_events")
    .update({
      start_at: newStart.toISOString(),
      end_at: newEnd,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidateCalendarSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function deleteWorkspaceCalendarEvent(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("workspace_calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidateCalendarSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

