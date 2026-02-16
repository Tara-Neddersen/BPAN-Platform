"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Trash2 } from "lucide-react";
import { WatchlistForm } from "@/components/watchlist-form";
import type { Watchlist } from "@/types";

interface WatchlistCardProps {
  watchlist: Watchlist;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

export function WatchlistCard({ watchlist, updateAction, deleteAction }: WatchlistCardProps) {
  const searchQuery = watchlist.keywords.join(" OR ");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">{watchlist.name}</CardTitle>
        <div className="flex items-center gap-1">
          <WatchlistForm action={updateAction} watchlist={watchlist} trigger="icon" />
          <form action={deleteAction}>
            <input type="hidden" name="id" value={watchlist.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {watchlist.keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="text-xs">
              {keyword}
            </Badge>
          ))}
        </div>
        <Button asChild size="sm" className="w-full gap-2">
          <Link href={`/search?q=${encodeURIComponent(searchQuery)}`}>
            <Search className="h-3.5 w-3.5" />
            Search PubMed
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
