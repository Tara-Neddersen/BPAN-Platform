import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { fetchLabShellSummary } from "@/lib/labs";
import { getRequestedActiveLabId, resolveActiveLabContext } from "@/lib/active-lab-context";
import { PwaBootstrap } from "@/components/pwa-bootstrap";
import { DeferredGlobalTools } from "@/components/deferred-global-tools";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }
  const [labSummary, unreadNotificationCount] = await Promise.all([
      fetchLabShellSummary(supabase, user.id),
      (async () => {
        const { data, error } = await supabase.rpc("count_unread_notification_tasks", { p_user_id: user.id });
        if (!error && typeof data === "number") return data;

        // Fallback for environments where the RPC has not been migrated yet.
        const { data: tasks } = await supabase
          .from("tasks")
          .select("source_type,tags,status")
          .eq("user_id", user.id)
          .neq("status", "skipped")
          .neq("status", "completed")
          .order("updated_at", { ascending: false })
          .limit(300);

        return (tasks || []).filter((task) => {
          const tags = Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === "string") : [];
          const isNotification =
            task.source_type === "reminder"
            || tags.some((tag) =>
              [
                "automation",
                "notification",
                "protocol_change",
                "low_stock",
                "booking_conflict",
                "template_workflow",
                "ai_assist",
                "ops_update",
              ].includes(tag),
            );
          return isNotification && !tags.includes("notification_read");
        }).length;
      })(),
    ]);
  const requestedActiveLabId = await getRequestedActiveLabId();
  const activeLabContext = labSummary
    ? resolveActiveLabContext(labSummary, requestedActiveLabId)
    : null;
  return (
    <div className="native-app-bg min-h-screen">
      <PwaBootstrap />
      <Nav
        userEmail={user.email ?? null}
        labMemberships={labSummary?.memberships ?? []}
        activeLabId={activeLabContext?.activeMembership?.lab.id ?? null}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1400px] px-2.5 py-3 pb-20 sm:px-6 sm:py-8 sm:pb-8">
        <div className="native-main-surface min-h-[calc(100vh-7.5rem)] rounded-[1.65rem] px-2 py-2 sm:px-3 sm:py-3">
          {children}
        </div>
      </main>
      <DeferredGlobalTools />
    </div>
  );
}
