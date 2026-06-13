import { describe, expect, it } from "vitest";
import {
  buildTrendDisplayTitle,
  getCanonicalChartTitle,
  canonicalMetricLabelFromChartTitle,
  normalizeCanonicalChartTitle,
  polishAutoDashboardChartTitle,
  titleHasDuplicateSemanticTokens,
} from "@/lib/canonical-chart-title";

describe("normalizeCanonicalChartTitle", () => {
  it("dedupes monthly and trend tokens", () => {
    expect(
      normalizeCanonicalChartTitle("Monthly Monthly Revenue Trend Trend")
    ).toBe("Monthly Revenue Trend");
    expect(
      normalizeCanonicalChartTitle("Monthly Monthly Profit Trend Trend")
    ).toBe("Monthly Profit Trend");
    expect(
      normalizeCanonicalChartTitle("Monthly Monthly Customers Trend Trend")
    ).toBe("Monthly Customers Trend");
  });

  it("detects duplicate semantic tokens", () => {
    expect(titleHasDuplicateSemanticTokens("Monthly Monthly Revenue Trend Trend")).toBe(
      true
    );
    expect(titleHasDuplicateSemanticTokens("Monthly Revenue Trend")).toBe(false);
  });
});

describe("buildTrendDisplayTitle", () => {
  it("does not double-wrap backend executive trend titles", () => {
    expect(buildTrendDisplayTitle("Monthly Revenue Trend", "Monthly")).toBe(
      "Monthly Revenue Trend"
    );
    expect(buildTrendDisplayTitle("Revenue", "Monthly")).toBe("Monthly Revenue Trend");
  });

  it("replaces stale monthly prefix when bucket is weekly", () => {
    expect(
      buildTrendDisplayTitle("Monthly Delivery Days Trend", "Weekly")
    ).toBe("Weekly Delivery Days Trend");
  });
});

describe("canonicalMetricLabelFromChartTitle", () => {
  it("extracts measure from executive trend titles", () => {
    expect(canonicalMetricLabelFromChartTitle("Monthly Revenue Trend")).toBe(
      "Revenue"
    );
    expect(canonicalMetricLabelFromChartTitle("Monthly Profit Trend")).toBe(
      "Profit"
    );
    expect(canonicalMetricLabelFromChartTitle("Monthly Customers Trend")).toBe(
      "Customers"
    );
    expect(
      canonicalMetricLabelFromChartTitle("Monthly Credit Utilization Trend")
    ).toBe("Credit Utilization");
  });

  it("extracts rate measures from rate trend titles", () => {
    expect(
      canonicalMetricLabelFromChartTitle("Monthly Attrition Rate Trend")
    ).toBe("Attrition Rate");
    expect(
      canonicalMetricLabelFromChartTitle("Monthly Conversion Rate Trend")
    ).toBe("Conversion Rate");
  });

  it("extracts metric from comparison titles", () => {
    expect(canonicalMetricLabelFromChartTitle("Revenue by Region")).toBe(
      "Revenue"
    );
  });
});

describe("polishAutoDashboardChartTitle", () => {
  it("rewrites ranking titles to metric-by-dimension form", () => {
    expect(polishAutoDashboardChartTitle("Total Top region by revenue")).toBe(
      "Revenue by Region"
    );
    expect(polishAutoDashboardChartTitle("Top region by revenue")).toBe(
      "Revenue by Region"
    );
  });

  it("rewrites category distribution titles", () => {
    expect(
      polishAutoDashboardChartTitle("Category distribution · department")
    ).toBe("Department distribution");
  });

  it("strips redundant aggregation prefix on by-dimension titles", () => {
    expect(polishAutoDashboardChartTitle("Total revenue by region")).toBe(
      "Revenue by Region"
    );
  });

  it("polishes monthly trend titles without redundant Total", () => {
    expect(polishAutoDashboardChartTitle("revenue trend (monthly)")).toBe(
      "Monthly Revenue Trend"
    );
    expect(polishAutoDashboardChartTitle("cost trend (monthly)")).toBe(
      "Monthly Cost Trend"
    );
  });
});

describe("getCanonicalChartTitle", () => {
  it("applies polish to raw auto-dashboard titles", () => {
    expect(
      getCanonicalChartTitle({
        rawTitle: "Total Top region by revenue",
        chartType: "horizontalBar",
        labels: ["North", "South"],
        values: [100, 80],
      })
    ).toBe("Revenue by Region");
  });

  it("polishes auto-dashboard trend titles from contract", () => {
    expect(
      getCanonicalChartTitle({
        rawTitle: "revenue trend (monthly)",
        chartType: "line",
        labels: ["2025-01", "2025-02", "2025-03", "2025-04"],
        values: [100, 120, 115, 130],
      })
    ).toBe("Monthly Revenue Trend");
  });

  it("preserves backend executive trend titles without duplication", () => {
    const labels = [
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
    ];
    const values = [620000, 650000, 680000, 710000, 760000, 825000];
    for (const rawTitle of [
      "Monthly Revenue Trend",
      "Monthly Profit Trend",
      "Monthly Customers Trend",
    ]) {
      const title = getCanonicalChartTitle({
        rawTitle,
        chartType: "line",
        labels,
        values,
      });
      expect(title).toBe(rawTitle);
      expect(titleHasDuplicateSemanticTokens(title)).toBe(false);
    }
  });

  it("repairs duplicated trend titles from stale contract displayTitle", () => {
    expect(
      getCanonicalChartTitle({
        rawTitle: "Monthly Revenue Trend",
        chartType: "line",
        labels: ["2025-01", "2025-02"],
        values: [1, 2],
        contract: {
          displayTitle: "Monthly Monthly Revenue Trend Trend",
        } as never,
      })
    ).toBe("Monthly Revenue Trend");
  });
});
