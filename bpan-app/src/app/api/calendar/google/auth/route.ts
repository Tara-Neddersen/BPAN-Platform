import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCalendarAuthUrl, isGoogleCalendarConfigured } from "@/lib/google-calendar";

export async function GET() {
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar not configured." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ url: getGoogleCalendarAuthUrl(user.id) });
}

