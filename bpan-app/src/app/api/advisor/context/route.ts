import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/advisor/context
 * Get user's research context.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data } = await supabase
      .from("research_context")
      .select("*")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({ context: data || null });
  } catch (err) {
    console.error("Get context error:", err);
    return NextResponse.json(
      { error: "Failed to load research context" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/advisor/context
 * Create or update user's research context (upsert).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const contextData = {
      user_id: user.id,
      thesis_title: body.thesis_title || null,
      thesis_summary: body.thesis_summary || null,
      aims: body.aims || [],
      key_questions: body.key_questions || [],
      model_systems: body.model_systems || [],
      key_techniques: body.key_techniques || [],
    };

    // Upsert — insert if not exists, update if exists
    const { data, error } = await supabase
      .from("research_context")
      .upsert(contextData, { onConflict: "user_id" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ context: data });
  } catch (err) {
    console.error("Save context error:", err);
    return NextResponse.json(
      { error: "Failed to save research context" },
      { status: 500 }
    );
  }
}

