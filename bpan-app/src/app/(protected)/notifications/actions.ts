"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";
import { isNotificationTask, normalizeTags, withReadTag } from "@/lib/notifications";
import {
  applyChatNotificationPreferences,
  defaultChatNotificationPreferences,
  readChatNotificationPreferences,
  type ChatNotificationPreferences,
} from "@/lib/chat-notification-delivery";

function normalizeIds(taskIds: string[]) {
  return [...new Set(taskIds.map((id) => id.trim()).filter(Boolean))];
}

function revalidateNotificationsSurfaces() {
  revalidatePath("/notifications");
  revalidatePath("/tasks");
}

export async function setNotificationRead(taskId: string, read: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("id,source_type,tags")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !task) {
    return { error: fetchError?.message || "Notification not found." };
  }

  const tags = normalizeTags(task.tags);
  if (!isNotificationTask({ source_type: task.source_type, tags })) {
    return { error: "Task is not a notification signal." };
  }

  const nextTags = withReadTag(tags, read);
  const { error } = await supabase
    .from("tasks")
    .update({ tags: nextTags })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateNotificationsSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function bulkMarkNotificationsRead(taskIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const normalizedIds = normalizeIds(taskIds);
  if (normalizedIds.length === 0) return { success: true, updated: 0 };

  const { data: tasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id,source_type,tags")
    .eq("user_id", user.id)
    .in("id", normalizedIds);

  if (fetchError) return { error: fetchError.message };

  const notificationTasks = (tasks || []).filter((task) =>
    isNotificationTask({ source_type: task.source_type, tags: normalizeTags(task.tags) }),
  );

  let updated = 0;
  for (const task of notificationTasks) {
    const nextTags = withReadTag(normalizeTags(task.tags), true);
    const { error } = await supabase
      .from("tasks")
      .update({ tags: nextTags })
      .eq("id", task.id)
      .eq("user_id", user.id);
    if (!error) {
      updated += 1;
    }
  }

  revalidateNotificationsSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, updated };
}

export async function bulkMarkNotificationsUnread(taskIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const normalizedIds = normalizeIds(taskIds);
  if (normalizedIds.length === 0) return { success: true, updated: 0 };

  const { data: tasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id,source_type,tags")
    .eq("user_id", user.id)
    .in("id", normalizedIds);

  if (fetchError) return { error: fetchError.message };

  let updated = 0;
  for (const task of tasks || []) {
    const tags = normalizeTags(task.tags);
    if (!isNotificationTask({ source_type: task.source_type, tags })) continue;
    const { error } = await supabase
      .from("tasks")
      .update({ tags: withReadTag(tags, false) })
      .eq("id", task.id)
      .eq("user_id", user.id);
    if (!error) updated += 1;
  }

  revalidateNotificationsSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, updated };
}

export async function snoozeNotification(taskId: string, days: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("id,source_type,status,tags,due_date")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !task) {
    return { error: fetchError?.message || "Notification not found." };
  }

  const tags = normalizeTags(task.tags);
  if (!isNotificationTask({ source_type: task.source_type, tags })) {
    return { error: "Task is not a notification signal." };
  }
  if (task.source_type !== "reminder") {
    return { error: "Snooze is only available for reminder notifications." };
  }

  const safeDays = Math.max(1, Math.min(14, Number(days) || 1));
  const currentAnchor = task.due_date ? new Date(`${task.due_date}T12:00:00`) : new Date();
  currentAnchor.setDate(currentAnchor.getDate() + safeDays);
  const nextDueDate = currentAnchor.toISOString().slice(0, 10);

  const { error } = await supabase
    .from("tasks")
    .update({
      due_date: nextDueDate,
      status: task.status === "completed" || task.status === "skipped" ? "pending" : task.status,
      tags: withReadTag(tags, true),
      source_label: "Automation reminder (snoozed)",
    })
    .eq("id", task.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateNotificationsSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, dueDate: nextDueDate };
}

export async function dismissNotification(taskId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("id,source_type,tags")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !task) {
    return { error: fetchError?.message || "Notification not found." };
  }

  const tags = normalizeTags(task.tags);
  if (!isNotificationTask({ source_type: task.source_type, tags })) {
    return { error: "Task is not a notification signal." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "skipped",
      tags: withReadTag(tags, true),
      completed_at: new Date().toISOString(),
      source_label: "Notification dismissed",
    })
    .eq("id", task.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateNotificationsSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true };
}

export async function bulkDismissNotifications(taskIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const normalizedIds = normalizeIds(taskIds);
  if (normalizedIds.length === 0) return { success: true, updated: 0 };

  const { data: tasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id,source_type,tags")
    .eq("user_id", user.id)
    .in("id", normalizedIds);

  if (fetchError) return { error: fetchError.message };

  let updated = 0;
  for (const task of tasks || []) {
    const tags = normalizeTags(task.tags);
    if (!isNotificationTask({ source_type: task.source_type, tags })) continue;

    const { error } = await supabase
      .from("tasks")
      .update({
        status: "skipped",
        tags: withReadTag(tags, true),
        completed_at: new Date().toISOString(),
        source_label: "Notification dismissed",
      })
      .eq("id", task.id)
      .eq("user_id", user.id);
    if (!error) updated += 1;
  }

  revalidateNotificationsSurfaces();
  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return { success: true, updated };
}

export async function saveChatNotificationPreferences(
  nextPreferences: ChatNotificationPreferences,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const normalized = readChatNotificationPreferences({
    notification_preferences: {
      chat: nextPreferences || defaultChatNotificationPreferences(),
    },
  });

  const { error } = await supabase.auth.updateUser({
    data: applyChatNotificationPreferences(user.user_metadata || {}, normalized),
  });

  if (error) {
    return { error: error.message || "Unable to save notification preferences." };
  }

  revalidatePath("/notifications");
  return { success: true };
}
