import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { extractDriveFileId, refreshAccessToken } from "@/lib/google-drive";

interface RouteParams {
  params: Promise<{
    token: string;
    photoId: string;
  }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { token, photoId } = await params;
    const normalizedToken = token?.trim();
    const normalizedPhotoId = photoId?.trim();

    if (!normalizedToken || !normalizedPhotoId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: portal } = await supabase
      .from("advisor_portal")
      .select("user_id")
      .eq("token", normalizedToken)
      .maybeSingle();

    if (!portal?.user_id) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const { data: photo, error: photoError } = await supabase
      .from("colony_photos")
      .select("id,user_id,image_url,show_in_portal")
      .eq("id", normalizedPhotoId)
      .eq("user_id", portal.user_id)
      .eq("show_in_portal", true)
      .maybeSingle();

    if (photoError || !photo?.image_url) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const fileId = extractDriveFileId(String(photo.image_url));
    if (!fileId) {
      return NextResponse.json({ error: "Photo URL is not a supported Drive link" }, { status: 400 });
    }

    const { data: tokenRow, error: tokenError } = await supabase
      .from("google_drive_tokens")
      .select("*")
      .eq("user_id", portal.user_id)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: "Google Drive is not connected for this portal" }, { status: 400 });
    }

    let accessToken = tokenRow.access_token as string;
    const expiresAt = new Date(String(tokenRow.expires_at));
    if (expiresAt <= new Date()) {
      const refreshed = await refreshAccessToken(String(tokenRow.refresh_token));
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase
        .from("google_drive_tokens")
        .update({ access_token: accessToken, expires_at: newExpiry })
        .eq("user_id", portal.user_id);
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

