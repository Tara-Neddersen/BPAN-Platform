import type { Paper } from "@/types";

interface WatchlistDigest {
  watchlistName: string;
  papers: Paper[];
}

/**
 * Render the daily digest email as an HTML string.
 */
export function renderDigestEmail(
  displayName: string,
  digests: WatchlistDigest[],
  date: string
): string {
  const totalPapers = digests.reduce((sum, d) => sum + d.papers.length, 0);

  const watchlistSections = digests
    .map((d) => {
      if (d.papers.length === 0) return "";

      const paperRows = d.papers
        .map((p) => {
          const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`;
          const authors =
            p.authors.length > 3
              ? `${p.authors.slice(0, 3).join(", ")} et al.`
              : p.authors.join(", ");
          const abstractSnippet =
            p.abstract.length > 200
              ? p.abstract.slice(0, 200) + "..."
              : p.abstract;

          return `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
                <a href="${pubmedUrl}" style="color: #111; text-decoration: none; font-weight: 600; font-size: 14px;">
                  ${escapeHtml(p.title)}
                </a>
                <div style="color: #666; font-size: 12px; margin-top: 4px;">
                  ${escapeHtml(authors)} &middot; ${escapeHtml(p.journal)} &middot; ${p.pubDate}
                </div>
                ${
                  abstractSnippet
                    ? `<div style="color: #444; font-size: 13px; margin-top: 6px; line-height: 1.5;">${escapeHtml(abstractSnippet)}</div>`
                    : ""
                }
                <div style="margin-top: 6px;">
                  <a href="${pubmedUrl}" style="color: #2563eb; font-size: 12px; text-decoration: none;">View on PubMed &rarr;</a>
                </div>
              </td>
            </tr>`;
        })
        .join("");

      return `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 16px; color: #111; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #111;">
            ${escapeHtml(d.watchlistName)} (${d.papers.length} new)
          </h2>
          <table style="width: 100%; border-collapse: collapse;">
            ${paperRows}
          </table>
        </div>`;
    })
    .filter(Boolean)
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111; background: #fff;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; margin-bottom: 24px;">
    <h1 style="font-size: 20px; margin: 0;">BPAN Platform</h1>
    <p style="color: #666; font-size: 14px; margin: 4px 0 0 0;">Daily Literature Digest &middot; ${escapeHtml(date)}</p>
  </div>

  <p style="font-size: 14px; color: #333;">
    Hi ${escapeHtml(displayName)}, here are <strong>${totalPapers} new paper${totalPapers !== 1 ? "s" : ""}</strong> matching your watchlists:
  </p>

  ${watchlistSections}

  ${
    totalPapers === 0
      ? '<p style="color: #666; font-size: 14px; text-align: center; padding: 20px 0;">No new papers found today. We\'ll check again tomorrow.</p>'
      : ""
  }

  <div style="text-align: center; padding: 20px 0; border-top: 1px solid #eee; margin-top: 24px;">
    <p style="color: #999; font-size: 12px;">
      You're receiving this because you have digest enabled in your BPAN Platform settings.
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type { WatchlistDigest };
