import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const OPENROUTER_FREE_MODELS = [
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

async function callAI(prompt: string): Promise<string> {
  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (e) {
      console.warn("Gemini generation failed:", e);
    }
  }

  // Fallback to OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    for (const model of OPENROUTER_FREE_MODELS) {
      try {
        const res = await openrouter.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2000,
        });
        const text = res.choices[0]?.message?.content;
        if (text) return text;
      } catch (e) {
        console.warn(`OpenRouter ${model} failed:`, e);
      }
    }
  }

  throw new Error("No AI provider available");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, section } = await req.json();

    // Gather context from the user's data
    const [
      { data: context },
      { data: notes },
      { data: papers },
      { data: hypotheses },
      { data: experiments },
      { data: analyses },
      { data: ideas },
      { data: colonyExperiments },
      { data: colonyResults },
      { data: figures },
    ] = await Promise.all([
      supabase
        .from("research_context")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("notes")
        .select("content, note_type, highlight_text, saved_papers(title, journal)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("saved_papers")
        .select("title, authors, journal, pub_date, pmid")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("hypotheses")
        .select("title, description, status, evidence_for, evidence_against")
        .eq("user_id", user.id)
        .limit(10),
      supabase
        .from("experiments")
        .select("title, description, status, start_date, end_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("analyses")
        .select("name, test_type, results, ai_interpretation")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("research_ideas")
        .select("title, description, status")
        .eq("user_id", user.id)
        .eq("status", "promising")
        .limit(5),
      supabase
        .from("animal_experiments")
        .select("experiment_type, timepoint_age_days, status, scheduled_date, completed_date")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("colony_results")
        .select("experiment_type, timepoint_age_days, measures, recorded_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("figures")
        .select("name, chart_type, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    // Build context summary
    const contextStr = [
      context?.thesis_title ? `Thesis: ${context.thesis_title}` : "",
      context?.thesis_summary ? `Summary: ${context.thesis_summary}` : "",
      context?.aims?.length ? `Aims:\n${(context.aims as string[]).map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}` : "",
      context?.key_questions?.length ? `Key questions: ${(context.key_questions as string[]).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const notesStr = (notes || [])
      .slice(0, 15)
      .map(
        (n) => {
          const paper = (n as unknown as Record<string, unknown>).saved_papers as { title: string } | null;
          return `[${n.note_type}] ${n.content}${paper?.title ? ` (from: ${paper.title})` : ""}`;
        }
      )
      .join("\n");

    const papersStr = (papers || [])
      .map((p) => `- ${p.title} (${p.journal}, ${p.pub_date})`)
      .join("\n");

    const experimentsStr = (experiments || [])
      .map((e) => `- ${e.title} [${e.status}]${e.description ? `: ${e.description}` : ""}`)
      .join("\n");

    const analysesStr = (analyses || [])
      .map(
        (a) =>
          `- ${a.name}: ${a.ai_interpretation || JSON.stringify(a.results).slice(0, 200)}`
      )
      .join("\n");

    const colonyExpSummaryStr = (() => {
      const rows = (colonyExperiments || []) as Array<{
        experiment_type: string | null;
        timepoint_age_days: number | null;
        status: string | null;
        scheduled_date: string | null;
        completed_date: string | null;
      }>;
      if (!rows.length) return "";
      const counts = new Map<string, { completed: number; inProgress: number; scheduled: number; skipped: number; pending: number }>();
      for (const r of rows) {
        const key = `${String(r.experiment_type || "unknown")}::${r.timepoint_age_days == null ? "na" : String(r.timepoint_age_days)}`;
        const c = counts.get(key) || { completed: 0, inProgress: 0, scheduled: 0, skipped: 0, pending: 0 };
        const st = String(r.status || "pending");
        if (st === "completed") c.completed++;
        else if (st === "in_progress") c.inProgress++;
        else if (st === "scheduled") c.scheduled++;
        else if (st === "skipped") c.skipped++;
        else c.pending++;
        counts.set(key, c);
      }
      return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .slice(0, 40)
        .map(([key, c]) => {
          const [exp, tp] = key.split("::");
          const tpLabel = tp === "na" ? "" : ` @ ${tp}d`;
          return `- ${exp}${tpLabel}: ${c.completed} completed, ${c.inProgress} in progress, ${c.scheduled} scheduled, ${c.skipped} skipped`;
        })
        .join("\n");
    })();

    const colonyResultsSummaryStr = (() => {
      const rows = (colonyResults || []) as Array<{
        experiment_type: string | null;
        timepoint_age_days: number | null;
        measures: Record<string, unknown> | null;
      }>;
      if (!rows.length) return "";
      const grouped = new Map<string, { n: number; measureKeys: Set<string> }>();
      for (const r of rows) {
        const key = `${String(r.experiment_type || "unknown")}::${r.timepoint_age_days == null ? "na" : String(r.timepoint_age_days)}`;
        const g = grouped.get(key) || { n: 0, measureKeys: new Set<string>() };
        g.n += 1;
        if (r.measures && typeof r.measures === "object") {
          for (const [mk, mv] of Object.entries(r.measures)) {
            if (mk.startsWith("__")) continue;
            if (typeof mv === "number") g.measureKeys.add(mk);
          }
        }
        grouped.set(key, g);
      }
      return [...grouped.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .slice(0, 40)
        .map(([key, g]) => {
          const [exp, tp] = key.split("::");
          const tpLabel = tp === "na" ? "" : ` @ ${tp}d`;
          const measures = [...g.measureKeys].slice(0, 8).join(", ");
          return `- ${exp}${tpLabel}: ${g.n} result rows${measures ? ` | numeric measures: ${measures}` : ""}`;
        })
        .join("\n");
    })();

    const figuresStr = ((figures || []) as Array<{ name: string | null; chart_type: string | null; updated_at: string | null }>)
      .map((f) => `- ${f.name || "Untitled figure"}${f.chart_type ? ` [${f.chart_type}]` : ""}${f.updated_at ? ` (updated ${String(f.updated_at).slice(0, 10)})` : ""}`)
      .join("\n");

    const hypothesesStr = (hypotheses || [])
      .map(
        (h) =>
          `- ${h.title} [${h.status}]: ${h.description || ""}${
            (h.evidence_for as string[])?.length ? ` Evidence for: ${(h.evidence_for as string[]).join("; ")}` : ""
          }`
      )
      .join("\n");

    let prompt = "";

    if (type === "grant") {
      const SECTION_PROMPTS: Record<string, string> = {
        specific_aims: `Write a Specific Aims page for an NIH-style grant application. Include:
- A compelling opening paragraph about the problem and significance
- Long-term goal and overall objective
- The central hypothesis
- 2-3 specific aims with brief rationale
- A closing paragraph about expected outcomes and impact
Keep it to ~1 page. Use active voice and present tense.`,
        significance: `Write a Significance section for a grant application. Include:
- The importance of the problem
- How your work addresses gaps in knowledge
- How it will improve scientific understanding
- Clinical or translational implications
Write 2-3 strong paragraphs.`,
        innovation: `Write an Innovation section for a grant application. Include:
- Novel concepts or approaches
- Refinement or improvement of existing methods
- How this differs from prior work
Write 1-2 focused paragraphs.`,
        approach: `Write an Approach section outline for a grant application. Include:
- Preliminary data summary
- For each aim: rationale, experimental design, expected results, potential pitfalls and alternatives
This can be longer — aim for a structured outline with key details.`,
        abstract: `Write a project abstract (250 words max) for a grant application. Include:
- Background and significance
- Overall objective and hypothesis
- Specific aims
- Methods overview
- Expected outcomes and impact`,
      };

      prompt = `You are a grant writing expert for biomedical research. 

${SECTION_PROMPTS[section] || "Write a general grant section."}

Use the following research context and data:

RESEARCH CONTEXT:
${contextStr || "No research context provided."}

KEY PAPERS REVIEWED:
${papersStr || "No papers available."}

RESEARCH NOTES:
${notesStr || "No notes available."}

HYPOTHESES:
${hypothesesStr || "No hypotheses defined."}

EXPERIMENTS:
${experimentsStr || "No experiments planned."}

RESULTS:
${analysesStr || "No results available."}

Write in formal academic style. Be specific — use actual details from the research context above. Do NOT use placeholder text like "[insert here]" — instead use the real data provided.`;
    } else if (type === "lab_meeting") {
      prompt = `You are helping a biomedical researcher prepare a summary for their lab meeting.

PRIORITY RULES (IMPORTANT):
- Prioritize the user's OWN experimental work, results, analyses, and figures.
- Use papers/literature only as brief supporting context if needed.
- If experimental data exists, do NOT make literature review the main focus.
- Explicitly include a "Plots/Figures to show" section using the available analyses/figures/results context.

Generate a clear, well-organized lab meeting summary that covers:

1. **What I worked on this week** — recent experiments and their status
2. **Key findings** — any new results or observations
3. **Plots/Figures to show** — specific plots/analyses/figures to present and why
4. **Problems/challenges** — issues encountered and troubleshooting attempted
5. **Next steps** — what I plan to do next
6. **Questions for the group** — things I need input on

Use the following research data:

RESEARCH CONTEXT:
${contextStr || "No research context provided."}

OWN WORK — RECENT EXPERIMENTS (PRIMARY):
${experimentsStr || "No experiments logged."}

OWN WORK — COLONY EXPERIMENT TRACKER SUMMARY (PRIMARY):
${colonyExpSummaryStr || "No colony experiment tracker data."}

OWN WORK — COLONY RESULTS SUMMARY (PRIMARY):
${colonyResultsSummaryStr || "No colony result entries."}

OWN WORK — RECENT ANALYSES (PRIMARY):
${analysesStr || "No results available."}

OWN WORK — RECENT FIGURES/PLOTS (PRIMARY):
${figuresStr || "No saved figures yet."}

RECENT LAB/RESEARCH NOTES (SECONDARY):
${notesStr || "No notes available."}

PROMISING IDEAS (SECONDARY):
${(ideas || []).map((i) => `- ${i.title}: ${i.description || ""}`).join("\n") || "None"}

PAPERS/LITERATURE (BACKGROUND ONLY — mention briefly unless directly tied to current results):
${papersStr || "No papers available."}

Write in a casual-but-clear style. Use bullet points. Be concise — this should take 5-10 minutes to present.
Use actual data from above, not placeholders.
If there are no strong results yet, say that directly and propose the next concrete experiments/plots to generate.`;
    } else {
      return NextResponse.json(
        { error: "Unknown generation type" },
        { status: 400 }
      );
    }

    const text = await callAI(prompt);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("Generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
