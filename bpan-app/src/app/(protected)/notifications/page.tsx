import { createClient } from "@/lib/supabase/server";
import { NotificationsCenterClient, type NotificationItem } from "@/components/notifications-center-client";
import { ChatNotificationPreferencesCard } from "@/components/chat-notification-preferences-card";
import { WebPushSettingsCard } from "@/components/web-push-settings-card";
import {
  bulkDismissNotifications,
  bulkMarkNotificationsRead,
  bulkMarkNotificationsUnread,
  dismissNotification,
  saveChatNotificationPreferences,
  setNotificationRead,
  snoozeNotification,
} from "./actions";
import {
  inferNotificationCategory,
  isNotificationRead,
  isNotificationTask,
  normalizeTags,
  resolveNotificationHref,
  type NotificationLinkRef,
} from "@/lib/notifications";
import { readChatNotificationPreferences } from "@/lib/chat-notification-delivery";

type TaskLinkRow = {
  task_id: string;
  linked_object_type: string;
  linked_object_id: string;
};

type WorkspaceLinkRow = {
  source_id: string;
  target_type: string;
  target_id: string;
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  const chatNotificationPreferences = readChatNotificationPreferences(user.user_metadata || {});
  const smsFeatureEnabled = process.env.FEATURE_SMS_NOTIFICATIONS === "true";
  const smsProviderConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_PHONE,
  );

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,description,status,source_type,source_id,source_label,tags,created_at,updated_at,due_date")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(250);

  const notificationTasks = (tasks || []).filter((task) => {
    const tags = normalizeTags(task.tags);
    return isNotificationTask({ source_type: task.source_type, tags });
  });

  const taskIds = notificationTasks.map((task) => task.id);

  const taskLinksByTaskId = new Map<string, TaskLinkRow[]>();
  if (taskIds.length > 0) {
    const { data: taskLinks, error: taskLinksError } = await supabase
      .from("task_links")
      .select("task_id,linked_object_type,linked_object_id")
      .in("task_id", taskIds);

    if (!taskLinksError && taskLinks) {
      for (const row of taskLinks as TaskLinkRow[]) {
        const list = taskLinksByTaskId.get(row.task_id) || [];
        list.push(row);
        taskLinksByTaskId.set(row.task_id, list);
      }
    }
  }

  const workspaceLinksByTaskId = new Map<string, WorkspaceLinkRow[]>();
  if (taskIds.length > 0) {
    const { data: workspaceLinks } = await supabase
      .from("workspace_entity_links")
      .select("source_id,target_type,target_id")
      .eq("user_id", user.id)
      .eq("source_type", "task")
      .in("source_id", taskIds);

    for (const row of (workspaceLinks || []) as WorkspaceLinkRow[]) {
      const list = workspaceLinksByTaskId.get(row.source_id) || [];
      list.push(row);
      workspaceLinksByTaskId.set(row.source_id, list);
    }
  }

  const notifications: NotificationItem[] = notificationTasks.map((task) => {
    const tags = normalizeTags(task.tags);
    const isRead = isNotificationRead(tags);
    const taskLinks = taskLinksByTaskId.get(task.id) || [];
    const workspaceLinks = workspaceLinksByTaskId.get(task.id) || [];
    const links: NotificationLinkRef[] = [
      ...taskLinks.map((link) => ({ objectType: link.linked_object_type, objectId: link.linked_object_id })),
      ...workspaceLinks.map((link) => ({ objectType: link.target_type, objectId: link.target_id })),
    ];
    const category = inferNotificationCategory(task.source_id, tags, links);

    return {
      id: task.id,
      title: task.title || "Notification",
      description: task.description || task.source_label || null,
      category,
      isRead,
      href: resolveNotificationHref({ category, sourceId: task.source_id, links }),
      updatedAt: task.updated_at || task.created_at,
      dueDate: task.due_date || null,
      status: task.status || "pending",
      canSnooze: task.source_type === "reminder" && task.status !== "skipped",
      canDismiss: task.status !== "skipped",
    };
  });

  return (
    <div className="page-shell">
      <WebPushSettingsCard />
      <ChatNotificationPreferencesCard
        initialPreferences={chatNotificationPreferences}
        smsFeatureEnabled={smsFeatureEnabled}
        smsProviderConfigured={smsProviderConfigured}
        saveAction={saveChatNotificationPreferences}
      />
      <NotificationsCenterClient
        notifications={notifications}
        actions={{
          setRead: setNotificationRead,
          bulkMarkRead: bulkMarkNotificationsRead,
          bulkMarkUnread: bulkMarkNotificationsUnread,
          snooze: snoozeNotification,
          dismiss: dismissNotification,
          bulkDismiss: bulkDismissNotifications,
        }}
      />
    </div>
  );
}
