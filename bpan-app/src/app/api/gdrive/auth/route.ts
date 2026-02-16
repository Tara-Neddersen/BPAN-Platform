import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUrl, isDriveConfigured } from "@/lib/google-drive";

export async function GET() {
  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // State = user ID (so we know who to connect in the callback)
  const authUrl = getAuthUrl(user.id);
  return NextResponse.json({ url: authUrl });
}

