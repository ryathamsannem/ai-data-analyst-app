"use client";

import type { ChartLayoutMode } from "@/lib/chart-axis-layout";
import {
  resolveLayoutMode,
  wrapCategoryLabelLines,
} from "@/lib/chart-axis-layout";

const AXIS_TICK = "var(--chart-axis-tick)";

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  chartLayoutMode?: ChartLayoutMode;
  compact?: boolean;
  /** PNG offscreen capture — stronger category labels without changing on-screen UI. */
  pngCaptureMode?: boolean;
};

/** Multi-line category tick for horizontal bar Y axes (UI + PDF capture). */
export function WrappedCategoryYAxisTick({
  x = 0,
  y = 0,
  payload,
  chartLayoutMode,
  compact,
  pngCaptureMode = false,
}: TickProps) {
  const mode = resolveLayoutMode(chartLayoutMode, compact);
  const maxChars = mode === "compact" ? 16 : 22;
  const maxLines = mode === "compact" ? 2 : 3;
  const lines = wrapCategoryLabelLines(String(payload?.value ?? ""), {
    maxCharsPerLine: maxChars,
    maxLines,
  });
  const fs = pngCaptureMode ? 15 : mode === "compact" ? 10 : 11;
  const lineHeight = Math.ceil(fs * 1.32);
  const offsetY = -((lines.length - 1) * lineHeight) / 2;
  const labelDx = pngCaptureMode ? -8 : 0;

  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={labelDx}
          y={offsetY + i * lineHeight}
          textAnchor="end"
          dominantBaseline="middle"
          fill={pngCaptureMode ? "#e2e8f0" : AXIS_TICK}
          fontSize={fs}
          fontWeight={pngCaptureMode ? 500 : undefined}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
