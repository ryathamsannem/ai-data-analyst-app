import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  computeOverviewContinuousLiveOuterMargins,
  computeOverviewMiniCategoryPlan,
  computeOverviewHBarLiveMargins,
  computeOverviewTrendLivePlotMargins,
  overviewDashboardUsesHorizontalBars,
  overviewDashUsesContinuousPlot,
  overviewDashUsesExpandedPlotBand,
  overviewDashUsesHorizontalPlotBand,
  overviewTrendLiveSideMargins,
  resolveOverviewDashLivePlotHeight,
  OVERVIEW_LINE_Y_AXIS_LEFT_TRIM_PX,
  OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX,
  OVERVIEW_SCATTER_PLOT_HEIGHT_BOOST_PX,
  OVERVIEW_HBAR_PLOT_HEIGHT_BOOST_PX,
  OVERVIEW_VBAR_LIVE_PLOT_HEIGHT_BOOST_PX,
  OVERVIEW_VBAR_LIVE_MARGIN_BOTTOM_CAP_FLAT_PX,
  computeOverviewVBarLivePlotMargins,
  computeOverviewVBarLiveOuterMargins,
  OVERVIEW_VBAR_LIVE_MARGIN_LEFT_PX,
  OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MIN_PX,
  OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MAX_PX,
  OVERVIEW_SCATTER_POINT_RADIUS_PX,
  OVERVIEW_SCATTER_POINT_STROKE_PX,
  OVERVIEW_SCATTER_POINT_FILL_OPACITY,
} from "./overview-dashboard-plot-layout";

const regionRows: ChartRow[] = [
  { name: "North", value: 120 },
  { name: "South", value: 95 },
  { name: "East", value: 88 },
  { name: "West", value: 72 },
];

describe("overviewDashboardUsesHorizontalBars", () => {
  it("detects explicit and fallback horizontal orientation", () => {
    expect(
      overviewDashboardUsesHorizontalBars("bar_horizontal", null)
    ).toBe(true);
    expect(
      overviewDashboardUsesHorizontalBars("bar", {
        renderAsHorizontalBar: true,
        angled: false,
        angleDeg: 0,
        interval: 0,
        tickFontSizePx: 10,
        xAxisHeightPx: 32,
      })
    ).toBe(true);
    expect(
      overviewDashboardUsesHorizontalBars("bar", {
        renderAsHorizontalBar: false,
        angled: false,
        angleDeg: 0,
        interval: 0,
        tickFontSizePx: 10,
        xAxisHeightPx: 32,
      })
    ).toBe(false);
  });
});

describe("computeOverviewMiniCategoryPlan canonical bar policy", () => {
  it("does not layout-flip canonical vertical bars on narrow overview cards", () => {
    const plan = computeOverviewMiniCategoryPlan(
      "bar",
      regionRows,
      {
        categoryAxis: "Region",
        valueAxis: "Revenue",
        valueAxisCompact: "Revenue",
      },
      280,
      340
    );
    expect(plan?.renderAsHorizontalBar).not.toBe(true);
    expect(overviewDashboardUsesHorizontalBars("bar", plan)).toBe(false);
  });
});

describe("overview continuous plot height", () => {
  it("boosts line, area, scatter, and horizontal bar live heights", () => {
    expect(overviewDashUsesContinuousPlot("line")).toBe(true);
    expect(overviewDashUsesContinuousPlot("area")).toBe(true);
    expect(overviewDashUsesContinuousPlot("scatter")).toBe(true);
    expect(overviewDashUsesContinuousPlot("bar_horizontal")).toBe(false);
    expect(overviewDashUsesContinuousPlot("donut")).toBe(false);

    expect(overviewDashUsesHorizontalPlotBand("bar_horizontal")).toBe(true);
    expect(overviewDashUsesHorizontalPlotBand("bar", true)).toBe(true);
    expect(overviewDashUsesHorizontalPlotBand("bar", false)).toBe(false);

    expect(overviewDashUsesExpandedPlotBand("line")).toBe(true);
    expect(overviewDashUsesExpandedPlotBand("bar", true)).toBe(true);
    expect(overviewDashUsesExpandedPlotBand("bar", false)).toBe(true);
    expect(overviewDashUsesExpandedPlotBand("bar", true)).toBe(true);
    expect(overviewDashUsesExpandedPlotBand("donut")).toBe(false);

    expect(resolveOverviewDashLivePlotHeight("line", 340)).toBe(
      340 + OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX
    );
    expect(resolveOverviewDashLivePlotHeight("area", 340)).toBe(
      340 + OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX
    );
    expect(resolveOverviewDashLivePlotHeight("scatter", 340)).toBe(
      340 + OVERVIEW_SCATTER_PLOT_HEIGHT_BOOST_PX
    );
    expect(
      resolveOverviewDashLivePlotHeight("bar_horizontal", 340)
    ).toBe(340 + OVERVIEW_HBAR_PLOT_HEIGHT_BOOST_PX);
    expect(resolveOverviewDashLivePlotHeight("bar", 340, true)).toBe(
      340 + OVERVIEW_HBAR_PLOT_HEIGHT_BOOST_PX
    );
    expect(resolveOverviewDashLivePlotHeight("bar", 340, false)).toBe(
      340 + OVERVIEW_VBAR_LIVE_PLOT_HEIGHT_BOOST_PX
    );
    expect(resolveOverviewDashLivePlotHeight("donut", 340)).toBe(340);
  });

  it("uses lighter scatter point styling constants", () => {
    expect(OVERVIEW_SCATTER_POINT_RADIUS_PX).toBe(3);
    expect(OVERVIEW_SCATTER_POINT_STROKE_PX).toBeLessThan(0.5);
    expect(OVERVIEW_SCATTER_POINT_FILL_OPACITY).toBe(1);
  });

  it("balances live V-Bar outer margins like H-Bar — axis width on YAxis, not margin-left", () => {
    const fourCats = computeOverviewVBarLiveOuterMargins({
      yAxisWidth: 56,
      categoryCount: 4,
    });
    expect(fourCats.marginLeft).toBe(OVERVIEW_VBAR_LIVE_MARGIN_LEFT_PX);
    expect(fourCats.marginRight).toBeGreaterThanOrEqual(
      OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MIN_PX
    );
    expect(fourCats.marginRight).toBeLessThanOrEqual(
      OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MAX_PX
    );
    expect(fourCats.marginRight).toBeGreaterThan(fourCats.marginLeft);

    const sixCats = computeOverviewVBarLiveOuterMargins({
      yAxisWidth: 56,
      categoryCount: 6,
    });
    expect(sixCats.marginRight).toBeLessThan(fourCats.marginRight);

    const longTicks = computeOverviewVBarLiveOuterMargins({
      yAxisWidth: 88,
      categoryCount: 4,
    });
    expect(longTicks.marginLeft).toBe(OVERVIEW_VBAR_LIVE_MARGIN_LEFT_PX);
    expect(longTicks.marginRight).toBeGreaterThanOrEqual(
      OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MIN_PX
    );
    expect(longTicks.marginRight).toBeLessThanOrEqual(
      OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MAX_PX
    );
  });

  it("lowers sparse H-Bar groups and tightens live trend and V-Bar margins", () => {
    const sparse = computeOverviewHBarLiveMargins(4);
    const dense = computeOverviewHBarLiveMargins(8);
    expect(sparse.top).toBeGreaterThan(dense.top);
    expect(sparse.bottom).toBeLessThan(32);

    const vBarFlat = computeOverviewVBarLivePlotMargins({
      computedBottom: 40,
      angled: false,
      categoryCount: 4,
    });
    expect(vBarFlat.top).toBeGreaterThan(8);
    expect(vBarFlat.bottom).toBe(OVERVIEW_VBAR_LIVE_MARGIN_BOTTOM_CAP_FLAT_PX);

    const trend = computeOverviewTrendLivePlotMargins({
      computedBottom: 48,
      needsAngledTicks: true,
    });
    expect(trend.top).toBeGreaterThan(8);
    expect(trend.bottom).toBeLessThan(48);
  });

  it("balances live continuous outer margins without double-counting YAxis width", () => {
    const line = computeOverviewContinuousLiveOuterMargins({
      yAxisWidth: 56,
      lineChart: true,
      pointCount: 12,
    });
    expect(line.marginLeft).toBe(8);
    expect(line.marginRight).toBeGreaterThanOrEqual(
      OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MIN_PX
    );
    expect(line.marginRight).toBeLessThanOrEqual(
      OVERVIEW_VBAR_LIVE_MARGIN_RIGHT_MAX_PX
    );

    const areaSparse = computeOverviewContinuousLiveOuterMargins({
      yAxisWidth: 56,
      pointCount: 4,
    });
    const areaDense = computeOverviewContinuousLiveOuterMargins({
      yAxisWidth: 56,
      pointCount: 12,
    });
    expect(areaSparse.marginLeft).toBe(OVERVIEW_VBAR_LIVE_MARGIN_LEFT_PX);
    expect(areaSparse.marginRight).toBeGreaterThan(areaDense.marginRight);
  });

  it("keeps legacy trend side margins for ChartRenderer scatter paths", () => {
    const defaultSide = overviewTrendLiveSideMargins(42);
    const lineSide = overviewTrendLiveSideMargins(42, { lineChart: true });
    expect(defaultSide.left - lineSide.left).toBe(
      OVERVIEW_LINE_Y_AXIS_LEFT_TRIM_PX
    );
    expect(lineSide.left).toBeGreaterThanOrEqual(10);
  });
});
