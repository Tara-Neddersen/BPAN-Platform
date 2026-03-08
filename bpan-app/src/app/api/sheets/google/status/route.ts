import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";

export async function GET() {
  if (!isGoogleSheetsConfigured()) return NextResponse.json({ configured: false, connected: false });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ configured: true, connected: false });

  const { data } = await supabase
    .from("google_sheets_tokens")
    .select("google_email, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: true,
    connected: !!data,
    email: data?.google_email || null,
    updatedAt: data?.updated_at || null,
  });
}
