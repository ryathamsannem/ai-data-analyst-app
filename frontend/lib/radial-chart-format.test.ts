import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  buildRadialExportLegendEntries,
  buildRadialLegendPayload,
  formatRadialLegendEntry,
  formatRadialSliceTotalLabel,
  formatRadialTooltipValue,
  formatRadialVisibleLegendLines,
  orderRadialShareDisplayRows,
  radialRawValuesSumTo100Percent,
  radialSharePercent,
  radialSharePercentSum,
  radialShouldFormatValuesAsPercent,
  radialShouldUseSharePercentDisplay,
  radialSliceStableColorIndex,
  resolveRadialPieEdgeProps,
  resolveRadialSharePercentDecimals,
  resolveRadialSliceFill,
  sortRadialDisplayRows,
  truncateRadialLegendLine,
  RADIAL_LEGEND_SEP,
} from "@/lib/radial-chart-format";
import { PIE_COLORS, RADIAL_SMALL_COUNT_COLORS } from "@/lib/chart-palette";
import { formatOverviewMiniInsightChips } from "@/lib/overview-dash-chart-insights";

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

describe("formatRadialLegendEntry", () => {
  const retailRows: ChartRow[] = [
    { name: "Electronics", value: 4_270_000 },
    { name: "Furniture", value: 1_320_000 },
    { name: "Clothing", value: 1_140_000 },
    { name: "Home & Kitchen", value: 1_120_000 },
  ];

  it("formats category · percent · compact value for share donuts", () => {
    const line = formatRadialLegendEntry(retailRows, "Electronics");
    expect(line).toContain("Electronics");
    expect(line).toContain(RADIAL_LEGEND_SEP);
    expect(line).toMatch(/54(\.\d)?%/);
    expect(line).toMatch(/4\.3M|4\.27M/i);
  });

  it("includes percent and value for each slice label", () => {
    for (const row of retailRows) {
      const line = formatRadialLegendEntry(retailRows, String(row.name));
      expect(line).toContain(String(row.name));
      expect(line).toMatch(/\d+%/);
      expect(line.split(RADIAL_LEGEND_SEP).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("formats downtime minutes share without percent on raw contribution", () => {
    const downtimeRows: ChartRow[] = [
      { name: "Critical", value: 2367 },
      { name: "High", value: 3224 },
      { name: "Low", value: 1050 },
      { name: "Medium", value: 3045 },
    ];
    const ctx = {
      metricLabel: "Severity Downtime Minutes Share",
      chartTitle: "Severity Downtime Minutes Share",
      presentationKind: "donut" as const,
      chartRows: downtimeRows,
    };
    const line = formatRadialLegendEntry(downtimeRows, "High", ctx);
    expect(line).toContain("High");
    expect(line).toMatch(/33%/);
    expect(line).toMatch(/3,224 min/);
    expect(line).not.toMatch(/3,224\.0%/);
  });
});

describe("formatRadialSliceTotalLabel", () => {
  it("appends minute unit for downtime composition totals", () => {
    const rows: ChartRow[] = [
      { name: "Critical", value: 2367 },
      { name: "High", value: 3224 },
      { name: "Low", value: 1050 },
      { name: "Medium", value: 3045 },
    ];
    const ctx = {
      metricLabel: "Severity Downtime Minutes Share",
      chartTitle: "Severity Downtime Minutes Share",
      presentationKind: "donut" as const,
      chartRows: rows,
    };
    expect(formatRadialSliceTotalLabel(rows, ctx)).toBe("9,686 min");
  });
});

describe("sortRadialDisplayRows", () => {
  /** Region Profit Share — unsorted API order from audit example. */
  const regionProfitShareRows: ChartRow[] = [
    { name: "East", value: 50_600 },
    { name: "North", value: 57_900 },
    { name: "South", value: 54_000 },
    { name: "West", value: 52_900 },
  ];
  const regionProfitCtx = {
    metricLabel: "Profit",
    chartTitle: "Region Profit Share",
    presentationKind: "donut" as const,
    chartRows: regionProfitShareRows,
  };

  it("sorts share rows high-to-low by value", () => {
    const sorted = sortRadialDisplayRows(regionProfitShareRows);
    expect(sorted.map((r) => r.name)).toEqual(["North", "South", "West", "East"]);
  });

  it("orders legend lines high-to-low for Region Profit Share", () => {
    const sorted = orderRadialShareDisplayRows(regionProfitShareRows);
    const legendLines = formatRadialVisibleLegendLines(
      sorted,
      regionProfitShareRows,
      regionProfitCtx
    );
    expect(legendLines[0]).toMatch(/^North · 26\.9%/);
    expect(legendLines[1]).toMatch(/^South · 25\.1%/);
    expect(legendLines[2]).toMatch(/^West · 24\.6%/);
    expect(legendLines[3]).toMatch(/^East · 23\.5%/);
    expect(legendLines.map((line) => line.split(RADIAL_LEGEND_SEP)[0])).toEqual([
      "North",
      "South",
      "West",
      "East",
    ]);
  });

  it("builds Recharts legend payload in display order with stable colors", () => {
    const sorted = orderRadialShareDisplayRows(regionProfitShareRows);
    const payload = buildRadialLegendPayload(sorted, regionProfitShareRows);
    expect(payload.map((item) => item.value)).toEqual([
      "North",
      "South",
      "West",
      "East",
    ]);
    expect(payload[0]?.color).toBe(RADIAL_SMALL_COUNT_COLORS[1]);
    expect(payload[3]?.color).toBe(RADIAL_SMALL_COUNT_COLORS[0]);
  });

  it("qualifies Region Profit Share as a share donut for sorting", () => {
    expect(radialShouldUseSharePercentDisplay(regionProfitShareRows)).toBe(true);
  });

  it("breaks equal-value ties by category label ascending", () => {
    const rows: ChartRow[] = [
      { name: "West", value: 25 },
      { name: "Alpha", value: 25 },
      { name: "Beta", value: 25 },
    ];
    expect(sortRadialDisplayRows(rows).map((r) => r.name)).toEqual([
      "Alpha",
      "Beta",
      "West",
    ]);
  });

  it("preserves source order for non-share radial metrics", () => {
    const rateRows: ChartRow[] = [
      { name: "A", value: 45 },
      { name: "B", value: 52 },
      { name: "C", value: 38 },
    ];
    expect(radialShouldUseSharePercentDisplay(rateRows)).toBe(false);
    expect(orderRadialShareDisplayRows(rateRows).map((r) => r.name)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("keeps largest/smallest/total insight chips correct after sorting", () => {
    const chips = formatOverviewMiniInsightChips(regionProfitShareRows, {
      chartTitle: "Region Profit Share",
      presentationKind: "donut",
    });
    expect(chips.find((c) => c.key === "top")?.text).toMatch(
      /^Largest: North · 26\.9% · 57\.9K$/
    );
    expect(chips.find((c) => c.key === "lowest")?.text).toMatch(
      /^Smallest: East · 23\.5% · 50\.6K$/
    );
    expect(chips.find((c) => c.key === "gap")?.text).toBe("Total: 215.4K");
  });

  it("maps slice colors to pre-sort category index", () => {
    expect(radialSliceStableColorIndex(regionProfitShareRows, "East")).toBe(0);
    expect(radialSliceStableColorIndex(regionProfitShareRows, "North")).toBe(1);
    expect(radialSliceStableColorIndex(regionProfitShareRows, "South")).toBe(2);
    expect(radialSliceStableColorIndex(regionProfitShareRows, "West")).toBe(3);
  });
});

describe("resolveRadialPieEdgeProps", () => {
  it("uses soft padding and corner radius for overview mini donuts", () => {
    expect(resolveRadialPieEdgeProps({ kind: "donut", overviewMiniRadial: true })).toEqual({
      paddingAngle: 3,
      cornerRadius: 4,
    });
  });

  it("uses modest edges for session donuts without overview polish", () => {
    expect(resolveRadialPieEdgeProps({ kind: "donut", overviewMiniRadial: false })).toEqual({
      paddingAngle: 2,
      cornerRadius: 3,
    });
  });

  it("skips corner radius on pie charts", () => {
    expect(resolveRadialPieEdgeProps({ kind: "pie" }).cornerRadius).toBe(0);
  });
});

describe("truncateRadialLegendLine", () => {
  it("preserves share and value tail when category name is long", () => {
    const line = `Enterprise Subscription Analytics${RADIAL_LEGEND_SEP}27%${RADIAL_LEGEND_SEP}57.9K`;
    const truncated = truncateRadialLegendLine(line, 28);
    expect(truncated).toMatch(/27% · 57\.9K$/);
    expect(truncated.length).toBeLessThanOrEqual(28);
    expect(truncated).toContain("…");
  });

  it("leaves short lines unchanged", () => {
    const line = `North${RADIAL_LEGEND_SEP}27%${RADIAL_LEGEND_SEP}57.9K`;
    expect(truncateRadialLegendLine(line, 40)).toBe(line);
  });
});

describe("resolveRadialSharePercentDecimals", () => {
  const regionProfitShareRows: ChartRow[] = [
    { name: "East", value: 50_600 },
    { name: "North", value: 57_900 },
    { name: "South", value: 54_000 },
    { name: "West", value: 52_900 },
  ];

  it("uses 1 decimal when rounded integers would collide", () => {
    const total = 215_400;
    expect(resolveRadialSharePercentDecimals(regionProfitShareRows, total)).toBe(1);
  });

  it("keeps 0 decimals when shares are clearly distinct", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 60_000 },
      { name: "B", value: 30_000 },
      { name: "C", value: 10_000 },
    ];
    expect(resolveRadialSharePercentDecimals(rows, 100_000)).toBe(0);
    expect(formatRadialLegendEntry(rows, "A")).toMatch(/60%/);
  });
});

describe("resolveRadialSliceFill", () => {
  it("uses small-count palette for 2–4 slices with stable category index", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 10 },
      { name: "B", value: 20 },
    ];
    expect(resolveRadialSliceFill(rows, "A")).toBe(RADIAL_SMALL_COUNT_COLORS[0]);
    expect(resolveRadialSliceFill(rows, "B")).toBe(RADIAL_SMALL_COUNT_COLORS[1]);
  });

  it("uses full palette for 5+ slices", () => {
    const rows: ChartRow[] = Array.from({ length: 5 }, (_, i) => ({
      name: `Cat${i}`,
      value: 10 + i,
    }));
    expect(resolveRadialSliceFill(rows, "Cat0")).toBe(PIE_COLORS[0]);
  });
});

describe("buildRadialExportLegendEntries", () => {
  it("matches live legend order and formatting for export composite", () => {
    const rows: ChartRow[] = [
      { name: "East", value: 50_600 },
      { name: "North", value: 57_900 },
      { name: "South", value: 54_000 },
      { name: "West", value: 52_900 },
    ];
    const display = orderRadialShareDisplayRows(rows);
    const ctx = {
      metricLabel: "Profit",
      chartTitle: "Region Profit Share",
      presentationKind: "donut" as const,
      chartRows: rows,
    };
    const entries = buildRadialExportLegendEntries(display, rows, ctx);
    expect(entries.map((e) => e.label.split(RADIAL_LEGEND_SEP)[0])).toEqual([
      "North",
      "South",
      "West",
      "East",
    ]);
    expect(entries[0]?.label).toMatch(/26\.9%/);
    expect(entries[0]?.color).toBe(RADIAL_SMALL_COUNT_COLORS[1]);
  });
});

describe("formatRadialTooltipValue", () => {
  it("shows value plus computed share for contribution data", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40000, displayValue: "$40,000" },
      { name: "B", value: 60000, displayValue: "$60,000" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 40000);
    expect(text).toContain("A");
    expect(text).toContain("40%");
    expect(text).toMatch(/\$40,000|40,000|40K/i);
  });

  it("shows raw values without computed share when rates exceed 100%", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 45, displayValue: "45.0%" },
      { name: "B", value: 52, displayValue: "52.0%" },
      { name: "C", value: 38, displayValue: "38.0%" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 45);
    expect(text).toMatch(/^A · 45/);
    expect(text).not.toContain("(33.");
  });

  it("shows normalized share for values that already sum to 100%", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40, displayValue: "40%" },
      { name: "B", value: 60, displayValue: "60%" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 40);
    expect(text).toBe("A · 40%");
  });
});
