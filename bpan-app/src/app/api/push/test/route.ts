import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToUser } from "@/lib/web-push";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Push service not configured" }, { status: 500 });
  }

  const summary = await sendWebPushToUser(admin, user.id, {
    title: "BPAN test notification",
    body: "Push notifications are enabled on this device.",
    url: "/notifications",
    tag: "bpan-push-test",
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
    const errorSuffix = firstFailure
      ? ` (${firstFailure.statusCode ?? "no-status"}: ${firstFailure.message})`
      : "";
    return NextResponse.json(
      { error: `Push provider rejected delivery${errorSuffix}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    delivered: summary.delivered,
    attempted: summary.attempted,
  });
}
