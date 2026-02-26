import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type JobPayload = {
  command: string;
  status: "queued" | "paused";
  runCount?: number;
  lastRunAt?: string | null;
  lastResult?: string | null;
};

function normalizePayload(payload: unknown): JobPayload {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return {
    command: typeof p.command === "string" ? p.command : "",
    status: p.status === "paused" ? "paused" : "queued",
    runCount: typeof p.runCount === "number" ? p.runCount : 0,
    lastRunAt: typeof p.lastRunAt === "string" ? p.lastRunAt : null,
    lastResult: typeof p.lastResult === "string" ? p.lastResult : null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workspace_events")
    .select("id,title,detail,event_at,payload")
    .eq("user_id", user.id)
    .eq("entity_type", "operator_job")
    .eq("event_type", "operator.job")
    .order("event_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    jobs: (data || []).map((row) => {
      const p = normalizePayload(row.payload);
      return {
        id: String(row.id),
        name: String(row.title || "Operator Job"),
        createdAt: String(row.event_at),
        description: typeof row.detail === "string" ? row.detail : "",
        ...p,
      };
    }),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const command = String(body?.command || "").trim();
  const name = String(body?.name || "Operator Job").trim();
  if (!command) return NextResponse.json({ error: "command is required" }, { status: 400 });

  const payload: JobPayload = {
    command,
    status: body?.status === "paused" ? "paused" : "queued",
    runCount: 0,
    lastRunAt: null,
    lastResult: null,
  };

  const { data, error } = await supabase
    .from("workspace_events")
    .insert({
      user_id: user.id,
      entity_type: "operator_job",
      entity_id: "job",
      event_type: "operator.job",
      title: name.slice(0, 200),
      detail: String(body?.description || "").slice(0, 500) || null,
      payload,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}

