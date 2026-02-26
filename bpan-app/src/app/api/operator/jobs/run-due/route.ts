import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DueJobRow = {
  id: string;
  payload: Record<string, unknown> | null;
  title: string | null;
};

function isDue(payload: Record<string, unknown> | null) {
  if (!payload) return false;
  if (payload.status === "paused") return false;
  const autoRun = payload.autoRun === true || typeof payload.intervalHours === "number";
  if (!autoRun) return false;
  if (typeof payload.nextRunAt !== "string") return false;
  const ts = new Date(payload.nextRunAt).getTime();
  if (Number.isNaN(ts)) return false;
  return ts <= Date.now();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workspace_events")
    .select("id,payload,title")
    .eq("user_id", user.id)
    .eq("entity_type", "operator_job")
    .eq("event_type", "operator.job")
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dueJobs = ((data || []) as DueJobRow[]).filter((row) => isDue(row.payload));
  let ran = 0;
  let failed = 0;
  const results: Array<{ id: string; name: string; success: boolean; error?: string | null }> = [];

  for (const job of dueJobs.slice(0, 20)) {
    try {
      const res = await fetch(new URL(`/api/operator/jobs/${job.id}/run`, req.url), {
        method: "POST",
        headers: { cookie: req.headers.get("cookie") || "" },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        ran++;
        results.push({ id: job.id, name: String(job.title || "Operator Job"), success: true });
      } else {
        failed++;
        results.push({
          id: job.id,
          name: String(job.title || "Operator Job"),
          success: false,
          error: typeof json?.error === "string" ? json.error : "Job run failed",
        });
      }
    } catch (e) {
      failed++;
      results.push({
        id: job.id,
        name: String(job.title || "Operator Job"),
        success: false,
        error: e instanceof Error ? e.message : "Job run failed",
      });
    }
  }

  return NextResponse.json({
    success: true,
    scanned: (data || []).length,
    due: dueJobs.length,
    ran,
    failed,
    results,
  });
}

