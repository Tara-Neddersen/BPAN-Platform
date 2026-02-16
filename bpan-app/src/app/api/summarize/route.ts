import { NextResponse } from "next/server";
import { summarizePaper } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const { title, abstract } = await request.json();

    if (!title || !abstract) {
      return NextResponse.json(
        { error: "Title and abstract are required" },
        { status: 400 }
      );
    }

    const summary = await summarizePaper(title, abstract);
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Summarize error:", err);
    const message = err instanceof Error ? err.message : "Failed to summarize";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
