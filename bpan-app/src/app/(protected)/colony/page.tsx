import { createClient } from "@/lib/supabase/server";
import { ColonyClient } from "@/components/colony-client";
import type {
  BreederCage,
  Cohort,
  Animal,
  AnimalExperiment,
  ColonyTimepoint,
  AdvisorPortal,
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
  createAdvisorAccess,
  deleteAdvisorAccess,
} from "./actions";

export default async function ColonyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: breederCages },
    { data: cohorts },
    { data: animals },
    { data: animalExperiments },
    { data: timepoints },
    { data: advisorPortals },
  ] = await Promise.all([
    supabase.from("breeder_cages").select("*").eq("user_id", user.id).order("name"),
    supabase.from("cohorts").select("*").eq("user_id", user.id).order("name"),
    supabase.from("animals").select("*").eq("user_id", user.id).order("identifier"),
    supabase.from("animal_experiments").select("*").eq("user_id", user.id).order("scheduled_date"),
    supabase.from("colony_timepoints").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("advisor_portal").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mouse Colony</h1>
        <p className="text-muted-foreground">
          Manage breeder cages, cohorts, animals, experiment schedules, and PI access.
        </p>
      </div>

      <ColonyClient
        breederCages={(breederCages || []) as BreederCage[]}
        cohorts={(cohorts || []) as Cohort[]}
        animals={(animals || []) as Animal[]}
        animalExperiments={(animalExperiments || []) as AnimalExperiment[]}
        timepoints={(timepoints || []) as ColonyTimepoint[]}
        advisorPortals={(advisorPortals || []) as AdvisorPortal[]}
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
          createAdvisorAccess,
          deleteAdvisorAccess,
        }}
      />
    </div>
  );
}

