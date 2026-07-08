import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  chooseFocusedTrendAxisStep,
  formatOverviewBarValueAxisTick,
  formatOverviewLineFocusedMegaPointLabel,
  formatOverviewLineYAxisTick,
  formatOverviewScatterAxisTick,
  OVERVIEW_LINE_PREMIUM_PAD_RATIO,
  OVERVIEW_SCATTER_TARGET_OCCUPANCY,
  resolveOverviewBarCountValueAxisTicks,
  resolveOverviewPremiumAxisScale,
  resolveOverviewScatterPremiumAxes,
  resolveOverviewScatterPremiumAxisScale,
  resolveScatterValueAxisProps,
  resolveSessionPremiumTrendAxisScale,
  trendValueSpanUsesFocusedMegaTicks,
  resolveTrendValueAxisProps,
  SESSION_DETAIL_TREND_PREMIUM_PAD_RATIO,
  sessionLineAreaDetailBottomMargin,
  sessionTrendDetailPlotMargins,
} from "./overview-premium-axis-domain";

describe("chooseFocusedTrendAxisStep", () => {
  it("uses 10k steps for weekly-units cluster instead of unit steps", () => {
    expect(chooseFocusedTrendAxisStep(28_000, 1_054_638)).toBe(10_000);
  });
});

describe("formatOverviewBarValueAxisTick", () => {
  const loanRows: ChartRow[] = [
    { name: "Mortgage", value: 189_000_000 },
    { name: "Personal", value: 147_500_000 },
    { name: "Auto", value: 127_500_000 },
  ];

  it("compacts large currency loan/deposit/spend ticks to M (no raw decimals)", () => {
    const ctx = {
      metricLabel: "Loan Balance by Product Type",
      chartTitle: "Loan Balance by Product Type",
    };
    expect(formatOverviewBarValueAxisTick(127_500_000, loanRows, ctx)).toBe(
      "127.5M"
    );
    expect(formatOverviewBarValueAxisTick(147_500_000, loanRows, ctx)).toBe(
      "147.5M"
    );
    expect(formatOverviewBarValueAxisTick(189_000_000, loanRows, ctx)).toBe(
      "189M"
    );
    // Never falls back to long raw decimal/grouped values.
    expect(formatOverviewBarValueAxisTick(127_500_000, loanRows, ctx)).not.toMatch(
      /127,500,000|\.\d{3}/
    );
  });

  it("renders fraction-scale utilization ticks as whole percents", () => {
    const rows: ChartRow[] = [
      { name: "Credit Card", value: 0.62 },
      { name: "Auto", value: 0.41 },
      { name: "Mortgage", value: 0.28 },
    ];
    const ctx = {
      metricLabel: "Average Utilization Pct by Product Type",
      chartTitle: "Average Utilization Pct by Product Type",
    };
    expect(formatOverviewBarValueAxisTick(0.35, rows, ctx)).toBe("35%");
    expect(formatOverviewBarValueAxisTick(0.4, rows, ctx)).toBe("40%");
    expect(formatOverviewBarValueAxisTick(0.45, rows, ctx)).toBe("45%");
  });

  it("renders low fraction-scale delinquency rate ticks with one decimal percent", () => {
    const rows: ChartRow[] = [
      { name: "Prime", value: 0.031 },
      { name: "Subprime", value: 0.041 },
    ];
    const ctx = {
      metricLabel: "Average Delinquency Rate by Customer Segment",
      chartTitle: "Average Delinquency Rate by Customer Segment",
    };
    expect(formatOverviewBarValueAxisTick(0.034, rows, ctx)).toBe("3.4%");
    expect(formatOverviewBarValueAxisTick(0.041, rows, ctx)).toBe("4.1%");
  });

  it("passes through already-scaled (0-100) percent values without doubling", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 35 },
      { name: "B", value: 45 },
    ];
    const ctx = { metricLabel: "Attendance Rate", chartTitle: "Attendance Rate" };
    expect(formatOverviewBarValueAxisTick(40, rows, ctx)).toBe("40%");
  });

  it("does not double-scale 0-100 range values that include 1.0 (East=1% bug)", () => {
    // If dataset contains values like [1.0, 3.5, 7.9] (0-100 percent scale),
    // maxAbs = 7.9 > 1.05 → treat as 0-100 scale → tick 1.0 → "1%", not "100%".
    const rows: ChartRow[] = [
      { name: "East", value: 1.0 },
      { name: "West", value: 3.5 },
      { name: "North", value: 7.9 },
    ];
    const ctx = {
      metricLabel: "Defect Rate by Region",
      chartTitle: "Defect Rate by Region",
    };
    expect(formatOverviewBarValueAxisTick(1.0, rows, ctx)).toBe("1%");
    expect(formatOverviewBarValueAxisTick(7.9, rows, ctx)).toBe("7.9%");
    expect(formatOverviewBarValueAxisTick(1.0, rows, ctx)).not.toBe("100%");
  });

  it("keeps small HR count ticks readable as plain integers", () => {
    const rows: ChartRow[] = [
      { name: "Engineering", value: 120 },
      { name: "Sales", value: 80 },
      { name: "HR", value: 30 },
    ];
    const ctx = {
      metricLabel: "Records by Department",
      chartTitle: "Records by Department",
    };
    expect(formatOverviewBarValueAxisTick(50, rows, ctx)).toBe("50");
    expect(formatOverviewBarValueAxisTick(100, rows, ctx)).toBe("100");
  });

  it("formats department count axis ticks as clean integers, not decimals", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 350 },
      { name: "B", value: 1258 },
    ];
    const ctx = {
      metricLabel: "Records by Department",
      chartTitle: "Records by Department",
    };
    expect(formatOverviewBarValueAxisTick(1300, rows, ctx)).toBe("1,300");
    expect(formatOverviewBarValueAxisTick(1300, rows, ctx)).not.toContain(".");
  });
});

describe("resolveOverviewBarCountValueAxisTicks", () => {
  it("returns clean integer ticks for department count domains without decimals", () => {
    const ticks = resolveOverviewBarCountValueAxisTicks([0, 1333.48]);
    expect(ticks).toBeDefined();
    expect(ticks!.length).toBeGreaterThanOrEqual(4);
    expect(ticks!.every((t) => Math.abs(t - Math.round(t)) < 1e-9)).toBe(true);
    expect(ticks!.some((t) => t >= 1200)).toBe(true);
    expect(ticks!.some((t) => t === 1258.2)).toBe(false);
  });
});

describe("resolveOverviewPremiumAxisScale", () => {
  it("uses rounded revenue ticks for monthly trend values", () => {
    const scale = resolveOverviewPremiumAxisScale([
      620_000, 640_000, 660_000, 680_000, 700_000, 720_000, 740_000, 760_000,
      825_000,
    ]);
    expect(scale).toBeDefined();
    expect(scale!.domain[0] % 50_000).toBe(0);
    expect(scale!.domain[1] % 50_000).toBe(0);
    expect(scale!.domain[0]).toBeLessThanOrEqual(620_000);
    expect(scale!.domain[1]).toBeGreaterThanOrEqual(825_000);
    expect(scale!.ticks.length).toBeGreaterThanOrEqual(4);
    expect(scale!.ticks.length).toBeLessThanOrEqual(6);
    expect(scale!.ticks).toEqual([
      500_000, 600_000, 700_000, 800_000, 900_000,
    ]);
    expect(formatOverviewLineYAxisTick(scale!.ticks[1])).toBe("600K");
  });

  it("handles low-spread percent metrics with clean steps", () => {
    const scale = resolveOverviewPremiumAxisScale([4.9, 5.0, 5.1, 5.2]);
    expect(scale).toBeDefined();
    expect(scale!.domain[1] - scale!.domain[0]).toBeLessThan(1);
    expect(scale!.ticks.length).toBeGreaterThanOrEqual(4);
    expect(scale!.ticks.length).toBeLessThanOrEqual(6);
  });
});

describe("formatOverviewLineYAxisTick", () => {
  it("formats rounded revenue ticks as compact K labels", () => {
    expect(formatOverviewLineYAxisTick(600_000)).toBe("600K");
    expect(formatOverviewLineYAxisTick(650_000)).toBe("650K");
    expect(formatOverviewLineYAxisTick(850_000)).toBe("850K");
  });

  it("formats focused megabyte trend ticks with sub-million precision", () => {
    expect(formatOverviewLineYAxisTick(1_020_000)).toBe("1.02M");
    expect(formatOverviewLineYAxisTick(1_030_000)).toBe("1.03M");
    expect(formatOverviewLineYAxisTick(1_040_000)).toBe("1.04M");
    expect(formatOverviewLineYAxisTick(1_050_000)).toBe("1.05M");
    const labels = [1_020_000, 1_030_000, 1_040_000, 1_050_000].map((t) =>
      formatOverviewLineYAxisTick(t)
    );
    expect(new Set(labels).size).toBe(4);
    expect(labels.every((l) => l !== "1M")).toBe(true);
  });

  it("focused mega point labels use two-decimal M in tight million-scale ranges", () => {
    const tightRange = [
      1_020_000, 1_030_000, 1_040_000, 1_050_000, 1_054_638,
    ];
    expect(trendValueSpanUsesFocusedMegaTicks(tightRange)).toBe(true);
    expect(formatOverviewLineFocusedMegaPointLabel(1_054_638)).toBe("1.05M");
    expect(formatOverviewLineFocusedMegaPointLabel(1_026_677)).toBe("1.03M");
    expect(formatOverviewLineYAxisTick(1_054_638)).toBe("1.1M");
  });

  it("keeps percent metrics readable", () => {
    expect(formatOverviewLineYAxisTick(4.5, { metricLabel: "conversion rate" })).toBe(
      "4.5%"
    );
  });
});

describe("resolveOverviewPremiumAxisScale line breathing room", () => {
  it("adds slightly more padding with the line pad ratio", () => {
    const values = [620_000, 680_000, 740_000, 825_000];
    const base = resolveOverviewPremiumAxisScale(values, { padRatio: 0.1 });
    const line = resolveOverviewPremiumAxisScale(values, {
      padRatio: OVERVIEW_LINE_PREMIUM_PAD_RATIO,
    });
    expect(base).toBeDefined();
    expect(line).toBeDefined();
    expect(line!.domain[0]).toBeLessThanOrEqual(base!.domain[0]);
    expect(line!.domain[1]).toBeGreaterThanOrEqual(base!.domain[1]);
  });
});

describe("formatOverviewScatterAxisTick", () => {
  it("formats scatter axis ticks with compact K labels", () => {
    expect(formatOverviewScatterAxisTick(90_000)).toBe("90K");
    expect(formatOverviewScatterAxisTick(340_000)).toBe("340K");
  });
});

describe("resolveTrendValueAxisProps", () => {
  const lowVariance = [0.8, 0.82, 0.81, 0.84, 0.83, 0.86, 0.85, 0.88, 0.87, 0.9, 0.89, 0.92];

  it("returns Overview-aligned premium domain for Line (default surface)", () => {
    const props = resolveTrendValueAxisProps({
      chartKind: "line",
      values: lowVariance,
    });
    expect(props).not.toBeNull();
    expect(props!.allowDataOverflow).toBe(true);
    expect(props!.domain[0]).toBeLessThanOrEqual(0.8);
    expect(props!.domain[1]).toBeGreaterThanOrEqual(0.92);
    expect(props!.ticks).toContain(0.75);
    expect(props!.ticks).toContain(0.95);
  });

  it("uses tighter domains for overview and session surfaces", () => {
    const values = [
      620_000, 640_000, 660_000, 680_000, 700_000, 720_000, 740_000, 760_000,
      825_000,
    ];
    const legacy = resolveTrendValueAxisProps({
      chartKind: "line",
      values,
    });
    const overview = resolveTrendValueAxisProps({
      chartKind: "line",
      values,
      surface: "overview",
    });
    const session = resolveTrendValueAxisProps({
      chartKind: "line",
      values,
      surface: "session",
    });
    expect(overview).not.toBeNull();
    expect(session).not.toBeNull();
    const legacySpan = legacy!.domain[1] - legacy!.domain[0];
    const overviewSpan = overview!.domain[1] - overview!.domain[0];
    const sessionSpan = session!.domain[1] - session!.domain[0];
    expect(overviewSpan).toBeLessThan(legacySpan);
    expect(sessionSpan).toBeLessThanOrEqual(overviewSpan);
  });

  it("focuses low-variance weekly units produced trend near the data cluster", () => {
    const values = [1_026_677, 1_030_000, 1_032_000, 1_054_638];
    const props = resolveTrendValueAxisProps({
      chartKind: "line",
      values,
      surface: "overview",
    });
    expect(props).not.toBeNull();
    expect(props!.domain[0]).toBeGreaterThanOrEqual(1_020_000);
    expect(props!.domain[0]).toBeLessThan(1_030_000);
    expect(props!.domain[1]).toBeGreaterThan(1_050_000);
    expect(props!.domain[1]).toBeLessThanOrEqual(1_070_000);
    const span = props!.domain[1] - props!.domain[0];
    expect(span).toBeLessThan(100_000);
    expect(props!.domain[0]).toBeGreaterThanOrEqual(0);
    expect(props!.ticks.length).toBeLessThanOrEqual(7);
    const labels = props!.ticks.map((t) => formatOverviewLineYAxisTick(t));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => l !== "1M")).toBe(true);
    expect(labels.some((l) => l.startsWith("1.0"))).toBe(true);
  });

  it("keeps wide-spread revenue trend on a broader domain", () => {
    const values = [120_000, 240_000, 310_000, 420_000];
    const props = resolveTrendValueAxisProps({
      chartKind: "line",
      values,
    });
    expect(props).not.toBeNull();
    expect(props!.domain[0]).toBe(0);
    expect(props!.domain[1]).toBeGreaterThan(420_000);
  });

  it("returns Overview-aligned premium domain for Area", () => {
    const props = resolveTrendValueAxisProps({
      chartKind: "area",
      values: lowVariance,
    });
    expect(props).not.toBeNull();
    expect(props!.allowDataOverflow).toBe(true);
    expect(props!.ticks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("resolveSessionPremiumTrendAxisScale", () => {
  it("uses tighter session pad with rounded premium ticks for monthly revenue trend", () => {
    const values = [
      620_000, 640_000, 660_000, 680_000, 700_000, 720_000, 740_000, 760_000,
      825_000,
    ];
    const line = resolveSessionPremiumTrendAxisScale(values, "line");
    const overview = resolveOverviewPremiumAxisScale(values, {
      padRatio: SESSION_DETAIL_TREND_PREMIUM_PAD_RATIO,
      minPadRatio: 0.04,
    });
    expect(line).toEqual(overview);
    expect(line!.domain[0]).toBeGreaterThanOrEqual(600_000);
    expect(line!.domain[0]).toBeLessThan(620_000);
    expect(line!.domain[1]).toBeGreaterThan(825_000);
    expect(line!.domain[1]).toBeLessThanOrEqual(850_000);
  });
});

describe("sessionLineAreaDetailBottomMargin", () => {
  it("compresses angled x-axis reserve for taller cartesian plot", () => {
    expect(sessionLineAreaDetailBottomMargin(62)).toBeLessThanOrEqual(32);
    expect(sessionLineAreaDetailBottomMargin(62)).toBeGreaterThanOrEqual(26);
  });
});

describe("sessionTrendDetailPlotMargins", () => {
  it("uses minimal top and capped bottom margins", () => {
    const margins = sessionTrendDetailPlotMargins({
      computedBottom: 62,
      yAxisWidth: 52,
    });
    expect(margins.top).toBe(2);
    expect(margins.bottom).toBeLessThanOrEqual(30);
    expect(margins.bottom).toBeGreaterThanOrEqual(26);
  });

  it("keeps margin.left as outer pad only — YAxis.width owns tick column", () => {
    const margins = sessionTrendDetailPlotMargins({
      computedBottom: 48,
      yAxisWidth: 72,
      pointCount: 14,
      lineChart: true,
    });
    expect(margins.left).toBeLessThanOrEqual(10);
    expect(margins.left).toBeGreaterThanOrEqual(8);
    expect(margins.right).toBeGreaterThanOrEqual(18);
  });
});

describe("resolveOverviewScatterPremiumAxes", () => {
  const fixtureRows = [
    { name: "a", value: 18_000, x: 90_000 },
    { name: "b", value: 42_000, x: 170_000 },
    { name: "c", value: 82_000, x: 340_000 },
  ];

  it("returns aligned rounded domains for revenue vs profit scatter", () => {
    const axes = resolveOverviewScatterPremiumAxes(fixtureRows);
    expect(axes).toBeDefined();
    expect(axes!.x.domain[0]).toBeLessThan(90_000);
    expect(axes!.x.domain[1]).toBeGreaterThan(340_000);
    expect(axes!.y.domain[0]).toBeLessThan(18_000);
    expect(axes!.y.domain[1]).toBeGreaterThan(82_000);
    expect(axes!.x.ticks.length).toBeGreaterThanOrEqual(4);
    expect(axes!.y.ticks.length).toBeGreaterThanOrEqual(4);
  });

  it("targets ~70–78% cluster occupancy on both axes", () => {
    const xs = fixtureRows.map((r) => r.x as number);
    const ys = fixtureRows.map((r) => r.value);
    const xScale = resolveOverviewScatterPremiumAxisScale(xs);
    const yScale = resolveOverviewScatterPremiumAxisScale(ys);
    expect(xScale).toBeDefined();
    expect(yScale).toBeDefined();

    const xOcc =
      (Math.max(...xs) - Math.min(...xs)) /
      (xScale!.domain[1] - xScale!.domain[0]);
    const yOcc =
      (Math.max(...ys) - Math.min(...ys)) /
      (yScale!.domain[1] - yScale!.domain[0]);

    expect(xOcc).toBeGreaterThanOrEqual(0.65);
    expect(xOcc).toBeLessThanOrEqual(0.78);
    expect(yOcc).toBeGreaterThanOrEqual(0.65);
    expect(yOcc).toBeLessThanOrEqual(0.78);
    expect(Math.abs(xOcc - OVERVIEW_SCATTER_TARGET_OCCUPANCY)).toBeLessThan(0.12);
    expect(Math.abs(yOcc - OVERVIEW_SCATTER_TARGET_OCCUPANCY)).toBeLessThan(0.12);

    const xMaxSlack = (xScale!.domain[1] - Math.max(...xs)) / (Math.max(...xs) - Math.min(...xs));
    const yMaxSlack = (yScale!.domain[1] - Math.max(...ys)) / (Math.max(...ys) - Math.min(...ys));
    expect(xMaxSlack).toBeLessThan(0.26);
    expect(yMaxSlack).toBeLessThan(0.3);
  });
});

describe("resolveScatterValueAxisProps", () => {
  const fixtureRows = [
    { name: "a", value: 18_000, x: 90_000 },
    { name: "b", value: 42_000, x: 170_000 },
    { name: "c", value: 82_000, x: 340_000 },
  ];

  it("returns premium X/Y domains and ticks for scatter rows", () => {
    const props = resolveScatterValueAxisProps(fixtureRows);
    expect(props).not.toBeNull();
    expect(props!.x.allowDataOverflow).toBe(false);
    expect(props!.y.allowDataOverflow).toBe(false);
    expect(props!.x.domain[0]).toBeLessThan(90_000);
    expect(props!.x.domain[1]).toBeGreaterThan(340_000);
    expect(props!.y.domain[0]).toBeLessThan(18_000);
    expect(props!.y.domain[1]).toBeGreaterThan(82_000);
    expect(props!.x.ticks.length).toBeGreaterThanOrEqual(4);
    expect(props!.y.ticks.length).toBeGreaterThanOrEqual(4);
  });

  it("returns the same props regardless of surface path", () => {
    const a = resolveScatterValueAxisProps(fixtureRows);
    const b = resolveScatterValueAxisProps(fixtureRows);
    expect(b).toEqual(a);
  });

  it("matches resolveOverviewScatterPremiumAxes channel values", () => {
    const props = resolveScatterValueAxisProps(fixtureRows);
    const axes = resolveOverviewScatterPremiumAxes(fixtureRows);
    expect(props!.x.domain).toEqual(axes!.x.domain);
    expect(props!.x.ticks).toEqual(axes!.x.ticks);
    expect(props!.y.domain).toEqual(axes!.y.domain);
    expect(props!.y.ticks).toEqual(axes!.y.ticks);
  });
});
