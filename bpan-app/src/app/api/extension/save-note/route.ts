import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

/**
 * Save a note from the extension.
 * If no paperId is provided, creates a "scratch" paper from the page URL/title.
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

    const {
      paperId,
      content,
      highlightText,
      noteType,
      tags,
      pageUrl,
      pageTitle,
    } = await request.json();

    let finalPaperId = paperId;

    // If no paper is linked, try to detect and create from the page
    if (!finalPaperId && pageUrl) {
      // Try to detect DOI or PMID from URL
      const doiMatch = pageUrl.match(/doi\.org\/(10\.\d{4,}\/[^\s&?#]+)/);
      const pmidMatch = pageUrl.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);

      const doi = doiMatch ? doiMatch[1] : null;
      const pmid = pmidMatch ? pmidMatch[1] : null;

      if (pmid || doi) {
        // Check if paper already exists
        let query = supabase
          .from("saved_papers")
          .select("id")
          .eq("user_id", user.id);

        if (pmid) query = query.eq("pmid", pmid);
        else if (doi) query = query.eq("doi", doi);

        const { data: existing } = await query.single();

        if (existing) {
          finalPaperId = existing.id;
        } else {
          // Create a new saved paper
          const { data: newPaper, error: paperError } = await supabase
            .from("saved_papers")
            .insert({
              user_id: user.id,
              pmid: pmid || `ext-${Date.now()}`,
              title: pageTitle || "Untitled paper",
              authors: [],
              doi,
            })
            .select("id")
            .single();

          if (paperError) {
            console.error("Failed to create paper:", paperError);
            return NextResponse.json(
              { error: "Failed to create paper" },
              { status: 500, headers: corsHeaders() }
            );
          }
          finalPaperId = newPaper.id;
        }
      } else {
        // No identifiable paper — create a generic entry
        const { data: newPaper, error: paperError } = await supabase
          .from("saved_papers")
          .insert({
            user_id: user.id,
            pmid: `ext-${Date.now()}`,
            title: pageTitle || "Web page note",
            authors: [],
          })
          .select("id")
          .single();

        if (paperError) {
          return NextResponse.json(
            { error: "Failed to create paper entry" },
            { status: 500, headers: corsHeaders() }
          );
        }
        finalPaperId = newPaper.id;
      }
    }

    if (!finalPaperId) {
      return NextResponse.json(
        { error: "No paper to save note to" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Save the note
    const { data: note, error: noteError } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        paper_id: finalPaperId,
        content,
        highlight_text: highlightText || null,
        note_type: noteType || "general",
        tags: tags || [],
      })
      .select("*")
      .single();

    if (noteError) {
      return NextResponse.json(
        { error: noteError.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      {
        paperId: finalPaperId,
        note,
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("Save note error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
