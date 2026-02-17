"use client";

import { useState, useCallback, useEffect } from "react";

// ─── Ear punch positions (2x2 grid) ────────────────────────────────
// Positions: TL (top-left), TR (top-right), BL (bottom-left), BR (bottom-right)
// Stored as 4-char string: "0000" to "1111"
// Maps to standard ear punch numbering 1–15

const POSITION_LABELS = ["TL", "TR", "BL", "BR"] as const;

// Standard ear punch number mapping (binary → number)
const PUNCH_TO_NUMBER: Record<string, number> = {
  "1000": 1,  // TL
  "0001": 2,  // BR
  "1001": 3,  // TL + BR
  "0100": 4,  // TR
  "0010": 5,  // BL
  "0110": 6,  // TR + BL
  "1100": 7,  // TL + TR
  "1010": 8,  // TL + BL
  "0011": 9,  // BL + BR
  "0101": 10, // TR + BR
  "1011": 11, // TL + BL + BR
  "0111": 12, // TR + BL + BR
  "1101": 13, // TL + TR + BR
  "1110": 14, // TL + TR + BL
  "1111": 15, // All
};

const NUMBER_TO_PUNCH: Record<number, string> = {};
for (const [k, v] of Object.entries(PUNCH_TO_NUMBER)) {
  NUMBER_TO_PUNCH[v] = k;
}

export function punchPatternToNumber(pattern: string): number | null {
  return PUNCH_TO_NUMBER[pattern] ?? null;
}

export function numberToPunchPattern(num: number): string | null {
  return NUMBER_TO_PUNCH[num] ?? null;
}

/**
 * Parse an ear_tag value into a punch pattern.
 * Accepts: "1010" (binary), "8" (number), or "TL,BL" (position labels)
 */
export function parseEarTag(earTag: string | null): string {
  if (!earTag) return "0000";
  const trimmed = earTag.trim();
  // Binary pattern
  if (/^[01]{4}$/.test(trimmed)) return trimmed;
  // Number (1–15)
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 15) return NUMBER_TO_PUNCH[num] || "0000";
  // Position labels
  const labels = trimmed.toUpperCase().split(/[,\s]+/);
  let pattern = "0000";
  for (const label of labels) {
    const idx = POSITION_LABELS.indexOf(label as typeof POSITION_LABELS[number]);
    if (idx >= 0) {
      const arr = pattern.split("");
      arr[idx] = "1";
      pattern = arr.join("");
    }
  }
  return pattern;
}

/**
 * Format a punch pattern for display
 */
export function formatEarTag(earTag: string | null): string {
  const pattern = parseEarTag(earTag);
  const num = punchPatternToNumber(pattern);
  if (num !== null) return `#${num}`;
  if (pattern === "0000") return "None";
  return pattern;
}

// ─── Mouse Head SVG ────────────────────────────────────────────────

function MouseHeadSVG({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left ear */}
      <ellipse cx="25" cy="25" rx="18" ry="22" fill="#F5E6D3" stroke="#D4A574" strokeWidth="2" />
      <ellipse cx="25" cy="25" rx="10" ry="14" fill="#F0C4A8" />
      {/* Right ear */}
      <ellipse cx="75" cy="25" rx="18" ry="22" fill="#F5E6D3" stroke="#D4A574" strokeWidth="2" />
      <ellipse cx="75" cy="25" rx="10" ry="14" fill="#F0C4A8" />
      {/* Head */}
      <ellipse cx="50" cy="55" rx="32" ry="30" fill="#F5E6D3" stroke="#D4A574" strokeWidth="2" />
      {/* Eyes */}
      <circle cx="40" cy="48" r="4" fill="#2D1B0E" />
      <circle cx="60" cy="48" r="4" fill="#2D1B0E" />
      <circle cx="41.5" cy="46.5" r="1.5" fill="white" />
      <circle cx="61.5" cy="46.5" r="1.5" fill="white" />
      {/* Nose */}
      <ellipse cx="50" cy="62" rx="4" ry="3" fill="#F0A0A0" />
      {/* Whiskers */}
      <line x1="20" y1="58" x2="42" y2="60" stroke="#D4A574" strokeWidth="1" />
      <line x1="20" y1="64" x2="42" y2="63" stroke="#D4A574" strokeWidth="1" />
      <line x1="58" y1="60" x2="80" y2="58" stroke="#D4A574" strokeWidth="1" />
      <line x1="58" y1="63" x2="80" y2="64" stroke="#D4A574" strokeWidth="1" />
    </svg>
  );
}

// ─── Mini Mouse Head (for display in lists) ────────────────────────

export function MiniEarTag({
  earTag,
  size = 28,
}: {
  earTag: string | null;
  size?: number;
}) {
  const pattern = parseEarTag(earTag);
  if (pattern === "0000") return null;

  const circleR = size * 0.09;
  const gridSize = size * 0.3;
  const gridX = size * 0.65;
  const gridY = size * 0.15;
  const gap = gridSize * 0.55;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className="inline-block">
      {/* Simplified mouse head */}
      <ellipse cx={size * 0.22} cy={size * 0.2} rx={size * 0.12} ry={size * 0.16} fill="#F5E6D3" stroke="#D4A574" strokeWidth="0.8" />
      <ellipse cx={size * 0.48} cy={size * 0.2} rx={size * 0.12} ry={size * 0.16} fill="#F5E6D3" stroke="#D4A574" strokeWidth="0.8" />
      <ellipse cx={size * 0.35} cy={size * 0.48} rx={size * 0.22} ry={size * 0.22} fill="#F5E6D3" stroke="#D4A574" strokeWidth="0.8" />
      <circle cx={size * 0.29} cy={size * 0.43} r={size * 0.03} fill="#2D1B0E" />
      <circle cx={size * 0.41} cy={size * 0.43} r={size * 0.03} fill="#2D1B0E" />
      <ellipse cx={size * 0.35} cy={size * 0.53} rx={size * 0.025} ry={size * 0.02} fill="#F0A0A0" />
      {/* Punch grid */}
      {[0, 1, 2, 3].map((i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = gridX + col * gap;
        const cy = gridY + row * gap;
        const isPunched = pattern[i] === "1";
        return (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={circleR}
              fill={isPunched ? "#EF4444" : "#E5E7EB"}
              stroke={isPunched ? "#B91C1C" : "#9CA3AF"}
              strokeWidth="0.6"
            />
            {isPunched && (
              <>
                <line x1={cx - circleR * 0.6} y1={cy - circleR * 0.6} x2={cx + circleR * 0.6} y2={cy + circleR * 0.6} stroke="white" strokeWidth="0.8" />
                <line x1={cx + circleR * 0.6} y1={cy - circleR * 0.6} x2={cx - circleR * 0.6} y2={cy + circleR * 0.6} stroke="white" strokeWidth="0.8" />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Interactive Selector ──────────────────────────────────────────

interface EarTagSelectorProps {
  value: string; // punch pattern "0000"–"1111" or ear tag number
  onChange: (pattern: string) => void;
  showNumber?: boolean;
}

export function EarTagSelector({ value, onChange, showNumber = true }: EarTagSelectorProps) {
  const [pattern, setPattern] = useState(() => parseEarTag(value));

  useEffect(() => {
    setPattern(parseEarTag(value));
  }, [value]);

  const togglePosition = useCallback(
    (index: number) => {
      const arr = pattern.split("");
      arr[index] = arr[index] === "1" ? "0" : "1";
      const newPattern = arr.join("");
      setPattern(newPattern);
      onChange(newPattern);
    },
    [pattern, onChange]
  );

  const clearAll = useCallback(() => {
    setPattern("0000");
    onChange("0000");
  }, [onChange]);

  const num = punchPatternToNumber(pattern);

  return (
    <div className="flex items-center gap-4">
      {/* Mouse head */}
      <div className="relative flex-shrink-0">
        <MouseHeadSVG size={70} />
      </div>

      {/* Punch grid */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-muted-foreground font-medium mb-0.5">Click to punch</span>
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => {
            const isPunched = pattern[i] === "1";
            return (
              <button
                key={i}
                type="button"
                onClick={() => togglePosition(i)}
                className={`w-8 h-8 rounded-full border-2 transition-all duration-150 flex items-center justify-center
                  ${
                    isPunched
                      ? "bg-red-500 border-red-600 text-white shadow-md scale-105"
                      : "bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
                  }`}
                title={`${POSITION_LABELS[i]} — ${isPunched ? "Punched" : "Not punched"}`}
              >
                {isPunched ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <line x1="3" y1="3" x2="11" y2="11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="11" y1="3" x2="3" y2="11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <span className="text-xs">○</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {showNumber && num !== null && (
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              #{num}
            </span>
          )}
          {pattern !== "0000" && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] text-muted-foreground hover:text-red-500 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

