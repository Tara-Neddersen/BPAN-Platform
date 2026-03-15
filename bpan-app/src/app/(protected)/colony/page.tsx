import { createClient } from "@/lib/supabase/server";
import { ColonyClient } from "@/components/colony-client";
import type { ReactNode } from "react";
import Link from "next/link";
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
  AdvisorPortalAccessLog,
} from "@/types";
import {
  createBreederCage,
  updateBreederCage,
  createTempSplitCageFromBreeder,
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
  batchScheduleSingleExperiment,
  rescheduleExperimentsAfterTimepointEdit,
} from "./actions";
import {
  batchUpsertColonyResults,
  reconcileTrackerFromExistingColonyResults,
  deleteColonyResultMeasureColumn,
} from "./result-actions";

/**
 * Fetch ALL rows from a table using cursor-based pagination.
 * Uses id > lastId ordering to avoid PostgREST max-rows issues entirely.
 * This is more reliable than .range() or RPC-based pagination.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: any, table: string, userId: string): Promise<unknown[]> {
  const PAGE = 900; // Stay comfortably under 1000-row limit
  let all: unknown[] = [];
  let lastId: string | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(PAGE);

    if (lastId) {
      query = query.gt("id", lastId);
    }

    const { data, error } = await query;
    if (error) { console.error(`fetchAllRows ${table} error:`, error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastId = (data[data.length - 1] as any).id;
    if (data.length < PAGE) break;
  }
  return all;
}

interface ColonyPageViewOptions {
  defaultTab?: string;
  initialFilterCohort?: string;
  title?: string;
  description?: string;
  showTabList?: boolean;
  footer?: ReactNode;
}

export async function renderColonyPageView({
  defaultTab = "animals",
  initialFilterCohort = "all",
  title = "Mouse Colony",
  description = "Manage breeder cages, cohorts, animals, experiment schedules, meetings, and PI access.",
  showTabList = true,
  footer,
}: ColonyPageViewOptions = {}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <section className="section-card card-density-comfy rounded-3xl px-6 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          <div className="space-y-4">
            <p className="inline-flex w-fit rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-800">
              Colony Workspace
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Track breeding, scheduling, and results in one place.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
              Built for any research team to keep colony protocol, cage logistics, and experiment progress organized with fewer spreadsheet mistakes.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/auth/signup"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Create free account
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign in
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Cohorts and breeders</h2>
              <p className="mt-1 text-sm text-slate-600">
                Maintain cage lineage, genotypes, and active colony inventory.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Protocol timeline</h2>
              <p className="mt-1 text-sm text-slate-600">
                Schedule handling, behavioral tests, and EEG milestones without manual date math.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Results + analysis</h2>
              <p className="mt-1 text-sm text-slate-600">
                Capture experiment outputs and compare cohorts in analysis-ready views.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Small tables use normal queries (well under 1000 rows)
  // Large tables use paginated RPC to bypass PostgREST 1000-row hard limit
  const [
    { data: breederCages },
    { data: cohorts },
    { data: timepoints },
    { data: advisorPortals },
    { data: advisorPortalAccessLogs },
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
    supabase.from("advisor_portal_access_logs").select("*").eq("user_id", user.id).order("viewed_at", { ascending: false }).limit(400),
    supabase.from("meeting_notes").select("*").eq("user_id", user.id).order("meeting_date", { ascending: false }),
    supabase.from("colony_photos").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("housing_cages").select("*").eq("user_id", user.id).order("cage_label"),
    fetchAllRows(supabase, "animal_experiments", user.id),
    fetchAllRows(supabase, "animals", user.id),
    fetchAllRows(supabase, "cage_changes", user.id),
    fetchAllRows(supabase, "colony_results", user.id),
  ]);

  return (
    <div className="page-shell">
      <section className="section-card card-density-comfy space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </section>

      <section className="section-card card-density-comfy">
        <ColonyClient
          defaultTab={defaultTab}
          initialFilterCohort={initialFilterCohort}
          showTabList={showTabList}
          breederCages={(breederCages || []) as BreederCage[]}
          cohorts={(cohorts || []) as Cohort[]}
          animals={(animals || []) as Animal[]}
          animalExperiments={(animalExperiments || []) as AnimalExperiment[]}
          timepoints={(timepoints || []) as ColonyTimepoint[]}
          advisorPortals={(advisorPortals || []) as AdvisorPortal[]}
          advisorPortalAccessLogs={(advisorPortalAccessLogs || []) as AdvisorPortalAccessLog[]}
          meetingNotes={(meetingNotes || []) as MeetingNote[]}
          cageChanges={(cageChanges || []) as CageChange[]}
          colonyPhotos={(colonyPhotos || []) as ColonyPhoto[]}
          housingCages={(housingCages || []) as HousingCage[]}
          colonyResults={(colonyResults || []) as ColonyResult[]}
          batchUpsertColonyResults={batchUpsertColonyResults}
          reconcileTrackerFromExistingColonyResults={reconcileTrackerFromExistingColonyResults}
          deleteColonyResultMeasureColumn={deleteColonyResultMeasureColumn}
          actions={{
            createBreederCage,
            updateBreederCage,
            createTempSplitCageFromBreeder,
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
            batchScheduleSingleExperiment,
            rescheduleExperimentsAfterTimepointEdit,
          }}
        />
      </section>
      {footer ? <section className="section-card card-density-compact">{footer}</section> : null}
    </div>
  );
}

export default async function ColonyPage({ searchParams }: { searchParams: Promise<{ tab?: string; cohort?: string }> }) {
  const params = await searchParams;
  const defaultTab = params?.tab || "animals";
  const initialFilterCohort = params?.cohort || "all";
  return renderColonyPageView({ defaultTab, initialFilterCohort });
}
