import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchLabShellSummary } from "@/lib/labs";
import { getRequestedActiveLabId, resolveActiveLabContext } from "@/lib/active-lab-context";
import { WorkspaceEmptyState } from "@/components/workspace-empty-state";

export default async function LabsChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=%2Flabs%2Fchat");
  }

  const labSummary = await fetchLabShellSummary(supabase, user.id);
  const requestedActiveLabId = await getRequestedActiveLabId();
  const activeLabContext = resolveActiveLabContext(labSummary, requestedActiveLabId);

  if (!activeLabContext.activeMembership) {
    return (
      <WorkspaceEmptyState
        icon="chat"
        title="Lab chat needs an active lab"
        description="Choose or create a lab workspace first, then come back here for shared conversations, direct messages, and task follow-ups."
        primaryAction={{ label: "Open labs", href: "/labs" }}
        secondaryAction={{ label: "Return to tasks", href: "/tasks" }}
      />
    );
  }

  redirect("/labs?panel=chat");
}
