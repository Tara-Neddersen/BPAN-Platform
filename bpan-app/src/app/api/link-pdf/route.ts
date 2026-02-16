import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Save a Google Drive (or any) PDF link for a paper.
 * Converts share links to direct download URLs.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { paperId, driveUrl } = await request.json();

    if (!paperId) {
      return NextResponse.json(
        { error: "paperId is required" },
        { status: 400 }
      );
    }

    // If null, user is removing the link
    if (!driveUrl) {
      await supabase
        .from("saved_papers")
        .update({ pdf_url: null })
        .eq("id", paperId)
        .eq("user_id", user.id);

      return NextResponse.json({ ok: true });
    }

    // Convert Google Drive share link to direct download URL
    const directUrl = toDirectUrl(driveUrl);

    if (!directUrl) {
      return NextResponse.json(
        { error: "Could not parse that link. Make sure it's a Google Drive share link or a direct PDF URL." },
        { status: 400 }
      );
    }

    // Save the original link in the database
    const { error: dbError } = await supabase
      .from("saved_papers")
      .update({ pdf_url: driveUrl })
      .eq("id", paperId)
      .eq("user_id", user.id);

    if (dbError) {
      return NextResponse.json(
        { error: dbError.message },
        { status: 500 }
      );
    }

    // Return a proxy URL so the PDF viewer can load it without CORS issues
    const proxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(directUrl)}`;

    return NextResponse.json({ proxyUrl });
  } catch (err) {
    console.error("Link PDF error:", err);
    return NextResponse.json(
      { error: "Failed to save link" },
      { status: 500 }
    );
  }
}

/**
 * Convert various Google Drive URL formats to a direct download link.
 * Also accepts raw PDF URLs.
 */
function toDirectUrl(url: string): string | null {
  // Google Drive share link: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  const driveFileMatch = url.match(
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/
  );
  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
  }

  // Google Drive open link: https://drive.google.com/open?id=FILE_ID
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpenMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;
  }

  // Google Drive uc link (already direct)
  if (url.includes("drive.google.com/uc")) {
    return url;
  }

  // Direct PDF URL (any URL ending in .pdf or with pdf content type)
  if (url.match(/\.pdf(\?.*)?$/i) || url.includes("pdf")) {
    return url;
  }

  // Any other URL — try it as-is, the proxy will handle errors
  if (url.startsWith("http")) {
    return url;
  }

  return null;
}
