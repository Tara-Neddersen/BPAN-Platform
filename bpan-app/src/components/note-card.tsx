import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import type { NoteWithPaper } from "@/types";

const TYPE_COLORS: Record<string, string> = {
  finding: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  method: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  limitation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
};

interface NoteCardProps {
  note: NoteWithPaper;
}

export function NoteCard({ note }: NoteCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        {note.highlight_text && (
          <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950/30 rounded px-2 py-1 border border-yellow-200 dark:border-yellow-900">
            &ldquo;{note.highlight_text.length > 150
              ? note.highlight_text.slice(0, 150) + "..."
              : note.highlight_text}&rdquo;
          </div>
        )}

        <p className="text-sm leading-relaxed">{note.content}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[note.note_type] || TYPE_COLORS.general}`}
          >
            {note.note_type}
          </span>
          {note.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        <Link
          href={`/papers/${note.paper_id}`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileText className="h-3 w-3" />
          {note.saved_papers.title.length > 80
            ? note.saved_papers.title.slice(0, 80) + "..."
            : note.saved_papers.title}
        </Link>

        <p className="text-xs text-muted-foreground">
          {new Date(note.created_at).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}
