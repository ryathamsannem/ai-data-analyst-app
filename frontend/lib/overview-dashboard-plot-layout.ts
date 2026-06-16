import type { ChartKind, ChartRow } from "@/app/chart-types";
import { OVERVIEW_PNG_EXPORT_HBAR_CATEGORY_PAD_PX } from "@/lib/overview-dashboard-export";
import {
  balanceVerticalOuterMargins,
  collectSampleTickStrings,
  computeCategoryAxisBottomMargin,
  computeHorizontalBarAxisLayout,
  computeVerticalCategoryAxisPlan,
  computeVerticalValueAxisLayout,
  estimateCartesianPlotInnerWidthPx,
  type ChartLayoutMode,
  type VerticalCategoryAxisPlan,
} from "@/lib/chart-axis-layout";

export type OverviewChartAxes = {
  categoryAxis: string;
  valueAxis: string;
  valueAxisCompact: string;
};

export function computeCartesianCategoryPlanForRender(args: {
  rows: ChartRow[];
  kind: ChartKind;
  stackedBar: boolean;
  chartHeight: number;
  compact: boolean;
  insightMode: boolean;
  viewportWidthPx: number;
  axes: OverviewChartAxes;
  layoutVariant?: "default" | "overview_half";
  allowHorizontalBarFallback?: boolean;
}): VerticalCategoryAxisPlan | null {
  const {
    rows,
    kind,
    stackedBar,
    chartHeight,
    compact,
    insightMode,
    viewportWidthPx,
    axes,
    layoutVariant = "default",
    allowHorizontalBarFallback = false,
  } = args;
  if (!rows.length) return null;
  if (kind !== "bar" && kind !== "line" && kind !== "area" && kind !== "histogram")
    return null;

  const chartLayoutMode: ChartLayoutMode = compact ? "compact" : "full";
  const tickSamples = collectSampleTickStrings(rows);
  const plotInnerHeightPx =
    chartLayoutMode === "full"
      ? Math.max(120, Math.floor(chartHeight * 0.86))
      : Math.max(72, Math.floor(chartHeight * 0.52));

  const verticalValueLayout = computeVerticalValueAxisLayout({
    valueAxisLabel: axes.valueAxisCompact,
    valueAxisMeasureLabel: axes.valueAxis,
    tickSampleStrings: tickSamples,
    chartLayoutMode,
    plotInnerHeightPx,
    tickFontSizePx: compact ? 10 : 11,
    titleFontSizePx: compact ? 10 : 11,
  });

  const vmBalanced = balanceVerticalOuterMargins({
    marginLeft: verticalValueLayout.marginLeft,
    chartLayoutMode,
  });

  let variant: "main" | "overview_half" | "insight_compact" | "insight_full" =
    "main";
  if (layoutVariant === "overview_half") {
    variant = "overview_half";
  } else if (insightMode && compact) {
    variant = "insight_compact";
  } else if (insightMode && !compact) {
    variant = "insight_full";
  }

  const innerW = estimateCartesianPlotInnerWidthPx({
    viewportWidthPx,
    marginLeftPx: vmBalanced.marginLeft,
    marginRightPx: vmBalanced.marginRight,
    variant,
  });

  const labels = rows.map((r) => String(r.name ?? ""));
  const preferAngledInsight =
    insightMode &&
    !compact &&
    !stackedBar &&
    (kind === "bar" || kind === "histogram") &&
    labels.length >= 5 &&
    labels.length <= 14;
  const categoryAngleDegInsight =
    insightMode && !compact
      ? kind === "line" || kind === "area"
        ? 32
        : kind === "bar" || kind === "histogram"
          ? 30
          : 25
      : undefined;

  return computeVerticalCategoryAxisPlan({
    categoryLabels: labels,
    estimatedPlotInnerWidthPx: innerW,
    chartLayoutMode,
    disableHorizontalFallback:
      stackedBar ||
      kind === "histogram" ||
      (kind === "bar" && !allowHorizontalBarFallback),
    preferAngledCategoryTicks: preferAngledInsight,
    categoryAngleDeg: categoryAngleDegInsight,
  });
}

export function computeOverviewHorizontalDashLayout(
  chartRows: ChartRow[],
  valueAxisTitle: string,
  categoryAxisLabel: string,
  viewportW: number,
  options?: { pngCapture?: boolean }
) {
  const pngCapture = options?.pngCapture === true;
  const tickFs = pngCapture ? 15 : 9;
  const base = computeHorizontalBarAxisLayout({
    categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
    valueAxisLabel: valueAxisTitle,
    valueAxisFull: valueAxisTitle,
    categoryAxisLabel,
    chartLayoutMode: pngCapture ? "export" : "full",
    tickFontSizePx: tickFs,
    titleFontSizePx: 10,
    maxValueAxisTitleWidthPx: Math.max(120, viewportW - 72),
  });
  const catCap = Math.max(72, Math.floor(viewportW * 0.38));
  let catW = Math.min(catCap, Math.max(base.categoryAxisWidth, 72));
  if (pngCapture) {
    catW = Math.min(
      catCap + OVERVIEW_PNG_EXPORT_HBAR_CATEGORY_PAD_PX,
      catW + OVERVIEW_PNG_EXPORT_HBAR_CATEGORY_PAD_PX
    );
  }
  const marginLeft = pngCapture
    ? Math.max(base.marginLeft, 16)
    : base.marginLeft;
  return { ...base, categoryAxisWidth: catW, marginLeft };
}

export function computeOverviewVerticalDashLayout(
  displayKind: ChartKind,
  valueAxisTitle: string,
  dashTickSamples: string[],
  plotHeightPx: number
) {
  if (
    displayKind === "pie" ||
    displayKind === "donut" ||
    displayKind === "bar_horizontal"
  ) {
    return null;
  }
  return computeVerticalValueAxisLayout({
    valueAxisLabel: valueAxisTitle,
    valueAxisMeasureLabel: valueAxisTitle,
    tickSampleStrings: dashTickSamples,
    chartLayoutMode: "compact",
    tickFontSizePx: 10,
    titleFontSizePx: 10,
    plotInnerHeightPx: Math.max(180, Math.floor(plotHeightPx * 0.72)),
  });
}

export function computeOverviewMiniCategoryPlan(
  displayKind: ChartKind,
  chartRows: ChartRow[],
  miniAxes: OverviewChartAxes,
  viewportW: number,
  plotHeightPx: number
) {
  if (displayKind === "pie" || displayKind === "donut") return null;
  if (displayKind === "bar_horizontal") return null;
  const rowKind: ChartKind =
    displayKind === "line" || displayKind === "area"
      ? displayKind
      : displayKind === "histogram"
        ? "histogram"
        : "bar";
  if (rowKind !== "bar" && rowKind !== "line" && rowKind !== "area") {
    return null;
  }
  return computeCartesianCategoryPlanForRender({
    rows: chartRows,
    kind: rowKind,
    stackedBar: false,
    chartHeight: plotHeightPx,
    compact: true,
    insightMode: false,
    viewportWidthPx: Math.max(viewportW, 200),
    axes: miniAxes,
    layoutVariant: "overview_half",
    allowHorizontalBarFallback: rowKind === "bar",
  });
}

export function computeOverviewBarCategoryBottom(
  displayKind: ChartKind,
  chartRows: ChartRow[],
  miniCategoryPlan: ReturnType<typeof computeOverviewMiniCategoryPlan>
) {
  if (miniCategoryPlan && (displayKind === "bar" || displayKind === "histogram")) {
    return computeCategoryAxisBottomMargin({
      categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
      angled: miniCategoryPlan.angled,
      tickFontSizePx: miniCategoryPlan.tickFontSizePx,
      chartLayoutMode: miniCategoryPlan.angled ? "full" : "compact",
    });
  }
  return computeCategoryAxisBottomMargin({
    categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
    angled: chartRows.length > 3,
    tickFontSizePx: 10,
    chartLayoutMode: chartRows.length > 3 ? "full" : "compact",
  });
}

export function overviewDashboardUsesHorizontalBars(
  displayKind: ChartKind,
  miniCategoryPlan: ReturnType<typeof computeOverviewMiniCategoryPlan>
): boolean {
  return (
    displayKind === "bar_horizontal" ||
    (displayKind === "bar" && Boolean(miniCategoryPlan?.renderAsHorizontalBar))
  );
}

/** Extra live-view plot height for Overview line / area mini cards. */
export const OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX = 36;

/** Slightly smaller boost — scatter already reads larger at the same band. */
export const OVERVIEW_SCATTER_PLOT_HEIGHT_BOOST_PX = 32;

/** Match line band — closes h-full slack between H-Bar plot and footer. */
export const OVERVIEW_HBAR_PLOT_HEIGHT_BOOST_PX = 36;

/** Live H-Bar margins — lower plot band, tighter footer gutter. */
export const OVERVIEW_HBAR_LIVE_MARGIN_BOTTOM_PX = 20;
export const OVERVIEW_HBAR_LIVE_MARGIN_TOP_BASE_PX = 10;

/** Nudge live line / area plot slightly lower inside the band. */
export const OVERVIEW_TREND_LIVE_MARGIN_TOP_PX = 16;
export const OVERVIEW_TREND_LIVE_MARGIN_BOTTOM_CAP_ANGLED_PX = 36;
export const OVERVIEW_TREND_LIVE_MARGIN_BOTTOM_CAP_FLAT_PX = 26;

/** @deprecated Use kind-specific constants above. */
export const OVERVIEW_CONTINUOUS_PLOT_HEIGHT_BOOST_PX =
  OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX;

export function overviewDashUsesContinuousPlot(kind: ChartKind): boolean {
  return kind === "line" || kind === "area" || kind === "scatter";
}

export function overviewDashUsesHorizontalPlotBand(
  displayKind: ChartKind,
  renderAsHorizontal?: boolean
): boolean {
  return (
    displayKind === "bar_horizontal" ||
    (displayKind === "bar" && renderAsHorizontal === true)
  );
}

/** Live Overview cards with a taller plot band (line / area / scatter / H-Bar). */
export function overviewDashUsesExpandedPlotBand(
  displayKind: ChartKind,
  renderAsHorizontal?: boolean
): boolean {
  return (
    overviewDashUsesContinuousPlot(displayKind) ||
    overviewDashUsesHorizontalPlotBand(displayKind, renderAsHorizontal)
  );
}

/** Live Overview plot height — export capture keeps the base band unchanged. */
export function resolveOverviewDashLivePlotHeight(
  displayKind: ChartKind,
  baseHeightPx: number,
  renderAsHorizontal?: boolean
): number {
  if (displayKind === "line" || displayKind === "area") {
    return baseHeightPx + OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX;
  }
  if (displayKind === "scatter") {
    return baseHeightPx + OVERVIEW_SCATTER_PLOT_HEIGHT_BOOST_PX;
  }
  if (overviewDashUsesHorizontalPlotBand(displayKind, renderAsHorizontal)) {
    return baseHeightPx + OVERVIEW_HBAR_PLOT_HEIGHT_BOOST_PX;
  }
  return baseHeightPx;
}

/** Live Overview line left trim — shifts plot ~7px left vs area/scatter for H-Bar edge parity. */
export const OVERVIEW_LINE_Y_AXIS_LEFT_TRIM_PX = 25;

/** Overview scatter live point size (Pipeline B). */
export const OVERVIEW_SCATTER_POINT_RADIUS_PX = 3;
export const OVERVIEW_SCATTER_POINT_STROKE_PX = 0.4;
/** Subtle indigo rim — avoids default white halo. */
export const OVERVIEW_SCATTER_POINT_STROKE_COLOR = "#4f46e5";
export const OVERVIEW_SCATTER_POINT_STROKE_OPACITY = 0.25;
export const OVERVIEW_SCATTER_POINT_FILL_OPACITY = 1;

export function overviewTrendLiveSideMargins(
  yAxisWidth: number,
  options?: { lineChart?: boolean }
): {
  left: number;
  right: number;
} {
  const baseLeft = Math.max(18, Math.ceil(yAxisWidth) + 6);
  const left =
    options?.lineChart === true
      ? Math.max(10, baseLeft - OVERVIEW_LINE_Y_AXIS_LEFT_TRIM_PX)
      : baseLeft;
  return {
    left,
    right: 8,
  };
}

export function computeOverviewHBarLiveMargins(
  categoryCount: number
): { top: number; bottom: number } {
  const slots = Math.max(1, categoryCount);
  const sparseLift = slots <= 5 ? (6 - slots) * 5 : 0;
  return {
    top: Math.min(40, OVERVIEW_HBAR_LIVE_MARGIN_TOP_BASE_PX + sparseLift),
    bottom: OVERVIEW_HBAR_LIVE_MARGIN_BOTTOM_PX,
  };
}

export function computeOverviewTrendLivePlotMargins(args: {
  computedBottom: number;
  needsAngledTicks: boolean;
}): { top: number; bottom: number } {
  const bottomCap = args.needsAngledTicks
    ? OVERVIEW_TREND_LIVE_MARGIN_BOTTOM_CAP_ANGLED_PX
    : OVERVIEW_TREND_LIVE_MARGIN_BOTTOM_CAP_FLAT_PX;
  return {
    top: OVERVIEW_TREND_LIVE_MARGIN_TOP_PX,
    bottom: Math.min(args.computedBottom, bottomCap),
  };
}

/** Tighter value-axis plan for Overview continuous mini plots (line / area / scatter). */
export function computeOverviewContinuousVerticalDashLayout(
  valueAxisTitle: string,
  dashTickSamples: string[],
  plotHeightPx: number
) {
  return computeVerticalValueAxisLayout({
    valueAxisLabel: valueAxisTitle,
    valueAxisMeasureLabel: valueAxisTitle,
    tickSampleStrings: dashTickSamples,
    chartLayoutMode: "compact",
    tickFontSizePx: 10,
    titleFontSizePx: 10,
    plotInnerHeightPx: Math.max(200, Math.floor(plotHeightPx * 0.84)),
  });
}

export function computeOverviewScatterDashMargins(args: {
  yAxisWidth: number;
  pngCapture?: boolean;
}): { top: number; right: number; bottom: number; left: number } {
  const pngCapture = args.pngCapture === true;
  return {
    top: pngCapture ? 16 : 8,
    right: pngCapture ? 24 : 8,
    bottom: pngCapture ? 40 : 28,
    left: Math.max(10, Math.ceil(args.yAxisWidth) + 6),
  };
}

/** Balanced live margins when scatter uses premium rounded domains. */
export function computeOverviewScatterPremiumMargins(yAxisWidth: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const side = overviewTrendLiveSideMargins(yAxisWidth);
  const hGutter = Math.max(6, side.right - 2);
  return {
    top: 4,
    right: hGutter,
    bottom: 24,
    left: side.left,
  };
}
