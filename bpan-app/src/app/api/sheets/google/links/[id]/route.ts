import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeImportConfig } from "@/lib/google-sheet-import-config";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.target === "string") update.target = body.target;
  if (typeof body.autoSyncEnabled === "boolean") update.auto_sync_enabled = body.autoSyncEnabled;
  if (typeof body.importConfig !== "undefined") update.import_config = sanitizeImportConfig(body.importConfig);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("google_sheet_links")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,name,sheet_url,sheet_id,gid,sheet_title,target,import_config,auto_sync_enabled,last_synced_at,last_sync_status,last_sync_error,last_row_count,dataset_id,experiment_id,experiment_run_id,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase
    .from("google_sheet_links")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
