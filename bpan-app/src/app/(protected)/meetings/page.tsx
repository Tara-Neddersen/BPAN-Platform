import { createClient } from "@/lib/supabase/server";
import { MeetingsClient } from "@/components/meetings-client";
import type { MeetingNote } from "@/types";
import {
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
} from "../colony/actions";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ meeting?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: meetingNotes } = await supabase
    .from("meeting_notes")
    .select("*")
    .eq("user_id", user.id)
    .order("meeting_date", { ascending: false });

  const meetingIds = (meetingNotes || []).map((m) => m.id);
  let linkedTaskCounts: Record<string, number> = {};
  if (meetingIds.length > 0) {
    const { data: linkedTasks } = await supabase
      .from("tasks")
      .select("source_id")
      .eq("user_id", user.id)
      .eq("source_type", "meeting_action")
      .in("source_id", meetingIds);

    linkedTaskCounts = (linkedTasks || []).reduce<Record<string, number>>((acc, row) => {
      if (!row.source_id) return acc;
      acc[row.source_id] = (acc[row.source_id] || 0) + 1;
      return acc;
    }, {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Keep notes from advisor meetings — track action items, decisions, and follow-ups.
        </p>
      </div>

      <MeetingsClient
        meetings={(meetingNotes || []) as MeetingNote[]}
        initialOpenMeetingId={params?.meeting ?? null}
        linkedTaskCounts={linkedTaskCounts}
        actions={{
          createMeetingNote,
          updateMeetingNote,
          deleteMeetingNote,
        }}
      />
    </div>
  );
}
