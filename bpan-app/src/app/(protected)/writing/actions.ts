"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callAI } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import type { PaperOutline, PaperOutlineSection } from "@/types";

function sanitizeSections(sections: PaperOutlineSection[]): PaperOutlineSection[] {
  return sections.map((section) => ({
    id: section.id,
    kind: section.kind === "figure" ? "figure" : "text",
    heading: String(section.heading || "").trim() || (section.kind === "figure" ? "Figure placeholder" : "Untitled section"),
    notes: String(section.notes || ""),
    linkedFigureId: section.linkedFigureId || null,
    plotRequest: String(section.plotRequest || ""),
  }));
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return { supabase, user };
}

export async function createPaperOutline(seed?: {
  title?: string;
  framing?: string;
  sections?: PaperOutlineSection[];
}) {
  const { supabase, user } = await requireUser();
  const sections = sanitizeSections(seed?.sections || []);
  const { data, error } = await supabase
    .from("paper_outlines")
    .insert({
      user_id: user.id,
      title: seed?.title?.trim() || "Untitled BPAN manuscript",
      framing: seed?.framing?.trim() || null,
      sections,
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/writing");
  return { success: true, outline: data as PaperOutline };
}

export async function updatePaperOutline(
  id: string,
  payload: { title: string; framing: string; sections: PaperOutlineSection[] }
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("paper_outlines")
    .update({
      title: payload.title.trim() || "Untitled BPAN manuscript",
      framing: payload.framing.trim() || null,
      sections: sanitizeSections(payload.sections),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/writing");
  return { success: true, outline: data as PaperOutline };
}

export async function deletePaperOutline(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("paper_outlines").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/writing");
  return { success: true };
}

export async function autoBuildPaperOutline() {
  const { supabase, user } = await requireUser();

  const [{ data: figures }, { data: analyses }, { data: context }] = await Promise.all([
    supabase
      .from("figures")
      .select("id, name, chart_type, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("analyses")
      .select("name, test_type, ai_interpretation")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("research_context")
      .select("thesis_title, thesis_summary")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const figureRows = (figures || []) as Array<{
    id: string;
    name: string;
    chart_type: string;
    updated_at: string;
  }>;
  const analysisRows = (analyses || []) as Array<{
    name: string;
    test_type: string;
    ai_interpretation: string | null;
  }>;

  let aiTitle = context?.thesis_title || "BPAN results manuscript";
  let aiFraming =
    context?.thesis_summary ||
    "A manuscript built from the current BPAN results, recent analyses, and saved figures.";

  const figureSummary = figureRows
    .map((figure) => `- ${figure.name} (${figure.chart_type})`)
    .join("\n");
  const analysisSummary = analysisRows
    .map((analysis) => `- ${analysis.name} [${analysis.test_type}]${analysis.ai_interpretation ? `: ${analysis.ai_interpretation}` : ""}`)
    .join("\n");

  try {
    const aiText = await callAI(
      "You help a neuroscience researcher turn current results into a manuscript outline. Return two lines only: first line starts with TITLE:, second line starts with FRAMING:.",
      `Thesis context: ${context?.thesis_title || "None"}\n${context?.thesis_summary || ""}\n\nFigures:\n${figureSummary || "None"}\n\nAnalyses:\n${analysisSummary || "None"}`,
      220
    );
    const titleLine = aiText.split("\n").find((line) => line.startsWith("TITLE:"));
    const framingLine = aiText.split("\n").find((line) => line.startsWith("FRAMING:"));
    if (titleLine) aiTitle = titleLine.replace("TITLE:", "").trim() || aiTitle;
    if (framingLine) aiFraming = framingLine.replace("FRAMING:", "").trim() || aiFraming;
  } catch {
    // Fall back to the heuristic outline if no provider is configured.
  }

  const sections: PaperOutlineSection[] = [
    {
      id: crypto.randomUUID(),
      kind: "text",
      heading: "Title / central claim",
      notes: "State the clearest one-sentence take-home message for this manuscript.",
      linkedFigureId: null,
      plotRequest: "",
    },
    {
      id: crypto.randomUUID(),
      kind: "text",
      heading: "Introduction / rationale",
      notes: "What gap does this paper close, and why do these experiments matter now?",
      linkedFigureId: null,
      plotRequest: "",
    },
    {
      id: crypto.randomUUID(),
      kind: "text",
      heading: "Results flow",
      notes: analysisRows.length
        ? analysisRows.map((analysis, index) => `${index + 1}. ${analysis.name}`).join("\n")
        : "List the sequence of results you want the paper to tell.",
      linkedFigureId: null,
      plotRequest: "",
    },
    ...figureRows.map((figure, index) => ({
      id: crypto.randomUUID(),
      kind: "figure" as const,
      heading: `Figure ${index + 1}: ${figure.name}`,
      notes: `Use or update this saved ${figure.chart_type} figure to support one key result panel.`,
      linkedFigureId: figure.id,
      plotRequest: `Refine ${figure.name} into a publication-ready panel. Specify cohorts, timepoints, labels, and stats.`,
    })),
    {
      id: crypto.randomUUID(),
      kind: "text",
      heading: "Discussion / next experiments",
      notes: "Interpret the result, note the caveats, and list the strongest follow-up experiment.",
      linkedFigureId: null,
      plotRequest: "",
    },
  ];

  const { data, error } = await supabase
    .from("paper_outlines")
    .insert({
      user_id: user.id,
      title: aiTitle,
      framing: aiFraming,
      sections: sanitizeSections(sections),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/writing");
  return { success: true, outline: data as PaperOutline };
}
