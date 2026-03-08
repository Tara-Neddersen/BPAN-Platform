import { Loader2 } from "lucide-react";

export default function NotificationsLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Notifications Center...
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
        <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-3 w-72 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
        <div className="h-24 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}
