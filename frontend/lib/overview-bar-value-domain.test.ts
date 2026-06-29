import { describe, expect, it } from "vitest";
import {
  inferBoundedMetricBounds,
  inferDomainTickStep,
  isLowVarianceOnBoundedScale,
  OVERVIEW_HBAR_TARGET_MAX_UTILIZATION,
  resolveBarChartRateDisplayCap,
  resolveBarChartRateUpperBound,
  resolveFocusedRateBarValueAxisTicks,
  resolveOverviewBarValueDomain,
  shouldUseFocusedVerticalBarRateDomain,
  resolveOverviewHBarUtilizationDomainMax,
  shouldUseTightBarDomain,
  snapBarDomainBound,
  zeroBaselineImprovesInterpretation,
} from "@/lib/overview-bar-value-domain";
import { formatOverviewBarValueAxisTick } from "@/lib/overview-premium-axis-domain";
import { estimateHorizontalBarLengthUtilization } from "@/lib/horizontal-bar-visual";
import {
  metricFormatUsesPercent,
  resolveMetricValueFormat,
} from "@/lib/metric-value-format";
import type { ChartRow } from "@/app/chart-types";

describe("shouldUseFocusedVerticalBarRateDomain", () => {
  it("returns true for clustered defect rate by shift", () => {
    expect(
      shouldUseFocusedVerticalBarRateDomain({
        presentationKind: "bar",
        isPercent: true,
        isScoreOrRatingLike: false,
        hasBoundedRatingScale: false,
        tight: true,
        spanDisplay: 0.2,
        minDisplay: 2.3,
        maxDisplay: 2.5,
        categoryCount: 3,
        spreadRatio: 0.08,
      })
    ).toBe(true);
  });

  it("detects defect rate metric as percent for domain resolver", () => {
    expect(
      metricFormatUsesPercent({
        metricLabel: "Defect Rate",
        chartTitle: "Defect Rate by Shift",
        presentationKind: "bar",
        chartRows: [
          { name: "Night", value: 0.023 },
          { name: "Day", value: 0.025 },
          { name: "Swing", value: 0.025 },
        ],
      })
    ).toBe(true);
  });
});

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

describe("resolveBarChartRateDisplayCap", () => {
  it("caps low single-digit rates near 5%", () => {
    expect(resolveBarChartRateDisplayCap(4.1)).toBe(5);
    expect(resolveBarChartRateDisplayCap(3.4)).toBe(5);
  });

  it("avoids doubling mid single-digit rates", () => {
    expect(resolveBarChartRateDisplayCap(7.9)).toBe(9.5);
  });

  it("keeps mid-range utilization headroom modest", () => {
    expect(resolveBarChartRateDisplayCap(44)).toBe(47);
  });
});

describe("resolveBarChartRateUpperBound", () => {
  it("maps fraction-scale caps back to raw axis values", () => {
    expect(
      resolveBarChartRateUpperBound({ maxDisplay: 4.1, maxRaw: 0.041 })
    ).toBe(0.05);
  });

  it("preserves 0-100 scale values without fraction conversion", () => {
    expect(
      resolveBarChartRateUpperBound({ maxDisplay: 44, maxRaw: 44 })
    ).toBe(47);
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

  it("handles fraction-stored percent values (no presentationKind — legacy tight domain)", () => {
    const domain = resolveOverviewBarValueDomain(
      [{ value: 0.052 }, { value: 0.051 }, { value: 0.049 }],
      { chartTitle: "CTR by Channel", metricLabel: "CTR" }
    );
    expect(domain).toBeDefined();
    // Without presentationKind the bar-chart zero-baseline override does not fire.
    expect(domain![0]).toBeGreaterThan(0.045);
    expect(domain![1]).toBeLessThan(0.056);
  });

  it("H-Bar percent/rate charts use zero baseline (not truncated domain)", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 0.056 },
        { value: 0.062 },
        { value: 0.071 },
        { value: 0.079 },
      ],
      {
        chartTitle: "Conversion Rate Pct by Product Category",
        metricLabel: "Conversion Rate Pct",
        presentationKind: "bar_horizontal",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(0.079);
    expect(domain![1]).toBeLessThanOrEqual(0.105);
  });

  it("V-Bar percent/rate charts use the same zero baseline as H-Bar", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 0.056 },
        { value: 0.062 },
        { value: 0.071 },
        { value: 0.079 },
      ],
      {
        chartTitle: "Conversion Rate Pct by Channel",
        metricLabel: "Conversion Rate Pct",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(0.079);
    expect(domain![1]).toBeLessThanOrEqual(0.105);
  });

  it("high-floor rate bar chart still uses zero baseline (per uniform bar policy)", () => {
    // Customer retention 85–95%: not score-like, bar length encodes the absolute rate.
    // Zero baseline is correct — a tight domain starting at 85% misrepresents bar length.
    const domain = resolveOverviewBarValueDomain(
      [{ value: 85 }, { value: 88 }, { value: 91 }, { value: 95 }],
      {
        chartTitle: "Retention Rate by Segment",
        metricLabel: "Retention Rate",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(95);
  });

  it("bounded satisfaction scores keep tight domain — score/rating-like exemption", () => {
    // Satisfaction Score 4.05–4.08: score-like → exempt from zero-baseline override.
    const domain = resolveOverviewBarValueDomain(
      [{ value: 4.05 }, { value: 4.06 }, { value: 4.07 }, { value: 4.08 }],
      {
        chartTitle: "Satisfaction Score by Campaign",
        metricLabel: "Satisfaction Score",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBeGreaterThan(4.0);
    expect(domain![1]).toBeLessThan(4.15);
    expect(domain![0]).not.toBe(0);
  });

  it("profit/currency V-Bar uses zero baseline regardless of spread width", () => {
    // Profit by Department: narrow spread 205K–215K would previously trigger tight domain.
    // With bar-chart policy: domainMin forced to 0 (Revenue is currency, not score-like).
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 205_126 },
        { value: 210_000 },
        { value: 212_500 },
        { value: 215_087 },
      ],
      {
        chartTitle: "Profit by Department",
        metricLabel: "Profit",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(215_087);
  });

  it("profit/currency H-Bar also uses zero baseline", () => {
    // Same data rendered as horizontal bar.
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 205_126 },
        { value: 210_000 },
        { value: 215_087 },
      ],
      {
        chartTitle: "Profit by Department",
        metricLabel: "Profit",
        presentationKind: "bar_horizontal",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(215_087);
  });

  it("revenue/sales bars with wide spread also start at zero", () => {
    // Wide-spread revenue already returned zero via ZBI; confirm it still does.
    const domain = resolveOverviewBarValueDomain(
      [{ value: 120_000 }, { value: 240_000 }, { value: 312_087 }],
      {
        chartTitle: "Revenue by Region",
        metricLabel: "Revenue",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(312_087);
  });

  it("percent/utilization H-Bar 35.7–44.0 starts at zero with reasonable upper bound", () => {
    // Fraction-stored: 0.357–0.440.
    const domain = resolveOverviewBarValueDomain(
      [{ value: 0.357 }, { value: 0.390 }, { value: 0.415 }, { value: 0.440 }],
      {
        chartTitle: "Credit Utilization by Product Type",
        metricLabel: "Utilization Rate",
        presentationKind: "bar_horizontal",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(0.44);
    expect(domain![1]).toBeLessThanOrEqual(0.48);
  });

  it("V-Bar delinquency 3.4%–4.1% starts at 0 with upper bound ~5%, not ~9%", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 0.034 },
        { value: 0.038 },
        { value: 0.041 },
      ],
      {
        chartTitle: "Delinquency Rate by Customer Segment",
        metricLabel: "Delinquency Rate",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeLessThanOrEqual(0.055);
    expect(domain![1]).toBeGreaterThanOrEqual(0.05);
    expect(domain![1]).toBeLessThan(0.07);
  });

  it("H-Bar delinquency 3.4%–4.1% matches V-Bar upper-bound policy", () => {
    const rows = [
      { value: 0.034 },
      { value: 0.038 },
      { value: 0.041 },
    ];
    const vBar = resolveOverviewBarValueDomain(rows, {
      chartTitle: "Delinquency Rate by Customer Segment",
      metricLabel: "Delinquency Rate",
      presentationKind: "bar",
    });
    const hBar = resolveOverviewBarValueDomain(rows, {
      chartTitle: "Delinquency Rate by Customer Segment",
      metricLabel: "Delinquency Rate",
      presentationKind: "bar_horizontal",
    });
    expect(vBar).toEqual(hBar);
    expect(vBar![0]).toBe(0);
    expect(vBar![1]).toBeLessThanOrEqual(0.055);
  });

  it("V-Bar defect rate by shift uses focused domain for clustered low rates", () => {
    const rows: ChartRow[] = [
      { name: "Night", value: 0.023 },
      { name: "Day", value: 0.025 },
      { name: "Swing", value: 0.025 },
    ];
    const metricCtx = {
      chartTitle: "Defect Rate by Shift",
      metricLabel: "Defect Rate",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    expect(resolveMetricValueFormat(metricCtx)).toBe("percent");
    const domain = resolveOverviewBarValueDomain(rows, {
      chartTitle: "Defect Rate by Shift",
      metricLabel: "Defect Rate",
      presentationKind: "bar",
    });
    expect(domain).toBeDefined();
    expect(domain![0]).toBeGreaterThan(0.02);
    expect(domain![0]).toBeLessThan(0.025);
    expect(domain![1]).toBeGreaterThan(0.025);
    expect(domain![1]).toBeLessThan(0.03);
    expect(domain![1] - domain![0]).toBeLessThan(0.01);
    const ticks = resolveFocusedRateBarValueAxisTicks(
      domain!,
      0.025,
      2.5
    );
    expect(ticks?.length).toBeGreaterThanOrEqual(3);
  });

  it("focused defect-rate ticks format to unique percent labels", () => {
    const rows: ChartRow[] = [
      { name: "Night", value: 0.023 },
      { name: "Day", value: 0.025 },
      { name: "Swing", value: 0.025 },
    ];
    const metricCtx = {
      chartTitle: "Defect Rate by Shift",
      metricLabel: "Defect Rate",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const domain = resolveOverviewBarValueDomain(rows, {
      chartTitle: "Defect Rate by Shift",
      metricLabel: "Defect Rate",
      presentationKind: "bar",
    });
    const ticks = resolveFocusedRateBarValueAxisTicks(domain!, 0.025, 2.5);
    expect(ticks).toBeDefined();
    const labels = ticks!.map((t) =>
      formatOverviewBarValueAxisTick(t, rows, metricCtx)
    );
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((l) => l.includes("2.3"))).toBe(true);
    expect(labels.some((l) => l.includes("2.5"))).toBe(true);
  });

  it("conversion rate 5.6%–7.9% starts at 0 with reasonable upper bound", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 0.056 },
        { value: 0.062 },
        { value: 0.071 },
        { value: 0.079 },
      ],
      {
        chartTitle: "Conversion Rate Pct by Product Category",
        metricLabel: "Conversion Rate Pct",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(0.079);
    expect(domain![1]).toBeLessThanOrEqual(0.105);
  });

  it("percent/rate V-Bar 1.0–10.0 (0-100 scale) starts at zero", () => {
    const domain = resolveOverviewBarValueDomain(
      [{ value: 1.0 }, { value: 3.5 }, { value: 7.9 }, { value: 10.0 }],
      {
        chartTitle: "Defect Rate by Region",
        metricLabel: "Defect Rate",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(10.0);
  });

  it("PNG/export delinquency domain keeps zero baseline and ~5% cap after executive rounding", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { value: 0.034 },
        { value: 0.038 },
        { value: 0.041 },
      ],
      {
        chartTitle: "Delinquency Rate by Customer Segment",
        metricLabel: "Delinquency Rate",
        presentationKind: "bar",
        executiveRounding: true,
      }
    );
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeLessThanOrEqual(0.055);
    expect(domain![1]).toBeGreaterThanOrEqual(0.05);
  });

  it("negative/positive profit delta still includes zero (minRaw < 0 guard)", () => {
    // Delta/variance bars: values span negative to positive — the fix does not fire
    // because minRaw < 0; domain must already include zero by other paths.
    const domain = resolveOverviewBarValueDomain(
      [{ value: -12_000 }, { value: 5_000 }, { value: 18_000 }],
      {
        chartTitle: "Profit Delta by Region",
        metricLabel: "Profit Delta",
        presentationKind: "bar",
      }
    );
    expect(domain).toBeDefined();
    expect(domain![0]).toBeLessThan(0);
    expect(domain![1]).toBeGreaterThan(18_000);
  });
});

/** Controlled 5-category fixture — V-Bar and H-Bar must share zero baseline. */
const controlledBarFixture = [
  { name: "A", value: 100 },
  { name: "B", value: 80 },
  { name: "C", value: 60 },
  { name: "D", value: 40 },
  { name: "E", value: 20 },
];

describe("bar domain parity across surfaces", () => {
  const profitRows = [
    { name: "Engineering", value: 205_126 },
    { name: "Sales", value: 210_000 },
    { name: "Marketing", value: 215_087 },
  ];
  const utilizationRows = [
    { name: "Credit Card", value: 0.357 },
    { name: "Auto", value: 0.390 },
    { name: "Mortgage", value: 0.415 },
    { name: "Personal", value: 0.440 },
  ];

  it("Overview live V-Bar profit domain starts at 0", () => {
    const domain = resolveOverviewBarValueDomain(profitRows, {
      chartTitle: "Profit by Department",
      metricLabel: "Profit",
      presentationKind: "bar",
      executiveRounding: false,
    });
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(215_087);
  });

  it("Overview live H-Bar utilization domain starts at 0", () => {
    const domain = resolveOverviewBarValueDomain(utilizationRows, {
      chartTitle: "Credit Utilization by Product Type",
      metricLabel: "Utilization Rate",
      presentationKind: "bar_horizontal",
      executiveRounding: false,
    });
    expect(domain![0]).toBe(0);
    expect(domain![1]).toBeGreaterThan(0.44);
  });

  it("controlled fixture: V-Bar and H-Bar both start at 0 with comparable span", () => {
    const vDomain = resolveOverviewBarValueDomain(controlledBarFixture, {
      chartTitle: "Quantity by Segment",
      metricLabel: "Quantity",
      presentationKind: "bar",
    });
    const hDomain = resolveOverviewBarValueDomain(controlledBarFixture, {
      chartTitle: "Quantity by Segment",
      metricLabel: "Quantity",
      presentationKind: "bar_horizontal",
    });
    expect(vDomain![0]).toBe(0);
    expect(hDomain![0]).toBe(0);
    expect(vDomain![1]).toBeGreaterThan(100);
    expect(hDomain![1]).toBeGreaterThan(100);
    // Same data → same domain bounds on both orientations.
    expect(vDomain).toEqual(hDomain);
  });

  it("percent/rate V-Bar 1.0–10.0 and H-Bar 35.7–44.0 both start at 0", () => {
    const defectDomain = resolveOverviewBarValueDomain(
      [
        { name: "East", value: 1.0 },
        { name: "West", value: 3.5 },
        { name: "North", value: 7.9 },
        { name: "South", value: 10.0 },
      ],
      {
        chartTitle: "Defect Rate by Region",
        metricLabel: "Defect Rate",
        presentationKind: "bar",
      }
    );
    const utilDomain = resolveOverviewBarValueDomain(utilizationRows, {
      chartTitle: "Credit Utilization by Product Type",
      metricLabel: "Utilization Rate",
      presentationKind: "bar_horizontal",
    });
    expect(defectDomain![0]).toBe(0);
    expect(utilDomain![0]).toBe(0);
  });

  it("score/rating metric remains tight on bar charts", () => {
    const domain = resolveOverviewBarValueDomain(
      [
        { name: "Q1", value: 4.05 },
        { name: "Q2", value: 4.06 },
        { name: "Q3", value: 4.07 },
        { name: "Q4", value: 4.08 },
      ],
      {
        chartTitle: "Satisfaction Score by Campaign",
        metricLabel: "Satisfaction Score",
        presentationKind: "bar",
      }
    );
    expect(domain![0]).toBeGreaterThan(4.0);
    expect(domain![0]).not.toBe(0);
  });
});

describe("Overview H-Bar plot-width utilization cap", () => {
  const departmentRows = [
    { name: "Engineering", value: 350 },
    { name: "Sales", value: 680 },
    { name: "HR", value: 890 },
    { name: "Ops", value: 1050 },
    { name: "Finance", value: 1180 },
    { name: "Legal", value: 1258 },
  ];

  const loanRows = [
    { name: "Mortgage", value: 183_916_971 },
    { name: "Personal Loan", value: 165_000_000 },
    { name: "Auto Loan", value: 150_000_000 },
    { name: "Credit Card", value: 132_661_579 },
  ];

  it("Overview H-Bar loan/currency targets ~85% utilization, not ×1.10", () => {
    const maxRaw = 183_916_971;
    const domain = resolveOverviewBarValueDomain(loanRows, {
      chartTitle: "Loan Balance by Product Type",
      metricLabel: "Loan Balance",
      presentationKind: "bar_horizontal",
      overviewHorizontalBarHeadroom: true,
    })!;
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(maxRaw / OVERVIEW_HBAR_TARGET_MAX_UTILIZATION);
    expect(domain[1]).toBeGreaterThan(maxRaw * 1.15);
    expect(domain[1] / 1e6).toBeCloseTo(216.37, 0);
    const util = estimateHorizontalBarLengthUtilization({
      maxValue: maxRaw,
      domainMax: domain[1],
    });
    expect(util).toBeLessThanOrEqual(0.851);
    expect(util).toBeGreaterThan(0.84);
  });

  it("Overview H-Bar count domain starts at 0 near ~85% longest-bar utilization", () => {
    const maxRaw = 1258;
    const domain = resolveOverviewBarValueDomain(departmentRows, {
      chartTitle: "Records by Department",
      metricLabel: "Records",
      presentationKind: "bar_horizontal",
      overviewHorizontalBarHeadroom: true,
    })!;
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(maxRaw / OVERVIEW_HBAR_TARGET_MAX_UTILIZATION);
    const util = estimateHorizontalBarLengthUtilization({
      maxValue: maxRaw,
      domainMax: domain[1],
    });
    expect(util).toBeLessThanOrEqual(0.851);
    expect(util).toBeGreaterThan(0.84);
  });

  it("V-Bar profit domain is unchanged by Overview H-Bar utilization cap", () => {
    const profitRows = [
      { name: "Engineering", value: 205_126 },
      { name: "Sales", value: 210_000 },
      { name: "Marketing", value: 215_087 },
    ];
    const vDomain = resolveOverviewBarValueDomain(profitRows, {
      chartTitle: "Profit by Department",
      metricLabel: "Profit",
      presentationKind: "bar",
    });
    const hDomainNoCap = resolveOverviewBarValueDomain(profitRows, {
      chartTitle: "Profit by Department",
      metricLabel: "Profit",
      presentationKind: "bar_horizontal",
    });
    expect(vDomain).toEqual(hDomainNoCap);
    expect(vDomain![0]).toBe(0);
  });

  it("bar-length utilization drops materially vs default ×1.06 padding", () => {
    const base = resolveOverviewBarValueDomain(departmentRows, {
      chartTitle: "Records by Department",
      metricLabel: "Records",
      presentationKind: "bar_horizontal",
    })!;
    const capped = resolveOverviewBarValueDomain(departmentRows, {
      chartTitle: "Records by Department",
      metricLabel: "Records",
      presentationKind: "bar_horizontal",
      overviewHorizontalBarHeadroom: true,
    })!;
    const baseUtil = estimateHorizontalBarLengthUtilization({
      maxValue: 1258,
      domainMax: base[1],
    });
    const cappedUtil = estimateHorizontalBarLengthUtilization({
      maxValue: 1258,
      domainMax: capped[1],
    });
    expect(baseUtil).toBeGreaterThan(0.93);
    expect(cappedUtil).toBeLessThanOrEqual(0.851);
    expect(cappedUtil).toBeLessThan(baseUtil - 0.05);
  });

  it("percent H-Bar utilization flag does not override rate cap policy", () => {
    const rows = [
      { name: "A", value: 0.034 },
      { name: "B", value: 0.041 },
    ];
    const base = resolveOverviewBarValueDomain(rows, {
      chartTitle: "Delinquency Rate by Customer Segment",
      metricLabel: "Delinquency Rate",
      presentationKind: "bar_horizontal",
    });
    const withCap = resolveOverviewBarValueDomain(rows, {
      chartTitle: "Delinquency Rate by Customer Segment",
      metricLabel: "Delinquency Rate",
      presentationKind: "bar_horizontal",
      overviewHorizontalBarHeadroom: true,
    });
    expect(base).toEqual(withCap);
    expect(base![0]).toBe(0);
    expect(base![1]).toBeLessThanOrEqual(0.055);
  });

  it("resolveOverviewHBarUtilizationDomainMax preserves existing higher domain", () => {
    expect(resolveOverviewHBarUtilizationDomainMax(100, 200)).toBe(200);
    expect(resolveOverviewHBarUtilizationDomainMax(100, 110)).toBeCloseTo(117.647, 2);
  });
});
