import { createHash } from "crypto";

export type WorkspaceFeedEvent = {
  uid: string;
  sourceKind: "workspace" | "planner" | "timepoint" | "colony";
  sourceId: string;
  summary: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  description?: string | null;
  location?: string | null;
  workspaceEventId?: string;
  workspaceMetadata?: Record<string, unknown> | null;
};

function stableGoogleEventId(seed: string) {
  // Google allows client-provided event IDs using a-v and 0-9. Hex is a valid subset.
  return createHash("sha1").update(seed).digest("hex").slice(0, 64);
}

type MinimalSupabase = {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (query: string) => any;
  };
};

export async function getWorkspaceCalendarFeedEvents(supabase: MinimalSupabase, userId: string): Promise<WorkspaceFeedEvent[]> {
  const [workspaceEventsRes, plannerExpsRes, timepointsRes, colonyRes] = await Promise.all([
    supabase
      .from("workspace_calendar_events")
      .select("id,title,description,start_at,end_at,all_day,status,location,metadata")
      .eq("user_id", userId)
      .order("start_at"),
    supabase
      .from("experiments")
      .select("id,title,description,start_date,end_date,status")
      .eq("user_id", userId),
    supabase
      .from("experiment_timepoints")
      .select("id,label,scheduled_at,completed_at,experiment_id,experiments(title)")
      .eq("user_id", userId),
    supabase
      .from("animal_experiments")
      .select("id,experiment_type,scheduled_date,status,timepoint_age_days,animal_id,animals(identifier),cohorts(name)")
      .eq("user_id", userId)
      .not("scheduled_date", "is", null),
  ]);

  const events: WorkspaceFeedEvent[] = [];

  for (const ev of workspaceEventsRes.data || []) {
    events.push({
      uid: `workspace-${String(ev.id)}`,
      sourceKind: "workspace",
      sourceId: String(ev.id),
      summary: String(ev.title),
      startAt: String(ev.start_at),
      endAt: (ev.end_at as string | null) || null,
      allDay: Boolean(ev.all_day),
      description: (ev.description as string | null) || null,
      location: (ev.location as string | null) || null,
      workspaceEventId: String(ev.id),
      workspaceMetadata: (ev.metadata as Record<string, unknown> | null) || null,
    });
  }

  for (const e of plannerExpsRes.data || []) {
    if (!e.start_date && !e.end_date) continue;
    events.push({
      uid: `planner-${String(e.id)}`,
      sourceKind: "planner",
      sourceId: String(e.id),
      summary: `[Planner] ${String(e.title)}`,
      startAt: String(e.start_date || e.end_date),
      endAt: (e.end_date as string | null) || (e.start_date as string | null) || null,
      allDay: true,
      description: (e.description as string | null) || null,
    });
  }

  for (const tp of timepointsRes.data || []) {
    if (!tp.scheduled_at) continue;
    const expRel = tp.experiments as { title?: string } | Array<{ title?: string }> | null;
    const expTitle = Array.isArray(expRel) ? expRel[0]?.title : expRel?.title;
    events.push({
      uid: `timepoint-${String(tp.id)}`,
      sourceKind: "timepoint",
      sourceId: String(tp.id),
      summary: `[Timepoint] ${String(tp.label)}${expTitle ? ` · ${String(expTitle)}` : ""}`,
      startAt: String(tp.scheduled_at),
      allDay: false,
    });
  }

  for (const ae of colonyRes.data || []) {
    if (!ae.scheduled_date) continue;
    const label = String(ae.experiment_type).replace(/_/g, " ");
    const animal = (ae.animals as { identifier?: string } | null)?.identifier || "?";
    const tp = ae.timepoint_age_days != null ? ` @ ${ae.timepoint_age_days}d` : "";
    const cohort = (ae.cohorts as { name?: string } | null)?.name;
    events.push({
      uid: `colony-${String(ae.id)}`,
      sourceKind: "colony",
      sourceId: String(ae.id),
      summary: `[Colony] ${label} · #${animal}${tp}${cohort ? ` · ${cohort}` : ""}`,
      startAt: String(ae.scheduled_date),
      allDay: true,
      description: `Status: ${String(ae.status)}`,
    });
  }

  return events.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
}

export function getGoogleCalendarEventIdForFeedEvent(ev: WorkspaceFeedEvent) {
  return stableGoogleEventId(`${ev.sourceKind}:${ev.sourceId}:${ev.uid}`);
}
