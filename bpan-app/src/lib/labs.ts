import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lab, LabMember, PlatformLabRole } from "@/types";

type PostgrestLikeError = {
  code?: string;
  message?: string;
};

export type LabMembershipWithLab = LabMember & {
  lab: Lab;
};

export type LabShellSummary = {
  memberships: LabMembershipWithLab[];
  featureUnavailable: boolean;
  warning: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLab(value: unknown): Lab | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id : "";
  const name = typeof value.name === "string" ? value.name : "";

  if (!id || !name) return null;

  return {
    id,
    name,
    slug: typeof value.slug === "string" ? value.slug : null,
    description: typeof value.description === "string" ? value.description : null,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    outlook_sync_owner_user_id:
      typeof value.outlook_sync_owner_user_id === "string" ? value.outlook_sync_owner_user_id : null,
    shared_template_edit_policy:
      value.shared_template_edit_policy === "open_edit" ? "open_edit" : "manager_controlled",
    shared_protocol_edit_policy:
      value.shared_protocol_edit_policy === "open_edit" ? "open_edit" : "manager_controlled",
    timezone: typeof value.timezone === "string" && value.timezone ? value.timezone : "America/Los_Angeles",
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

export function isMissingLabRelationError(error: PostgrestLikeError | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    message.includes("relation") ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

export function getLabRoleRank(role: PlatformLabRole) {
  if (role === "admin") return 3;
  if (role === "manager") return 2;
  return 1;
}

export function canManageLabMembers(role: PlatformLabRole) {
  return getLabRoleRank(role) >= 2;
}

export function canManageLabPolicies(role: PlatformLabRole) {
  return role === "admin";
}

export function canDeactivateLabMembers(role: PlatformLabRole) {
  return role === "admin";
}

export async function fetchLabShellSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<LabShellSummary> {
  const { data, error } = await supabase
    .from("lab_members")
    .select(
      "id, lab_id, user_id, role, display_title, is_active, joined_at, invited_by, created_at, updated_at, labs!inner(id, name, slug, description, created_by, outlook_sync_owner_user_id, shared_template_edit_policy, shared_protocol_edit_policy, timezone, created_at, updated_at)",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true });

  if (error) {
    if (isMissingLabRelationError(error)) {
      return {
        memberships: [],
        featureUnavailable: true,
        warning: "Labs are not available in this environment yet.",
      };
    }

    return {
      memberships: [],
      featureUnavailable: true,
      warning: error.message ?? "Unable to load labs right now.",
    };
  }

  const memberships: LabMembershipWithLab[] = (data ?? [])
    .map((row) => {
      if (!isRecord(row)) return null;

      const labSource = Array.isArray(row.labs) ? row.labs[0] : row.labs;
      const lab = normalizeLab(labSource);
      const id = typeof row.id === "string" ? row.id : "";
      const labId = typeof row.lab_id === "string" ? row.lab_id : "";
      const memberUserId = typeof row.user_id === "string" ? row.user_id : "";

      if (!lab || !id || !labId || !memberUserId) return null;

      const role: PlatformLabRole =
        row.role === "admin" || row.role === "manager" || row.role === "member" ? row.role : "member";

      return {
        id,
        lab_id: labId,
        user_id: memberUserId,
        role,
        display_title: typeof row.display_title === "string" ? row.display_title : null,
        is_active: row.is_active !== false,
        joined_at: typeof row.joined_at === "string" ? row.joined_at : "",
        invited_by: typeof row.invited_by === "string" ? row.invited_by : null,
        created_at: typeof row.created_at === "string" ? row.created_at : "",
        updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
        lab,
      };
    })
    .filter((value): value is LabMembershipWithLab => Boolean(value));

  return {
    memberships,
    featureUnavailable: false,
    warning: null,
  };
}

export async function fetchLabRoster(
  supabase: SupabaseClient,
  labId: string,
): Promise<{ members: LabMember[]; featureUnavailable: boolean; warning: string | null }> {
  const { data, error } = await supabase
    .from("lab_members")
    .select("id, lab_id, user_id, role, display_title, is_active, joined_at, invited_by, created_at, updated_at")
    .eq("lab_id", labId)
    .order("joined_at", { ascending: true });

  if (error) {
    if (isMissingLabRelationError(error)) {
      return {
        members: [],
        featureUnavailable: true,
        warning: "Members are not available in this environment yet.",
      };
    }

    return {
      members: [],
      featureUnavailable: true,
      warning: error.message ?? "Unable to load members right now.",
    };
  }

  const members: LabMember[] = (data ?? [])
    .map((row) => {
      if (!isRecord(row)) return null;
      const id = typeof row.id === "string" ? row.id : "";
      const memberLabId = typeof row.lab_id === "string" ? row.lab_id : "";
      const userId = typeof row.user_id === "string" ? row.user_id : "";

      if (!id || !memberLabId || !userId) return null;

      const role: PlatformLabRole =
        row.role === "admin" || row.role === "manager" || row.role === "member" ? row.role : "member";

      return {
        id,
        lab_id: memberLabId,
        user_id: userId,
        role,
        display_title: typeof row.display_title === "string" ? row.display_title : null,
        is_active: row.is_active !== false,
        joined_at: typeof row.joined_at === "string" ? row.joined_at : "",
        invited_by: typeof row.invited_by === "string" ? row.invited_by : null,
        created_at: typeof row.created_at === "string" ? row.created_at : "",
        updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
      };
    })
    .filter((value): value is LabMember => Boolean(value));

  return {
    members,
    featureUnavailable: false,
    warning: null,
  };
}
