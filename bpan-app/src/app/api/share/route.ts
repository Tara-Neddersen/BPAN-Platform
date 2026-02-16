import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST — Create a shareable snapshot
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, description, includes } = await req.json();

    // Gather selected data
    const content: Record<string, unknown> = {};

    if (includes.includes("papers")) {
      const { data } = await supabase
        .from("saved_papers")
        .select("title, authors, journal, pub_date, pmid")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      content.papers = data || [];
    }

    if (includes.includes("notes")) {
      const { data } = await supabase
        .from("notes")
        .select("content, note_type, highlight_text, tags, saved_papers(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      content.notes = data || [];
    }

    if (includes.includes("experiments")) {
      const { data } = await supabase
        .from("experiments")
        .select("title, description, status, start_date, end_date, priority")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      content.experiments = data || [];
    }

    if (includes.includes("results")) {
      const { data } = await supabase
        .from("analyses")
        .select("name, test_type, results, ai_interpretation, datasets(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      content.results = data || [];
    }

    if (includes.includes("ideas")) {
      const { data } = await supabase
        .from("research_ideas")
        .select("title, description, status, tags, idea_entries(content, entry_type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      content.ideas = data || [];
    }

    if (includes.includes("hypotheses")) {
      const { data } = await supabase
        .from("hypotheses")
        .select("title, description, status, evidence_for, evidence_against")
        .eq("user_id", user.id)
        .limit(20);
      content.hypotheses = data || [];
    }

    const { data, error } = await supabase
      .from("shared_snapshots")
      .insert({
        user_id: user.id,
        title,
        description: description || null,
        content,
        includes,
      })
      .select("id, token")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      id: data.id,
      token: data.token,
      url: `/shared/${data.token}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Share failed" },
      { status: 500 }
    );
  }
}

// GET — List user's shared snapshots
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data } = await supabase
      .from("shared_snapshots")
      .select("id, title, description, token, includes, view_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ snapshots: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE — Delete a shared snapshot
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json();

    const { error } = await supabase
      .from("shared_snapshots")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}

