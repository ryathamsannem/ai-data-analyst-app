import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  formatRadialTooltipValue,
  radialRawValuesSumTo100Percent,
  radialSharePercent,
  radialSharePercentSum,
  radialShouldFormatValuesAsPercent,
  radialShouldUseSharePercentDisplay,
} from "@/lib/radial-chart-format";

describe("radialSharePercent", () => {
  it("computes share_pct = value / total * 100", () => {
    expect(radialSharePercent(40, 100)).toBe(40);
    expect(radialSharePercent(25000, 100000)).toBe(25);
  });

  it("sums computed shares to ~100%", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40000 },
      { name: "B", value: 35000 },
      { name: "C", value: 25000 },
    ];
    expect(radialSharePercentSum(rows)).toBeCloseTo(100, 5);
  });
});

describe("radialRawValuesSumTo100Percent", () => {
  it("detects pre-normalized percentage points", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40 },
      { name: "B", value: 35 },
      { name: "C", value: 25 },
    ];
    expect(radialRawValuesSumTo100Percent(rows)).toBe(true);
    expect(radialShouldFormatValuesAsPercent(rows)).toBe(true);
  });

  it("detects fractions summing to 1", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 0.4 },
      { name: "B", value: 0.35 },
      { name: "C", value: 0.25 },
    ];
    expect(radialRawValuesSumTo100Percent(rows)).toBe(true);
  });
});

describe("radialShouldUseSharePercentDisplay", () => {
  it("allows computed shares for contribution magnitudes", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40000 },
      { name: "B", value: 60000 },
    ];
    expect(radialShouldUseSharePercentDisplay(rows)).toBe(true);
    expect(radialShouldFormatValuesAsPercent(rows)).toBe(false);
  });

  it("rejects rate metrics whose raw values exceed 100% total", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 45 },
      { name: "B", value: 52 },
      { name: "C", value: 38 },
    ];
    expect(radialShouldUseSharePercentDisplay(rows)).toBe(false);
    expect(radialRawValuesSumTo100Percent(rows)).toBe(false);
  });
});

describe("formatRadialTooltipValue", () => {
  it("shows value plus computed share for contribution data", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40000, displayValue: "$40,000" },
      { name: "B", value: 60000, displayValue: "$60,000" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 40000);
    expect(text).toBe("$40,000 (40.0%)");
  });

  it("shows raw values without share when rates exceed 100%", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 45, displayValue: "45.0%" },
      { name: "B", value: 52, displayValue: "52.0%" },
      { name: "C", value: 38, displayValue: "38.0%" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 45);
    expect(text).toBe("45.0%");
    expect(text).not.toContain("(33.");
  });

  it("shows normalized share for values that already sum to 100%", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40, displayValue: "40%" },
      { name: "B", value: 60, displayValue: "60%" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 40);
    expect(text).toBe("40.0%");
  });
});
