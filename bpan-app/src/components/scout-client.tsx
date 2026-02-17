"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ScoutFinding, ScoutRun } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot, Sparkles, BookOpen, Star, SkipForward, Trash2,
  Search, RefreshCw, ArrowRight, ChevronDown, ChevronUp,
  Brain, Lightbulb, Save, Clock, Bookmark, Filter,
  ExternalLink, Loader2,
} from "lucide-react";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ScoutClientProps {
  findings: ScoutFinding[];
  runs: ScoutRun[];
  watchlistKeywords: string[];
  actions: {
    updateStatus: (id: string, status: string) => Promise<{ success?: boolean; error?: string }>;
    updateNotes: (id: string, notes: string) => Promise<{ success?: boolean; error?: string }>;
    deleteFinding: (id: string) => Promise<{ success?: boolean; error?: string }>;
    saveToPapers: (id: string) => Promise<{ success?: boolean; error?: string }>;
  };
}

type FilterTab = "new" | "saved" | "starred" | "skipped" | "all";

// ─── Helpers ────────────────────────────────────────────────────────────────

function RelevanceBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : score >= 25 ? "bg-orange-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{score}%</span>
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ScoutClient({ findings: initFindings, runs, watchlistKeywords, actions }: ScoutClientProps) {
  const router = useRouter();
  const [findings, setFindings] = useState(initFindings);
  const [filter, setFilter] = useState<FilterTab>("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [scouting, setScouting] = useState(false);
  const [scoutResult, setScoutResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ─── Stats ───────────────────────────────
  const stats = useMemo(() => ({
    new: findings.filter(f => f.status === "new").length,
    saved: findings.filter(f => f.status === "saved").length,
    starred: findings.filter(f => f.status === "starred").length,
    skipped: findings.filter(f => f.status === "skipped").length,
    total: findings.length,
  }), [findings]);

  // ─── Filtered Findings ───────────────────
  const filtered = useMemo(() => {
    let list = findings;
    if (filter !== "all") {
      list = list.filter(f => f.status === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f =>
        f.title.toLowerCase().includes(q) ||
        f.ai_summary?.toLowerCase().includes(q) ||
        f.matched_keyword?.toLowerCase().includes(q) ||
        f.journal?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [findings, filter, searchQuery]);

  // ─── Actions ─────────────────────────────
  const runScout = useCallback(async () => {
    setScouting(true);
    setScoutResult(null);
    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPapers: 10 }),
      });
      const data = await res.json();
      if (data.error) {
        setScoutResult(`Error: ${data.error}`);
      } else {
        setScoutResult(`Found & analyzed ${data.analyzed} new papers across ${data.keywords} keywords!`);
        router.refresh();
      }
    } catch (err) {
      setScoutResult(`Error: ${err instanceof Error ? err.message : "Scout failed"}`);
    } finally {
      setScouting(false);
    }
  }, [router]);

  const handleStatus = useCallback(async (id: string, status: string) => {
    setBusy(id);
    const result = await actions.updateStatus(id, status);
    if (result.success) {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, status: status as ScoutFinding["status"] } : f));
    }
    setBusy(null);
  }, [actions]);

  const handleSaveToPapers = useCallback(async (id: string) => {
    setBusy(id);
    const result = await actions.saveToPapers(id);
    if (result.success) {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, status: "saved" } : f));
    } else if (result.error) {
      alert(result.error);
    }
    setBusy(null);
  }, [actions]);

  const handleDelete = useCallback(async (id: string) => {
    setBusy(id);
    const result = await actions.deleteFinding(id);
    if (result.success) {
      setFindings(prev => prev.filter(f => f.id !== id));
    }
    setBusy(null);
  }, [actions]);

  const handleSaveNotes = useCallback(async (id: string) => {
    setBusy(id);
    const result = await actions.updateNotes(id, notesText);
    if (result.success) {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, user_notes: notesText } : f));
      setEditingNotesId(null);
    }
    setBusy(null);
  }, [actions, notesText]);

  // ─── Render ──────────────────────────────
  return (
    <div className="space-y-6">
      {/* ─── Run Scout Button ────────────── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-purple-500" />
                <h3 className="font-semibold">AI Literature Scout</h3>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Searches PubMed for recent papers matching your watchlist keywords, then AI reads and analyzes each one.
                {watchlistKeywords.length > 0 && (
                  <span className="block mt-1 text-xs">
                    Keywords: {watchlistKeywords.slice(0, 5).join(", ")}
                    {watchlistKeywords.length > 5 && ` +${watchlistKeywords.length - 5} more`}
                  </span>
                )}
              </p>
            </div>
            <Button
              onClick={runScout}
              disabled={scouting}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              {scouting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scouting papers...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run Scout Now
                </>
              )}
            </Button>
          </div>
          {scoutResult && (
            <div className={`mt-3 p-2 rounded text-sm ${scoutResult.startsWith("Error") ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"}`}>
              {scoutResult}
            </div>
          )}
          {scouting && (
            <div className="mt-3 text-xs text-muted-foreground">
              This may take 1-2 minutes. The AI is reading abstracts and writing analyses for each paper...
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Filter Tabs ────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "new" as FilterTab, label: "New", count: stats.new, icon: Sparkles },
          { key: "saved" as FilterTab, label: "Saved", count: stats.saved, icon: Bookmark },
          { key: "starred" as FilterTab, label: "Starred", count: stats.starred, icon: Star },
          { key: "skipped" as FilterTab, label: "Skipped", count: stats.skipped, icon: SkipForward },
          { key: "all" as FilterTab, label: "All", count: stats.total, icon: Filter },
        ].map(({ key, label, count, icon: Icon }) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(key)}
            className="gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <Badge variant="secondary" className="ml-1 text-[10px]">{count}</Badge>
          </Button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search findings..."
            className="pl-8 h-8 w-48"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ─── Findings Feed ──────────────── */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">
              {filter === "new" ? "No new findings" : `No ${filter} findings`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {stats.total === 0
                ? "Click 'Run Scout Now' to have AI discover and analyze papers for you."
                : "Try a different filter or run the scout again."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((finding) => {
            const isExpanded = expandedId === finding.id;
            const isBusy = busy === finding.id;

            return (
              <Card key={finding.id} className={`transition-all ${finding.status === "starred" ? "border-yellow-400/50" : ""}`}>
                <CardContent className="py-4">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : finding.id)}
                          className="flex-1 text-left"
                        >
                          <h3 className="font-semibold text-sm leading-tight hover:text-primary transition-colors">
                            {finding.title}
                          </h3>
                        </button>
                        {finding.status === "starred" && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        {finding.journal && <span>{finding.journal}</span>}
                        {finding.pub_date && <span>• {finding.pub_date}</span>}
                        {finding.matched_keyword && (
                          <Badge variant="outline" className="text-[10px]">{finding.matched_keyword}</Badge>
                        )}
                        <RelevanceBar score={finding.relevance_score} />
                      </div>
                    </div>

                    <button onClick={() => setExpandedId(isExpanded ? null : finding.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* AI Summary (always visible) */}
                  {finding.ai_summary && (
                    <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-md">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Brain className="h-3.5 w-3.5 text-purple-500" />
                        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">AI Summary</span>
                      </div>
                      <p className="text-sm">{finding.ai_summary}</p>
                    </div>
                  )}

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {/* Relevance */}
                      {finding.ai_relevance && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                          <div className="flex items-center gap-1.5 mb-1">
                            <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Why This Matters</span>
                          </div>
                          <p className="text-sm">{finding.ai_relevance}</p>
                        </div>
                      )}

                      {/* Ideas */}
                      {finding.ai_ideas && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Research Ideas</span>
                          </div>
                          <p className="text-sm">{finding.ai_ideas}</p>
                        </div>
                      )}

                      {/* Abstract */}
                      {finding.abstract && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                            Show Full Abstract
                          </summary>
                          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                            {finding.abstract}
                          </p>
                        </details>
                      )}

                      {/* User Notes */}
                      <div>
                        {editingNotesId === finding.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={notesText}
                              onChange={(e) => setNotesText(e.target.value)}
                              placeholder="Add your notes about this paper..."
                              className="text-sm h-20"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveNotes(finding.id)}
                                disabled={isBusy}
                              >
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingNotesId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => {
                              setEditingNotesId(finding.id);
                              setNotesText(finding.user_notes || "");
                            }}
                          >
                            {finding.user_notes
                              ? <>📝 {finding.user_notes}</>
                              : <>+ Add your notes</>
                            }
                          </button>
                        )}
                      </div>

                      {/* Links */}
                      <div className="flex gap-2">
                        {finding.pmid && (
                          <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${finding.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            PubMed <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {finding.doi && (
                          <a
                            href={`https://doi.org/${finding.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            DOI <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                    {finding.status === "new" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleSaveToPapers(finding.id)}
                          disabled={isBusy}
                        >
                          <BookOpen className="h-3.5 w-3.5" /> Save to Library
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleStatus(finding.id, "starred")}
                          disabled={isBusy}
                        >
                          <Star className="h-3.5 w-3.5" /> Star
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => handleStatus(finding.id, "skipped")}
                          disabled={isBusy}
                        >
                          <SkipForward className="h-3.5 w-3.5" /> Skip
                        </Button>
                      </>
                    )}
                    {finding.status === "starred" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleSaveToPapers(finding.id)}
                          disabled={isBusy}
                        >
                          <BookOpen className="h-3.5 w-3.5" /> Save to Library
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleStatus(finding.id, "new")}
                          disabled={isBusy}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Unstar
                        </Button>
                      </>
                    )}
                    {finding.status === "saved" && (
                      <Badge variant="secondary" className="gap-1.5">
                        <BookOpen className="h-3 w-3" /> In Library
                      </Badge>
                    )}
                    {finding.status === "skipped" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => handleStatus(finding.id, "new")}
                        disabled={isBusy}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Undo Skip
                      </Button>
                    )}
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(finding.id)}
                      disabled={isBusy}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Recent Scout Runs ──────────── */}
      {runs.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent Scout Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-1.5">
              {runs.slice(0, 10).map((run) => (
                <div key={run.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{run.keyword}</span>
                    {" — "}{run.papers_analyzed} analyzed out of {run.papers_found} found
                  </span>
                  <span>{formatDate(run.last_run_at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

