import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractTemplateDraft } from "@/lib/ai";

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
        { error: "Paste some experiment or protocol text first so AI has enough context." },
        { status: 400 },
      );
    }

    const draft = await extractTemplateDraft(sourceText.trim());
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Template assist error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate template draft.",
      },
      { status: 500 },
    );
  }
}
