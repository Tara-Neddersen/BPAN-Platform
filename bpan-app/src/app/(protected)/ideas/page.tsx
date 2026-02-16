import { createClient } from "@/lib/supabase/server";
import { IdeasClient } from "@/components/ideas-client";
import type { ResearchIdea, IdeaEntryWithSources, SavedPaper, NoteWithPaper } from "@/types";

export default async function IdeasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: ideas },
    { data: entries },
    { data: papers },
    { data: notes },
  ] = await Promise.all([
    supabase
      .from("research_ideas")
      .select("*")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("idea_entries")
      .select("*, saved_papers(title, pmid), notes(content, highlight_text)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("saved_papers")
      .select("id, title, pmid, journal, authors, pub_date")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("notes")
      .select("*, saved_papers(title, pmid, journal)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <IdeasClient
      ideas={(ideas as ResearchIdea[]) || []}
      entries={(entries as IdeaEntryWithSources[]) || []}
      papers={(papers as SavedPaper[]) || []}
      notes={(notes as NoteWithPaper[]) || []}
    />
  );
}

