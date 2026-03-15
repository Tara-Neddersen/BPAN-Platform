import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGoogleSheetsReconnectMessage,
  getUsableGoogleSheetsAccessToken,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets";

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

  if (data) {
    try {
      await getUsableGoogleSheetsAccessToken(supabase, user.id);
    } catch (error) {
      const reconnectMessage = getGoogleSheetsReconnectMessage();
      const message = error instanceof Error ? error.message : reconnectMessage;
      if (message === reconnectMessage) {
        return NextResponse.json({
          configured: true,
          connected: false,
          needsReconnect: true,
          email: data.google_email || null,
          updatedAt: data.updated_at || null,
        });
      }
      throw error;
    }
  }

  return NextResponse.json({
    configured: true,
    connected: !!data,
    email: data?.google_email || null,
    updatedAt: data?.updated_at || null,
  });
}
