import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createManagedGoogleSheetMirrorForUser } from "@/lib/google-sheet-mirror";
import { getGoogleSheetsAuthUrl, getGoogleSheetsReconnectMessage } from "@/lib/google-sheets";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const target = body?.target === "colony_results" ? "colony_results" : "results_workspace";
    const created = await createManagedGoogleSheetMirrorForUser(user.id, target);

    return NextResponse.json({
      success: true,
      target,
      link: created.link,
      spreadsheetUrl: created.spreadsheetUrl,
    });
  } catch (err) {
    const reconnectMessage = getGoogleSheetsReconnectMessage();
    const message = err instanceof Error ? err.message : "Failed to create live sync sheet";
    if (message === reconnectMessage) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("google_sheets_tokens").delete().eq("user_id", user.id);
      }
      return NextResponse.json(
        {
          error: reconnectMessage,
          needsReconnect: true,
          authUrl: user ? getGoogleSheetsAuthUrl(user.id) : null,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
