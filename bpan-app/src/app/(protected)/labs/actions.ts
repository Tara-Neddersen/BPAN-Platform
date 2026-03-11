"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchLabShellSummary, isMissingLabRelationError } from "@/lib/labs";
import { createServiceClient } from "@/lib/supabase/service";
import { deliverLabAnnouncementNotifications } from "@/lib/lab-announcement-notification-delivery";
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

function normalizeRequiredString(value: FormDataEntryValue | null, message: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function parseMeetingCategory(value: FormDataEntryValue | null): "general" | "inspection" {
  return value === "inspection" ? "inspection" : "general";
}

function parseMeetingStatus(value: FormDataEntryValue | null): "open" | "completed" {
  return value === "completed" ? "completed" : "open";
}

function parseAnnouncementType(value: FormDataEntryValue | null): "general" | "inspection" {
  return value === "inspection" ? "inspection" : "general";
}

function parseSharedTaskListType(value: FormDataEntryValue | null): "general" | "inspection" {
  return value === "inspection" ? "inspection" : "general";
}

function parseSharedTaskDone(value: FormDataEntryValue | null) {
  return value === "true" || value === "1" || value === "on";
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
  revalidatePath("/labs/chat");
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

type IncomingMeetingActionItem = {
  text?: string;
  details?: string | null;
  category?: "general" | "inspection";
  status?: "open" | "completed";
  responsibleMemberId?: string | null;
  responsibleLabel?: string | null;
  source?: "manual" | "ai";
};

async function assertMeetingBelongsToLab(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meetingId: string,
  labId: string,
) {
  const { data, error } = await supabase
    .from("lab_meetings")
    .select("id,lab_id")
    .eq("id", meetingId)
    .eq("lab_id", labId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Unable to verify lab meeting.");
  if (!data) throw new Error("Meeting not found in this lab.");
}

async function assertResponsibleMembersInLab(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labId: string,
  memberIds: string[],
) {
  if (memberIds.length === 0) return;
  const { data, error } = await supabase
    .from("lab_members")
    .select("id")
    .eq("lab_id", labId)
    .eq("is_active", true)
    .in("id", memberIds);

  if (error) throw new Error(error.message || "Unable to verify responsible members.");
  const allowed = new Set((data || []).map((row) => String(row.id)));
  for (const memberId of memberIds) {
    if (!allowed.has(memberId)) {
      throw new Error("Responsible person must be an active member of this lab.");
    }
  }
}

export async function createLabMeeting(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  assertActiveLabContext(formData, labId);
  await getCurrentMembershipRole(labId, user.id);

  const title = normalizeRequiredString(formData.get("title"), "Meeting title is required.");
  const meetingDate = normalizeOptionalString(formData.get("meeting_date")) ?? new Date().toISOString().slice(0, 10);
  const attendeesRaw = normalizeOptionalString(formData.get("attendees"));
  const content = normalizeOptionalString(formData.get("content")) ?? "";
  const aiSummary = normalizeOptionalString(formData.get("ai_summary"));

  const attendees = attendeesRaw
    ? attendeesRaw
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter((item, idx, arr) => item.length > 0 && arr.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === idx)
    : [];

  const { data, error } = await supabase
    .from("lab_meetings")
    .insert({
      lab_id: labId,
      created_by: user.id,
      title,
      meeting_date: meetingDate,
      attendees,
      content,
      ai_summary: aiSummary,
    })
    .select("id,lab_id,title,meeting_date,attendees,content,ai_summary,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to create meeting.");
  revalidatePath("/labs");
  return data;
}

export async function updateLabMeeting(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const meetingId = normalizeRequiredString(formData.get("meeting_id"), "Meeting id is required.");
  assertActiveLabContext(formData, labId);
  await getCurrentMembershipRole(labId, user.id);
  await assertMeetingBelongsToLab(supabase, meetingId, labId);

  const title = normalizeRequiredString(formData.get("title"), "Meeting title is required.");
  const meetingDate = normalizeOptionalString(formData.get("meeting_date")) ?? new Date().toISOString().slice(0, 10);
  const attendeesRaw = normalizeOptionalString(formData.get("attendees"));
  const content = normalizeOptionalString(formData.get("content")) ?? "";
  const aiSummary = normalizeOptionalString(formData.get("ai_summary"));

  const attendees = attendeesRaw
    ? attendeesRaw
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter((item, idx, arr) => item.length > 0 && arr.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === idx)
    : [];

  const { data, error } = await supabase
    .from("lab_meetings")
    .update({
      title,
      meeting_date: meetingDate,
      attendees,
      content,
      ai_summary: aiSummary,
    })
    .eq("id", meetingId)
    .eq("lab_id", labId)
    .select("id,lab_id,title,meeting_date,attendees,content,ai_summary,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to update meeting.");
  revalidatePath("/labs");
  return data;
}

export async function deleteLabMeeting(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const meetingId = normalizeRequiredString(formData.get("meeting_id"), "Meeting id is required.");
  assertActiveLabContext(formData, labId);
  await getCurrentMembershipRole(labId, user.id);
  await assertMeetingBelongsToLab(supabase, meetingId, labId);

  const { error } = await supabase.from("lab_meetings").delete().eq("id", meetingId).eq("lab_id", labId);
  if (error) throw new Error(error.message || "Failed to delete meeting.");
  revalidatePath("/labs");
  return { success: true };
}

export async function createLabMeetingActionItems(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const meetingId = normalizeRequiredString(formData.get("meeting_id"), "Meeting id is required.");
  assertActiveLabContext(formData, labId);
  await getCurrentMembershipRole(labId, user.id);
  await assertMeetingBelongsToLab(supabase, meetingId, labId);

  const raw = normalizeRequiredString(formData.get("items_json"), "Action items payload is required.");
  let parsed: IncomingMeetingActionItem[] = [];
  try {
    const value = JSON.parse(raw) as unknown;
    parsed = Array.isArray(value) ? (value as IncomingMeetingActionItem[]) : [];
  } catch {
    throw new Error("Action items payload is invalid JSON.");
  }

  const items = parsed
    .map((item) => ({
      text: String(item.text || "").trim(),
      details: item.details ? String(item.details).trim() : null,
      category: item.category === "inspection" ? "inspection" as const : "general" as const,
      status: item.status === "completed" ? "completed" as const : "open" as const,
      responsibleMemberId: item.responsibleMemberId ? String(item.responsibleMemberId).trim() : null,
      responsibleLabel: item.responsibleLabel ? String(item.responsibleLabel).trim() : null,
      source: item.source === "ai" ? "ai" as const : "manual" as const,
    }))
    .filter((item) => item.text.length > 0);

  if (items.length === 0) throw new Error("At least one non-empty action item is required.");
  await assertResponsibleMembersInLab(
    supabase,
    labId,
    items.map((item) => item.responsibleMemberId).filter((id): id is string => Boolean(id)),
  );

  const payload = items.map((item) => ({
    lab_meeting_id: meetingId,
    text: item.text,
    details: item.details,
    category: item.category,
    status: item.status,
    responsible_member_id: item.responsibleMemberId,
    responsible_label: item.responsibleLabel,
    source: item.source,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("lab_meeting_action_items")
    .insert(payload)
    .select("id,lab_meeting_id,text,details,category,status,responsible_member_id,responsible_label,source,created_at,updated_at");

  if (error) throw new Error(error.message || "Failed to save action items.");
  revalidatePath("/labs");
  return data || [];
}

export async function updateLabMeetingActionItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const actionItemId = normalizeRequiredString(formData.get("action_item_id"), "Action item id is required.");
  assertActiveLabContext(formData, labId);
  await getCurrentMembershipRole(labId, user.id);

  const { data: existing, error: existingError } = await supabase
    .from("lab_meeting_action_items")
    .select("id,lab_meeting_id")
    .eq("id", actionItemId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message || "Unable to load action item.");
  if (!existing?.id || !existing.lab_meeting_id) throw new Error("Action item not found.");
  await assertMeetingBelongsToLab(supabase, String(existing.lab_meeting_id), labId);

  const responsibleMemberId = normalizeOptionalString(formData.get("responsible_member_id"));
  await assertResponsibleMembersInLab(supabase, labId, responsibleMemberId ? [responsibleMemberId] : []);

  const updatePayload = {
    text: normalizeRequiredString(formData.get("text"), "Action item text is required."),
    details: normalizeOptionalString(formData.get("details")),
    category: parseMeetingCategory(formData.get("category")),
    status: parseMeetingStatus(formData.get("status")),
    responsible_member_id: responsibleMemberId,
    responsible_label: normalizeOptionalString(formData.get("responsible_label")),
  };

  const { data, error } = await supabase
    .from("lab_meeting_action_items")
    .update(updatePayload)
    .eq("id", actionItemId)
    .select("id,lab_meeting_id,text,details,category,status,responsible_member_id,responsible_label,source,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to update action item.");
  revalidatePath("/labs");
  return data;
}

export async function deleteLabMeetingActionItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const actionItemId = normalizeRequiredString(formData.get("action_item_id"), "Action item id is required.");
  assertActiveLabContext(formData, labId);
  await getCurrentMembershipRole(labId, user.id);

  const { data: existing, error: existingError } = await supabase
    .from("lab_meeting_action_items")
    .select("id,lab_meeting_id")
    .eq("id", actionItemId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message || "Unable to load action item.");
  if (!existing?.id || !existing.lab_meeting_id) throw new Error("Action item not found.");
  await assertMeetingBelongsToLab(supabase, String(existing.lab_meeting_id), labId);

  const { error } = await supabase.from("lab_meeting_action_items").delete().eq("id", actionItemId);
  if (error) throw new Error(error.message || "Failed to delete action item.");
  revalidatePath("/labs");
  return { success: true };
}

export async function createLabAnnouncement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  assertActiveLabContext(formData, labId);
  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can post announcements.");
  }

  const title = normalizeRequiredString(formData.get("title"), "Announcement title is required.");
  const body = normalizeRequiredString(formData.get("body"), "Announcement body is required.");
  const type = parseAnnouncementType(formData.get("announcement_type"));

  const { data, error } = await supabase
    .from("lab_announcements")
    .insert({
      lab_id: labId,
      type,
      title,
      body,
      created_by: user.id,
    })
    .select("id,lab_id,type,title,body,created_by,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to post announcement.");

  void deliverLabAnnouncementNotifications({
    labId,
    senderUserId: user.id,
    announcementId: String(data.id),
    title: String(data.title),
    body: String(data.body),
  });

  revalidatePath("/labs");
  return data;
}

export async function deleteLabAnnouncement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const announcementId = normalizeRequiredString(formData.get("announcement_id"), "Announcement id is required.");
  assertActiveLabContext(formData, labId);
  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can delete announcements.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("lab_announcements")
    .select("id,lab_id")
    .eq("id", announcementId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message || "Unable to load announcement.");
  if (!existing?.id) throw new Error("Announcement not found.");

  const { error } = await supabase
    .from("lab_announcements")
    .delete()
    .eq("id", announcementId)
    .eq("lab_id", labId);
  if (error) throw new Error(error.message || "Failed to delete announcement.");

  revalidatePath("/labs");
  return { success: true };
}

export async function createLabSharedTask(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  assertActiveLabContext(formData, labId);
  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can create shared tasks.");
  }

  const title = normalizeRequiredString(formData.get("title"), "Task title is required.");
  const details = normalizeOptionalString(formData.get("details")) ?? "";
  const listType = parseSharedTaskListType(formData.get("list_type"));
  const assigneeMemberId = normalizeOptionalString(formData.get("assignee_member_id"));
  await assertResponsibleMembersInLab(supabase, labId, assigneeMemberId ? [assigneeMemberId] : []);

  const { data, error } = await supabase
    .from("lab_shared_tasks")
    .insert({
      lab_id: labId,
      list_type: listType,
      title,
      details,
      assignee_member_id: assigneeMemberId,
      done: false,
      completed_at: null,
      created_by: user.id,
    })
    .select("id,lab_id,list_type,title,details,assignee_member_id,done,completed_at,created_by,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to create shared task.");
  revalidatePath("/labs");
  return data;
}

export async function updateLabSharedTask(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const taskId = normalizeRequiredString(formData.get("task_id"), "Task id is required.");
  assertActiveLabContext(formData, labId);
  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can update shared tasks.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("lab_shared_tasks")
    .select("id,lab_id")
    .eq("id", taskId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message || "Unable to load task.");
  if (!existing?.id) throw new Error("Shared task not found.");

  const title = normalizeRequiredString(formData.get("title"), "Task title is required.");
  const details = normalizeOptionalString(formData.get("details")) ?? "";
  const listType = parseSharedTaskListType(formData.get("list_type"));
  const assigneeMemberId = normalizeOptionalString(formData.get("assignee_member_id"));
  await assertResponsibleMembersInLab(supabase, labId, assigneeMemberId ? [assigneeMemberId] : []);
  const done = parseSharedTaskDone(formData.get("done"));

  const { data, error } = await supabase
    .from("lab_shared_tasks")
    .update({
      list_type: listType,
      title,
      details,
      assignee_member_id: assigneeMemberId,
      done,
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("lab_id", labId)
    .select("id,lab_id,list_type,title,details,assignee_member_id,done,completed_at,created_by,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to update shared task.");
  revalidatePath("/labs");
  return data;
}

export async function deleteLabSharedTask(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const labId = normalizeRequiredString(formData.get("lab_id"), "Lab id is required.");
  const taskId = normalizeRequiredString(formData.get("task_id"), "Task id is required.");
  assertActiveLabContext(formData, labId);
  const role = await getCurrentMembershipRole(labId, user.id);
  if (!MANAGEABLE_MEMBER_ROLES.has(role)) {
    throw new Error("Only managers or admins can delete shared tasks.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("lab_shared_tasks")
    .select("id,lab_id")
    .eq("id", taskId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message || "Unable to load task.");
  if (!existing?.id) throw new Error("Shared task not found.");

  const { error } = await supabase.from("lab_shared_tasks").delete().eq("id", taskId).eq("lab_id", labId);
  if (error) throw new Error(error.message || "Failed to delete shared task.");

  revalidatePath("/labs");
  return { success: true };
}
