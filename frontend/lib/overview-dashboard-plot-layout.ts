import type { ChartKind, ChartRow } from "@/app/chart-types";
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
  viewportW: number
) {
  const base = computeHorizontalBarAxisLayout({
    categoryTickStrings: chartRows.map((r) => String(r.name ?? "")),
    valueAxisLabel: valueAxisTitle,
    valueAxisFull: valueAxisTitle,
    categoryAxisLabel,
    chartLayoutMode: "full",
    tickFontSizePx: 9,
    titleFontSizePx: 10,
    maxValueAxisTitleWidthPx: Math.max(120, viewportW - 72),
  });
  const catCap = Math.max(72, Math.floor(viewportW * 0.38));
  const catW = Math.min(catCap, Math.max(base.categoryAxisWidth, 72));
  return { ...base, categoryAxisWidth: catW };
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
