import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { LabShell } from "@/components/lab-shell";
import { AdvisorSidebar } from "@/components/advisor-sidebar";
import { UnifiedSearch } from "@/components/unified-search";
import { fetchLabShellSummary } from "@/lib/labs";
import { getRequestedActiveLabId, resolveActiveLabContext } from "@/lib/active-lab-context";
import { isNotificationRead, isNotificationTask, normalizeTags } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [labSummary, notificationTaskRows] = user
    ? await Promise.all([
        fetchLabShellSummary(supabase, user.id),
        supabase
          .from("tasks")
          .select("id,source_type,tags,status")
          .eq("user_id", user.id)
          .neq("status", "skipped")
          .neq("status", "completed")
          .order("updated_at", { ascending: false })
          .limit(300),
      ])
    : [null, null];
  const requestedActiveLabId = user ? await getRequestedActiveLabId() : null;
  const activeLabContext = labSummary
    ? resolveActiveLabContext(labSummary, requestedActiveLabId)
    : null;
  const unreadNotificationCount = notificationTaskRows?.data
    ? notificationTaskRows.data.filter((task) => {
        const tags = normalizeTags(task.tags);
        return isNotificationTask({ source_type: task.source_type, tags }) && !isNotificationRead(tags);
      }).length
    : 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_-10%,rgba(124,196,214,0.14),transparent_35%),radial-gradient(circle_at_100%_0%,rgba(239,210,171,0.12),transparent_38%),linear-gradient(180deg,#f7faf8,#eef6f5)]">
      <Nav
        userEmail={user?.email ?? null}
        labMemberships={labSummary?.memberships ?? []}
        activeLabId={activeLabContext?.activeMembership?.lab.id ?? null}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 min-h-[calc(100vh-3.5rem)]">
        {user ? (
          <LabShell
            summary={labSummary}
            activeLab={activeLabContext?.activeMembership ?? null}
            hasInvalidSelection={activeLabContext?.hasInvalidSelection ?? false}
          />
        ) : null}
        {children}
      </main>
      {user && <AdvisorSidebar />}
      {user && <UnifiedSearch />}
    </div>
  );
}
