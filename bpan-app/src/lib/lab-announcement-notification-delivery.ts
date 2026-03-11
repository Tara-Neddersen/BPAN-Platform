import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToUser } from "@/lib/web-push";

type RecipientProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

const ANNOUNCEMENT_TASK_TAGS = new Set([
  "automation",
  "notification",
  "ops_update",
  "lab_announcement",
]);

function toOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function snippetFromBody(body: string, max = 160) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function mergeTags(existing: unknown) {
  const base = Array.isArray(existing) ? existing.filter((tag): tag is string => typeof tag === "string") : [];
  return [...new Set<string>([...base, ...ANNOUNCEMENT_TASK_TAGS])];
}

async function upsertAnnouncementTask(
  admin: ReturnType<typeof createAdminClient>,
  {
    recipientId,
    announcementId,
    title,
    body,
    senderName,
  }: {
    recipientId: string;
    announcementId: string;
    title: string;
    body: string;
    senderName: string;
  },
) {
  const sourceId = `announcement:${announcementId}`;
  const taskTitle = `Announcement: ${title}`;
  const description = `${senderName}: ${snippetFromBody(body, 140)}`;

  const { data: existingTask } = await admin
    .from("tasks")
    .select("id,tags")
    .eq("user_id", recipientId)
    .eq("source_type", "reminder")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();

  if (existingTask?.id) {
    await admin
      .from("tasks")
      .update({
        title: taskTitle,
        description,
        status: "pending",
        completed_at: null,
        source_label: "Lab announcement",
        tags: mergeTags(existingTask.tags),
      })
      .eq("id", existingTask.id)
      .eq("user_id", recipientId);
    return;
  }

  await admin.from("tasks").insert({
    user_id: recipientId,
    title: taskTitle,
    description,
    priority: "medium",
    status: "pending",
    source_type: "reminder",
    source_id: sourceId,
    source_label: "Lab announcement",
    tags: mergeTags([]),
  });
}

export async function deliverLabAnnouncementNotifications({
  labId,
  senderUserId,
  announcementId,
  title,
  body,
}: {
  labId: string;
  senderUserId: string;
  announcementId: string;
  title: string;
  body: string;
}) {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return;
  }

  const { data: members } = await admin
    .from("lab_members")
    .select("user_id")
    .eq("lab_id", labId)
    .eq("is_active", true);

  const recipientIds = [...new Set((members || [])
    .map((row) => String(row.user_id || ""))
    .filter((id) => id.length > 0 && id !== senderUserId))];

  if (recipientIds.length === 0) return;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,email,display_name")
    .in("id", [senderUserId, ...recipientIds]);
  const profileById = new Map<string, RecipientProfile>();
  for (const row of (profiles || []) as RecipientProfile[]) {
    profileById.set(row.id, row);
  }

  const senderProfile = profileById.get(senderUserId);
  const senderName = toOptionalString(senderProfile?.display_name)
    || toOptionalString(senderProfile?.email)
    || "Lab manager";

  for (const recipientId of recipientIds) {
    try {
      await upsertAnnouncementTask(admin, {
        recipientId,
        announcementId,
        title,
        body,
        senderName,
      });

      await sendWebPushToUser(admin, recipientId, {
        title: `New announcement: ${title}`,
        body: `${senderName}: ${snippetFromBody(body, 120)}`,
        url: "/labs?panel=announcements",
        tag: `announcement-${announcementId}`,
        urgency: "high",
        ttlSeconds: 300,
      });
    } catch {
      continue;
    }
  }
}
