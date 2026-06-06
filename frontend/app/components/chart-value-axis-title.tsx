"use client";

import type { ReactElement } from "react";

function asCartesianViewBox(vb: unknown): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!vb || typeof vb !== "object") return null;
  const o = vb as Record<string, unknown>;
  const w = o.width;
  const h = o.height;
  if (typeof w !== "number" || typeof h !== "number" || w <= 0 || h <= 0) return null;
  return {
    x: typeof o.x === "number" ? o.x : 0,
    y: typeof o.y === "number" ? o.y : 0,
    width: w,
    height: h,
  };
}

/**
 * Recharts `YAxis` `label.content` — rotated value title centered in the axis strip,
 * native SVG tooltip for full text (avoids `insideLeft` label box clipping).
 */
export function createVerticalValueAxisLabel(fullText: string, displayText: string) {
  const full = (fullText || displayText).trim() || "Value";
  const disp = (displayText || fullText).trim() || full;

  function VerticalValueAxisTitle(props: { viewBox?: unknown }): ReactElement | null {
    if (!disp.trim()) return null;
    const vb = asCartesianViewBox(props.viewBox);
    if (!vb) return null;
    const cx = vb.x + vb.width / 2;
    const cy = vb.y + vb.height / 2;
    return (
      <text
        x={cx}
        y={cy}
        transform={`rotate(-90 ${cx} ${cy})`}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--chart-axis-label, #475569)"
        fontSize={11}
        fontWeight={600}
        style={{ userSelect: "none" }}
      >
        <title>{full}</title>
        {disp}
      </text>
    );
  }

  VerticalValueAxisTitle.displayName = "VerticalValueAxisTitle";
  return VerticalValueAxisTitle;
}

/** Recharts horizontal `BarChart` bottom `XAxis` value title with `<title>` fallback. */
export function createHorizontalBottomAxisValueLabel(
  fullText: string,
  displayText: string
) {
  const full = (fullText || displayText).trim() || "Value";
  const disp = (displayText || fullText).trim() || full;

  function HorizontalBottomAxisValueTitle(props: {
    viewBox?: unknown;
  }): ReactElement | null {
    if (!disp.trim()) return null;
    const vb = asCartesianViewBox(props.viewBox);
    if (!vb) return null;
    const x = vb.x + vb.width / 2;
    const y = vb.y + vb.height + 6;
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fill="var(--chart-axis-label, #475569)"
        fontSize={11}
        fontWeight={600}
        style={{ userSelect: "none" }}
      >
        <title>{full}</title>
        {disp}
      </text>
    );
  }

  HorizontalBottomAxisValueTitle.displayName = "HorizontalBottomAxisValueTitle";
  return HorizontalBottomAxisValueTitle;
}

function labelCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Recharts `XAxis` `Label` `content` — bold axis title at Recharts-computed x/y
 * (keeps original `position` / `offset`; only replaces the SVG text styling).
 */
export function CartesianXAxisTitleLabelContent(props: {
  viewBox?: unknown;
  value?: unknown;
  x?: unknown;
  y?: unknown;
  textAnchor?: unknown;
}): ReactElement | null {
  const disp = String(props.value ?? "").trim();
  if (!disp) return null;

  let x = labelCoord(props.x);
  let y = labelCoord(props.y);
  if (x == null || y == null) {
    const vb = asCartesianViewBox(props.viewBox);
    if (!vb) return null;
    if (x == null) x = vb.x + vb.width / 2;
    if (y == null) y = vb.y + vb.height;
  }

  const anchor: "start" | "middle" | "end" | "inherit" =
    props.textAnchor === "start" ||
    props.textAnchor === "end" ||
    props.textAnchor === "inherit"
      ? props.textAnchor
      : "middle";

  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill="var(--chart-axis-label, #475569)"
      fontSize={11}
      fontWeight={600}
      style={{ userSelect: "none" }}
    >
      <title>{disp}</title>
      {disp}
    </text>
  );
}

CartesianXAxisTitleLabelContent.displayName = "CartesianXAxisTitleLabelContent";
