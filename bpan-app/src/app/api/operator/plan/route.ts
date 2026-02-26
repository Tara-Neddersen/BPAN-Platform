import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PlannedStep = {
  step: string;
  kind: "calendar" | "task" | "meeting" | "query" | "unknown";
  action: string;
  destructive: boolean;
  supported: boolean;
  note?: string;
};

function splitCommands(message: string) {
  return message
    .split(/\s*(?:\n+|;\s*|(?:and\s+then)|(?:then))\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function classifyStep(step: string): PlannedStep {
  const lower = step.toLowerCase();
  if (/^(schedule)\s+.+\s+on\s+\d{4}-\d{2}-\d{2}$/i.test(step)) {
    return { step, kind: "calendar", action: "calendar.create", destructive: false, supported: true };
  }
  if (/^move\s+event\s+.+\s+to\s+\d{4}-\d{2}-\d{2}$/i.test(step)) {
    return { step, kind: "calendar", action: "calendar.move", destructive: false, supported: true };
  }
  if (/^(mark|set)\s+event\s+.+\s+(?:as\s+)?(scheduled|in progress|completed|cancelled)$/i.test(step)) {
    return { step, kind: "calendar", action: "calendar.update", destructive: false, supported: true };
  }
  if (/^delete\s+event\s+/i.test(step) || /^confirm\s+delete\s+event\s+/i.test(step)) {
    return { step, kind: "calendar", action: "calendar.delete", destructive: true, supported: true, note: "Will require explicit confirmation in Operator chat." };
  }
  if (/^(add|create)\s+task\s+/i.test(step)) {
    return { step, kind: "task", action: "task.create", destructive: false, supported: true };
  }
  if (/^(complete|finish|reopen|uncomplete)\s+task\s+/i.test(step)) {
    return { step, kind: "task", action: "task.update", destructive: false, supported: true };
  }
  if (/^delete\s+task\s+/i.test(step) || /^confirm\s+delete\s+task\s+/i.test(step)) {
    return { step, kind: "task", action: "task.delete", destructive: true, supported: true, note: "Will require explicit confirmation in Operator chat." };
  }
  if (/^create\s+meeting\s+.+\s+on\s+\d{4}-\d{2}-\d{2}$/i.test(step)) {
    return { step, kind: "meeting", action: "meeting.create", destructive: false, supported: true };
  }
  if (/^(summary|workspace summary|status summary|overdue tasks?|this week|next 7 days|coming week|what('| i)?s\s+on\s+\d{4}-\d{2}-\d{2})$/i.test(lower)) {
    return { step, kind: "query", action: "query.read", destructive: false, supported: true };
  }
  return { step, kind: "unknown", action: "unknown", destructive: false, supported: false, note: "This step may not be executable yet." };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const message = String(body?.message || "").trim();
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const steps = splitCommands(message).map(classifyStep);
  const supported = steps.filter((s) => s.supported).length;
  const destructive = steps.some((s) => s.destructive);

  return NextResponse.json({
    success: true,
    plan: {
      original: message,
      totalSteps: steps.length,
      supportedSteps: supported,
      unsupportedSteps: steps.length - supported,
      hasDestructive: destructive,
      steps,
    },
  });
}
