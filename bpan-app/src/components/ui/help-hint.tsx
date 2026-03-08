"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type HelpHintProps = {
  text: string;
  className?: string;
  panelClassName?: string;
  ariaLabel?: string;
};

export function HelpHint({ text, className, panelClassName, ariaLabel = "Help" }: HelpHintProps) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <span
      ref={wrapperRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!wrapperRef.current?.contains(event.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open ? (
        <span
          role="tooltip"
          className={cn(
            "absolute left-1/2 top-[calc(100%+0.4rem)] z-50 w-60 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700 shadow-lg",
            panelClassName,
          )}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
