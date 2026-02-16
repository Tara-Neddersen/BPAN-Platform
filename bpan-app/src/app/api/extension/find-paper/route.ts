import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

/**
 * Find a saved paper by PMID or DOI.
 * Used by the extension to link notes to existing papers.
 */
export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(request: Request) {
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

    const { pmid, doi } = await request.json();

    let query = supabase
      .from("saved_papers")
      .select("id, title, pmid, doi")
      .eq("user_id", user.id);

    if (pmid) {
      query = query.eq("pmid", pmid);
    } else if (doi) {
      query = query.eq("doi", doi);
    } else {
      return NextResponse.json({ paperId: null }, { headers: corsHeaders() });
    }

    const { data: paper } = await query.single();

    if (paper) {
      return NextResponse.json(
        {
          paperId: paper.id,
          title: paper.title,
        },
        { headers: corsHeaders() }
      );
    }

    return NextResponse.json({ paperId: null }, { headers: corsHeaders() });
  } catch (err) {
    console.error("Find paper error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
