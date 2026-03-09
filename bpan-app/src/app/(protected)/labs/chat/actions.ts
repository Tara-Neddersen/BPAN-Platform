"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deliverChatMessageNotifications } from "@/lib/chat-notification-delivery";

type RecipientScope = "lab" | "participants";

function normalizeOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRecipientScope(value: FormDataEntryValue | null): RecipientScope {
  if (typeof value !== "string") return "lab";
  return value === "participants" ? "participants" : "lab";
}

function parseParticipantUserIds(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [] as string[];
    return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
  } catch {
    return [] as string[];
  }
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

async function assertLabRootThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    threadId,
    labId,
  }: {
    threadId: string;
    labId: string;
  },
) {
  const { data: thread, error } = await supabase
    .from("message_threads")
    .select("id,lab_id,owner_user_id,recipient_scope,subject,linked_object_type,linked_object_id")
    .eq("id", threadId)
    .maybeSingle();

  if (error) return { error: error.message as string };
  if (!thread) return { error: "Thread not found." as string };
  if (thread.lab_id !== labId || thread.linked_object_type !== "lab" || thread.linked_object_id !== labId) {
    return { error: "Thread does not belong to the active lab chat." as string };
  }
  return { thread };
}

function revalidateLabChat() {
  revalidatePath("/labs/chat");
}

export async function createLabChatThread(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  const subject = normalizeOptionalString(formData.get("subject"));
  const recipientScope = parseRecipientScope(formData.get("recipient_scope"));
  const selectedParticipantIds = parseParticipantUserIds(formData.get("participant_user_ids"));

  if (!activeLabId) return { error: "Active lab context is required." };
  if (!subject) return { error: "Thread title is required." };
  if (recipientScope === "lab" && subject.toLowerCase() === "general") {
    return { error: "The general thread already exists. Create a custom thread with a different title." };
  }
  if (recipientScope === "participants" && selectedParticipantIds.length === 0) {
    return { error: "Select at least one lab member for a direct or group chat." };
  }

  const { data, error } = await supabase
    .from("message_threads")
    .insert({
      lab_id: activeLabId,
      owner_user_id: null,
      recipient_scope: recipientScope,
      subject,
      linked_object_type: "lab",
      linked_object_id: activeLabId,
      created_by: userId,
    })
    .select("id,recipient_scope,subject,created_at,updated_at")
    .single();

  if (error || !data?.id) return { error: error?.message || "Unable to create thread." };

  if (recipientScope === "participants") {
    const participantUserIds = [...new Set([userId, ...selectedParticipantIds])];
    const { error: participantInsertError } = await supabase
      .from("message_thread_participants")
      .insert(
        participantUserIds.map((participantUserId) => ({
          thread_id: String(data.id),
          user_id: participantUserId,
          added_by: userId,
        })),
      );
    if (participantInsertError) {
      // Best-effort rollback to avoid leaving an inaccessible participant-scoped thread.
      await supabase.from("message_threads").delete().eq("id", String(data.id));
      return { error: participantInsertError.message || "Unable to set thread participants." };
    }
  }

  revalidateLabChat();
  return {
    success: true,
    thread: {
      id: String(data.id),
      recipientScope: (data.recipient_scope as RecipientScope | null) || "lab",
      subject: (data.subject as string | null) || null,
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    },
  };
}

export async function sendLabChatMessage(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  const threadId = normalizeOptionalString(formData.get("thread_id"));
  const body = normalizeOptionalString(formData.get("body"));

  if (!activeLabId) return { error: "Active lab context is required." };
  if (!threadId || !body) return { error: "Thread and message body are required." };

  const threadCheck = await assertLabRootThread(supabase, { threadId, labId: activeLabId });
  if ("error" in threadCheck) return threadCheck;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      author_user_id: userId,
      body,
      metadata: {},
    })
    .select("id,thread_id,author_user_id,body,created_at,updated_at")
    .single();

  if (error || !data?.id) return { error: error?.message || "Unable to send message." };

  void deliverChatMessageNotifications({
    senderUserId: userId,
    messageId: String(data.id),
    messageBody: String(data.body),
      thread: {
        id: String(threadCheck.thread.id),
        lab_id: (threadCheck.thread.lab_id as string | null) || null,
        owner_user_id: (threadCheck.thread.owner_user_id as string | null) || null,
        recipient_scope: (threadCheck.thread.recipient_scope as RecipientScope | null) || "lab",
        subject: (threadCheck.thread.subject as string | null) || null,
        linked_object_type: String(threadCheck.thread.linked_object_type),
        linked_object_id: String(threadCheck.thread.linked_object_id),
    },
  });

  revalidateLabChat();
  return {
    success: true,
    message: {
      id: String(data.id),
      threadId: String(data.thread_id),
      authorUserId: (data.author_user_id as string | null) || null,
      body: String(data.body),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    },
  };
}

export async function editLabChatMessage(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  const messageId = normalizeOptionalString(formData.get("message_id"));
  const body = normalizeOptionalString(formData.get("body"));

  if (!activeLabId) return { error: "Active lab context is required." };
  if (!messageId || !body) return { error: "Message id and updated body are required." };

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id,thread_id,author_user_id")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError) return { error: messageError.message };
  if (!message) return { error: "Message not found." };
  if (message.author_user_id !== userId) return { error: "Only the original author can edit this message." };

  const threadCheck = await assertLabRootThread(supabase, { threadId: String(message.thread_id), labId: activeLabId });
  if ("error" in threadCheck) return threadCheck;

  const { data, error } = await supabase
    .from("messages")
    .update({ body })
    .eq("id", messageId)
    .eq("author_user_id", userId)
    .select("id,thread_id,author_user_id,body,created_at,updated_at")
    .single();

  if (error || !data?.id) return { error: error?.message || "Unable to update message." };
  revalidateLabChat();
  return {
    success: true,
    message: {
      id: String(data.id),
      threadId: String(data.thread_id),
      authorUserId: (data.author_user_id as string | null) || null,
      body: String(data.body),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    },
  };
}

export async function markLabChatThreadRead(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  const threadId = normalizeOptionalString(formData.get("thread_id"));

  if (!activeLabId) return { error: "Active lab context is required." };
  if (!threadId) return { error: "Thread id is required." };

  const threadCheck = await assertLabRootThread(supabase, { threadId, labId: activeLabId });
  if ("error" in threadCheck) return threadCheck;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id,author_user_id")
    .eq("thread_id", threadId);

  if (messagesError) return { error: messagesError.message };

  const unreadTargetIds = (messages || [])
    .filter((msg) => msg.author_user_id !== userId)
    .map((msg) => String(msg.id));

  if (unreadTargetIds.length === 0) {
    revalidateLabChat();
    return { success: true, updated: 0 };
  }

  const now = new Date().toISOString();
  const upsertRows = unreadTargetIds.map((messageId) => ({
    message_id: messageId,
    user_id: userId,
    read_at: now,
  }));

  const { error } = await supabase
    .from("message_reads")
    .upsert(upsertRows, { onConflict: "message_id,user_id" });

  if (error) return { error: error.message };

  revalidateLabChat();
  return { success: true, updated: unreadTargetIds.length };
}

export async function markLabChatThreadUnread(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  const threadId = normalizeOptionalString(formData.get("thread_id"));

  if (!activeLabId) return { error: "Active lab context is required." };
  if (!threadId) return { error: "Thread id is required." };

  const threadCheck = await assertLabRootThread(supabase, { threadId, labId: activeLabId });
  if ("error" in threadCheck) return threadCheck;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id,author_user_id")
    .eq("thread_id", threadId);
  if (messagesError) return { error: messagesError.message };

  const messageIds = (messages || [])
    .filter((msg) => msg.author_user_id !== userId)
    .map((msg) => String(msg.id));

  if (messageIds.length === 0) {
    revalidateLabChat();
    return { success: true, updated: 0 };
  }

  const { error } = await supabase
    .from("message_reads")
    .delete()
    .eq("user_id", userId)
    .in("message_id", messageIds);

  if (error) return { error: error.message };
  revalidateLabChat();
  return { success: true, updated: messageIds.length };
}

export async function deleteLabChatThread(formData: FormData) {
  const { supabase } = await requireUser();
  const activeLabId = normalizeOptionalString(formData.get("active_lab_id"));
  const threadId = normalizeOptionalString(formData.get("thread_id"));

  if (!activeLabId) return { error: "Active lab context is required." };
  if (!threadId) return { error: "Thread id is required." };

  const threadCheck = await assertLabRootThread(supabase, { threadId, labId: activeLabId });
  if ("error" in threadCheck) return threadCheck;

  const { data: threadMessages, error: threadMessagesError } = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", threadId);
  if (threadMessagesError) return { error: threadMessagesError.message };

  const messageIds = (threadMessages || []).map((row) => String(row.id));
  if (messageIds.length > 0) {
    const { error: readsDeleteError } = await supabase
      .from("message_reads")
      .delete()
      .in("message_id", messageIds);
    if (readsDeleteError) return { error: readsDeleteError.message };
  }

  const { error: messagesDeleteError } = await supabase
    .from("messages")
    .delete()
    .eq("thread_id", threadId);
  if (messagesDeleteError) return { error: messagesDeleteError.message };

  const { error: participantsDeleteError } = await supabase
    .from("message_thread_participants")
    .delete()
    .eq("thread_id", threadId);
  if (participantsDeleteError) return { error: participantsDeleteError.message };

  const { error: threadDeleteError } = await supabase
    .from("message_threads")
    .delete()
    .eq("id", threadId);
  if (threadDeleteError) return { error: threadDeleteError.message };

  revalidateLabChat();
  return { success: true, threadId };
}
