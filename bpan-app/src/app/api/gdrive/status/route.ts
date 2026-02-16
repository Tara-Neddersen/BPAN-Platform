import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDriveConfigured } from "@/lib/google-drive";

export async function GET() {
  if (!isDriveConfigured()) {
    return NextResponse.json({ configured: false, connected: false });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ configured: true, connected: false });
  }

  const { data } = await supabase
    .from("google_drive_tokens")
    .select("google_email")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    configured: true,
    connected: !!data,
    email: data?.google_email || null,
  });
}

