/**
 * Try multiple sources to find a free PDF URL for a paper.
 * 1. Unpaywall (checks open-access status by DOI)
 * 2. PubMed Central (many NIH-funded papers have free full text)
 * 3. Europe PMC (broader coverage)
 */
export async function findPdfUrl(
  doi: string | null,
  pmid?: string
): Promise<string | null> {
  // Try all sources in parallel for speed
  const results = await Promise.allSettled([
    doi ? findViaUnpaywall(doi) : Promise.resolve(null),
    pmid ? findViaPmc(pmid) : Promise.resolve(null),
    doi ? findViaEuropePmc(doi) : Promise.resolve(null),
  ]);

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }

  return null;
}

async function findViaUnpaywall(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=bpan-platform@research.app`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (data.best_oa_location?.url_for_pdf) {
      return data.best_oa_location.url_for_pdf;
    }
    if (data.oa_locations) {
      for (const loc of data.oa_locations) {
        if (loc.url_for_pdf) return loc.url_for_pdf;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function findViaPmc(pmid: string): Promise<string | null> {
  try {
    // Use NCBI ID converter to get PMC ID from PMID
    const res = await fetch(
      `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${pmid}&format=json`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const record = data.records?.[0];
    if (record?.pmcid) {
      // PMC has a direct PDF URL pattern
      return `https://www.ncbi.nlm.nih.gov/pmc/articles/${record.pmcid}/pdf/`;
    }
    return null;
  } catch {
    return null;
  }
}

async function findViaEuropePmc(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${encodeURIComponent(doi)}&format=json&resultType=core`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const result = data.resultList?.result?.[0];
    if (result?.fullTextUrlList?.fullTextUrl) {
      for (const urlObj of result.fullTextUrlList.fullTextUrl) {
        if (
          urlObj.documentStyle === "pdf" &&
          urlObj.availability === "Open access"
        ) {
          return urlObj.url;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
