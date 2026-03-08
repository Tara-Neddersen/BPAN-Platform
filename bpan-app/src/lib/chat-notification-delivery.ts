import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export const CHAT_NOTIFICATION_CHANNELS = ["dm", "group", "all_lab"] as const;

export type ChatNotificationChannel = (typeof CHAT_NOTIFICATION_CHANNELS)[number];

type ChannelDeliveryPreference = {
  inApp: boolean;
  email: boolean;
  sms: boolean;
};

type SmsPreference = {
  enabled: boolean;
  phone: string;
  phoneVerified: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  timezone: string;
};

export type ChatNotificationPreferences = {
  channels: Record<ChatNotificationChannel, ChannelDeliveryPreference>;
  sms: SmsPreference;
};

type ChatThreadContext = {
  id: string;
  lab_id: string | null;
  owner_user_id: string | null;
  recipient_scope?: "lab" | "participants" | null;
  subject: string | null;
  linked_object_type: string;
  linked_object_id: string;
};

type RecipientProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

const CHAT_NOTIFICATION_TASK_TAGS = new Set(["automation", "notification", "chat_message"]);

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function clampHour(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(value)));
}

function toNonEmptyString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSubject(subject: string | null) {
  if (!subject || subject.trim().length === 0) return "General";
  return subject.trim();
}

function getChannelForThread({
  thread,
  participantCount,
}: {
  thread: ChatThreadContext;
  participantCount: number;
}): ChatNotificationChannel {
  if (thread.owner_user_id) return "dm";
  if (thread.recipient_scope === "participants") return participantCount <= 2 ? "dm" : "group";
  if (normalizeSubject(thread.subject).toLowerCase() === "general" || thread.linked_object_type === "lab") {
    return "all_lab";
  }
  return "group";
}

function snippetFromBody(body: string, max = 160) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function mergeTags(existing: unknown, channel: ChatNotificationChannel) {
  const base = Array.isArray(existing) ? existing.filter((tag): tag is string => typeof tag === "string") : [];
  const merged = new Set<string>([...base, ...CHAT_NOTIFICATION_TASK_TAGS, `chat_${channel}`]);
  return [...merged];
}

function isInQuietHours(hour: number, quietStart: number, quietEnd: number) {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd;
}

function getLocalHour(timezone: string) {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(new Date());
    const parsed = Number(formatted);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildTwilioAuthHeader(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export function defaultChatNotificationPreferences(): ChatNotificationPreferences {
  return {
    channels: {
      dm: { inApp: true, email: false, sms: false },
      group: { inApp: true, email: false, sms: false },
      all_lab: { inApp: true, email: false, sms: false },
    },
    sms: {
      enabled: false,
      phone: "",
      phoneVerified: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      timezone: "UTC",
    },
  };
}

export function readChatNotificationPreferences(userMetadata: unknown): ChatNotificationPreferences {
  const defaults = defaultChatNotificationPreferences();
  const meta = userMetadata && typeof userMetadata === "object" ? userMetadata as Record<string, unknown> : {};
  const rawNotificationPreferences =
    meta.notification_preferences && typeof meta.notification_preferences === "object"
      ? meta.notification_preferences as Record<string, unknown>
      : {};
  const rawChat = rawNotificationPreferences.chat && typeof rawNotificationPreferences.chat === "object"
    ? rawNotificationPreferences.chat as Record<string, unknown>
    : {};
  const rawChannels = rawChat.channels && typeof rawChat.channels === "object"
    ? rawChat.channels as Record<string, unknown>
    : {};
  const rawSms = rawChat.sms && typeof rawChat.sms === "object"
    ? rawChat.sms as Record<string, unknown>
    : {};

  const channels = CHAT_NOTIFICATION_CHANNELS.reduce<Record<ChatNotificationChannel, ChannelDeliveryPreference>>(
    (acc, channel) => {
      const raw = rawChannels[channel] && typeof rawChannels[channel] === "object"
        ? rawChannels[channel] as Record<string, unknown>
        : {};
      acc[channel] = {
        inApp: toBoolean(raw.inApp, defaults.channels[channel].inApp),
        email: toBoolean(raw.email, defaults.channels[channel].email),
        sms: toBoolean(raw.sms, defaults.channels[channel].sms),
      };
      return acc;
    },
    {
      dm: defaults.channels.dm,
      group: defaults.channels.group,
      all_lab: defaults.channels.all_lab,
    },
  );

  return {
    channels,
    sms: {
      enabled: toBoolean(rawSms.enabled, defaults.sms.enabled),
      phone: toNonEmptyString(rawSms.phone, defaults.sms.phone),
      phoneVerified: toBoolean(rawSms.phoneVerified, defaults.sms.phoneVerified),
      quietHoursStart: clampHour(rawSms.quietHoursStart, defaults.sms.quietHoursStart),
      quietHoursEnd: clampHour(rawSms.quietHoursEnd, defaults.sms.quietHoursEnd),
      timezone: toNonEmptyString(rawSms.timezone, defaults.sms.timezone),
    },
  };
}

export function applyChatNotificationPreferences(
  existingMetadata: unknown,
  nextPreferences: ChatNotificationPreferences,
) {
  const current = existingMetadata && typeof existingMetadata === "object"
    ? existingMetadata as Record<string, unknown>
    : {};
  const rawNotificationPreferences =
    current.notification_preferences && typeof current.notification_preferences === "object"
      ? current.notification_preferences as Record<string, unknown>
      : {};

  return {
    ...current,
    notification_preferences: {
      ...rawNotificationPreferences,
      chat: nextPreferences,
    },
  };
}

async function upsertChatInAppNotificationTask(
  admin: ReturnType<typeof createAdminClient>,
  {
    recipientId,
    messageId,
    channel,
    senderName,
    threadLabel,
    messageBody,
  }: {
    recipientId: string;
    messageId: string;
    channel: ChatNotificationChannel;
    senderName: string;
    threadLabel: string;
    messageBody: string;
  },
) {
  const sourceId = `chat_message:${messageId}`;
  const title = `${senderName} sent a message`;
  const description = `${threadLabel}: ${snippetFromBody(messageBody, 140)}`;

  const { data: existingTask } = await admin
    .from("tasks")
    .select("id,tags")
    .eq("user_id", recipientId)
    .eq("source_type", "reminder")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();

  if (existingTask?.id) {
    await admin
      .from("tasks")
      .update({
        title,
        description,
        status: "pending",
        completed_at: null,
        source_label: "Lab chat",
        tags: mergeTags(existingTask.tags, channel),
      })
      .eq("id", existingTask.id)
      .eq("user_id", recipientId);
  } else {
    await admin
      .from("tasks")
      .insert({
        user_id: recipientId,
        title,
        description,
        priority: "medium",
        status: "pending",
        source_type: "reminder",
        source_id: sourceId,
        source_label: "Lab chat",
        tags: mergeTags([], channel),
      })
      .select("id")
      .single();
  }
}

async function sendChatEmailNotification({
  recipientEmail,
  senderName,
  threadLabel,
  snippet,
}: {
  recipientEmail: string;
  senderName: string;
  threadLabel: string;
  snippet: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  await sendEmail({
    to: recipientEmail,
    subject: `New message from ${senderName}`,
    html: `<p><strong>${senderName}</strong> sent a message in <strong>${threadLabel}</strong>.</p><p>${snippet}</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL || ""}/labs/chat">Open Lab Chat</a></p>`,
  });
}

async function canSendSmsNow(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  timezone: string,
  quietStart: number,
  quietEnd: number,
) {
  const localHour = getLocalHour(timezone) ?? getLocalHour("UTC");
  if (localHour !== null && isInQuietHours(localHour, quietStart, quietEnd)) {
    return false;
  }

  const perHourLimit = Math.max(1, Math.min(20, Number(process.env.SMS_NOTIFICATIONS_PER_HOUR || "6")));
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recent } = await admin
    .from("workspace_events")
    .select("id,event_at")
    .eq("user_id", recipientId)
    .eq("event_type", "notification.sms.sent")
    .gte("event_at", oneHourAgo)
    .order("event_at", { ascending: false })
    .limit(perHourLimit + 1);

  if ((recent || []).length >= perHourLimit) {
    return false;
  }

  if ((recent || []).length > 0) {
    const newest = new Date(String(recent?.[0]?.event_at || ""));
    if (!Number.isNaN(newest.getTime()) && Date.now() - newest.getTime() < 60_000) {
      return false;
    }
  }

  return true;
}

async function sendTwilioSms({
  toPhone,
  text,
}: {
  toPhone: string;
  text: string;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;
  if (!accountSid || !authToken || !fromPhone) return false;

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: toPhone,
    From: fromPhone,
    Body: text,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: buildTwilioAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  return response.ok;
}

export async function deliverChatMessageNotifications({
  senderUserId,
  messageId,
  messageBody,
  thread,
}: {
  senderUserId: string;
  messageId: string;
  messageBody: string;
  thread: ChatThreadContext;
}) {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return;
  }

  let recipientIds: string[] = [];
  let participantCount = 0;

  if (thread.owner_user_id) {
    if (thread.owner_user_id !== senderUserId) {
      recipientIds = [thread.owner_user_id];
    }
  } else if (thread.lab_id) {
    if (thread.recipient_scope === "participants") {
      const { data: participants } = await admin
        .from("message_thread_participants")
        .select("user_id")
        .eq("thread_id", thread.id);
      participantCount = (participants || []).length;
      recipientIds = (participants || [])
        .map((row) => String(row.user_id || ""))
        .filter((id) => id.length > 0 && id !== senderUserId);
    } else {
      const { data: members } = await admin
        .from("lab_members")
        .select("user_id")
        .eq("lab_id", thread.lab_id)
        .eq("is_active", true);
      participantCount = (members || []).length;
      recipientIds = (members || [])
        .map((row) => String(row.user_id || ""))
        .filter((id) => id.length > 0 && id !== senderUserId);
    }
  }

  const channel = getChannelForThread({ thread, participantCount });

  if (recipientIds.length === 0) return;

  const uniqueRecipientIds = [...new Set(recipientIds)];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id,email,display_name")
    .in("id", [senderUserId, ...uniqueRecipientIds]);
  const profileById = new Map<string, RecipientProfile>();
  for (const row of (profiles || []) as RecipientProfile[]) {
    profileById.set(row.id, row);
  }

  const senderProfile = profileById.get(senderUserId);
  const senderName = toOptionalString(senderProfile?.display_name)
    || toOptionalString(senderProfile?.email)
    || "A lab member";
  const threadLabel = normalizeSubject(thread.subject);
  const messageSnippet = snippetFromBody(messageBody, 120);
  const smsEnabledByFlag = process.env.FEATURE_SMS_NOTIFICATIONS === "true";

  for (const recipientId of uniqueRecipientIds) {
    try {
      const { data: authRecipient } = await admin.auth.admin.getUserById(recipientId);
      const preferences = readChatNotificationPreferences(authRecipient?.user?.user_metadata || {});
      const recipientProfile = profileById.get(recipientId);
      const channelPreferences = preferences.channels[channel];

      if (channelPreferences.inApp) {
        await upsertChatInAppNotificationTask(admin, {
          recipientId,
          messageId,
          channel,
          senderName,
          threadLabel,
          messageBody,
        });
      }

      if (channelPreferences.email && recipientProfile?.email) {
        await sendChatEmailNotification({
          recipientEmail: recipientProfile.email,
          senderName,
          threadLabel,
          snippet: messageSnippet,
        });
      }

      if (
        smsEnabledByFlag
        && channelPreferences.sms
        && preferences.sms.enabled
        && preferences.sms.phoneVerified
        && preferences.sms.phone.trim().length > 0
      ) {
        const canSend = await canSendSmsNow(
          admin,
          recipientId,
          preferences.sms.timezone,
          preferences.sms.quietHoursStart,
          preferences.sms.quietHoursEnd,
        );
        if (!canSend) continue;

        const sent = await sendTwilioSms({
          toPhone: preferences.sms.phone.trim(),
          text: `${senderName}: ${messageSnippet}`,
        });

        if (sent) {
          await admin.from("workspace_events").insert({
            user_id: recipientId,
            entity_type: "message",
            entity_id: messageId,
            event_type: "notification.sms.sent",
            title: "Chat SMS notification sent",
            detail: `${channel} channel`,
            event_at: new Date().toISOString(),
            payload: { channel, threadId: thread.id },
          });
        }
      }
    } catch {
      // Best-effort delivery: message posting should not fail because notification fanout failed.
      continue;
    }
  }
}
