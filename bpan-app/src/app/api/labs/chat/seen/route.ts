import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function normalize(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const labId = normalize(url.searchParams.get("lab_id"));
  const threadId = normalize(url.searchParams.get("thread_id"));
  if (!labId || !threadId) {
    return NextResponse.json({ error: "lab_id and thread_id are required." }, { status: 400 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .select("id,lab_id,linked_object_type,linked_object_id")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });
  if (!thread || thread.lab_id !== labId || thread.linked_object_type !== "lab" || thread.linked_object_id !== labId) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const { data: ownMessages, error: ownMessagesError } = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("author_user_id", user.id);
  if (ownMessagesError) return NextResponse.json({ error: ownMessagesError.message }, { status: 500 });

  const ownMessageIds = (ownMessages || []).map((row) => String(row.id));
  if (ownMessageIds.length === 0) return NextResponse.json({ seenMessageIds: [] });

  const service = createServiceClient();
  const { data: seenRows, error: seenError } = await service
    .from("message_reads")
    .select("message_id,user_id")
    .in("message_id", ownMessageIds)
    .neq("user_id", user.id);
  if (seenError) return NextResponse.json({ error: seenError.message }, { status: 500 });

  const seenMessageIds = [...new Set((seenRows || []).map((row) => String((row as { message_id: string }).message_id)))];
  return NextResponse.json({ seenMessageIds });
}
