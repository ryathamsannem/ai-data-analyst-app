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

  it("preserves API donut for composition auto-dashboard charts without share phrasing in title", () => {
    const rows = [
      { name: "Electronics", value: 120000 },
      { name: "Apparel", value: 95000 },
      { name: "Home", value: 88000 },
      { name: "Sports", value: 72000 },
    ];
    expect(
      computeAutoDashboardChartPresentation({
        apiChartType: "donut",
        title: "Profit by Product",
        rows,
      })
    ).toBe("donut");
  });

  it("preserves share-titled donut from backend composition titles", () => {
    const rows = [
      { name: "North", value: 120000 },
      { name: "South", value: 95000 },
      { name: "East", value: 88000 },
    ];
    expect(
      computeAutoDashboardChartPresentation({
        apiChartType: "donut",
        title: "Profit Share by Region",
        rows,
      })
    ).toBe("donut");
  });

  it("downgrades API donut to bar for rate metrics", () => {
    const rows = [
      { name: "Spring", value: 2.4 },
      { name: "Summer", value: 3.1 },
      { name: "Fall", value: 2.8 },
    ];
    const kind = computeAutoDashboardChartPresentation({
      apiChartType: "donut",
      title: "Conversion Rate by Campaign",
      rows,
    });
    expect(kind === "donut" || kind === "pie").toBe(false);
    expect(kind === "bar" || kind === "bar_horizontal").toBe(true);
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
