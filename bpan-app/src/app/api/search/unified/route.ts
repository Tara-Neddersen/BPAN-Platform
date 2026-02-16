import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const query = `%${q}%`;

    // Search across all tables in parallel
    const [papers, notes, experiments, protocols, reagents, ideas, datasets] =
      await Promise.all([
        supabase
          .from("saved_papers")
          .select("id, title, authors, journal, pmid")
          .eq("user_id", user.id)
          .or(`title.ilike.${query},authors.ilike.${query},journal.ilike.${query}`)
          .limit(5),
        supabase
          .from("notes")
          .select("id, content, highlight_text, note_type, paper_id")
          .eq("user_id", user.id)
          .or(`content.ilike.${query},highlight_text.ilike.${query}`)
          .limit(5),
        supabase
          .from("experiments")
          .select("id, title, description, status")
          .eq("user_id", user.id)
          .or(`title.ilike.${query},description.ilike.${query}`)
          .limit(5),
        supabase
          .from("protocols")
          .select("id, title, description")
          .eq("user_id", user.id)
          .or(`title.ilike.${query},description.ilike.${query}`)
          .limit(5),
        supabase
          .from("reagents")
          .select("id, name, catalog_number, supplier")
          .eq("user_id", user.id)
          .or(`name.ilike.${query},catalog_number.ilike.${query},supplier.ilike.${query}`)
          .limit(5),
        supabase
          .from("research_ideas")
          .select("id, title, description, status")
          .eq("user_id", user.id)
          .or(`title.ilike.${query},description.ilike.${query}`)
          .limit(5),
        supabase
          .from("datasets")
          .select("id, name, description, row_count")
          .eq("user_id", user.id)
          .or(`name.ilike.${query},description.ilike.${query}`)
          .limit(5),
      ]);

    const results = [
      ...(papers.data || []).map((p) => ({
        type: "paper" as const,
        id: p.id,
        title: p.title,
        subtitle: `${p.journal || ""} · PMID ${p.pmid || ""}`.trim(),
        href: `/papers/${p.id}`,
      })),
      ...(notes.data || []).map((n) => ({
        type: "note" as const,
        id: n.id,
        title: (n.content || "").slice(0, 100),
        subtitle: n.note_type || "note",
        href: n.paper_id ? `/papers/${n.paper_id}` : "/notes",
      })),
      ...(experiments.data || []).map((e) => ({
        type: "experiment" as const,
        id: e.id,
        title: e.title,
        subtitle: e.status || "",
        href: "/experiments",
      })),
      ...(protocols.data || []).map((p) => ({
        type: "protocol" as const,
        id: p.id,
        title: p.title,
        subtitle: (p.description || "").slice(0, 60),
        href: "/experiments",
      })),
      ...(reagents.data || []).map((r) => ({
        type: "reagent" as const,
        id: r.id,
        title: r.name,
        subtitle: [r.catalog_number, r.supplier].filter(Boolean).join(" · "),
        href: "/experiments",
      })),
      ...(ideas.data || []).map((i) => ({
        type: "idea" as const,
        id: i.id,
        title: i.title,
        subtitle: i.status || "",
        href: "/ideas",
      })),
      ...(datasets.data || []).map((d) => ({
        type: "dataset" as const,
        id: d.id,
        title: d.name,
        subtitle: `${d.row_count} rows`,
        href: "/results",
      })),
    ];

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Unified search error:", err);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

