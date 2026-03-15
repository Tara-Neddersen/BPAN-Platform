import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleSheetsAuthUrl, isGoogleSheetsConfigured } from "@/lib/google-sheets";

export async function GET(req: NextRequest) {
  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets is not configured." }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const requestedNext = req.nextUrl.searchParams.get("next");
  const next = requestedNext && requestedNext.startsWith("/") ? requestedNext : "/results";

  return NextResponse.json({
    url: getGoogleSheetsAuthUrl(
      Buffer.from(
        JSON.stringify({
          userId: user.id,
          next,
        }),
      ).toString("base64url"),
    ),
  });
}
