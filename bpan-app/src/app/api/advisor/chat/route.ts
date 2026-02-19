import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAdvisorResponse, generateConversationTitle } from "@/lib/advisor";
import type { AdvisorContext, ChatMessage, ColonyAnimalSummary, ColonyExperimentSummary, ColonyResultSummary } from "@/lib/advisor";
import type {
  ResearchContext,
  Hypothesis,
  NoteWithPaper,
  SavedPaper,
} from "@/types";
import { extractAndStoreMemories } from "@/lib/ai-context";

/**
 * POST /api/advisor/chat
 * Send a message and get an AI advisor response with full research context.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // 1. Fetch user's full research context in parallel (including AI memories)
    const [
      { data: researchContext },
      { data: hypotheses },
      { data: recentNotes },
      { data: savedPapers },
      { data: aiMemories },
    ] = await Promise.all([
      supabase
        .from("research_context")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("hypotheses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("*, saved_papers(title, pmid, journal)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("saved_papers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_memory")
        .select("category, content, confidence")
        .eq("user_id", user.id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    // Fetch colony data (animals, experiments, results) for full research awareness
    const [
      { data: colonyAnimalsRaw },
      { data: colonyExpsRaw },
      { data: colonyResultsRaw },
      { data: cohortsRaw },
    ] = await Promise.all([
      supabase.from("animals").select("identifier, sex, genotype, birth_date, status, cohort_id, cohorts(name)").eq("user_id", user.id).eq("status", "active").limit(200),
      supabase.from("animal_experiments").select("animal_id, experiment_type, timepoint_age_days, status, scheduled_date, completed_date, animals(identifier)").eq("user_id", user.id).limit(500),
      supabase.from("colony_results").select("animal_id, experiment_type, timepoint_age_days, measures, animals(identifier)").eq("user_id", user.id).limit(500),
      supabase.from("cohorts").select("id, name").eq("user_id", user.id),
    ]);

    const now = Date.now();
    const cohortNameMap = new Map((cohortsRaw || []).map((c: { id: string; name: string }) => [c.id, c.name]));

    const colonyAnimals: ColonyAnimalSummary[] = (colonyAnimalsRaw || []).map((a: Record<string, unknown>) => ({
      identifier: a.identifier as string,
      sex: a.sex as string,
      genotype: a.genotype as string,
      cohortName: (a.cohorts as { name: string } | null)?.name || cohortNameMap.get(a.cohort_id as string) || "Unknown",
      ageDays: Math.floor((now - new Date(a.birth_date as string).getTime()) / (1000 * 60 * 60 * 24)),
      status: a.status as string,
    }));

    const colonyExperiments: ColonyExperimentSummary[] = (colonyExpsRaw || []).map((e: Record<string, unknown>) => ({
      animalIdentifier: (e.animals as { identifier: string } | null)?.identifier || "?",
      experimentType: e.experiment_type as string,
      timepointDays: e.timepoint_age_days as number | null,
      status: e.status as string,
      scheduledDate: e.scheduled_date as string | null,
      completedDate: e.completed_date as string | null,
    }));

    const colonyResults: ColonyResultSummary[] = (colonyResultsRaw || [])
      .filter((r: Record<string, unknown>) => r.measures && typeof r.measures === "object")
      .map((r: Record<string, unknown>) => ({
        animalIdentifier: (r.animals as { identifier: string } | null)?.identifier || "?",
        experimentType: r.experiment_type as string,
        timepointDays: r.timepoint_age_days as number,
        measures: r.measures as Record<string, number | string | null>,
      }));

    const advisorContext: AdvisorContext = {
      researchContext: (researchContext as ResearchContext) || null,
      recentNotes: (recentNotes as NoteWithPaper[]) || [],
      savedPapers: (savedPapers as SavedPaper[]) || [],
      hypotheses: (hypotheses as Hypothesis[]) || [],
      aiMemories: (aiMemories as Array<{ category: string; content: string; confidence: string }>) || [],
      colonyAnimals,
      colonyExperiments,
      colonyResults,
    };

    // 2. Handle conversation — create or reuse
    let convId = conversationId;

    if (!convId) {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from("advisor_conversations")
        .insert({ user_id: user.id, title: "New conversation" })
        .select("id")
        .single();

      if (convError) throw convError;
      convId = newConv.id;

      // Auto-title in background (don't await)
      generateConversationTitle(message).then(async (title) => {
        const supa = await createClient();
        await supa
          .from("advisor_conversations")
          .update({ title })
          .eq("id", convId);
      }).catch(() => {});
    }

    // 3. Save user message
    await supabase.from("advisor_messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content: message,
    });

    // 4. Fetch conversation history
    const { data: history } = await supabase
      .from("advisor_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(20);

    const chatMessages: ChatMessage[] = (history || []).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // 5. Generate AI response
    const response = await generateAdvisorResponse(chatMessages, advisorContext);

    // 6. Save assistant message
    await supabase.from("advisor_messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "assistant",
      content: response,
    });

    // 7. Auto-extract key facts into AI memory (background, don't block response)
    extractAndStoreMemories(
      user.id,
      message,
      response,
      `advisor_chat:${convId}`,
    ).catch((err) => console.warn("Memory extraction failed:", err));

    return NextResponse.json({
      response,
      conversationId: convId,
    });
  } catch (err) {
    console.error("Advisor chat error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to get advisor response";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

