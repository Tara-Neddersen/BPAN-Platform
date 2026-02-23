import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
  _req: NextRequest,
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

    // Fetch live data based on permissions
    let animals: unknown[] = [];
    let fullAnimals: unknown[] = [];
    let animalExperiments: unknown[] = [];
    let photos: unknown[] = [];
    let colonyResults: unknown[] = [];
    let cohorts: unknown[] = [];
    let timepoints: unknown[] = [];

    // Always fetch full animals if any animal-related permission is set
    const needsAnimals = canSee.includes("animals") || canSee.includes("experiments") || canSee.includes("timeline") || canSee.includes("colony_results");
    if (needsAnimals) {
      const { data: animalsData } = await supabase
        .from("animals")
        .select("*, cohorts(name)")
        .eq("user_id", userId)
        .order("identifier");

      animals = (animalsData || []).map((a: Record<string, unknown>) => ({
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

      // Full animal objects for analysis panel
      fullAnimals = (animalsData || []).map((a: Record<string, unknown>) => ({
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

    // Fetch colony results, cohorts, and timepoints for results/analysis views
    if (canSee.includes("colony_results")) {
      const [resultsRes, cohortsRes, timepointsRes] = await Promise.all([
        supabase.from("colony_results").select("*").eq("user_id", userId).order("timepoint_age_days"),
        supabase.from("cohorts").select("*").eq("user_id", userId).order("name"),
        supabase.from("colony_timepoints").select("*").eq("user_id", userId).order("sort_order"),
      ]);
      colonyResults = resultsRes.data || [];
      cohorts = cohortsRes.data || [];
      timepoints = timepointsRes.data || [];
    }

    // Fetch photos for gallery (always included if they exist)
    const { data: photosData } = await supabase
      .from("colony_photos")
      .select("image_url, caption, experiment_type, taken_date")
      .eq("user_id", userId)
      .eq("show_in_portal", true)
      .order("sort_order");

    photos = (photosData || []).map((p: Record<string, unknown>) => ({
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

