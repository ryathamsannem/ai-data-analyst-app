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
};

/** Multi-line category tick for horizontal bar Y axes (UI + PDF capture). */
export function WrappedCategoryYAxisTick({
  x = 0,
  y = 0,
  payload,
  chartLayoutMode,
  compact,
}: TickProps) {
  const mode = resolveLayoutMode(chartLayoutMode, compact);
  const maxChars = mode === "compact" ? 16 : 22;
  const maxLines = mode === "compact" ? 2 : 3;
  const lines = wrapCategoryLabelLines(String(payload?.value ?? ""), {
    maxCharsPerLine: maxChars,
    maxLines,
  });
  const fs = mode === "compact" ? 10 : 11;
  const lineHeight = Math.ceil(fs * 1.32);
  const offsetY = -((lines.length - 1) * lineHeight) / 2;

  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={offsetY + i * lineHeight}
          textAnchor="end"
          dominantBaseline="middle"
          fill={AXIS_TICK}
          fontSize={fs}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
