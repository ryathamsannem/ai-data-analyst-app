import { describe, expect, it } from "vitest";
import {
  computeAutoDashboardChartPresentation,
  computeFinalChartPresentation,
} from "@/lib/final-chart-presentation";
import { resolveSnapshotPresentationKind } from "@/lib/normalize-visualization-contract";

const cityRows = [
  { name: "NYC", value: 120 },
  { name: "LA", value: 95 },
  { name: "Chicago", value: 88 },
  { name: "Houston", value: 72 },
  { name: "Phoenix", value: 61 },
];

describe("computeFinalChartPresentation", () => {
  it("preserves API horizontalBar without downgrading to vertical bar", () => {
    expect(
      computeFinalChartPresentation({
        apiChartType: "horizontalBar",
        title: "Orders by City",
        rows: cityRows,
      })
    ).toBe("bar_horizontal");
  });
});

describe("computeAutoDashboardChartPresentation", () => {
  it("matches Overview rules for Orders by City with many categories", () => {
    expect(
      computeAutoDashboardChartPresentation({
        apiChartType: "horizontalBar",
        title: "Orders by City",
        rows: cityRows,
      })
    ).toBe("bar_horizontal");
  });

  it("uses horizontal bar for auto dashboard bar charts with more than four categories", () => {
    expect(
      computeAutoDashboardChartPresentation({
        apiChartType: "bar",
        title: "Orders by City",
        rows: cityRows,
      })
    ).toBe("bar_horizontal");
  });
});

describe("resolveSnapshotPresentationKind", () => {
  it("keeps horizontal bar for auto_dashboard contract snapshots", () => {
    expect(
      resolveSnapshotPresentationKind({
        title: "Orders by City",
        rows: cityRows,
        apiChartType: "horizontalBar",
        pinnedChartKind: "bar_horizontal",
        source: "auto_dashboard",
        contract: {
          id: "x",
          source: "auto_dashboard",
          title: "Orders by City",
          displayTitle: "Orders by City",
          chartType: "bar_horizontal",
          rendererType: "bar_horizontal",
          mode: "comparison",
          labels: cityRows.map((r) => r.name),
          series: cityRows.map((r) => r.value),
          categoryKey: "city",
          metricKey: "orders",
          aggregation: "sum",
          dimension: "City",
          timeKey: null,
          timeBucketLabel: "",
          metricLabel: "Orders",
          aggregationLabel: "Total",
          isTimeSeries: false,
          semanticContext: null,
          aiContext: null,
          generatedAt: 0,
        },
      })
    ).toBe("bar_horizontal");
  });

  it("preserves scatter from API type", () => {
    const scatterRows = [
      { name: "P1", value: 10, x: 100 },
      { name: "P2", value: 20, x: 150 },
    ];
    expect(
      resolveSnapshotPresentationKind({
        title: "Revenue vs Profit",
        rows: scatterRows,
        apiChartType: "scatter",
        source: "auto_dashboard",
      })
    ).toBe("scatter");
  });
});
