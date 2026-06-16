import { describe, expect, it } from "vitest";
import {
  formatOverviewLineYAxisTick,
  formatOverviewScatterAxisTick,
  OVERVIEW_LINE_PREMIUM_PAD_RATIO,
  OVERVIEW_SCATTER_TARGET_OCCUPANCY,
  resolveOverviewPremiumAxisScale,
  resolveOverviewScatterPremiumAxes,
  resolveOverviewScatterPremiumAxisScale,
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

  it("targets ~65–75% cluster occupancy on both axes", () => {
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
    expect(yMaxSlack).toBeLessThan(0.22);
  });
});
