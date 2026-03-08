import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const removeLink = body?.removeLink !== false;

  const { data: link, error: linkErr } = await supabase
    .from("google_sheet_links")
    .select("id,dataset_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  let deletedDataset = 0;
  let deletedColonyRows = 0;

  if (link.dataset_id) {
    const { error: datasetErr, count } = await supabase
      .from("datasets")
      .delete({ count: "exact" })
      .eq("id", link.dataset_id)
      .eq("user_id", user.id);
    if (datasetErr) return NextResponse.json({ error: datasetErr.message }, { status: 500 });
    deletedDataset = count || 0;
  }

  const { error: colonyErr, count: colonyCount } = await supabase
    .from("colony_results")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .eq("source_sheet_link_id", id);
  if (colonyErr) return NextResponse.json({ error: colonyErr.message }, { status: 500 });
  deletedColonyRows = colonyCount || 0;

  if (removeLink) {
    const { error: removeErr } = await supabase
      .from("google_sheet_links")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (removeErr) return NextResponse.json({ error: removeErr.message }, { status: 500 });
  } else {
    const { error: updateErr } = await supabase
      .from("google_sheet_links")
      .update({
        dataset_id: null,
        last_row_count: 0,
        last_sync_status: "purged",
        last_sync_error: null,
      })
      .eq("id", id)
      .eq("user_id", user.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await refreshWorkspaceBackstageIndexBestEffort(supabase, user.id);
  return NextResponse.json({
    success: true,
    deletedDataset,
    deletedColonyRows,
    removedLink: removeLink,
  });
}
