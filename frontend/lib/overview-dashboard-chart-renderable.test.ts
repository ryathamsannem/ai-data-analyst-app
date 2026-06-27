import { describe, expect, it } from "vitest";
import {
  filterOverviewAutoDashboardCharts,
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

describe("filterOverviewAutoDashboardCharts", () => {
  const retailLike = [
    { title: "Monthly Sales Amount Trend", chartType: "line", labels: ["a"], values: [1] },
    { title: "Sales Amount by Customer Segment", chartType: "horizontalBar", labels: ["A"], values: [2] },
    { title: "Product Category Sales Amount Share", chartType: "donut", labels: ["A", "B"], values: [3, 1] },
    { title: "Profit by Product Category", chartType: "bar", labels: ["A"], values: [4] },
    { title: "Sales Amount vs Profit", chartType: "scatter", labels: ["1 / 2"], values: [2] },
    { title: "Quantity by Customer Segment", chartType: "horizontalBar", labels: ["A"], values: [5] },
  ];

  it("drops scatter when enough business charts exist", () => {
    const filtered = filterOverviewAutoDashboardCharts(retailLike);
    expect(filtered.some((c) => c.chartType === "scatter")).toBe(false);
    expect(filtered.length).toBeGreaterThanOrEqual(4);
  });

  it("prefers sales/profit over quantity for the same dimension", () => {
    const filtered = filterOverviewAutoDashboardCharts(retailLike);
    const titles = filtered.map((c) => c.title);
    expect(titles).toContain("Sales Amount by Customer Segment");
    expect(titles).not.toContain("Quantity by Customer Segment");
  });

  it("keeps scatter when it is the only useful chart", () => {
    const onlyScatter = [
      { title: "Sales Amount vs Profit", chartType: "scatter", labels: ["1 / 2", "2 / 3"], values: [2, 3] },
    ];
    expect(filterOverviewAutoDashboardCharts(onlyScatter)).toHaveLength(1);
  });

  const bankingLike = [
    { title: "Monthly Spend Amount Trend", chartType: "line", labels: ["2024-01"], values: [1] },
    { title: "Loan Balance by Product Type", chartType: "horizontalBar", labels: ["A"], values: [2] },
    { title: "Product Type Spend Amount Share", chartType: "donut", labels: ["A", "B"], values: [3, 1] },
    { title: "Monthly Loan Balance Trend", chartType: "area", labels: ["2024-01"], values: [4] },
    { title: "Spend Amount vs Loan Balance", chartType: "scatter", labels: ["1 / 2"], values: [2] },
    { title: "Account Age Months by Product Type", chartType: "horizontalBar", labels: ["A"], values: [5] },
  ];

  it("drops scatter and account age for banking-like overview when stronger charts exist", () => {
    const filtered = filterOverviewAutoDashboardCharts(bankingLike);
    const titles = filtered.map((c) => c.title?.toLowerCase() ?? "");
    expect(filtered.some((c) => c.chartType === "scatter")).toBe(false);
    expect(titles.some((t) => t.includes("account age"))).toBe(false);
    expect(filtered.length).toBeGreaterThanOrEqual(4);
  });

  it("drops risk metrics by city when segment/product charts exist", () => {
    const withCityRisk = [
      ...bankingLike.filter((c) => !String(c.title).toLowerCase().includes("city")),
      { title: "Delinquency Flag by City", chartType: "horizontalBar", labels: ["A"], values: [1] },
      { title: "Average Utilization Pct by City", chartType: "bar", labels: ["B"], values: [2] },
    ];
    const filtered = filterOverviewAutoDashboardCharts(withCityRisk);
    const titles = filtered.map((c) => c.title?.toLowerCase() ?? "");
    expect(titles.some((t) => t.includes("delinquency") && t.includes("city"))).toBe(false);
    expect(titles.some((t) => t.includes("utilization") && t.includes("city"))).toBe(false);
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
