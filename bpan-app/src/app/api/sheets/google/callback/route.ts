import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleSheetsCode, getGoogleSheetsEmail } from "@/lib/google-sheets";

export async function GET(req: NextRequest) {
  const parseState = (rawState: string | null) => {
    if (!rawState) return null;
    try {
      const decoded = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8")) as {
        userId?: string;
        next?: string;
      };
      return {
        userId: decoded.userId || null,
        next: decoded.next?.startsWith("/") ? decoded.next : "/results",
      };
    } catch {
      return {
        userId: rawState,
        next: "/results",
      };
    }
  };

  const redirectToTarget = (nextPath: string, params: Record<string, string>) => {
    const url = new URL(nextPath || "/results", req.url);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return NextResponse.redirect(url);
  };

  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = parseState(req.nextUrl.searchParams.get("state"));
    const error = req.nextUrl.searchParams.get("error");
    const nextPath = state?.next || "/results";

    if (error) {
      return redirectToTarget(nextPath, {
        sheets: "error",
        msg: "Google Sheets connection was cancelled.",
      });
    }
    if (!code || !state?.userId) {
      return redirectToTarget(nextPath, {
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
          `/auth/login?next=${encodeURIComponent(nextPath)}&error=${encodeURIComponent("Sign in again to finish Google Sheets connection.")}`,
          req.url
        )
      );
    }

    if (state.userId !== user.id) {
      return redirectToTarget(nextPath, {
        sheets: "error",
        msg: "Google Sheets connection could not be verified for this account.",
      });
    }

    const { data: existingTokenRow } = await supabase
      .from("google_sheets_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    const tokens = await exchangeGoogleSheetsCode(code);
    const refreshToken = tokens.refresh_token || existingTokenRow?.refresh_token || null;
    if (!refreshToken) {
      return redirectToTarget(nextPath, {
        sheets: "error",
        msg: "Google Sheets connection did not return a reusable refresh token. Please disconnect Sheets and try again.",
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
          refresh_token: refreshToken,
          expires_at: expiresAt,
          google_email: googleEmail,
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error(dbError);
      return redirectToTarget(nextPath, {
        sheets: "error",
        msg: "Google Sheets connection could not be saved.",
      });
    }

    return redirectToTarget(nextPath, {
      sheets: "connected",
      msg: "Google Sheets connected.",
    });
  } catch (err) {
    console.error("Google Sheets callback error:", err);
    return redirectToTarget("/results", {
      sheets: "error",
      msg: "Google Sheets authorization failed.",
    });
  }
}
