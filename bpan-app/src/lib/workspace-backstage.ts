import type { SupabaseClient } from "@supabase/supabase-js";

type LinkRow = {
  user_id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

type EventRow = {
  user_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  title: string;
  detail?: string | null;
  href?: string | null;
  event_at: string;
  payload?: Record<string, unknown>;
};

function addLink(target: LinkRow[], row: LinkRow) {
  if (!row.source_id || !row.target_id) return;
  target.push({
    ...row,
    metadata: row.metadata ?? {},
    confidence: row.confidence ?? 1,
  });
}

function addEvent(target: EventRow[], row: EventRow) {
  if (!row.entity_id || !row.event_at) return;
  target.push({
    ...row,
    detail: row.detail ?? null,
    href: row.href ?? null,
    payload: row.payload ?? {},
  });
}

function uniqLinks(rows: LinkRow[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = [r.user_id, r.source_type, r.source_id, r.target_type, r.target_id, r.link_type].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEvents(rows: EventRow[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = [r.user_id, r.entity_type, r.entity_id, r.event_type, r.title, r.event_at].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function rebuildWorkspaceBackstageIndex(supabase: SupabaseClient, userId: string) {
  const [
    { data: meetings, error: meetingsErr },
    { data: tasks, error: tasksErr },
    { data: notes, error: notesErr },
    { data: papers, error: papersErr },
    { data: experiments, error: expErr },
    { data: timepoints, error: tpErr },
    { data: datasets, error: dsErr },
    { data: analyses, error: anErr },
    { data: figures, error: figErr },
    { data: ideas, error: ideasErr },
    { data: hypotheses, error: hypErr },
    { data: memory, error: memErr },
    { data: animalExperiments, error: animalExpErr },
    { data: colonyResults, error: colonyResultsErr },
  ] = await Promise.all([
    supabase.from("meeting_notes").select("id,title,meeting_date,action_items,updated_at,created_at").eq("user_id", userId),
    supabase.from("tasks").select("id,title,status,source_type,source_id,source_label,due_date,updated_at,created_at").eq("user_id", userId),
    supabase.from("notes").select("id,paper_id,content,note_type,updated_at,created_at").eq("user_id", userId),
    supabase.from("saved_papers").select("id,title,journal,created_at").eq("user_id", userId),
    supabase.from("experiments").select("id,title,status,start_date,end_date,updated_at,created_at").eq("user_id", userId),
    supabase.from("experiment_timepoints").select("id,experiment_id,label,scheduled_at,completed_at,created_at").eq("user_id", userId),
    supabase.from("datasets").select("id,name,experiment_id,row_count,updated_at,created_at").eq("user_id", userId),
    supabase.from("analyses").select("id,name,dataset_id,test_type,created_at").eq("user_id", userId),
    supabase.from("figures").select("id,name,dataset_id,analysis_id,chart_type,updated_at,created_at").eq("user_id", userId),
    supabase.from("research_ideas").select("id,title,linked_paper_ids,linked_note_ids,linked_hypothesis_id,updated_at,created_at").eq("user_id", userId),
    supabase.from("hypotheses").select("id,title,status,related_paper_ids,updated_at,created_at").eq("user_id", userId),
    supabase.from("ai_memory").select("id,category,content,source,updated_at,created_at").eq("user_id", userId),
    supabase
      .from("animal_experiments")
      .select("id,animal_id,experiment_type,timepoint_age_days,status,scheduled_date,completed_date,updated_at,created_at")
      .eq("user_id", userId),
    supabase
      .from("colony_results")
      .select("id,animal_id,experiment_type,timepoint_age_days,recorded_at,updated_at,created_at")
      .eq("user_id", userId),
  ]);

  const err =
    meetingsErr ||
    tasksErr ||
    notesErr ||
    papersErr ||
    expErr ||
    tpErr ||
    dsErr ||
    anErr ||
    figErr ||
    ideasErr ||
    hypErr ||
    memErr ||
    animalExpErr ||
    colonyResultsErr;
  if (err) throw new Error(err.message);

  const links: LinkRow[] = [];
  const events: EventRow[] = [];

  const datasetsByExperiment = new Map<string, Array<Record<string, unknown>>>();
  for (const d of datasets || []) {
    const expId = d.experiment_id as string | null;
    if (!expId) continue;
    const list = datasetsByExperiment.get(expId) || [];
    list.push(d);
    datasetsByExperiment.set(expId, list);
  }
  const analysesByDataset = new Map<string, Array<Record<string, unknown>>>();
  for (const a of analyses || []) {
    const datasetId = a.dataset_id as string | null;
    if (!datasetId) continue;
    const list = analysesByDataset.get(datasetId) || [];
    list.push(a);
    analysesByDataset.set(datasetId, list);
  }
  const figuresByDataset = new Map<string, Array<Record<string, unknown>>>();
  for (const f of figures || []) {
    const datasetId = f.dataset_id as string | null;
    if (!datasetId) continue;
    const list = figuresByDataset.get(datasetId) || [];
    list.push(f);
    figuresByDataset.set(datasetId, list);
  }
  const animalExperimentsByKey = new Map<string, Record<string, unknown>>();
  for (const ax of animalExperiments || []) {
    const key = [
      String(ax.animal_id || ""),
      String(ax.experiment_type || ""),
      String(ax.timepoint_age_days ?? ""),
    ].join("|");
    if (key !== "||") {
      animalExperimentsByKey.set(key, ax);
    }
  }

  for (const t of tasks || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "task",
      entity_id: String(t.id),
      event_type: "updated",
      title: String(t.title || "Task updated"),
      detail: `Status: ${String(t.status || "pending").replace("_", " ")}`,
      href: "/tasks",
      event_at: String(t.updated_at || t.created_at),
      payload: { source_type: t.source_type ?? null },
    });
    if (t.source_type && t.source_id) {
      addLink(links, {
        user_id: userId,
        source_type: "task",
        source_id: String(t.id),
        target_type: String(t.source_type),
        target_id: String(t.source_id),
        link_type: "derived_from",
        metadata: { source_label: t.source_label ?? null },
      });
    }
  }

  for (const m of meetings || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "meeting",
      entity_id: String(m.id),
      event_type: "updated",
      title: String(m.title || "Meeting note"),
      detail: `Meeting ${m.meeting_date ?? ""}`.trim(),
      href: `/meetings?meeting=${encodeURIComponent(String(m.id))}`,
      event_at: String(m.updated_at || m.created_at),
    });

    const meetingTasks = (tasks || []).filter((t) => t.source_type === "meeting_action" && String(t.source_id || "") === String(m.id));
    for (const t of meetingTasks) {
      addLink(links, {
        user_id: userId,
        source_type: "meeting",
        source_id: String(m.id),
        target_type: "task",
        target_id: String(t.id),
        link_type: "produces_task",
      });
    }
  }

  for (const n of notes || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "note",
      entity_id: String(n.id),
      event_type: "updated",
      title: String(n.content || "").slice(0, 80) || "Research note",
      detail: `Type: ${String(n.note_type || "general")}`,
      href: "/notes",
      event_at: String(n.updated_at || n.created_at),
    });
    if (n.paper_id) {
      addLink(links, {
        user_id: userId,
        source_type: "note",
        source_id: String(n.id),
        target_type: "paper",
        target_id: String(n.paper_id),
        link_type: "annotates",
      });
    }
  }

  for (const p of papers || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "paper",
      entity_id: String(p.id),
      event_type: "saved",
      title: String(p.title || "Saved paper"),
      detail: p.journal ? `Saved from ${String(p.journal)}` : "Saved to library",
      href: "/library",
      event_at: String(p.created_at),
    });
  }

  for (const e of experiments || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "experiment",
      entity_id: String(e.id),
      event_type: "updated",
      title: String(e.title || "Experiment"),
      detail: `Status: ${String(e.status || "planned").replace("_", " ")}`,
      href: "/experiments",
      event_at: String(e.updated_at || e.created_at),
    });
  }

  for (const ax of animalExperiments || []) {
    const label = String(ax.experiment_type || "colony experiment").replaceAll("_", " ");
    const timepointLabel =
      ax.timepoint_age_days !== null && ax.timepoint_age_days !== undefined
        ? ` • ${String(ax.timepoint_age_days)}d`
        : "";
    addEvent(events, {
      user_id: userId,
      entity_type: "animal_experiment",
      entity_id: String(ax.id),
      event_type: "updated",
      title: `Colony ${label}`,
      detail: `Status: ${String(ax.status || "pending").replace("_", " ")}${timepointLabel}`,
      href: "/colony?tab=tracker",
      event_at: String(ax.updated_at || ax.created_at),
      payload: {
        animal_id: ax.animal_id ?? null,
        experiment_type: ax.experiment_type ?? null,
        timepoint_age_days: ax.timepoint_age_days ?? null,
      },
    });
  }

  for (const cr of colonyResults || []) {
    const label = String(cr.experiment_type || "result").replaceAll("_", " ");
    const timepointLabel =
      cr.timepoint_age_days !== null && cr.timepoint_age_days !== undefined
        ? ` at ${String(cr.timepoint_age_days)}d`
        : "";
    addEvent(events, {
      user_id: userId,
      entity_type: "colony_result",
      entity_id: String(cr.id),
      event_type: "updated",
      title: `Colony result: ${label}`,
      detail: `Recorded${timepointLabel}`,
      href: "/colony?tab=results",
      event_at: String(cr.updated_at || cr.recorded_at || cr.created_at),
      payload: {
        animal_id: cr.animal_id ?? null,
        experiment_type: cr.experiment_type ?? null,
        timepoint_age_days: cr.timepoint_age_days ?? null,
      },
    });

    const key = [
      String(cr.animal_id || ""),
      String(cr.experiment_type || ""),
      String(cr.timepoint_age_days ?? ""),
    ].join("|");
    const linkedAx = animalExperimentsByKey.get(key);
    if (linkedAx?.id) {
      addLink(links, {
        user_id: userId,
        source_type: "animal_experiment",
        source_id: String(linkedAx.id),
        target_type: "colony_result",
        target_id: String(cr.id),
        link_type: "has_result",
      });
      addLink(links, {
        user_id: userId,
        source_type: "colony_result",
        source_id: String(cr.id),
        target_type: "animal_experiment",
        target_id: String(linkedAx.id),
        link_type: "result_for_schedule",
      });
    }
  }

  for (const tp of timepoints || []) {
    if (!tp.experiment_id) continue;
    addLink(links, {
      user_id: userId,
      source_type: "experiment",
      source_id: String(tp.experiment_id),
      target_type: "timepoint",
      target_id: String(tp.id),
      link_type: "has_timepoint",
    });
  }

  for (const d of datasets || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "dataset",
      entity_id: String(d.id),
      event_type: "updated",
      title: String(d.name || "Dataset"),
      detail: `${Number(d.row_count || 0)} rows`,
      href: `/results?dataset=${encodeURIComponent(String(d.id))}&tab=data`,
      event_at: String(d.updated_at || d.created_at),
    });
    if (d.experiment_id) {
      addLink(links, {
        user_id: userId,
        source_type: "experiment",
        source_id: String(d.experiment_id),
        target_type: "dataset",
        target_id: String(d.id),
        link_type: "has_dataset",
      });
    }
  }

  for (const a of analyses || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "analysis",
      entity_id: String(a.id),
      event_type: "created",
      title: String(a.name || "Analysis"),
      detail: `Test: ${String(a.test_type || "analysis").replace("_", " ")}`,
      href: a.dataset_id ? `/results?dataset=${encodeURIComponent(String(a.dataset_id))}&tab=analyze&analysis=${encodeURIComponent(String(a.id))}` : "/results?tab=analyze",
      event_at: String(a.created_at),
    });
    if (a.dataset_id) {
      addLink(links, {
        user_id: userId,
        source_type: "analysis",
        source_id: String(a.id),
        target_type: "dataset",
        target_id: String(a.dataset_id),
        link_type: "runs_on_dataset",
      });
      const dataset = (datasets || []).find((d) => String(d.id) === String(a.dataset_id));
      if (dataset?.experiment_id) {
        addLink(links, {
          user_id: userId,
          source_type: "experiment",
          source_id: String(dataset.experiment_id),
          target_type: "analysis",
          target_id: String(a.id),
          link_type: "has_analysis",
          confidence: 0.95,
          metadata: { via: "dataset" },
        });
      }
    }
  }

  for (const f of figures || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "figure",
      entity_id: String(f.id),
      event_type: "updated",
      title: String(f.name || "Figure"),
      detail: `Chart: ${String(f.chart_type || "figure")}`,
      href: f.dataset_id ? `/results?dataset=${encodeURIComponent(String(f.dataset_id))}&tab=visualize&figure=${encodeURIComponent(String(f.id))}` : "/results?tab=visualize",
      event_at: String(f.updated_at || f.created_at),
    });
    if (f.dataset_id) {
      addLink(links, {
        user_id: userId,
        source_type: "figure",
        source_id: String(f.id),
        target_type: "dataset",
        target_id: String(f.dataset_id),
        link_type: "visualizes_dataset",
      });
      const dataset = (datasets || []).find((d) => String(d.id) === String(f.dataset_id));
      if (dataset?.experiment_id) {
        addLink(links, {
          user_id: userId,
          source_type: "experiment",
          source_id: String(dataset.experiment_id),
          target_type: "figure",
          target_id: String(f.id),
          link_type: "has_figure",
          confidence: 0.95,
          metadata: { via: "dataset" },
        });
      }
    }
    if (f.analysis_id) {
      addLink(links, {
        user_id: userId,
        source_type: "figure",
        source_id: String(f.id),
        target_type: "analysis",
        target_id: String(f.analysis_id),
        link_type: "derived_from_analysis",
      });
    }
  }

  for (const e of experiments || []) {
    const expId = String(e.id);
    for (const a of (tasks || []).filter((t) => t.source_type === "experiment" && String(t.source_id || "") === expId)) {
      addLink(links, {
        user_id: userId,
        source_type: "experiment",
        source_id: expId,
        target_type: "task",
        target_id: String(a.id),
        link_type: "has_task",
      });
    }
  }

  for (const idea of ideas || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "idea",
      entity_id: String(idea.id),
      event_type: "updated",
      title: String(idea.title || "Idea"),
      detail: "Research idea updated",
      href: "/ideas",
      event_at: String(idea.updated_at || idea.created_at),
    });
    for (const paperId of Array.isArray(idea.linked_paper_ids) ? idea.linked_paper_ids : []) {
      addLink(links, { user_id: userId, source_type: "idea", source_id: String(idea.id), target_type: "paper", target_id: String(paperId), link_type: "references_paper" });
    }
    for (const noteId of Array.isArray(idea.linked_note_ids) ? idea.linked_note_ids : []) {
      addLink(links, { user_id: userId, source_type: "idea", source_id: String(idea.id), target_type: "note", target_id: String(noteId), link_type: "references_note" });
    }
    if (idea.linked_hypothesis_id) {
      addLink(links, { user_id: userId, source_type: "idea", source_id: String(idea.id), target_type: "hypothesis", target_id: String(idea.linked_hypothesis_id), link_type: "supports_hypothesis" });
    }
  }

  for (const h of hypotheses || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "hypothesis",
      entity_id: String(h.id),
      event_type: "updated",
      title: String(h.title || "Hypothesis"),
      detail: `Status: ${String(h.status || "pending")}`,
      href: "/share", // closest UI surface today
      event_at: String(h.updated_at || h.created_at),
    });
    for (const paperId of Array.isArray(h.related_paper_ids) ? h.related_paper_ids : []) {
      addLink(links, { user_id: userId, source_type: "hypothesis", source_id: String(h.id), target_type: "paper", target_id: String(paperId), link_type: "evidence_paper" });
    }
  }

  for (const m of memory || []) {
    addEvent(events, {
      user_id: userId,
      entity_type: "memory",
      entity_id: String(m.id),
      event_type: "updated",
      title: String(m.category || "Memory"),
      detail: String(m.content || "").slice(0, 120),
      href: "/memory",
      event_at: String(m.updated_at || m.created_at),
    });
  }

  const finalLinks = uniqLinks(links);
  const finalEvents = dedupeEvents(events).sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime());

  const deleteLinks = await supabase.from("workspace_entity_links").delete().eq("user_id", userId);
  if (deleteLinks.error && !deleteLinks.error.message.toLowerCase().includes("relation")) {
    throw new Error(deleteLinks.error.message);
  }
  const deleteEvents = await supabase.from("workspace_events").delete().eq("user_id", userId);
  if (deleteEvents.error && !deleteEvents.error.message.toLowerCase().includes("relation")) {
    throw new Error(deleteEvents.error.message);
  }

  if (finalLinks.length > 0) {
    const { error } = await supabase.from("workspace_entity_links").insert(finalLinks);
    if (error) throw new Error(error.message);
  }
  if (finalEvents.length > 0) {
    const { error } = await supabase.from("workspace_events").insert(finalEvents.slice(0, 500));
    if (error) throw new Error(error.message);
  }

  return { success: true, links: finalLinks.length, events: Math.min(finalEvents.length, 500) };
}

export async function refreshWorkspaceBackstageIndexBestEffort(supabase: SupabaseClient, userId: string) {
  try {
    return await rebuildWorkspaceBackstageIndex(supabase, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("relation") && message.toLowerCase().includes("workspace_")) {
      return null;
    }
    console.warn("Backstage index refresh skipped:", message);
    return null;
  }
}
