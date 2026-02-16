import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { NoteWithPaper } from "@/types";

/**
 * GET /api/notes/export?format=csv|bibtex
 * Export all user notes as CSV or BibTeX annotated bibliography.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

    // Fetch all notes with paper info
    const { data: notes, error } = await supabase
      .from("notes")
      .select("*, saved_papers(title, pmid, journal, authors, pub_date, doi, abstract)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const typedNotes = (notes || []) as (NoteWithPaper & {
      saved_papers: {
        title: string;
        pmid: string;
        journal: string | null;
        authors: string[];
        pub_date: string | null;
        doi: string | null;
        abstract: string | null;
      };
    })[];

    if (format === "bibtex") {
      return generateBibTeX(typedNotes);
    }

    return generateCSV(typedNotes);
  } catch (err) {
    console.error("Export error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to export notes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generateCSV(
  notes: (NoteWithPaper & {
    saved_papers: {
      title: string;
      pmid: string;
      journal: string | null;
      authors: string[];
      pub_date: string | null;
      doi: string | null;
      abstract: string | null;
    };
  })[]
): NextResponse {
  const headers = [
    "Paper Title",
    "Authors",
    "Journal",
    "Year",
    "PMID",
    "DOI",
    "Note Type",
    "Tags",
    "Highlighted Text",
    "Note Content",
    "Page",
    "Date Created",
  ];

  const rows = notes.map((note) => [
    csvEscape(note.saved_papers.title),
    csvEscape((note.saved_papers.authors || []).join("; ")),
    csvEscape(note.saved_papers.journal || ""),
    csvEscape(note.saved_papers.pub_date ? note.saved_papers.pub_date.split("-")[0] : ""),
    csvEscape(note.saved_papers.pmid),
    csvEscape(note.saved_papers.doi || ""),
    csvEscape(note.note_type),
    csvEscape(note.tags.join("; ")),
    csvEscape(note.highlight_text || ""),
    csvEscape(note.content),
    note.page_number?.toString() || "",
    new Date(note.created_at).toISOString().split("T")[0],
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bpan-notes-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

function generateBibTeX(
  notes: (NoteWithPaper & {
    saved_papers: {
      title: string;
      pmid: string;
      journal: string | null;
      authors: string[];
      pub_date: string | null;
      doi: string | null;
      abstract: string | null;
    };
  })[]
): NextResponse {
  // Group notes by paper
  const paperMap = new Map<
    string,
    {
      paper: typeof notes[0]["saved_papers"];
      pmid: string;
      notes: typeof notes;
    }
  >();

  for (const note of notes) {
    const key = note.saved_papers.pmid;
    if (!paperMap.has(key)) {
      paperMap.set(key, {
        paper: note.saved_papers,
        pmid: key,
        notes: [],
      });
    }
    paperMap.get(key)!.notes.push(note);
  }

  const entries: string[] = [];

  for (const [, { paper, pmid, notes: paperNotes }] of paperMap) {
    const year = paper.pub_date ? paper.pub_date.split("-")[0] : "n.d.";
    const firstAuthor =
      paper.authors?.[0]?.split(" ").pop()?.replace(/[^a-zA-Z]/g, "") || "Unknown";
    const citeKey = `${firstAuthor}${year}_${pmid}`;

    const authors = (paper.authors || []).join(" and ");

    // Combine all notes for this paper into the annote field
    const annotations = paperNotes
      .map((n) => {
        const type = `[${n.note_type.toUpperCase()}]`;
        const tags = n.tags.length > 0 ? ` {${n.tags.join(", ")}}` : "";
        const highlight = n.highlight_text
          ? `\n    Highlight: "${n.highlight_text.slice(0, 200)}${n.highlight_text.length > 200 ? "..." : ""}"`
          : "";
        return `  ${type}${tags}${highlight}\n    ${n.content.replace(/\n/g, "\n    ")}`;
      })
      .join("\n\n");

    const entry = `@article{${citeKey},
  author = {${bibEscape(authors)}},
  title = {${bibEscape(paper.title)}},
  journal = {${bibEscape(paper.journal || "")}},
  year = {${year}},
  pmid = {${pmid}},${paper.doi ? `\n  doi = {${bibEscape(paper.doi)}},` : ""}${paper.abstract ? `\n  abstract = {${bibEscape(paper.abstract.slice(0, 500))}${paper.abstract.length > 500 ? "..." : ""}},` : ""}
  annote = {${bibEscape(annotations)}}
}`;

    entries.push(entry);
  }

  const bibtex = entries.join("\n\n");

  return new NextResponse(bibtex, {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="bpan-bibliography-${new Date().toISOString().split("T")[0]}.bib"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function bibEscape(value: string): string {
  return value.replace(/[{}]/g, "");
}

