import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SubscriptionRequest = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: SubscriptionRequest;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const endpoint = (payload.endpoint || "").trim();
  const p256dh = (payload.keys?.p256dh || "").trim();
  const auth = (payload.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing endpoint/keys" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");
  const { error } = await supabase
    .from("web_push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: userAgent,
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
