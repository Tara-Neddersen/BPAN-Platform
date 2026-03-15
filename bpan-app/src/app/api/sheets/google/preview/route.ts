import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchGoogleSheetRows,
  getUsableGoogleSheetsAccessToken,
  parseGoogleSheetUrl,
} from "@/lib/google-sheets";
import { detectImportTarget, parseRowsToTabularPreview } from "@/lib/google-sheet-sync";

async function getAccessToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  try {
    const accessToken = await getUsableGoogleSheetsAccessToken(supabase, user.id);
    return { supabase, userId: user.id, accessToken };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Google Sheets not connected",
      status: 400 as const,
    };
  }
}

export async function POST(req: Request) {
  try {
    const { sheetUrl, maxRows } = await req.json();
    if (!sheetUrl) {
      return NextResponse.json({ error: "sheetUrl is required" }, { status: 400 });
    }

    const auth = await getAccessToken();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const parsed = parseGoogleSheetUrl(String(sheetUrl));
    const fetched = await fetchGoogleSheetRows(auth.accessToken, parsed.sheetId, {
      gid: parsed.gid,
      maxRows: Number(maxRows) || 1000,
    });

    const preview = parseRowsToTabularPreview(fetched.rows);
    const target = detectImportTarget(preview.columns, "auto");

    return NextResponse.json({
      sheetId: parsed.sheetId,
      gid: parsed.gid || null,
      spreadsheetTitle: fetched.spreadsheetTitle,
      sheetTitle: fetched.sheetTitle,
      rowCount: preview.data.length,
      columnCount: preview.columns.length,
      target,
      headerWarnings: preview.headerWarnings,
      columns: preview.columns,
      sample: preview.data.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview sheet" },
      { status: 500 }
    );
  }
}
