"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface SearchBarProps {
  defaultQuery?: string;
}

export function SearchBar({ defaultQuery = "" }: SearchBarProps) {
  const [query, setQuery] = useState(defaultQuery);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          type="text"
          placeholder="Search PubMed — e.g. BPAN, WDR45, iron neurodegeneration..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 h-11 rounded-xl border-border/60 bg-card shadow-sm focus:shadow-md transition-shadow"
        />
      </div>
      <Button type="submit" className="h-11 rounded-xl px-5 shadow-sm shadow-primary/20">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
    </form>
  );
}
