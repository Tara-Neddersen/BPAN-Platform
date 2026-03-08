import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { extractDriveFileId, refreshAccessToken } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const photoId = req.nextUrl.searchParams.get("photo_id")?.trim();
    if (!photoId) {
      return NextResponse.json({ error: "photo_id is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { data: photo, error: photoError } = await serviceSupabase
      .from("colony_photos")
      .select("id,user_id,image_url")
      .eq("id", photoId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (photoError || !photo?.image_url) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const fileId = extractDriveFileId(String(photo.image_url));
    if (!fileId) {
      return NextResponse.json({ error: "Photo URL is not a supported Drive link" }, { status: 400 });
    }

    const { data: tokenRow, error: tokenError } = await serviceSupabase
      .from("google_drive_tokens")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: "Google Drive not connected" }, { status: 400 });
    }

    let accessToken = tokenRow.access_token as string;
    const expiresAt = new Date(String(tokenRow.expires_at));
    if (expiresAt <= new Date()) {
      const refreshed = await refreshAccessToken(String(tokenRow.refresh_token));
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await serviceSupabase
        .from("google_drive_tokens")
        .update({ access_token: accessToken, expires_at: newExpiry })
        .eq("user_id", user.id);
    }

    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Unable to fetch image from Google Drive" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load photo" },
      { status: 500 },
    );
  }
}

