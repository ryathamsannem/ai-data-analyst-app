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
      outerShellMinHeight: 430,
      plotHeightMin: 320,
      plotHeightMax: 560,
    };
  }
  if (t === "line") {
    return {
      planViewportPx: 850,
      outerShellMinHeight: 430,
      plotHeightMin: 360,
      plotHeightMax: 410,
    };
  }
  return {
    planViewportPx: 760,
    outerShellMinHeight: 430,
    plotHeightMin: 360,
    plotHeightMax: 420,
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
    const left = Math.max(26, Math.min(40, vmBalanced.marginLeft - 8));
    const right = Math.max(28, Math.min(44, vmBalanced.marginRight + 10));
    return {
      top: 20,
      left,
      right,
      bottom: Math.max(computedBottom, 70),
    };
  }
  if (kind === "line" || kind === "area") {
    return {
      top: 20,
      left: Math.max(24, Math.min(38, vmBalanced.marginLeft - 6)),
      right: Math.max(26, Math.min(42, vmBalanced.marginRight + 8)),
      bottom: computedBottom,
    };
  }
  return {
    top: 22,
    left: vmBalanced.marginLeft,
    right: vmBalanced.marginRight,
    bottom: computedBottom,
  };
}
