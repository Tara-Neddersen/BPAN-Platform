/**
 * Resolve the best URL to display an article as full-text HTML.
 * Priority:
 * 1. PubMed Central full text (always free, good HTML)
 * 2. DOI URL (redirects to journal — may be open access)
 * 3. PubMed abstract page (always works, but just abstract)
 */
export async function resolveArticleUrl(
  doi: string | null,
  pmid: string
): Promise<{ url: string; source: "pmc" | "doi" | "pubmed" }> {
  // Try PMC first
  if (pmid) {
    const pmcUrl = await getPmcUrl(pmid);
    if (pmcUrl) {
      return { url: pmcUrl, source: "pmc" };
    }
  }

  // Use DOI (resolves to journal page)
  if (doi) {
    return { url: `https://doi.org/${doi}`, source: "doi" };
  }

  // Fallback to PubMed
  return {
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    source: "pubmed",
  };
}

async function getPmcUrl(pmid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${pmid}&format=json`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const record = data.records?.[0];
    if (record?.pmcid) {
      return `https://pmc.ncbi.nlm.nih.gov/articles/${record.pmcid}/`;
    }
    return null;
  } catch {
    return null;
  }
}
