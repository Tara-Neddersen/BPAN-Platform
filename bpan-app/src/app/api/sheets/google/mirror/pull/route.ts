import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pullManagedGoogleSheetMirrorLinkForUser } from "@/lib/google-sheet-mirror";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const linkId = String(body?.linkId || "").trim();
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    await pullManagedGoogleSheetMirrorLinkForUser(user.id, linkId);
    return NextResponse.json({ success: true, linkId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to pull mirror changes into LabLynx" },
      { status: 500 }
    );
  }
}
