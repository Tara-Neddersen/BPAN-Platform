import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createManagedGoogleSheetMirrorForUser } from "@/lib/google-sheet-mirror";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create live sync sheet" },
      { status: 500 }
    );
  }
}
