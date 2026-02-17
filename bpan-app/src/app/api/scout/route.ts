import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPubMed } from "@/lib/pubmed";
import { scoutAnalyzePaper } from "@/lib/ai";
import { buildLightContext } from "@/lib/ai-context";

/**
 * POST /api/scout
 * Run the AI literature scout: searches PubMed for recent papers on each
 * of the user's watchlist keywords, AI-analyzes them, and stores findings.
 *
 * Body: { maxPapers?: number }   (default 10 total, across all keywords)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const maxPapers = Math.min(body.maxPapers || 10, 20); // cap at 20

    // 1. Get user's watchlist keywords
    const { data: watchlists } = await supabase
      .from("watchlists")
      .select("keywords")
      .eq("user_id", user.id);

    // Flatten all keywords from all watchlists
    let keywords: string[] = [];
    if (watchlists) {
      for (const w of watchlists) {
        if (Array.isArray(w.keywords)) {
          keywords = keywords.concat(w.keywords);
        }
      }
    }

    // Fallback: if no watchlist, use BPAN-related defaults
    if (keywords.length === 0) {
      keywords = [
        "BPAN neurodegeneration",
        "WDR45 iron metabolism",
        "beta-propeller protein neurodegeneration",
        "neurodegeneration iron brain",
      ];
    }

    // 2. Get existing PMIDs to avoid duplicates
    const { data: existingFindings } = await supabase
      .from("scout_findings")
      .select("pmid")
      .eq("user_id", user.id);

    const existingPmids = new Set(existingFindings?.map((f) => f.pmid) || []);

    // 3. Also get existing saved papers to avoid duplicates
    const { data: savedPapers } = await supabase
      .from("saved_papers")
      .select("pmid")
      .eq("user_id", user.id);

    const savedPmids = new Set(savedPapers?.map((p) => p.pmid).filter(Boolean) || []);

    // 4. Get unified AI context (includes research context, memories, hypotheses, etc.)
    const researchContext = await buildLightContext(user.id);

    // 5. Search & analyze
    const findings: Array<{
      user_id: string;
      pmid: string;
      title: string;
      authors: string[];
      journal: string;
      pub_date: string;
      abstract: string;
      doi: string;
      ai_summary: string;
      ai_relevance: string;
      ai_ideas: string;
      relevance_score: number;
      matched_keyword: string;
    }> = [];

    const papersPerKeyword = Math.max(2, Math.ceil(maxPapers / keywords.length));
    let totalAnalyzed = 0;

    for (const keyword of keywords) {
      if (totalAnalyzed >= maxPapers) break;

      try {
        // Sort by date to get recent papers
        const result = await searchPubMed(`${keyword} AND ("last 30 days"[dp])`, 1);

        // If no recent papers, try without date filter but still get recent-ish
        const papers = result.papers.length > 0
          ? result.papers
          : (await searchPubMed(keyword, 1)).papers;

        let found = 0;
        for (const paper of papers) {
          if (found >= papersPerKeyword || totalAnalyzed >= maxPapers) break;

          // Skip duplicates
          if (!paper.pmid || existingPmids.has(paper.pmid) || savedPmids.has(paper.pmid)) {
            continue;
          }

          // Skip if no abstract
          if (!paper.abstract || paper.abstract.length < 50) continue;

          try {
            // AI analysis
            const analysis = await scoutAnalyzePaper(
              paper.title,
              paper.abstract,
              keyword,
              researchContext,
            );

            findings.push({
              user_id: user.id,
              pmid: paper.pmid,
              title: paper.title,
              authors: paper.authors,
              journal: paper.journal,
              pub_date: paper.pubDate,
              abstract: paper.abstract,
              doi: paper.doi || "",
              ai_summary: analysis.summary,
              ai_relevance: analysis.relevance,
              ai_ideas: analysis.ideas,
              relevance_score: analysis.relevance_score,
              matched_keyword: keyword,
            });

            existingPmids.add(paper.pmid); // Don't analyze same paper twice
            found++;
            totalAnalyzed++;

            // Small delay to respect API rate limits
            await new Promise((r) => setTimeout(r, 500));
          } catch (aiErr) {
            console.warn(`AI analysis failed for ${paper.pmid}:`, aiErr);
            continue;
          }
        }

        // Log scout run
        await supabase.from("scout_runs").insert({
          user_id: user.id,
          keyword,
          papers_found: papers.length,
          papers_analyzed: found,
        });

      } catch (searchErr) {
        console.warn(`PubMed search failed for "${keyword}":`, searchErr);
        continue;
      }
    }

    // 6. Insert findings
    if (findings.length > 0) {
      const { error } = await supabase.from("scout_findings").insert(findings);
      if (error) {
        console.error("Failed to insert scout findings:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      analyzed: totalAnalyzed,
      keywords: keywords.length,
    });

  } catch (err) {
    console.error("Scout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scout failed" },
      { status: 500 },
    );
  }
}

