import { createClient } from "@/lib/supabase/server";
import { ColonyClient } from "@/components/colony-client";
import type {
  BreederCage,
  Cohort,
  Animal,
  AnimalExperiment,
  ColonyTimepoint,
  AdvisorPortal,
  MeetingNote,
  CageChange,
  ColonyPhoto,
  HousingCage,
  ColonyResult,
} from "@/types";
import {
  createBreederCage,
  updateBreederCage,
  deleteBreederCage,
  createCohort,
  updateCohort,
  deleteCohort,
  createAnimal,
  updateAnimal,
  deleteAnimal,
  createColonyTimepoint,
  updateColonyTimepoint,
  deleteColonyTimepoint,
  createAnimalExperiment,
  updateAnimalExperiment,
  deleteAnimalExperiment,
  scheduleExperimentsForAnimal,
  scheduleExperimentsForCohort,
  deleteExperimentsForAnimal,
  deleteExperimentsForCohort,
  createAdvisorAccess,
  deleteAdvisorAccess,
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
  generateCageChanges,
  toggleCageChange,
  deleteCageChange,
  addColonyPhoto,
  deleteColonyPhoto,
  createHousingCage,
  updateHousingCage,
  deleteHousingCage,
  assignAnimalToCage,
  rescheduleTimepointExperiments,
} from "./actions";
import { batchUpsertColonyResults } from "./result-actions";

// Cursor-based pagination: fetches ALL rows by using id > lastId (bypasses max_rows limit)
async function fetchAllRows<T extends { id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string,
): Promise<T[]> {
  const PAGE = 1000;
  const allRows: T[] = [];
  let lastId = "";
  while (true) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id")
      .limit(PAGE);
    if (lastId) {
      query = query.gt("id", lastId);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    allRows.push(...(data as T[]));
    lastId = (data[data.length - 1] as { id: string }).id;
    if (data.length < PAGE) break;
  }
  return allRows;
}

export default async function ColonyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch small tables normally, paginate large tables
  const [
    { data: breederCages },
    { data: cohorts },
    { data: timepoints },
    { data: advisorPortals },
    { data: meetingNotes },
    { data: colonyPhotos },
    { data: housingCages },
    animalExperiments,
    animals,
    cageChanges,
    colonyResults,
  ] = await Promise.all([
    supabase.from("breeder_cages").select("*").eq("user_id", user.id).order("name"),
    supabase.from("cohorts").select("*").eq("user_id", user.id).order("name"),
    supabase.from("colony_timepoints").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("advisor_portal").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("meeting_notes").select("*").eq("user_id", user.id).order("meeting_date", { ascending: false }),
    supabase.from("colony_photos").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("housing_cages").select("*").eq("user_id", user.id).order("cage_label"),
    fetchAllRows<AnimalExperiment>(supabase, "animal_experiments", user.id),
    fetchAllRows<Animal>(supabase, "animals", user.id),
    fetchAllRows<CageChange>(supabase, "cage_changes", user.id),
    fetchAllRows<ColonyResult>(supabase, "colony_results", user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mouse Colony</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage breeder cages, cohorts, animals, experiment schedules, meetings, and PI access.
        </p>
      </div>

      <ColonyClient
        breederCages={(breederCages || []) as BreederCage[]}
        cohorts={(cohorts || []) as Cohort[]}
        animals={(animals || []) as Animal[]}
        animalExperiments={(animalExperiments || []) as AnimalExperiment[]}
        timepoints={(timepoints || []) as ColonyTimepoint[]}
        advisorPortals={(advisorPortals || []) as AdvisorPortal[]}
        meetingNotes={(meetingNotes || []) as MeetingNote[]}
        cageChanges={(cageChanges || []) as CageChange[]}
        colonyPhotos={(colonyPhotos || []) as ColonyPhoto[]}
        housingCages={(housingCages || []) as HousingCage[]}
        colonyResults={(colonyResults || []) as ColonyResult[]}
        batchUpsertColonyResults={batchUpsertColonyResults}
        actions={{
          createBreederCage,
          updateBreederCage,
          deleteBreederCage,
          createCohort,
          updateCohort,
          deleteCohort,
          createAnimal,
          updateAnimal,
          deleteAnimal,
          createColonyTimepoint,
          updateColonyTimepoint,
          deleteColonyTimepoint,
          createAnimalExperiment,
          updateAnimalExperiment,
          deleteAnimalExperiment,
          scheduleExperimentsForAnimal,
          scheduleExperimentsForCohort,
          deleteExperimentsForAnimal,
          deleteExperimentsForCohort,
          createAdvisorAccess,
          deleteAdvisorAccess,
          createMeetingNote,
          updateMeetingNote,
          deleteMeetingNote,
          generateCageChanges,
          toggleCageChange,
          deleteCageChange,
          addColonyPhoto,
          deleteColonyPhoto,
          createHousingCage,
          updateHousingCage,
          deleteHousingCage,
          assignAnimalToCage,
          rescheduleTimepointExperiments,
        }}
      />
    </div>
  );
}
