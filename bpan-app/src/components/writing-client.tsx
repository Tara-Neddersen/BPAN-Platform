"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  Copy,
  FileText,
  FlaskConical,
  LayoutTemplate,
  Lightbulb,
  Loader2,
  PencilRuler,
  Plus,
  Presentation,
  Sparkles,
  Target,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  autoBuildPaperOutline,
  createPaperOutline,
  deletePaperOutline,
  updatePaperOutline,
} from "@/app/(protected)/writing/actions";
import type { Figure, PaperOutline, PaperOutlineSection } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GRANT_SECTIONS = [
  {
    id: "specific_aims",
    label: "Specific Aims",
    icon: <Target className="h-4 w-4" />,
    desc: "NIH-style aims page with hypothesis, aims, and impact",
  },
  {
    id: "significance",
    label: "Significance",
    icon: <BookOpen className="h-4 w-4" />,
    desc: "Why this problem matters and what gaps you address",
  },
  {
    id: "innovation",
    label: "Innovation",
    icon: <Lightbulb className="h-4 w-4" />,
    desc: "What's novel about your approach",
  },
  {
    id: "approach",
    label: "Approach",
    icon: <FlaskConical className="h-4 w-4" />,
    desc: "Experimental design, methods, expected results",
  },
  {
    id: "abstract",
    label: "Abstract",
    icon: <FileText className="h-4 w-4" />,
    desc: "250-word project summary",
  },
];

function newTextSection(): PaperOutlineSection {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    heading: "New text section",
    notes: "",
    linkedFigureId: null,
    plotRequest: "",
  };
}

function newFigureSection(): PaperOutlineSection {
  return {
    id: crypto.randomUUID(),
    kind: "figure",
    heading: "Figure placeholder",
    notes: "What should this figure prove?",
    linkedFigureId: null,
    plotRequest: "",
  };
}

function defaultOutlineSeed() {
  return {
    title: "Untitled BPAN manuscript",
    framing: "Central claim, target journal, and the most important result sequence.",
    sections: [
      {
        id: crypto.randomUUID(),
        kind: "text" as const,
        heading: "Title / one-sentence claim",
        notes: "State the main take-home message.",
        linkedFigureId: null,
        plotRequest: "",
      },
      {
        id: crypto.randomUUID(),
        kind: "text" as const,
        heading: "Results story",
        notes: "List the sequence of results you want the manuscript to tell.",
        linkedFigureId: null,
        plotRequest: "",
      },
      newFigureSection(),
      {
        id: crypto.randomUUID(),
        kind: "text" as const,
        heading: "Discussion / next experiment",
        notes: "Interpretation, limitations, and the strongest next step.",
        linkedFigureId: null,
        plotRequest: "",
      },
    ],
  };
}

function buildOutlinePrompt(outline: PaperOutline, figures: Figure[]) {
  const figureMap = new Map(figures.map((figure) => [figure.id, figure]));
  const blocks = outline.sections.map((section, index) => {
    const linked = section.linkedFigureId ? figureMap.get(section.linkedFigureId) : null;
    if (section.kind === "figure") {
      return `${index + 1}. [Figure] ${section.heading}
Goal: ${section.notes || "Not specified"}
Requested plot: ${section.plotRequest || "Not specified"}
Linked existing figure: ${linked ? `${linked.name} (${linked.chart_type})` : "None"}`;
    }
    return `${index + 1}. [Text] ${section.heading}
Notes: ${section.notes || "Not specified"}`;
  });

  return `Help me improve this manuscript outline.

Paper title:
${outline.title}

Framing:
${outline.framing || "Not specified"}

Blocks:
${blocks.join("\n\n")}

Please tighten the story order, flag missing controls, suggest stronger figure logic, and propose better section wording where needed.`;
}

function buildFigurePrompt(outline: PaperOutline, section: PaperOutlineSection, figures: Figure[]) {
  const linked = section.linkedFigureId
    ? figures.find((figure) => figure.id === section.linkedFigureId)
    : null;

  return `Help me plan or update a manuscript figure.

Paper:
${outline.title}

Story framing:
${outline.framing || "Not specified"}

Figure placeholder:
${section.heading}

What this figure should prove:
${section.notes || "Not specified"}

Requested plot:
${section.plotRequest || "Not specified"}

Linked figure:
${linked ? `${linked.name} (${linked.chart_type})` : "None"}

Please turn this into:
1. a precise plot specification,
2. exact cohorts / groups / timepoints to include,
3. the recommended statistical comparison,
4. a short legend,
5. any missing data I need to collect first.`;
}

function getResultsHref(section: PaperOutlineSection, figures: Figure[]) {
  const linked = section.linkedFigureId
    ? figures.find((figure) => figure.id === section.linkedFigureId)
    : null;
  const params = new URLSearchParams();
  params.set("tab", "visualize");
  params.set("prefill_title", section.heading);
  if (section.plotRequest) params.set("prefill_prompt", section.plotRequest);
  if (linked) {
    params.set("dataset", linked.dataset_id);
    params.set("figure", linked.id);
    params.set("prefill_chart", linked.chart_type);
  }
  return `/results?${params.toString()}`;
}

export function WritingClient({
  figures,
  initialOutlines,
}: {
  figures: Figure[];
  initialOutlines: PaperOutline[];
}) {
  const [generating, setGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState("");
  const [output, setOutput] = useState("");
  const [outputTitle, setOutputTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const [outlines, setOutlines] = useState(initialOutlines);
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(initialOutlines[0]?.id || null);
  const [isSaving, startSaving] = useTransition();
  const [isAutoBuilding, startAutoBuild] = useTransition();
  const [dirtyOutlineIds, setDirtyOutlineIds] = useState<string[]>([]);

  const selectedOutline = useMemo(
    () => outlines.find((outline) => outline.id === selectedOutlineId) || null,
    [outlines, selectedOutlineId]
  );
  const selectedIsDirty = !!(selectedOutlineId && dirtyOutlineIds.includes(selectedOutlineId));

  function upsertOutline(nextOutline: PaperOutline) {
    setOutlines((current) => {
      const existing = current.some((outline) => outline.id === nextOutline.id);
      const next = existing
        ? current.map((outline) => (outline.id === nextOutline.id ? nextOutline : outline))
        : [nextOutline, ...current];
      return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
    setSelectedOutlineId(nextOutline.id);
  }

  function patchSelected(mutator: (outline: PaperOutline) => PaperOutline) {
    if (!selectedOutline) return;
    const updated = mutator({
      ...selectedOutline,
      updated_at: new Date().toISOString(),
    });
    upsertOutline(updated);
    setDirtyOutlineIds((current) =>
      selectedOutline.id && !current.includes(selectedOutline.id)
        ? [...current, selectedOutline.id]
        : current
    );
  }

  function saveSelectedOutline() {
    if (!selectedOutline) return;
    startSaving(async () => {
      const result = await updatePaperOutline(selectedOutline.id, {
        title: selectedOutline.title,
        framing: selectedOutline.framing || "",
        sections: selectedOutline.sections,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.outline) {
        upsertOutline(result.outline);
        setDirtyOutlineIds((current) => current.filter((id) => id !== result.outline?.id));
        toast.success("Outline saved");
      }
    });
  }

  async function generate(type: string, section?: string) {
    setGenerating(true);
    setGeneratingType(section || type);
    setOutput("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, section }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOutput(data.text);
      setOutputTitle(
        type === "lab_meeting"
          ? "Lab Meeting Summary"
          : `Grant: ${GRANT_SECTIONS.find((item) => item.id === section)?.label || section}`
      );
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : "Generation failed"}`);
      setOutputTitle("Error");
    } finally {
      setGenerating(false);
      setGeneratingType("");
    }
  }

  async function copyText(value: string, successText: string) {
    await navigator.clipboard.writeText(value);
    toast.success(successText);
  }

  async function handleCopyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCreateOutline() {
    startSaving(async () => {
      const result = await createPaperOutline(defaultOutlineSeed());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.outline) {
        upsertOutline(result.outline);
        toast.success("Paper outline created");
      }
    });
  }

  function handleDeleteOutline(id: string) {
    const previous = outlines;
    const remaining = outlines.filter((outline) => outline.id !== id);
    setOutlines(remaining);
    setDirtyOutlineIds((current) => current.filter((outlineId) => outlineId !== id));
    if (selectedOutlineId === id) setSelectedOutlineId(remaining[0]?.id || null);

    startSaving(async () => {
      const result = await deletePaperOutline(id);
      if (result.error) {
        toast.error(result.error);
        setOutlines(previous);
        if (dirtyOutlineIds.includes(id)) {
          setDirtyOutlineIds((current) => (current.includes(id) ? current : [...current, id]));
        }
        if (previous[0]) setSelectedOutlineId(previous[0].id);
      }
    });
  }

  function handleAutoBuild() {
    startAutoBuild(async () => {
      const result = await autoBuildPaperOutline();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.outline) {
        upsertOutline(result.outline);
        toast.success("AI-assisted outline created from your current results");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Writing Assistant</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          AI-powered drafts from your notes, results, and experiments, plus a synced manuscript outline studio for structuring papers and figure plans.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Grant / Thesis Sections
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Generate NIH-style sections based on your research context, papers, notes, and results.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {GRANT_SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => generate("grant", section.id)}
                disabled={generating}
                className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                <span className="text-primary">{section.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{section.label}</div>
                  <div className="text-xs text-muted-foreground">{section.desc}</div>
                </div>
                {generating && generatingType === section.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Presentation className="h-5 w-5" />
              Lab Meeting Prep
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Generate a structured summary of your recent work: experiments, results, findings, and next steps.
            </p>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => generate("lab_meeting")}
              disabled={generating}
              className="w-full flex items-center gap-3 rounded-lg border p-4 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
            >
              <Presentation className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">Generate Lab Meeting Summary</div>
                <div className="text-xs text-muted-foreground">
                  Creates a 5-10 minute presentation outline with your recent experiments, results, and plans.
                </div>
              </div>
              {generating && generatingType === "lab_meeting" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5" />
                Paper Outline Studio
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Build paper structure, drop in figure placeholders, link live figures, and hand exact prompts to your AI agents.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleAutoBuild} disabled={isAutoBuilding}>
                {isAutoBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                Auto-Build From Results
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleCreateOutline} disabled={isSaving}>
                <Plus className="h-4 w-4" />
                New Outline
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            {outlines.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
                No outlines yet. Create one manually or auto-build from your current figures and analyses.
              </div>
            ) : (
              outlines.map((outline) => (
                <div
                  key={outline.id}
                  className={`w-full rounded-xl border p-3 transition-colors ${
                    outline.id === selectedOutlineId
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOutlineId(outline.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-medium">{outline.title}</div>
                      <div className={`mt-1 text-[11px] ${outline.id === selectedOutlineId ? "text-slate-300" : "text-muted-foreground"}`}>
                        {outline.sections.length} blocks
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete outline"
                      className={`rounded p-1 ${outline.id === selectedOutlineId ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
                      onClick={() => handleDeleteOutline(outline.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedOutline && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Paper Title</label>
                    <Input
                      value={selectedOutline.title}
                      onChange={(e) => patchSelected((outline) => ({ ...outline, title: e.target.value }))}
                      placeholder="BPAN manuscript title"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Framing / Story Spine</label>
                    <Textarea
                      rows={3}
                      value={selectedOutline.framing || ""}
                      onChange={(e) => patchSelected((outline) => ({ ...outline, framing: e.target.value }))}
                      placeholder="Central claim, target journal, strongest result sequence, and what readers should leave believing."
                    />
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs font-medium text-muted-foreground">AI Agent Handoff</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Copy the whole outline or a single figure prompt and use it with your AI agents.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full gap-1.5"
                    onClick={saveSelectedOutline}
                    disabled={isSaving || !selectedIsDirty}
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save Outline
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full gap-1.5"
                    onClick={() => copyText(buildOutlinePrompt(selectedOutline, figures), "Outline prompt copied")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Outline Prompt
                  </Button>
                  {selectedIsDirty && <p className="mt-2 text-[11px] text-muted-foreground">Unsaved local changes</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    patchSelected((outline) => ({
                      ...outline,
                      sections: [...outline.sections, newTextSection()],
                    }))
                  }
                >
                  <PencilRuler className="h-3.5 w-3.5" />
                  Add Text Block
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    patchSelected((outline) => ({
                      ...outline,
                      sections: [...outline.sections, newFigureSection()],
                    }))
                  }
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Add Figure Placeholder
                </Button>
              </div>

              <div className="space-y-3">
                {selectedOutline.sections.map((section, index) => {
                  const linked = section.linkedFigureId
                    ? figures.find((figure) => figure.id === section.linkedFigureId)
                    : null;
                  return (
                    <div key={section.id} className="rounded-xl border bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">#{index + 1}</Badge>
                          <Badge variant={section.kind === "figure" ? "default" : "secondary"}>
                            {section.kind === "figure" ? "Figure" : "Text"}
                          </Badge>
                          {linked && (
                            <Badge variant="outline" className="text-[10px]">
                              linked to live figure
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.kind === "figure" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => copyText(buildFigurePrompt(selectedOutline, section, figures), "Figure prompt copied")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Copy Figure Prompt
                              </Button>
                              <Button asChild variant="outline" size="sm" className="gap-1.5">
                                <Link href={getResultsHref(section, figures)}>
                                  <LayoutTemplate className="h-3.5 w-3.5" />
                                  Open In Results
                                </Link>
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              patchSelected((outline) => ({
                                ...outline,
                                sections: outline.sections.filter((item) => item.id !== section.id),
                              }))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Heading</label>
                          <Input
                            value={section.heading}
                            onChange={(e) =>
                              patchSelected((outline) => ({
                                ...outline,
                                sections: outline.sections.map((item) =>
                                  item.id === section.id ? { ...item, heading: e.target.value } : item
                                ),
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            {section.kind === "figure" ? "Why this figure exists" : "Notes / placeholders"}
                          </label>
                          <Textarea
                            rows={3}
                            value={section.notes}
                            onChange={(e) =>
                              patchSelected((outline) => ({
                                ...outline,
                                sections: outline.sections.map((item) =>
                                  item.id === section.id ? { ...item, notes: e.target.value } : item
                                ),
                              }))
                            }
                            placeholder={
                              section.kind === "figure"
                                ? "What claim should this figure support?"
                                : "Write the section beats, placeholders, and needed evidence."
                            }
                          />
                        </div>

                        {section.kind === "figure" && (
                          <>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Plot Request</label>
                              <Textarea
                                rows={3}
                                value={section.plotRequest}
                                onChange={(e) =>
                                  patchSelected((outline) => ({
                                    ...outline,
                                    sections: outline.sections.map((item) =>
                                      item.id === section.id ? { ...item, plotRequest: e.target.value } : item
                                    ),
                                  }))
                                }
                                placeholder="Example: dot plot of marble burying for BPAN1 vs BPAN2 at day 30 and day 60."
                              />
                            </div>

                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Link Existing Figure</label>
                              <Select
                                value={section.linkedFigureId || "none"}
                                onValueChange={(value) =>
                                  patchSelected((outline) => ({
                                    ...outline,
                                    sections: outline.sections.map((item) =>
                                      item.id === section.id
                                        ? { ...item, linkedFigureId: value === "none" ? null : value }
                                        : item
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a saved figure" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No linked figure yet</SelectItem>
                                  {figures.map((figure) => (
                                    <SelectItem key={figure.id} value={figure.id}>
                                      {figure.name} ({figure.chart_type})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {linked && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Linked to <span className="font-medium text-foreground">{linked.name}</span>. If that saved figure is updated in Results, this placeholder still points to the latest version.
                                </p>
                              )}
                              {figures.length === 0 && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  No saved figures yet. Create one in Results, then link it here.
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {output && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {outputTitle}
                <Badge variant="secondary" className="text-xs">
                  AI Generated
                </Badge>
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleCopyOutput}>
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{output}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
