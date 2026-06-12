import { describe, expect, it } from "vitest";
import {
  overviewDashboardUsesHorizontalBars,
} from "./overview-dashboard-plot-layout";

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
