"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, Search, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { NoteWithPaper } from "@/types";

interface SemanticResult extends NoteWithPaper {
  similarity: number;
}

export function SemanticSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SemanticResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const TYPE_COLORS: Record<string, string> = {
    finding: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    method: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    limitation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    general: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
  };

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/notes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Semantic search failed");
      }

      const data = await res.json();
      setResults(data.notes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to perform semantic search"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/notes/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backfill: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setBackfillResult(
          `Embedded ${data.embedded} of ${data.total} notes`
        );
      } else {
        setBackfillResult(data.error || "Backfill failed");
      }
    } catch {
      setBackfillResult("Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        <span className="font-medium">
          {expanded ? "Hide" : "Show"} semantic search
        </span>
        <span className="text-xs text-muted-foreground">
          — find notes by meaning (use specific phrases for best results)
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 rounded-lg border bg-primary/5 p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. &quot;biomarkers for early BPAN diagnosis&quot; or &quot;iron accumulation in neurons&quot;"
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={loading || !query.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" /> Searching...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" /> Search
                </>
              )}
            </Button>
          </form>

          {/* Backfill button for older notes */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={handleBackfill}
              disabled={backfilling}
            >
              {backfilling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {backfilling ? "Embedding..." : "Generate embeddings for older notes"}
            </Button>
            {backfillResult && (
              <span className="text-xs text-muted-foreground">{backfillResult}</span>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Semantic search results */}
          {results !== null && (
            <div className="space-y-3">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No semantically similar notes found. Try a different query or generate embeddings for your notes.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {results.length} semantically related note{results.length !== 1 ? "s" : ""}
                  </p>
                  {results.map((note) => (
                    <Card key={note.id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
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
                          <span className={`text-xs font-medium ${
                            note.similarity >= 0.7
                              ? "text-green-600 dark:text-green-400"
                              : note.similarity >= 0.55
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-muted-foreground"
                          }`}>
                            {Math.round(note.similarity * 100)}% match
                          </span>
                        </div>

                        {note.highlight_text && (
                          <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950/30 rounded px-2 py-1 border border-yellow-200 dark:border-yellow-900">
                            &ldquo;{note.highlight_text.length > 150
                              ? note.highlight_text.slice(0, 150) + "..."
                              : note.highlight_text}&rdquo;
                          </div>
                        )}

                        <p className="text-sm leading-relaxed">{note.content}</p>

                        <Link
                          href={`/papers/${note.paper_id}`}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          {note.saved_papers.title.length > 80
                            ? note.saved_papers.title.slice(0, 80) + "..."
                            : note.saved_papers.title}
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

