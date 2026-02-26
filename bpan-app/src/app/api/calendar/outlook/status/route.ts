import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOutlookCalendarConfigured } from "@/lib/outlook-calendar";

export async function GET() {
  if (!isOutlookCalendarConfigured()) return NextResponse.json({ configured: false, connected: false });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ configured: true, connected: false });

  const { data } = await supabase
    .from("outlook_calendar_tokens")
    .select("outlook_email, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: true,
    connected: !!data,
    email: data?.outlook_email || null,
    updatedAt: data?.updated_at || null,
  });
}
