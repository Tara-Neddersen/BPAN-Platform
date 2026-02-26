import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workspace_events")
    .select("id,title,detail,event_type,event_at,payload")
    .eq("user_id", user.id)
    .eq("entity_type", "operator")
    .in("event_type", ["operator.plan", "operator.run"])
    .order("event_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items: (data || []).map((row) => ({
      id: String(row.id),
      kind: String(row.event_type) === "operator.plan" ? "plan" : "run",
      text: String(row.title || ""),
      createdAt: String(row.event_at || row.id),
      meta: typeof row.detail === "string" ? row.detail : undefined,
      payload: row.payload || null,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const kind = body?.kind === "plan" ? "plan" : body?.kind === "run" ? "run" : null;
  const text = String(body?.text || "").trim();
  if (!kind || !text) return NextResponse.json({ error: "kind and text are required" }, { status: 400 });

  const { error } = await supabase.from("workspace_events").insert({
    user_id: user.id,
    entity_type: "operator",
    entity_id: kind,
    event_type: kind === "plan" ? "operator.plan" : "operator.run",
    title: text.slice(0, 500),
    detail: body?.meta ? String(body.meta).slice(0, 500) : null,
    payload: body?.payload && typeof body.payload === "object" ? body.payload : {},
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
