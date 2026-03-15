import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleSheetsAuthUrl, isGoogleSheetsConfigured } from "@/lib/google-sheets";

export async function GET() {
  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets is not configured." }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({ url: getGoogleSheetsAuthUrl(user.id) });
}
