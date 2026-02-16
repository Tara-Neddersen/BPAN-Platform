import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  exchangeCode,
  getGoogleEmail,
  findOrCreateFolder,
} from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state"); // user ID
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/colony?drive=error&msg=" + error, req.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL("/colony?drive=error&msg=missing_params", req.url));
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code);

    // Get the Google email
    const googleEmail = await getGoogleEmail(tokens.access_token);

    // Create root folder "BPAN Platform" on their Drive
    const rootFolderId = await findOrCreateFolder(tokens.access_token, "BPAN Platform");

    // Store tokens in database
    const supabase = createServiceClient();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("google_drive_tokens")
      .upsert({
        user_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        google_email: googleEmail,
        root_folder_id: rootFolderId,
      }, { onConflict: "user_id" });

    if (dbError) {
      console.error("Failed to store Drive tokens:", dbError);
      return NextResponse.redirect(new URL("/colony?drive=error&msg=db_error", req.url));
    }

    return NextResponse.redirect(new URL("/colony?drive=connected", req.url));
  } catch (err) {
    console.error("Drive OAuth callback error:", err);
    return NextResponse.redirect(new URL("/colony?drive=error&msg=exchange_failed", req.url));
  }
}

