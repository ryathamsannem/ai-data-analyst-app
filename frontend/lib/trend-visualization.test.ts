import { describe, expect, it } from "vitest";
import { buildTrendExecutiveVizInsights } from "@/lib/trend-visualization";

describe("buildTrendExecutiveVizInsights", () => {
  it("uses Starting Month and Total Growth labels for time series", () => {
    const cards = buildTrendExecutiveVizInsights(
      [
        { name: "2024-01", value: 100, displayValue: "100" },
        { name: "2024-02", value: 120, displayValue: "120" },
        { name: "2024-03", value: 150, displayValue: "150" },
      ],
      "Revenue",
      "Monthly",
      "line"
    );
    const titles = cards.map((c) => c.title);
    expect(titles.some((t) => /Starting Month/i.test(t))).toBe(true);
    expect(titles.some((t) => /Total Growth/i.test(t))).toBe(true);
    expect(titles.some((t) => /Worst Month/i.test(t))).toBe(false);
    expect(titles.some((t) => /^Growth %$/i.test(t))).toBe(false);
  });
});
