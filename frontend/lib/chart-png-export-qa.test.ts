import { describe, expect, it } from "vitest";
import {
  measurePlotWidthUtilization,
  validatePngExportPresentationConstants,
  validatePlotWidthUtilization,
} from "@/lib/chart-png-export-qa";
import {
  barValueLabelOverlapRisk,
  shouldShowOverviewBarValueLabels,
  shouldShowPngBarEndValueLabels,
} from "@/lib/overview-dashboard-export";

describe("chart PNG export QA", () => {
  it("passes presentation constant gates", () => {
    const result = validatePngExportPresentationConstants();
    expect(result.ok).toBe(true);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it("flags plot utilization below 85%", () => {
    const low = validatePlotWidthUtilization(0.72);
    expect(low.ok).toBe(false);
    const ok = validatePlotWidthUtilization(
      measurePlotWidthUtilization({ plotWidthPx: 880, cardInnerWidthPx: 1000 })
    );
    expect(ok.ok).toBe(true);
  });
});

describe("shouldShowPngBarEndValueLabels", () => {
  it("enables end labels for tight categorical counts", () => {
    expect(
      shouldShowPngBarEndValueLabels([
        { value: 23 },
        { value: 20 },
        { value: 17 },
      ])
    ).toBe(true);
  });

  it("skips end labels for wide value spreads", () => {
    expect(
      shouldShowPngBarEndValueLabels([
        { value: 371199 },
        { value: 241530 },
      ])
    ).toBe(false);
  });
});

describe("shouldShowOverviewBarValueLabels", () => {
  const fmt = (v: number) => String(v);

  it("hides labels when there are too many categories for overlap safety", () => {
    expect(
      shouldShowOverviewBarValueLabels(
        Array.from({ length: 9 }, (_, i) => ({ value: 4.05 + i * 0.01 })),
        fmt
      )
    ).toBe(false);
  });

  it("allows labels for five close percent values when metric is rate-like", () => {
    expect(
      shouldShowOverviewBarValueLabels(
        [
          { value: 4.08 },
          { value: 4.08 },
          { value: 4.07 },
          { value: 4.05 },
          { value: 4.05 },
        ],
        (v) => `${v}%`,
        { metricCtx: { metricLabel: "Defect Rate", chartTitle: "Defect Rate by Shift" } }
      )
    ).toBe(true);
  });

  it("enables labels for fraction-scale defect rate by shift (session/PNG parity)", () => {
    const rows = [
      { value: 0.023 },
      { value: 0.025 },
      { value: 0.025 },
    ];
    const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;
    expect(
      shouldShowOverviewBarValueLabels(rows, fmt, {
        metricCtx: {
          metricLabel: "Defect Rate",
          chartTitle: "Defect Rate by Shift",
        },
      })
    ).toBe(true);
  });

  it("hides labels for long currency strings even with three categories", () => {
    const currency = (v: number) =>
      v.toLocaleString(undefined, { style: "currency", currency: "USD" });
    expect(
      shouldShowOverviewBarValueLabels(
        [
          { value: 183_916_971 },
          { value: 150_000_000 },
          { value: 132_661_579 },
        ],
        currency
      )
    ).toBe(false);
  });

  it("allows labels for three compact values with similar bar lengths", () => {
    expect(
      shouldShowOverviewBarValueLabels(
        [{ value: 23 }, { value: 22 }, { value: 21 }],
        fmt
      )
    ).toBe(true);
  });

  it("renders defect rate fractions as percent labels", () => {
    const rows = [
      { value: 0.025 },
      { value: 0.025 },
      { value: 0.023 },
    ];
    const pctFmt = (v: number) =>
      v <= 1 ? `${(v * 100).toFixed(1)}%` : `${v}%`;
    expect(
      shouldShowOverviewBarValueLabels(rows, pctFmt, {
        metricCtx: { metricLabel: "Defect Rate", chartTitle: "Defect Rate by Shift" },
      })
    ).toBe(true);
  });
});

describe("barValueLabelOverlapRisk", () => {
  it("flags short bars relative to the longest bar", () => {
    expect(
      barValueLabelOverlapRisk([183_916_971, 132_661_579], (v) => `$${v}`)
    ).toBe(true);
  });

  it("passes for three evenly sized compact labels", () => {
    expect(barValueLabelOverlapRisk([23, 22, 21], (v) => String(v))).toBe(
      false
    );
  });
});
