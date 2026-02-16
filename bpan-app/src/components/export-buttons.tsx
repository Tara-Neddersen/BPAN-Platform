"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";

interface ExportButtonsProps {
  noteCount: number;
}

export function ExportButtons({ noteCount }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleExport(format: "csv" | "bibtex") {
    setLoading(format);
    try {
      const res = await fetch(`/api/notes/export?format=${format}`);
      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "csv"
          ? `bpan-notes-${new Date().toISOString().split("T")[0]}.csv`
          : `bpan-bibliography-${new Date().toISOString().split("T")[0]}.bib`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setLoading(null);
    }
  }

  if (noteCount === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleExport("csv")}
          disabled={loading !== null}
          className="gap-2"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("bibtex")}
          disabled={loading !== null}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Export as BibTeX (annotated bibliography)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

