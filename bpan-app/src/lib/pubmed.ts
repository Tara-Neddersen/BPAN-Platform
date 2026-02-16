import type { Paper, PubMedSearchResult } from "@/types";
import { enrichWithSemanticScholar } from "@/lib/semantic-scholar";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const RESULTS_PER_PAGE = 20;

interface ESearchResult {
  esearchresult: {
    count: string;
    idlist: string[];
  };
}

/**
 * Search PubMed and return typed Paper objects with metadata.
 */
export async function searchPubMed(
  query: string,
  page: number = 1
): Promise<PubMedSearchResult> {
  if (!query.trim()) {
    return { papers: [], totalCount: 0, query };
  }

  const retstart = (page - 1) * RESULTS_PER_PAGE;

  // Step 1: esearch — get PMIDs matching the query
  const searchUrl = `${BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${RESULTS_PER_PAGE}&retstart=${retstart}&retmode=json&sort=date`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(`PubMed search failed: ${searchRes.statusText}`);
  }
  const searchData: ESearchResult = await searchRes.json();
  const { count, idlist } = searchData.esearchresult;

  if (idlist.length === 0) {
    return { papers: [], totalCount: parseInt(count, 10), query };
  }

  // Step 2: efetch — get full metadata for those PMIDs (XML)
  const fetchUrl = `${BASE_URL}/efetch.fcgi?db=pubmed&id=${idlist.join(",")}&retmode=xml`;
  const fetchRes = await fetch(fetchUrl);
  if (!fetchRes.ok) {
    throw new Error(`PubMed fetch failed: ${fetchRes.statusText}`);
  }
  const xml = await fetchRes.text();

  // Step 3: Parse XML into Paper objects
  const papers = parsePubMedXml(xml);

  // Step 4: Enrich with Semantic Scholar metadata (citation counts, TLDR)
  const enrichedPapers = await enrichWithSemanticScholar(papers);

  return {
    papers: enrichedPapers,
    totalCount: parseInt(count, 10),
    query,
  };
}

/**
 * Parse PubMed efetch XML into Paper objects.
 * Uses regex-based parsing to avoid needing an XML library.
 */
function parsePubMedXml(xml: string): Paper[] {
  const papers: Paper[] = [];

  // Split by <PubmedArticle> blocks
  const articleBlocks = xml.split("<PubmedArticle>");

  for (let i = 1; i < articleBlocks.length; i++) {
    const block = articleBlocks[i];

    const pmid = extractTag(block, "PMID") || "";
    const title = cleanText(extractTag(block, "ArticleTitle") || "No title");
    const abstractText = extractAbstract(block);
    const journal = extractTag(block, "Title") || extractTag(block, "ISOAbbreviation") || "";
    const doi = extractDoi(block);
    const authors = extractAuthors(block);
    const pubDate = extractPubDate(block);

    papers.push({
      pmid,
      title,
      authors,
      journal,
      pubDate,
      abstract: abstractText,
      doi,
    });
  }

  return papers;
}

function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, "s");
  const match = xml.match(regex);
  return match ? stripTags(match[1].trim()) : null;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function cleanText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function extractAbstract(block: string): string {
  const abstractMatch = block.match(/<Abstract>(.*?)<\/Abstract>/s);
  if (!abstractMatch) return "";

  const abstractBlock = abstractMatch[1];
  const textParts: string[] = [];
  const regex = /<AbstractText[^>]*>(.*?)<\/AbstractText>/gs;
  let match;
  while ((match = regex.exec(abstractBlock)) !== null) {
    const labelMatch = match[0].match(/Label="([^"]+)"/);
    const label = labelMatch ? labelMatch[1] + ": " : "";
    textParts.push(label + stripTags(match[1].trim()));
  }

  return cleanText(textParts.join(" ") || stripTags(abstractBlock.trim()));
}

function extractAuthors(block: string): string[] {
  const authors: string[] = [];
  const authorListMatch = block.match(/<AuthorList[^>]*>(.*?)<\/AuthorList>/s);
  if (!authorListMatch) return authors;

  const regex = /<Author[^>]*>(.*?)<\/Author>/gs;
  let match;
  while ((match = regex.exec(authorListMatch[1])) !== null) {
    const lastName = extractTag(match[1], "LastName") || "";
    const initials = extractTag(match[1], "Initials") || "";
    if (lastName) {
      authors.push(`${lastName} ${initials}`.trim());
    }
  }
  return authors;
}

function extractPubDate(block: string): string {
  // Try PubMedPubDate with status="pubmed" first, then ArticleDate, then PubDate
  const pubmedDateMatch = block.match(
    /<PubMedPubDate PubStatus="pubmed">(.*?)<\/PubMedPubDate>/s
  );
  const dateBlock =
    pubmedDateMatch?.[1] ||
    block.match(/<ArticleDate[^>]*>(.*?)<\/ArticleDate>/s)?.[1] ||
    block.match(/<PubDate>(.*?)<\/PubDate>/s)?.[1] ||
    "";

  const year = extractTag(dateBlock, "Year") || "";
  const month = extractTag(dateBlock, "Month") || "";
  const day = extractTag(dateBlock, "Day") || "";

  if (!year) return "";
  const parts = [year];
  if (month) parts.push(month.padStart(2, "0"));
  if (day) parts.push(day.padStart(2, "0"));
  return parts.join("-");
}

function extractDoi(block: string): string | null {
  const doiMatch = block.match(
    /<ArticleId IdType="doi">(.*?)<\/ArticleId>/s
  );
  return doiMatch ? doiMatch[1].trim() : null;
}

/**
 * Search PubMed for recent papers within a date range (for daily digest).
 * Returns up to `maxResults` papers without pagination.
 */
export async function searchPubMedRecent(
  query: string,
  minDate: string,
  maxDate: string,
  maxResults: number = 50
): Promise<Paper[]> {
  if (!query.trim()) return [];

  const searchUrl = `${BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=date&datetype=edat&mindate=${minDate}&maxdate=${maxDate}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];

  const searchData: ESearchResult = await searchRes.json();
  const { idlist } = searchData.esearchresult;
  if (idlist.length === 0) return [];

  const fetchUrl = `${BASE_URL}/efetch.fcgi?db=pubmed&id=${idlist.join(",")}&retmode=xml`;
  const fetchRes = await fetch(fetchUrl);
  if (!fetchRes.ok) return [];

  const xml = await fetchRes.text();
  return parsePubMedXml(xml);
}

export { RESULTS_PER_PAGE };
