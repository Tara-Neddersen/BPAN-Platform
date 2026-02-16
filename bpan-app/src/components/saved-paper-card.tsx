import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Trash2 } from "lucide-react";
import type { SavedPaper } from "@/types";

interface SavedPaperCardProps {
  paper: SavedPaper;
  noteCount: number;
  unsaveAction: (formData: FormData) => Promise<void>;
}

export function SavedPaperCard({ paper, noteCount, unsaveAction }: SavedPaperCardProps) {
  const authorsDisplay =
    paper.authors.length > 3
      ? `${paper.authors.slice(0, 3).join(", ")} et al.`
      : paper.authors.join(", ");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {paper.title}
          </CardTitle>
          <form action={unsaveAction}>
            <input type="hidden" name="pmid" value={paper.pmid} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
        <div className="text-sm text-muted-foreground">
          {authorsDisplay}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {paper.journal && (
            <Badge variant="outline" className="text-xs">{paper.journal}</Badge>
          )}
          {paper.pub_date && (
            <span className="text-xs text-muted-foreground">{paper.pub_date}</span>
          )}
          <span className="text-xs text-muted-foreground">PMID: {paper.pmid}</span>
          {noteCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {noteCount} note{noteCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {paper.abstract && (
          <p className="text-sm leading-relaxed text-foreground/80 line-clamp-3">
            {paper.abstract}
          </p>
        )}

        <Button asChild size="sm" className="w-full gap-2">
          <Link href={`/papers/${paper.id}`}>
            <BookOpen className="h-3.5 w-3.5" />
            Read & Annotate
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
