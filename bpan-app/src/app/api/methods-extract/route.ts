import { NextResponse } from "next/server";
import { extractMethods } from "@/lib/ai";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(request: Request) {
  try {
    const { highlight, paperTitle, paperAbstract } = await request.json();

    if (!highlight) {
      return NextResponse.json(
        { error: "Highlight text is required" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const result = await extractMethods(
      highlight,
      paperTitle || "",
      paperAbstract || ""
    );

    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (err) {
    console.error("Methods extraction error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to extract methods";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders() }
    );
  }
}

