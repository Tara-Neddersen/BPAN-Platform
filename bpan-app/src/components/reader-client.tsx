"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesSidebar } from "@/components/notes-sidebar";
import {
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Loader2,
  Link,
  X,
} from "lucide-react";
import type { Note, SavedPaper } from "@/types";

const PdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading viewer...</span>
      </div>
    ),
  }
);

interface ReaderClientProps {
  paper: SavedPaper;
  notes: Note[];
  initialPdfUrl: string | null;
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

export function ReaderClient({
  paper,
  notes,
  initialPdfUrl,
  createAction,
  updateAction,
  deleteAction,
}: ReaderClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl);
  const [linkInput, setLinkInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<{
    text: string;
    page: number;
  } | null>(null);

  const handleTextSelect = useCallback((text: string, page: number) => {
    setPendingHighlight({ text, page });
  }, []);

  const handleClearHighlight = useCallback(() => {
    setPendingHighlight(null);
  }, []);

  async function handleLinkSubmit() {
    const url = linkInput.trim();
    if (!url) return;

    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/link-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, driveUrl: url }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save link");
      }

      const data = await res.json();
      setPdfUrl(data.proxyUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveLink() {
    try {
      await fetch("/api/link-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, driveUrl: null }),
      });
      setPdfUrl(null);
      setLinkInput("");
    } catch {
      // ignore
    }
  }

  const citation = buildCitation(paper);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -mx-4 -my-6">
      {/* Left: PDF viewer or link input */}
      <div className="flex-1 min-w-0 flex flex-col">
        {pdfUrl ? (
          <>
            {/* Thin bar above PDF with option to change link */}
            <div className="flex items-center justify-between px-3 py-1 border-b bg-muted/30 shrink-0">
              <span className="text-xs text-muted-foreground truncate">
                {paper.title}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-muted-foreground"
                onClick={handleRemoveLink}
              >
                <X className="h-3 w-3" /> Remove PDF
              </Button>
            </div>
            <PdfViewer url={pdfUrl} onCreateNote={handleTextSelect} />
          </>
        ) : (
          /* Link input zone */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-5 max-w-lg w-full">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-1">{paper.title}</h2>
                <p className="text-sm text-muted-foreground">
                  Paste a Google Drive link to the PDF to start reading and
                  taking notes
                </p>
              </div>

              {/* Link input */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="https://drive.google.com/file/d/..."
                      className="pl-9"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleLinkSubmit();
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleLinkSubmit}
                    disabled={saving || !linkInput.trim()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Load PDF"
                    )}
                  </Button>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>

              {/* Instructions */}
              <div className="rounded-lg bg-muted/40 p-4 text-left space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  How to get the link
                </p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>
                    Download the PDF from the journal (use your Stanford login)
                  </li>
                  <li>Upload it to your Google Drive</li>
                  <li>
                    Right-click → Share → Change to{" "}
                    <span className="font-medium text-foreground">
                      &ldquo;Anyone with the link&rdquo;
                    </span>
                  </li>
                  <li>Copy the link and paste it above</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-16 z-10 h-8 w-8"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? (
          <PanelRightClose className="h-4 w-4" />
        ) : (
          <PanelRightOpen className="h-4 w-4" />
        )}
      </Button>

      {/* Right: Notes sidebar */}
      {sidebarOpen && (
        <div className="w-[380px] shrink-0 border-l bg-background overflow-hidden">
          <NotesSidebar
            paperId={paper.id}
            paperTitle={paper.title}
            paperAbstract={paper.abstract || ""}
            paperAuthors={paper.authors}
            paperJournal={paper.journal}
            paperPubDate={paper.pub_date}
            paperPmid={paper.pmid}
            paperDoi={paper.doi}
            citation={citation}
            notes={notes}
            pendingHighlight={pendingHighlight}
            onClearHighlight={handleClearHighlight}
            createAction={createAction}
            updateAction={updateAction}
            deleteAction={deleteAction}
          />
        </div>
      )}
    </div>
  );
}

function buildCitation(paper: SavedPaper): string {
  const firstAuthor = paper.authors?.[0] || "Unknown";
  const lastName = firstAuthor.split(" ").pop() || firstAuthor;
  const etAl = (paper.authors?.length || 0) > 1 ? " et al." : "";
  const year = paper.pub_date ? paper.pub_date.split("-")[0] : "";
  const journal = paper.journal || "";
  return `${lastName}${etAl}, ${year}${journal ? `, ${journal}` : ""}`;
}
