import { Loader2 } from "lucide-react";

export default function LabsChatLoading() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-6">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading lab chat...
      </div>
    </div>
  );
}
