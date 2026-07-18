import { describe, expect, it } from "vitest";
import {
  computePearsonCorrelation,
  computeTrendPeriodChangePercent,
  describeScatterRelationship,
  formatOverviewMiniInsightChips,
  inferTrendPeriodLabelFromTitle,
  isBinaryCategoricalComparisonLabels,
  resolveChronologicalTrendEndpoints,
  shouldUseTrendPeriodInsightChips,
  trendPeriodChipLabels,
} from "@/lib/overview-dash-chart-insights";
import type { ChartRow } from "@/app/chart-types";

const trendRows: ChartRow[] = [
  { name: "Jan 2025", value: 620_000, displayValue: "$620,000" },
  { name: "Sep 2025", value: 825_000, displayValue: "$825,000" },
];

describe("inferTrendPeriodLabelFromTitle", () => {
  it("reads month from trend title", () => {
    expect(inferTrendPeriodLabelFromTitle("Monthly Revenue Trend")).toBe("Month");
  });

  it("reads week from trend title", () => {
    expect(inferTrendPeriodLabelFromTitle("Weekly Order Value Trend")).toBe("Week");
  });

  it("reads quarter and year from trend title", () => {
    expect(inferTrendPeriodLabelFromTitle("Quarterly Revenue Trend")).toBe("Quarter");
    expect(inferTrendPeriodLabelFromTitle("Yearly Revenue Trend")).toBe("Year");
  });
});

describe("trendPeriodChipLabels", () => {
  it("uses Start/Latest with granularity from title", () => {
    expect(trendPeriodChipLabels("Monthly Revenue Trend")).toEqual({
      startLabel: "Start Month",
      latestLabel: "Latest Month",
    });
    expect(trendPeriodChipLabels("Weekly Revenue Trend")).toEqual({
      startLabel: "Start Week",
      latestLabel: "Latest Week",
    });
    expect(trendPeriodChipLabels("Quarterly Revenue Trend")).toEqual({
      startLabel: "Start Quarter",
      latestLabel: "Latest Quarter",
    });
    expect(trendPeriodChipLabels("Yearly Revenue Trend")).toEqual({
      startLabel: "Start Year",
      latestLabel: "Latest Year",
    });
    expect(trendPeriodChipLabels("Revenue Trend")).toEqual({
      startLabel: "Start Period",
      latestLabel: "Latest Period",
    });
  });
});

describe("resolveChronologicalTrendEndpoints", () => {
  it("returns first and last chronological rows, not peak/trough", () => {
    const endpoints = resolveChronologicalTrendEndpoints([
      { name: "2025-09", value: 825_000 },
      { name: "2025-01", value: 620_000 },
      { name: "2025-03", value: 900_000 },
    ]);
    expect(endpoints?.start.name).toBe("2025-01");
    expect(endpoints?.latest.name).toBe("2025-09");
  });
});

describe("computeTrendPeriodChangePercent", () => {
  it("uses first-to-last chronological change, not peak-to-trough", () => {
    const change = computeTrendPeriodChangePercent([
      { name: "2025-01", value: 620_000 },
      { name: "2025-03", value: 900_000 },
      { name: "2025-09", value: 700_000 },
    ]);
    expect(change).toBe("+13%");
  });

  it("falls back to peak-vs-trough when time order is unknown", () => {
    const change = computeTrendPeriodChangePercent([
      { name: "Segment A", value: 620_000 },
      { name: "Segment B", value: 825_000 },
    ]);
    expect(change).toBe("+33%");
  });
});

describe("scatter relationship insight", () => {
  it("computes Pearson correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    const r = computePearsonCorrelation(xs, ys);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(1, 5);
  });

  it("classifies strong positive relationship", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      name: `${i}`,
      value: 10 + i * 5,
      x: 100 + i * 20,
    }));
    expect(describeScatterRelationship(rows)).toBe("Strong Positive");
  });

  it("classifies moderate negative relationship", () => {
    const rows: ChartRow[] = [
      { name: "1", value: 10, x: 1 },
      { name: "2", value: 8, x: 2 },
      { name: "3", value: 12, x: 3 },
      { name: "4", value: 6, x: 4 },
      { name: "5", value: 11, x: 5 },
      { name: "6", value: 5, x: 6 },
      { name: "7", value: 9, x: 7 },
      { name: "8", value: 4, x: 8 },
    ];
    const r = computePearsonCorrelation(
      rows.map((row) => row.x!),
      rows.map((row) => row.value)
    );
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
    expect(Math.abs(r!)).toBeGreaterThanOrEqual(0.4);
    expect(Math.abs(r!)).toBeLessThan(0.7);
    expect(describeScatterRelationship(rows)).toBe("Moderate Negative");
  });

  it("adds Relationship chip alongside scatter footer chips", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "340,000 / 82,000", value: 82000, x: 340000 },
        { name: "200,000 / 50,000", value: 50000, x: 200000 },
        { name: "90,000 / 18,000", value: 18000, x: 90000 },
      ],
      {
        chartTitle: "Revenue vs Profit",
        presentationKind: "scatter",
        isScatterChart: true,
        xMetricLabel: "Revenue",
        yMetricLabel: "Profit",
      }
    );
    expect(chips).toHaveLength(4);
    expect(chips[0]?.text).toMatch(/^Highest Profit:/);
    expect(chips[1]?.text).toMatch(/^Lowest Profit:/);
    expect(chips[2]?.text).toMatch(/^Profit Spread:/);
    expect(chips[3]?.text).toMatch(/^Relationship: Strong Positive$/);
  });
});

describe("formatOverviewMiniInsightChips trend wording", () => {
  it("uses Start Month / Latest Month / Change for line charts", () => {
    const chips = formatOverviewMiniInsightChips(trendRows, {
      chartTitle: "Monthly Revenue Trend",
      presentationKind: "line",
    });
    expect(chips[0]?.text).toMatch(/^Start Month:/);
    expect(chips[1]?.text).toMatch(/^Latest Month:/);
    expect(chips[2]?.text).toMatch(/^Change: \+/);
    expect(chips[0]?.text).not.toMatch(/^Top /);
    expect(chips[1]?.text).not.toMatch(/^Lowest /);
  });

  it("shows chronological endpoints when rows are out of order", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "2025-09", value: 825_000 },
        { name: "2025-01", value: 620_000 },
        { name: "2025-03", value: 900_000 },
      ],
      {
        chartTitle: "Monthly Revenue Trend",
        presentationKind: "line",
      }
    );
    expect(chips[0]?.text).toMatch(/^Start Month: 2025-01/);
    expect(chips[1]?.text).toMatch(/^Latest Month: 2025-09/);
    expect(chips[2]?.text).toBe("Change: +33%");
  });

  it("uses Start Week labels for weekly trends", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "2025-01-01/2025-01-07", value: 100 },
        { name: "2025-03-01/2025-03-07", value: 130 },
      ],
      {
        chartTitle: "Weekly Revenue Trend",
        presentationKind: "area",
      }
    );
    expect(chips[0]?.text).toMatch(/^Start Week:/);
    expect(chips[1]?.text).toMatch(/^Latest Week:/);
  });

  it("prefers weekly labels over a stale monthly title", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "2025-12-30/2026-01-05", value: 32 },
        { name: "2026-02-24/2026-03-02", value: 47 },
      ],
      {
        chartTitle: "Monthly Delivery Days Trend",
        presentationKind: "line",
      }
    );
    expect(chips[0]?.text).toMatch(/^Start Week:/);
    expect(chips[1]?.text).toMatch(/^Latest Week:/);
  });

  it("keeps Top / Lowest for non-trend breakdown charts", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Delhi", value: 100 },
        { name: "Mumbai", value: 50 },
      ],
      { chartTitle: "Orders by City", presentationKind: "bar" }
    );
    expect(chips[0]?.text).toMatch(/^Top: /);
    expect(chips[1]?.text).toMatch(/^Lowest: /);
  });

  it("uses share-aware chips with percent and compact value for overview donut charts", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Electronics", value: 360000 },
        { name: "Clothing", value: 180000 },
        { name: "Furniture", value: 120000 },
      ],
      {
        chartTitle: "Revenue Share by Product Category",
        presentationKind: "donut",
      }
    );
    expect(chips[0]?.text).toMatch(/^Largest: Electronics · /);
    expect(chips[0]?.text).toMatch(/\d+%/);
    expect(chips[0]?.text).toMatch(/360K|360,000/i);
    expect(chips[1]?.text).toMatch(/^Smallest: Furniture · /);
    expect(chips[2]?.text).toMatch(/^Total: /);
  });

  it("preserves small score gaps in breakdown chips", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Q1 Launch", value: 4.08 },
        { name: "Retention", value: 4.08 },
        { name: "Upsell", value: 4.05 },
      ],
      {
        chartTitle: "Satisfaction Score by Campaign",
        presentationKind: "bar",
      }
    );
    expect(chips[2]?.text).toBe("Gap: 0.03");
  });

  it("formats focused defect-rate breakdown chips with V-Bar label precision", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Night", value: 0.0252 },
        { name: "Day", value: 0.0247 },
        { name: "Swing", value: 0.0235 },
      ],
      {
        chartTitle: "Defect Rate by Shift",
        presentationKind: "bar",
      }
    );
    expect(chips[0]?.text).toBe("Top: Night (2.52%)");
    expect(chips[1]?.text).toBe("Lowest: Swing (2.35%)");
    expect(chips[0]?.text).not.toContain("2.5%");
    expect(chips[1]?.text).not.toContain("2.3%");
    const gapChip = chips.find((c) => c.key === "gap");
    expect(gapChip?.text).toBe("Gap: 0.17 pp");
    expect(gapChip?.text).not.toBe("Gap: 0.2 pp");
  });

  it("formats small-spread rate breakdown chips as percent with a pp gap", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Prime", value: 0.031 },
        { name: "Near Prime", value: 0.038 },
        { name: "Subprime", value: 0.041 },
      ],
      {
        chartTitle: "Average Delinquency Rate by Customer Segment",
        presentationKind: "bar",
      }
    );
    expect(chips[0]?.text).toBe("Top: Subprime (4.1%)");
    expect(chips[1]?.text).toBe("Lowest: Prime (3.1%)");
    const gapChip = chips.find((c) => c.key === "gap");
    expect(gapChip?.text).toMatch(/^Gap: .+ pp$/);
    expect(gapChip?.text).toBe("Gap: 1.0 pp");
  });

  it("formats utilization breakdown chips as percent points", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Credit Card", value: 0.62 },
        { name: "Auto", value: 0.41 },
        { name: "Mortgage", value: 0.28 },
      ],
      {
        chartTitle: "Average Utilization Pct by Product Type",
        presentationKind: "bar",
      }
    );
    expect(chips[0]?.text).toBe("Top: Credit Card (62.0%)");
    const gapChip = chips.find((c) => c.key === "gap");
    expect(gapChip?.text).toMatch(/pp$/);
  });

  it("does not convert 0-100 scale rate value of 1.0 to 100.0%", () => {
    // Bug: East=1.0 (meaning 1% in 0-100 scale) was displayed as "100.0%" because
    // coercePercentDisplayNumber(1.0) treated 1.0 as a 0-1 fraction.
    // Fix: dataset-max (7.9 > 1.05) disambiguates to 0-100 scale.
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "North", value: 7.9 },
        { name: "South", value: 5.2 },
        { name: "West", value: 3.5 },
        { name: "East", value: 1.0 },
      ],
      {
        chartTitle: "Defect Rate by Region",
        presentationKind: "bar",
      }
    );
    const lowest = chips.find((c) => c.key === "lowest");
    expect(lowest?.text).toBe("Lowest: East (1.0%)");
    expect(lowest?.text).not.toContain("100.0%");

    const top = chips.find((c) => c.key === "top");
    expect(top?.text).toBe("Top: North (7.9%)");
  });

  it("fraction-scale rate chips continue to format correctly (no regression)", () => {
    // Fraction-scale values (0-1): max 0.041 ≤ 1.05 → multiply by 100 → correct %.
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Prime", value: 0.031 },
        { name: "Near Prime", value: 0.038 },
        { name: "Subprime", value: 0.041 },
      ],
      {
        chartTitle: "Delinquency Rate by Segment",
        presentationKind: "bar",
      }
    );
    const top = chips.find((c) => c.key === "top");
    expect(top?.text).toBe("Top: Subprime (4.1%)");
    const lowest = chips.find((c) => c.key === "lowest");
    expect(lowest?.text).toBe("Lowest: Prime (3.1%)");
  });

  it("uses executive scatter chip labels", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "340,000 / 82,000", value: 82000, x: 340000 },
        { name: "90,000 / 18,000", value: 18000, x: 90000 },
      ],
      {
        chartTitle: "Revenue vs Profit",
        presentationKind: "scatter",
        isScatterChart: true,
        xMetricLabel: "Revenue",
        yMetricLabel: "Profit",
      }
    );
    expect(chips[0]?.text).toMatch(/^Highest Profit: Revenue .+, Profit .+/);
    expect(chips[1]?.text).toMatch(/^Lowest Profit: Revenue .+, Profit .+/);
    expect(chips[2]?.text).toMatch(/^Profit Spread: /);
    expect(chips[3]?.text).toMatch(/^Relationship: /);
    expect(chips[0]?.text).not.toContain("340,000 / 82,000");
  });

  it("uses Top / Lowest / Gap for binary categorical bar charts", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "N", value: 420_000 },
        { name: "Y", value: 95_000 },
      ],
      {
        chartTitle: "Monthly Payment by Default Flag",
        presentationKind: "bar",
        isTrendChart: true,
      }
    );
    expect(chips[0]?.text).toMatch(/^Top: /);
    expect(chips[1]?.text).toMatch(/^Lowest: /);
    expect(chips[2]?.text).toMatch(/^Gap: /);
    expect(chips[0]?.text).not.toMatch(/^Start /);
    expect(chips[1]?.text).not.toMatch(/^Latest /);
    expect(chips[2]?.text).not.toMatch(/^Change:/);
  });

  it("keeps Start / Latest / Change for real line time trends", () => {
    const chips = formatOverviewMiniInsightChips(trendRows, {
      chartTitle: "Monthly Revenue Trend",
      presentationKind: "line",
    });
    expect(chips[0]?.text).toMatch(/^Start Month:/);
    expect(chips[1]?.text).toMatch(/^Latest Month:/);
    expect(chips[2]?.text).toMatch(/^Change: /);
  });

  it("keeps Top / Lowest / Gap for non-binary categorical bar charts", () => {
    const chips = formatOverviewMiniInsightChips(
      [
        { name: "Delhi", value: 100 },
        { name: "Mumbai", value: 50 },
        { name: "Chennai", value: 75 },
      ],
      {
        chartTitle: "Monthly Revenue by City",
        presentationKind: "bar",
        isTrendChart: true,
      }
    );
    expect(chips[0]?.text).toMatch(/^Top: /);
    expect(chips[1]?.text).toMatch(/^Lowest: /);
    expect(chips[2]?.text).toMatch(/^Gap: /);
  });
});

describe("shouldUseTrendPeriodInsightChips", () => {
  it("detects binary categorical labels", () => {
    expect(isBinaryCategoricalComparisonLabels(["Y", "N"])).toBe(true);
    expect(isBinaryCategoricalComparisonLabels(["Yes", "No"])).toBe(true);
    expect(isBinaryCategoricalComparisonLabels(["Delhi", "Mumbai"])).toBe(false);
  });

  it("requires temporal axis labels for bar trend chips", () => {
    expect(
      shouldUseTrendPeriodInsightChips(
        [
          { name: "N", value: 1 },
          { name: "Y", value: 2 },
        ],
        { presentationKind: "bar", isTrendChart: true }
      )
    ).toBe(false);
    expect(
      shouldUseTrendPeriodInsightChips(
        [
          { name: "2025-01", value: 1 },
          { name: "2025-02", value: 2 },
        ],
        { presentationKind: "bar", isTrendChart: true }
      )
    ).toBe(true);
    expect(
      shouldUseTrendPeriodInsightChips(trendRows, {
        presentationKind: "line",
      })
    ).toBe(true);
  });
});
