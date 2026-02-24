import { createClient } from "@/lib/supabase/server";
import { TasksClient } from "@/components/tasks-client";
import type { Task } from "@/types";
import {
  createTask,
  updateTask,
  toggleTask,
  deleteTask,
} from "./actions";

export default async function TasksPage() {
  const supabase = await createClient();
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
    .in("status", ["pending", "scheduled"])
    .not("scheduled_date", "is", null)
    .order("scheduled_date")
    .limit(100);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your week at a glance — tasks, experiments, and upcoming schedule.
          </p>
        </div>
      </div>

      <TasksClient
        tasks={(tasks || []) as Task[]}
        upcomingExperiments={upcomingExps || []}
        cohorts={cohorts || []}
        upcomingCageChanges={upcomingCageChanges || []}
        recentMeetings={meetings || []}
        actions={{ createTask, updateTask, toggleTask, deleteTask }}
      />
    </div>
  );
}
