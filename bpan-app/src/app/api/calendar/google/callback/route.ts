import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarEmail,
} from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const redirectToExperiments = (params: Record<string, string>) => {
    const url = new URL("/experiments", req.url);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return NextResponse.redirect(url);
  };

  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");
    if (error) {
      return redirectToExperiments({
        calendar: "error",
        provider: "google",
        msg: "Google connection was cancelled.",
      });
    }
    if (!code || !state) {
      return redirectToExperiments({
        calendar: "error",
        provider: "google",
        msg: "Google connection is missing required callback data.",
      });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(
        new URL(`/auth/login?next=${encodeURIComponent("/experiments")}&error=${encodeURIComponent("Sign in again to finish Google connection.")}`, req.url)
      );
    }
    if (state !== user.id) {
      return redirectToExperiments({
        calendar: "error",
        provider: "google",
        msg: "Google connection could not be verified for this account.",
      });
    }

    const tokens = await exchangeGoogleCalendarCode(code);
    const googleEmail = await getGoogleCalendarEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("google_calendar_tokens")
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        google_email: googleEmail,
        calendar_id: "primary",
      }, { onConflict: "user_id" });
    if (dbError) {
      console.error(dbError);
      return redirectToExperiments({
        calendar: "error",
        provider: "google",
        msg: "Google connection could not be saved. Please try again.",
      });
    }
    return redirectToExperiments({
      calendar: "connected",
      provider: "google",
      msg: "Google Calendar connected.",
    });
  } catch (err) {
    console.error("Google Calendar callback error:", err);
    return redirectToExperiments({
      calendar: "error",
      provider: "google",
      msg: "Google connection failed during authorization.",
    });
  }
}
