/**
 * Unified AI Context Builder
 * 
 * This module builds a shared research context string that is injected into
 * EVERY AI call across the platform. This gives all agents (scout, advisor,
 * note generator, meeting summarizer, etc.) full awareness of the user's
 * research state.
 */

import { createClient } from "@/lib/supabase/server";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContextOptions {
  /** Include full paper library? (default: true, but truncated) */
  includePapers?: boolean;
  /** Include notes? (default: true, but truncated) */
  includeNotes?: boolean;
  /** Include colony/experiment info? (default: true) */
  includeColony?: boolean;
  /** Include AI memories? (default: true) */
  includeMemories?: boolean;
  /** Include meetings? (default: false) */
  includeMeetings?: boolean;
  /** Include research ideas? (default: true) */
  includeIdeas?: boolean;
  /** Max total characters (approximate) — to stay within token limits */
  maxChars?: number;
}

export interface UnifiedContext {
  /** The assembled context string to inject into AI system prompts */
  contextString: string;
  /** Structured data for programmatic use */
  data: {
    userId: string;
    researchContext: Record<string, unknown> | null;
    memories: Array<{ category: string; content: string; confidence: string }>;
    hypotheses: Array<{ title: string; status: string; description: string }>;
    recentNotes: Array<{ content: string; noteType: string; paperTitle: string }>;
    savedPapers: Array<{ title: string; journal: string; authors: string[] }>;
    colonyStats: { cohorts: number; animals: number; pendingExperiments: number } | null;
    ideas: Array<{ title: string; status: string }>;
  };
}

// ─── Context Builder ────────────────────────────────────────────────────────

/**
 * Build unified AI context for a user. Call this from any AI endpoint.
 * Returns both a formatted string (for system prompts) and structured data.
 */
export async function buildUnifiedContext(
  userId: string,
  options: ContextOptions = {},
): Promise<UnifiedContext> {
  const {
    includePapers = true,
    includeNotes = true,
    includeColony = true,
    includeMemories = true,
    includeMeetings = false,
    includeIdeas = true,
    maxChars = 8000,
  } = options;

  const supabase = await createClient();
  const parts: string[] = [];

  // Track char budget
  let charsUsed = 0;
  const addSection = (text: string) => {
    if (charsUsed + text.length > maxChars) return false;
    parts.push(text);
    charsUsed += text.length;
    return true;
  };

  // ── 1. Research Context (always included, highest priority) ──
  const { data: rc } = await supabase
    .from("research_context")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (rc) {
    const rcParts: string[] = [];
    if (rc.thesis_title) rcParts.push(`Thesis: "${rc.thesis_title}"`);
    if (rc.thesis_summary) rcParts.push(`Summary: ${rc.thesis_summary}`);
    if (rc.aims?.length) rcParts.push(`Aims:\n${rc.aims.map((a: string, i: number) => `  ${i + 1}. ${a}`).join("\n")}`);
    if (rc.key_questions?.length) rcParts.push(`Open Questions:\n${rc.key_questions.map((q: string) => `  - ${q}`).join("\n")}`);
    if (rc.model_systems?.length) rcParts.push(`Model Systems: ${rc.model_systems.join(", ")}`);
    if (rc.key_techniques?.length) rcParts.push(`Key Techniques: ${rc.key_techniques.join(", ")}`);

    if (rcParts.length) {
      addSection(`\n--- RESEARCH CONTEXT ---\n${rcParts.join("\n")}`);
    }
  }

  // ── 2. AI Memories (pinned first, then recent — very high priority) ──
  let memories: Array<{ category: string; content: string; confidence: string }> = [];
  if (includeMemories) {
    const { data: pinnedMems } = await supabase
      .from("ai_memory")
      .select("category, content, confidence")
      .eq("user_id", userId)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: recentMems } = await supabase
      .from("ai_memory")
      .select("category, content, confidence")
      .eq("user_id", userId)
      .eq("is_pinned", false)
      .order("created_at", { ascending: false })
      .limit(30);

    memories = [...(pinnedMems || []), ...(recentMems || [])];

    if (memories.length > 0) {
      const grouped = new Map<string, string[]>();
      for (const m of memories) {
        if (!grouped.has(m.category)) grouped.set(m.category, []);
        grouped.get(m.category)!.push(`  • ${m.content} [${m.confidence}]`);
      }
      const memText = [...grouped.entries()]
        .map(([cat, items]) => `${cat.replace(/_/g, " ").toUpperCase()}:\n${items.join("\n")}`)
        .join("\n\n");
      addSection(`\n--- ACCUMULATED AI MEMORY (${memories.length} items) ---\n${memText}`);
    }
  }

  // ── 3. Hypotheses ──
  const { data: hypotheses } = await supabase
    .from("hypotheses")
    .select("title, status, description")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (hypotheses?.length) {
    const hypoText = hypotheses.map(h =>
      `  • [${h.status.toUpperCase()}] ${h.title}${h.description ? ` — ${h.description}` : ""}`
    ).join("\n");
    addSection(`\n--- HYPOTHESES ---\n${hypoText}`);
  }

  // ── 4. Colony Overview (with results data) ──
  let colonyStats = null;
  if (includeColony) {
    const [
      { count: cohortCount },
      { count: animalCount },
      { count: pendingExpCount },
      { count: completedExpCount },
    ] = await Promise.all([
      supabase.from("cohorts").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("animals").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
      supabase.from("animal_experiments").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["pending", "scheduled"]),
      supabase.from("animal_experiments").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    ]);

    colonyStats = {
      cohorts: cohortCount || 0,
      animals: animalCount || 0,
      pendingExperiments: pendingExpCount || 0,
    };

    if (colonyStats.cohorts > 0) {
      // Get upcoming experiments for the next 2 weeks
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

      const { data: upcomingExps } = await supabase
        .from("animal_experiments")
        .select("experiment_type, scheduled_date, animals(identifier, cohort_id)")
        .eq("user_id", userId)
        .in("status", ["pending", "scheduled"])
        .not("scheduled_date", "is", null)
        .lte("scheduled_date", twoWeeksFromNow.toISOString().split("T")[0])
        .order("scheduled_date")
        .limit(15);

      let colonyText = `Mouse Colony: ${colonyStats.cohorts} cohorts, ${colonyStats.animals} active animals, ${colonyStats.pendingExperiments} pending experiments, ${completedExpCount || 0} completed experiments`;
      if (upcomingExps?.length) {
        colonyText += `\nUpcoming (next 2 weeks): ${upcomingExps.map(e => `${e.experiment_type} for ${(e as Record<string, unknown>).animals ? ((e as Record<string, unknown>).animals as Record<string, unknown>).identifier : "?"} on ${e.scheduled_date}`).join("; ")}`;
      }

      // Add experiment results summary
      const { data: resultsSummary } = await supabase
        .from("colony_results")
        .select("experiment_type, timepoint_age_days, measures, animals(identifier, genotype, sex)")
        .eq("user_id", userId)
        .limit(100);

      if (resultsSummary?.length) {
        // Group by experiment type → timepoint to give a summary
        const resultGroups = new Map<string, { count: number; measureKeys: Set<string> }>();
        for (const r of resultsSummary) {
          const key = `${r.experiment_type}@${r.timepoint_age_days}d`;
          if (!resultGroups.has(key)) resultGroups.set(key, { count: 0, measureKeys: new Set() });
          const g = resultGroups.get(key)!;
          g.count++;
          if (r.measures && typeof r.measures === "object") {
            for (const k of Object.keys(r.measures as Record<string, unknown>)) {
              if (!k.startsWith("__")) g.measureKeys.add(k);
            }
          }
        }
        const resultSummaryText = [...resultGroups.entries()]
          .map(([key, g]) => `  ${key}: ${g.count} animals, measures: ${[...g.measureKeys].slice(0, 5).join(", ")}`)
          .join("\n");
        colonyText += `\nExperiment Results (${resultsSummary.length} data points):\n${resultSummaryText}`;
      }

      addSection(`\n--- COLONY STATUS ---\n${colonyText}`);
    }
  }

  // ── 5. Recent Notes ──
  let notesList: Array<{ content: string; noteType: string; paperTitle: string }> = [];
  if (includeNotes) {
    const { data: notes } = await supabase
      .from("notes")
      .select("content, note_type, saved_papers(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (notes?.length) {
      notesList = notes.map((n: Record<string, unknown>) => ({
        content: n.content as string,
        noteType: n.note_type as string,
        paperTitle: (n.saved_papers as Record<string, unknown>)?.title as string || "Unknown",
      }));
      const notesText = notesList.map(n =>
        `  • [${n.noteType}] ${n.content.slice(0, 150)}${n.content.length > 150 ? "..." : ""} — from "${n.paperTitle}"`
      ).join("\n");
      addSection(`\n--- RECENT RESEARCH NOTES ---\n${notesText}`);
    }
  }

  // ── 6. Paper Library ──
  let papersList: Array<{ title: string; journal: string; authors: string[] }> = [];
  if (includePapers) {
    const { data: papers } = await supabase
      .from("saved_papers")
      .select("title, journal, authors")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (papers?.length) {
      papersList = papers as Array<{ title: string; journal: string; authors: string[] }>;
      const papersText = papersList.map(p => {
        const auth = p.authors?.length > 2 ? `${p.authors[0]} et al.` : (p.authors || []).join(", ");
        return `  • "${p.title}" — ${auth}, ${p.journal || ""}`;
      }).join("\n");
      addSection(`\n--- PAPER LIBRARY (${papersList.length} recent) ---\n${papersText}`);
    }
  }

  // ── 7. Research Ideas ──
  let ideas: Array<{ title: string; status: string }> = [];
  if (includeIdeas) {
    const { data: ideasData } = await supabase
      .from("research_ideas")
      .select("title, status")
      .eq("user_id", userId)
      .in("status", ["exploring", "active", "promising"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (ideasData?.length) {
      ideas = ideasData as Array<{ title: string; status: string }>;
      const ideasText = ideas.map(i => `  • [${i.status}] ${i.title}`).join("\n");
      addSection(`\n--- ACTIVE RESEARCH IDEAS ---\n${ideasText}`);
    }
  }

  // ── 8. Recent Meeting Decisions ──
  if (includeMeetings) {
    const { data: meetings } = await supabase
      .from("meeting_notes")
      .select("title, ai_summary, meeting_date")
      .eq("user_id", userId)
      .order("meeting_date", { ascending: false })
      .limit(3);

    if (meetings?.length) {
      const meetText = meetings.map(m =>
        `  • ${m.title} (${m.meeting_date}): ${m.ai_summary ? m.ai_summary.slice(0, 200) + "..." : "No summary"}`
      ).join("\n");
      addSection(`\n--- RECENT MEETINGS ---\n${meetText}`);
    }
  }

  return {
    contextString: parts.join("\n"),
    data: {
      userId,
      researchContext: rc,
      memories,
      hypotheses: (hypotheses || []) as Array<{ title: string; status: string; description: string }>,
      recentNotes: notesList,
      savedPapers: papersList,
      colonyStats,
      ideas,
    },
  };
}

/**
 * Build a concise context string suitable for short AI calls
 * (summarization, note generation, etc.) — uses less tokens.
 */
export async function buildLightContext(userId: string): Promise<string> {
  const ctx = await buildUnifiedContext(userId, {
    includePapers: false,
    includeNotes: false,
    includeColony: false,
    includeMeetings: false,
    includeIdeas: false,
    includeMemories: true,
    maxChars: 2000,
  });
  return ctx.contextString;
}

/**
 * Extract key facts from an AI conversation and store them as memories.
 * Called after advisor chat responses.
 */
export async function extractAndStoreMemories(
  userId: string,
  userMessage: string,
  aiResponse: string,
  source: string,
): Promise<void> {
  // Only extract from substantive exchanges
  if (userMessage.length < 20 || aiResponse.length < 100) return;

  const supabase = await createClient();

  // Use a simple heuristic + AI to extract facts
  // For now, we'll use pattern matching for common fact patterns
  // In production, this would call AI to extract structured facts

  const memories: Array<{
    user_id: string;
    category: string;
    content: string;
    source: string;
    confidence: string;
    is_auto: boolean;
  }> = [];

  // Check for experimental findings
  const findingPatterns = [
    /(?:found|discovered|showed|demonstrated|revealed|observed)\s+(?:that\s+)?(.{20,200})/gi,
    /(?:key finding|important|notable|significant)\s*:?\s*(.{20,200})/gi,
    /(?:suggests? that|indicates? that|implies? that)\s+(.{20,150})/gi,
  ];

  for (const pattern of findingPatterns) {
    const matches = aiResponse.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 20) {
        memories.push({
          user_id: userId,
          category: "research_fact",
          content: match[1].trim().replace(/\s+/g, " ").slice(0, 300),
          source,
          confidence: "medium",
          is_auto: true,
        });
        break; // Only one per pattern to avoid noise
      }
    }
  }

  // Check for suggestions/recommendations
  const suggPatterns = [
    /(?:should|recommend|suggest|consider)\s+(.{20,200})/gi,
    /(?:next step|action item|to-do|follow up)\s*:?\s*(.{20,200})/gi,
  ];

  for (const pattern of suggPatterns) {
    const matches = aiResponse.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 20) {
        memories.push({
          user_id: userId,
          category: "goal",
          content: match[1].trim().replace(/\s+/g, " ").slice(0, 300),
          source,
          confidence: "low",
          is_auto: true,
        });
        break;
      }
    }
  }

  // Check for troubleshooting
  if (userMessage.toLowerCase().includes("problem") || userMessage.toLowerCase().includes("issue") ||
      userMessage.toLowerCase().includes("error") || userMessage.toLowerCase().includes("not working")) {
    const solutionPatterns = [
      /(?:solution|fix|resolve|try)\s*:?\s*(.{20,200})/gi,
      /(?:you can|you could|one approach)\s+(.{20,200})/gi,
    ];
    for (const pattern of solutionPatterns) {
      const matches = aiResponse.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          memories.push({
            user_id: userId,
            category: "troubleshooting",
            content: `Problem: ${userMessage.slice(0, 100)} → ${match[1].trim().slice(0, 200)}`,
            source,
            confidence: "medium",
            is_auto: true,
          });
          break;
        }
      }
    }
  }

  // Limit to avoid spam — max 3 memories per interaction
  const toInsert = memories.slice(0, 3);
  if (toInsert.length > 0) {
    const { error } = await supabase.from("ai_memory").insert(toInsert);
    if (error) {
      console.warn("Failed to store memories:", error);
    } else {
      console.log(`🧠 Stored ${toInsert.length} memories from ${source}`);
    }
  }
}

