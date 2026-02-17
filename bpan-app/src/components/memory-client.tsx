"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AIMemory, MemoryCategory, MemoryConfidence } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain, Pin, PinOff, Trash2, Plus, Search, Filter,
  Bot, Edit2, Save, X, Sparkles, CheckCircle2, Shield,
} from "lucide-react";

// ─── Category Colors & Labels ───────────────────────────────────────────────

const CATEGORY_CONFIG: Record<MemoryCategory, { label: string; color: string; emoji: string }> = {
  research_fact: { label: "Research Fact", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", emoji: "🔬" },
  hypothesis: { label: "Hypothesis", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", emoji: "💡" },
  experiment_insight: { label: "Experiment Insight", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", emoji: "🧪" },
  preference: { label: "Preference", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", emoji: "⚙️" },
  meeting_decision: { label: "Meeting Decision", color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300", emoji: "🤝" },
  literature_pattern: { label: "Literature Pattern", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", emoji: "📖" },
  troubleshooting: { label: "Troubleshooting", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", emoji: "🔧" },
  goal: { label: "Goal", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", emoji: "🎯" },
  connection: { label: "Connection", color: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300", emoji: "🔗" },
  important_date: { label: "Important Date", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", emoji: "📅" },
};

const CONFIDENCE_CONFIG: Record<MemoryConfidence, { label: string; icon: typeof CheckCircle2 }> = {
  low: { label: "Low", icon: Bot },
  medium: { label: "Medium", icon: Bot },
  high: { label: "High", icon: Sparkles },
  confirmed: { label: "Confirmed", icon: Shield },
};

const ALL_CATEGORIES: MemoryCategory[] = [
  "research_fact", "hypothesis", "experiment_insight", "preference",
  "meeting_decision", "literature_pattern", "troubleshooting",
  "goal", "connection", "important_date",
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface MemoryClientProps {
  memories: AIMemory[];
  actions: {
    createMemory: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateMemory: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteMemory: (id: string) => Promise<{ success?: boolean; error?: string }>;
    togglePin: (id: string, pinned: boolean) => Promise<{ success?: boolean; error?: string }>;
  };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function MemoryClient({ memories: initMemories, actions }: MemoryClientProps) {
  const router = useRouter();
  const [memories, setMemories] = useState(initMemories);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | "all">("all");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [busy, setBusy] = useState(false);

  // ─── Stats ────────────────────────────
  const stats = useMemo(() => ({
    total: memories.length,
    pinned: memories.filter(m => m.is_pinned).length,
    auto: memories.filter(m => m.is_auto).length,
    manual: memories.filter(m => !m.is_auto).length,
  }), [memories]);

  // ─── Filtered List ────────────────────
  const filtered = useMemo(() => {
    let list = memories;
    if (categoryFilter !== "all") list = list.filter(m => m.category === categoryFilter);
    if (showPinnedOnly) list = list.filter(m => m.is_pinned);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q)) ||
        m.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [memories, categoryFilter, showPinnedOnly, search]);

  // ─── Actions ──────────────────────────
  const handleAdd = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const result = await actions.createMemory(fd);
    if (result.success) {
      setShowAdd(false);
      router.refresh();
    }
    setBusy(false);
  }, [actions, router]);

  const handleTogglePin = useCallback(async (id: string, currentPinned: boolean) => {
    const result = await actions.togglePin(id, !currentPinned);
    if (result.success) {
      setMemories(prev => prev.map(m => m.id === id ? { ...m, is_pinned: !currentPinned } : m));
    }
  }, [actions]);

  const handleDelete = useCallback(async (id: string) => {
    const result = await actions.deleteMemory(id);
    if (result.success) {
      setMemories(prev => prev.filter(m => m.id !== id));
    }
  }, [actions]);

  const handleSaveEdit = useCallback(async (id: string) => {
    setBusy(true);
    const fd = new FormData();
    fd.set("content", editContent);
    const result = await actions.updateMemory(id, fd);
    if (result.success) {
      setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
      setEditingId(null);
    }
    setBusy(false);
  }, [actions, editContent]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Brain className="h-5 w-5 text-purple-500" />
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Memories</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Pin className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-2xl font-bold">{stats.pinned}</div>
              <div className="text-xs text-muted-foreground">Pinned</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Bot className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-bold">{stats.auto}</div>
              <div className="text-xs text-muted-foreground">AI Learned</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Edit2 className="h-5 w-5 text-orange-500" />
            <div>
              <div className="text-2xl font-bold">{stats.manual}</div>
              <div className="text-xs text-muted-foreground">You Added</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(!showAdd)} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Memory
        </Button>
        <Button
          variant={showPinnedOnly ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setShowPinnedOnly(!showPinnedOnly)}
        >
          <Pin className="h-3.5 w-3.5" /> Pinned Only
        </Button>
        <select
          className="h-8 rounded border bg-background px-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as MemoryCategory | "all")}
        >
          <option value="all">All Categories</option>
          {ALL_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search memories..."
            className="pl-8 h-8 w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Add a Memory</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select name="category" required className="h-9 rounded border bg-background px-2 text-sm">
                  {ALL_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}</option>
                  ))}
                </select>
                <select name="confidence" className="h-9 rounded border bg-background px-2 text-sm">
                  <option value="confirmed">Confirmed</option>
                  <option value="high">High Confidence</option>
                  <option value="medium">Medium Confidence</option>
                  <option value="low">Low Confidence</option>
                </select>
              </div>
              <Textarea
                name="content"
                required
                placeholder="What should the AI remember? (e.g., 'WDR45 knockout mice show iron accumulation in the basal ganglia by 6 months')"
                className="text-sm"
              />
              <Input name="tags" placeholder="Tags (comma-separated, e.g., iron, WDR45, mouse model)" className="text-sm" />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_pinned" value="true" />
                  Pin (always include in AI context)
                </label>
                <div className="flex-1" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={busy}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Memory List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No memories yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The AI will automatically learn from your advisor chats, meetings, and paper analysis. 
              You can also manually add important facts and preferences.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((mem) => {
            const config = CATEGORY_CONFIG[mem.category];
            const confConfig = CONFIDENCE_CONFIG[mem.confidence];
            const ConfIcon = confConfig.icon;

            return (
              <Card key={mem.id} className={`transition-all ${mem.is_pinned ? "border-blue-300 dark:border-blue-700" : ""}`}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    {/* Pin indicator */}
                    <button
                      onClick={() => handleTogglePin(mem.id, mem.is_pinned)}
                      className="mt-0.5 flex-shrink-0"
                      title={mem.is_pinned ? "Unpin" : "Pin"}
                    >
                      {mem.is_pinned
                        ? <Pin className="h-4 w-4 text-blue-500" />
                        : <PinOff className="h-4 w-4 text-muted-foreground hover:text-blue-500 transition-colors" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      {/* Content */}
                      {editingId === mem.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(mem.id)} disabled={busy}>
                              <Save className="h-3 w-3 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm">{mem.content}</p>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Badge className={`text-[10px] ${config.color}`}>
                          {config.emoji} {config.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <ConfIcon className="h-2.5 w-2.5" />
                          {confConfig.label}
                        </Badge>
                        {mem.is_auto && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Bot className="h-2.5 w-2.5" /> AI Learned
                          </Badge>
                        )}
                        {mem.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {formatDate(mem.created_at)}
                        </span>
                        {mem.source && (
                          <span className="text-[10px] text-muted-foreground">
                            • from {mem.source.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditContent(mem.content);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(mem.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Explanation */}
      <Card>
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Filter className="h-4 w-4" /> How AI Memory Works
          </h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>🤖 <strong>Auto-learned:</strong> The AI extracts key facts, findings, and decisions from your advisor chats, meetings, and paper analyses.</li>
            <li>📌 <strong>Pinned memories</strong> are ALWAYS included in every AI interaction — use these for the most important facts about your research.</li>
            <li>🧠 All other memories are included based on relevance and recency (newest first).</li>
            <li>✏️ You can manually add, edit, or delete any memory. Manually added memories are marked with higher confidence.</li>
            <li>🔄 The more you interact with the AI, the smarter it gets about your research.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

