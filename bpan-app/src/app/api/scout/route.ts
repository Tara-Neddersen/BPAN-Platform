import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPubMed } from "@/lib/pubmed";
import { scoutAnalyzePaper } from "@/lib/ai";
import { buildLightContext } from "@/lib/ai-context";

/**
 * POST /api/scout
 * Run the AI literature scout: searches PubMed for papers on each
 * of the user's watchlist keywords, AI-analyzes them, and stores findings.
 *
 * The scout aggressively paginates through PubMed results to find papers
 * that haven't been analyzed yet — even for niche topics with few total papers.
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

    let keywords: string[] = [];
    if (watchlists) {
      for (const w of watchlists) {
        if (Array.isArray(w.keywords)) {
          keywords = keywords.concat(w.keywords);
        }
      }
    }

    // Fallback defaults
    if (keywords.length === 0) {
      keywords = [
        "BPAN neurodegeneration",
        "WDR45 iron metabolism",
        "beta-propeller protein neurodegeneration",
        "neurodegeneration iron brain",
      ];
    }

    // 2. Build EXPANDED keyword list — add broader related terms
    // For each base keyword, generate additional search variations
    const expandedSearches: Array<{ query: string; keyword: string }> = [];
    for (const kw of keywords) {
      // Original keyword (exact)
      expandedSearches.push({ query: kw, keyword: kw });
      // Broader variations for niche terms
      const kwLower = kw.toLowerCase();
      if (kwLower === "bpan" || kwLower.includes("bpan")) {
        expandedSearches.push(
          { query: "BPAN beta-propeller protein-associated neurodegeneration", keyword: kw },
          { query: "BPAN autophagy", keyword: kw },
          { query: "BPAN WDR45 mutation", keyword: kw },
          { query: "neurodegeneration with brain iron accumulation BPAN", keyword: kw },
          { query: "NBIA BPAN", keyword: kw },
        );
      }
      if (kwLower === "wdr45" || kwLower.includes("wdr45")) {
        expandedSearches.push(
          { query: "WDR45 autophagy", keyword: kw },
          { query: "WDR45 mutation neurodegeneration", keyword: kw },
          { query: "WDR45 gene function", keyword: kw },
          { query: "WDR45 brain iron", keyword: kw },
          { query: "WDR45 WIPI4", keyword: kw },
        );
      }
      if (kwLower === "wipi4" || kwLower.includes("wipi4")) {
        expandedSearches.push(
          { query: "WIPI4 autophagy", keyword: kw },
          { query: "WIPI autophagosome", keyword: kw },
          { query: "WIPI4 WDR45", keyword: kw },
          { query: "WIPI protein phosphoinositide", keyword: kw },
        );
      }
    }

    // Deduplicate queries (keep first occurrence)
    const seenQueries = new Set<string>();
    const uniqueSearches = expandedSearches.filter(s => {
      const key = s.query.toLowerCase();
      if (seenQueries.has(key)) return false;
      seenQueries.add(key);
      return true;
    });

    // 3. Get existing PMIDs to avoid duplicates
    const { data: existingFindings } = await supabase
      .from("scout_findings")
      .select("pmid")
      .eq("user_id", user.id);

    const existingPmids = new Set(existingFindings?.map((f) => f.pmid) || []);

    const { data: savedPapers } = await supabase
      .from("saved_papers")
      .select("pmid")
      .eq("user_id", user.id);

    const savedPmids = new Set(savedPapers?.map((p) => p.pmid).filter(Boolean) || []);

    // 4. Get unified AI context
    const researchContext = await buildLightContext(user.id);

    // 5. Search & analyze — aggressively paginate to find unanalyzed papers
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

    let totalAnalyzed = 0;
    const globalSeenPmids = new Set<string>(); // Track PMIDs across all searches in this run

    // Track per-keyword stats for logging
    const keywordStats = new Map<string, { found: number; analyzed: number }>();

    for (const { query, keyword } of uniqueSearches) {
      if (totalAnalyzed >= maxPapers) break;

      if (!keywordStats.has(keyword)) {
        keywordStats.set(keyword, { found: 0, analyzed: 0 });
      }
      const stats = keywordStats.get(keyword)!;

      try {
        // Aggressively paginate: search up to 5 pages (100 papers) per query
        // to find papers that haven't been analyzed before
        const MAX_PAGES = 5;
        let foundNewForThisQuery = false;

        for (let page = 1; page <= MAX_PAGES; page++) {
          if (totalAnalyzed >= maxPapers) break;

          const result = await searchPubMed(query, page);
          const papers = result.papers;

          if (papers.length === 0) break; // No more results

          stats.found += papers.length;

          for (const paper of papers) {
            if (totalAnalyzed >= maxPapers) break;

            // Skip if no PMID, already analyzed, already saved, or seen in this run
            if (!paper.pmid) continue;
            if (existingPmids.has(paper.pmid) || savedPmids.has(paper.pmid)) continue;
            if (globalSeenPmids.has(paper.pmid)) continue;

            globalSeenPmids.add(paper.pmid);

            // Skip if no abstract
            if (!paper.abstract || paper.abstract.length < 50) continue;

            try {
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

              existingPmids.add(paper.pmid);
              stats.analyzed++;
              totalAnalyzed++;
              foundNewForThisQuery = true;

              // Small delay to respect API rate limits
              await new Promise((r) => setTimeout(r, 400));
            } catch (aiErr) {
              console.warn(`AI analysis failed for ${paper.pmid}:`, aiErr);
              continue;
            }
          }

          // If we found new papers on this page, we can stop paginating for this query
          // If not, keep paginating to find deeper results
          if (foundNewForThisQuery && totalAnalyzed >= Math.ceil(maxPapers / uniqueSearches.length)) {
            break;
          }

          // Brief delay between pages to respect PubMed rate limits
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch (searchErr) {
        console.warn(`PubMed search failed for "${query}":`, searchErr);
        continue;
      }
    }

    // 6. Log scout runs (one per original keyword)
    for (const [keyword, stats] of keywordStats.entries()) {
      await supabase.from("scout_runs").insert({
        user_id: user.id,
        keyword,
        papers_found: stats.found,
        papers_analyzed: stats.analyzed,
      });
    }

    // 7. Insert findings
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
