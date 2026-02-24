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
    .not("status", "in", '("completed","skipped")')
    .not("scheduled_date", "is", null)
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
      {/* ─── Hero header with mouse mascot ─── */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 50%, #c4b5fd 100%)" }}
      >
        {/* Decorative mice */}
        <span className="absolute right-6 top-3 text-[56px] opacity-[0.18] select-none pointer-events-none" style={{ transform: "rotate(15deg)" }}>🐭</span>
        <span className="absolute right-28 bottom-1 text-[36px] opacity-[0.12] select-none pointer-events-none" style={{ transform: "rotate(-10deg) scaleX(-1)" }}>🐭</span>

        {/* Inline cartoon lab-mouse SVG */}
        <div className="absolute right-40 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none select-none hidden sm:block">
          <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="32" cy="46" rx="15" ry="11" fill="#a78bfa"/>
            <circle cx="32" cy="28" r="13" fill="#c4b5fd"/>
            <ellipse cx="20" cy="17" rx="6" ry="8" fill="#a78bfa"/><ellipse cx="44" cy="17" rx="6" ry="8" fill="#a78bfa"/>
            <ellipse cx="20" cy="17" rx="3.5" ry="5" fill="#f9a8d4"/><ellipse cx="44" cy="17" rx="3.5" ry="5" fill="#f9a8d4"/>
            <circle cx="26" cy="26" r="2.5" fill="#1e1b4b"/><circle cx="38" cy="26" r="2.5" fill="#1e1b4b"/>
            <circle cx="27" cy="25" r="1" fill="white"/><circle cx="39" cy="25" r="1" fill="white"/>
            <ellipse cx="32" cy="32" rx="2" ry="1.5" fill="#f472b6"/>
            <path d="M11 31 L29 33M11 34 L29 34M35 33 L53 31M35 34 L53 34" stroke="#7c3aed" strokeWidth="0.8"/>
            <path d="M29 36 Q32 39 35 36" stroke="#5b21b6" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
            <rect x="38" y="44" width="7" height="9" rx="1" fill="white" stroke="#a78bfa" strokeWidth="1"/>
            <path d="M40 42.5 L44 42.5" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M39.5 47 L43.5 47M39.5 49 L42.5 49" stroke="#a78bfa" strokeWidth="0.7"/>
          </svg>
        </div>

        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight text-violet-900">Dashboard</h1>
          <p className="text-sm text-violet-700 mt-0.5 font-medium">
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
