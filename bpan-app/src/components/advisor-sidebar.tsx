"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  X,
  Send,
  Loader2,
  MessageSquarePlus,
  Trash2,
  ChevronLeft,
  Lightbulb,
  Settings2,
  FlaskConical,
  BookOpen,
  Search,
  AlertTriangle,
  Bookmark,
  Check,
} from "lucide-react";
import type { AdvisorConversation, AdvisorMessage } from "@/types";
import type { ProactiveSuggestion } from "@/lib/advisor";

// ─── Sub-views ───────────────────────────────────────────────────────────────

type SidebarView = "chat" | "conversations" | "suggestions" | "hypotheses" | "context";

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdvisorSidebar() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SidebarView>("chat");

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conversations list
  const [conversations, setConversations] = useState<AdvisorConversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [savingIdeaIdx, setSavingIdeaIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // ─── Conversations ──────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    setLoadingConvos(true);
    try {
      const res = await fetch("/api/advisor/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      console.error("Failed to load conversations");
    } finally {
      setLoadingConvos(false);
    }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/advisor/conversations/${convId}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setConversationId(convId);
      setView("chat");
    } catch {
      setError("Failed to load conversation");
    }
  }, []);

  const deleteConversation = useCallback(async (convId: string) => {
    try {
      await fetch("/api/advisor/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId }),
      });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (conversationId === convId) {
        setConversationId(null);
        setMessages([]);
      }
    } catch {
      console.error("Failed to delete conversation");
    }
  }, [conversationId]);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setView("chat");
  }, []);

  // ─── Chat ───────────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);
    setError(null);

    // Optimistic UI update
    const tempUserMsg: AdvisorMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId || "",
      user_id: "",
      role: "user",
      content: userMessage,
      context_used: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get response");
      }

      const data = await res.json();

      // Update conversation ID if new
      if (!conversationId) {
        setConversationId(data.conversationId);
      }

      // Add assistant response
      const assistantMsg: AdvisorMessage = {
        id: `resp-${Date.now()}`,
        conversation_id: data.conversationId,
        user_id: "",
        role: "assistant",
        content: data.response,
        context_used: {},
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get response");
    } finally {
      setSending(false);
    }
  }

  // ─── Suggestions ────────────────────────────────────────────────────────────

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/advisor/suggestions");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      console.error("Failed to load suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  // Load conversations when sidebar opens
  useEffect(() => {
    if (open && view === "conversations") {
      loadConversations();
    }
  }, [open, view, loadConversations]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
    read: <BookOpen className="h-4 w-4 text-blue-500" />,
    experiment: <FlaskConical className="h-4 w-4 text-green-500" />,
    question: <Search className="h-4 w-4 text-purple-500" />,
    gap: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  };

  const SUGGESTION_LABELS: Record<string, string> = {
    read: "Read",
    experiment: "Experiment",
    question: "Investigate",
    gap: "Gap",
  };

  return (
    <>
      {/* Toggle button — fixed to bottom right */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/40"
          title="AI Research Advisor"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* Sidebar panel */}
      {open && (
        <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[90vw] flex-col border-l bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">AI Research Advisor</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={startNewConversation}
                title="New conversation"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b">
            {[
              { key: "chat" as const, label: "Chat", icon: <Bot className="h-3.5 w-3.5" /> },
              { key: "conversations" as const, label: "History", icon: <ChevronLeft className="h-3.5 w-3.5" /> },
              { key: "suggestions" as const, label: "Ideas", icon: <Lightbulb className="h-3.5 w-3.5" /> },
              { key: "hypotheses" as const, label: "Hypotheses", icon: <FlaskConical className="h-3.5 w-3.5" /> },
              { key: "context" as const, label: "Setup", icon: <Settings2 className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setView(tab.key);
                  if (tab.key === "conversations") loadConversations();
                  if (tab.key === "suggestions") loadSuggestions();
                }}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2 ${
                  view === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* ─── CHAT VIEW ─── */}
            {view === "chat" && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                      <Bot className="h-12 w-12 text-muted-foreground/30 mb-4" />
                      <h3 className="font-medium text-sm mb-1">Research Advisor</h3>
                      <p className="text-xs text-muted-foreground mb-4 max-w-[280px]">
                        Ask me anything about your research — I have access to your notes, papers, and hypotheses.
                      </p>
                      <div className="space-y-2 w-full max-w-[280px]">
                        {[
                          "What gaps exist in my current research?",
                          "Suggest next experiments based on my notes",
                          "Help me troubleshoot my Western blot protocol",
                          "What do my recent findings suggest about WDR45?",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setInput(q);
                              inputRef.current?.focus();
                            }}
                            className="w-full text-left text-xs px-3 py-2 rounded-md border hover:bg-accent transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm group/msg ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </div>
                        {msg.role === "assistant" && msg.content.length > 20 && (
                          <button
                            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover/msg:opacity-100 transition-opacity"
                            onClick={async () => {
                              try {
                                await fetch("/api/ideas", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    title: msg.content.slice(0, 150).split("\n")[0],
                                    description: msg.content.slice(0, 500),
                                    source: "advisor",
                                    tags: ["from-chat"],
                                  }),
                                  headers: { "Content-Type": "application/json" },
                                });
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                          >
                            <Bookmark className="h-3 w-3" /> Save as idea
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="border-t px-4 py-3">
                  <div className="flex gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Ask about your research..."
                      className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[38px] max-h-[120px]"
                      rows={1}
                    />
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={sending || !input.trim()}
                      className="self-end"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* ─── CONVERSATIONS LIST ─── */}
            {view === "conversations" && (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 mb-3"
                  onClick={startNewConversation}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  New Conversation
                </Button>

                {loadingConvos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No conversations yet. Start chatting!
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer hover:bg-accent transition-colors ${
                        conversationId === conv.id ? "bg-accent border-primary" : ""
                      }`}
                      onClick={() => loadMessages(conv.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {conv.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─── SUGGESTIONS VIEW ─── */}
            {view === "suggestions" && (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Research Suggestions</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={loadSuggestions}
                    disabled={loadingSuggestions}
                  >
                    {loadingSuggestions ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Lightbulb className="h-3 w-3" />
                    )}
                    Generate
                  </Button>
                </div>

                {loadingSuggestions ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Analyzing your research...
                    </p>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="text-center py-8">
                    <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-xs text-muted-foreground">
                      Click &quot;Generate&quot; to get AI-powered suggestions based on your notes, papers, and hypotheses.
                    </p>
                  </div>
                ) : (
                  suggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {SUGGESTION_ICONS[s.type]}
                        <Badge variant="secondary" className="text-xs">
                          {SUGGESTION_LABELS[s.type] || s.type}
                        </Badge>
                      </div>
                      <p className="text-sm">{s.suggestion}</p>
                      <p className="text-xs text-muted-foreground">{s.rationale}</p>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 gap-1"
                          onClick={() => {
                            setInput(`Tell me more about: ${s.suggestion}`);
                            setView("chat");
                            inputRef.current?.focus();
                          }}
                        >
                          <Bot className="h-3 w-3" /> Discuss
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 gap-1"
                          disabled={savingIdeaIdx === i}
                          onClick={async () => {
                            setSavingIdeaIdx(i);
                            try {
                              const fd = new FormData();
                              fd.set("title", s.suggestion.slice(0, 200));
                              fd.set("description", s.rationale || "");
                              fd.set("source", "advisor");
                              fd.set("priority", s.type === "gap" ? "high" : "medium");
                              fd.set("tags", s.type);
                              const res = await fetch("/api/ideas", {
                                method: "POST",
                                body: JSON.stringify({
                                  title: s.suggestion.slice(0, 200),
                                  description: s.rationale || "",
                                  source: "advisor",
                                  priority: s.type === "gap" ? "high" : "medium",
                                  tags: [s.type],
                                }),
                                headers: { "Content-Type": "application/json" },
                              });
                              if (!res.ok) throw new Error("Failed to save");
                              // Brief success feedback
                              setTimeout(() => setSavingIdeaIdx(null), 1500);
                            } catch (err) {
                              console.error(err);
                              setSavingIdeaIdx(null);
                            }
                          }}
                        >
                          {savingIdeaIdx === i ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Bookmark className="h-3 w-3" />
                          )}
                          {savingIdeaIdx === i ? "Saved!" : "Save as Idea"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─── HYPOTHESES VIEW ─── */}
            {view === "hypotheses" && (
              <HypothesesView />
            )}

            {/* ─── CONTEXT SETUP VIEW ─── */}
            {view === "context" && (
              <ResearchContextView />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Hypotheses Sub-component ────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  supported: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  refuted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  revised: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

import type { Hypothesis } from "@/types";

function HypothesesView() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAim, setNewAim] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHypotheses();
  }, []);

  async function loadHypotheses() {
    setLoading(true);
    try {
      const res = await fetch("/api/advisor/hypotheses");
      const data = await res.json();
      setHypotheses(data.hypotheses || []);
    } catch {
      console.error("Failed to load hypotheses");
    } finally {
      setLoading(false);
    }
  }

  async function createHypothesis() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/advisor/hypotheses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          aim: newAim.trim() || null,
        }),
      });
      const data = await res.json();
      setHypotheses((prev) => [data.hypothesis, ...prev]);
      setNewTitle("");
      setNewDesc("");
      setNewAim("");
      setShowForm(false);
    } catch {
      console.error("Failed to create hypothesis");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch("/api/advisor/hypotheses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      setHypotheses((prev) =>
        prev.map((h) => (h.id === id ? data.hypothesis : h))
      );
    } catch {
      console.error("Failed to update hypothesis");
    }
  }

  async function addEvidence(id: string, type: "for" | "against", evidence: string) {
    const hypothesis = hypotheses.find((h) => h.id === id);
    if (!hypothesis || !evidence.trim()) return;

    const field = type === "for" ? "evidence_for" : "evidence_against";
    const updated = [...hypothesis[field], evidence.trim()];

    try {
      const res = await fetch("/api/advisor/hypotheses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: updated }),
      });
      const data = await res.json();
      setHypotheses((prev) =>
        prev.map((h) => (h.id === id ? data.hypothesis : h))
      );
    } catch {
      console.error("Failed to add evidence");
    }
  }

  async function deleteHypothesis(id: string) {
    try {
      await fetch("/api/advisor/hypotheses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setHypotheses((prev) => prev.filter((h) => h.id !== id));
    } catch {
      console.error("Failed to delete hypothesis");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Hypothesis Tracker</h3>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1"
          onClick={() => setShowForm(!showForm)}
        >
          <FlaskConical className="h-3 w-3" />
          {showForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-3 space-y-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Hypothesis title..."
            className="text-sm"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-16"
          />
          <Input
            value={newAim}
            onChange={(e) => setNewAim(e.target.value)}
            placeholder="Related aim (e.g. Aim 2.1)"
            className="text-sm"
          />
          <Button
            size="sm"
            className="w-full text-xs"
            onClick={createHypothesis}
            disabled={saving || !newTitle.trim()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Create Hypothesis
          </Button>
        </div>
      )}

      {hypotheses.length === 0 && !showForm ? (
        <div className="text-center py-8">
          <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-xs text-muted-foreground">
            No hypotheses yet. Track your research hypotheses and evidence here.
          </p>
        </div>
      ) : (
        hypotheses.map((h) => (
          <HypothesisCard
            key={h.id}
            hypothesis={h}
            onUpdateStatus={updateStatus}
            onAddEvidence={addEvidence}
            onDelete={deleteHypothesis}
          />
        ))
      )}
    </div>
  );
}

function HypothesisCard({
  hypothesis,
  onUpdateStatus,
  onAddEvidence,
  onDelete,
}: {
  hypothesis: Hypothesis;
  onUpdateStatus: (id: string, status: string) => void;
  onAddEvidence: (id: string, type: "for" | "against", evidence: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [evidenceInput, setEvidenceInput] = useState("");
  const [evidenceType, setEvidenceType] = useState<"for" | "against">("for");

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-medium text-left hover:text-primary transition-colors"
          >
            {hypothesis.title}
          </button>
          {hypothesis.aim && (
            <p className="text-xs text-muted-foreground mt-0.5">{hypothesis.aim}</p>
          )}
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_COLORS[hypothesis.status]}`}>
          {hypothesis.status}
        </span>
      </div>

      {hypothesis.description && (
        <p className="text-xs text-muted-foreground">{hypothesis.description}</p>
      )}

      {expanded && (
        <div className="space-y-2 pt-1">
          {/* Status buttons */}
          <div className="flex gap-1 flex-wrap">
            {["pending", "supported", "refuted", "revised"].map((s) => (
              <button
                key={s}
                onClick={() => onUpdateStatus(hypothesis.id, s)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  hypothesis.status === s
                    ? STATUS_COLORS[s]
                    : "hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Evidence */}
          {hypothesis.evidence_for.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Evidence For:</p>
              {hypothesis.evidence_for.map((e, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-green-300 mb-1">
                  {e}
                </p>
              ))}
            </div>
          )}
          {hypothesis.evidence_against.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Evidence Against:</p>
              {hypothesis.evidence_against.map((e, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-red-300 mb-1">
                  {e}
                </p>
              ))}
            </div>
          )}

          {/* Add evidence */}
          <div className="flex gap-1">
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as "for" | "against")}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="for">For</option>
              <option value="against">Against</option>
            </select>
            <Input
              value={evidenceInput}
              onChange={(e) => setEvidenceInput(e.target.value)}
              placeholder="Add evidence..."
              className="text-xs h-7 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAddEvidence(hypothesis.id, evidenceType, evidenceInput);
                  setEvidenceInput("");
                }
              }}
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6 text-destructive"
            onClick={() => onDelete(hypothesis.id)}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Research Context Sub-component ──────────────────────────────────────────

import type { ResearchContext } from "@/types";

function ResearchContextView() {
  const [context, setContext] = useState<ResearchContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [thesisTitle, setThesisTitle] = useState("");
  const [thesisSummary, setThesisSummary] = useState("");
  const [aims, setAims] = useState<string[]>([""]);
  const [keyQuestions, setKeyQuestions] = useState<string[]>([""]);
  const [modelSystems, setModelSystems] = useState("");
  const [keyTechniques, setKeyTechniques] = useState("");

  useEffect(() => {
    loadContext();
  }, []);

  async function loadContext() {
    setLoading(true);
    try {
      const res = await fetch("/api/advisor/context");
      const data = await res.json();
      if (data.context) {
        const c = data.context as ResearchContext;
        setContext(c);
        setThesisTitle(c.thesis_title || "");
        setThesisSummary(c.thesis_summary || "");
        setAims(c.aims.length ? c.aims : [""]);
        setKeyQuestions(c.key_questions.length ? c.key_questions : [""]);
        setModelSystems(c.model_systems.join(", "));
        setKeyTechniques(c.key_techniques.join(", "));
      }
    } catch {
      console.error("Failed to load context");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/advisor/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis_title: thesisTitle.trim() || null,
          thesis_summary: thesisSummary.trim() || null,
          aims: aims.filter((a) => a.trim()),
          key_questions: keyQuestions.filter((q) => q.trim()),
          model_systems: modelSystems
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          key_techniques: keyTechniques
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setContext(data.context);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      console.error("Failed to save context");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">Research Context</h3>
        <p className="text-xs text-muted-foreground">
          Tell the AI about your research so it can give better advice.
        </p>
      </div>

      {/* Thesis title */}
      <div>
        <label className="text-xs font-medium mb-1 block">Thesis Title</label>
        <Input
          value={thesisTitle}
          onChange={(e) => setThesisTitle(e.target.value)}
          placeholder="e.g. Mechanisms of neurodegeneration in BPAN"
          className="text-sm"
        />
      </div>

      {/* Thesis summary */}
      <div>
        <label className="text-xs font-medium mb-1 block">Summary</label>
        <textarea
          value={thesisSummary}
          onChange={(e) => setThesisSummary(e.target.value)}
          placeholder="Brief description of your research focus..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Specific aims */}
      <div>
        <label className="text-xs font-medium mb-1 block">Specific Aims</label>
        {aims.map((aim, i) => (
          <div key={i} className="flex gap-1 mb-1">
            <span className="text-xs text-muted-foreground mt-2 w-6">{i + 1}.</span>
            <Input
              value={aim}
              onChange={(e) => {
                const updated = [...aims];
                updated[i] = e.target.value;
                setAims(updated);
              }}
              placeholder={`Aim ${i + 1}...`}
              className="text-sm flex-1"
            />
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-6"
          onClick={() => setAims([...aims, ""])}
        >
          + Add aim
        </Button>
      </div>

      {/* Key questions */}
      <div>
        <label className="text-xs font-medium mb-1 block">Open Questions</label>
        {keyQuestions.map((q, i) => (
          <div key={i} className="flex gap-1 mb-1">
            <Input
              value={q}
              onChange={(e) => {
                const updated = [...keyQuestions];
                updated[i] = e.target.value;
                setKeyQuestions(updated);
              }}
              placeholder="What do I still need to figure out?"
              className="text-sm"
            />
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-6"
          onClick={() => setKeyQuestions([...keyQuestions, ""])}
        >
          + Add question
        </Button>
      </div>

      {/* Model systems */}
      <div>
        <label className="text-xs font-medium mb-1 block">Model Systems</label>
        <Input
          value={modelSystems}
          onChange={(e) => setModelSystems(e.target.value)}
          placeholder="e.g. C57BL/6 mice, HeLa cells, iPSC neurons"
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground mt-0.5">Comma-separated</p>
      </div>

      {/* Key techniques */}
      <div>
        <label className="text-xs font-medium mb-1 block">Key Techniques</label>
        <Input
          value={keyTechniques}
          onChange={(e) => setKeyTechniques(e.target.value)}
          placeholder="e.g. Western blot, qPCR, flow cytometry"
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground mt-0.5">Comma-separated</p>
      </div>

      {/* Save button */}
      <Button
        className="w-full gap-2"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          "✓ Saved!"
        ) : (
          <>
            <Settings2 className="h-4 w-4" />
            {context ? "Update Context" : "Save Context"}
          </>
        )}
      </Button>
    </div>
  );
}

