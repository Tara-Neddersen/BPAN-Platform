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
  batchUpdateExperimentStatus,
} from "./actions";
import { batchUpsertColonyResults } from "./result-actions";

// Helper: paginate RPC calls to bypass PostgREST 1000-row hard limit
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllViaRpc(supabase: any, fnName: string, params: Record<string, unknown>): Promise<unknown[]> {
  const PAGE = 1000;
  let all: unknown[] = [];
  let page = 0;
  while (true) {
    const from = page * PAGE;
    const { data, error } = await supabase.rpc(fnName, params).range(from, from + PAGE - 1);
    if (error) { console.error(`RPC ${fnName} page ${page} error:`, error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return all;
}

export default async function ColonyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Small tables use normal queries (well under 1000 rows)
  // Large tables use paginated RPC to bypass PostgREST 1000-row hard limit
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
    fetchAllViaRpc(supabase, "get_all_animal_experiments", { p_user_id: user.id }),
    fetchAllViaRpc(supabase, "get_all_animals", { p_user_id: user.id }),
    fetchAllViaRpc(supabase, "get_all_cage_changes", { p_user_id: user.id }),
    fetchAllViaRpc(supabase, "get_all_colony_results", { p_user_id: user.id }),
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
          batchUpdateExperimentStatus,
        }}
      />
    </div>
  );
}
