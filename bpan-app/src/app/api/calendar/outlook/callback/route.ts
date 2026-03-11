import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeOutlookCalendarCode,
  getOutlookCalendarEmail,
} from "@/lib/outlook-calendar";
import { ACTIVE_LAB_COOKIE } from "@/lib/active-lab-context";

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
        provider: "outlook",
        msg: "Outlook connection was cancelled.",
      });
    }
    if (!code || !state) {
      return redirectToExperiments({
        calendar: "error",
        provider: "outlook",
        msg: "Outlook connection is missing required callback data.",
      });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(
        new URL(`/auth/login?next=${encodeURIComponent("/experiments")}&error=${encodeURIComponent("Sign in again to finish Outlook connection.")}`, req.url)
      );
    }
    if (state !== user.id) {
      return redirectToExperiments({
        calendar: "error",
        provider: "outlook",
        msg: "Outlook connection could not be verified for this account.",
      });
    }

    const tokens = await exchangeOutlookCalendarCode(code);
    const outlookEmail = await getOutlookCalendarEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("outlook_calendar_tokens")
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        outlook_email: outlookEmail,
      }, { onConflict: "user_id" });
    if (dbError) {
      console.error(dbError);
      return redirectToExperiments({
        calendar: "error",
        provider: "outlook",
        msg: "Outlook connection could not be saved. Please try again.",
      });
    }

    const cookieStore = await cookies();
    const activeLabId = cookieStore.get(ACTIVE_LAB_COOKIE)?.value?.trim() ?? "";
    if (activeLabId) {
      const { data: membership } = await supabase
        .from("lab_members")
        .select("lab_id")
        .eq("lab_id", activeLabId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (membership) {
        await supabase
          .from("labs")
          .update({ outlook_sync_owner_user_id: user.id })
          .eq("id", activeLabId);
      }
    }

    return redirectToExperiments({
      calendar: "connected",
      provider: "outlook",
      msg: "Outlook Calendar connected.",
    });
  } catch (err) {
    console.error("Outlook Calendar callback error:", err);
    return redirectToExperiments({
      calendar: "error",
      provider: "outlook",
      msg: "Outlook connection failed during authorization.",
    });
  }
}
