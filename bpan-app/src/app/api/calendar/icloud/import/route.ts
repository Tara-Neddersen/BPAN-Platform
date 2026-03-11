import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importIcloudCalendarFeedToWorkspace } from "@/lib/icloud-calendar";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { feedId?: string } | null;
  const feedId = body?.feedId?.trim();

  const query = supabase
    .from("icloud_calendar_feeds")
    .select("id,user_id,label,feed_url,last_synced_at,last_error")
    .eq("user_id", user.id);
  const { data: feeds, error } = feedId ? await query.eq("id", feedId) : await query.order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!feeds || feeds.length === 0) {
    return NextResponse.json({ error: "No iCloud calendars configured." }, { status: 400 });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let scanned = 0;
  const errors: string[] = [];

  for (const feed of feeds) {
    try {
      const result = await importIcloudCalendarFeedToWorkspace(supabase, user.id, feed);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
      scanned += result.scanned;
      await supabase
        .from("icloud_calendar_feeds")
        .update({
          last_synced_at: new Date().toISOString(),
          last_error: result.errors[0] || null,
        })
        .eq("id", feed.id)
        .eq("user_id", user.id);
      if (result.errors.length > 0) errors.push(...result.errors.slice(0, 2));
    } catch (feedError) {
      const message = feedError instanceof Error ? feedError.message : "icloud_import_failed";
      errors.push(message);
      await supabase
        .from("icloud_calendar_feeds")
        .update({ last_error: message })
        .eq("id", feed.id)
        .eq("user_id", user.id);
    }
  }

  return NextResponse.json({
    success: true,
    feeds: feeds.length,
    imported,
    updated,
    skipped,
    scanned,
    errors: errors.slice(0, 10),
  });
}
