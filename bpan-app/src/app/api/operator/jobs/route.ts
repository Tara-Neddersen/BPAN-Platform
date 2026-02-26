import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type JobPayload = {
  command: string;
  status: "queued" | "paused";
  autoRun?: boolean;
  intervalHours?: number | null;
  nextRunAt?: string | null;
  maxRetries?: number;
  consecutiveFailures?: number;
  runCount?: number;
  lastRunAt?: string | null;
  lastResult?: string | null;
  lastError?: string | null;
};

function normalizePayload(payload: unknown): JobPayload {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const intervalHours =
    typeof p.intervalHours === "number" && Number.isFinite(p.intervalHours) && p.intervalHours > 0
      ? Math.max(1, Math.min(168, Math.round(p.intervalHours)))
      : null;
  return {
    command: typeof p.command === "string" ? p.command : "",
    status: p.status === "paused" ? "paused" : "queued",
    autoRun: p.autoRun === false ? false : Boolean(intervalHours),
    intervalHours,
    nextRunAt: typeof p.nextRunAt === "string" ? p.nextRunAt : null,
    maxRetries: typeof p.maxRetries === "number" ? Math.max(0, Math.min(10, Math.round(p.maxRetries))) : 2,
    consecutiveFailures:
      typeof p.consecutiveFailures === "number" ? Math.max(0, Math.round(p.consecutiveFailures)) : 0,
    runCount: typeof p.runCount === "number" ? p.runCount : 0,
    lastRunAt: typeof p.lastRunAt === "string" ? p.lastRunAt : null,
    lastResult: typeof p.lastResult === "string" ? p.lastResult : null,
    lastError: typeof p.lastError === "string" ? p.lastError : null,
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
  const intervalHours =
    typeof body?.intervalHours === "number" && Number.isFinite(body.intervalHours) && body.intervalHours > 0
      ? Math.max(1, Math.min(168, Math.round(body.intervalHours)))
      : null;
  const now = Date.now();
  const nextRunAt = intervalHours ? new Date(now + intervalHours * 3600_000).toISOString() : null;

  const payload: JobPayload = {
    command,
    status: body?.status === "paused" ? "paused" : "queued",
    autoRun: Boolean(intervalHours),
    intervalHours,
    nextRunAt,
    maxRetries:
      typeof body?.maxRetries === "number" && Number.isFinite(body.maxRetries)
        ? Math.max(0, Math.min(10, Math.round(body.maxRetries)))
        : 2,
    consecutiveFailures: 0,
    runCount: 0,
    lastRunAt: null,
    lastResult: null,
    lastError: null,
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
