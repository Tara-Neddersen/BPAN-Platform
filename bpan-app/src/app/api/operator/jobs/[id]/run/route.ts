import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const { data: row, error: readErr } = await supabase
    .from("workspace_events")
    .select("payload,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("entity_type", "operator_job")
    .eq("event_type", "operator.job")
    .single();
  if (readErr || !row) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
  if (payload.status === "paused") return NextResponse.json({ error: "Job is paused" }, { status: 400 });
  const command = typeof payload.command === "string" ? payload.command.trim() : "";
  if (!command) return NextResponse.json({ error: "Job command is empty" }, { status: 400 });

  const chatRes = await fetch(new URL("/api/operator/chat", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
    body: JSON.stringify({ message: command }),
  });
  const chatData = await chatRes.json();

  const nextPayload = {
    ...payload,
    runCount: typeof payload.runCount === "number" ? payload.runCount + 1 : 1,
    lastRunAt: new Date().toISOString(),
    lastResult: String(chatData?.response || chatData?.error || (chatRes.ok ? "ok" : "failed")).slice(0, 1000),
  };
  await supabase.from("workspace_events").update({ payload: nextPayload }).eq("id", id).eq("user_id", user.id);

  return NextResponse.json({ success: chatRes.ok, response: chatData?.response || null, error: chatData?.error || null });
}

