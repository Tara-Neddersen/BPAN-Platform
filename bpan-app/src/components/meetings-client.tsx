"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, Loader2, Check, X,
  MessageSquare, Mic, MicOff, Sparkles, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { MeetingNote, ActionItem } from "@/types";
import { syncMeetingActionsToTasks } from "@/app/(protected)/tasks/actions";

// ─── Types ───────────────────────────────────────────────────────────────

interface MeetingsClientProps {
  meetings: MeetingNote[];
  initialOpenMeetingId?: string | null;
  linkedTaskCounts?: Record<string, number>;
  actions: {
    createMeetingNote: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateMeetingNote: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteMeetingNote: (id: string) => Promise<{ success?: boolean; error?: string }>;
  };
}

// ─── Speech-to-Text Hook ─────────────────────────────────────────────────

function useSpeechToText(onTranscriptChunk: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const wantRef = useRef(false);
  const cbRef = useRef(onTranscriptChunk);
  const recRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const rapidFailCount = useRef(0);
  const gotResultRef = useRef(false);

  cbRef.current = onTranscriptChunk;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const has = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    setIsSupported(has);
    setDebugInfo(has ? "Speech API available" : "Speech API NOT available in this browser");
    return () => {
      wantRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recRef.current) try { recRef.current.abort(); } catch { /* */ }
    };
  }, []);

  function stopForGood(msg: string) {
    wantRef.current = false;
    setIsListening(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current) try { recRef.current.abort(); } catch { /* */ }
    setDebugInfo(msg);
    toast.error(msg, { duration: 8000 });
  }

  function startRec() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR || !wantRef.current) return;

    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* */ }
      recRef.current = null;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    recRef.current = rec;
    // eslint-disable-next-line react-hooks/purity
    startTimeRef.current = Date.now();
    gotResultRef.current = false;

    setDebugInfo("Starting recognition...");

    rec.onaudiostart = () => { setDebugInfo("🎤 Microphone active — speak now!"); };
    rec.onspeechstart = () => { setDebugInfo("🗣️ Speech detected!"); rapidFailCount.current = 0; };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      gotResultRef.current = true;
      rapidFailCount.current = 0;
      const finalized: string[] = [];
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript?.trim();
        if (!text) continue;
        if (result.isFinal) finalized.push(text);
        else interim += (interim ? " " : "") + text;
      }
      if (finalized.length > 0) cbRef.current(finalized.join(" "));
      const preview = interim || finalized.join(" ");
      if (preview) {
        setDebugInfo("📝 Heard: " + preview.substring(0, 80) + (preview.length > 80 ? "..." : ""));
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setDebugInfo("❌ Error: " + e.error);
      if (e.error === "not-allowed") {
        stopForGood("Microphone access denied. Check browser permissions.");
      } else if (e.error === "service-not-available") {
        stopForGood("Speech service unavailable. Please use Google Chrome.");
      }
    };

    rec.onend = () => {
      const elapsed = Date.now() - startTimeRef.current;
      if (wantRef.current) {
        if (elapsed < 2000 && !gotResultRef.current) {
          rapidFailCount.current++;
          if (rapidFailCount.current >= 3) {
            stopForGood("⚠️ Speech recognition is not working in this browser. Please open in Google Chrome.");
            return;
          }
          const delay = 500 * Math.pow(2, rapidFailCount.current - 1);
          setDebugInfo(`⏸️ Ended quickly. Retry ${rapidFailCount.current}/3 in ${delay}ms...`);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, delay);
        } else {
          rapidFailCount.current = 0;
          setDebugInfo("⏸️ Paused (silence). Auto-restarting...");
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, 300);
        }
      } else {
        setDebugInfo("Stopped.");
      }
    };

    try {
      rec.start();
      setDebugInfo("✅ rec.start() called — listening...");
    } catch (err) {
      setDebugInfo("❌ rec.start() threw: " + String(err));
      rapidFailCount.current++;
      if (rapidFailCount.current >= 3) {
        stopForGood("⚠️ Speech recognition failed to start. Please use Google Chrome.");
        return;
      }
      if (wantRef.current) {
        timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, 1000);
      }
    }
  }

  function toggle() {
    if (wantRef.current) {
      wantRef.current = false;
      setIsListening(false);
      rapidFailCount.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recRef.current) try { recRef.current.stop(); } catch { /* */ }
      setDebugInfo("Stopped.");
    } else {
      rapidFailCount.current = 0;
      wantRef.current = true;
      setIsListening(true);
      startRec();
    }
  }

  function stop() {
    wantRef.current = false;
    setIsListening(false);
    rapidFailCount.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current) try { recRef.current.stop(); } catch { /* */ }
  }

  return { isListening, isSupported, toggle, stop, debugInfo };
}

function inferActionDueDate(text: string, meetingDate: string): string | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const base = new Date(`${meetingDate || new Date().toISOString().slice(0, 10)}T12:00:00`);
  if (Number.isNaN(base.getTime())) return undefined;

  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return toISO(d);
  };

  if (/\btoday\b/.test(lower)) return toISO(base);
  if (/\btomorrow\b/.test(lower)) return addDays(1);
  if (/\bnext week\b/.test(lower)) return addDays(7);

  const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const md = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    let year = md[3] ? Number(md[3]) : base.getFullYear();
    if (year < 100) year += 2000;
    const parsed = new Date(year, month - 1, day, 12);
    if (!Number.isNaN(parsed.getTime())) return toISO(parsed);
  }

  const weekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = dayNames.indexOf(weekdayMatch[1]);
    if (target >= 0) {
      const d = new Date(base);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      return toISO(d);
    }
  }

  return undefined;
}

// ─── Meeting Detail Sub-component ────────────────────────────────────────

function MeetingDetail({
  meeting,
  onSave,
  onClose,
  busy,
}: {
  meeting: MeetingNote;
  onSave: (fd: FormData) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [content, setContent] = useState(meeting.content);
  const [actionItems, setActionItems] = useState<ActionItem[]>(meeting.action_items || []);
  const [newAction, setNewAction] = useState("");
  const [aiSummary, setAiSummary] = useState(meeting.ai_summary || "");
  const [summarizing, setSummarizing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const insertedDictationPrefixRef = useRef(false);
  const { isListening, isSupported, toggle: toggleMic, stop: stopMic, debugInfo } = useSpeechToText((chunk) => {
    setContent((prev) => {
      const trimmed = prev.trimEnd();
      if (!insertedDictationPrefixRef.current) {
        insertedDictationPrefixRef.current = true;
        return trimmed ? `${trimmed}\n\n${chunk}` : chunk;
      }
      return trimmed ? `${trimmed} ${chunk}` : chunk;
    });
  });

  function handleToggleMic() {
    if (!isListening) insertedDictationPrefixRef.current = false;
    toggleMic();
  }

  useEffect(() => {
    return () => { stopMic(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSummarize() {
    if (!content?.trim()) { toast.error("Write some notes first."); return; }
    setSummarizing(true);
    try {
      const res = await fetch("/api/note-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "meeting_summary",
          text: content,
          actionItems: actionItems.map((a) => `${a.done ? "[DONE]" : "[ ]"} ${a.text}`).join("\n"),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiSummary(data.result || data.text || "");
      toast.success("Summary generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to summarize");
    }
    setSummarizing(false);
  }

  async function handleExtractActions() {
    if (!content?.trim()) { toast.error("Write or dictate some notes first."); return; }
    setExtracting(true);
    try {
      const res = await fetch("/api/note-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract_actions", text: content }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items: string[] = data.items || [];
      if (items.length === 0) {
        toast.info("No action items found in the notes.");
      } else {
        const existingTexts = new Set(actionItems.map((a) => a.text.toLowerCase().trim()));
        const newItems = items
          .filter((t) => !existingTexts.has(t.toLowerCase().trim()))
          .map((t) => ({ text: t, done: false, due_date: inferActionDueDate(t, meeting.meeting_date) }));
        setActionItems([...actionItems, ...newItems]);
        toast.success(`Found ${newItems.length} new action item${newItems.length !== 1 ? "s" : ""}!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract action items");
    }
    setExtracting(false);
  }

  async function handleUploadTranscriptFile(file: File) {
    setUploadingTranscript(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/meeting-transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to transcribe recording");

      const transcript = (data.transcript || "").trim();
      if (!transcript) throw new Error("No transcript returned");

      stopMic();
      insertedDictationPrefixRef.current = false;
      setContent((prev) => {
        const trimmed = prev.trimEnd();
        const block = `[Transcript upload: ${file.name}]\n${transcript}`;
        return trimmed ? `${trimmed}\n\n${block}` : block;
      });
      toast.success("Recording transcribed and added to notes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to transcribe recording");
    } finally {
      setUploadingTranscript(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addAction() {
    if (!newAction.trim()) return;
    const text = newAction.trim();
    setActionItems([...actionItems, { text, done: false, due_date: inferActionDueDate(text, meeting.meeting_date) }]);
    setNewAction("");
  }

  function toggleAction(idx: number) {
    setActionItems(actionItems.map((a, i) => i === idx ? { ...a, done: !a.done } : a));
  }

  function removeAction(idx: number) {
    setActionItems(actionItems.filter((_, i) => i !== idx));
  }

  function setActionDueDate(idx: number, dueDate: string) {
    setActionItems(actionItems.map((a, i) => i === idx ? { ...a, due_date: dueDate || undefined } : a));
  }

  function handleSave() {
    stopMic();
    const fd = new FormData();
    fd.set("content", content);
    fd.set(
      "action_items",
      JSON.stringify(
        actionItems.map((item) => ({
          ...item,
          due_date: item.due_date || inferActionDueDate(item.text, meeting.meeting_date),
        }))
      )
    );
    if (aiSummary) fd.set("ai_summary", aiSummary);
    onSave(fd);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {meeting.title}
          <Badge variant="outline" className="text-xs">{meeting.meeting_date}</Badge>
        </DialogTitle>
      </DialogHeader>

      {meeting.attendees.length > 0 && (
        <div className="text-sm text-muted-foreground">Attendees: {meeting.attendees.join(", ")}</div>
      )}

      {/* ─── Meeting Notes / Transcript ─────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Meeting Notes</Label>
          <div className="flex items-center gap-2">
            {isListening && (
              <div className="flex items-center gap-1.5 text-xs text-red-500 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                Recording...
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {isSupported ? (
                <Button
                  variant={isListening ? "destructive" : "outline"}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleToggleMic}
                  type="button"
                >
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {isListening ? "Stop" : "Dictate"}
                </Button>
              ) : (
                <span className="text-[10px] text-muted-foreground">Use Chrome for live dictation</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/mp4,video/mpeg,video/quicktime,video/webm,video/x-m4v,.m4a,.mp3,.wav,.aac,.mp4,.mov,.webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadTranscriptFile(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                type="button"
                disabled={uploadingTranscript}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingTranscript ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploadingTranscript ? "Transcribing..." : "Upload recording (free/local)"}
              </Button>
            </div>
          </div>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder={isListening ? "Listening... speak now 🎙️" : "Type your meeting notes here, or click Dictate to speak..."}
          className={`font-mono text-sm ${isListening ? "border-red-300 dark:border-red-700" : ""}`}
        />
        {debugInfo && (
          <div className="mt-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-[11px] font-mono text-muted-foreground">
            {debugInfo}
          </div>
        )}
      </div>

      <Separator />

      {/* ─── AI Summary ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">AI Summary</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleSummarize}
            disabled={summarizing}
            type="button"
          >
            {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summarizing ? "Summarizing..." : aiSummary ? "Re-summarize" : "Summarize Notes"}
          </Button>
        </div>
        {aiSummary ? (
          <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{aiSummary}</div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Click &quot;Summarize Notes&quot; to generate an AI summary. Uses your free Gemini API.
          </p>
        )}
      </div>

      <Separator />

      {/* ─── Action Items (at bottom) ───────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold">Action Items</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleExtractActions}
            disabled={extracting}
            type="button"
          >
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {extracting ? "Extracting..." : "Extract from Notes"}
          </Button>
        </div>
        {actionItems.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {actionItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <button
                  className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 ${
                    item.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-primary"
                  }`}
                  onClick={() => toggleAction(idx)}
                >
                  {item.done && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={`${item.done ? "line-through text-muted-foreground" : ""}`}>{item.text}</span>
                  <div className="mt-1">
                    <Input
                      type="date"
                      value={item.due_date || ""}
                      onChange={(e) => setActionDueDate(idx, e.target.value)}
                      className="h-7 w-[150px] text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeAction(idx)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Add an action item..."
            className="text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAction(); } }}
          />
          <Button variant="outline" size="sm" onClick={addAction} type="button">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => { stopMic(); onClose(); }}>Close</Button>
        <Button onClick={handleSave} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Main Meetings Component ─────────────────────────────────────────────

export function MeetingsClient({
  meetings: initMeetings,
  initialOpenMeetingId = null,
  linkedTaskCounts = {},
  actions,
}: MeetingsClientProps) {
  const [meetings, setMeetings] = useState(initMeetings);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MeetingNote | null>(null);
  const [busy, setBusy] = useState(false);

  // Sync from props when they change (server revalidation)
  useEffect(() => { setMeetings(initMeetings); }, [initMeetings]);

  useEffect(() => {
    if (!initialOpenMeetingId) return;
    const target = initMeetings.find((m) => m.id === initialOpenMeetingId);
    if (target) setEditingMeeting(target);
  }, [initialOpenMeetingId, initMeetings]);

  async function act(promise: Promise<{ success?: boolean; error?: string }>) {
    setBusy(true);
    const res = await promise;
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Done!");
      // Optimistic: refetch from props on next render via revalidation
    }
    setBusy(false);
  }

  async function handleFormAction(
    action: (fd: FormData) => Promise<{ success?: boolean; error?: string }>,
    e: React.FormEvent<HTMLFormElement>,
    onSuccess: () => void,
  ) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await action(fd);
    if (res?.error) toast.error(res.error);
    else { toast.success("Done!"); onSuccess(); }
    setBusy(false);
  }

  return (
    <>
      {/* Meeting list */}
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowAddMeeting(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Meeting
        </Button>
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">No meeting notes yet</p>
          <p className="text-sm mt-1">Click &quot;New Meeting&quot; to record your first advisor meeting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const actionCount = m.action_items?.length || 0;
            const doneActions = m.action_items?.filter((a: ActionItem) => a.done).length || 0;
            const syncedCount = linkedTaskCounts[m.id] || 0;
            return (
              <Card key={m.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setEditingMeeting(m)}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{m.title}</span>
                        <Badge variant="outline" className="text-xs">{m.meeting_date}</Badge>
                        {actionCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {doneActions}/{actionCount} actions done
                          </Badge>
                        )}
                        {syncedCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {syncedCount} synced task{syncedCount === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                      {m.attendees.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Attendees: {m.attendees.join(", ")}
                        </div>
                      )}
                      {m.content && (
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{m.content}</p>
                      )}
                      {/* Show action items preview on card */}
                      {actionCount > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {(m.action_items as ActionItem[]).slice(0, 3).map((a, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                              <div className={`h-3 w-3 rounded border flex items-center justify-center ${
                                a.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                              }`}>
                                {a.done && <Check className="h-2 w-2" />}
                              </div>
                              <span className={a.done ? "line-through text-muted-foreground" : ""}>{a.text}</span>
                            </div>
                          ))}
                          {actionCount > 3 && (
                            <p className="text-[10px] text-muted-foreground">+{actionCount - 3} more...</p>
                          )}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); act(actions.deleteMeetingNote(m.id)); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Meeting Dialog */}
      <Dialog open={showAddMeeting} onOpenChange={setShowAddMeeting}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Meeting</DialogTitle></DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.createMeetingNote, e, () => setShowAddMeeting(false))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Title *</Label>
                <Input name="title" required placeholder="e.g. Weekly advisor meeting" />
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <Input name="meeting_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
              </div>
            </div>
            <div>
              <Label className="text-xs">Attendees</Label>
              <Input name="attendees" placeholder="Comma-separated, e.g. Dr. Knowles, Lab Tech" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddMeeting(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Create Meeting</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Dialog (with MeetingDetail) */}
      <Dialog open={!!editingMeeting} onOpenChange={(v) => { if (!v) setEditingMeeting(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {editingMeeting && (
            <MeetingDetail
              meeting={editingMeeting}
              onSave={async (fd) => {
                const result = await actions.updateMeetingNote(editingMeeting.id, fd);
                if (result.error) {
                  toast.error(result.error);
                } else {
                  toast.success("Saved!");
                  // Auto-sync action items to Tasks
                  try {
                    const aiRaw = fd.get("action_items") as string;
                    if (aiRaw) {
                      const actionItems = JSON.parse(aiRaw) as ActionItem[];
                      const syncResult = await syncMeetingActionsToTasks(
                        editingMeeting.id,
                        editingMeeting.title,
                        actionItems
                      );
                      if (syncResult?.error) {
                        toast.error(syncResult.error);
                      } else if (syncResult) {
                        const synced = syncResult.synced || 0;
                        const removed = syncResult.removed || 0;
                        const preserved = syncResult.preserved || 0;
                        if (synced || removed || preserved) {
                          toast.success(
                            `Task sync: ${synced} new, ${removed} removed${preserved ? `, ${preserved} preserved` : ""}`
                          );
                        }
                      }
                    }
                  } catch { /* sync is best-effort */ }
                  setEditingMeeting(null);
                }
              }}
              onClose={() => setEditingMeeting(null)}
              busy={busy}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
