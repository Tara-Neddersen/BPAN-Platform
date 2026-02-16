"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createTask(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    due_date: (formData.get("due_date") as string) || null,
    due_time: (formData.get("due_time") as string) || null,
    priority: (formData.get("priority") as string) || "medium",
    source_type: (formData.get("source_type") as string) || "manual",
    source_id: (formData.get("source_id") as string) || null,
    source_label: (formData.get("source_label") as string) || null,
    tags: [],
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { success: true };
}

export async function updateTask(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const update: Record<string, unknown> = {};
  if (formData.has("title")) update.title = formData.get("title");
  if (formData.has("description")) update.description = formData.get("description") || null;
  if (formData.has("due_date")) update.due_date = formData.get("due_date") || null;
  if (formData.has("due_time")) update.due_time = formData.get("due_time") || null;
  if (formData.has("priority")) update.priority = formData.get("priority");
  if (formData.has("status")) {
    update.status = formData.get("status");
    if (update.status === "completed") {
      update.completed_at = new Date().toISOString();
    }
  }
  if (formData.has("notes")) update.notes = formData.get("notes") || null;

  const { error } = await supabase.from("tasks").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { success: true };
}

export async function toggleTask(id: string, completed: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const update: Record<string, unknown> = {
    status: completed ? "completed" : "pending",
    completed_at: completed ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from("tasks").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { success: true };
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { success: true };
}

/** Sync meeting action items to the tasks table */
export async function syncMeetingActionsToTasks(meetingId: string, meetingTitle: string, actionItems: { text: string; done: boolean; due_date?: string }[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get existing tasks for this meeting
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("user_id", user.id)
    .eq("source_type", "meeting_action")
    .eq("source_id", meetingId);

  const existingTitles = new Set((existing || []).map((t) => t.title.toLowerCase().trim()));

  // Create tasks for new action items
  const newTasks = actionItems
    .filter((a) => !existingTitles.has(a.text.toLowerCase().trim()))
    .map((a) => ({
      user_id: user.id,
      title: a.text,
      due_date: a.due_date || null,
      priority: "medium" as const,
      status: a.done ? "completed" as const : "pending" as const,
      completed_at: a.done ? new Date().toISOString() : null,
      source_type: "meeting_action" as const,
      source_id: meetingId,
      source_label: `Meeting: ${meetingTitle}`,
    }));

  if (newTasks.length > 0) {
    const { error } = await supabase.from("tasks").insert(newTasks);
    if (error) return { error: error.message };
  }

  // Update completion status for existing tasks
  for (const a of actionItems) {
    const match = (existing || []).find((t) => t.title.toLowerCase().trim() === a.text.toLowerCase().trim());
    if (match) {
      const newStatus = a.done ? "completed" : "pending";
      if (match.status !== newStatus) {
        await supabase.from("tasks").update({
          status: newStatus,
          completed_at: a.done ? new Date().toISOString() : null,
        }).eq("id", match.id);
      }
    }
  }

  revalidatePath("/tasks");
  return { success: true, synced: newTasks.length };
}

