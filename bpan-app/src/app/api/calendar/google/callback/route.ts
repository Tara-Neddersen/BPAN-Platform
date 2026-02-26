import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarEmail,
} from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");
    if (error) return NextResponse.redirect(new URL(`/experiments?calendar=error&msg=${encodeURIComponent(error)}`, req.url));
    if (!code || !state) return NextResponse.redirect(new URL("/experiments?calendar=error&msg=missing_params", req.url));

    const tokens = await exchangeGoogleCalendarCode(code);
    const googleEmail = await getGoogleCalendarEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = createServiceClient();
    const { error: dbError } = await supabase
      .from("google_calendar_tokens")
      .upsert({
        user_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        google_email: googleEmail,
        calendar_id: "primary",
      }, { onConflict: "user_id" });
    if (dbError) {
      console.error(dbError);
      return NextResponse.redirect(new URL("/experiments?calendar=error&msg=db_error", req.url));
    }
    return NextResponse.redirect(new URL("/experiments?calendar=connected", req.url));
  } catch (err) {
    console.error("Google Calendar callback error:", err);
    return NextResponse.redirect(new URL("/experiments?calendar=error&msg=exchange_failed", req.url));
  }
}

