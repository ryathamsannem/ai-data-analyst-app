import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  detectOverviewExportBarOrientation,
  formatExecutiveInsightMetricValue,
  formatExecutiveInsightSpreadGap,
  formatOverviewBarTopValueLabel,
  horizontalBarValueDomain,
  roundExecutiveAxisMaximum,
  resolveOverviewEffectivePresentationKind,
  shouldShowHBarValueLabels,
  validateOverviewDashboardExportParity,
} from "./overview-dashboard-export";
import { formatOverviewBarValueAxisTick } from "./overview-premium-axis-domain";
import { formatExecutiveMetricValue, formatMetricSpreadGap } from "./metric-value-format";

describe("formatOverviewBarTopValueLabel", () => {
  const defectRows: ChartRow[] = [
    { name: "Night", value: 0.0246 },
    { name: "Day", value: 0.0253 },
    { name: "Swing", value: 0.0253 },
  ];
  const defectCtx = {
    chartTitle: "Defect Rate by Shift",
    metricLabel: "Defect Rate",
    presentationKind: "bar" as const,
    chartRows: defectRows,
  };

  it("uses extra precision when focused defect-rate values collide at 1 decimal", () => {
    const labels = defectRows.map((r) =>
      formatOverviewBarTopValueLabel(r.value, defectRows, defectCtx)
    );
    expect(labels).toEqual(["2.46%", "2.53%", "2.53%"]);
    expect(labels.filter((l) => l === "2.5%").length).toBe(0);
    expect(
      formatOverviewBarTopValueLabel(0.0246, defectRows, defectCtx)
    ).not.toBe(formatOverviewBarTopValueLabel(0.0253, defectRows, defectCtx));
    expect(formatOverviewBarValueAxisTick(0.0253, defectRows, defectCtx)).toBe(
      "2.5%"
    );
  });

  it("keeps normal percent bar labels when values are not misleadingly duplicated", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 0.35 },
      { name: "B", value: 0.4 },
      { name: "C", value: 0.45 },
    ];
    const ctx = {
      chartTitle: "Utilization by Segment",
      metricLabel: "Utilization",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const labels = rows.map((r) =>
      formatOverviewBarTopValueLabel(r.value, rows, ctx)
    );
    expect(labels).toEqual(["35%", "40%", "45%"]);
  });

  it("leaves amount/count bar top labels unchanged", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 1300 },
      { name: "B", value: 2400 },
    ];
    const ctx = {
      chartTitle: "Units by Shift",
      metricLabel: "Units",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const top = formatOverviewBarTopValueLabel(1300, rows, ctx);
    const axis = formatOverviewBarValueAxisTick(1300, rows, ctx);
    expect(top).toBe(axis);
    expect(top).toBe("1,300");
  });
});

describe("formatExecutiveInsightMetricValue", () => {
  const defectRows: ChartRow[] = [
    { name: "Night", value: 0.0252 },
    { name: "Day", value: 0.0247 },
    { name: "Swing", value: 0.0235 },
  ];
  const defectCtx = {
    chartTitle: "Defect Rate by Shift",
    metricLabel: "Defect Rate",
    presentationKind: "bar" as const,
    chartRows: defectRows,
  };

  it("matches V-Bar top label precision for focused defect-rate signal cards", () => {
    const insightLabels = defectRows.map((r) =>
      formatExecutiveInsightMetricValue(r, defectCtx)
    );
    const barLabels = defectRows.map((r) =>
      formatOverviewBarTopValueLabel(r.value, defectRows, defectCtx)
    );
    expect(insightLabels).toEqual(barLabels);
    expect(insightLabels).toEqual(["2.52%", "2.47%", "2.35%"]);
    expect(insightLabels.filter((l) => l === "2.5%").length).toBe(0);
    expect(insightLabels.filter((l) => l === "2.3%").length).toBe(0);
  });

  it("keeps normal percent bar insight formatting when values are not misleading", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 0.35 },
      { name: "B", value: 0.4 },
      { name: "C", value: 0.45 },
    ];
    const ctx = {
      chartTitle: "Utilization by Segment",
      metricLabel: "Utilization",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const labels = rows.map((r) => formatExecutiveInsightMetricValue(r, ctx));
    const executive = rows.map((r) => formatExecutiveMetricValue(r, ctx));
    expect(labels).toEqual(executive);
    expect(labels).toEqual(["35.0%", "40.0%", "45.0%"]);
  });

  it("leaves amount/count insight values unchanged", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 1300 },
      { name: "B", value: 2400 },
    ];
    const ctx = {
      chartTitle: "Units by Shift",
      metricLabel: "Units",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const insight = formatExecutiveInsightMetricValue(rows[0]!, ctx);
    const executive = formatExecutiveMetricValue(rows[0]!, ctx);
    expect(insight).toBe(executive);
    expect(insight).toBe("1,300");
  });
});

describe("formatExecutiveInsightSpreadGap", () => {
  const defectRows: ChartRow[] = [
    { name: "Night", value: 0.0252 },
    { name: "Day", value: 0.0247 },
    { name: "Swing", value: 0.0235 },
  ];
  const defectCtx = {
    chartTitle: "Defect Rate by Shift",
    metricLabel: "Defect Rate",
    presentationKind: "bar" as const,
    chartRows: defectRows,
  };

  it("formats focused defect-rate spread as 0.17 pp not 0.2 pp", () => {
    const gap = 0.0252 - 0.0235;
    expect(formatExecutiveInsightSpreadGap(gap, defectCtx)).toBe("0.17 pp");
    expect(formatMetricSpreadGap(gap, defectCtx)).toBe("0.2 pp");
  });

  it("keeps normal percent bar gap formatting when extra precision is not needed", () => {
    const rows: ChartRow[] = [
      { name: "Prime", value: 0.031 },
      { name: "Near Prime", value: 0.038 },
      { name: "Subprime", value: 0.041 },
    ];
    const ctx = {
      chartTitle: "Average Delinquency Rate by Customer Segment",
      metricLabel: "Delinquency Rate",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    const gap = 0.041 - 0.031;
    expect(formatExecutiveInsightSpreadGap(gap, ctx)).toBe("1.0 pp");
  });

  it("leaves amount/count spread gaps unchanged", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 1300 },
      { name: "B", value: 2400 },
    ];
    const ctx = {
      chartTitle: "Units by Shift",
      metricLabel: "Units",
      presentationKind: "bar" as const,
      chartRows: rows,
    };
    expect(formatExecutiveInsightSpreadGap(1100, ctx)).toBe("1,100");
  });
});

describe("resolveOverviewEffectivePresentationKind", () => {
  it("maps layout flip only when explicitly requested (legacy helper)", () => {
    expect(
      resolveOverviewEffectivePresentationKind("bar", true)
    ).toBe("bar_horizontal");
    expect(
      resolveOverviewEffectivePresentationKind("bar", false)
    ).toBe("bar");
  });

  it("keeps explicit chart kinds unchanged", () => {
    expect(
      resolveOverviewEffectivePresentationKind("area", false)
    ).toBe("area");
    expect(
      resolveOverviewEffectivePresentationKind("donut", false)
    ).toBe("donut");
    expect(
      resolveOverviewEffectivePresentationKind("scatter", false)
    ).toBe("scatter");
    expect(
      resolveOverviewEffectivePresentationKind("bar_horizontal", true)
    ).toBe("bar_horizontal");
  });
});

describe("detectOverviewExportBarOrientation", () => {
  it("reads horizontal bars from vertical grid layer", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="recharts-cartesian-grid-vertical"><line /></div>
    `;
    expect(detectOverviewExportBarOrientation(root)).toBe("horizontal");
  });

  it("reads vertical bars from horizontal grid layer", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="recharts-cartesian-grid-horizontal"><line /></div>
    `;
    expect(detectOverviewExportBarOrientation(root)).toBe("vertical");
  });
});

describe("horizontalBarValueDomain", () => {
  it("uses zero baseline for low-spread count breakdowns (bar_horizontal policy)", () => {
    const small = horizontalBarValueDomain([{ value: 23 }, { value: 17 }]);
    expect(small[0]).toBe(0);
    expect(small[1]).toBeGreaterThanOrEqual(23 / 0.85);
    const domain = horizontalBarValueDomain(
      [{ value: 122 }, { value: 108 }],
      undefined,
      {
        chartTitle: "Delivery Days by Payment Method",
        metricLabel: "Delivery Days",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(122 / 0.85);
  });

  it("keeps zero baseline when values start well below the maximum", () => {
    const domain = horizontalBarValueDomain(
      [{ value: 120_000 }, { value: 240_000 }, { value: 310_000 }],
      undefined,
      {
        chartTitle: "Revenue by Region",
        metricLabel: "Revenue",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(310_000 / 0.85);
  });

  it("signed fallback domain includes zero for all-negative values", () => {
    const domain = horizontalBarValueDomain(
      [{ value: -100_000 }, { value: -20_000 }],
      undefined,
      {
        chartTitle: "Return Amount by Product",
        metricLabel: "Return Amount",
      }
    );
    expect(domain[0]).toBeLessThan(-100_000);
    expect(domain[1]).toBeGreaterThan(0);
  });

  it("PNG/export H-Bar loan balance uses the same ~85% utilization cap", () => {
    const maxRaw = 183_916_971;
    const domain = horizontalBarValueDomain(
      [
        { name: "Mortgage", value: maxRaw },
        { name: "Credit Card", value: 132_661_579 },
      ],
      undefined,
      {
        chartTitle: "Loan Balance by Product Type",
        metricLabel: "Loan Balance",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(maxRaw / 0.85);
    expect(maxRaw / domain[1]).toBeLessThanOrEqual(0.851);
  });

  it("uses tight PNG domain for low-variance satisfaction scores", () => {
    const domain = horizontalBarValueDomain(
      [
        { value: 4.05 },
        { value: 4.05 },
        { value: 4.07 },
        { value: 4.08 },
        { value: 4.08 },
      ],
      undefined,
      {
        chartTitle: "Satisfaction Score by Campaign",
        metricLabel: "Satisfaction Score",
      }
    );
    expect(domain[0]).toBeGreaterThanOrEqual(4.04);
    expect(domain[1]).toBeLessThanOrEqual(4.09);
    expect(domain[1]).not.toBe(5);
  });

  it("handles empty or non-positive max", () => {
    expect(horizontalBarValueDomain([])).toEqual([0, 1]);
    expect(horizontalBarValueDomain([{ value: 0 }])).toEqual([0, 1]);
  });

  it("PNG/export H-Bar profit domain starts at 0", () => {
    const domain = horizontalBarValueDomain(
      [
        { value: 205_126 },
        { value: 210_000 },
        { value: 215_087 },
      ],
      undefined,
      {
        chartTitle: "Profit by Department",
        metricLabel: "Profit",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(215_087);
  });

  it("PNG/export H-Bar utilization domain starts at 0", () => {
    const domain = horizontalBarValueDomain(
      [
        { value: 0.357 },
        { value: 0.390 },
        { value: 0.415 },
        { value: 0.440 },
      ],
      undefined,
      {
        chartTitle: "Credit Utilization by Product Type",
        metricLabel: "Utilization Rate",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(0.44);
  });
});

describe("shouldShowHBarValueLabels — signed data", () => {
  it("allows labels for all-negative compact charts with few categories", () => {
    const rows = [
      { value: -100_000 },
      { value: -80_000 },
      { value: -60_000 },
      { value: -40_000 },
    ];
    const fmt = (v: number) => `${(v / 1000).toFixed(0)}K`;
    expect(shouldShowHBarValueLabels(rows, fmt)).toBe(true);
  });
});

describe("roundExecutiveAxisMaximum", () => {
  it("rounds padded decimals to clean tick boundaries", () => {
    expect(roundExecutiveAxisMaximum(24.38)).toBe(25);
    expect(roundExecutiveAxisMaximum(129.32)).toBe(130);
    expect(roundExecutiveAxisMaximum(393_470.9)).toBe(400_000);
  });
});

describe("validateOverviewDashboardExportParity", () => {
  it("passes when export kind matches canonical vertical bar", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <header class="overview-png-export-header"><h3>Revenue by Region</h3></header>
      <div class="recharts-cartesian-grid-horizontal"><line /></div>
      <g class="recharts-bar-rectangle"><path fill="#6366f1" /></g>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar",
      renderBarAsHorizontal: false,
      exportKind: "bar",
      exportRoot: root,
      chartTitle: "Revenue by Region",
    });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(true);
  });

  it("passes when export kind and orientation match explicit h-bar", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <header class="overview-png-export-header"><h3>Orders by City</h3></header>
      <div class="recharts-cartesian-grid-vertical"><line /></div>
      <g class="recharts-bar-rectangle"><path fill="#6366f1" /></g>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar_horizontal",
      renderBarAsHorizontal: true,
      exportKind: "bar_horizontal",
      exportRoot: root,
      chartTitle: "Orders by City",
    });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(true);
  });

  it("fails when export uses vertical bars but dashboard is horizontal", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="recharts-cartesian-grid-horizontal"><line /></div>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar_horizontal",
      renderBarAsHorizontal: true,
      exportKind: "bar_horizontal",
      exportRoot: root,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(false);
  });
});
