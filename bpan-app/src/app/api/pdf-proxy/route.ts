import { NextResponse } from "next/server";

/**
 * Proxy PDF files through our server to avoid CORS issues.
 * Handles Google Drive direct download links including virus-scan confirmations.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter required" },
      { status: 400 }
    );
  }

  try {
    let fetchUrl = url;
    let res = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "BPAN-Platform/1.0 (research tool)",
        Accept: "application/pdf,*/*",
      },
      redirect: "follow",
    });

    // Google Drive may return an HTML confirmation page for large files.
    // If so, extract the confirm token and retry.
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html") && fetchUrl.includes("drive.google.com")) {
      const html = await res.text();
      const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);
      if (confirmMatch) {
        const separator = fetchUrl.includes("?") ? "&" : "?";
        fetchUrl = `${fetchUrl}${separator}confirm=${confirmMatch[1]}`;
        res = await fetch(fetchUrl, {
          headers: {
            "User-Agent": "BPAN-Platform/1.0 (research tool)",
            Accept: "application/pdf,*/*",
          },
          redirect: "follow",
        });
      } else {
        return NextResponse.json(
          { error: "Google Drive did not serve the file. Make sure sharing is set to 'Anyone with the link'." },
          { status: 403 }
        );
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }

    const buffer = await res.arrayBuffer();
    const finalContentType = res.headers.get("content-type") || "application/pdf";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": finalContentType.includes("pdf")
          ? "application/pdf"
          : finalContentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("PDF proxy error:", err);
    return NextResponse.json(
      { error: "Failed to fetch PDF" },
      { status: 500 }
    );
  }
}
