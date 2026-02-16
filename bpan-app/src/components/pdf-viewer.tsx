"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Loader2,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfViewerProps {
  url: string;
  onCreateNote: (text: string, pageNumber: number) => void;
}

export function PdfViewer({ url, onCreateNote }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for text selection inside the PDF viewer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleMouseUp() {
      // Small delay to let the browser finalize the selection
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (text && text.length > 5) {
          const range = selection!.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = container!.getBoundingClientRect();

          setSelectedText(text);
          setFabPos({
            x: Math.min(
              rect.left - containerRect.left + rect.width / 2,
              containerRect.width - 100
            ),
            y: rect.top - containerRect.top - 48,
          });
        } else {
          setSelectedText("");
          setFabPos(null);
        }
      }, 10);
    }

    function handleMouseDown(e: MouseEvent) {
      // If clicking outside the fab, clear selection state
      const target = e.target as HTMLElement;
      if (!target.closest("[data-note-fab]")) {
        setSelectedText("");
        setFabPos(null);
      }
    }

    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  const handleCreateNote = useCallback(() => {
    if (selectedText) {
      onCreateNote(selectedText, currentPage);
      setSelectedText("");
      setFabPos(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [selectedText, currentPage, onCreateNote]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function onDocumentLoadError(err: Error) {
    console.error("PDF load error:", err);
    setError("Could not load PDF");
    setLoading(false);
  }

  return (
    <div ref={containerRef} className="relative flex flex-col h-full select-text">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[60px] text-center">
            {currentPage} / {numPages || "..."}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading PDF...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center py-4">
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading=""
            />
          </Document>
        </div>
      </div>

      {/* Floating "Create Note" Button */}
      {fabPos && selectedText && (
        <div
          data-note-fab
          className="absolute z-50 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: `${fabPos.x}px`,
            top: `${fabPos.y}px`,
            transform: "translateX(-50%)",
          }}
        >
          <Button
            size="sm"
            className="gap-1.5 shadow-lg rounded-full px-4 h-9 bg-primary hover:bg-primary/90"
            onClick={handleCreateNote}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Create Note
          </Button>
        </div>
      )}
    </div>
  );
}
