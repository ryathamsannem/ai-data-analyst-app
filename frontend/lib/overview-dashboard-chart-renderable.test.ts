import { describe, expect, it } from "vitest";
import {
  filterOverviewRenderableCharts,
  overviewChartHasRenderableData,
} from "@/lib/overview-dashboard-chart-renderable";

describe("overviewChartHasRenderableData", () => {
  it("accepts charts with at least one finite value", () => {
    expect(
      overviewChartHasRenderableData({
        labels: ["A"],
        values: [10],
      })
    ).toBe(true);
  });

  it("rejects charts with no finite values", () => {
    expect(
      overviewChartHasRenderableData({
        labels: ["A", "B"],
        values: [NaN, Infinity],
      })
    ).toBe(false);
  });
});

describe("filterOverviewRenderableCharts", () => {
  it("preserves order and drops empty charts", () => {
    const charts = [
      { title: "A", labels: ["x"], values: [1] },
      { title: "B", labels: ["y"], values: [NaN] },
      { title: "C", labels: ["z"], values: [3] },
    ];
    const filtered = filterOverviewRenderableCharts(charts);
    expect(filtered.map((c) => c.title)).toEqual(["A", "C"]);
  });
});
