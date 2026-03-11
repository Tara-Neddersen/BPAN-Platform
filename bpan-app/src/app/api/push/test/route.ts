import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToUser } from "@/lib/web-push";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Test sends only need access to the current user's own subscriptions.
    // Prefer service-role client when available, but gracefully fall back to user-scoped client.
    const deliveryClient = (() => {
      try {
        return createAdminClient();
      } catch {
        return supabase;
      }
    })();

    const uniqueTestTag = `bpan-push-test-${Date.now()}`;
    const summary = await sendWebPushToUser(deliveryClient, user.id, {
      title: "BPAN test notification",
      body: "Push notifications are enabled on this device.",
      url: "/notifications",
      tag: uniqueTestTag,
    });

    if (!summary.configured) {
      return NextResponse.json(
        { error: "Push service is not configured (missing VAPID keys)." },
        { status: 500 },
      );
    }

    if (summary.subscriptionCount === 0) {
      return NextResponse.json(
        { error: "No saved push subscription for this account on this server. Tap Enable Push again in this web app." },
        { status: 400 },
      );
    }

    if (summary.delivered === 0) {
      const firstFailure = summary.failures[0];
      const statusCode = firstFailure?.statusCode ?? null;
      const isLikelyStaleSubscription = statusCode === 403;
      const errorSuffix = firstFailure
        ? ` (${statusCode ?? "no-status"}: ${firstFailure.message})`
        : "";
      return NextResponse.json(
        {
          error: isLikelyStaleSubscription
            ? `Push subscription is stale after key rotation. Disable Push and Enable Push again, then retry.${errorSuffix}`
            : `Push provider rejected delivery${errorSuffix}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      delivered: summary.delivered,
      attempted: summary.attempted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send test push notification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
