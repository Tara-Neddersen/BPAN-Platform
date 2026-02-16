"use client";

import { useState, useEffect, use } from "react";
import {
  FileText,
  StickyNote,
  FlaskConical,
  BarChart3,
  Lightbulb,
  Brain,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SharedData {
  title: string;
  description: string | null;
  content: Record<string, unknown[]>;
  includes: string[];
  created_at: string;
}

export default function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) throw new Error("Not found or expired");
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-bold">Not Found</h1>
        <p className="text-muted-foreground">
          This shared link doesn&apos;t exist or has expired.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <Badge variant="secondary" className="mb-2">
          Shared Research Snapshot
        </Badge>
        <h1 className="text-2xl font-bold">{data.title}</h1>
        {data.description && (
          <p className="text-muted-foreground mt-1">{data.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Shared on {new Date(data.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Papers */}
      {data.content.papers && (data.content.papers as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Papers ({(data.content.papers as unknown[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.content.papers as Array<{ title: string; authors?: string; journal?: string; pmid?: string }>).map(
              (p, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {[p.authors, p.journal, p.pmid ? `PMID: ${p.pmid}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {data.content.notes && (data.content.notes as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="h-4 w-4" /> Notes ({(data.content.notes as unknown[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data.content.notes as Array<{ content: string; note_type?: string; highlight_text?: string; tags?: string[] }>).map(
              (n, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                  {n.highlight_text && (
                    <div className="text-xs bg-yellow-50 dark:bg-yellow-950/30 rounded px-2 py-1 mb-1 italic">
                      &ldquo;{n.highlight_text}&rdquo;
                    </div>
                  )}
                  <div>{n.content}</div>
                  <div className="flex gap-1 mt-1">
                    {n.note_type && (
                      <Badge variant="secondary" className="text-xs">
                        {n.note_type}
                      </Badge>
                    )}
                    {n.tags?.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Experiments */}
      {data.content.experiments && (data.content.experiments as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> Experiments ({(data.content.experiments as unknown[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.content.experiments as Array<{ title: string; status?: string; description?: string }>).map(
              (e, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{e.title}</span>
                    {e.status && (
                      <Badge variant="secondary" className="text-xs">
                        {e.status}
                      </Badge>
                    )}
                  </div>
                  {e.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {e.description}
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {data.content.results && (data.content.results as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Results ({(data.content.results as unknown[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.content.results as Array<{ name: string; test_type?: string; ai_interpretation?: string }>).map(
              (r, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                  <div className="font-medium">{r.name}</div>
                  {r.ai_interpretation && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.ai_interpretation}
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Ideas */}
      {data.content.ideas && (data.content.ideas as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> Research Ideas ({(data.content.ideas as unknown[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.content.ideas as Array<{ title: string; status?: string; description?: string }>).map(
              (idea, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{idea.title}</span>
                    {idea.status && (
                      <Badge variant="secondary" className="text-xs">
                        {idea.status}
                      </Badge>
                    )}
                  </div>
                  {idea.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {idea.description}
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Hypotheses */}
      {data.content.hypotheses && (data.content.hypotheses as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" /> Hypotheses ({(data.content.hypotheses as unknown[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.content.hypotheses as Array<{ title: string; status?: string; description?: string }>).map(
              (h, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{h.title}</span>
                    {h.status && (
                      <Badge variant="secondary" className="text-xs">
                        {h.status}
                      </Badge>
                    )}
                  </div>
                  {h.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {h.description}
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-muted-foreground py-4">
        Powered by BPAN Research Platform
      </div>
    </div>
  );
}

