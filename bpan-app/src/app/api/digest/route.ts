import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchPubMedRecent } from "@/lib/pubmed";
import { sendEmail } from "@/lib/email";
import { renderDigestEmail, type WatchlistDigest } from "@/lib/digest-email-template";
import type { Profile, Watchlist } from "@/types";

/**
 * Daily digest endpoint. Triggered by cron (Vercel Cron or external).
 * Protected by DIGEST_CRON_SECRET header.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.DIGEST_CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // Get all users with digest enabled
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .eq("digest_enabled", true);

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ message: "No users with digest enabled", sent: 0 });
    }

    // Date range: last 24 hours in YYYY/MM/DD format (PubMed format)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const maxDate = formatPubMedDate(now);
    const minDate = formatPubMedDate(yesterday);
    const displayDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let sentCount = 0;
    const errors: string[] = [];

    for (const profile of profiles as Profile[]) {
      try {
        // Get user's watchlists
        const { data: watchlists } = await supabase
          .from("watchlists")
          .select("*")
          .eq("user_id", profile.id);

        if (!watchlists || watchlists.length === 0) continue;

        const typedWatchlists = watchlists as Watchlist[];

        // Search PubMed for each watchlist's keywords
        const digests: WatchlistDigest[] = [];

        for (const wl of typedWatchlists) {
          const query = wl.keywords.join(" OR ");
          const papers = await searchPubMedRecent(query, minDate, maxDate);
          digests.push({ watchlistName: wl.name, papers });
        }

        const totalPapers = digests.reduce((sum, d) => sum + d.papers.length, 0);

        // Skip sending if no new papers found
        if (totalPapers === 0) continue;

        // Send email
        if (profile.email) {
          const html = renderDigestEmail(
            profile.display_name || profile.email.split("@")[0],
            digests,
            displayDate
          );

          await sendEmail({
            to: profile.email,
            subject: `BPAN Digest: ${totalPapers} new paper${totalPapers !== 1 ? "s" : ""} — ${displayDate}`,
            html,
          });

          // Update last_digest_at
          await supabase
            .from("profiles")
            .update({ last_digest_at: now.toISOString() })
            .eq("id", profile.id);

          sentCount++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`User ${profile.id}: ${message}`);
      }
    }

    return NextResponse.json({
      message: `Digest complete`,
      sent: sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Digest error:", err);
    const message = err instanceof Error ? err.message : "Failed to run digest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatPubMedDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}
