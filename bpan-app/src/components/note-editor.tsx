"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, X } from "lucide-react";

const NOTE_TYPES = [
  { value: "finding", label: "Finding" },
  { value: "method", label: "Method" },
  { value: "limitation", label: "Limitation" },
  { value: "general", label: "General" },
];

interface NoteEditorProps {
  paperId: string;
  highlightText?: string | null;
  pageNumber?: number | null;
  initialContent?: string;
  initialType?: string;
  initialTags?: string[];
  noteId?: string;
  createAction: (formData: FormData) => Promise<void>;
  updateAction?: (formData: FormData) => Promise<void>;
  onCancel?: () => void;
  paperTitle?: string;
  paperAbstract?: string;
}

export function NoteEditor({
  paperId,
  highlightText,
  pageNumber,
  initialContent = "",
  initialType = "general",
  initialTags = [],
  noteId,
  createAction,
  updateAction,
  onCancel,
  paperTitle,
  paperAbstract,
}: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [noteType, setNoteType] = useState(initialType);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const isEdit = !!noteId;

  async function handleAiAssist() {
    if (!highlightText) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/note-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          highlight: highlightText,
          paperTitle: paperTitle || "",
          paperAbstract: paperAbstract || "",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setContent(data.content);
        if (data.noteType) setNoteType(data.noteType);
        if (data.suggestedTags?.length) {
          setTags((prev) => [...new Set([...prev, ...data.suggestedTags])]);
        }
      }
    } catch (err) {
      console.error("AI assist failed:", err);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("paper_id", paperId);
      formData.set("content", content);
      formData.set("note_type", noteType);
      formData.set("tags", tags.join(","));

      if (isEdit && updateAction) {
        formData.set("note_id", noteId);
        await updateAction(formData);
      } else {
        if (highlightText) formData.set("highlight_text", highlightText);
        if (pageNumber != null) formData.set("page_number", String(pageNumber));
        await createAction(formData);
      }

      if (!isEdit) {
        setContent("");
        setNoteType("general");
        setTags([]);
      }
      onCancel?.();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-3">
      {highlightText && (
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-sm border border-yellow-200 dark:border-yellow-900">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">Highlighted text</p>
          <p className="text-foreground/80 line-clamp-3">&ldquo;{highlightText}&rdquo;</p>
        </div>
      )}

      {highlightText && !content && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAiAssist}
          disabled={aiLoading}
          className="gap-1.5 w-full"
        >
          {aiLoading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating note...</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" /> AI-generate note from highlight</>
          )}
        </Button>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="note-content" className="text-xs">Note</Label>
        <textarea
          id="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your note..."
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Type</Label>
        <div className="flex flex-wrap gap-1.5">
          {NOTE_TYPES.map((t) => (
            <Button
              key={t.value}
              type="button"
              variant={noteType === t.value ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNoteType(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tags</Label>
        <div className="flex gap-1.5">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag..."
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={addTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs gap-1">
                {tag}
                <button type="button" onClick={() => removeTag(tag)}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={loading || !content.trim()}>
          {loading ? "Saving..." : isEdit ? "Update" : "Save note"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
