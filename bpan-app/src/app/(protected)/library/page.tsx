import { createClient } from "@/lib/supabase/server";
import { SavedPaperCard } from "@/components/saved-paper-card";
import { unsavePaper } from "./actions";
import type { SavedPaper } from "@/types";

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: papers } = await supabase
    .from("saved_papers")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const typedPapers = (papers ?? []) as SavedPaper[];

  // Get note counts per paper
  const paperIds = typedPapers.map((p) => p.id);
  let noteCounts: Record<string, number> = {};
  if (paperIds.length > 0) {
    const { data: notes } = await supabase
      .from("notes")
      .select("paper_id")
      .eq("user_id", user!.id)
      .in("paper_id", paperIds);

    if (notes) {
      for (const note of notes) {
        noteCounts[note.paper_id] = (noteCounts[note.paper_id] || 0) + 1;
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground">
          Your saved papers. Click to read and annotate.
        </p>
      </div>

      {typedPapers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No saved papers yet. Search for papers and click &ldquo;Save&rdquo; to add them here.
          </p>
        </div>
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
    </div>
  );
}
