import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { AdvisorSidebar } from "@/components/advisor-sidebar";
import { UnifiedSearch } from "@/components/unified-search";
import { fetchLabShellSummary } from "@/lib/labs";
import { getRequestedActiveLabId, resolveActiveLabContext } from "@/lib/active-lab-context";
import { isNotificationRead, isNotificationTask, normalizeTags } from "@/lib/notifications";
import { PwaBootstrap } from "@/components/pwa-bootstrap";

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
    <div className="native-app-bg min-h-screen">
      {user ? <PwaBootstrap /> : null}
      <Nav
        userEmail={user?.email ?? null}
        labMemberships={labSummary?.memberships ?? []}
        activeLabId={activeLabContext?.activeMembership?.lab.id ?? null}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1400px] px-2.5 py-3 pb-20 sm:px-6 sm:py-8 sm:pb-8">
        <div className="native-main-surface min-h-[calc(100vh-7.5rem)] rounded-[1.65rem] px-2 py-2 sm:px-3 sm:py-3">
          {children}
        </div>
      </main>
      {user && <AdvisorSidebar />}
      {user && <UnifiedSearch />}
    </div>
  );
}
