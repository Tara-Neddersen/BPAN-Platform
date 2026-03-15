"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpHint } from "@/components/ui/help-hint";
import { Input } from "@/components/ui/input";

type LabsAssistantClientProps = {
  activeLabId: string;
};

type Citation = {
  id: string;
  label: string;
  kind: "reagent" | "stock_event" | "equipment" | "booking" | "thread" | "message" | "announcement" | "shared_task" | "meeting";
};

type ActionPlan =
  | {
      kind: "create_booking";
      equipmentId: string;
      equipmentName: string;
      title: string;
      startsAt: string;
      endsAt: string;
      notes?: string | null;
    }
  | {
      kind: "announcement_draft";
      title: string;
      body: string;
    }
  | {
      kind: "announcement_post";
      title: string;
      body: string;
    }
  | {
      kind: "direct_message";
      recipientUserIds: string[];
      recipientLabels: string[];
      title: string;
      body: string;
    }
  | {
      kind: "group_message";
      recipientUserIds: string[];
      recipientLabels: string[];
      title: string;
      body: string;
    }
  | {
      kind: "create_group_chat";
      recipientUserIds: string[];
      recipientLabels: string[];
      title: string;
    }
  | {
      kind: "add_reagent";
      name: string;
      quantity: number;
      unit?: string | null;
      supplier?: string | null;
      storageLocation?: string | null;
      notes?: string | null;
    }
  | {
      kind: "remove_reagent";
      reagentId: string;
      reagentName: string;
    }
  | {
      kind: "add_equipment";
      name: string;
      location?: string | null;
      description?: string | null;
      bookingRequiresApproval?: boolean;
    }
  | {
      kind: "remove_equipment";
      equipmentId: string;
      equipmentName: string;
    }
  | {
      kind: "update_booking_status";
      bookingId: string;
      equipmentName: string;
      status: "cancelled" | "confirmed" | "completed" | "in_use";
    }
  | {
      kind: "update_booking_time";
      bookingId: string;
      equipmentName: string;
      startsAt: string;
      endsAt: string;
    }
  | {
      kind: "create_meeting";
      title: string;
      meetingDate: string;
    }
  | {
      kind: "clarification_required";
      title: string;
      options: string[];
      body: string;
    };

type QAItem = {
  id: string;
  question: string;
  answer: string;
  source: "model" | "rules";
  provider: "xai" | "fallback_model" | "rules";
  citations: Citation[];
  actionPlan: ActionPlan | null;
};

type ChatHistoryTurn = {
  question: string;
  answer: string;
  citations: Citation[];
};

type ChatThread = {
  id: string;
  title: string;
  items: QAItem[];
  updatedAt: number;
};

const STARTER_PROMPTS = [
  "When is my next booking?",
  "Is this equipment available tomorrow morning?",
  "Where is this reagent stored?",
  "Do we still have this reagent left?",
  "What bookings do I have this week?",
];

export function LabsAssistantClient({ activeLabId }: LabsAssistantClientProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([
    { id: "chat-initial", title: "New chat", items: [], updatedAt: Date.now() },
  ]);
  const [activeChatId, setActiveChatId] = useState("chat-initial");
  const [error, setError] = useState<string | null>(null);
  const [confirmActionId, setConfirmActionId] = useState<string | null>(null);
  const [expandedAnswerIds, setExpandedAnswerIds] = useState<Record<string, boolean>>({});
  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeChatId) ?? chatThreads[0],
    [activeChatId, chatThreads],
  );
  const history = activeThread?.items ?? [];

  useEffect(() => {
    setChatThreads([{ id: "chat-initial", title: "New chat", items: [], updatedAt: Date.now() }]);
    setActiveChatId("chat-initial");
    setQuestion("");
    setError(null);
    setConfirmActionId(null);
    setExpandedAnswerIds({});
  }, [activeLabId]);

  function updateActiveThreadItems(updater: (items: QAItem[]) => QAItem[]) {
    setChatThreads((current) => {
      const targetId = activeChatId;
      const existing = current.some((thread) => thread.id === targetId);
      const base = existing
        ? current
        : [{ id: targetId, title: "New chat", items: [], updatedAt: Date.now() }, ...current];
      return base.map((thread) => {
        if (thread.id !== targetId) return thread;
        const nextItems = updater(thread.items);
        const firstQuestion = nextItems[nextItems.length - 1]?.question ?? thread.title;
        const nextTitle = firstQuestion.trim().slice(0, 42) || "New chat";
        return {
          ...thread,
          items: nextItems,
          title: nextTitle,
          updatedAt: Date.now(),
        };
      });
    });
  }

  function startNewChat() {
    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setChatThreads((current) => [{ id, title: "New chat", items: [], updatedAt: Date.now() }, ...current]);
    setActiveChatId(id);
    setQuestion("");
    setError(null);
    setConfirmActionId(null);
    setExpandedAnswerIds({});
  }

  function isHighImpactAction(action: ActionPlan) {
    return (
      action.kind === "announcement_post" ||
      action.kind === "remove_reagent" ||
      action.kind === "remove_equipment" ||
      action.kind === "update_booking_status" ||
      action.kind === "update_booking_time" ||
      action.kind === "direct_message" ||
      action.kind === "group_message" ||
      action.kind === "create_group_chat"
    );
  }

  function compactAnswerText(answer: string) {
    const cleaned = answer
      .replace(/^\s*based on .*?:\s*/i, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const limit = 260;
    if (cleaned.length <= limit) return { short: cleaned, clipped: false };
    return {
      short: `${cleaned.slice(0, limit).trimEnd()}...`,
      clipped: true,
    };
  }

  async function ask(overrideQuestion?: string) {
    const q = (overrideQuestion ?? question).trim();
    if (!q || busy) return;
    const chatHistory: ChatHistoryTurn[] = (activeThread?.items ?? [])
      .slice(0, 12)
      .reverse()
      .map((item) => ({ question: item.question, answer: item.answer, citations: item.citations }));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/labs/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labId: activeLabId, question: q, chatHistory }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to get answer.");
        return;
      }
      updateActiveThreadItems((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: q,
          answer: String(data.answer || ""),
          source: data.source === "rules" ? "rules" : "model",
          provider:
            data.provider === "xai"
              ? "xai"
              : data.provider === "fallback_model"
                ? "fallback_model"
                : "rules",
          citations: Array.isArray(data.citations) ? (data.citations as Citation[]) : [],
          actionPlan: data.actionPlan ? (data.actionPlan as ActionPlan) : null,
        },
        ...prev,
      ]);
      if (!overrideQuestion) {
        setQuestion("");
      } else {
        setQuestion(q);
      }
    } catch {
      setError("Failed to get answer.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(item: QAItem, confirmed = false) {
    if (!item.actionPlan) return;
    if (item.actionPlan.kind === "clarification_required") return;
    if (isHighImpactAction(item.actionPlan) && !confirmed) {
      setConfirmActionId(item.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/labs/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labId: activeLabId,
          question: item.question,
          execute: true,
          confirm: confirmed,
          actionPlan: item.actionPlan,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.requiresConfirmation) {
        setConfirmActionId(item.id);
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Failed to execute action.");
        return;
      }
      setConfirmActionId(null);
      updateActiveThreadItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                answer: `${entry.answer}\n\nAction result: ${String(data.answer || "Done.")}`,
                citations: Array.isArray(data.citations) ? (data.citations as Citation[]) : entry.citations,
                actionPlan: null,
              }
            : entry
        )
      );
      router.refresh();
    } catch {
      setError("Failed to execute action.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-2xl border-white/80 bg-white/84 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.35)]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[17px] font-semibold text-slate-900 sm:text-base">
          <Sparkles className="h-4 w-4 shrink-0" />
          Labs Assistant
          <HelpHint text="You can ask this assistant to find reagent/equipment info, create or remove reagents/equipment, draft or post announcements, create or update bookings, create meetings, and draft direct/group chat messages. High-impact actions require confirmation before execution." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {history.length === 0 ? (
          <div className="rounded-xl border border-white/80 bg-white/88 p-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.85)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-xs">Try one</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void ask(prompt)}
                  disabled={busy}
                  className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[12px] leading-tight text-primary hover:bg-primary/16 disabled:opacity-60 sm:text-xs"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          <Input
            placeholder="Ask about reagent location, reorder status, or arrival..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void ask();
              }
            }}
            disabled={busy}
            className="h-11 min-w-0 flex-1 text-[15px] sm:h-10 sm:text-sm"
          />
          <Button className="h-11 shrink-0 rounded-xl px-4 text-[15px] sm:h-10 sm:text-sm" onClick={() => void ask()} disabled={busy || question.trim().length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
        </div>
        <div className="rounded-lg border border-white/80 bg-white/90 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-xs">Chats</p>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-full px-3 text-[12px] sm:text-xs" onClick={startNewChat}>
              New chat
            </Button>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
            {chatThreads
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    setActiveChatId(thread.id);
                    setConfirmActionId(null);
                    setError(null);
                  }}
                  className={`max-w-[11rem] truncate rounded-full border px-3 py-1.5 text-[12px] sm:text-xs ${
                    activeThread?.id === thread.id
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {thread.title}
                </button>
              ))}
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
              No messages yet. Ask a question to start this chat.
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">Q: {item.question}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    item.provider === "xai"
                      ? "bg-emerald-100 text-emerald-700"
                      : item.provider === "fallback_model"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.provider === "xai" ? "xAI" : item.provider === "fallback_model" ? "Fallback AI" : "Rules"}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-900 sm:text-sm">
                {expandedAnswerIds[item.id]
                  ? item.answer
                  : compactAnswerText(item.answer).short}
              </p>
              {compactAnswerText(item.answer).clipped ? (
                <button
                  type="button"
                  className="mt-1.5 text-sm font-medium text-primary hover:text-primary/90 sm:text-xs"
                  onClick={() =>
                    setExpandedAnswerIds((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))}
                >
                  {expandedAnswerIds[item.id] ? "Show less" : "Show more"}
                </button>
              ) : null}
              {item.citations.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.citations.slice(0, 4).map((c) => (
                    <span key={`${item.id}-${c.kind}-${c.id}`} className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                      {c.kind.replace("_", " ")}: {c.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {item.actionPlan ? (
                <div className="mt-3 rounded-lg border border-primary/25 bg-primary/10 p-2.5">
                  <p className="text-sm font-medium text-primary sm:text-xs">Action detected: {item.actionPlan.kind}</p>
                  {item.actionPlan.kind === "create_booking" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.equipmentName} · {item.actionPlan.title}
                    </p>
                  ) : item.actionPlan.kind === "direct_message" || item.actionPlan.kind === "group_message" || item.actionPlan.kind === "create_group_chat" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.recipientLabels.join(", ")} · {item.actionPlan.title}
                    </p>
                  ) : item.actionPlan.kind === "add_reagent" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.name} · qty {item.actionPlan.quantity}
                      {item.actionPlan.unit ? ` ${item.actionPlan.unit}` : ""}
                    </p>
                  ) : item.actionPlan.kind === "remove_reagent" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">{item.actionPlan.reagentName}</p>
                  ) : item.actionPlan.kind === "add_equipment" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.name}
                      {item.actionPlan.location ? ` · ${item.actionPlan.location}` : ""}
                    </p>
                  ) : item.actionPlan.kind === "remove_equipment" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">{item.actionPlan.equipmentName}</p>
                  ) : item.actionPlan.kind === "update_booking_status" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.equipmentName} · {item.actionPlan.status}
                    </p>
                  ) : item.actionPlan.kind === "update_booking_time" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.equipmentName} · {new Date(item.actionPlan.startsAt).toLocaleString()} - {new Date(item.actionPlan.endsAt).toLocaleString()}
                    </p>
                  ) : item.actionPlan.kind === "create_meeting" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.title} · {item.actionPlan.meetingDate}
                    </p>
                  ) : item.actionPlan.kind === "clarification_required" ? (
                    <p className="mt-1 text-sm text-primary sm:text-xs">
                      {item.actionPlan.body}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-primary sm:text-xs">{item.actionPlan.title}</p>
                  )}
                  {item.actionPlan.kind === "clarification_required" ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.actionPlan.options.slice(0, 8).map((option) => (
                        <button
                          key={`${item.id}-${option}`}
                          type="button"
                          onClick={() => {
                            const isDurationPrompt =
                              item.actionPlan?.kind === "clarification_required"
                              && item.actionPlan.title.toLowerCase().includes("duration");
                            const isBookingPicker =
                              item.actionPlan?.kind === "clarification_required"
                              && item.actionPlan.title.toLowerCase().includes("booking");
                            return void ask(
                              isDurationPrompt
                                ? `${item.question} for ${option}`
                                : isBookingPicker
                                ? `${item.question}\nSelected booking: ${option}`
                                : `${item.question}\nSelected equipment: ${option}`,
                            );
                          }}
                          disabled={busy}
                          className="rounded-full border border-primary/30 bg-primary/16 px-2.5 py-1 text-xs text-primary hover:bg-primary/22 disabled:opacity-60"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : confirmActionId === item.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8 bg-primary text-white hover:bg-primary/92"
                        onClick={() => void runAction(item, true)}
                        disabled={busy}
                      >
                        Confirm Execute
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => setConfirmActionId(null)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="mt-2 h-8 bg-primary text-white hover:bg-primary/92"
                      onClick={() => void runAction(item)}
                      disabled={busy}
                    >
                      {isHighImpactAction(item.actionPlan) ? "Review Action" : "Execute"}
                    </Button>
                  )}
                </div>
              ) : null}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
