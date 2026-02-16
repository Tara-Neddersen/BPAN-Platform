import { PaperCard } from "@/components/paper-card";
import type { Paper } from "@/types";

interface PaperListProps {
  papers: Paper[];
  savedPmids?: Set<string>;
  saveAction?: (formData: FormData) => Promise<void>;
  unsaveAction?: (formData: FormData) => Promise<void>;
}

export function PaperList({ papers, savedPmids, saveAction, unsaveAction }: PaperListProps) {
  if (papers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No papers found for this query.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {papers.map((paper) => (
        <PaperCard
          key={paper.pmid}
          paper={paper}
          isSaved={savedPmids?.has(paper.pmid) ?? false}
          saveAction={saveAction}
          unsaveAction={unsaveAction}
        />
      ))}
    </div>
  );
}
