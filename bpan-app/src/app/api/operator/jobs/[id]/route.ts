import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await req.json();

  const { data: row, error: readErr } = await supabase
    .from("workspace_events")
    .select("payload,title,detail")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("entity_type", "operator_job")
    .eq("event_type", "operator.job")
    .single();
  if (readErr || !row) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
  const nextPayload = { ...payload };
  if (body?.status === "queued" || body?.status === "paused") nextPayload.status = body.status;
  if (typeof body?.command === "string" && body.command.trim()) nextPayload.command = body.command.trim();
  if (typeof body?.autoRun === "boolean") nextPayload.autoRun = body.autoRun;
  if (body?.intervalHours === null) {
    nextPayload.intervalHours = null;
    nextPayload.nextRunAt = null;
    nextPayload.autoRun = false;
  } else if (typeof body?.intervalHours === "number" && Number.isFinite(body.intervalHours) && body.intervalHours > 0) {
    const intervalHours = Math.max(1, Math.min(168, Math.round(body.intervalHours)));
    nextPayload.intervalHours = intervalHours;
    nextPayload.autoRun = true;
    nextPayload.nextRunAt = new Date(Date.now() + intervalHours * 3600_000).toISOString();
  }
  if (typeof body?.maxRetries === "number" && Number.isFinite(body.maxRetries)) {
    nextPayload.maxRetries = Math.max(0, Math.min(10, Math.round(body.maxRetries)));
  }

  const update: Record<string, unknown> = { payload: nextPayload };
  if (typeof body?.name === "string" && body.name.trim()) update.title = body.name.trim().slice(0, 200);
  if (typeof body?.description === "string") update.detail = body.description.slice(0, 500) || null;

  const { error } = await supabase.from("workspace_events").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase
    .from("workspace_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("entity_type", "operator_job")
    .eq("event_type", "operator.job");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
