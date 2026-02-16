"use client";

import { useState, useEffect } from "react";
import {
  Share2,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Eye,
  FileText,
  StickyNote,
  FlaskConical,
  BarChart3,
  Lightbulb,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Snapshot {
  id: string;
  title: string;
  description: string | null;
  token: string;
  includes: string[];
  view_count: number;
  created_at: string;
}

const INCLUDE_OPTIONS = [
  { key: "papers", label: "Papers", icon: <FileText className="h-4 w-4" /> },
  { key: "notes", label: "Notes", icon: <StickyNote className="h-4 w-4" /> },
  { key: "experiments", label: "Experiments", icon: <FlaskConical className="h-4 w-4" /> },
  { key: "results", label: "Results", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "ideas", label: "Ideas", icon: <Lightbulb className="h-4 w-4" /> },
  { key: "hypotheses", label: "Hypotheses", icon: <Brain className="h-4 w-4" /> },
];

export default function SharePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadSnapshots();
  }, []);

  async function loadSnapshots() {
    try {
      const res = await fetch("/api/share");
      const data = await res.json();
      setSnapshots(data.snapshots || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this shared snapshot? The link will stop working.")) return;
    try {
      await fetch("/api/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Share</h1>
          <p className="text-muted-foreground">
            Create read-only snapshots of your research to share with your PI,
            lab members, or collaborators.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Share
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Share2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="font-medium mb-1">No shared snapshots</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Create a snapshot to generate a read-only link you can send to your PI
            or collaborators. They don&apos;t need an account.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm">{s.title}</h3>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {s.includes.map((inc) => {
                        const opt = INCLUDE_OPTIONS.find((o) => o.key === inc);
                        return (
                          <Badge key={inc} variant="secondary" className="text-xs gap-1">
                            {opt?.icon}
                            {opt?.label || inc}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {s.view_count} views
                      </span>
                      <span>
                        Created {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => copyLink(s.token)}
                    >
                      {copiedId === s.token ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedId === s.token ? "Copied!" : "Copy Link"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        window.open(`/shared/${s.token}`, "_blank")
                      }
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateShareDialog
          onClose={() => setShowCreate(false)}
          onCreated={(s) => {
            setSnapshots((prev) => [s, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateShareDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: Snapshot) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [includes, setIncludes] = useState<string[]>(["papers", "notes"]);
  const [creating, setCreating] = useState(false);

  function toggleInclude(key: string) {
    setIncludes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleCreate() {
    if (!title || includes.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, includes }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onCreated({
        id: data.id,
        title,
        description: description || null,
        token: data.token,
        includes,
        view_count: 0,
        created_at: new Date().toISOString(),
      });

      // Auto-copy link
      const url = `${window.location.origin}/shared/${data.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" /> Create Shared Snapshot
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-1 block">Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly update for Dr. Smith"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this snapshot about?"
            />
          </div>
          <div>
            <Label className="text-xs mb-2 block">
              What to include
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {INCLUDE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => toggleInclude(opt.key)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    includes.includes(opt.key)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div
                    className={`rounded-md border p-1 ${
                      includes.includes(opt.key)
                        ? "border-primary bg-primary text-primary-foreground"
                        : ""
                    }`}
                  >
                    {opt.icon}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title || includes.length === 0 || creating}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Share2 className="h-4 w-4 mr-1" />
            )}
            Create & Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

