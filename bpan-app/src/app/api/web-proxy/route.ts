import { NextResponse } from "next/server";

/**
 * Web proxy that fetches an article page and serves it from our domain.
 * This makes the iframe same-origin, allowing us to:
 * 1. Bypass X-Frame-Options restrictions
 * 2. Inject a text-selection script that communicates via postMessage
 *
 * The <base> tag ensures images, CSS, and links resolve to the original site.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "url parameter required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "";

    // If it's a PDF, redirect to the pdf-proxy instead
    if (contentType.includes("application/pdf")) {
      const pdfProxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(targetUrl)}`;
      return NextResponse.redirect(new URL(pdfProxyUrl, request.url));
    }

    let html = await res.text();

    // Determine the base URL from the final URL (after redirects)
    const finalUrl = res.url || targetUrl;
    const baseOrigin = new URL(finalUrl).origin;

    // Inject <base> tag so relative resources (CSS, images, JS) load from original site
    if (html.includes("<head>")) {
      html = html.replace(
        "<head>",
        `<head><base href="${baseOrigin}/">`
      );
    } else if (html.includes("<HEAD>")) {
      html = html.replace(
        "<HEAD>",
        `<HEAD><base href="${baseOrigin}/">`
      );
    }

    // Inject text selection script before </body>
    const selectionScript = `
<script>
(function() {
  var fabEl = null;

  function createFab() {
    var fab = document.createElement('button');
    fab.id = '__bpan_note_fab';
    fab.innerHTML = '✨ Create Note';
    fab.style.cssText = 'position:fixed;z-index:999999;padding:8px 16px;background:#6366f1;color:white;border:none;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;transition:opacity 0.15s;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    fab.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
    fab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (text.length > 5) {
        window.parent.postMessage({ type: 'bpan-create-note', text: text }, '*');
        sel.removeAllRanges();
        fab.style.display = 'none';
      }
    });
    document.body.appendChild(fab);
    return fab;
  }

  document.addEventListener('mouseup', function(e) {
    setTimeout(function() {
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (text.length > 5) {
        if (!fabEl) fabEl = createFab();
        var range = sel.getRangeAt(0);
        var rect = range.getBoundingClientRect();
        fabEl.style.left = Math.min(rect.left + rect.width / 2 - 60, window.innerWidth - 150) + 'px';
        fabEl.style.top = Math.max(rect.top - 45, 5) + 'px';
        fabEl.style.display = 'block';
      }
    }, 10);
  });

  document.addEventListener('mousedown', function(e) {
    if (e.target && e.target.id === '__bpan_note_fab') return;
    if (fabEl) fabEl.style.display = 'none';
  });
})();
</script>`;

    if (html.includes("</body>")) {
      html = html.replace("</body>", selectionScript + "</body>");
    } else if (html.includes("</BODY>")) {
      html = html.replace("</BODY>", selectionScript + "</BODY>");
    } else {
      html += selectionScript;
    }

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Web proxy error:", err);
    return NextResponse.json(
      { error: "Failed to fetch page" },
      { status: 500 }
    );
  }
}
