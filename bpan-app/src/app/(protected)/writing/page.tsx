"use client";

import { useState } from "react";
import {
  FileText,
  Presentation,
  Loader2,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  Target,
  Lightbulb,
  FlaskConical,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    icon: <ScrollText className="h-4 w-4" />,
    desc: "250-word project summary",
  },
];

export default function WritingPage() {
  const [generating, setGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState("");
  const [output, setOutput] = useState("");
  const [outputTitle, setOutputTitle] = useState("");
  const [copied, setCopied] = useState(false);

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
          : `Grant: ${GRANT_SECTIONS.find((s) => s.id === section)?.label || section}`
      );
    } catch (err) {
      setOutput(
        `Error: ${err instanceof Error ? err.message : "Generation failed"}`
      );
      setOutputTitle("Error");
    } finally {
      setGenerating(false);
      setGeneratingType("");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Writing Assistant</h1>
        <p className="text-muted-foreground">
          AI-powered drafts from your notes, results, and experiments. Uses all
          your research data as context.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Grant Writing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Grant / Thesis Sections
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Generate NIH-style sections based on your research context, papers,
              notes, and results.
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
                  <div className="text-xs text-muted-foreground">
                    {section.desc}
                  </div>
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

        {/* Lab Meeting */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Presentation className="h-5 w-5" />
              Lab Meeting Prep
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Generate a structured summary of your recent work — experiments,
              results, findings, and next steps.
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
                <div className="text-sm font-medium">
                  Generate Lab Meeting Summary
                </div>
                <div className="text-xs text-muted-foreground">
                  Creates a 5-10 minute presentation outline with your recent
                  experiments, results, and plans
                </div>
              </div>
              {generating && generatingType === "lab_meeting" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              )}
            </button>

            <div className="mt-4 rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> The more data you have in the platform, the
                better the output. Make sure to:
              </p>
              <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5 list-disc pl-4">
                <li>Fill out your Research Context (advisor sidebar → Setup)</li>
                <li>Add notes while reading papers</li>
                <li>Log experiments and results</li>
                <li>Track hypotheses in the advisor</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Output */}
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
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {output}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

