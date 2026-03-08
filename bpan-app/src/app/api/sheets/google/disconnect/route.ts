import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ error: tokenError }, { error: linkError }] = await Promise.all([
    supabase.from("google_sheets_tokens").delete().eq("user_id", user.id),
    supabase.from("google_sheet_links").delete().eq("user_id", user.id),
  ]);

  if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 });
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
