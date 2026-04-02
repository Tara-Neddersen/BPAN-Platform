import { createClient } from "@/lib/supabase/server";
import { SavedPaperCard } from "@/components/saved-paper-card";
import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import { unsavePaper } from "./actions";
import type { SavedPaper } from "@/types";
import { redirect } from "next/navigation";

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=%2Flibrary");
  }
  const userId = user.id;

  const { data: papers } = await supabase
    .from("saved_papers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const typedPapers = (papers ?? []) as SavedPaper[];

  // Get note counts per paper
  const paperIds = typedPapers.map((p) => p.id);
  const noteCounts: Record<string, number> = {};
  if (paperIds.length > 0) {
    const { data: notes } = await supabase
      .from("notes")
      .select("paper_id")
      .eq("user_id", userId)
      .in("paper_id", paperIds);

    if (notes) {
      for (const note of notes) {
        noteCounts[note.paper_id] = (noteCounts[note.paper_id] || 0) + 1;
      }
    }
  }

  return (
    <div className="page-shell">
      <section className="section-card card-density-comfy space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          Your saved papers. Click to read and annotate.
        </p>
      </section>

      <section className="section-card card-density-comfy">
        {typedPapers.length === 0 ? (
          <WorkspaceEmptyState
            icon="library"
            title="No saved papers yet"
            description="Build your library by saving papers from the literature hub, then come back here to read, organize, and annotate them."
            primaryAction={{ label: "Open literature hub", href: "/dashboard" }}
            secondaryAction={{ label: "Scout fresh papers", href: "/scout" }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {typedPapers.map((paper) => (
              <SavedPaperCard
                key={paper.id}
                paper={paper}
                noteCount={noteCounts[paper.id] || 0}
                unsaveAction={unsavePaper}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
