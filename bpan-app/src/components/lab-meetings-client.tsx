"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Loader2, Mic, Plus, Sparkles, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  createLabMeeting,
  createLabMeetingActionItems,
  deleteLabMeeting,
  deleteLabMeetingActionItem,
  updateLabMeeting,
  updateLabMeetingActionItem,
} from "@/app/(protected)/labs/actions";

type LabMeetingRecord = {
  id: string;
  lab_id: string;
  title: string;
  meeting_date: string;
  attendees: string[];
  content: string;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

type LabMeetingActionItemRecord = {
  id: string;
  lab_meeting_id: string;
  text: string;
  details: string | null;
  category: "general" | "inspection";
  status: "open" | "completed";
  responsible_member_id: string | null;
  responsible_label: string | null;
  source: "manual" | "ai";
  created_at: string;
  updated_at: string;
};

type MemberOption = {
  memberId: string;
  label: string;
};

type ExtractedActionDraft = {
  id: string;
  keep: boolean;
  text: string;
  category: "general" | "inspection";
  responsibleMemberId: string | null;
  responsibleLabel: string | null;
};

type LabMeetingsClientProps = {
  activeLabId: string;
  meetings: LabMeetingRecord[];
  actionItems: LabMeetingActionItemRecord[];
  memberOptions: MemberOption[];
};

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

  function stopForGood(msg: string) {
    wantRef.current = false;
    setIsListening(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current) try { recRef.current.abort(); } catch { /* ignore */ }
    setDebugInfo(msg);
    toast.error(msg, { duration: 8000 });
  }

  function startRec() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR || !wantRef.current) return;

    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* ignore */ }
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

    rec.onaudiostart = () => { setDebugInfo("Microphone active."); };
    rec.onspeechstart = () => { setDebugInfo("Speech detected."); rapidFailCount.current = 0; };

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
      if (preview) setDebugInfo(`Heard: ${preview.substring(0, 80)}${preview.length > 80 ? "..." : ""}`);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setDebugInfo(`Error: ${e.error}`);
      if (e.error === "not-allowed") {
        stopForGood("Microphone access denied. Check browser permissions.");
      } else if (e.error === "service-not-available") {
        stopForGood("Speech service unavailable. Please use Google Chrome.");
      }
    };

    rec.onend = () => {
      const elapsed = Date.now() - startTimeRef.current;
      if (!wantRef.current) {
        setDebugInfo("Stopped.");
        return;
      }
      if (elapsed < 2000 && !gotResultRef.current) {
        rapidFailCount.current++;
        if (rapidFailCount.current >= 3) {
          stopForGood("Speech recognition is not working in this browser. Please use Google Chrome.");
          return;
        }
        const delay = 500 * Math.pow(2, rapidFailCount.current - 1);
        setDebugInfo(`Ended quickly. Retry ${rapidFailCount.current}/3 in ${delay}ms...`);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, delay);
      } else {
        rapidFailCount.current = 0;
        setDebugInfo("Paused. Auto-restarting...");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, 300);
      }
    };

    try {
      rec.start();
      setDebugInfo("Listening...");
    } catch (err) {
      setDebugInfo(`Start failed: ${String(err)}`);
      rapidFailCount.current++;
      if (rapidFailCount.current >= 3) {
        stopForGood("Speech recognition failed to start. Please use Google Chrome.");
        return;
      }
      if (wantRef.current) timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, 1000);
    }
  }

  function toggle() {
    if (wantRef.current) {
      wantRef.current = false;
      setIsListening(false);
      rapidFailCount.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recRef.current) try { recRef.current.stop(); } catch { /* ignore */ }
      setDebugInfo("Stopped.");
      return;
    }
    rapidFailCount.current = 0;
    wantRef.current = true;
    setIsListening(true);
    startRec();
  }

  function stop() {
    wantRef.current = false;
    setIsListening(false);
    rapidFailCount.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current) try { recRef.current.stop(); } catch { /* ignore */ }
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const has = Boolean(w?.SpeechRecognition || w?.webkitSpeechRecognition);
    setIsSupported(has);
    setDebugInfo(has ? "Speech API available" : "Speech API not available in this browser");
    return () => {
      wantRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recRef.current) try { recRef.current.abort(); } catch { /* ignore */ }
    };
  }, []);

  return { isListening, isSupported, debugInfo, toggle, stop };
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString();
}

function uniqueAttendees(raw: string) {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item, idx, arr) => item.length > 0 && arr.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === idx)
    .join(", ");
}

export function LabMeetingsClient({ activeLabId, meetings: initialMeetings, actionItems: initialActionItems, memberOptions }: LabMeetingsClientProps) {
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"meetings" | "detail">("meetings");
  const [meetingPanelMode, setMeetingPanelMode] = useState<"existing" | "new">("existing");
  const [meetings, setMeetings] = useState<LabMeetingRecord[]>(initialMeetings);
  const [actionItems, setActionItems] = useState<LabMeetingActionItemRecord[]>(initialActionItems);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(initialMeetings[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingDate, setNewMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [boardFilter, setBoardFilter] = useState<"all" | "open" | "completed">("open");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "general" | "inspection">("all");
  const [search, setSearch] = useState("");
  const [extractDraft, setExtractDraft] = useState<ExtractedActionDraft[]>([]);
  const insertedDictationPrefixRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsNarrowMobile(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  function isMissingMeetingsTableError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return message.includes("public.lab_meetings") || message.includes("lab_meetings");
  }

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId],
  );

  const attendeesText = selectedMeeting ? (selectedMeeting.attendees || []).join(", ") : "";
  const { isListening, isSupported, debugInfo, toggle: toggleMic } = useSpeechToText((chunk) => {
    if (!selectedMeetingId) return;
    setMeetings((prev) =>
      prev.map((meeting) => {
        if (meeting.id !== selectedMeetingId) return meeting;
        const trimmed = (meeting.content || "").trimEnd();
        if (!insertedDictationPrefixRef.current) {
          insertedDictationPrefixRef.current = true;
          return { ...meeting, content: trimmed ? `${trimmed}\n\n${chunk}` : chunk };
        }
        return { ...meeting, content: trimmed ? `${trimmed} ${chunk}` : chunk };
      }),
    );
  });

  const boardRows = useMemo(() => {
    const meetingTitleById = new Map(meetings.map((meeting) => [meeting.id, meeting.title]));
    return actionItems
      .map((item) => ({ ...item, meetingTitle: meetingTitleById.get(item.lab_meeting_id) || "Meeting" }))
      .filter((item) => (boardFilter === "all" ? true : item.status === boardFilter))
      .filter((item) => (categoryFilter === "all" ? true : item.category === categoryFilter))
      .filter((item) => {
        if (!search.trim()) return true;
        const haystack = `${item.text} ${item.details || ""} ${item.responsible_label || ""} ${item.meetingTitle}`.toLowerCase();
        return haystack.includes(search.trim().toLowerCase());
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [actionItems, boardFilter, categoryFilter, meetings, search]);

  async function runBusy<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    return await new Promise<T>((resolve, reject) => {
      startTransition(() => {
        void fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            setBusy((current) => (current === key ? null : current));
          });
      });
    });
  }

  async function createMeeting() {
    const title = newMeetingTitle.trim();
    if (!title) {
      toast.error("Meeting title is required.");
      return;
    }

    try {
      const row = await runBusy("create-meeting", async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("title", title);
        formData.set("meeting_date", newMeetingDate || new Date().toISOString().slice(0, 10));
        return await createLabMeeting(formData);
      });
      setMeetings((prev) => [row as LabMeetingRecord, ...prev]);
      setSelectedMeetingId(String((row as LabMeetingRecord).id));
      setNewMeetingTitle("");
      setMeetingPanelMode("existing");
      if (isNarrowMobile) setMobileView("detail");
      toast.success("Lab meeting created.");
    } catch (error) {
      if (isMissingMeetingsTableError(error)) {
        const localRow: LabMeetingRecord = {
          id: `local-meeting-${crypto.randomUUID()}`,
          lab_id: activeLabId,
          title,
          meeting_date: newMeetingDate || new Date().toISOString().slice(0, 10),
          attendees: [],
          content: "",
          ai_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setMeetings((prev) => [localRow, ...prev]);
        setSelectedMeetingId(localRow.id);
        setNewMeetingTitle("");
        setMeetingPanelMode("existing");
        if (isNarrowMobile) setMobileView("detail");
        toast.warning("Meetings table is unavailable, so this meeting is local-only and won't persist after refresh.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Failed to create meeting.");
    }
  }

  async function saveMeeting() {
    if (!selectedMeeting) return;
    try {
      const row = await runBusy(`save-meeting-${selectedMeeting.id}`, async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("meeting_id", selectedMeeting.id);
        formData.set("title", selectedMeeting.title);
        formData.set("meeting_date", selectedMeeting.meeting_date);
        formData.set("attendees", uniqueAttendees(attendeesText));
        formData.set("content", selectedMeeting.content || "");
        formData.set("ai_summary", selectedMeeting.ai_summary || "");
        return await updateLabMeeting(formData);
      });

      setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? (row as LabMeetingRecord) : meeting)));
      toast.success("Meeting saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save meeting.");
    }
  }

  async function removeMeeting(meetingId: string) {
    try {
      await runBusy(`delete-meeting-${meetingId}`, async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("meeting_id", meetingId);
        await deleteLabMeeting(formData);
      });

      setMeetings((prev) => prev.filter((meeting) => meeting.id !== meetingId));
      setActionItems((prev) => prev.filter((item) => item.lab_meeting_id !== meetingId));
      if (selectedMeetingId === meetingId) {
        const nextMeeting = meetings.find((meeting) => meeting.id !== meetingId);
        setSelectedMeetingId(nextMeeting?.id ?? null);
        if (isNarrowMobile && !nextMeeting) setMobileView("meetings");
      }
      toast.success("Meeting deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete meeting.");
    }
  }

  async function extractActions() {
    if (!selectedMeeting || !selectedMeeting.content.trim()) {
      toast.error("Add transcript/notes first.");
      return;
    }

    setExtracting(true);
    try {
      const res = await fetch("/api/labs/meeting-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extract_actions",
          labId: activeLabId,
          text: selectedMeeting.content,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to extract action items.");

      const items: Array<{
        text?: string;
        category?: string;
        responsibleMemberId?: string | null;
        responsibleLabel?: string | null;
      }> = Array.isArray(data.items) ? data.items : [];
      const drafts: ExtractedActionDraft[] = [];
      for (const item of items) {
        const text = String(item.text || "").trim();
        if (!text) continue;
        drafts.push({
          id: crypto.randomUUID(),
          keep: true,
          text,
          category: item.category === "inspection" ? "inspection" : "general",
          responsibleMemberId: item.responsibleMemberId ? String(item.responsibleMemberId) : null,
          responsibleLabel: item.responsibleLabel ? String(item.responsibleLabel) : null,
        });
      }

      setExtractDraft(drafts);
      if (drafts.length === 0) toast.info("No action items found.");
      else toast.success(`Extracted ${drafts.length} action item${drafts.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to extract action items.");
    } finally {
      setExtracting(false);
    }
  }

  async function summarizeMeeting() {
    if (!selectedMeeting || !selectedMeeting.content.trim()) {
      toast.error("Add transcript/notes first.");
      return;
    }

    setSummarizing(true);
    try {
      const actionItemLines = actionItems
        .filter((item) => item.lab_meeting_id === selectedMeeting.id)
        .map((item) => `${item.status === "completed" ? "[DONE]" : "[ ]"} ${item.text}`)
        .join("\n");
      const res = await fetch("/api/labs/meeting-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "meeting_summary",
          labId: activeLabId,
          text: selectedMeeting.content,
          actionItems: actionItemLines,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to summarize meeting.");

      setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? { ...meeting, ai_summary: String(data.result || "") } : meeting)));
      toast.success("Summary generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to summarize meeting.");
    } finally {
      setSummarizing(false);
    }
  }

  async function saveKeptExtractedItems() {
    if (!selectedMeeting) return;
    const kept = extractDraft.filter((item) => item.keep && item.text.trim().length > 0);
    if (kept.length === 0) {
      toast.info("No selected items to add.");
      return;
    }

    try {
      const rows = await runBusy("save-extracted-actions", async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("meeting_id", selectedMeeting.id);
        formData.set(
          "items_json",
          JSON.stringify(
            kept.map((item) => ({
              text: item.text,
              category: item.category,
              status: "open",
              responsibleMemberId: item.responsibleMemberId,
              responsibleLabel: item.responsibleLabel,
              source: "ai",
            })),
          ),
        );
        return await createLabMeetingActionItems(formData);
      });

      setActionItems((prev) => [...(rows as LabMeetingActionItemRecord[]), ...prev]);
      setExtractDraft([]);
      toast.success(`Added ${kept.length} action item${kept.length === 1 ? "" : "s"} to the board.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add extracted action items.");
    }
  }

  async function toggleActionStatus(item: LabMeetingActionItemRecord) {
    const nextStatus = item.status === "open" ? "completed" : "open";
    try {
      const row = await runBusy(`toggle-item-${item.id}`, async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("action_item_id", item.id);
        formData.set("text", item.text);
        formData.set("details", item.details || "");
        formData.set("category", item.category);
        formData.set("status", nextStatus);
        formData.set("responsible_member_id", item.responsible_member_id || "");
        formData.set("responsible_label", item.responsible_label || "");
        return await updateLabMeetingActionItem(formData);
      });
      setActionItems((prev) => prev.map((entry) => (entry.id === item.id ? (row as LabMeetingActionItemRecord) : entry)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update action item.");
    }
  }

  async function updateActionAssignee(item: LabMeetingActionItemRecord, memberId: string) {
    const member = memberOptions.find((option) => option.memberId === memberId);
    try {
      const row = await runBusy(`assign-item-${item.id}`, async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("action_item_id", item.id);
        formData.set("text", item.text);
        formData.set("details", item.details || "");
        formData.set("category", item.category);
        formData.set("status", item.status);
        formData.set("responsible_member_id", member?.memberId || "");
        formData.set("responsible_label", member?.label || "");
        return await updateLabMeetingActionItem(formData);
      });
      setActionItems((prev) => prev.map((entry) => (entry.id === item.id ? (row as LabMeetingActionItemRecord) : entry)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update assignee.");
    }
  }

  async function removeActionItem(itemId: string) {
    try {
      await runBusy(`delete-item-${itemId}`, async () => {
        const formData = new FormData();
        formData.set("lab_id", activeLabId);
        formData.set("active_lab_id", activeLabId);
        formData.set("action_item_id", itemId);
        await deleteLabMeetingActionItem(formData);
      });
      setActionItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete action item.");
    }
  }

  function handleSelectMeeting(meetingId: string) {
    setSelectedMeetingId(meetingId);
    if (isNarrowMobile) setMobileView("detail");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant={meetingPanelMode === "existing" ? "default" : "outline"}
          size="sm"
          className={meetingPanelMode === "existing" ? "h-8 bg-slate-900 px-3 text-xs text-white hover:bg-slate-800" : "h-8 border-slate-200 px-3 text-xs"}
          onClick={() => {
            setMeetingPanelMode("existing");
            if (isNarrowMobile) setMobileView("meetings");
          }}
        >
          Existing meetings
        </Button>
        <Button
          type="button"
          variant={meetingPanelMode === "new" ? "default" : "outline"}
          size="sm"
          className={meetingPanelMode === "new" ? "h-8 bg-slate-900 px-3 text-xs text-white hover:bg-slate-800" : "h-8 border-slate-200 px-3 text-xs"}
          onClick={() => {
            setMeetingPanelMode("new");
            if (isNarrowMobile) setMobileView("meetings");
          }}
        >
          Add new meeting
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={`border-slate-200 ${isNarrowMobile && mobileView === "detail" ? "hidden" : ""}`}>
          <CardContent className="space-y-2.5 p-2.5 sm:space-y-3 sm:p-3">
            {meetingPanelMode === "new" ? (
              <div className="space-y-2">
                <Label className="text-xs">New lab meeting</Label>
                <Input className="h-9 text-sm" value={newMeetingTitle} onChange={(e) => setNewMeetingTitle(e.target.value)} placeholder="Weekly Lab Meeting" />
                <Input className="h-9 text-sm" type="date" value={newMeetingDate} onChange={(e) => setNewMeetingDate(e.target.value)} />
                <Button type="button" className="h-9 w-full text-sm" onClick={createMeeting} disabled={busy === "create-meeting"}>
                  {busy === "create-meeting" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Create meeting
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {meetings.length === 0 ? (
                  <p className="text-xs text-slate-500">No meetings yet.</p>
                ) : (
                  meetings.map((meeting) => {
                    const count = actionItems.filter((item) => item.lab_meeting_id === meeting.id).length;
                    const isSelected = meeting.id === selectedMeetingId;
                    return (
                      <button
                      key={meeting.id}
                      type="button"
                      onClick={() => handleSelectMeeting(meeting.id)}
                      className={`w-full rounded-xl border px-2.5 py-2 text-left transition ${
                        isSelected ? "border-slate-300 bg-slate-100" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                        <p className="text-sm font-medium text-slate-900">{meeting.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{formatDate(meeting.meeting_date)} • {count} actions</p>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`border-slate-200 ${isNarrowMobile && mobileView === "meetings" ? "hidden" : ""}`}>
          <CardContent className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
            {!selectedMeeting ? (
              <p className="text-sm text-slate-500">Select a meeting to edit notes, transcribe, and extract action items.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isNarrowMobile ? (
                      <button
                        type="button"
                        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600"
                        onClick={() => setMobileView("meetings")}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to meetings
                      </button>
                    ) : null}
                    <Input
                      className="h-9 text-sm"
                      value={selectedMeeting.title}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? { ...meeting, title: value } : meeting)));
                      }}
                    />
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <Input
                        type="date"
                        className="h-8 w-32 text-xs sm:w-40"
                        value={selectedMeeting.meeting_date}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? { ...meeting, meeting_date: value } : meeting)));
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={saveMeeting} disabled={busy === `save-meeting-${selectedMeeting.id}`}>
                      {busy === `save-meeting-${selectedMeeting.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5" onClick={() => removeMeeting(selectedMeeting.id)} disabled={busy === `delete-meeting-${selectedMeeting.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Attendees (comma separated)</Label>
                  <Input
                    className="h-9 text-sm"
                    value={attendeesText}
                    onChange={(event) => {
                      const attendees = event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter((item) => item.length > 0);
                      setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? { ...meeting, attendees } : meeting)));
                    }}
                    placeholder="Alex, Priya, Omar"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs">Transcript / notes</Label>
                    <div className="flex items-center gap-2">
                      {isSupported ? (
                        <Button
                          type="button"
                          variant={isListening ? "destructive" : "outline"}
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => {
                            if (!isListening) insertedDictationPrefixRef.current = false;
                            toggleMic();
                          }}
                        >
                          <Mic className="mr-1 h-3.5 w-3.5" />
                          {isListening ? "Stop Dictate" : "Dictate"}
                        </Button>
                      ) : null}
                      <Badge variant="outline" className="text-[10px]"><Mic className="mr-1 h-3 w-3" />Transcribe</Badge>
                    </div>
                  </div>
                  <Textarea
                    rows={8}
                    value={selectedMeeting.content}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? { ...meeting, content: value } : meeting)));
                    }}
                    placeholder="Paste transcript or type notes here..."
                  />
                  {debugInfo ? <p className="text-[11px] text-slate-500">{debugInfo}</p> : null}
                </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={extractActions} disabled={extracting}>
                      {extracting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                      Extract actions (Lab AI)
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={summarizeMeeting} disabled={summarizing}>
                      {summarizing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                      Summarize (Lab AI)
                    </Button>
                  </div>

                  {extractDraft.length > 0 ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-800">Review extracted action items before adding to board</p>
                        <Button type="button" size="sm" className="h-8 px-2.5 text-xs" onClick={saveKeptExtractedItems} disabled={busy === "save-extracted-actions"}>
                          {busy === "save-extracted-actions" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                          Add selected
                        </Button>
                      </div>
                      {extractDraft.map((item) => (
                        <div key={item.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
                          <input
                            type="checkbox"
                            checked={item.keep}
                            onChange={(event) => setExtractDraft((prev) => prev.map((row) => (row.id === item.id ? { ...row, keep: event.target.checked } : row)))}
                          />
                          <Input
                            className="h-8 text-xs"
                            value={item.text}
                            onChange={(event) => setExtractDraft((prev) => prev.map((row) => (row.id === item.id ? { ...row, text: event.target.value } : row)))}
                          />
                          <select
                            value={item.category}
                            onChange={(event) =>
                              setExtractDraft((prev) => prev.map((row) => (row.id === item.id ? { ...row, category: event.target.value === "inspection" ? "inspection" : "general" } : row)))
                            }
                            className="h-9 rounded-md border border-input bg-white px-2 text-xs"
                          >
                            <option value="general">General</option>
                            <option value="inspection">Inspection</option>
                          </select>
                          <select
                            value={item.responsibleMemberId || ""}
                            onChange={(event) => {
                              const member = memberOptions.find((option) => option.memberId === event.target.value);
                              setExtractDraft((prev) =>
                                prev.map((row) =>
                                  row.id === item.id
                                    ? { ...row, responsibleMemberId: member?.memberId || null, responsibleLabel: member?.label || null }
                                    : row,
                                ),
                              );
                            }}
                            className="h-9 rounded-md border border-input bg-white px-2 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {memberOptions.map((member) => (
                              <option key={`extract-member-${item.id}-${member.memberId}`} value={member.memberId}>
                                {member.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">AI summary</Label>
                  <Textarea
                    rows={5}
                    value={selectedMeeting.ai_summary || ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMeetings((prev) => prev.map((meeting) => (meeting.id === selectedMeeting.id ? { ...meeting, ai_summary: value } : meeting)));
                    }}
                    placeholder="Lab AI summary appears here..."
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Action Item Board (all lab meetings)</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions" className="h-8 w-40 text-xs sm:h-9 sm:w-44 sm:text-sm" />
              <select value={boardFilter} onChange={(e) => setBoardFilter(e.target.value as "all" | "open" | "completed")} className="h-9 rounded-md border border-input bg-white px-2 text-xs">
                <option value="open">Open</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | "general" | "inspection")} className="h-9 rounded-md border border-input bg-white px-2 text-xs">
                <option value="all">All categories</option>
                <option value="general">General</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {boardRows.length === 0 ? (
              <p className="text-sm text-slate-500">No action items match your filters.</p>
            ) : (
              boardRows.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm font-medium ${item.status === "completed" ? "text-slate-500 line-through" : "text-slate-900"}`}>{item.text}</p>
                      {item.details ? <p className="mt-0.5 text-xs text-slate-600">{item.details}</p> : null}
                      <p className="mt-1 text-[11px] text-slate-500">{item.meetingTitle}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                      <Badge variant={item.source === "ai" ? "outline" : "secondary"} className="text-[10px]">{item.source === "ai" ? "AI" : "Manual"}</Badge>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={item.responsible_member_id || ""}
                      onChange={(event) => void updateActionAssignee(item, event.target.value)}
                      className="h-9 min-w-44 rounded-md border border-input bg-white px-2 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {memberOptions.map((member) => (
                        <option key={`board-member-${item.id}-${member.memberId}`} value={member.memberId}>
                          {member.label}
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" variant="outline" onClick={() => void toggleActionStatus(item)} disabled={busy === `toggle-item-${item.id}`}>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      {item.status === "open" ? "Mark done" : "Re-open"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void removeActionItem(item.id)} disabled={busy === `delete-item-${item.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><User className="h-3 w-3" />{item.responsible_label || "Unassigned"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
