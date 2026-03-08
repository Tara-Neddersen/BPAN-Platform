import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseGoogleSheetUrl } from "@/lib/google-sheets";
import { sanitizeImportConfig } from "@/lib/google-sheet-import-config";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("google_sheet_links")
    .select("id,name,sheet_url,sheet_id,gid,sheet_title,target,import_config,auto_sync_enabled,last_synced_at,last_sync_status,last_sync_error,last_row_count,dataset_id,experiment_id,experiment_run_id,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data || [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const sheetUrl = String(body.sheetUrl || "").trim();
  const name = String(body.name || "").trim();
  const target = String(body.target || "auto");

  if (!sheetUrl) return NextResponse.json({ error: "sheetUrl is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!["auto", "dataset", "colony_results"].includes(target)) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseGoogleSheetUrl(sheetUrl);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid sheet URL" }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    name,
    sheet_url: sheetUrl,
    sheet_id: parsed.sheetId,
    gid: parsed.gid || null,
    sheet_title: body.sheetTitle ? String(body.sheetTitle) : null,
    target,
    import_config: sanitizeImportConfig(body.importConfig),
    auto_sync_enabled: body.autoSyncEnabled !== false,
    experiment_id: body.experimentId || null,
    experiment_run_id: body.experimentRunId || null,
  };

  const { data, error } = await supabase
    .from("google_sheet_links")
    .insert(payload)
    .select("id,name,sheet_url,sheet_id,gid,sheet_title,target,import_config,auto_sync_enabled,last_synced_at,last_sync_status,last_sync_error,last_row_count,dataset_id,experiment_id,experiment_run_id,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}
