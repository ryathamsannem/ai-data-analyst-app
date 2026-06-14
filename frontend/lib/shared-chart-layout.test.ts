import { describe, expect, it } from "vitest";
import {
  resolveSharedDetailPlotHeight,
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
});
