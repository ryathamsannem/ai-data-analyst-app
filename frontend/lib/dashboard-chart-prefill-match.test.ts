import { describe, expect, it } from "vitest";
import {
  dashboardPrefillTitleMatchesChart,
  extractDashboardChartTitleFromPrefillQuestion,
} from "@/lib/dashboard-chart-prefill-match";

describe("extractDashboardChartTitleFromPrefillQuestion", () => {
  it("reads chart title from ASK AI prefill", () => {
    expect(
      extractDashboardChartTitleFromPrefillQuestion(
        'Summarize what the chart "Total Orders by City" shows and the sharpest takeaway for this dataset.'
      )
    ).toBe("Total Orders by City");
  });
});

describe("dashboardPrefillTitleMatchesChart", () => {
  it("matches canonical prefill title to raw snapshot title", () => {
    const dashTitle = "Total Orders by City";
    const matched = dashboardPrefillTitleMatchesChart({
      snapshotTitle: "Orders by City",
      snapshotKind: "bar",
      snapshotContract: {
        id: "x",
        source: "auto_dashboard",
        title: "Orders by City",
        displayTitle: "Orders by City",
        chartType: "bar",
        rendererType: "bar",
        mode: "comparison",
        labels: ["NYC"],
        series: [1],
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
      snapshotRows: [{ name: "NYC", value: 42 }],
      dashTitleFromQuestion: dashTitle,
    });
    expect(matched).toBe(true);
  });

  it("matches exact snapshot title", () => {
    expect(
      dashboardPrefillTitleMatchesChart({
        snapshotTitle: "Revenue vs Profit",
        snapshotKind: "scatter",
        snapshotContract: null,
        snapshotRows: [{ name: "P1", value: 1, x: 2 }],
        dashTitleFromQuestion: "Revenue vs Profit",
      })
    ).toBe(true);
  });
});
