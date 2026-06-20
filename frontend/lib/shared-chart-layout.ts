/**
 * Single source of truth for detail-view chart dimensions (AI Insights + Charts tab).
 * Auto Dashboard mini charts and PNG export use separate fixed capture specs.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  computeCartesianCategoryPlanForRender,
  type OverviewChartAxes,
} from "@/lib/overview-dashboard-plot-layout";

/** vh band for on-screen detail plots — mirrors CSS clamp(460px, 52vh, 560px). */
export const SHARED_DETAIL_PLOT_BAND = {
  clampMin: 460,
  vhRatio: 0.52,
  clampMax: 560,
  desktopFloor: 480,
  desktopCeiling: 540,
} as const;

export const SHARED_CHART_LAYOUT = {
  plotBand: SHARED_DETAIL_PLOT_BAND,
  plotCssClamp: "clamp(460px, 52vh, 560px)",
  horizontalBar: {
    basePx: 420,
    slotPx: 24,
    capPx: 580,
  },
  chartFrame: {
    maxWidthPx: 960,
  },
  barGapDense: 4,
  barGapThreshold: 6,
  /** Premium vertical bar spacing for small category counts (matches Overview/PNG export). */
  verticalBar: {
    compactCategoryGap: "16%",
    compactCategoryMax: 6,
    /** Live detail plot floor for compact vertical bars (Charts + Insights). */
    livePlotFloorPx: 520,
  },
} as const;

/** Extra ResponsiveContainer height for session line/area/scatter — plot allocation only, not shell width. */
export const SESSION_DETAIL_CONTINUOUS_PLOT_BOOST_PX = 40;
/** Minimum plot height for session continuous charts (matches H-Bar visual weight). */
export const SESSION_DETAIL_CONTINUOUS_PLOT_FLOOR_PX = 560;

export type SharedDetailLayoutMetrics = {
  planViewportPx: number;
  outerShellMinHeight: number;
  plotHeightMin: number;
  plotHeightMax: number;
};

function resolveSharedDetailPlotBand(viewportInnerH: number): number {
  const band = SHARED_DETAIL_PLOT_BAND;
  const vh = Math.max(viewportInnerH, 320);
  const vhTarget = Math.round(vh * band.vhRatio);
  const clamped = Math.max(band.clampMin, Math.min(band.clampMax, vhTarget));

  if (vh >= 768) {
    return Math.max(band.desktopFloor, Math.min(band.desktopCeiling, clamped));
  }

  return Math.max(220, Math.min(band.desktopFloor, Math.round(vh * 0.42)));
}

/** Detail-view layout metrics keyed by chart kind (Insights + Charts). */
export function getSharedDetailLayoutMetrics(
  kind: ChartKind
): SharedDetailLayoutMetrics {
  if (kind === "scatter") {
    return {
      planViewportPx: 760,
      outerShellMinHeight: 520,
      plotHeightMin: 480,
      plotHeightMax: 580,
    };
  }
  if (kind === "bar_horizontal") {
    return {
      planViewportPx: 900,
      outerShellMinHeight: 540,
      plotHeightMin: 480,
      plotHeightMax: 580,
    };
  }
  if (kind === "line" || kind === "area") {
    return {
      planViewportPx: 850,
      outerShellMinHeight: 520,
      plotHeightMin: 480,
      plotHeightMax: 580,
    };
  }
  return {
    planViewportPx: 760,
    outerShellMinHeight: 500,
    plotHeightMin: 480,
    plotHeightMax: 540,
  };
}

/** Plot height for AI Insights + Charts session preview (same formula). */
export function resolveSharedDetailPlotHeight(
  pointCount: number,
  kind: ChartKind,
  viewportInnerH: number
): number {
  const n = Math.max(1, pointCount);
  const band = resolveSharedDetailPlotBand(viewportInnerH);
  const { basePx, slotPx, capPx } = SHARED_CHART_LAYOUT.horizontalBar;

  if (kind === "bar_horizontal") {
    const categoryTarget = basePx + n * slotPx;
    return Math.min(capPx, Math.max(band, categoryTarget));
  }

  if (kind === "scatter" || kind === "line" || kind === "area") {
    return Math.min(
      Math.max(
        band + SESSION_DETAIL_CONTINUOUS_PLOT_BOOST_PX,
        SESSION_DETAIL_CONTINUOUS_PLOT_FLOOR_PX
      ),
      SHARED_CHART_LAYOUT.horizontalBar.capPx
    );
  }

  if (kind === "pie" || kind === "donut") {
    return Math.max(band - 20, SHARED_DETAIL_PLOT_BAND.clampMin);
  }

  if (kind === "bar" || kind === "histogram") {
    const extra = Math.min(48, Math.max(0, n - 5) * 8);
    const categoryBand = Math.min(
      SHARED_DETAIL_PLOT_BAND.desktopCeiling,
      band + extra
    );
    if (n <= SHARED_CHART_LAYOUT.verticalBar.compactCategoryMax) {
      return Math.min(
        SHARED_CHART_LAYOUT.horizontalBar.capPx,
        Math.max(
          categoryBand,
          SHARED_CHART_LAYOUT.verticalBar.livePlotFloorPx
        )
      );
    }
    return categoryBand;
  }

  return band;
}

/** Cartesian category plan — shared detail-view renderer preset (Insights + Charts). */
export function computeDetailViewCartesianPlan(args: {
  rows: ChartRow[];
  kind: ChartKind;
  stackedBar: boolean;
  chartHeight: number;
  axes: OverviewChartAxes;
  allowHorizontalBarFallback?: boolean;
}) {
  const metrics = getSharedDetailLayoutMetrics(args.kind);
  return computeCartesianCategoryPlanForRender({
    rows: args.rows,
    kind: args.kind,
    stackedBar: args.stackedBar,
    chartHeight: args.chartHeight,
    compact: false,
    insightMode: true,
    viewportWidthPx: metrics.planViewportPx,
    axes: args.axes,
    allowHorizontalBarFallback: args.allowHorizontalBarFallback,
  });
}
