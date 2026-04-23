import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getWorkspaceCalendarFeedEvents } from "@/lib/workspace-calendar-feed";

/**
 * Cursor-based pagination: fetch ALL rows from a table using id > lastId.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: any, table: string, userId: string): Promise<any[]> {
  const PAGE = 900;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let lastId: string | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(PAGE);

    if (lastId) query = query.gt("id", lastId);

    const { data, error } = await query;
    if (error) { console.error(`fetchAllRows ${table} error:`, error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE) break;
  }
  return all;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createServiceClient();

    // Look up the portal access
    const { data: portal, error: portalError } = await supabase
      .from("advisor_portal")
      .select("*")
      .eq("token", token)
      .single();

    if (portalError || !portal) {
      return NextResponse.json({ error: "Access denied" }, { status: 404 });
    }

    const userId = portal.user_id;
    const canSee = portal.can_see || [];

    // Update last_viewed_at
    await supabase
      .from("advisor_portal")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", portal.id);

    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0]?.trim() : null;
    const userAgent = req.headers.get("user-agent");

    await supabase.from("advisor_portal_access_logs").insert({
      user_id: userId,
      portal_id: portal.id,
      viewed_at: new Date().toISOString(),
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

    // Fetch live data based on permissions
    let animals: unknown[] = [];
    let fullAnimals: unknown[] = [];
    let animalExperiments: unknown[] = [];
    let photos: unknown[] = [];
    let colonyResults: unknown[] = [];
    let cohorts: unknown[] = [];
    let timepoints: unknown[] = [];
    let experimentRuns: unknown[] = [];
    let calendarEvents: unknown[] = [];
    let meetingActions: unknown[] = [];
    let sharedTasks: unknown[] = [];

    // Always fetch full animals if any animal-related permission is set
    const needsAnimals = canSee.includes("animals") || canSee.includes("experiments") || canSee.includes("timeline") || canSee.includes("colony_results");
    if (needsAnimals) {
      const { data: animalsData } = await supabase
        .from("animals")
        .select("*, cohorts(name)")
        .eq("user_id", userId)
        .order("identifier");

      const portalAnimals = (animalsData || []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        identifier: a.identifier,
        sex: a.sex,
        genotype: a.genotype,
        birth_date: a.birth_date,
        status: a.status,
        cohort_id: a.cohort_id as string,
        cohort_name: (a.cohorts as { name: string } | null)?.name || "Unknown",
        ear_tag: a.ear_tag,
        cage_number: a.cage_number,
        eeg_implanted: a.eeg_implanted,
      }));
      animals = portalAnimals.sort((a, b) => {
        const cohortCmp = String(a.cohort_name || "").localeCompare(String(b.cohort_name || ""), undefined, { numeric: true });
        if (cohortCmp !== 0) return cohortCmp;
        return String(a.identifier || "").localeCompare(String(b.identifier || ""), undefined, { numeric: true });
      });
      const cohortNameByAnimalId = new Map(portalAnimals.map((a) => [String(a.id), String(a.cohort_name || "")]));

      // Full animal objects for analysis panel
      const fullAnimalRows = (animalsData || []).map((a: Record<string, unknown>) => ({
        id: a.id,
        user_id: a.user_id,
        cohort_id: a.cohort_id,
        identifier: a.identifier,
        sex: a.sex,
        genotype: a.genotype,
        ear_tag: a.ear_tag,
        birth_date: a.birth_date,
        cage_number: a.cage_number,
        housing_cage_id: a.housing_cage_id,
        status: a.status,
        eeg_implanted: a.eeg_implanted,
        eeg_implant_date: a.eeg_implant_date,
        notes: a.notes,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));
      fullAnimals = fullAnimalRows.sort((a, b) => {
        const cohortA = cohortNameByAnimalId.get(String(a.id)) || "";
        const cohortB = cohortNameByAnimalId.get(String(b.id)) || "";
        const cohortCmp = String(cohortA).localeCompare(String(cohortB), undefined, { numeric: true });
        if (cohortCmp !== 0) return cohortCmp;
        return String(a.identifier || "").localeCompare(String(b.identifier || ""), undefined, { numeric: true });
      });
    }

    if (canSee.includes("experiments") || canSee.includes("timeline") || canSee.includes("results")) {
      // Cursor-based pagination to bypass 1000-row limit, then join animal identifiers
      const [allExpsRaw, allAnimalsRaw] = await Promise.all([
        fetchAllRows(supabase, "animal_experiments", userId),
        fetchAllRows(supabase, "animals", userId),
      ]);
      const animalMapById = new Map(
        (allAnimalsRaw as { id: string; identifier: string; cohort_id: string }[]).map(a => [a.id, a])
      );

      animalExperiments = (allExpsRaw as Record<string, unknown>[]).map((e) => {
        const animal = animalMapById.get(e.animal_id as string);
        return {
          animal_id: e.animal_id,
          animal_identifier: animal?.identifier || "?",
          cohort_id: animal?.cohort_id || null,
          experiment_type: e.experiment_type,
          timepoint_age_days: e.timepoint_age_days,
          scheduled_date: e.scheduled_date,
          completed_date: e.completed_date,
          status: e.status,
          results_drive_url: canSee.includes("results") ? e.results_drive_url : null,
          notes: e.notes || null,
        };
      });
    }

    // Fetch colony results, cohorts, timepoints, and experiment runs so
    // the PI portal can scope the results / analysis views by run. Runs
    // are low-volume (one per cohort batch) so we just pull them all.
    if (canSee.includes("colony_results")) {
      const [resultsRes, cohortsRes, timepointsRes, runsRes] = await Promise.all([
        supabase.from("colony_results").select("*").eq("user_id", userId).order("timepoint_age_days"),
        supabase.from("cohorts").select("*").eq("user_id", userId).order("name"),
        supabase.from("colony_timepoints").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("experiment_runs").select("id,name,status,created_at").eq("user_id", userId).order("created_at"),
      ]);
      colonyResults = resultsRes.data || [];
      cohorts = cohortsRes.data || [];
      timepoints = timepointsRes.data || [];
      experimentRuns = runsRes.data || [];
    }

    if (canSee.includes("calendar") || canSee.includes("timeline") || canSee.includes("experiments")) {
      const feedEvents = await getWorkspaceCalendarFeedEvents(supabase, userId);
      calendarEvents = feedEvents.map((ev) => ({
        id: `${ev.sourceKind}:${ev.sourceId}`,
        user_id: userId,
        title: ev.summary,
        description: ev.description || null,
        start_at: ev.startAt,
        end_at: ev.endAt || null,
        all_day: ev.allDay,
        status: "scheduled",
        category: ev.sourceKind,
        location: ev.location || null,
        source_type: ev.sourceKind,
        source_id: ev.sourceId,
        source_label: ev.summary,
        metadata: { source_kind: ev.sourceKind },
        created_at: ev.startAt,
        updated_at: ev.startAt,
      }));
    }

    const { data: meetingNotes } = await supabase
      .from("meeting_notes")
      .select("id,title,meeting_date,action_items")
      .eq("user_id", userId)
      .order("meeting_date", { ascending: false })
      .limit(12);

    meetingActions = (meetingNotes || []).flatMap((meeting) => {
      const items = Array.isArray(meeting.action_items) ? meeting.action_items : [];
      return items
        .filter((item) => item && typeof item === "object" && "text" in item)
        .map((item) => {
          const text = String(item.text || "").trim();
          if (!text) return null;
          return {
            meeting_id: meeting.id,
            meeting_title: meeting.title,
            meeting_date: meeting.meeting_date,
            text,
            done: Boolean(item.done),
            due_date: item.due_date ? String(item.due_date) : null,
            owner: item.owner ? String(item.owner) : null,
          };
        })
        .filter(Boolean);
    });

    const { data: sharedTaskRows } = await supabase
      .from("tasks")
      .select("id,title,description,due_date,status,priority,source_label,tags")
      .eq("user_id", userId)
      .contains("tags", ["shared_with_pi"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(40);

    sharedTasks = (sharedTaskRows || []).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      due_date: task.due_date,
      status: task.status,
      priority: task.priority,
      source_label: task.source_label,
    }));

    // Fetch photos for gallery (always included if they exist)
    const { data: photosData } = await supabase
      .from("colony_photos")
      .select("id,image_url,caption,experiment_type,taken_date")
      .eq("user_id", userId)
      .eq("show_in_portal", true)
      .order("sort_order");

    photos = (photosData || []).map((p: Record<string, unknown>) => ({
      id: p.id,
      image_url: p.image_url,
      caption: p.caption,
      experiment_type: p.experiment_type,
      taken_date: p.taken_date,
    }));

    // Stats
    const totalAnimals = animals.length;
    const activeAnimals = (animals as Array<{ status: string }>).filter((a) => a.status === "active").length;
    const pendingExps = (animalExperiments as Array<{ status: string }>).filter((e) => e.status === "scheduled").length;
    const completedExps = (animalExperiments as Array<{ status: string }>).filter((e) => e.status === "completed").length;
    const inProgressExps = (animalExperiments as Array<{ status: string }>).filter((e) => e.status === "in_progress").length;
    const skippedExps = (animalExperiments as Array<{ status: string }>).filter((e) => e.status === "skipped").length;

    return NextResponse.json({
      advisor_name: portal.advisor_name,
      can_see: canSee,
      animals,
      full_animals: canSee.includes("colony_results") ? fullAnimals : [],
      experiments: animalExperiments,
      colony_results: colonyResults,
      cohorts,
      timepoints,
      experiment_runs: experimentRuns,
      calendar_events: calendarEvents,
      meeting_actions: meetingActions,
      shared_tasks: sharedTasks,
      photos,
      stats: {
        total_animals: totalAnimals,
        active_animals: activeAnimals,
        pending_experiments: pendingExps,
        completed_experiments: completedExps,
        in_progress_experiments: inProgressExps,
        skipped_experiments: skippedExps,
      },
    });
  } catch (err) {
    console.error("PI portal error:", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
