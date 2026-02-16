import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

/**
 * Get notes for a paper (extension API).
 */
export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const paperId = searchParams.get("paperId");
    if (!paperId) {
      return NextResponse.json([], { headers: corsHeaders() });
    }

    const { data: notes } = await supabase
      .from("notes")
      .select("*")
      .eq("paper_id", paperId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return NextResponse.json(notes || [], { headers: corsHeaders() });
  } catch (err) {
    console.error("Get notes error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
