import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractProtocolDraft } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sourceText } = await request.json();
    if (typeof sourceText !== "string" || sourceText.trim().length < 20) {
      return NextResponse.json(
        { error: "Paste at least a short chunk of protocol text to use AI fill." },
        { status: 400 },
      );
    }

    const draft = await extractProtocolDraft(sourceText.trim());
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Protocol assist error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate protocol draft.",
      },
      { status: 500 },
    );
  }
}
