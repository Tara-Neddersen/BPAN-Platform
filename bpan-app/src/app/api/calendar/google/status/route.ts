import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";

export async function GET() {
  if (!isGoogleCalendarConfigured()) return NextResponse.json({ configured: false, connected: false });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ configured: true, connected: false });

  const { data } = await supabase
    .from("google_calendar_tokens")
    .select("google_email, calendar_id, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: true,
    connected: !!data,
    email: data?.google_email || null,
    calendarId: data?.calendar_id || null,
    updatedAt: data?.updated_at || null,
  });
}

