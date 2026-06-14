import { describe, expect, it } from "vitest";
import {
  inferBoundedMetricBounds,
  inferDomainTickStep,
  isLowVarianceOnBoundedScale,
  resolveOverviewBarValueDomain,
  shouldUseTightBarDomain,
  snapBarDomainBound,
  zeroBaselineImprovesInterpretation,
} from "@/lib/overview-bar-value-domain";

describe("shouldUseTightBarDomain", () => {
  it("detects low-spread percent metrics", () => {
    expect(
      shouldUseTightBarDomain({
        isPercent: true,
        spanDisplay: 0.3,
        spreadRatio: 0.06,
        categoryCount: 5,
        minDisplay: 4.9,
        maxDisplay: 5.2,
      })
    ).toBe(true);
  });

  it("detects flat category breakdowns", () => {
    expect(
      shouldUseTightBarDomain({
        isPercent: false,
        spanDisplay: 2,
        spreadRatio: 0.02,
        categoryCount: 4,
        minDisplay: 82,
        maxDisplay: 84,
      })
    ).toBe(true);
  });

  it("detects bounded 0-5 satisfaction scores", () => {
    const bounds = { min: 0, max: 5, kind: "rating5" as const };
    expect(
      shouldUseTightBarDomain({
        isPercent: false,
        spanDisplay: 0.03,
        spreadRatio: 0.007,
        categoryCount: 5,
        minDisplay: 4.05,
        maxDisplay: 4.08,
        boundedBounds: bounds,
      })
    ).toBe(true);
    expect(isLowVarianceOnBoundedScale(0.03, bounds, 5)).toBe(true);
  });
});

describe("inferBoundedMetricBounds", () => {
  it("infers 0-5 bounds for satisfaction scores", () => {
    expect(
      inferBoundedMetricBounds({
        values: [4.05, 4.05, 4.07, 4.08, 4.08],
        metricLabel: "Satisfaction Score",
        chartTitle: "Satisfaction Score by Campaign",
        isPercent: false,
      })
    ).toEqual({ min: 0, max: 5, kind: "rating5" });
  });

  it("excludes loan balance metrics", () => {
    expect(
      inferBoundedMetricBounds({
        values: [12_400, 18_200, 21_000],
        metricLabel: "Loan Balance",
        chartTitle: "Loan Balance by Product Type",
        isPercent: false,
      })
    ).toBeNull();
  });

  it("infers percent bounds for utilization", () => {
    expect(
      inferBoundedMetricBounds({
        values: [42.1, 43.5, 44.0],
        metricLabel: "Credit Utilization",
        chartTitle: "Credit Utilization by Region",
        isPercent: true,
      })
    ).toEqual({ min: 0, max: 100, kind: "percent100" });
  });
});

describe("snapBarDomainBound", () => {
  it("avoids floating-point label artifacts", () => {
    expect(snapBarDomainBound(4.049999999, 0.01, "floor")).toBe(4.04);
    expect(snapBarDomainBound(4.089999999, 0.01, "ceil")).toBe(4.09);
  });

  it("uses sensible tick steps for small spans", () => {
    expect(inferDomainTickStep(0.03, 5)).toBe(0.01);
    expect(inferDomainTickStep(0.3, 100)).toBe(0.1);
  });
});

describe("zeroBaselineImprovesInterpretation", () => {
  it("returns false for clustered percent metrics", () => {
    expect(
      zeroBaselineImprovesInterpretation({
        isPercent: true,
        minDisplay: 4.9,
        maxDisplay: 5.2,
        spreadRatio: 0.06,
      })
    ).toBe(false);
  });

  it("returns false for clustered bounded satisfaction scores", () => {
    expect(
      zeroBaselineImprovesInterpretation({
        isPercent: false,
        minDisplay: 4.05,
        maxDisplay: 4.08,
        spreadRatio: 0.007,
        boundedBounds: { min: 0, max: 5, kind: "rating5" },
      })
    ).toBe(false);
  });

  it("returns true when values start near zero", () => {
    expect(
      zeroBaselineImprovesInterpretation({
        isPercent: false,
        minDisplay: 12,
        maxDisplay: 240,
        spreadRatio: 0.95,
      })
    ).toBe(true);
  });
});

describe("resolveOverviewBarValueDomain", () => {
  const satisfactionRows = [
    { value: 4.05 },
    { value: 4.05 },
    { value: 4.07 },
    { value: 4.08 },
    { value: 4.08 },
  ];
  const satisfactionOpts = {
    chartTitle: "Satisfaction Score by Campaign",
    metricLabel: "Satisfaction Score",
  };

  it("uses a tight domain for low-spread conversion rates", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 5.2 },
        { value: 5.2 },
        { value: 5.1 },
        { value: 5.0 },
        { value: 4.9 },
      ],
      { chartTitle: "Conversion Rate by Campaign", metricLabel: "Conversion Rate" }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBeGreaterThan(4.5);
    expect(domain![1]).toBeLessThan(5.6);
    expect(domain![1] - domain![0]).toBeLessThan(2);
  });

  it("uses zero baseline for wide-spread revenue bars", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 120_000 },
        { value: 240_000 },
        { value: 310_000 },
      ],
      { chartTitle: "Revenue by Region", metricLabel: "Revenue" }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(310_000);
  });

  it("tightens satisfaction score breakdowns with tiny spread", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 82.1 },
        { value: 82.4 },
        { value: 82.8 },
        { value: 83.0 },
      ],
      {
        chartTitle: "Satisfaction Score by Country",
        metricLabel: "Satisfaction Score",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBeGreaterThan(80);
    expect(domain![1]).toBeLessThan(85);
  });

  it("tightens 0-5 satisfaction scores for live and PNG paths", () => {
    const live = resolveOverviewBarValueDomain(satisfactionRows, satisfactionOpts);
    const png = resolveOverviewBarValueDomain(satisfactionRows, {
      ...satisfactionOpts,
      executiveRounding: true,
    });

    expect(live).toBeDefined();
    expect(png).toBeDefined();
    expect(live![0]).toBeGreaterThanOrEqual(4.04);
    expect(live![1]).toBeLessThanOrEqual(4.09);
    expect(png![0]).toBeGreaterThanOrEqual(4.04);
    expect(png![1]).toBeLessThanOrEqual(4.09);
    expect(png![1] - png![0]).toBeLessThan(0.1);
    expect(png![0]).not.toBe(0);
    expect(png![1]).not.toBe(5);
  });

  it("keeps loan balance on a wide monetary domain", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 12_400 },
        { value: 18_200 },
        { value: 21_000 },
      ],
      {
        chartTitle: "Loan Balance by Product Type",
        metricLabel: "Loan Balance",
        executiveRounding: true,
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(21_000);
  });

  it("tightens low-variance percent utilization with clean ticks", () => {
    const domain = resolveOverviewBarValueDomain(
      [{ value: 42.1 }, { value: 42.4 }, { value: 42.8 }],
      {
        chartTitle: "Credit Utilization by Region",
        metricLabel: "Credit Utilization",
        executiveRounding: true,
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBeGreaterThan(41.5);
    expect(domain![1]).toBeLessThan(43.5);
    expect(String(domain![0])).not.toMatch(/9999/);
    expect(String(domain![1])).not.toMatch(/9999/);
  });

  it("handles fraction-stored percent values", () => {
    const domain = resolveOverviewBarValueDomain(
      [{ value: 0.052 }, { value: 0.051 }, { value: 0.049 }],
      { chartTitle: "CTR by Channel", metricLabel: "CTR" }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBeGreaterThan(0.045);
    expect(domain![1]).toBeLessThan(0.056);
  });
});
