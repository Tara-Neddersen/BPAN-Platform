import { NextResponse } from "next/server";
import { structureNote, summarizeMeetingNotes } from "@/lib/ai";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ─── Meeting Summary ────────────────────────────────────
    if (body.action === "meeting_summary") {
      const { text, actionItems } = body;
      if (!text) {
        return NextResponse.json(
          { error: "Meeting notes text is required" },
          { status: 400, headers: corsHeaders() }
        );
      }
      const result = await summarizeMeetingNotes(text, actionItems || "");
      return NextResponse.json({ result }, { headers: corsHeaders() });
    }

    // ─── Original: Structure Note ───────────────────────────
    const {
      highlight,
      paperTitle,
      paperAbstract,
      authors,
      journal,
      pubDate,
    } = body;

    if (!highlight) {
      return NextResponse.json(
        { error: "Highlight text is required" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const result = await structureNote(
      highlight,
      paperTitle || "",
      paperAbstract || "",
      authors,
      journal,
      pubDate
    );

    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (err) {
    console.error("Note assist error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to structure note";
    const isRateLimit = message.includes("rate-limited") || message.includes("quota") || message.includes("429");
    return NextResponse.json(
      { error: isRateLimit ? "AI rate-limited — please wait 1-2 minutes and try again." : message },
      { status: isRateLimit ? 429 : 500, headers: corsHeaders() }
    );
  }
}
