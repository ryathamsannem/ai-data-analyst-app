import { describe, expect, it } from "vitest";
import {
  buildChartCartesianTooltipHandlers,
  chartTooltipMetricLabel,
  formatChartTooltipCategoryLine,
  formatChartTooltipValueLine,
} from "@/lib/chart-tooltip-format";
import { formatOverviewBarTopValueLabel } from "@/lib/overview-dashboard-export";

describe("chartTooltipMetricLabel", () => {
  it("strips breakdown suffix and pct tokens from chart titles", () => {
    expect(
      chartTooltipMetricLabel("Total conversion rate pct by campaign name")
    ).toBe("Conversion Rate");
  });

  it("uses canonical metric labels for trend chart titles", () => {
    expect(chartTooltipMetricLabel("Monthly Revenue Trend")).toBe("Revenue");
    expect(chartTooltipMetricLabel("Monthly Profit Trend")).toBe("Profit");
    expect(chartTooltipMetricLabel("Monthly Customers Trend")).toBe("Customers");
    expect(chartTooltipMetricLabel("Monthly Attrition Rate Trend")).toBe(
      "Attrition Rate"
    );
  });
});

describe("formatChartTooltipCategoryLine", () => {
  it("formats category line for tooltips", () => {
    expect(formatChartTooltipCategoryLine("Campaign", "Summer Promo")).toBe(
      "Campaign: Summer Promo"
    );
  });
});

describe("buildChartCartesianTooltipHandlers", () => {
  it("returns clean category and metric lines", () => {
    const { labelFormatter, formatter } = buildChartCartesianTooltipHandlers(
      "Campaign",
      "conversion_rate_pct",
      { metricLabel: "conversion_rate_pct", presentationKind: "bar_horizontal" }
    );
    expect(labelFormatter("Summer Promo")).toBe("Campaign: Summer Promo");
    const [value, name] = formatter(151, "value", {
      payload: { name: "Summer Promo", value: 151 },
    });
    expect(name).toBe("Conversion Rate:");
    expect(value).toBe("151.0%");
  });

  it("focused V-Bar rate tooltip matches top-label precision (2.47% not 2.5%)", () => {
    const rows = [
      { name: "Night", value: 0.0247 },
      { name: "Day", value: 0.0252 },
      { name: "Swing", value: 0.0266 },
    ];
    const ctx = {
      metricLabel: "Defect Rate",
      chartTitle: "Defect Rate by Shift",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const label = formatOverviewBarTopValueLabel(0.0247, rows, ctx);
    const [tooltipValue] = formatChartTooltipValueLine(
      { name: "Night", value: 0.0247 },
      "Defect Rate",
      ctx
    );
    expect(label).toBe("2.47%");
    expect(tooltipValue).toBe("2.47%");
    expect(tooltipValue).not.toBe("2.5%");
  });

  it("focused V-Bar rate tooltip preserves 2-decimal precision for 6.66%", () => {
    const rows = [
      { name: "A", value: 0.0661 },
      { name: "B", value: 0.0666 },
      { name: "C", value: 0.0672 },
    ];
    const ctx = {
      metricLabel: "Conversion Rate",
      chartTitle: "Conversion Rate by Campaign",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const label = formatOverviewBarTopValueLabel(0.0666, rows, ctx);
    const [tooltipValue] = formatChartTooltipValueLine(
      { name: "B", value: 0.0666 },
      "Conversion Rate",
      ctx
    );
    expect(label).toBe("6.66%");
    expect(tooltipValue).toBe("6.66%");
  });

  it("H-Bar large currency end label stays compact while tooltip remains exact", () => {
    const rows = [
      { name: "Active", value: 7_317_710 },
      { name: "Terminated", value: 5_200_000 },
    ];
    const ctx = {
      metricLabel: "Bonus",
      chartTitle: "Bonus by Employee Status",
      presentationKind: "bar_horizontal" as const,
      chartRows: rows,
    };
    const { formatter } = buildChartCartesianTooltipHandlers(
      "Status",
      "Bonus",
      ctx
    );
    const [tooltipValue] = formatter(7_317_710, "value", {
      payload: { name: "Active", value: 7_317_710 },
    });
    expect(tooltipValue).toContain("7,317,710");
    expect(tooltipValue).not.toMatch(/7\.3M/);
  });
});
