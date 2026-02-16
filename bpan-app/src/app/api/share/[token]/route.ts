import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("shared_snapshots")
      .select("title, description, content, includes, created_at")
      .eq("token", token)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Snapshot not found or expired" },
        { status: 404 }
      );
    }

    // Increment view count (best effort)
    try {
      await supabase
        .from("shared_snapshots")
        .update({ view_count: (data as unknown as { view_count: number }).view_count ? (data as unknown as { view_count: number }).view_count + 1 : 1 })
        .eq("token", token);
    } catch {
      // ignore
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

