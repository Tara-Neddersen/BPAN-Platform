"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import type { Watchlist } from "@/types";

interface WatchlistFormProps {
  action: (formData: FormData) => Promise<void>;
  watchlist?: Watchlist;
  trigger?: "button" | "icon";
}

export function WatchlistForm({ action, watchlist, trigger = "button" }: WatchlistFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!watchlist;

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      await action(formData);
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            New watchlist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit watchlist" : "Create watchlist"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the name or keywords for this watchlist."
              : "Add a name and comma-separated keywords to track."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={watchlist.id} />}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder='e.g. "BPAN Core"'
              defaultValue={watchlist?.name ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords (comma-separated)</Label>
            <Input
              id="keywords"
              name="keywords"
              placeholder="BPAN, WDR45, neurodegeneration"
              defaultValue={watchlist?.keywords.join(", ") ?? ""}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : isEdit ? "Save changes" : "Create watchlist"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
