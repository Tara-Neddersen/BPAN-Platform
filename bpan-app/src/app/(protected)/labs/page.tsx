import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchLabRoster, fetchLabShellSummary } from "@/lib/labs";
import { LabsClient } from "@/components/labs-client";
import { LabOperationsClient } from "@/components/lab-operations-client";
import { LabsChatClient, type ChatMessageItem, type ChatThreadItem } from "@/components/labs-chat-client";
import { getRequestedActiveLabId, resolveActiveLabContext } from "@/lib/active-lab-context";
import type {
  LabEquipment,
  LabEquipmentBooking,
  LabReagent,
  LabReagentStockEvent,
  Message,
  MessageRead,
  MessageThread,
  TaskLink,
} from "@/types";
import {
  createEquipmentBooking,
  createLabEquipment,
  createLabReagent,
  createObjectMessage,
  createReagentStockEvent,
  createTaskLink,
  deleteEquipmentBooking,
  deleteLabEquipment,
  deleteLabReagent,
  setLabEquipmentActive,
  updateEquipmentBooking,
  updateEquipmentBookingStatus,
  updateLabEquipment,
  updateLabReagent,
} from "@/app/(protected)/operations/actions";
import {
  createLabChatThread,
  editLabChatMessage,
  markLabChatThreadRead,
  markLabChatThreadUnread,
  sendLabChatMessage,
} from "@/app/(protected)/labs/chat/actions";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type LabMemberTitleRow = {
  user_id: string;
  display_title: string | null;
};

type InventorySyncStatus = {
  lastSyncAt: string | null;
  fetched: number | null;
  matched: number | null;
  inserted: number | null;
  source: "quartzy_stock_events" | "placeholder";
  hint: string;
};

function normalizeSubject(subject: string | null) {
  if (!subject || subject.trim().length === 0) return "General";
  return subject.trim();
}

function isGeneralThread(thread: MessageThread) {
  return normalizeSubject(thread.subject).toLowerCase() === "general";
}

function toTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function objectKey(linkedObjectType: string, linkedObjectId: string) {
  return `${linkedObjectType}:${linkedObjectId}`;
}

async function loadOperationsPanelData({
  supabase,
  serviceSupabase,
  userId,
  activeLabId,
  activeLabName,
  role,
  warning,
  featureUnavailable,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  serviceSupabase: ReturnType<typeof createServiceClient>;
  userId: string;
  activeLabId: string;
  activeLabName: string;
  role: string | null;
  warning: string | null;
  featureUnavailable: boolean;
}) {
  const [taskResult, reagentResult, equipmentResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,due_date,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("lab_reagents")
      .select("*")
      .eq("lab_id", activeLabId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("lab_equipment")
      .select("*")
      .eq("lab_id", activeLabId)
      .order("name", { ascending: true }),
  ]);

  const tasks = (taskResult.data ?? []) as Array<{
    id: string;
    title: string | null;
    status: string | null;
    due_date: string | null;
  }>;
  const reagents = (reagentResult.data ?? []) as LabReagent[];
  const equipment = (equipmentResult.data ?? []) as LabEquipment[];

  const reagentIds = reagents.map((item) => item.id);
  const equipmentIds = equipment.map((item) => item.id);

  const [
    stockEventsResult,
    bookingResult,
    reagentTaskLinksResult,
    reagentThreadsResult,
    equipmentTaskLinksResult,
    equipmentThreadsResult,
  ] = await Promise.all([
    reagentIds.length > 0
      ? supabase
          .from("lab_reagent_stock_events")
          .select("*")
          .in("lab_reagent_id", reagentIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as LabReagentStockEvent[] }),
    equipmentIds.length > 0
      ? supabase
          .from("lab_equipment_bookings")
          .select("*")
          .in("equipment_id", equipmentIds)
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] as LabEquipmentBooking[] }),
    reagentIds.length > 0
      ? supabase
          .from("task_links")
          .select("*")
          .eq("linked_object_type", "lab_reagent")
          .in("linked_object_id", reagentIds)
      : Promise.resolve({ data: [] as TaskLink[] }),
    reagentIds.length > 0
      ? supabase
          .from("message_threads")
          .select("*")
          .eq("lab_id", activeLabId)
          .eq("linked_object_type", "lab_reagent")
          .in("linked_object_id", reagentIds)
      : Promise.resolve({ data: [] as MessageThread[] }),
    equipmentIds.length > 0
      ? supabase
          .from("task_links")
          .select("*")
          .eq("linked_object_type", "lab_equipment")
          .in("linked_object_id", equipmentIds)
      : Promise.resolve({ data: [] as TaskLink[] }),
    equipmentIds.length > 0
      ? supabase
          .from("message_threads")
          .select("*")
          .eq("lab_id", activeLabId)
          .eq("linked_object_type", "lab_equipment")
          .in("linked_object_id", equipmentIds)
      : Promise.resolve({ data: [] as MessageThread[] }),
  ]);

  const bookings = (bookingResult.data ?? []) as LabEquipmentBooking[];
  const bookingIds = bookings.map((item) => item.id);

  const [bookingTaskLinksResolved, bookingThreadsResolved] = await Promise.all([
    bookingIds.length > 0
      ? supabase
          .from("task_links")
          .select("*")
          .eq("linked_object_type", "lab_equipment_booking")
          .in("linked_object_id", bookingIds)
      : Promise.resolve({ data: [] as TaskLink[] }),
    bookingIds.length > 0
      ? supabase
          .from("message_threads")
          .select("*")
          .eq("lab_id", activeLabId)
          .eq("linked_object_type", "lab_equipment_booking")
          .in("linked_object_id", bookingIds)
      : Promise.resolve({ data: [] as MessageThread[] }),
  ]);

  const stockEvents = (stockEventsResult.data ?? []) as LabReagentStockEvent[];
  const reagentTaskLinks = (reagentTaskLinksResult.data ?? []) as TaskLink[];
  const equipmentTaskLinks = (equipmentTaskLinksResult.data ?? []) as TaskLink[];
  const bookingTaskLinks = (bookingTaskLinksResolved.data ?? []) as TaskLink[];
  const reagentThreads = (reagentThreadsResult.data ?? []) as MessageThread[];
  const equipmentThreads = (equipmentThreadsResult.data ?? []) as MessageThread[];
  const bookingThreads = (bookingThreadsResolved.data ?? []) as MessageThread[];
  const threads = [...reagentThreads, ...equipmentThreads, ...bookingThreads];
  const threadIds = threads.map((thread) => thread.id);

  const messagesResult = threadIds.length > 0
    ? await supabase
        .from("messages")
        .select("*")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true })
    : { data: [] as Message[] };
  const messages = (messagesResult.data ?? []) as Message[];

  const actorIds = [
    ...new Set([
      ...messages.map((item) => item.author_user_id).filter((id): id is string => Boolean(id)),
      ...bookings.map((item) => item.booked_by).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const [profilesResult, memberTitlesResult] = await Promise.all([
    actorIds.length > 0
      ? serviceSupabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", actorIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    actorIds.length > 0
      ? supabase
          .from("lab_members")
          .select("user_id,display_title")
          .eq("lab_id", activeLabId)
          .in("user_id", actorIds)
      : Promise.resolve({ data: [] as LabMemberTitleRow[] }),
  ]);

  const authorLabelById = new Map<string, string>();
  for (const row of (profilesResult.data ?? []) as ProfileRow[]) {
    const label =
      row.display_name && row.display_name.trim().length > 0
        ? row.display_name.trim()
        : row.email && row.email.trim().length > 0
          ? row.email.trim()
          : "Lab member";
    authorLabelById.set(row.id, label);
  }
  for (const row of (memberTitlesResult.data ?? []) as LabMemberTitleRow[]) {
    if (row.display_title && row.display_title.trim().length > 0) {
      authorLabelById.set(row.user_id, row.display_title.trim());
    }
  }

  const stockEventsByReagentId = new Map<string, LabReagentStockEvent[]>();
  for (const event of stockEvents) {
    const list = stockEventsByReagentId.get(event.lab_reagent_id) ?? [];
    list.push(event);
    stockEventsByReagentId.set(event.lab_reagent_id, list);
  }

  const taskLinksByObject = new Map<string, string[]>();
  for (const link of [...reagentTaskLinks, ...equipmentTaskLinks, ...bookingTaskLinks]) {
    const key = objectKey(link.linked_object_type, link.linked_object_id);
    const list = taskLinksByObject.get(key) ?? [];
    list.push(link.task_id);
    taskLinksByObject.set(key, list);
  }

  const threadsByObject = new Map<string, string[]>();
  for (const thread of threads) {
    const key = objectKey(thread.linked_object_type, thread.linked_object_id);
    const list = threadsByObject.get(key) ?? [];
    list.push(thread.id);
    threadsByObject.set(key, list);
  }

  const messagesByThreadId = new Map<string, Message[]>();
  for (const message of messages) {
    const list = messagesByThreadId.get(message.thread_id) ?? [];
    list.push(message);
    messagesByThreadId.set(message.thread_id, list);
  }

  const toMessageView = (message: Message) => ({
    id: message.id,
    authorLabel:
      message.author_user_id === userId
        ? "You"
        : authorLabelById.get(message.author_user_id ?? "") ?? "Lab member",
    body: message.body,
    timestamp: message.created_at,
  });

  const messagesForObject = (
    linkedObjectType: "lab_reagent" | "lab_equipment" | "lab_equipment_booking",
    linkedObjectId: string,
  ) => {
    const objectThreadIds = threadsByObject.get(objectKey(linkedObjectType, linkedObjectId)) ?? [];
    return objectThreadIds
      .flatMap((threadId) => messagesByThreadId.get(threadId) ?? [])
      .sort((a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at))
      .map(toMessageView);
  };

  const equipmentById = new Map(equipment.map((item) => [item.id, item]));

  const panelData = {
    labContext: {
      currentUserId: userId,
      labId: activeLabId,
      labName: activeLabName,
      role,
      featureUnavailable,
      warning,
    },
    taskOptions: tasks.map((task) => ({
      id: task.id,
      title: task.title ?? "Untitled task",
      status: task.status ?? "pending",
      dueDate: task.due_date,
    })),
    inventory: reagents.map((item) => ({
      id: item.id,
      name: item.name,
      catalogNumber: item.catalog_number,
      supplier: item.supplier,
      lotNumber: item.lot_number,
      quantity: item.quantity,
      unit: item.unit,
      reorderThreshold: item.reorder_threshold,
      needsReorder: item.needs_reorder,
      lastOrderedAt: item.last_ordered_at,
      storageLocation: item.storage_location,
      notes: item.notes,
      stockEvents: stockEventsByReagentId.get(item.id) ?? [],
      linkedTaskIds: taskLinksByObject.get(objectKey("lab_reagent", item.id)) ?? [],
      messages: messagesForObject("lab_reagent", item.id),
    })),
    equipmentOptions: equipment.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      location: item.location,
      bookingRequiresApproval: item.booking_requires_approval,
      isActive: item.is_active,
      linkedTaskIds: taskLinksByObject.get(objectKey("lab_equipment", item.id)) ?? [],
      messages: messagesForObject("lab_equipment", item.id),
    })),
    bookings: bookings.map((item) => ({
      id: item.id,
      equipmentId: item.equipment_id,
      equipmentName: equipmentById.get(item.equipment_id)?.name ?? "Unknown equipment",
      location: equipmentById.get(item.equipment_id)?.location ?? null,
      title: item.title,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      status: item.status,
      bookedBy: item.booked_by,
      bookedByLabel: item.booked_by ? authorLabelById.get(item.booked_by) ?? "Lab member" : "Unassigned",
      taskId: item.task_id,
      notes: item.notes,
      bookingRequiresApproval: equipmentById.get(item.equipment_id)?.booking_requires_approval ?? false,
      linkedTaskIds: taskLinksByObject.get(objectKey("lab_equipment_booking", item.id)) ?? [],
      messages: messagesForObject("lab_equipment_booking", item.id),
    })),
  };

  return panelData;
}

async function loadLabChatPanelData({
  supabase,
  serviceSupabase,
  userId,
  activeLabId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  serviceSupabase: ReturnType<typeof createServiceClient>;
  userId: string;
  activeLabId: string;
}) {
  const { data: existingThreads } = await supabase
    .from("message_threads")
    .select("*")
    .eq("lab_id", activeLabId)
    .eq("linked_object_type", "lab")
    .eq("linked_object_id", activeLabId)
    .order("updated_at", { ascending: false });

  let threads = (existingThreads ?? []) as MessageThread[];
  if (!threads.some(isGeneralThread)) {
    const { data: generalThread } = await supabase
      .from("message_threads")
      .insert({
        lab_id: activeLabId,
        owner_user_id: null,
        subject: "General",
        linked_object_type: "lab",
        linked_object_id: activeLabId,
        created_by: userId,
      })
      .select("*")
      .single();
    if (generalThread) {
      threads = [generalThread as MessageThread, ...threads];
    }
  }

  const threadIds = threads.map((thread) => thread.id);
  const { data: messageRows } = threadIds.length > 0
    ? await supabase
        .from("messages")
        .select("*")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true })
    : { data: [] as Message[] };
  const messages = (messageRows ?? []) as Message[];
  const messageIds = messages.map((message) => message.id);

  const { data: readRows } = messageIds.length > 0
    ? await supabase
        .from("message_reads")
        .select("*")
        .eq("user_id", userId)
        .in("message_id", messageIds)
    : { data: [] as MessageRead[] };
  const readSet = new Set(((readRows ?? []) as MessageRead[]).map((row) => row.message_id));

  const authorIds = [...new Set(messages.map((item) => item.author_user_id).filter((id): id is string => Boolean(id)))];
  const [profilesResult, memberTitlesResult] = await Promise.all([
    authorIds.length > 0
      ? serviceSupabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", authorIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    authorIds.length > 0
      ? supabase
          .from("lab_members")
          .select("user_id,display_title")
          .eq("lab_id", activeLabId)
          .in("user_id", authorIds)
      : Promise.resolve({ data: [] as LabMemberTitleRow[] }),
  ]);

  const authorLabelById = new Map<string, string>();
  for (const row of (profilesResult.data ?? []) as ProfileRow[]) {
    authorLabelById.set(
      row.id,
      row.display_name?.trim() || row.email?.trim() || "Lab member",
    );
  }
  for (const row of (memberTitlesResult.data ?? []) as LabMemberTitleRow[]) {
    if (row.display_title?.trim()) authorLabelById.set(row.user_id, row.display_title.trim());
  }

  const messagesByThread = new Map<string, Message[]>();
  for (const message of messages) {
    const list = messagesByThread.get(message.thread_id) ?? [];
    list.push(message);
    messagesByThread.set(message.thread_id, list);
  }

  const threadItems: ChatThreadItem[] = threads
    .map((thread) => {
      const threadMessages = messagesByThread.get(thread.id) ?? [];
      const unreadCount = threadMessages.filter(
        (message) => message.author_user_id !== userId && !readSet.has(message.id),
      ).length;
      const lastMessageAt = threadMessages.length > 0
        ? threadMessages[threadMessages.length - 1].created_at
        : thread.updated_at;

      return {
        id: thread.id,
        title: normalizeSubject(thread.subject),
        isGeneral: isGeneralThread(thread),
        threadType: "all_lab" as const,
        recipientScope: thread.recipient_scope,
        participantUserIds: [],
        participantLabels: [],
        unreadCount,
        messageCount: threadMessages.length,
        lastMessageAt,
      };
    })
    .sort((a, b) => {
      if (a.isGeneral && !b.isGeneral) return -1;
      if (!a.isGeneral && b.isGeneral) return 1;
      return toTimestamp(b.lastMessageAt) - toTimestamp(a.lastMessageAt);
    });

  const messageItems: ChatMessageItem[] = messages.map((message) => ({
    id: message.id,
    threadId: message.thread_id,
    body: message.body,
    authorUserId: message.author_user_id,
    authorLabel:
      message.author_user_id === userId
        ? "You"
        : authorLabelById.get(message.author_user_id ?? "") ?? "Lab member",
    createdAt: message.created_at,
    updatedAt: message.updated_at,
    isOwn: message.author_user_id === userId,
    isRead: message.author_user_id === userId || readSet.has(message.id),
  }));

  const { data: labMembers } = await supabase
    .from("lab_members")
    .select("user_id,display_title")
    .eq("lab_id", activeLabId)
    .eq("is_active", true);

  const memberUserIds = [...new Set(((labMembers ?? []) as Array<{ user_id: string; display_title: string | null }>).map((row) => row.user_id))];
  const { data: memberProfiles } = memberUserIds.length > 0
    ? await serviceSupabase
        .from("profiles")
        .select("id,email,display_name")
        .in("id", memberUserIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map(((memberProfiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const memberOptions = ((labMembers ?? []) as Array<{ user_id: string; display_title: string | null }>).map((member) => {
    const profile = profileById.get(member.user_id);
    const label = member.display_title?.trim()
      || profile?.display_name?.trim()
      || profile?.email?.trim()
      || "Lab member";
    return {
      userId: member.user_id,
      label,
      email: profile?.email ?? null,
    };
  });

  return {
    memberOptions,
    threads: threadItems,
    messages: messageItems,
  };
}

async function loadInventorySyncStatusByLab(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labIds: string[],
): Promise<Record<string, InventorySyncStatus>> {
  if (labIds.length === 0) return {};

  const statusByLab: Record<string, InventorySyncStatus> = {};
  for (const labId of labIds) {
    statusByLab[labId] = {
      lastSyncAt: null,
      fetched: null,
      matched: null,
      inserted: null,
      source: "placeholder",
      hint: "Sync run summary is not persisted in the app yet. Trigger the sync runner and check cron/job logs for fetched/matched/inserted counts.",
    };
  }

  const { data: reagentRows } = await supabase
    .from("lab_reagents")
    .select("id,lab_id")
    .in("lab_id", labIds);

  const reagentById = new Map<string, string>();
  for (const row of reagentRows ?? []) {
    const reagentId = typeof row.id === "string" ? row.id : "";
    const labId = typeof row.lab_id === "string" ? row.lab_id : "";
    if (!reagentId || !labId) continue;
    reagentById.set(reagentId, labId);
  }

  const reagentIds = [...reagentById.keys()];
  if (reagentIds.length === 0) return statusByLab;

  const { data: syncEvents } = await supabase
    .from("lab_reagent_stock_events")
    .select("lab_reagent_id,created_at,reference_number")
    .in("lab_reagent_id", reagentIds)
    .ilike("reference_number", "quartzy:%")
    .order("created_at", { ascending: false });

  for (const event of syncEvents ?? []) {
    const reagentId = typeof event.lab_reagent_id === "string" ? event.lab_reagent_id : "";
    const createdAt = typeof event.created_at === "string" ? event.created_at : null;
    const labId = reagentById.get(reagentId);
    if (!labId || !createdAt) continue;
    const current = statusByLab[labId];
    if (!current.lastSyncAt) {
      statusByLab[labId] = {
        ...current,
        lastSyncAt: createdAt,
        source: "quartzy_stock_events",
        hint: "This timestamp comes from the latest Quartzy-linked stock event marker. Detailed fetched/matched/inserted counts are only available in sync runner logs.",
      };
    }
  }

  return statusByLab;
}

export default async function LabsPage({
  searchParams,
}: {
  searchParams?: Promise<{ panel?: string; reagent_id?: string; scan?: string; lab_id?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialScanReagentId =
    typeof params?.reagent_id === "string" && params.reagent_id.trim().length > 0
      ? params.reagent_id.trim()
      : null;
  const scanMode = params?.scan === "1" || params?.scan === "true";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const shellSummary = await fetchLabShellSummary(supabase, user.id);
  const queryLabId =
    typeof params?.lab_id === "string" && params.lab_id.trim().length > 0
      ? params.lab_id.trim()
      : null;
  const requestedActiveLabId = queryLabId ?? await getRequestedActiveLabId();
  const activeLabContext = resolveActiveLabContext(shellSummary, requestedActiveLabId);
  const resolvedShellWarning = activeLabContext.hasInvalidSelection
    ? "Your previously selected lab is no longer available. Choose a new active lab below."
    : shellSummary.warning;
  const serviceSupabase = createServiceClient();
  const syncStatusByLab = await loadInventorySyncStatusByLab(
    supabase,
    shellSummary.memberships.map((membership) => membership.lab.id),
  );

  let operationsReagentsPanel: ReactNode = null;
  let operationsEquipmentPanel: ReactNode = null;
  let labChatPanel: ReactNode = null;

  if (activeLabContext.activeMembership) {
    const operationsPanelData = await loadOperationsPanelData({
      supabase,
      serviceSupabase,
      userId: user.id,
      activeLabId: activeLabContext.activeMembership.lab.id,
      activeLabName: activeLabContext.activeMembership.lab.name,
      role: activeLabContext.activeMembership.role,
      warning: resolvedShellWarning,
      featureUnavailable: shellSummary.featureUnavailable,
    });

    const operationsActions = {
      createLabEquipment,
      createLabReagent,
      updateLabReagent,
      deleteLabReagent,
      updateLabEquipment,
      setLabEquipmentActive,
      deleteLabEquipment,
      createReagentStockEvent,
      createEquipmentBooking,
      deleteEquipmentBooking,
      updateEquipmentBooking,
      updateEquipmentBookingStatus,
      createTaskLink,
      createObjectMessage,
    };

    operationsReagentsPanel = (
      <LabOperationsClient
        key={`labs-ops-inventory-${activeLabContext.activeMembership.lab.id}`}
        embedded
        initialTab="inventory"
        initialSelectedInventoryId={initialScanReagentId}
        scanMode={scanMode}
        {...operationsPanelData}
        actions={operationsActions}
      />
    );

    operationsEquipmentPanel = (
      <LabOperationsClient
        key={`labs-ops-bookings-${activeLabContext.activeMembership.lab.id}`}
        embedded
        initialTab="bookings"
        {...operationsPanelData}
        actions={operationsActions}
      />
    );

    const chatPanelData = await loadLabChatPanelData({
      supabase,
      serviceSupabase,
      userId: user.id,
      activeLabId: activeLabContext.activeMembership.lab.id,
    });

    labChatPanel = (
      <LabsChatClient
        activeLabId={activeLabContext.activeMembership.lab.id}
        activeLabName={activeLabContext.activeMembership.lab.name}
        currentUserId={user.id}
        memberOptions={chatPanelData.memberOptions ?? []}
        threads={chatPanelData.threads}
        messages={chatPanelData.messages}
        actions={{
          createThread: createLabChatThread,
          sendMessage: sendLabChatMessage,
          editMessage: editLabChatMessage,
          markThreadRead: markLabChatThreadRead,
          markThreadUnread: markLabChatThreadUnread,
        }}
      />
    );
  }

  const rosters = await Promise.all(
    shellSummary.memberships.map(async (membership) => {
      const roster = await fetchLabRoster(supabase, membership.lab.id);
      const userIds = Array.from(new Set(roster.members.map((member) => member.user_id)));
      const { data: profiles } = userIds.length
        ? await serviceSupabase
            .from("profiles")
            .select("id,email,display_name")
            .in("id", userIds)
        : { data: [] };

      const profileMap = new Map(
        (profiles ?? []).map((profile) => [
          String(profile.id),
          {
            email: typeof profile.email === "string" ? profile.email : null,
            displayName: typeof profile.display_name === "string" ? profile.display_name : null,
          },
        ]),
      );

      const members = roster.members.map((member) => ({
        ...member,
        profile: profileMap.get(member.user_id) ?? null,
      }));

      return {
        membership,
        members,
        membersWarning: roster.warning,
        membersFeatureUnavailable: roster.featureUnavailable,
      };
    }),
  );

  return (
    <LabsClient
      currentUserId={user.id}
      shellWarning={
        resolvedShellWarning
      }
      featureUnavailable={shellSummary.featureUnavailable}
      selectedLabId={activeLabContext.activeMembership?.lab.id ?? null}
      initialPanel={params?.panel ?? null}
      operationsReagentsPanel={operationsReagentsPanel}
      operationsEquipmentPanel={operationsEquipmentPanel}
      labChatPanel={labChatPanel}
      syncStatusByLab={syncStatusByLab}
      workspaces={rosters}
    />
  );
}
