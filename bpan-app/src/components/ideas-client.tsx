"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  Pencil,
  Lightbulb,
  Search as SearchIcon,
  FileText,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Link2,
} from "lucide-react";
import {
  createIdea,
  updateIdea,
  updateIdeaStatus,
  deleteIdea,
  linkPaperToIdea,
  unlinkPaperFromIdea,
  addIdeaEntry,
  deleteIdeaEntry,
} from "@/app/(protected)/ideas/actions";
import type { ResearchIdea, IdeaEntryWithSources, SavedPaper, NoteWithPaper } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  exploring: { label: "Exploring", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", emoji: "🔍" },
  promising: { label: "Promising", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", emoji: "✨" },
  dead_end: { label: "Dead End", color: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400", emoji: "🚫" },
  incorporated: { label: "Incorporated", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", emoji: "✅" },
};

const ENTRY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  finding: { label: "Finding", icon: <Lightbulb className="h-3 w-3" />, color: "border-l-green-500" },
  question: { label: "Question", icon: <HelpCircle className="h-3 w-3" />, color: "border-l-blue-500" },
  thought: { label: "Thought", icon: <MessageSquare className="h-3 w-3" />, color: "border-l-yellow-500" },
  contradiction: { label: "Contradiction", icon: <AlertTriangle className="h-3 w-3" />, color: "border-l-red-500" },
  next_step: { label: "Next Step", icon: <ArrowRight className="h-3 w-3" />, color: "border-l-purple-500" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  ideas: ResearchIdea[];
  entries: IdeaEntryWithSources[];
  papers: SavedPaper[];
  notes: NoteWithPaper[];
}

export function IdeasClient({ ideas, entries, papers, notes }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ResearchIdea | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = ideas.filter((idea) => {
    if (filter !== "all" && idea.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        idea.title.toLowerCase().includes(q) ||
        idea.description?.toLowerCase().includes(q) ||
        idea.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Stats
  const counts = {
    exploring: ideas.filter((i) => i.status === "exploring").length,
    promising: ideas.filter((i) => i.status === "promising").length,
    incorporated: ideas.filter((i) => i.status === "incorporated").length,
    dead_end: ideas.filter((i) => i.status === "dead_end").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Research Ideas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capture ideas, track what you learn, connect the dots across papers.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Idea
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(STATUS_CONFIG).map(([key, { label, emoji }]) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? "all" : key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            }`}
          >
            {emoji} {label} ({counts[key as keyof typeof counts]})
          </button>
        ))}
        {filter !== "all" && (
          <button
            onClick={() => setFilter("all")}
            className="text-xs px-3 py-1.5 rounded-full border hover:bg-accent"
          >
            Show all ({ideas.length})
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ideas by title, description, or tags..."
          className="pl-9"
        />
      </div>

      {/* New/Edit form */}
      {(showNew || editingIdea) && (
        <IdeaForm
          idea={editingIdea}
          onClose={() => { setShowNew(false); setEditingIdea(null); }}
        />
      )}

      {/* Ideas list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="font-medium mb-1">
            {ideas.length === 0 ? "No research ideas yet" : "No ideas match your filter"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {ideas.length === 0
              ? "Start by creating an idea manually, or save a suggestion from the AI Research Advisor."
              : "Try adjusting your filters or search terms."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              entries={entries.filter((e) => e.idea_id === idea.id)}
              papers={papers}
              notes={notes}
              onEdit={() => setEditingIdea(idea)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Idea Form ───────────────────────────────────────────────────────────────

function IdeaForm({ idea, onClose }: { idea: ResearchIdea | null; onClose: () => void }) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      if (idea) {
        formData.set("id", idea.id);
        await updateIdea(formData);
      } else {
        await createIdea(formData);
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium mb-1 block">What&apos;s the idea? *</label>
            <Input name="title" defaultValue={idea?.title || ""} required placeholder="e.g. Could WDR45 affect mitophagy through PINK1/Parkin?" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium mb-1 block">Why is this interesting?</label>
            <textarea
              name="description"
              defaultValue={idea?.description || ""}
              placeholder="What made you think of this? Why might it matter for your research?"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-20"
            />
          </div>
          {idea && (
            <div>
              <label className="text-xs font-medium mb-1 block">Status</label>
              <select name="status" defaultValue={idea.status} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="exploring">🔍 Exploring</option>
                <option value="promising">✨ Promising</option>
                <option value="dead_end">🚫 Dead End</option>
                <option value="incorporated">✅ Incorporated</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium mb-1 block">Priority</label>
            <select name="priority" defaultValue={idea?.priority || "medium"} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Related Aim</label>
            <Input name="aim" defaultValue={idea?.aim || ""} placeholder="e.g. Aim 2" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Tags</label>
            <Input name="tags" defaultValue={idea?.tags?.join(", ") || ""} placeholder="autophagy, mitophagy, WDR45" />
          </div>
          {!idea && <input type="hidden" name="source" value="manual" />}
          <div className="sm:col-span-2 flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {idea ? "Update" : "Create Idea"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Idea Card ───────────────────────────────────────────────────────────────

function IdeaCard({
  idea,
  entries,
  papers,
  notes,
  onEdit,
}: {
  idea: ResearchIdea;
  entries: IdeaEntryWithSources[];
  papers: SavedPaper[];
  notes: NoteWithPaper[];
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showLinkPaper, setShowLinkPaper] = useState(false);
  const [entryPending, setEntryPending] = useState(false);

  const statusCfg = STATUS_CONFIG[idea.status];
  const linkedPapers = papers.filter((p) => idea.linked_paper_ids.includes(p.id));

  async function handleAddEntry(formData: FormData) {
    setEntryPending(true);
    try {
      formData.set("idea_id", idea.id);
      await addIdeaEntry(formData);
      setShowAddEntry(false);
    } catch (err) {
      console.error(err);
    } finally {
      setEntryPending(false);
    }
  }

  return (
    <Card className={idea.status === "dead_end" ? "opacity-60" : ""}>
      <CardContent className="pt-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-left group"
            >
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <h3 className="font-medium text-sm group-hover:text-primary transition-colors">
                {idea.title}
              </h3>
            </button>
            <div className="flex items-center gap-2 mt-1 flex-wrap ml-5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.color}`}>
                {statusCfg.emoji} {statusCfg.label}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[idea.priority]}`}>
                {idea.priority}
              </span>
              {idea.aim && <span className="text-xs text-muted-foreground">{idea.aim}</span>}
              {idea.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
              {idea.source !== "manual" && (
                <span className="text-xs text-muted-foreground italic">from AI advisor</span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteIdea(idea.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {idea.description && (
          <p className="text-xs text-muted-foreground ml-5">{idea.description}</p>
        )}

        {/* Status quick-switch */}
        <div className="flex gap-1 ml-5">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => updateIdeaStatus(idea.id, key)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                idea.status === key ? cfg.color : "hover:bg-accent"
              }`}
            >
              {cfg.emoji} {cfg.label}
            </button>
          ))}
        </div>

        {/* Summary line */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground ml-5">
          <span>{entries.length} finding{entries.length !== 1 ? "s" : ""}</span>
          <span>{linkedPapers.length} linked paper{linkedPapers.length !== 1 ? "s" : ""}</span>
          <span>Updated {new Date(idea.updated_at).toLocaleDateString()}</span>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="ml-5 space-y-3 pt-1">
            {/* Linked papers */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">Linked Papers</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setShowLinkPaper(!showLinkPaper)}>
                  <Link2 className="h-3 w-3" /> Link paper
                </Button>
              </div>

              {showLinkPaper && (
                <div className="border rounded-md p-2 mb-2 max-h-40 overflow-y-auto space-y-1">
                  {papers
                    .filter((p) => !idea.linked_paper_ids.includes(p.id))
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { linkPaperToIdea(idea.id, p.id); setShowLinkPaper(false); }}
                        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors truncate"
                      >
                        <FileText className="h-3 w-3 inline mr-1" />
                        {p.title}
                      </button>
                    ))}
                  {papers.filter((p) => !idea.linked_paper_ids.includes(p.id)).length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">All papers are already linked</p>
                  )}
                </div>
              )}

              {linkedPapers.length > 0 ? (
                <div className="space-y-1">
                  {linkedPapers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5 group">
                      <span className="truncate flex items-center gap-1">
                        <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        {p.title}
                      </span>
                      <button
                        onClick={() => unlinkPaperFromIdea(idea.id, p.id)}
                        className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No papers linked yet</p>
              )}
            </div>

            {/* Entries / findings log */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Research Log</span>
                <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => setShowAddEntry(!showAddEntry)}>
                  <Plus className="h-3 w-3" /> Add finding
                </Button>
              </div>

              {showAddEntry && (
                <form action={handleAddEntry} className="border rounded-md p-3 mb-2 space-y-2">
                  <textarea
                    name="content"
                    placeholder="What did you find out? What did you learn from this paper?"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-20"
                    required
                  />
                  <div className="flex gap-2 flex-wrap">
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">Type</label>
                      <select name="entry_type" className="rounded-md border bg-background px-2 py-1 text-xs">
                        <option value="finding">💡 Finding</option>
                        <option value="question">❓ Question</option>
                        <option value="thought">💭 Thought</option>
                        <option value="contradiction">⚠️ Contradiction</option>
                        <option value="next_step">➡️ Next Step</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs text-muted-foreground mb-0.5 block">From paper (optional)</label>
                      <select name="source_paper_id" className="w-full rounded-md border bg-background px-2 py-1 text-xs">
                        <option value="">No paper</option>
                        {papers.map((p) => (
                          <option key={p.id} value={p.id}>{p.title.slice(0, 60)}...</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs text-muted-foreground mb-0.5 block">From note (optional)</label>
                      <select name="source_note_id" className="w-full rounded-md border bg-background px-2 py-1 text-xs">
                        <option value="">No note</option>
                        {notes.slice(0, 20).map((n) => (
                          <option key={n.id} value={n.id}>{n.content.slice(0, 60)}...</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setShowAddEntry(false)}>Cancel</Button>
                    <Button type="submit" size="sm" className="text-xs" disabled={entryPending}>
                      {entryPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Save
                    </Button>
                  </div>
                </form>
              )}

              {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No findings yet. As you read papers, add what you learn here.
                </p>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const cfg = ENTRY_CONFIG[entry.entry_type];
                    return (
                      <div key={entry.id} className={`border-l-2 ${cfg.color} pl-3 py-1.5 group`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {cfg.icon}
                              <span className="text-xs font-medium">{cfg.label}</span>
                              <span className="text-xs text-muted-foreground">
                                · {new Date(entry.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed">{entry.content}</p>
                            {entry.saved_papers && (
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <FileText className="h-3 w-3" /> from: {entry.saved_papers.title}
                              </p>
                            )}
                            {entry.notes && entry.notes.highlight_text && (
                              <p className="text-xs text-muted-foreground mt-0.5 bg-yellow-50 dark:bg-yellow-950/30 rounded px-1.5 py-0.5 inline-block">
                                &ldquo;{entry.notes.highlight_text.slice(0, 100)}...&rdquo;
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteIdeaEntry(entry.id)}
                            className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

