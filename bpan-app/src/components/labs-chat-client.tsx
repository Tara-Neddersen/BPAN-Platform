"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search, Send, MessageSquarePlus, CheckCircle2, Circle, Edit3, Users, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ChatLabMemberOption = {
  userId: string;
  label: string;
  email: string | null;
};

export type ChatThreadItem = {
  id: string;
  title: string;
  isGeneral: boolean;
  threadType: "all_lab" | "dm" | "group";
  recipientScope: "lab" | "participants";
  participantUserIds: string[];
  participantLabels: string[];
  unreadCount: number;
  messageCount: number;
  lastMessageAt: string;
};

export type ChatMessageItem = {
  id: string;
  threadId: string;
  body: string;
  authorUserId: string | null;
  authorLabel: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  isRead: boolean;
};

type ActionMessagePayload = {
  id: string;
  threadId: string;
  authorUserId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function threadTypeLabel(threadType: ChatThreadItem["threadType"]) {
  if (threadType === "dm") return "DM (1:1)";
  if (threadType === "group") return "Group";
  return "All-lab";
}

export function LabsChatClient({
  activeLabId,
  activeLabName,
  currentUserId,
  memberOptions = [],
  threads,
  messages,
  actions,
}: {
  activeLabId: string;
  activeLabName: string;
  currentUserId: string;
  memberOptions: ChatLabMemberOption[];
  threads: ChatThreadItem[];
  messages: ChatMessageItem[];
  actions: {
    createThread: (formData: FormData) => Promise<{
      success?: boolean;
      error?: string;
      thread?: {
        id: string;
        recipientScope: "lab" | "participants";
        subject: string | null;
        createdAt: string;
        updatedAt: string;
      };
    }>;
    sendMessage: (formData: FormData) => Promise<{ success?: boolean; error?: string; message?: ActionMessagePayload }>;
    editMessage: (formData: FormData) => Promise<{ success?: boolean; error?: string; message?: ActionMessagePayload }>;
    markThreadRead: (formData: FormData) => Promise<{ success?: boolean; error?: string; updated?: number }>;
    markThreadUnread: (formData: FormData) => Promise<{ success?: boolean; error?: string; updated?: number }>;
  };
}) {
  const [threadItems, setThreadItems] = useState<ChatThreadItem[]>(threads);
  const [messageItems, setMessageItems] = useState<ChatMessageItem[]>(messages);
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || "");
  const [search, setSearch] = useState("");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [createScope, setCreateScope] = useState<"all_lab" | "participants">("all_lab");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [composerDraftByThreadId, setComposerDraftByThreadId] = useState<Record<string, string>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoReadThreadIdsRef = useRef<Set<string>>(new Set());
  const router = useRouter();

  const memberById = useMemo(
    () => new Map(memberOptions.map((option) => [option.userId, option])),
    [memberOptions],
  );
  const filteredMemberOptions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return memberOptions
      .filter((member) => member.userId !== currentUserId)
      .filter((member) => {
        if (!q) return true;
        return (
          member.label.toLowerCase().includes(q)
          || (member.email || "").toLowerCase().includes(q)
        );
      });
  }, [memberOptions, memberSearch, currentUserId]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threadItems;

    const messageHitThreadIds = new Set(
      messageItems
        .filter((message) => message.body.toLowerCase().includes(q))
        .map((message) => message.threadId),
    );

    return threadItems.filter((thread) => {
      if (thread.title.toLowerCase().includes(q)) return true;
      if (threadTypeLabel(thread.threadType).toLowerCase().includes(q)) return true;
      if (thread.participantLabels.some((label) => label.toLowerCase().includes(q))) return true;
      return messageHitThreadIds.has(thread.id);
    });
  }, [search, threadItems, messageItems]);

  const generalThread = useMemo(
    () => threadItems.find((thread) => thread.isGeneral) ?? null,
    [threadItems],
  );
  const totalUnread = useMemo(
    () => threadItems.reduce((sum, thread) => sum + thread.unreadCount, 0),
    [threadItems],
  );

  const visibleThreadIds = new Set(filteredThreads.map((thread) => thread.id));
  const activeThreadId =
    selectedThreadId && visibleThreadIds.has(selectedThreadId)
      ? selectedThreadId
      : filteredThreads[0]?.id || "";
  const activeThread = threadItems.find((thread) => thread.id === activeThreadId) || null;

  const threadMessages = useMemo(
    () => messageItems.filter((message) => message.threadId === activeThreadId),
    [messageItems, activeThreadId],
  );
  const composer = activeThreadId ? (composerDraftByThreadId[activeThreadId] || "") : "";

  const setThreadUnreadState = useCallback((threadId: string, read: boolean) => {
    const unreadTotalIfUnread = messageItems.filter(
      (message) => message.threadId === threadId && message.authorUserId !== currentUserId,
    ).length;
    setThreadItems((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? { ...thread, unreadCount: read ? 0 : unreadTotalIfUnread }
          : thread,
      ),
    );
    setMessageItems((prev) =>
      prev.map((message) =>
        message.threadId === threadId && message.authorUserId !== currentUserId
          ? { ...message, isRead: read }
          : message,
      ),
    );
  }, [currentUserId, messageItems]);

  useEffect(() => {
    if (!activeThreadId || !activeThread || activeThread.unreadCount === 0) return;
    if (autoReadThreadIdsRef.current.has(activeThreadId)) return;
    autoReadThreadIdsRef.current.add(activeThreadId);

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("active_lab_id", activeLabId);
      formData.set("thread_id", activeThreadId);
      const result = await actions.markThreadRead(formData);
      autoReadThreadIdsRef.current.delete(activeThreadId);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setThreadUnreadState(activeThreadId, true);
      router.refresh();
    });
  }, [actions, activeLabId, activeThread, activeThreadId, router, setThreadUnreadState, startTransition]);

  function toggleRecipient(userId: string) {
    setSelectedRecipientIds((prev) =>
      prev.includes(userId) ? prev.filter((value) => value !== userId) : [...prev, userId],
    );
  }

  function selectAllFilteredRecipients() {
    setSelectedRecipientIds((prev) => [
      ...new Set([...prev, ...filteredMemberOptions.map((member) => member.userId)]),
    ]);
  }

  function clearSelectedRecipients() {
    setSelectedRecipientIds([]);
  }

  function onCreateThread() {
    const title = newThreadTitle.trim();
    const recipientScope = createScope === "all_lab" ? "lab" : "participants";
    if (!title) return;
    if (recipientScope === "participants" && selectedRecipientIds.length === 0) return;

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("active_lab_id", activeLabId);
      formData.set("subject", title);
      formData.set("recipient_scope", recipientScope);
      formData.set("participant_user_ids", JSON.stringify(selectedRecipientIds));

      const result = await actions.createThread(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }

      const createdThread = result.thread;
      if (!createdThread?.id) {
        router.refresh();
        return;
      }

      const participantLabels = selectedRecipientIds
        .map((userId) => memberById.get(userId)?.label || "Lab member");
      const participantUserIds = recipientScope === "participants"
        ? [...new Set([currentUserId, ...selectedRecipientIds])]
        : [];

      setThreadItems((prev) => [
        {
          id: createdThread.id,
          title: createdThread.subject || "Untitled thread",
          isGeneral: false,
          threadType: recipientScope === "lab"
            ? "all_lab"
            : selectedRecipientIds.length === 1
              ? "dm"
              : "group",
          recipientScope,
          participantUserIds,
          participantLabels,
          unreadCount: 0,
          messageCount: 0,
          lastMessageAt: createdThread.updatedAt,
        },
        ...prev,
      ]);
      setSelectedThreadId(createdThread.id);
      setNewThreadTitle("");
      setSelectedRecipientIds([]);
      setMemberSearch("");
      setCreateScope("all_lab");
      router.refresh();
    });
  }

  function onSendMessage() {
    if (!activeThreadId) return;
    const body = composer.trim();
    if (!body) return;

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("active_lab_id", activeLabId);
      formData.set("thread_id", activeThreadId);
      formData.set("body", body);

      const result = await actions.sendMessage(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      if (!result.message?.id) {
        router.refresh();
        return;
      }

      const sentMessage = result.message;
      setMessageItems((prev) => [
        ...prev,
        {
          id: sentMessage.id,
          threadId: sentMessage.threadId,
          body: sentMessage.body,
          authorUserId: sentMessage.authorUserId,
          authorLabel: "You",
          createdAt: sentMessage.createdAt,
          updatedAt: sentMessage.updatedAt,
          isOwn: true,
          isRead: true,
        },
      ]);
      setThreadItems((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId
            ? {
                ...thread,
                messageCount: thread.messageCount + 1,
                lastMessageAt: sentMessage.createdAt,
              }
            : thread,
        ),
      );
      setComposerDraftByThreadId((prev) => ({ ...prev, [activeThreadId]: "" }));
      router.refresh();
    });
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSendMessage();
    }
  }

  function onStartEdit(message: ChatMessageItem) {
    setEditingMessageId(message.id);
    setEditingBody(message.body);
  }

  function onSaveEdit() {
    if (!editingMessageId) return;
    const body = editingBody.trim();
    if (!body) return;

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("active_lab_id", activeLabId);
      formData.set("message_id", editingMessageId);
      formData.set("body", body);

      const result = await actions.editMessage(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }

      if (!result.message?.id) {
        router.refresh();
        return;
      }

      setMessageItems((prev) =>
        prev.map((message) =>
          message.id === editingMessageId
            ? {
                ...message,
                body: result.message?.body || message.body,
                updatedAt: result.message?.updatedAt || message.updatedAt,
              }
            : message,
        ),
      );
      setEditingMessageId(null);
      setEditingBody("");
      router.refresh();
    });
  }

  function onMarkThreadRead(read: boolean) {
    if (!activeThreadId) return;
    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("active_lab_id", activeLabId);
      formData.set("thread_id", activeThreadId);
      const result = read
        ? await actions.markThreadRead(formData)
        : await actions.markThreadUnread(formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setThreadUnreadState(activeThreadId, read);
      router.refresh();
    });
  }

  const activeThreadRecipientSummary = useMemo(() => {
    if (!activeThread) return null;
    if (activeThread.threadType === "all_lab") return "All active members in this lab";
    if (activeThread.participantLabels.length === 0) return "Private recipients";
    return activeThread.participantLabels.join(", ");
  }, [activeThread]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-5">
        <h1 className="text-xl font-semibold text-slate-900">Lab Chat</h1>
        <p className="mt-1 text-sm text-slate-600">Shared chat channels for {activeLabName} with all-lab and participant-scoped threads.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <BadgeTone tone="info">General thread: {generalThread ? "Available" : "Not found"}</BadgeTone>
          <BadgeTone tone={totalUnread > 0 ? "warning" : "neutral"}>Unread: {totalUnread}</BadgeTone>
          {generalThread ? (
            <Button
              type="button"
              size="sm"
              variant={activeThreadId === generalThread.id ? "default" : "outline"}
              onClick={() => setSelectedThreadId(generalThread.id)}
            >
              Open General thread
            </Button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white/90 p-4">
          <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Opening a thread marks it as read automatically. Use <span className="font-semibold">Mark unread</span> in the thread header when needed.
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search thread titles/messages"
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm"
            />
          </div>

          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Create thread</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={createScope === "all_lab" ? "default" : "outline"}
                onClick={() => setCreateScope("all_lab")}
              >
                <Users className="mr-1.5 h-4 w-4" />
                All-lab
              </Button>
              <Button
                type="button"
                size="sm"
                variant={createScope === "participants" ? "default" : "outline"}
                onClick={() => setCreateScope("participants")}
              >
                <UserRound className="mr-1.5 h-4 w-4" />
                DM/Group
              </Button>
            </div>
            <p className="text-xs text-slate-600">
              {createScope === "all_lab"
                ? "All-lab: every active lab member can view."
                : "DM/Group: only selected participants can view."}
            </p>

            <input
              value={newThreadTitle}
              onChange={(e) => setNewThreadTitle(e.target.value)}
              placeholder={createScope === "all_lab" ? "Thread title (all lab)" : "Thread title (DM/group)"}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            />

            {createScope === "participants" ? (
              <div className="space-y-2">
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search lab members"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                />
                <div className="text-xs text-slate-600">
                  Selected: {selectedRecipientIds.length}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={selectAllFilteredRecipients}>
                    Select visible
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={clearSelectedRecipients}>
                    Clear
                  </Button>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                  {filteredMemberOptions.map((member) => (
                    <label key={member.userId} className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedRecipientIds.includes(member.userId)}
                        onChange={() => toggleRecipient(member.userId)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-slate-900">{member.label}</span>
                        {member.email ? <span className="block truncate text-xs text-slate-500">{member.email}</span> : null}
                      </span>
                    </label>
                  ))}
                  {filteredMemberOptions.length === 0 ? (
                    <div className="px-1 py-2 text-xs text-slate-500">No members match this search.</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              onClick={onCreateThread}
              disabled={
                isPending
                || !newThreadTitle.trim()
                || (createScope === "participants" && selectedRecipientIds.length === 0)
              }
            >
              <MessageSquarePlus className="mr-1.5 h-4 w-4" />
              Create
            </Button>
          </div>

          <ul className="mt-4 space-y-2">
            {filteredThreads.length === 0 ? (
              <li className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-500">
                No chat threads found.
              </li>
            ) : (
              filteredThreads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${
                      thread.id === activeThreadId
                        ? "border-cyan-300 bg-cyan-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{thread.title}</p>
                      {thread.unreadCount > 0 ? (
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                          {thread.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium">{threadTypeLabel(thread.threadType)}</span>
                      {thread.threadType !== "all_lab" && thread.participantLabels.length > 0 ? (
                        <span className="truncate">· {thread.participantLabels.join(", ")}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {thread.messageCount} messages · {formatDate(thread.lastMessageAt)}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
          {!activeThread ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              Select a thread to view messages.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{activeThread.title}</h2>
                  <p className="text-xs text-slate-500">
                    {threadTypeLabel(activeThread.threadType)} · {activeThread.messageCount} messages · {activeThread.unreadCount} unread
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Recipients: {activeThreadRecipientSummary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BadgeTone tone="neutral">Unread/read controls</BadgeTone>
                  <Button type="button" size="sm" variant="outline" onClick={() => onMarkThreadRead(true)} disabled={isPending}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Mark read
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onMarkThreadRead(false)} disabled={isPending}>
                    <Circle className="mr-1.5 h-4 w-4" />
                    Mark unread
                  </Button>
                </div>
              </div>

              <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                {threadMessages.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                    No messages yet. Start the conversation.
                  </div>
                ) : (
                  threadMessages.map((message) => (
                    <article key={message.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{message.authorLabel}</p>
                        <p className="text-xs text-slate-500">{formatDate(message.createdAt)}</p>
                      </div>

                      {editingMessageId === message.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            className="min-h-[90px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={onSaveEdit} disabled={isPending || !editingBody.trim()}>
                              Save
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingMessageId(null)} disabled={isPending}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
                      )}

                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{message.isRead ? "Read" : "Unread"}</span>
                        {message.isOwn && editingMessageId !== message.id ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900"
                            onClick={() => onStartEdit(message)}
                            disabled={isPending}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <textarea
                  value={composer}
                  onChange={(e) =>
                    setComposerDraftByThreadId((prev) => ({ ...prev, [activeThreadId]: e.target.value }))
                  }
                  onKeyDown={onComposerKeyDown}
                  placeholder="Write a message..."
                  className="min-h-[90px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">Tip: press Ctrl/Cmd + Enter to send.</p>
                  <Button type="button" onClick={onSendMessage} disabled={isPending || !composer.trim()}>
                    <Send className="mr-1.5 h-4 w-4" />
                    Send message
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function BadgeTone({ tone, children }: { tone: "info" | "warning" | "neutral"; children: ReactNode }) {
  const className =
    tone === "info"
      ? "border-cyan-200 bg-cyan-50 text-cyan-800"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}
