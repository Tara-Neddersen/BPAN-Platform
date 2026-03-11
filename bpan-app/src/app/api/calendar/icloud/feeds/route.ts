import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeIcloudFeedUrl } from "@/lib/icloud-calendar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("icloud_calendar_feeds")
    .select("id,label,feed_url,last_synced_at,last_error,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feeds: data || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { label?: string; feedUrl?: string } | null;
  const label = body?.label?.trim();
  const feedUrl = body?.feedUrl?.trim();

  if (!label) return NextResponse.json({ error: "Calendar label is required." }, { status: 400 });
  if (!feedUrl) return NextResponse.json({ error: "Calendar link is required." }, { status: 400 });

  try {
    const normalizedUrl = normalizeIcloudFeedUrl(feedUrl);
    const { data, error } = await supabase
      .from("icloud_calendar_feeds")
      .insert({
        user_id: user.id,
        label,
        feed_url: normalizedUrl,
      })
      .select("id,label,feed_url,last_synced_at,last_error,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, feed: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid calendar link." },
      { status: 400 }
    );
  }
}
