import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import { computeFinalChartPresentation } from "@/lib/final-chart-presentation";

function campaignRateRows(): ChartRow[] {
  return [
    { name: "Spring Launch", value: 2.4 },
    { name: "Summer Sale", value: 3.1 },
    { name: "Fall Promo", value: 2.8 },
    { name: "Winter Clearance", value: 3.5 },
  ];
}

describe("rate metric chart presentation", () => {
  it("conversion_rate_pct by campaign does not default to donut", () => {
    const kind = computeFinalChartPresentation({
      apiChartType: "donut",
      title: "Average conversion rate pct by campaign name",
      question: "conversion rate by campaign name",
      rows: campaignRateRows(),
    });
    expect(kind === "donut" || kind === "pie").toBe(false);
    expect(kind).toBe("bar_horizontal");
  });

  it("share-like values still allow donut for non-rate metrics", () => {
    const rows: ChartRow[] = [
      { name: "North", value: 40 },
      { name: "South", value: 35 },
      { name: "East", value: 25 },
    ];
    const kind = computeFinalChartPresentation({
      apiChartType: "bar",
      title: "Revenue share by region",
      question: "What is the revenue share by region?",
      rows,
    });
    expect(kind === "pie" || kind === "donut").toBe(true);
  });

  it("rate metrics with share phrasing still prefer bar when not true composition", () => {
    const kind = computeFinalChartPresentation({
      apiChartType: "pie",
      title: "Average conversion rate pct by campaign name",
      rows: campaignRateRows(),
    });
    expect(kind).not.toBe("pie");
    expect(kind).not.toBe("donut");
  });
});
