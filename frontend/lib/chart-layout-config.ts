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
/**
 * Charts tab session preview — responsive height with less vertical dead space than legacy 300–500px floor.
 */
/** ~12% taller plot after Charts tab duplicate metadata row removal. */
const CHARTS_TAB_PLOT_HEIGHT_BOOST = 1.12;

export function resolveChartsTabPreviewPlotHeight(
  pointCount: number,
  kind: ChartKind,
  viewportInnerH: number
): number {
  const n = Math.max(1, pointCount);
  const cap = Math.round(Math.min(Math.max(viewportInnerH, 320) * 0.47, 500));
  const floor = 196;
  const boostedCap = Math.round(cap * CHARTS_TAB_PLOT_HEIGHT_BOOST);
  const fit = (h: number) =>
    Math.min(boostedCap, Math.round(h * CHARTS_TAB_PLOT_HEIGHT_BOOST));

  if (kind === "bar_horizontal") {
    const slot = 26;
    const extra = Math.max(0, n - 3) * slot;
    return fit(Math.min(cap, Math.max(240, 248 + extra)));
  }
  if (kind === "pie" || kind === "donut" || kind === "scatter") {
    return fit(Math.min(cap, Math.max(260, 292)));
  }
  if (kind === "line" || kind === "area") {
    return fit(Math.min(cap, Math.max(272, 300)));
  }
  if (kind === "bar" || kind === "histogram") {
    const extra = Math.min(28, Math.max(0, n - 5) * 5);
    return fit(Math.min(cap, Math.max(228, 252 + extra)));
  }
  return fit(Math.min(cap, Math.max(floor, 268)));
}

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

export type ChartPlotMarginOpts = {
  /** AI Insights / PDF insight layout — slightly tighter optical centering. */
  insightUi?: boolean;
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
  const top = compact ? 7 : 8;
  const horizontal = 8 + piePad.marginHorizontal;
  const bottom = Math.max(
    10,
    6 + Math.ceil(piePad.marginBottom * (kind === "donut" ? 0.88 : 0.82))
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
