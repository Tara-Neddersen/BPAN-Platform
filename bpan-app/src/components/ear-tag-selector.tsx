"use client";

import { useState, useCallback, useEffect } from "react";

// ─── Standard Ear Punch System ──────────────────────────────────────
//
// Grid layout (viewing the mouse from the FRONT):
//
//   Right Ear (R)    Left Ear (L)
//   ┌──────────┐    ┌──────────┐
//   │  Top = 1 │    │  Top = 4 │
//   │  Bot = 2 │    │  Bot = 8 │
//   └──────────┘    └──────────┘
//
// Mouse number = sum of punched position values (1–15)
//
// Pattern string "ABCD" → A=R-top, B=L-top, C=R-bottom, D=L-bottom
// Grid positions:  [0]=TL(R-top,1)  [1]=TR(L-top,4)
//                  [2]=BL(R-bot,2)  [3]=BR(L-bot,8)

/** Value assigned to each grid position: TL, TR, BL, BR */
const POSITION_VALUES = [1, 4, 2, 8] as const;

/** Ear labels for each COLUMN */
const COLUMN_LABELS = ["R", "L"] as const; // Left col = Right ear, Right col = Left ear

/** Row labels */
const ROW_LABELS = ["Top", "Bot"] as const;

/**
 * Convert a punch pattern to its ear tag number (1–15).
 */
export function punchPatternToNumber(pattern: string): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    if (pattern[i] === "1") sum += POSITION_VALUES[i];
  }
  return sum;
}

/**
 * Convert an ear tag number (1–15) to a punch pattern.
 */
export function numberToPunchPattern(num: number): string {
  if (num < 1 || num > 15) return "0000";
  const arr = ["0", "0", "0", "0"];
  let remaining = num;
  // Decompose from highest value down: 8, 4, 2, 1
  // Position indices sorted by value descending: BR(3)=8, TR(1)=4, BL(2)=2, TL(0)=1
  const order = [3, 1, 2, 0]; // indices sorted by POSITION_VALUES descending
  for (const idx of order) {
    if (remaining >= POSITION_VALUES[idx]) {
      arr[idx] = "1";
      remaining -= POSITION_VALUES[idx];
    }
  }
  return arr.join("");
}

/**
 * Parse an ear_tag value into a punch pattern.
 * Accepts: "1010" (binary pattern), "8" (number 1–15)
 */
export function parseEarTag(earTag: string | null): string {
  if (!earTag) return "0000";
  const trimmed = earTag.trim();
  // Binary pattern
  if (/^[01]{4}$/.test(trimmed)) return trimmed;
  // Number (1–15)
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 15) return numberToPunchPattern(num);
  return "0000";
}

/**
 * Format a punch pattern for display (e.g., "#7")
 */
export function formatEarTag(earTag: string | null): string {
  const pattern = parseEarTag(earTag);
  const num = punchPatternToNumber(pattern);
  if (num > 0) return `#${num}`;
  return "None";
}

// ─── Mouse Head SVG ────────────────────────────────────────────────

function MouseHeadSVG({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left ear (mouse's right ear from viewer) */}
      <ellipse cx="25" cy="25" rx="18" ry="22" fill="#F5E6D3" stroke="#D4A574" strokeWidth="2" />
      <ellipse cx="25" cy="25" rx="10" ry="14" fill="#F0C4A8" />
      {/* Right ear (mouse's left ear from viewer) */}
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
  if (punchPatternToNumber(pattern) === 0) return null;

  const circleR = size * 0.09;
  const gridX = size * 0.65;
  const gridY = size * 0.15;
  const gap = size * 0.3 * 0.55;

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
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-muted-foreground font-medium mb-0.5">Click to punch</span>

        {/* Column headers — R.Ear / L.Ear */}
        <div className="grid grid-cols-2 gap-1.5 mb-0.5">
          {COLUMN_LABELS.map((label) => (
            <div key={label} className="text-center text-[10px] font-semibold text-muted-foreground">
              {label === "R" ? "R.Ear" : "L.Ear"}
            </div>
          ))}
        </div>

        {/* Grid with value labels */}
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => {
            const isPunched = pattern[i] === "1";
            const posValue = POSITION_VALUES[i];
            const row = Math.floor(i / 2);
            return (
              <button
                key={i}
                type="button"
                onClick={() => togglePosition(i)}
                className={`w-9 h-9 rounded-full border-2 transition-all duration-150 flex items-center justify-center relative
                  ${
                    isPunched
                      ? "bg-red-500 border-red-600 text-white shadow-md scale-105"
                      : "bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
                  }`}
                title={`${COLUMN_LABELS[i % 2]}.Ear ${ROW_LABELS[row]} (=${posValue}) — ${isPunched ? "Punched" : "Not punched"}`}
              >
                {isPunched ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <line x1="3" y1="3" x2="11" y2="11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="11" y1="3" x2="3" y2="11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <span className="text-[10px] font-bold">{posValue}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-1">
          {showNumber && num > 0 && (
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              #{num}
            </span>
          )}
          {num > 0 && (
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
