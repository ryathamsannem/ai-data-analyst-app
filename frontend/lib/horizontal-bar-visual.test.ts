import { describe, expect, it } from "vitest";
import { resolveOverviewBarValueDomain } from "@/lib/overview-bar-value-domain";
import {
  HBAR_VBAR_PARITY_FIXTURE,
  HORIZONTAL_BAR_END_RADIUS,
  HORIZONTAL_BAR_MAX_SIZE,
  HORIZONTAL_BAR_STACKED_MAX_SIZE,
  HORIZONTAL_BAR_STACKED_RADIUS,
  OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE,
  OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE,
  OVERVIEW_VBAR_MAX_BAR_SIZE,
  estimateHorizontalBarBandFillRatio,
  estimateHorizontalBarLengthUtilization,
  resolveHorizontalBarCategoryGap,
  resolveHorizontalBarGap,
  resolveHorizontalBarMaxSize,
  resolveOverviewHBarMaxSizeForCategoryCount,
  resolveOverviewHorizontalBarMaxSize,
} from "@/lib/horizontal-bar-visual";

describe("horizontal bar visual constants", () => {
  it("uses asymmetric all-corner radius aligned with the V-Bar finish", () => {
    expect(HORIZONTAL_BAR_END_RADIUS).toEqual([4, 6, 6, 4]);
    expect(HORIZONTAL_BAR_STACKED_RADIUS).toEqual([0, 5, 5, 0]);
    expect(HORIZONTAL_BAR_END_RADIUS[1]).toBeLessThan(8);
    expect(HORIZONTAL_BAR_END_RADIUS[0]).toBeGreaterThan(0);
    expect(HORIZONTAL_BAR_END_RADIUS[0]).toBeLessThan(
      HORIZONTAL_BAR_END_RADIUS[1]
    );
  });

  it("targets V-Bar band fill — H-Bar maxSize approaches V-Bar cap", () => {
    expect(OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE / OVERVIEW_VBAR_MAX_BAR_SIZE).toBeGreaterThanOrEqual(
      0.9
    );
    expect(HORIZONTAL_BAR_MAX_SIZE.default).toBeGreaterThanOrEqual(40);
    expect(HORIZONTAL_BAR_MAX_SIZE.compact).toBeGreaterThanOrEqual(32);
    expect(HORIZONTAL_BAR_STACKED_MAX_SIZE.default).toBeLessThan(
      HORIZONTAL_BAR_MAX_SIZE.default
    );
  });

  it("matches V-Bar sparse category-band rhythm instead of Recharts defaults", () => {
    expect(resolveHorizontalBarCategoryGap({ categoryCount: 4 })).toBe("16%");
    expect(resolveHorizontalBarCategoryGap({ categoryCount: 6 })).toBe("16%");
    expect(resolveHorizontalBarCategoryGap({ categoryCount: 7 })).toBe("16%");
    expect(resolveHorizontalBarCategoryGap({ categoryCount: 8 })).toBe("16%");
    expect(resolveHorizontalBarCategoryGap({ categoryCount: 9 })).toBeUndefined();

    expect(
      resolveHorizontalBarCategoryGap({ categoryCount: 8, detailLayout: true })
    ).toBe("10%");
    expect(
      resolveHorizontalBarCategoryGap({ categoryCount: 11, detailLayout: true })
    ).toBeUndefined();
  });

  it("uses the V-Bar detail intra-band gap only where grouped H-Bars need it", () => {
    expect(resolveHorizontalBarGap({ categoryCount: 4 })).toBeUndefined();
    expect(resolveHorizontalBarGap({ categoryCount: 4, detailLayout: true })).toBe(4);
    expect(resolveHorizontalBarGap({ categoryCount: 7, detailLayout: true })).toBeUndefined();
  });
});

describe("H-Bar/V-Bar visual parity policy", () => {
  const plotInnerHeightPx = 305;
  const fiveCategoryGap = resolveHorizontalBarCategoryGap({ categoryCount: 5 });

  it("controlled 5-category fixture uses zero baseline for V-Bar and H-Bar", () => {
    const vDomain = resolveOverviewBarValueDomain(HBAR_VBAR_PARITY_FIXTURE, {
      chartTitle: "Quantity by Department",
      metricLabel: "Quantity",
      presentationKind: "bar",
    });
    const hDomain = resolveOverviewBarValueDomain(HBAR_VBAR_PARITY_FIXTURE, {
      chartTitle: "Quantity by Department",
      metricLabel: "Quantity",
      presentationKind: "bar_horizontal",
    });
    expect(vDomain![0]).toBe(0);
    expect(hDomain![0]).toBe(0);
    expect(vDomain).toEqual(hDomain);
  });

  it("Overview inline and export share the same H-Bar maxSize resolver", () => {
    expect(
      resolveOverviewHorizontalBarMaxSize({ pngCapture: false, categoryCount: 5 })
    ).toBe(OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE);
    expect(
      resolveOverviewHorizontalBarMaxSize({ pngCapture: true, categoryCount: 5 })
    ).toBe(OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE);
    expect(resolveOverviewHBarMaxSizeForCategoryCount(7)).toBe(42);
    expect(resolveOverviewHBarMaxSizeForCategoryCount(9)).toBe(36);
  });

  it("ChartRenderer session path uses centralized maxSize bands", () => {
    expect(
      resolveHorizontalBarMaxSize({ compact: true, detailLayout: false })
    ).toBe(HORIZONTAL_BAR_MAX_SIZE.compact);
    expect(
      resolveHorizontalBarMaxSize({ compact: false, detailLayout: true })
    ).toBe(HORIZONTAL_BAR_MAX_SIZE.detail);
    expect(resolveHorizontalBarMaxSize({})).toBe(HORIZONTAL_BAR_MAX_SIZE.default);
  });

  it("5-category charts use deterministic 16% category gap", () => {
    expect(fiveCategoryGap).toBe("16%");
  });

  it("H-Bar band fill approaches V-Bar on the same plot height", () => {
    const hFill = estimateHorizontalBarBandFillRatio({
      plotInnerHeightPx,
      categoryCount: 5,
      maxBarSize: OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE,
      categoryGap: fiveCategoryGap,
    });
    const vFill = Math.min(1, OVERVIEW_VBAR_MAX_BAR_SIZE / (plotInnerHeightPx / 5 / 0.84));
    expect(hFill).toBeGreaterThan(0.75);
    expect(hFill).toBeGreaterThanOrEqual(vFill * 0.85);
  });

  it("7-category H-Bar thins bands and keeps V-Bar gap rhythm", () => {
    const plotInnerHeightPx = 366;
    const sevenGap = resolveHorizontalBarCategoryGap({ categoryCount: 7 });
    expect(sevenGap).toBe("16%");
    const hFill = estimateHorizontalBarBandFillRatio({
      plotInnerHeightPx,
      categoryCount: 7,
      maxBarSize: resolveOverviewHBarMaxSizeForCategoryCount(7),
      categoryGap: sevenGap,
    });
    const overcrowded = estimateHorizontalBarBandFillRatio({
      plotInnerHeightPx,
      categoryCount: 7,
      maxBarSize: 48,
      categoryGap: undefined,
    });
    expect(hFill).toBeLessThan(1);
    expect(hFill).toBeGreaterThan(0.82);
    expect(hFill).toBeLessThan(overcrowded);
  });

  it("bar-length utilization helper reflects domain headroom", () => {
    expect(
      estimateHorizontalBarLengthUtilization({ maxValue: 1258, domainMax: 1333 })
    ).toBeGreaterThan(0.94);
    expect(
      estimateHorizontalBarLengthUtilization({
        maxValue: 183_916_971,
        domainMax: 183_916_971 / 0.85,
      })
    ).toBeCloseTo(0.85, 2);
  });
});
