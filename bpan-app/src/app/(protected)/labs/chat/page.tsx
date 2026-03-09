import { createClient } from "@/lib/supabase/server";
import { fetchLabShellSummary } from "@/lib/labs";
import { getRequestedActiveLabId, resolveActiveLabContext } from "@/lib/active-lab-context";
import {
  LabsChatClient,
  type ChatLabMemberOption,
  type ChatMessageItem,
  type ChatThreadItem,
} from "@/components/labs-chat-client";
import type { Message, MessageRead, MessageThread, MessageThreadParticipant } from "@/types";
import {
  createLabChatThread,
  deleteLabChatThread,
  editLabChatMessage,
  markLabChatThreadRead,
  markLabChatThreadUnread,
  sendLabChatMessage,
} from "./actions";

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type LabMemberTitleRow = {
  user_id: string;
  display_title: string | null;
};

function normalizeLabel(value: string | null | undefined) {
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}

function normalizeSubject(subject: string | null) {
  if (!subject || subject.trim().length === 0) return "General";
  return subject.trim();
}

function isGeneralThread(thread: MessageThread) {
  const subject = normalizeSubject(thread.subject);
  return subject.toLowerCase() === "general";
}

function toTimestamp(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function classifyThreadType({
  thread,
  participantUserIds,
  currentUserId,
}: {
  thread: MessageThread;
  participantUserIds: string[];
  currentUserId: string;
}): "all_lab" | "dm" | "group" {
  if (participantUserIds.length === 0 && thread.recipient_scope !== "participants") return "all_lab";
  const others = participantUserIds.filter((id) => id !== currentUserId);
  return others.length <= 1 ? "dm" : "group";
}

function getParticipantThreadTitle({
  participantUserIds,
  currentUserId,
  authorLabelById,
}: {
  participantUserIds: string[];
  currentUserId: string;
  authorLabelById: Map<string, string>;
}) {
  const others = participantUserIds.filter((id) => id !== currentUserId);
  const labels = others
    .map((id) => authorLabelById.get(id) || "Lab member")
    .filter((label) => label.trim().length > 0);

  if (labels.length === 0) return "Direct message";
  if (labels.length === 1) return labels[0];
  return `Group: ${labels.join(", ")}`;
}

export default async function LabsChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const labSummary = await fetchLabShellSummary(supabase, user.id);
  const requestedActiveLabId = await getRequestedActiveLabId();
  const activeLabContext = resolveActiveLabContext(labSummary, requestedActiveLabId);
  const activeLab = activeLabContext.activeMembership;

  if (!activeLab) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-6">
        <h1 className="text-xl font-semibold text-slate-900">Lab Chat</h1>
        <p className="mt-2 text-sm text-slate-600">
          Select an active lab from the workspace switcher to access shared lab chat.
        </p>
      </div>
    );
  }

  const activeLabId = activeLab.lab.id;

  const { data: existingThreads, error: threadsError } = await supabase
    .from("message_threads")
    .select("*")
    .eq("lab_id", activeLabId)
    .eq("linked_object_type", "lab")
    .eq("linked_object_id", activeLabId)
    .order("updated_at", { ascending: false });

  if (threadsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Unable to load lab chat threads: {threadsError.message}
      </div>
    );
  }

  let threads = (existingThreads || []) as MessageThread[];
  if (!threads.some(isGeneralThread)) {
    const { data: generalThread } = await supabase
      .from("message_threads")
      .insert({
        lab_id: activeLabId,
        owner_user_id: null,
        recipient_scope: "lab",
        subject: "General",
        linked_object_type: "lab",
        linked_object_id: activeLabId,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (generalThread) {
      threads = [generalThread as MessageThread, ...threads];
    }
  }

  const threadIds = threads.map((thread) => thread.id);
  const { data: activeLabMembersData } = await supabase
    .from("lab_members")
    .select("user_id,is_active")
    .eq("lab_id", activeLabId)
    .eq("is_active", true);
  const activeLabMemberIds = new Set(
    ((activeLabMembersData || []) as Array<{ user_id: string | null; is_active?: boolean }>)
      .map((row) => row.user_id)
      .filter((id): id is string => Boolean(id)),
  );

  const { data: participantsData } = threadIds.length
    ? await supabase
        .from("message_thread_participants")
        .select("*")
        .in("thread_id", threadIds)
    : { data: [] };
  const participants = (participantsData || []) as MessageThreadParticipant[];

  const { data: messagesData } = threadIds.length
    ? await supabase
        .from("messages")
        .select("*")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const messages = (messagesData || []) as Message[];
  const messagesByThreadId = new Map<string, Message[]>();
  for (const message of messages) {
    const list = messagesByThreadId.get(message.thread_id) || [];
    list.push(message);
    messagesByThreadId.set(message.thread_id, list);
  }

  // Auto-convert legacy "all-lab" one-person chats into participant-scoped threads.
  // This keeps DM-like threads private and enables title sync from current member names.
  const legacyThreadConversions = threads
    .filter((thread) => thread.recipient_scope === "lab" && !isGeneralThread(thread))
    .map((thread) => {
      const threadMessages = messagesByThreadId.get(thread.id) || [];
      const uniqueOtherAuthorIds = [
        ...new Set(
          threadMessages
            .map((msg) => msg.author_user_id)
            .filter((authorId): authorId is string => Boolean(authorId) && authorId !== user.id),
        ),
      ];
      if (uniqueOtherAuthorIds.length !== 1) return null;
      const targetUserId = uniqueOtherAuthorIds[0];
      if (!activeLabMemberIds.has(targetUserId)) return null;
      return { threadId: thread.id, targetUserId };
    })
    .filter((value): value is { threadId: string; targetUserId: string } => Boolean(value));

  if (legacyThreadConversions.length > 0) {
    const convertedThreadIds = legacyThreadConversions.map((item) => item.threadId);
    await supabase
      .from("message_threads")
      .update({ recipient_scope: "participants" })
      .in("id", convertedThreadIds);

    const existingParticipantKeySet = new Set(
      participants.map((row) => `${row.thread_id}:${row.user_id}`),
    );
    const participantRowsToInsert: Array<{ thread_id: string; user_id: string; added_by: string }> = [];
    for (const conversion of legacyThreadConversions) {
      const participantUserIds = [user.id, conversion.targetUserId];
      for (const participantUserId of participantUserIds) {
        const key = `${conversion.threadId}:${participantUserId}`;
        if (existingParticipantKeySet.has(key)) continue;
        existingParticipantKeySet.add(key);
        participantRowsToInsert.push({
          thread_id: conversion.threadId,
          user_id: participantUserId,
          added_by: user.id,
        });
      }
    }
    if (participantRowsToInsert.length > 0) {
      await supabase.from("message_thread_participants").insert(participantRowsToInsert);
    }

    threads = threads.map((thread) =>
      convertedThreadIds.includes(thread.id)
        ? { ...thread, recipient_scope: "participants" as const }
        : thread,
    );
    participants.push(
      ...participantRowsToInsert.map((row) => ({
        id: `synthetic-${row.thread_id}-${row.user_id}`,
        thread_id: row.thread_id,
        user_id: row.user_id,
        added_by: row.added_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    );
  }

  const messageIds = messages.map((message) => message.id);

  const { data: messageReadsData } = messageIds.length
    ? await supabase
        .from("message_reads")
        .select("*")
        .eq("user_id", user.id)
        .in("message_id", messageIds)
    : { data: [] };
  const messageReads = (messageReadsData || []) as MessageRead[];
  const readMessageIdSet = new Set(messageReads.map((row) => row.message_id));

  const participantIds = [
    ...new Set(participants.map((participant) => participant.user_id).filter((id): id is string => Boolean(id))),
  ];
  const authorIds = [...new Set(messages.map((message) => message.author_user_id).filter((id): id is string => Boolean(id)))];
  const memberIds = [...new Set([...authorIds, ...participantIds])];
  const [profilesResult, memberTitlesResult] = await Promise.all([
    memberIds.length > 0
      ? supabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", memberIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    memberIds.length > 0
      ? supabase
          .from("lab_members")
          .select("user_id,display_title,is_active")
          .eq("lab_id", activeLabId)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as LabMemberTitleRow[] }),
  ]);

  const authorLabelById = new Map<string, string>();
  const profileRowById = new Map<string, ProfileRow>();
  for (const row of (profilesResult.data || []) as ProfileRow[]) {
    profileRowById.set(row.id, row);
    const label =
      row.display_name && row.display_name.trim().length > 0
        ? row.display_name.trim()
        : row.email && row.email.trim().length > 0
          ? row.email.trim()
          : "Lab member";
    authorLabelById.set(row.id, label);
  }
  for (const row of (memberTitlesResult.data || []) as LabMemberTitleRow[]) {
    if (row.display_title && row.display_title.trim().length > 0) {
      authorLabelById.set(row.user_id, row.display_title.trim());
    }
  }

  const labMembers = (memberTitlesResult.data || []) as Array<LabMemberTitleRow & { is_active?: boolean }>;
  const memberOptions: ChatLabMemberOption[] = labMembers
    .map((member) => {
      const profile = profileRowById.get(member.user_id);
      const label =
        normalizeLabel(member.display_title)
        || normalizeLabel(profile?.display_name)
        || normalizeLabel(profile?.email)
        || "Lab member";
      return {
        userId: member.user_id,
        label,
        email: normalizeLabel(profile?.email),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const participantIdsByThreadId = new Map<string, string[]>();
  for (const participant of participants) {
    const list = participantIdsByThreadId.get(participant.thread_id) || [];
    list.push(participant.user_id);
    participantIdsByThreadId.set(participant.thread_id, list);
  }

  const threadItems: ChatThreadItem[] = threads
    .map((thread) => {
      const threadMessages = messagesByThreadId.get(thread.id) || [];
      const participantUserIds = [...new Set(participantIdsByThreadId.get(thread.id) || [])];
      const effectiveRecipientScope: "lab" | "participants" =
        participantUserIds.length > 0 ? "participants" : thread.recipient_scope;
      const isGeneral = isGeneralThread(thread);
      const threadType = classifyThreadType({
        thread,
        participantUserIds,
        currentUserId: user.id,
      });
      const unreadCount = threadMessages.filter(
        (msg) => msg.author_user_id !== user.id && !readMessageIdSet.has(msg.id),
      ).length;
      const lastMessageAt = threadMessages.length
        ? threadMessages[threadMessages.length - 1].created_at
        : thread.updated_at;

      return {
        id: thread.id,
        title:
          effectiveRecipientScope === "participants"
            ? getParticipantThreadTitle({
                participantUserIds,
                currentUserId: user.id,
                authorLabelById,
              })
            : normalizeSubject(thread.subject),
        isGeneral,
        threadType,
        recipientScope: effectiveRecipientScope,
        participantUserIds,
        participantLabels: participantUserIds
          .filter((participantUserId) => participantUserId !== user.id)
          .map((participantUserId) => authorLabelById.get(participantUserId) || "Lab member"),
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
      message.author_user_id === user.id
        ? "You"
        : authorLabelById.get(message.author_user_id || "") || "Lab member",
    createdAt: message.created_at,
    updatedAt: message.updated_at,
    isOwn: message.author_user_id === user.id,
    isRead: message.author_user_id === user.id || readMessageIdSet.has(message.id),
  }));

  return (
    <LabsChatClient
      activeLabId={activeLabId}
      activeLabName={activeLab.lab.name}
      currentUserId={user.id}
      memberOptions={memberOptions}
      threads={threadItems}
      messages={messageItems}
      actions={{
        createThread: createLabChatThread,
        sendMessage: sendLabChatMessage,
        editMessage: editLabChatMessage,
        markThreadRead: markLabChatThreadRead,
        markThreadUnread: markLabChatThreadUnread,
        deleteThread: deleteLabChatThread,
      }}
    />
  );
}
