import { createClient } from "@/lib/supabase/server";
import { TasksClient } from "@/components/tasks-client";
import type { Task } from "@/types";
import {
  createTask,
  updateTask,
  toggleTask,
  deleteTask,
  updateAnimalExperimentBatchStatus,
} from "./actions";

export default async function TasksPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  // Get upcoming experiments with cohort info for batch grouping
  const { data: upcomingExps } = await supabase
    .from("animal_experiments")
    .select("*, animals(identifier, cohort_id, birth_date)")
    .eq("user_id", user.id)
    .not("status", "in", '("completed","skipped")')
    .not("scheduled_date", "is", null)
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .limit(500);

  // Get cohort names for display
  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name")
    .eq("user_id", user.id);

  const { data: upcomingCageChanges } = await supabase
    .from("cage_changes")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .limit(10);

  const { data: meetings } = await supabase
    .from("meeting_notes")
    .select("id, title, action_items")
    .eq("user_id", user.id)
    .order("meeting_date", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/75 bg-gradient-to-br from-sky-100/65 via-blue-100/50 to-cyan-100/60 px-5 py-4 shadow-[0_24px_52px_-34px_rgba(15,23,42,0.34)] backdrop-blur-xl sm:px-7 sm:py-4.5">
        <div className="absolute -right-16 -top-14 h-44 w-44 rounded-full bg-blue-200/55 blur-2xl" />
        <div className="absolute -left-12 bottom-[-45px] h-36 w-44 rounded-full bg-cyan-200/45 blur-2xl" />
        <div className="absolute right-16 top-7 h-14 w-14 rounded-full border border-blue-300/60 bg-white/40" />
        <div className="relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Task Workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]">Execution Center</h1>
        </div>
      </div>

      <TasksClient
        tasks={(tasks || []) as Task[]}
        upcomingExperiments={upcomingExps || []}
        cohorts={cohorts || []}
        upcomingCageChanges={upcomingCageChanges || []}
        recentMeetings={meetings || []}
        actions={{ createTask, updateTask, toggleTask, deleteTask, updateAnimalExperimentBatchStatus }}
      />
    </div>
  );
}
