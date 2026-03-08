"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Bell, CheckCheck, Circle, CircleCheck, Clock3, Filter, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotificationCategory as SharedNotificationCategory } from "@/lib/notifications";

export type NotificationCategory = SharedNotificationCategory;

export type NotificationItem = {
  id: string;
  title: string;
  description: string | null;
  category: NotificationCategory;
  isRead: boolean;
  href: string;
  updatedAt: string;
  dueDate: string | null;
  status: string;
  canSnooze: boolean;
  canDismiss: boolean;
};

type ReadFilter = "unread" | "read" | "all";
type CategoryFilter = "all" | NotificationCategory;

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  run: "Run",
  reagent: "Reagent",
  booking: "Booking",
  protocol: "Protocol",
  ai: "AI",
  chat: "Chat",
  system: "System",
};

const FILTER_STORAGE_KEY = "bpan.notifications.filters.v2";

function prettyDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function bucketDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === yesterday.getTime()) return "Yesterday";
  return target.toLocaleDateString();
}

export function NotificationsCenterClient({
  notifications,
  actions,
}: {
  notifications: NotificationItem[];
  actions: {
    setRead: (taskId: string, read: boolean) => Promise<{ success?: boolean; error?: string }>;
    bulkMarkRead: (taskIds: string[]) => Promise<{ success?: boolean; updated?: number; error?: string }>;
    bulkMarkUnread: (taskIds: string[]) => Promise<{ success?: boolean; updated?: number; error?: string }>;
    snooze: (taskId: string, days: number) => Promise<{ success?: boolean; dueDate?: string; error?: string }>;
    dismiss: (taskId: string) => Promise<{ success?: boolean; error?: string }>;
    bulkDismiss: (taskIds: string[]) => Promise<{ success?: boolean; updated?: number; error?: string }>;
  };
}) {
  const [items, setItems] = useState<NotificationItem[]>(notifications);
  const [readFilter, setReadFilter] = useState<ReadFilter>("unread");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingFilterState, setLoadingFilterState] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ readFilter: ReadFilter; categoryFilter: CategoryFilter }>;
        if (parsed.readFilter === "unread" || parsed.readFilter === "read" || parsed.readFilter === "all") {
          setReadFilter(parsed.readFilter);
        }
        if (parsed.categoryFilter === "all" || (parsed.categoryFilter && parsed.categoryFilter in CATEGORY_LABELS)) {
          setCategoryFilter(parsed.categoryFilter as CategoryFilter);
        }
      }
    } catch {
      // Ignore invalid storage payload.
    } finally {
      setLoadingFilterState(false);
    }
  }, []);

  useEffect(() => {
    if (loadingFilterState) return;
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ readFilter, categoryFilter }));
  }, [readFilter, categoryFilter, loadingFilterState]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (readFilter === "read" && !item.isRead) return false;
      if (readFilter === "unread" && item.isRead) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (item.status === "skipped") return false;
      return true;
    });
  }, [items, readFilter, categoryFilter]);

  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);

  const unreadVisibleIds = useMemo(
    () => filtered.filter((item) => !item.isRead).map((item) => item.id),
    [filtered],
  );

  const visibleIds = useMemo(() => filtered.map((item) => item.id), [filtered]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, NotificationItem[]>();
    for (const item of filtered) {
      const label = bucketDayLabel(item.updatedAt);
      const list = groups.get(label) || [];
      list.push(item);
      groups.set(label, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  function onSetRead(taskId: string, read: boolean) {
    startTransition(async () => {
      setErrorMessage(null);
      const result = await actions.setRead(taskId, read);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === taskId ? { ...item, isRead: read } : item)));
    });
  }

  function onSnooze(taskId: string, days: number) {
    startTransition(async () => {
      setErrorMessage(null);
      const result = await actions.snooze(taskId, days);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === taskId
            ? { ...item, isRead: true, dueDate: result?.dueDate || item.dueDate }
            : item,
        ),
      );
    });
  }

  function onDismiss(taskId: string) {
    startTransition(async () => {
      setErrorMessage(null);
      const result = await actions.dismiss(taskId);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === taskId ? { ...item, isRead: true, status: "skipped" } : item)));
    });
  }

  function onBulkMarkRead() {
    if (unreadVisibleIds.length === 0) return;
    startTransition(async () => {
      setErrorMessage(null);
      const result = await actions.bulkMarkRead(unreadVisibleIds);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (unreadVisibleIds.includes(item.id) ? { ...item, isRead: true } : item)),
      );
    });
  }

  function onBulkMarkUnread() {
    if (visibleIds.length === 0) return;
    startTransition(async () => {
      setErrorMessage(null);
      const result = await actions.bulkMarkUnread(visibleIds);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (visibleIds.includes(item.id) ? { ...item, isRead: false } : item)),
      );
    });
  }

  function onBulkDismiss() {
    if (visibleIds.length === 0) return;
    startTransition(async () => {
      setErrorMessage(null);
      const result = await actions.bulkDismiss(visibleIds);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (visibleIds.includes(item.id) ? { ...item, isRead: true, status: "skipped" } : item)),
      );
    });
  }

  return (
    <div className="page-shell">
      <div className="section-card card-density-comfy">
        <div className="page-header">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications Center</h1>
            <p className="mt-1 text-sm text-slate-600">Automation and reminder signals across runs, reagents, bookings, and protocols.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
            <Bell className="h-4 w-4" />
            {unreadCount} unread
          </div>
        </div>
      </div>

      {loadingFilterState ? (
        <div className="section-card card-density-comfy">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your saved notification filters...
          </div>
        </div>
      ) : null}

      <div className="section-card card-density-compact sticky-section-switcher">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Read state
          </div>
          {(["unread", "read", "all"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={readFilter === value ? "default" : "outline"}
              onClick={() => setReadFilter(value)}
              disabled={isPending}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </Button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Category
          </div>
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "all" ? "default" : "outline"}
            onClick={() => setCategoryFilter("all")}
            disabled={isPending}
          >
            All
          </Button>
          {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={categoryFilter === value ? "default" : "outline"}
              onClick={() => setCategoryFilter(value)}
              disabled={isPending}
            >
              {CATEGORY_LABELS[value]}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" onClick={onBulkMarkRead} disabled={isPending || unreadVisibleIds.length === 0}>
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark visible read
            </Button>
            <details className="text-xs">
              <summary className="cursor-pointer list-none rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                More
              </summary>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onBulkMarkUnread} disabled={isPending || visibleIds.length === 0}>
                  Mark all unread
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onBulkDismiss} disabled={isPending || visibleIds.length === 0}>
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Bulk dismiss
                </Button>
              </div>
            </details>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="section-card">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">No notifications for the current filters.</p>
            <p className="mt-1 text-xs text-slate-500">Try switching to `All` categories or including read notifications.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groupedByDay.map(([dayLabel, dayItems]) => (
              <section key={dayLabel} className="px-5 py-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{dayLabel}</h2>
                <ul className="mt-3 space-y-3">
                  {dayItems.map((item) => (
                    <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {item.isRead ? (
                              <CircleCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Circle className="h-4 w-4 text-cyan-600 fill-cyan-100" />
                            )}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {CATEGORY_LABELS[item.category]}
                            </span>
                            <span className="text-xs text-slate-500">{prettyDate(item.updatedAt)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                          {item.description ? <p className="mt-1 text-sm text-slate-600">{item.description}</p> : null}
                          {item.dueDate ? <p className="mt-1 text-xs text-slate-500">Due: {item.dueDate}</p> : null}
                          <div className="mt-2">
                            <Link href={item.href} className="text-sm font-medium text-cyan-700 hover:text-cyan-900">
                              Open related record
                            </Link>
                          </div>
                        </div>

                        <div className="shrink-0 space-y-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onSetRead(item.id, !item.isRead)}
                            disabled={isPending}
                          >
                            {item.isRead ? "Mark unread" : "Mark read"}
                          </Button>
                          {item.canSnooze ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onSnooze(item.id, 1)}
                              disabled={isPending}
                            >
                              <Clock3 className="mr-1.5 h-4 w-4" />
                              Snooze 1 day
                            </Button>
                          ) : null}
                          {item.canDismiss ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onDismiss(item.id)}
                              disabled={isPending}
                            >
                              <XCircle className="mr-1.5 h-4 w-4" />
                              Dismiss
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Updating notifications...
        </div>
      ) : null}
    </div>
  );
}
