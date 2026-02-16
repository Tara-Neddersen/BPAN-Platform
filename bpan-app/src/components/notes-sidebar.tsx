"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Sparkles,
  Trash2,
  Pencil,
  MessageSquare,
  Check,
  X,
  Plus,
  ExternalLink,
  ClipboardPaste,
} from "lucide-react";
import type { Note } from "@/types";

const TYPE_COLORS: Record<string, string> = {
  finding:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  method:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  limitation:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  general:
    "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
};

interface NotesSidebarProps {
  paperId: string;
  paperTitle: string;
  paperAbstract: string;
  paperAuthors: string[];
  paperJournal: string | null;
  paperPubDate: string | null;
  paperPmid: string;
  paperDoi: string | null;
  citation: string;
  notes: Note[];
  pendingHighlight: { text: string; page: number } | null;
  onClearHighlight: () => void;
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

interface ProcessedNote {
  highlight: string;
  page: number;
  content: string;
  noteType: string;
  tags: string[];
  status: "processing" | "ready" | "saving" | "error";
  error?: string;
}

export function NotesSidebar({
  paperId,
  paperTitle,
  paperAbstract,
  paperAuthors,
  paperJournal,
  paperPubDate,
  paperPmid,
  paperDoi,
  citation,
  notes,
  pendingHighlight,
  onClearHighlight,
  createAction,
  updateAction,
  deleteAction,
}: NotesSidebarProps) {
  const [processedNote, setProcessedNote] = useState<ProcessedNote | null>(
    null
  );
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualContent, setManualContent] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${paperPmid}/`;
  const doiUrl = paperDoi ? `https://doi.org/${paperDoi}` : null;

  // When a new highlight comes in from the PDF viewer, auto-process it
  const processHighlight = useCallback(
    async (text: string, page: number) => {
      setProcessedNote({
        highlight: text,
        page,
        content: "",
        noteType: "general",
        tags: [],
        status: "processing",
      });

      try {
        const res = await fetch("/api/note-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            highlight: text,
            paperTitle,
            paperAbstract,
            authors: paperAuthors,
            journal: paperJournal,
            pubDate: paperPubDate,
          }),
        });

        if (!res.ok) throw new Error("AI processing failed");
        const data = await res.json();

        // Append citation to the AI-generated content
        const noteContent = `${data.content || text}\n\n— ${citation}`;

        setProcessedNote({
          highlight: text,
          page,
          content: noteContent,
          noteType: data.noteType || "general",
          tags: data.suggestedTags || [],
          status: "ready",
        });
      } catch (err) {
        setProcessedNote((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                error:
                  err instanceof Error ? err.message : "AI processing failed",
              }
            : null
        );
      }
    },
    [paperTitle, paperAbstract, paperAuthors, paperJournal, paperPubDate, citation]
  );

  // React to new highlights from the PDF viewer
  useEffect(() => {
    if (pendingHighlight) {
      processHighlight(pendingHighlight.text, pendingHighlight.page);
    }
  }, [pendingHighlight, processHighlight]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain").trim();
      if (!text) return;
      if (pasteRef.current) pasteRef.current.value = "";
      processHighlight(text, 0);
    },
    [processHighlight]
  );

  async function savePendingNote() {
    if (!processedNote || processedNote.status !== "ready") return;
    setProcessedNote((prev) =>
      prev ? { ...prev, status: "saving" } : null
    );

    try {
      const formData = new FormData();
      formData.set("paper_id", paperId);
      formData.set("content", processedNote.content);
      formData.set("note_type", processedNote.noteType);
      formData.set("highlight_text", processedNote.highlight);
      formData.set("page_number", String(processedNote.page));
      formData.set("tags", processedNote.tags.join(","));
      await createAction(formData);
      setProcessedNote(null);
      onClearHighlight();
    } catch {
      setProcessedNote((prev) =>
        prev ? { ...prev, status: "error", error: "Failed to save" } : null
      );
    }
  }

  async function saveManualNote() {
    if (!manualContent.trim()) return;
    setManualSaving(true);
    try {
      const formData = new FormData();
      formData.set("paper_id", paperId);
      formData.set("content", manualContent.trim());
      formData.set("note_type", "general");
      formData.set("tags", "");
      await createAction(formData);
      setManualContent("");
      setShowManual(false);
    } catch (err) {
      console.error(err);
    } finally {
      setManualSaving(false);
    }
  }

  async function handleEditSave(noteId: string) {
    if (!editContent.trim()) return;
    const formData = new FormData();
    formData.set("note_id", noteId);
    formData.set("paper_id", paperId);
    formData.set("content", editContent.trim());
    formData.set("note_type", "general");
    formData.set("tags", "");
    await updateAction(formData);
    setEditingNoteId(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Notes ({notes.length})
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowManual(!showManual)}
        >
          <Plus className="h-3 w-3" />
          Manual
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* AI-processed note from highlight */}
        {processedNote && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
            {/* Highlight preview */}
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-xs border border-yellow-200 dark:border-yellow-900">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-yellow-700 dark:text-yellow-400">
                  Highlighted text
                </span>
                {processedNote.page > 0 && (
                  <span className="text-muted-foreground">
                    p. {processedNote.page}
                  </span>
                )}
              </div>
              <p className="text-foreground/80 line-clamp-4">
                &ldquo;{processedNote.highlight}&rdquo;
              </p>
            </div>

            {/* Processing state */}
            {processedNote.status === "processing" && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI is writing your note...
              </div>
            )}

            {/* Error state */}
            {processedNote.status === "error" && (
              <div className="text-center py-2 space-y-2">
                <p className="text-sm text-destructive">
                  {processedNote.error}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      processHighlight(
                        processedNote.highlight,
                        processedNote.page
                      )
                    }
                  >
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setProcessedNote(null);
                      onClearHighlight();
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {/* Ready / Saving state */}
            {(processedNote.status === "ready" ||
              processedNote.status === "saving") && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Sparkles className="h-3 w-3" />
                    AI-generated note
                  </div>
                  <textarea
                    value={processedNote.content}
                    onChange={(e) =>
                      setProcessedNote((prev) =>
                        prev ? { ...prev, content: e.target.value } : null
                      )
                    }
                    rows={5}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Type & Tags */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[processedNote.noteType] || TYPE_COLORS.general}`}
                  >
                    {processedNote.noteType}
                  </span>
                  {processedNote.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={savePendingNote}
                    disabled={processedNote.status === "saving"}
                  >
                    {processedNote.status === "saving" ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-3 w-3" /> Save note
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProcessedNote(null);
                      onClearHighlight();
                    }}
                    disabled={processedNote.status === "saving"}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Paste zone (for paywalled papers without PDF viewer) */}
        {!processedNote && !pendingHighlight && (
          <div className="relative">
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 transition-colors">
              <div className="flex flex-col items-center justify-center py-4 px-3 pointer-events-none">
                <ClipboardPaste className="h-5 w-5 text-primary/60 mb-1.5" />
                <p className="text-xs font-medium text-primary/80">
                  Paste text or highlight in PDF
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Select text → Cmd+C → click here → Cmd+V
                </p>
              </div>
              <textarea
                ref={pasteRef}
                onPaste={handlePaste}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Paste highlighted text here"
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!processedNote && notes.length === 0 && !showManual && (
          <div className="text-center py-4 space-y-1">
            <p className="text-xs text-muted-foreground">
              No notes yet — highlight text in the PDF or paste copied text above
            </p>
          </div>
        )}

        {/* Manual note */}
        {showManual && (
          <>
            <div className="rounded-lg border p-3 space-y-2">
              <textarea
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
                placeholder="Type a note..."
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={saveManualNote}
                  disabled={manualSaving || !manualContent.trim()}
                >
                  {manualSaving ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowManual(false);
                    setManualContent("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Saved notes list */}
        {notes.map((note) =>
          editingNoteId === note.id ? (
            <div key={note.id} className="rounded-lg border p-3 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEditSave(note.id)}
                >
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingNoteId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div key={note.id} className="rounded-lg border p-3 space-y-2">
              {/* Highlight excerpt */}
              {note.highlight_text && (
                <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950/30 rounded px-2 py-1 border border-yellow-200 dark:border-yellow-900">
                  &ldquo;
                  {note.highlight_text.length > 120
                    ? note.highlight_text.slice(0, 120) + "..."
                    : note.highlight_text}
                  &rdquo;
                  {note.page_number && (
                    <span className="ml-1">(p. {note.page_number})</span>
                  )}
                </div>
              )}

              {/* Note content — render citation link if present */}
              <div className="text-sm leading-relaxed whitespace-pre-line">
                {renderNoteContent(note.content, pubmedUrl, doiUrl)}
              </div>

              {/* Type & Tags */}
              <div className="flex flex-wrap items-center gap-1.5">
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

              {/* Actions */}
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingNoteId(note.id);
                    setEditContent(note.content);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <form action={deleteAction}>
                  <input type="hidden" name="note_id" value={note.id} />
                  <input type="hidden" name="paper_id" value={paperId} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </form>
                <a
                  href={pubmedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Render note content, making the "— Citation" line a clickable link.
 */
function renderNoteContent(
  content: string,
  pubmedUrl: string,
  doiUrl: string | null
) {
  // Split on the citation line (starts with "— ")
  const citationMatch = content.match(/\n\n— (.+)$/);
  if (!citationMatch) {
    return <>{content}</>;
  }

  const noteBody = content.slice(0, citationMatch.index);
  const citationText = citationMatch[1];
  const link = doiUrl || pubmedUrl;

  return (
    <>
      {noteBody}
      {"\n\n"}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      >
        — {citationText}
        <ExternalLink className="h-3 w-3 inline" />
      </a>
    </>
  );
}
