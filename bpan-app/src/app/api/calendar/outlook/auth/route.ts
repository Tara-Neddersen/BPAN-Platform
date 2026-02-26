import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOutlookCalendarAuthUrl, isOutlookCalendarConfigured } from "@/lib/outlook-calendar";

export async function GET() {
  if (!isOutlookCalendarConfigured()) {
    return NextResponse.json({ error: "Outlook Calendar not configured." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ url: getOutlookCalendarAuthUrl(user.id) });
}
