import { createClient } from "@/lib/supabase/server";
import { IdeasClient } from "@/components/ideas-client";
import type { ResearchIdea, IdeaEntryWithSources, SavedPaper, NoteWithPaper } from "@/types";
import { redirect } from "next/navigation";

export default async function IdeasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=%2Fideas");
  }
  const userId = user.id;

  const [
    { data: ideas },
    { data: entries },
    { data: papers },
    { data: notes },
  ] = await Promise.all([
    supabase
      .from("research_ideas")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("idea_entries")
      .select("*, saved_papers(title, pmid), notes(content, highlight_text)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("saved_papers")
      .select("id, title, pmid, journal, authors, pub_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("notes")
      .select("*, saved_papers(title, pmid, journal)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="page-shell">
      <section className="section-card card-density-comfy">
        <IdeasClient
          ideas={(ideas as ResearchIdea[]) || []}
          entries={(entries as IdeaEntryWithSources[]) || []}
          papers={(papers as SavedPaper[]) || []}
          notes={(notes as NoteWithPaper[]) || []}
        />
      </section>
    </div>
  );
}
