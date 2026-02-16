"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WebViewerProps {
  url: string;
  title: string;
  onCreateNote: (text: string) => void;
}

export function WebViewer({ url, title, onCreateNote }: WebViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const proxiedUrl = `/api/web-proxy?url=${encodeURIComponent(url)}`;

  // Listen for postMessage from the injected script inside the iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "bpan-create-note" && event.data.text) {
        onCreateNote(event.data.text);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onCreateNote]);

  return (
    <div className="flex flex-col h-full">
      {/* Thin toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <span className="text-xs text-muted-foreground truncate max-w-[400px]">
          {title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setLoading(true);
              setError(false);
              const iframe = document.getElementById(
                "web-viewer-iframe"
              ) as HTMLIFrameElement;
              if (iframe) iframe.src = proxiedUrl;
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open original <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading article...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Could not load this article inline.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open in new tab <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Proxied article iframe */}
      <iframe
        id="web-viewer-iframe"
        src={proxiedUrl}
        className={`flex-1 w-full border-0 ${loading ? "h-0" : ""}`}
        title={title}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
    </div>
  );
}
