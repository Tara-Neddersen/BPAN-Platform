import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callAI } from "@/lib/ai";

type MemberOption = {
  memberId: string;
  userId: string;
  label: string;
  email: string | null;
};

type ExtractedAction = {
  text: string;
  category: "general" | "inspection";
  responsibleMemberId: string | null;
  responsibleLabel: string | null;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveResponsibleMember(name: string | null | undefined, members: MemberOption[]): { memberId: string | null; label: string | null } {
  const raw = String(name || "").trim();
  if (!raw) return { memberId: null, label: null };
  const needle = normalize(raw);

  const exact = members.find((member) => {
    const labels = [member.label, member.email || ""].map((item) => normalize(item));
    return labels.some((label) => label && label === needle);
  });
  if (exact) return { memberId: exact.memberId, label: exact.label };

  const partial = members.find((member) => {
    const labels = [member.label, member.email || ""].map((item) => normalize(item));
    return labels.some((label) => label && (label.includes(needle) || needle.includes(label)));
  });
  if (partial) return { memberId: partial.memberId, label: partial.label };

  return { memberId: null, label: raw };
}

function parseExtractedItems(raw: string): Array<{ text: string; category: "general" | "inspection"; responsible: string | null }> {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = String(row.text || "").trim();
      if (!text) return null;
      const category = row.category === "inspection" ? "inspection" : "general";
      const responsibleRaw = typeof row.responsible === "string" ? row.responsible.trim() : "";
      return {
        text,
        category,
        responsible: responsibleRaw || null,
      };
    })
    .filter((item): item is { text: string; category: "general" | "inspection"; responsible: string | null } => Boolean(item));
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: string;
      labId?: string;
      text?: string;
      actionItems?: string;
    };

    const labId = String(body.labId || "").trim();
    const text = String(body.text || "").trim();
    const action = String(body.action || "").trim();

    if (!labId) {
      return NextResponse.json({ error: "Lab id is required." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Meeting transcript/notes are required." }, { status: 400 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("lab_members")
      .select("id")
      .eq("lab_id", labId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message || "Unable to verify lab access." }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ error: "You do not have access to this lab." }, { status: 403 });
    }

    if (action === "meeting_summary") {
      const actionItems = String(body.actionItems || "").trim();
      const summaryPrompt = [
        "You are the Lab AI API for a research lab operations platform.",
        "Summarize this lab meeting with practical next steps for the team.",
        "Use concise markdown with sections:",
        "## Key Discussion Points",
        "## Decisions",
        "## Action Items",
        "## Follow-up Risks",
        actionItems ? `\nCurrent action items:\n${actionItems}` : "",
        `\nMeeting transcript/notes:\n${text}`,
      ].join("\n");

      const result = await callAI(
        "You are a precise lab operations assistant. Focus on actionable outcomes and avoid generic fluff.",
        summaryPrompt,
        700,
      );

      return NextResponse.json({ result });
    }

    if (action === "extract_actions") {
      const { data: labMembers, error: membersError } = await supabase
        .from("lab_members")
        .select("id,user_id,display_title,is_active")
        .eq("lab_id", labId)
        .eq("is_active", true);

      if (membersError) {
        return NextResponse.json({ error: membersError.message || "Could not load lab members." }, { status: 500 });
      }

      const userIds = (labMembers || []).map((row) => String(row.user_id)).filter(Boolean);
      const serviceSupabase = createServiceClient();
      const { data: profiles } = userIds.length
        ? await serviceSupabase.from("profiles").select("id,display_name,email").in("id", userIds)
        : { data: [] as Array<{ id: string; display_name: string | null; email: string | null }> };

      const profileMap = new Map<string, { displayName: string | null; email: string | null }>();
      for (const profile of profiles || []) {
        profileMap.set(String(profile.id), {
          displayName: typeof profile.display_name === "string" ? profile.display_name : null,
          email: typeof profile.email === "string" ? profile.email : null,
        });
      }

      const members: MemberOption[] = (labMembers || []).map((row) => {
        const profile = profileMap.get(String(row.user_id));
        const label =
          (typeof row.display_title === "string" && row.display_title.trim().length > 0
            ? row.display_title.trim()
            : profile?.displayName?.trim()) ||
          profile?.email ||
          "Lab member";
        return {
          memberId: String(row.id),
          userId: String(row.user_id),
          label,
          email: profile?.email || null,
        };
      });

      const roster = members.map((member) => `- ${member.label}${member.email ? ` (${member.email})` : ""}`).join("\n");

      const extractionPrompt = [
        "Extract all actionable tasks from this lab meeting.",
        "Return ONLY a valid JSON array.",
        "Each item must be:",
        '{"text":"short task","category":"general|inspection","responsible":"person name or null"}',
        "Rules:",
        "- category=inspection only for safety/compliance/inspection/facility checks.",
        "- category=general for all other tasks.",
        "- responsible should be a person name only when clearly mentioned.",
        "- If unclear, set responsible to null.",
        "- Do not include completed/history-only statements.",
        "Lab members:",
        roster || "- No members listed",
        "Meeting transcript/notes:",
        text,
      ].join("\n");

      const aiRaw = await callAI(
        "You are the Lab AI API that extracts actionable lab tasks from meeting transcripts.",
        extractionPrompt,
        700,
      );

      let parsed: Array<{ text: string; category: "general" | "inspection"; responsible: string | null }> = [];
      try {
        parsed = parseExtractedItems(aiRaw);
      } catch {
        parsed = [];
      }

      const items: ExtractedAction[] = parsed.map((item) => {
        const resolved = resolveResponsibleMember(item.responsible, members);
        return {
          text: item.text,
          category: item.category,
          responsibleMemberId: resolved.memberId,
          responsibleLabel: resolved.label,
        };
      });

      return NextResponse.json({ items });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lab meeting assist failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
