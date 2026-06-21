/**
 * Normalized chart type for timeline / export parity (Overview → Charts → AI Insights → PDF).
 * Maps to Recharts `ChartKind` via `timelineTypeToChartKind`.
 */
import type { ChartKind } from "@/app/chart-types";
import {
  computeDetailViewCartesianPlan,
  getSharedDetailLayoutMetrics,
  resolveSharedDetailPlotHeight,
  sessionDetailVerticalOuterMargins,
  SHARED_CHART_LAYOUT,
  SHARED_DETAIL_PLOT_BAND,
  type SharedDetailLayoutMetrics,
} from "@/lib/shared-chart-layout";

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

export type InsightChartLayoutMetrics = SharedDetailLayoutMetrics;

export {
  SHARED_CHART_LAYOUT,
  SHARED_DETAIL_PLOT_BAND,
  computeDetailViewCartesianPlan,
  getSharedDetailLayoutMetrics,
  resolveSharedDetailPlotHeight,
};

/** @deprecated Use getSharedDetailLayoutMetrics */
export function getInsightLayoutMetrics(kind: ChartKind): InsightChartLayoutMetrics {
  return getSharedDetailLayoutMetrics(kind);
}

/** @deprecated Use resolveSharedDetailPlotHeight */
export function resolveDetailPlotHeight(
  pointCount: number,
  kind: ChartKind,
  viewportInnerH: number,
  _context: "insights" | "chartsTab" = "insights"
): number {
  return resolveSharedDetailPlotHeight(pointCount, kind, viewportInnerH);
}

export function resolveChartsTabPreviewPlotHeight(
  pointCount: number,
  kind: ChartKind,
  viewportInnerH: number
): number {
  return resolveSharedDetailPlotHeight(pointCount, kind, viewportInnerH);
}

/** Tailwind max-width for the inner insight viewport (matches plan targets). */
export function insightViewportMaxClassForChartKind(kind: ChartKind): string {
  const t = chartKindToTimelineType(kind);
  if (t === "horizontalBar") return "max-w-[900px]";
  if (t === "line") return "max-w-[850px]";
  return "max-w-[760px]";
}

type VmBalanced = { marginLeft: number; marginRight: number };

export type ChartPlotMarginOpts = {
  /** AI Insights / PDF insight layout — slightly tighter optical centering. */
  insightUi?: boolean;
  /** Y-axis tick column width — when set with insightUi, margin.left is outer pad only. */
  yAxisWidth?: number;
  pointCount?: number;
  lineChart?: boolean;
};

function cartesianSideMargin(vmBalanced: VmBalanced, kind: ChartKind): number {
  if (kind === "line" || kind === "area") {
    return Math.max(
      26,
      Math.min(36, Math.round((vmBalanced.marginLeft + vmBalanced.marginRight) / 2))
    );
  }
  return Math.max(26, Math.min(36, vmBalanced.marginLeft));
}

/**
 * Vertical Cartesian Recharts margins — optical centering (plot sits slightly above geometric center).
 * Separate presets for bar, histogram, and line/area. Does not shrink tick font sizes.
 */
export function verticalCartesianOuterMargins(
  kind: ChartKind,
  vmBalanced: VmBalanced,
  computedBottom: number,
  opts?: ChartPlotMarginOpts
): { top: number; left: number; right: number; bottom: number } {
  const insightUi = opts?.insightUi ?? false;
  const sessionSides =
    insightUi && opts?.yAxisWidth != null
      ? sessionDetailVerticalOuterMargins({
          yAxisWidth: opts.yAxisWidth,
          lineChart: opts.lineChart,
          pointCount: opts.pointCount,
        })
      : null;

  if (sessionSides && (kind === "bar" || kind === "histogram")) {
    const bottomTrim = insightUi ? 6 : 4;
    const bottom = Math.max(computedBottom - bottomTrim, insightUi ? 18 : 22);
    const top = insightUi ? 5 : 10;
    return {
      top,
      left: sessionSides.marginLeft,
      right: sessionSides.marginRight,
      bottom,
    };
  }

  const side = cartesianSideMargin(vmBalanced, kind);

  if (kind === "histogram") {
    const bottomTrim = insightUi ? 5 : 3;
    const bottom = Math.max(computedBottom - bottomTrim, insightUi ? 20 : 24);
    const top = insightUi ? 5 : 9;
    return { top, left: side, right: side, bottom };
  }

  if (kind === "bar") {
    const bottomTrim = insightUi ? 6 : 4;
    const bottom = Math.max(computedBottom - bottomTrim, insightUi ? 18 : 22);
    const top = insightUi ? 5 : 10;
    return { top, left: side, right: side, bottom };
  }

  if (kind === "line" || kind === "area") {
    const bottomTrim = insightUi ? 4 : 2;
    const bottom = Math.max(
      computedBottom - bottomTrim,
      insightUi ? 48 : computedBottom
    );
    const top = insightUi ? 6 : 11;
    return { top, left: side, right: side, bottom };
  }

  const sideFallback = Math.max(
    vmBalanced.marginLeft,
    Math.round((vmBalanced.marginLeft + vmBalanced.marginRight) / 2)
  );
  return {
    top: insightUi ? 10 : 14,
    left: sideFallback,
    right: sideFallback,
    bottom: computedBottom,
  };
}

/** Bottom margin passed to Recharts before outer margin preset (bar / histogram). */
export function resolveVerticalBarPlotBottomPad(args: {
  kind: "bar" | "histogram";
  categoryAxisBottomMargin: number;
  xAxisHeightPx: number;
  angled: boolean;
  hasCategoryLabel: boolean;
  insightUi: boolean;
  denseCategories: boolean;
}): number {
  if (!args.insightUi) {
    const trim = args.denseCategories ? 4 : 6;
    const floor = args.kind === "histogram" ? 22 : 20;
    return Math.max(
      floor,
      args.categoryAxisBottomMargin - trim + (args.denseCategories ? 2 : 0)
    );
  }

  const labelPad = args.hasCategoryLabel ? 5 : 2;
  const angledExtra = args.angled ? 4 : 0;
  const tight = args.xAxisHeightPx + labelPad + angledExtra;
  const trim = args.angled ? 12 : 8;
  return Math.max(tight, args.categoryAxisBottomMargin - trim);
}

/** Pie / donut — radial layout; keep legend room without excess vertical dead space. */
export function radialChartOuterMargins(
  kind: "pie" | "donut",
  compact: boolean,
  piePad: { marginHorizontal: number; marginBottom: number }
): { top: number; left: number; right: number; bottom: number } {
  const top = compact ? 7 : 6;
  const horizontal = 8 + piePad.marginHorizontal;
  const bottomFactor = compact
    ? kind === "donut"
      ? 0.88
      : 0.82
    : kind === "donut"
      ? 0.58
      : 0.52;
  const bottomFloor = compact ? 10 : 8;
  const bottom = Math.max(
    bottomFloor,
    (compact ? 6 : 4) + Math.ceil(piePad.marginBottom * bottomFactor)
  );
  return {
    top,
    right: horizontal,
    left: Math.max(6, horizontal - 2),
    bottom,
  };
}

/**
 * AI Insights + PDF capture — insight UI preset for vertical Cartesian charts.
 */
export function insightCartesianOuterMargins(
  kind: ChartKind,
  vmBalanced: VmBalanced,
  computedBottom: number
): { top: number; left: number; right: number; bottom: number } {
  return verticalCartesianOuterMargins(kind, vmBalanced, computedBottom, {
    insightUi: true,
  });
}
