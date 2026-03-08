"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LabsAssistantClientProps = {
  activeLabId: string;
};

type Citation = {
  id: string;
  label: string;
  kind: "reagent" | "stock_event" | "equipment" | "booking" | "thread" | "message";
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
  source: "huggingface" | "rules";
  citations: Citation[];
  actionPlan: ActionPlan | null;
};

type ActionLogItem = {
  id: string;
  actionKind: string;
  outcome: "planned" | "confirmed" | "executed" | "denied" | "failed" | "cancelled";
  outcomeMessage: string | null;
  actorLabel: string;
  createdAt: string;
};

export function LabsAssistantClient({ activeLabId }: LabsAssistantClientProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<QAItem[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmActionId, setConfirmActionId] = useState<string | null>(null);
  const [expandedAnswerIds, setExpandedAnswerIds] = useState<Record<string, boolean>>({});

  const loadActionLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ labId: activeLabId, limit: "12" });
      const res = await fetch(`/api/labs/assistant?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || data.error) return;
      setActionLogs(
        Array.isArray(data.logs)
          ? (data.logs as ActionLogItem[])
          : []
      );
    } catch {
      // Best effort only.
    } finally {
      setLogsLoading(false);
    }
  }, [activeLabId]);

  useEffect(() => {
    void loadActionLogs();
  }, [loadActionLogs]);

  function formatLogTime(value: string) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function outcomeTone(outcome: ActionLogItem["outcome"]) {
    if (outcome === "executed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (outcome === "denied" || outcome === "failed") return "bg-rose-100 text-rose-700 border-rose-200";
    if (outcome === "confirmed") return "bg-cyan-100 text-cyan-700 border-cyan-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  }

  function isHighImpactAction(action: ActionPlan) {
    return (
      action.kind === "announcement_post" ||
      action.kind === "remove_reagent" ||
      action.kind === "remove_equipment" ||
      action.kind === "update_booking_status" ||
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/labs/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labId: activeLabId, question: q }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to get answer.");
        return;
      }
      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: q,
          answer: String(data.answer || ""),
          source: data.source === "huggingface" ? "huggingface" : "rules",
          citations: Array.isArray(data.citations) ? (data.citations as Citation[]) : [],
          actionPlan: data.actionPlan ? (data.actionPlan as ActionPlan) : null,
        },
        ...prev,
      ]);
      void loadActionLogs();
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
      setHistory((prev) =>
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
      void loadActionLogs();
    } catch {
      setError("Failed to execute action.");
    } finally {
      setBusy(false);
    }
  }

  async function clearActionHistory() {
    if (logsLoading) return;
    const confirmed = window.confirm("Clear your assistant action history for this lab?");
    if (!confirmed) return;
    setError(null);
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ labId: activeLabId });
      const res = await fetch(`/api/labs/assistant?${params.toString()}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error || "Failed to clear action history.");
        return;
      }
      setActionLogs([]);
    } catch {
      setError("Failed to clear action history.");
    } finally {
      setLogsLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 bg-slate-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4" />
          Labs Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
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
          />
          <Button onClick={() => void ask()} disabled={busy || question.trim().length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (history.length === 0) return;
              const confirmed = window.confirm("Clear current chat history?");
              if (!confirmed) return;
              setHistory([]);
              setExpandedAnswerIds({});
              setConfirmActionId(null);
              setError(null);
            }}
            disabled={busy || history.length === 0}
          >
            Clear
          </Button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="space-y-2">
          {history.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-700">Q: {item.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                {expandedAnswerIds[item.id]
                  ? item.answer
                  : compactAnswerText(item.answer).short}
              </p>
              {compactAnswerText(item.answer).clipped ? (
                <button
                  type="button"
                  className="mt-1 text-[11px] font-medium text-cyan-700 hover:text-cyan-900"
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
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.citations.slice(0, 4).map((c) => (
                    <span key={`${item.id}-${c.kind}-${c.id}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                      {c.kind.replace("_", " ")}: {c.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {item.actionPlan ? (
                <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-2">
                  <p className="text-[11px] font-medium text-cyan-900">Action detected: {item.actionPlan.kind}</p>
                  {item.actionPlan.kind === "create_booking" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.equipmentName} · {item.actionPlan.title}
                    </p>
                  ) : item.actionPlan.kind === "direct_message" || item.actionPlan.kind === "group_message" || item.actionPlan.kind === "create_group_chat" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.recipientLabels.join(", ")} · {item.actionPlan.title}
                    </p>
                  ) : item.actionPlan.kind === "add_reagent" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.name} · qty {item.actionPlan.quantity}
                      {item.actionPlan.unit ? ` ${item.actionPlan.unit}` : ""}
                    </p>
                  ) : item.actionPlan.kind === "remove_reagent" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">{item.actionPlan.reagentName}</p>
                  ) : item.actionPlan.kind === "add_equipment" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.name}
                      {item.actionPlan.location ? ` · ${item.actionPlan.location}` : ""}
                    </p>
                  ) : item.actionPlan.kind === "remove_equipment" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">{item.actionPlan.equipmentName}</p>
                  ) : item.actionPlan.kind === "update_booking_status" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.equipmentName} · {item.actionPlan.status}
                    </p>
                  ) : item.actionPlan.kind === "create_meeting" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.title} · {item.actionPlan.meetingDate}
                    </p>
                  ) : item.actionPlan.kind === "clarification_required" ? (
                    <p className="mt-1 text-[11px] text-cyan-900">
                      {item.actionPlan.body}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-cyan-900">{item.actionPlan.title}</p>
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
                            return void ask(
                              isDurationPrompt
                                ? `${item.question} for ${option}`
                                : `${item.question}\nSelected equipment: ${option}`,
                            );
                          }}
                          disabled={busy}
                          className="rounded-full border border-cyan-300 bg-cyan-100 px-2 py-0.5 text-[10px] text-cyan-900 hover:bg-cyan-200 disabled:opacity-60"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : confirmActionId === item.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 bg-cyan-700 text-white hover:bg-cyan-800"
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
                      className="mt-2 h-7 bg-cyan-700 text-white hover:bg-cyan-800"
                      onClick={() => void runAction(item)}
                      disabled={busy}
                    >
                      {isHighImpactAction(item.actionPlan) ? "Review Action" : "Execute"}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-800">Assistant Action History</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void clearActionHistory()}
                disabled={logsLoading || actionLogs.length === 0}
              >
                Clear history
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void loadActionLogs()}
                disabled={logsLoading}
              >
                {logsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          {actionLogs.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">No assistant actions logged yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {actionLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-medium text-slate-800">{log.actionKind}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${outcomeTone(log.outcome)}`}>
                      {log.outcome}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {log.actorLabel} · {formatLogTime(log.createdAt)}
                  </p>
                  {log.outcomeMessage ? (
                    <p className="mt-1 text-[11px] text-slate-700">{log.outcomeMessage}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
