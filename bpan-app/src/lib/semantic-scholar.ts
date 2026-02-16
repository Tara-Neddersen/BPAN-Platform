import type { Paper } from "@/types";

const S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch";
const S2_FIELDS = "citationCount,influentialCitationCount,tldr";

interface S2Paper {
  paperId: string | null;
  citationCount: number | null;
  influentialCitationCount: number | null;
  tldr: { text: string } | null;
}

/**
 * Enrich an array of Papers with Semantic Scholar metadata (citation counts, TLDR).
 * Uses the batch endpoint with PMID identifiers. Fails gracefully — if S2 is
 * unavailable or a paper isn't found, the original paper is returned unchanged.
 */
export async function enrichWithSemanticScholar(papers: Paper[]): Promise<Paper[]> {
  if (papers.length === 0) return papers;

  const ids = papers.map((p) => `PMID:${p.pmid}`);

  try {
    const res = await fetch(`${S2_BATCH_URL}?fields=${S2_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.warn(`Semantic Scholar batch API returned ${res.status}`);
      return papers;
    }

    const s2Papers: (S2Paper | null)[] = await res.json();

    return papers.map((paper, i) => {
      const s2 = s2Papers[i];
      if (!s2 || !s2.paperId) return paper;

      return {
        ...paper,
        citationCount: s2.citationCount ?? undefined,
        influentialCitationCount: s2.influentialCitationCount ?? undefined,
        tldr: s2.tldr?.text ?? undefined,
      };
    });
  } catch (err) {
    console.warn("Semantic Scholar enrichment failed:", err);
    return papers;
  }
}
