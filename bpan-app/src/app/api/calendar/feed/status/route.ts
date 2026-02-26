import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error } = await supabase
    .from("calendar_feed_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let data = existing;
  if (!data) {
    const inserted = await supabase
      .from("calendar_feed_tokens")
      .insert({ user_id: user.id })
      .select("token")
      .single();
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    data = inserted.data;
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.json({
    success: true,
    token: data.token,
    icsUrl: `${base}/api/calendar/feed/${data.token}.ics`,
    subscribeHint: "Use this URL in Apple Calendar / Outlook / Google Calendar 'From URL'.",
  });
}
