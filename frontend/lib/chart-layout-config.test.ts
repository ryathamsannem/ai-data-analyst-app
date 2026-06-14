import { describe, expect, it } from "vitest";
import {
  resolveDetailPlotHeight,
  resolveChartsTabPreviewPlotHeight,
} from "@/lib/chart-layout-config";

describe("resolveDetailPlotHeight", () => {
  it("keeps AI Insights scatter in the shared 480–540px desktop band", () => {
    const h = resolveDetailPlotHeight(12, "scatter", 900, "insights");
    expect(h).toBeGreaterThanOrEqual(480);
    expect(h).toBeLessThanOrEqual(540);
  });

  it("uses the same height for Charts tab as AI Insights", () => {
    const fewInsights = resolveDetailPlotHeight(3, "bar_horizontal", 900, "insights");
    const fewCharts = resolveChartsTabPreviewPlotHeight(3, "bar_horizontal", 900);
    const manyInsights = resolveDetailPlotHeight(12, "bar_horizontal", 900, "insights");
    const manyCharts = resolveChartsTabPreviewPlotHeight(12, "bar_horizontal", 900);
    expect(fewCharts).toBe(fewInsights);
    expect(manyCharts).toBe(manyInsights);
    expect(manyCharts).toBeGreaterThanOrEqual(fewCharts);
  });

  it("scales down on narrow viewports", () => {
    const h = resolveDetailPlotHeight(8, "scatter", 640, "insights");
    expect(h).toBeGreaterThanOrEqual(220);
    expect(h).toBeLessThan(480);
  });

  it("Charts tab delegates to shared detail height utility", () => {
    expect(resolveChartsTabPreviewPlotHeight(8, "scatter", 800)).toBe(
      resolveDetailPlotHeight(8, "scatter", 800, "chartsTab")
    );
  });
});
