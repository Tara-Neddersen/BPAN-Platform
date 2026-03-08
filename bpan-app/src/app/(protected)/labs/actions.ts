"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchLabShellSummary, isMissingLabRelationError } from "@/lib/labs";
import { createServiceClient } from "@/lib/supabase/service";
import type { PlatformLabRole, PlatformSharedEditPolicy } from "@/types";
import { ACTIVE_LAB_COOKIE } from "@/lib/active-lab-context";

const MANAGEABLE_MEMBER_ROLES = new Set<PlatformLabRole>(["manager", "admin"]);
const POLICY_VALUES = new Set<PlatformSharedEditPolicy>(["manager_controlled", "open_edit"]);
const ROLE_VALUES = new Set<PlatformLabRole>(["member", "manager", "admin"]);

function parsePolicy(value: FormDataEntryValue | null): PlatformSharedEditPolicy {
  return typeof value === "string" && POLICY_VALUES.has(value as PlatformSharedEditPolicy)
    ? (value as PlatformSharedEditPolicy)
    : "manager_controlled";
}

function parseRole(value: FormDataEntryValue | null): PlatformLabRole {
  return typeof value === "string" && ROLE_VALUES.has(value as PlatformLabRole)
    ? (value as PlatformLabRole)
    : "member";
}

function normalizeOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withLabSchemaGuidance(message: string) {
  return `${message} Labs are not fully available in this environment yet.`;
}

function assertActiveLabContext(formData: FormData, labId: string) {
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  if (!activeLabId) {
    throw new Error("Set an active lab before making lab collaboration changes.");
  }
  if (activeLabId !== labId) {
    throw new Error("Switch to this lab as the active context before making changes.");
  }
}

async function setActiveLabCookieValue(labId: string | null) {
  const cookieStore = await cookies();
  if (!labId) {
    cookieStore.delete(ACTIVE_LAB_COOKIE);
    return;
  }

  cookieStore.set(ACTIVE_LAB_COOKIE, labId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
  });
}

async function getCurrentMembershipRole(labId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lab_members")
    .select("role,is_active")
    .eq("lab_id", labId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingLabRelationError(error)) {
      throw new Error(withLabSchemaGuidance(error.message));
    }

    throw new Error(error.message || "Unable to verify lab membership.");
  }

  if (!data || data.is_active === false) {
    throw new Error("You no longer have access to this lab.");
  }

  return parseRole(data.role);
}

export async function createLab(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const name = normalizeOptionalString(formData.get("name"));
  const slug = normalizeOptionalString(formData.get("slug"));
  const description = normalizeOptionalString(formData.get("description"));
  const timezone = normalizeOptionalString(formData.get("timezone")) ?? "America/Los_Angeles";
  const sharedTemplateEditPolicy = parsePolicy(formData.get("shared_template_edit_policy"));
  const sharedProtocolEditPolicy = parsePolicy(formData.get("shared_protocol_edit_policy"));

  if (!name) {
    throw new Error("Lab name is required.");
  }

  const { error: createLabError } = await supabase
    .from("labs")
    .insert({
      name,
      slug,
      description,
      timezone,
      created_by: user.id,
      shared_template_edit_policy: sharedTemplateEditPolicy,
      shared_protocol_edit_policy: sharedProtocolEditPolicy,
    });

  if (createLabError) {
    throw new Error(
      withLabSchemaGuidance(createLabError?.message || "Failed to create the lab workspace."),
    );
  }

  revalidatePath("/labs");
  revalidatePath("/experiments");
}

export async function setActiveLabContext(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const labId = normalizeOptionalString(formData.get("lab_id"));

  if (!labId) {
    await setActiveLabCookieValue(null);
    revalidatePath("/labs");
    revalidatePath("/operations");
    return { status: "personal" as const };
  }

  const labSummary = await fetchLabShellSummary(supabase, user.id);
  const membership = labSummary.memberships.find((item) => item.lab.id === labId);

  if (!membership) {
    throw new Error("You do not have access to that lab.");
  }

  await setActiveLabCookieValue(labId);
  revalidatePath("/labs");
  revalidatePath("/operations");
  return { status: "lab" as const, labId };
}

export async function updateLabPolicies(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const labId = normalizeOptionalString(formData.get("lab_id"));
  if (!labId) {
    throw new Error("Lab id is required.");
  }
  assertActiveLabContext(formData, labId);

  const role = await getCurrentMembershipRole(labId, user.id);
  if (role !== "admin") {
    throw new Error("Only lab admins can update lab sharing policies.");
  }

  const { error } = await supabase
    .from("labs")
    .update({
      shared_template_edit_policy: parsePolicy(formData.get("shared_template_edit_policy")),
      shared_protocol_edit_policy: parsePolicy(formData.get("shared_protocol_edit_policy")),
    })
    .eq("id", labId);

  if (error) {
    throw new Error(withLabSchemaGuidance(error.message));
  }

  revalidatePath("/labs");
  revalidatePath("/experiments");
}

export async function addLabMemberByEmail(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const labId = normalizeOptionalString(formData.get("lab_id"));
  const email = normalizeOptionalString(formData.get("email"))?.toLowerCase();
  const role = parseRole(formData.get("role"));
  const displayTitle = normalizeOptionalString(formData.get("display_title"));

  if (!labId || !email) {
    throw new Error("Lab and email are required.");
  }
  assertActiveLabContext(formData, labId);

  const managerRole = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(managerRole)) {
    throw new Error("Only managers or admins can add members.");
  }

  const serviceSupabase = createServiceClient();
  const { data: targetProfile, error: profileLookupError } = await serviceSupabase
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error("Unable to find that user email right now.");
  }

  if (!targetProfile?.id) {
    return { status: "user_not_found" as const };
  }

  const { data: existingMembership, error: membershipLookupError } = await supabase
    .from("lab_members")
    .select("id,is_active")
    .eq("lab_id", labId)
    .eq("user_id", targetProfile.id)
    .maybeSingle();

  if (membershipLookupError) {
    throw new Error(withLabSchemaGuidance(membershipLookupError.message));
  }

  if (existingMembership?.id && existingMembership.is_active) {
    return { status: "already_member" as const };
  }

  if (existingMembership?.id) {
    const { error: reactivateError } = await supabase
      .from("lab_members")
      .update({
        is_active: true,
        role,
        display_title: displayTitle,
        invited_by: user.id,
      })
      .eq("id", existingMembership.id)
      .eq("lab_id", labId);

    if (reactivateError) {
      throw new Error(withLabSchemaGuidance(reactivateError.message));
    }

    revalidatePath("/labs");
    return { status: "added" as const };
  }

  const { error: insertError } = await supabase.from("lab_members").insert({
    lab_id: labId,
    user_id: targetProfile.id,
    role,
    display_title: displayTitle,
    invited_by: user.id,
    is_active: true,
  });

  if (insertError) {
    throw new Error(withLabSchemaGuidance(insertError.message));
  }

  revalidatePath("/labs");
  return { status: "added" as const };
}

export async function updateLabMemberDisplayName(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const labId = normalizeOptionalString(formData.get("lab_id"));
  const memberId = normalizeOptionalString(formData.get("member_id"));
  const displayTitle = normalizeOptionalString(formData.get("display_title"));

  if (!labId || !memberId) {
    throw new Error("Lab id and member id are required.");
  }
  assertActiveLabContext(formData, labId);

  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can rename members.");
  }

  const { error } = await supabase
    .from("lab_members")
    .update({
      display_title: displayTitle,
    })
    .eq("id", memberId)
    .eq("lab_id", labId);

  if (error) {
    throw new Error(withLabSchemaGuidance(error.message));
  }

  revalidatePath("/labs");
}

export async function updateLabMemberRole(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const labId = normalizeOptionalString(formData.get("lab_id"));
  const memberId = normalizeOptionalString(formData.get("member_id"));

  if (!labId || !memberId) {
    throw new Error("Lab id and member id are required.");
  }
  assertActiveLabContext(formData, labId);

  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can change member roles.");
  }

  const { error } = await supabase
    .from("lab_members")
    .update({
      role: parseRole(formData.get("role")),
    })
    .eq("id", memberId)
    .eq("lab_id", labId);

  if (error) {
    throw new Error(withLabSchemaGuidance(error.message));
  }

  revalidatePath("/labs");
}

export async function deactivateLabMember(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const labId = normalizeOptionalString(formData.get("lab_id"));
  const memberId = normalizeOptionalString(formData.get("member_id"));
  const memberUserId = normalizeOptionalString(formData.get("member_user_id"));

  if (!labId || !memberId) {
    throw new Error("Lab id and member id are required.");
  }
  assertActiveLabContext(formData, labId);

  const role = await getCurrentMembershipRole(labId, user.id);
  if (role !== "admin") {
    throw new Error("Only lab admins can deactivate members.");
  }

  if (memberUserId === user.id) {
    throw new Error("Use another admin before removing your own lab access.");
  }

  const { error } = await supabase
    .from("lab_members")
    .update({
      is_active: false,
    })
    .eq("id", memberId)
    .eq("lab_id", labId);

  if (error) {
    throw new Error(withLabSchemaGuidance(error.message));
  }

  revalidatePath("/labs");
}
