import { describe, expect, it } from "vitest";
import {
  buildChartCartesianTooltipHandlers,
  chartTooltipMetricLabel,
  formatChartTooltipCategoryLine,
} from "@/lib/chart-tooltip-format";

describe("chartTooltipMetricLabel", () => {
  it("strips breakdown suffix and pct tokens from chart titles", () => {
    expect(
      chartTooltipMetricLabel("Total conversion rate pct by campaign name")
    ).toBe("Conversion Rate");
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
});
