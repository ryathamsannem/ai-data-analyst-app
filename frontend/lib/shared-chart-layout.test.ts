import { describe, expect, it } from "vitest";
import {
  getSharedDetailLayoutMetrics,
  resolveSharedDetailPlotHeight,
  SESSION_DETAIL_CONTINUOUS_PLOT_FLOOR_PX,
  SHARED_CHART_LAYOUT,
} from "@/lib/shared-chart-layout";
import {
  resolveChartsTabPreviewPlotHeight,
  resolveDetailPlotHeight,
} from "@/lib/chart-layout-config";

describe("resolveSharedDetailPlotHeight", () => {
  it("matches AI Insights and Charts tab for the same chart", () => {
    const args = [12, "bar_horizontal" as const, 900] as const;
    const shared = resolveSharedDetailPlotHeight(...args);
    const insights = resolveDetailPlotHeight(...args, "insights");
    const charts = resolveChartsTabPreviewPlotHeight(...args);
    expect(shared).toBe(insights);
    expect(shared).toBe(charts);
  });

  it("uses shared horizontal bar growth cap", () => {
    const h = resolveSharedDetailPlotHeight(12, "bar_horizontal", 900);
    expect(h).toBeLessThanOrEqual(SHARED_CHART_LAYOUT.horizontalBar.capPx);
    expect(h).toBeGreaterThanOrEqual(SHARED_CHART_LAYOUT.plotBand.desktopFloor);
  });

  it("boosts line, area, and scatter plot height inside the same shell width", () => {
    const lineH = resolveSharedDetailPlotHeight(9, "line", 900);
    const areaH = resolveSharedDetailPlotHeight(9, "area", 900);
    const scatterH = resolveSharedDetailPlotHeight(9, "scatter", 900);
    expect(areaH).toBe(lineH);
    expect(lineH).toBe(scatterH);
    expect(lineH).toBe(SESSION_DETAIL_CONTINUOUS_PLOT_FLOOR_PX);
    expect(lineH).toBeLessThanOrEqual(580);
    const lineMetrics = getSharedDetailLayoutMetrics("line");
    expect(lineMetrics.planViewportPx).toBe(850);
    expect(lineMetrics.plotHeightMax).toBe(580);
  });

  it("boosts compact vertical bar plot height for Charts and Insights", () => {
    const compactBar = resolveSharedDetailPlotHeight(4, "bar", 900);
    const denseBar = resolveSharedDetailPlotHeight(8, "bar", 900);
    expect(compactBar).toBeGreaterThanOrEqual(
      SHARED_CHART_LAYOUT.verticalBar.livePlotFloorPx
    );
    expect(compactBar).toBeGreaterThan(denseBar);
  });
});
