import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
        identifier: a.identifier,
        sex: a.sex,
        genotype: a.genotype,
        birth_date: a.birth_date,
        status: a.status,
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
      const { data: expsData } = await supabase
        .from("animal_experiments")
        .select("*, animals(identifier)")
        .eq("user_id", userId)
        .order("scheduled_date")
        .range(0, 9999);

      animalExperiments = (expsData || []).map((e: Record<string, unknown>) => ({
        animal_identifier: (e.animals as { identifier: string } | null)?.identifier || "?",
        experiment_type: e.experiment_type,
        timepoint_age_days: e.timepoint_age_days,
        scheduled_date: e.scheduled_date,
        completed_date: e.completed_date,
        status: e.status,
        results_drive_url: canSee.includes("results") ? e.results_drive_url : null,
      }));
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
      },
    });
  } catch (err) {
    console.error("PI portal error:", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

