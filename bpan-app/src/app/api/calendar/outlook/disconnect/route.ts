import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [tok, map] = await Promise.all([
    supabase.from("outlook_calendar_tokens").delete().eq("user_id", user.id),
    supabase.from("outlook_calendar_event_map").delete().eq("user_id", user.id),
  ]);
  if (tok.error) return NextResponse.json({ error: tok.error.message }, { status: 500 });
  if (map.error) return NextResponse.json({ error: map.error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
