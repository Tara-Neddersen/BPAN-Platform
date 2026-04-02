"use client";

import { ChatNotificationPreferencesCard } from "@/components/chat-notification-preferences-card";
import { NotificationsCenterClient, type NotificationItem } from "@/components/notifications-center-client";
import { WebPushSettingsCard } from "@/components/web-push-settings-card";
import type { ChatNotificationPreferences } from "@/lib/chat-notification-delivery";

type NotificationsPageProps = {
  notifications: NotificationItem[];
  chatNotificationPreferences: ChatNotificationPreferences;
  smsFeatureEnabled: boolean;
  smsProviderConfigured: boolean;
  actions: {
    setRead: (taskId: string, read: boolean) => Promise<{ success?: boolean; error?: string }>;
    bulkMarkRead: (taskIds: string[]) => Promise<{ success?: boolean; updated?: number; error?: string }>;
    bulkMarkUnread: (taskIds: string[]) => Promise<{ success?: boolean; updated?: number; error?: string }>;
    snooze: (taskId: string, days: number) => Promise<{ success?: boolean; dueDate?: string; error?: string }>;
    dismiss: (taskId: string) => Promise<{ success?: boolean; error?: string }>;
    bulkDismiss: (taskIds: string[]) => Promise<{ success?: boolean; updated?: number; error?: string }>;
    saveChatPreferences: (
      nextPreferences: ChatNotificationPreferences,
    ) => Promise<{ success?: boolean; error?: string }>;
  };
};

export default function NotificationsPage({
  notifications,
  chatNotificationPreferences,
  smsFeatureEnabled,
  smsProviderConfigured,
  actions,
}: NotificationsPageProps) {
  return (
    <div className="page-shell">
      <WebPushSettingsCard />
      <ChatNotificationPreferencesCard
        initialPreferences={chatNotificationPreferences}
        smsFeatureEnabled={smsFeatureEnabled}
        smsProviderConfigured={smsProviderConfigured}
        saveAction={actions.saveChatPreferences}
      />
      <NotificationsCenterClient
        notifications={notifications}
        actions={{
          setRead: actions.setRead,
          bulkMarkRead: actions.bulkMarkRead,
          bulkMarkUnread: actions.bulkMarkUnread,
          snooze: actions.snooze,
          dismiss: actions.dismiss,
          bulkDismiss: actions.bulkDismiss,
        }}
      />
    </div>
  );
}
