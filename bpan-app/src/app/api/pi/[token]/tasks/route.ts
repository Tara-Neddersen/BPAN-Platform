import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { refreshWorkspaceBackstageIndexBestEffort } from "@/lib/workspace-backstage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createServiceClient();

    const { data: portal } = await supabase
      .from("advisor_portal")
      .select("id,user_id,advisor_name")
      .eq("token", token)
      .maybeSingle();

    if (!portal) {
      return NextResponse.json({ error: "Access denied" }, { status: 404 });
    }

    const body = await req.json();
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim() || null;
    const dueDate = String(body?.due_date || "").trim() || null;
    const priority = ["low", "medium", "high"].includes(String(body?.priority || "medium"))
      ? String(body?.priority)
      : "medium";

    if (!title) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }

    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert({
        user_id: portal.user_id,
        title,
        description,
        due_date: dueDate,
        due_time: null,
        priority,
        status: "pending",
        source_type: "pi_portal",
        source_id: portal.id,
        source_label: `PI Portal: ${String(portal.advisor_name || "PI")}`,
        tags: ["pi_assigned"],
      })
      .select("id,title,due_date,priority")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await refreshWorkspaceBackstageIndexBestEffort(supabase, String(portal.user_id));

    return NextResponse.json({ success: true, task: inserted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create task" },
      { status: 500 }
    );
  }
}

