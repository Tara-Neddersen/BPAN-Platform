"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const AdvisorSidebarDeferred = dynamic(
  () => import("@/components/advisor-sidebar").then((m) => m.AdvisorSidebar),
  { ssr: false },
);

const UnifiedSearchDeferred = dynamic(
  () => import("@/components/unified-search").then((m) => m.UnifiedSearch),
  { ssr: false },
);

export function DeferredGlobalTools() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    const markReady = () => setReady(true);
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(markReady, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(markReady, 900);
    }

    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        markReady();
      }
    };

    window.addEventListener("keydown", onKeydown, { passive: true });
    window.addEventListener("pointerdown", markReady, { passive: true, once: true });
    window.addEventListener("touchstart", markReady, { passive: true, once: true });

    return () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("pointerdown", markReady);
      window.removeEventListener("touchstart", markReady);

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <AdvisorSidebarDeferred />
      <UnifiedSearchDeferred />
    </>
  );
}
