/**
 * Normalized chart type for timeline / export parity (Overview → Charts → AI Insights → PDF).
 * Maps to Recharts `ChartKind` via `timelineTypeToChartKind`.
 */
import type { ChartKind } from "@/app/chart-types";

export type TimelineChartType = "bar" | "horizontalBar" | "line";

export function chartKindToTimelineType(kind: ChartKind): TimelineChartType {
  if (kind === "bar_horizontal") return "horizontalBar";
  if (kind === "line" || kind === "area") return "line";
  return "bar";
}

export function timelineTypeToChartKind(t: TimelineChartType): ChartKind {
  if (t === "horizontalBar") return "bar_horizontal";
  if (t === "line") return "line";
  return "bar";
}

export type InsightChartLayoutMetrics = {
  /** Width passed into category-axis layout math (px). */
  planViewportPx: number;
  outerShellMinHeight: number;
  plotHeightMin: number;
  plotHeightMax: number;
};

/** AI Insight + PDF off-screen capture: dimensions by presentation kind. */
export function getInsightLayoutMetrics(kind: ChartKind): InsightChartLayoutMetrics {
  const t = chartKindToTimelineType(kind);
  if (t === "horizontalBar") {
    return {
      planViewportPx: 900,
      outerShellMinHeight: 352,
      plotHeightMin: 288,
      plotHeightMax: 500,
    };
  }
  if (t === "line") {
    return {
      planViewportPx: 850,
      outerShellMinHeight: 352,
      plotHeightMin: 312,
      plotHeightMax: 376,
    };
  }
  return {
    planViewportPx: 760,
    outerShellMinHeight: 352,
    plotHeightMin: 312,
    plotHeightMax: 384,
  };
}

/** Tailwind max-width for the inner insight viewport (matches plan targets). */
export function insightViewportMaxClassForChartKind(kind: ChartKind): string {
  const t = chartKindToTimelineType(kind);
  if (t === "horizontalBar") return "max-w-[900px]";
  if (t === "line") return "max-w-[850px]";
  return "max-w-[760px]";
}

type VmBalanced = { marginLeft: number; marginRight: number };

/**
 * AI Insights + PDF capture: symmetric Recharts outer margins so the plot reads centered
 * (avoids heavy left gutter + plot drifting right). Vertical bars get extra bottom room for labels.
 */
export function insightCartesianOuterMargins(
  kind: ChartKind,
  vmBalanced: VmBalanced,
  computedBottom: number
): { top: number; left: number; right: number; bottom: number } {
  if (kind === "bar" || kind === "histogram") {
    const side = Math.max(26, Math.min(36, vmBalanced.marginLeft));
    const bottom = Math.max(computedBottom, 28);
    const top = Math.max(8, Math.min(14, Math.round(bottom * 0.24)));
    return { top, left: side, right: side, bottom };
  }
  if (kind === "line" || kind === "area") {
    const side = Math.max(
      26,
      Math.min(36, Math.round((vmBalanced.marginLeft + vmBalanced.marginRight) / 2))
    );
    const bottom = computedBottom;
    const top = Math.max(10, Math.min(14, Math.round(bottom * 0.22)));
    return { top, left: side, right: side, bottom };
  }
  const side = Math.max(
    vmBalanced.marginLeft,
    Math.round((vmBalanced.marginLeft + vmBalanced.marginRight) / 2)
  );
  return {
    top: 16,
    left: side,
    right: side,
    bottom: computedBottom,
  };
}
