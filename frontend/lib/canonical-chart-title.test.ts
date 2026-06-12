import { describe, expect, it } from "vitest";
import {
  getCanonicalChartTitle,
  polishAutoDashboardChartTitle,
} from "@/lib/canonical-chart-title";

describe("polishAutoDashboardChartTitle", () => {
  it("rewrites ranking titles to metric-by-dimension form", () => {
    expect(polishAutoDashboardChartTitle("Total Top region by revenue")).toBe(
      "Revenue by region"
    );
    expect(polishAutoDashboardChartTitle("Top region by revenue")).toBe(
      "Revenue by region"
    );
  });

  it("rewrites category distribution titles", () => {
    expect(
      polishAutoDashboardChartTitle("Category distribution · department")
    ).toBe("Department distribution");
  });

  it("strips redundant aggregation prefix on by-dimension titles", () => {
    expect(polishAutoDashboardChartTitle("Total revenue by region")).toBe(
      "Revenue by region"
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
    ).toBe("Revenue by region");
  });
});
