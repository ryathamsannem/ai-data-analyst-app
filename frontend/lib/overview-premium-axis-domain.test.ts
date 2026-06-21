import { describe, expect, it } from "vitest";
import {
  formatOverviewLineYAxisTick,
  formatOverviewScatterAxisTick,
  OVERVIEW_LINE_PREMIUM_PAD_RATIO,
  OVERVIEW_SCATTER_TARGET_OCCUPANCY,
  resolveOverviewPremiumAxisScale,
  resolveOverviewScatterPremiumAxes,
  resolveOverviewScatterPremiumAxisScale,
  resolveScatterValueAxisProps,
  resolveSessionPremiumTrendAxisScale,
  resolveTrendValueAxisProps,
  SESSION_DETAIL_TREND_PREMIUM_PAD_RATIO,
  sessionLineAreaDetailBottomMargin,
  sessionTrendDetailPlotMargins,
} from "./overview-premium-axis-domain";

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
