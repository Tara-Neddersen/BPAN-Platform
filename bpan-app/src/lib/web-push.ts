import "server-only";

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  urgency?: "very-low" | "low" | "normal" | "high";
  ttlSeconds?: number;
};

type PushDeliveryFailure = {
  subscriptionId: string;
  statusCode: number | null;
  message: string;
};

export type PushDeliverySummary = {
  configured: boolean;
  subscriptionCount: number;
  attempted: number;
  delivered: number;
  failures: PushDeliveryFailure[];
};

type WebPushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

let vapidConfigured = false;

function toWebPushTopic(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.replace(/[^A-Za-z0-9_-]/g, "-");
  if (normalized.length === 0 || normalized.length > 32) return undefined;
  return normalized;
}

function configureWebPush() {
  if (vapidConfigured) return true;

  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function toSubscription(row: WebPushSubscriptionRow) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh_key,
      auth: row.auth_key,
    },
  };
}

async function sendToRows(
  admin: SupabaseClient,
  rows: WebPushSubscriptionRow[],
  payload: PushPayload,
) {
  if (!configureWebPush() || rows.length === 0) {
    return {
      attempted: 0,
      delivered: 0,
      failures: [] as PushDeliveryFailure[],
    };
  }

  const body = JSON.stringify(payload);
  const failures: PushDeliveryFailure[] = [];
  let delivered = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(toSubscription(row), body, {
        TTL: Math.max(0, Math.floor(payload.ttlSeconds ?? 120)),
        urgency: payload.urgency ?? "high",
        topic: toWebPushTopic(payload.tag),
      });
      delivered += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : null;
      const message = error instanceof Error
        ? error.message
        : "Web push delivery failed.";

      failures.push({
        subscriptionId: row.id,
        statusCode,
        message,
      });

      // 403 is commonly returned when a subscription was created with a different
      // VAPID keypair. Treat it as stale so clients can re-subscribe cleanly.
      if (statusCode === 403 || statusCode === 404 || statusCode === 410) {
        await admin.from("web_push_subscriptions").delete().eq("id", row.id);
      }
    }
  }

  return {
    attempted: rows.length,
    delivered,
    failures,
  };
}

export async function sendWebPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushDeliverySummary> {
  if (!configureWebPush()) {
    return {
      configured: false,
      subscriptionCount: 0,
      attempted: 0,
      delivered: 0,
      failures: [],
    };
  }

  const { data } = await admin
    .from("web_push_subscriptions")
    .select("id,endpoint,p256dh_key,auth_key")
    .eq("user_id", userId);

  const rows = (data || []) as WebPushSubscriptionRow[];
  const result = await sendToRows(admin, rows, payload);

  return {
    configured: true,
    subscriptionCount: rows.length,
    attempted: result.attempted,
    delivered: result.delivered,
    failures: result.failures,
  };
}
