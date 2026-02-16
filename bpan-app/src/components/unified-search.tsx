"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  StickyNote,
  FlaskConical,
  BookOpen,
  Beaker,
  Lightbulb,
  BarChart3,
  X,
  Loader2,
} from "lucide-react";

interface SearchResult {
  type: "paper" | "note" | "experiment" | "protocol" | "reagent" | "idea" | "dataset";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  paper: { icon: <FileText className="h-4 w-4" />, label: "Paper", color: "text-blue-500" },
  note: { icon: <StickyNote className="h-4 w-4" />, label: "Note", color: "text-yellow-500" },
  experiment: { icon: <FlaskConical className="h-4 w-4" />, label: "Experiment", color: "text-green-500" },
  protocol: { icon: <BookOpen className="h-4 w-4" />, label: "Protocol", color: "text-purple-500" },
  reagent: { icon: <Beaker className="h-4 w-4" />, label: "Reagent", color: "text-orange-500" },
  idea: { icon: <Lightbulb className="h-4 w-4" />, label: "Idea", color: "text-amber-500" },
  dataset: { icon: <BarChart3 className="h-4 w-4" />, label: "Dataset", color: "text-indigo-500" },
};

export function UnifiedSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search/unified?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setSelectedIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Search panel */}
      <div className="relative mx-auto mt-[15vh] w-full max-w-lg px-4">
        <div className="rounded-xl border bg-background shadow-2xl overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search papers, notes, experiments, ideas..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {query.length >= 2 && results.length === 0 && !loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No results found for &quot;{query}&quot;
              </div>
            ) : (
              results.map((result, i) => {
                const cfg = TYPE_CONFIG[result.type];
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      i === selectedIdx ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <span className={`flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{result.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {cfg.label}
                        {result.subtitle ? ` · ${result.subtitle}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-4">
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">↵</kbd> Open
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">Esc</kbd> Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small trigger button for the nav bar
export function SearchTrigger() {
  const [, setOpen] = useState(false);

  useEffect(() => {
    // We use the global keyboard shortcut instead
  }, []);

  return (
    <button
      onClick={() => {
        // Dispatch Cmd+K to open
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        );
      }}
      className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search everything...</span>
      <kbd className="hidden sm:inline rounded border bg-background px-1.5 py-0.5 text-[10px] ml-2">
        ⌘K
      </kbd>
    </button>
  );
}

