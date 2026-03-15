import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleSheetsCode, getGoogleSheetsEmail } from "@/lib/google-sheets";

export async function GET(req: NextRequest) {
  const redirectToResults = (params: Record<string, string>) => {
    const url = new URL("/results", req.url);
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
      return redirectToResults({
        sheets: "error",
        msg: "Google Sheets connection was cancelled.",
      });
    }
    if (!code || !state) {
      return redirectToResults({
        sheets: "error",
        msg: "Google Sheets callback is missing required data.",
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL(
          `/auth/login?next=${encodeURIComponent("/results")}&error=${encodeURIComponent("Sign in again to finish Google Sheets connection.")}`,
          req.url
        )
      );
    }

    if (state !== user.id) {
      return redirectToResults({
        sheets: "error",
        msg: "Google Sheets connection could not be verified for this account.",
      });
    }

    const tokens = await exchangeGoogleSheetsCode(code);
    if (!tokens.refresh_token) {
      return redirectToResults({
        sheets: "error",
        msg: "Google Sheets reconnect did not return a refresh token. Please try again.",
      });
    }
    const googleEmail = await getGoogleSheetsEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("google_sheets_tokens")
      .upsert(
        {
          user_id: user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          google_email: googleEmail,
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error(dbError);
      return redirectToResults({
        sheets: "error",
        msg: "Google Sheets connection could not be saved.",
      });
    }

    return redirectToResults({
      sheets: "connected",
      msg: "Google Sheets connected.",
    });
  } catch (err) {
    console.error("Google Sheets callback error:", err);
    return redirectToResults({
      sheets: "error",
      msg: "Google Sheets authorization failed.",
    });
  }
}
