import { createClient } from "@/lib/supabase/server";
import { MeetingsClient } from "@/components/meetings-client";
import type { MeetingNote } from "@/types";
import {
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
} from "../colony/actions";

export default async function MeetingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: meetingNotes } = await supabase
    .from("meeting_notes")
    .select("*")
    .eq("user_id", user.id)
    .order("meeting_date", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
        <p className="text-muted-foreground">
          Keep notes from advisor meetings — track action items, decisions, and follow-ups.
        </p>
      </div>

      <MeetingsClient
        meetings={(meetingNotes || []) as MeetingNote[]}
        actions={{
          createMeetingNote,
          updateMeetingNote,
          deleteMeetingNote,
        }}
      />
    </div>
  );
}

