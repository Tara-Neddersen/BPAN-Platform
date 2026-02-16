"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import type { Paper } from "@/types";

interface SavePaperButtonProps {
  paper: Paper;
  isSaved: boolean;
  saveAction: (formData: FormData) => Promise<void>;
  unsaveAction: (formData: FormData) => Promise<void>;
}

export function SavePaperButton({ paper, isSaved, saveAction, unsaveAction }: SavePaperButtonProps) {
  const [saved, setSaved] = useState(isSaved);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("pmid", paper.pmid);

      if (saved) {
        await unsaveAction(formData);
        setSaved(false);
      } else {
        formData.set("title", paper.title);
        formData.set("authors", JSON.stringify(paper.authors));
        formData.set("journal", paper.journal || "");
        formData.set("pub_date", paper.pubDate || "");
        formData.set("abstract", paper.abstract || "");
        formData.set("doi", paper.doi || "");
        await saveAction(formData);
        setSaved(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={saved ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="h-3.5 w-3.5" />
      ) : (
        <Bookmark className="h-3.5 w-3.5" />
      )}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
