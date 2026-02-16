import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/advisor/hypotheses
 * List user's hypotheses.
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

    const { data: hypotheses, error } = await supabase
      .from("hypotheses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ hypotheses: hypotheses || [] });
  } catch (err) {
    console.error("Hypotheses error:", err);
    return NextResponse.json(
      { error: "Failed to load hypotheses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/advisor/hypotheses
 * Create a new hypothesis.
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

    const { title, description, aim, status } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("hypotheses")
      .insert({
        user_id: user.id,
        title,
        description: description || null,
        aim: aim || null,
        status: status || "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ hypothesis: data });
  } catch (err) {
    console.error("Create hypothesis error:", err);
    return NextResponse.json(
      { error: "Failed to create hypothesis" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/advisor/hypotheses
 * Update a hypothesis (status, evidence, etc.)
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, ...updates } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Hypothesis ID is required" },
        { status: 400 }
      );
    }

    // Only allow specific fields
    const allowedFields = [
      "title",
      "description",
      "status",
      "evidence_for",
      "evidence_against",
      "aim",
      "related_paper_ids",
    ];
    const filteredUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        filteredUpdates[key] = updates[key];
      }
    }

    const { data, error } = await supabase
      .from("hypotheses")
      .update(filteredUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ hypothesis: data });
  } catch (err) {
    console.error("Update hypothesis error:", err);
    return NextResponse.json(
      { error: "Failed to update hypothesis" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/advisor/hypotheses
 * Delete a hypothesis.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Hypothesis ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("hypotheses")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete hypothesis error:", err);
    return NextResponse.json(
      { error: "Failed to delete hypothesis" },
      { status: 500 }
    );
  }
}

