import { cookies } from "next/headers";
import type { LabMembershipWithLab, LabShellSummary } from "@/lib/labs";

export const ACTIVE_LAB_COOKIE = "bpan_active_lab_id";

export type ActiveLabContext = {
  requestedLabId: string | null;
  activeMembership: LabMembershipWithLab | null;
  hasInvalidSelection: boolean;
};

export async function getRequestedActiveLabId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_LAB_COOKIE)?.value ?? "";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveActiveLabContext(
  summary: Pick<LabShellSummary, "memberships">,
  requestedLabId: string | null,
): ActiveLabContext {
  const fallbackMembership = summary.memberships[0] ?? null;

  if (!requestedLabId) {
    return {
      requestedLabId: null,
      activeMembership: fallbackMembership,
      hasInvalidSelection: false,
    };
  }

  const activeMembership = summary.memberships.find(
    (membership) => membership.lab.id === requestedLabId,
  ) ?? null;

  return {
    requestedLabId,
    activeMembership: activeMembership ?? fallbackMembership,
    hasInvalidSelection: Boolean(requestedLabId && !activeMembership),
  };
}
