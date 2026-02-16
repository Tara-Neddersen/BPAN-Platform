"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, ChevronDown, ChevronUp, Quote, BookOpen, Sparkles, Loader2 } from "lucide-react";
import { SavePaperButton } from "@/components/save-paper-button";
import type { Paper } from "@/types";

interface PaperCardProps {
  paper: Paper;
  isSaved?: boolean;
  saveAction?: (formData: FormData) => Promise<void>;
  unsaveAction?: (formData: FormData) => Promise<void>;
}

export function PaperCard({ paper, isSaved = false, saveAction, unsaveAction }: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const authorsDisplay =
    paper.authors.length > 3
      ? `${paper.authors.slice(0, 3).join(", ")} et al.`
      : paper.authors.join(", ");

  const abstractSnippet =
    paper.abstract.length > 250 && !expanded
      ? paper.abstract.slice(0, 250) + "..."
      : paper.abstract;

  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`;
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null;

  async function handleSummarize() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: paper.title, abstract: paper.abstract }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSummaryError(data.error || "Failed to summarize");
      } else {
        setSummary(data.summary);
      }
    } catch {
      setSummaryError("Network error");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {paper.title}
          </CardTitle>
          <a
            href={pubmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{authorsDisplay}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {paper.journal && (
            <Badge variant="outline" className="text-xs">
              {paper.journal}
            </Badge>
          )}
          {paper.pubDate && (
            <span className="text-xs text-muted-foreground">{paper.pubDate}</span>
          )}
          {paper.pmid && (
            <span className="text-xs text-muted-foreground">PMID: {paper.pmid}</span>
          )}
          {paper.citationCount != null && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Quote className="h-3 w-3" />
              {paper.citationCount} citations
            </Badge>
          )}
          {paper.influentialCitationCount != null && paper.influentialCitationCount > 0 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <BookOpen className="h-3 w-3" />
              {paper.influentialCitationCount} influential
            </Badge>
          )}
        </div>

        {/* AI Summary */}
        {summary ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-xs font-medium text-primary mb-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI Summary
            </p>
            <p className="text-sm leading-relaxed">{summary}</p>
          </div>
        ) : paper.tldr ? (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">TL;DR</p>
            <p className="text-sm leading-relaxed">{paper.tldr}</p>
          </div>
        ) : null}

        {paper.abstract && (
          <div>
            <p className="text-sm leading-relaxed text-foreground/80">
              {abstractSnippet}
            </p>
            {paper.abstract.length > 250 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="mt-1 h-auto px-0 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? (
                  <>
                    Show less <ChevronUp className="ml-1 h-3 w-3" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="ml-1 h-3 w-3" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!summary && paper.abstract && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSummarize}
              disabled={summaryLoading}
              className="gap-1.5"
            >
              {summaryLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Summarizing...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Summarize
                </>
              )}
            </Button>
          )}
          {saveAction && unsaveAction && (
            <SavePaperButton
              paper={paper}
              isSaved={isSaved}
              saveAction={saveAction}
              unsaveAction={unsaveAction}
            />
          )}
          <Button asChild variant="outline" size="sm">
            <a href={pubmedUrl} target="_blank" rel="noopener noreferrer">
              PubMed
            </a>
          </Button>
          {doiUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={doiUrl} target="_blank" rel="noopener noreferrer">
                Full Text (DOI)
              </a>
            </Button>
          )}
        </div>

        {summaryError && (
          <p className="text-xs text-destructive">{summaryError}</p>
        )}
      </CardContent>
    </Card>
  );
}
