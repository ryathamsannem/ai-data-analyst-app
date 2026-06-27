import { describe, expect, it } from "vitest";
import { buildPresentationExportSpec } from "@/lib/chart-png-export-layout";
import { buildChartPresentationContract } from "@/lib/chart-platform/build-chart-contract";
import {
  compareAxisPresentationPlans,
  formatAxisPresentationPlanSummary,
  resolveAxisPresentationPlan,
  resolveHBarValueAxisProps,
  resolveVerticalBarValueAxisProps,
} from "@/lib/chart-platform/axis-presentation-plan";
import { resolveOverviewBarValueDomain } from "@/lib/overview-bar-value-domain";
import { buildChartPresentationProfile } from "@/lib/chart-platform/chart-presentation-profile";

const rows = [
  { name: "North", value: 120 },
  { name: "South", value: 90 },
  { name: "West", value: 115 },
  { name: "East", value: 88 },
];

describe("AxisPresentationPlan", () => {
  it("resolves the same H-Bar export plan for Overview PNG and Charts PNG", () => {
    const contract = buildChartPresentationContract({
      chartId: "hbar-1",
      source: "auto_dashboard",
      apiChartType: "horizontalBar",
      resolvedKind: "bar_horizontal",
      title: "Revenue by Region",
      rows,
      metricLabel: "Revenue",
      categoryLabel: "Region",
    });
    const spec = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: rows.length,
    });

    const overview = buildChartPresentationProfile({
      id: "overviewPng",
      contract,
      kind: "bar_horizontal",
      categoryCount: rows.length,
      spec,
    });
    const charts = buildChartPresentationProfile({
      id: "chartsPng",
      contract,
      kind: "bar_horizontal",
      categoryCount: rows.length,
      spec,
    });

    expect(compareAxisPresentationPlans(
      overview.axisPresentationPlan,
      charts.axisPresentationPlan
    )).toEqual([]);
    expect(formatAxisPresentationPlanSummary(overview.axisPresentationPlan)).toMatchObject({
      planId: "axis-plan:horizontal-bar:export:v1",
      status: "supported",
      chartKind: "bar_horizontal",
      valueOrientation: "x",
      categoryOrientation: "y",
      valueTickFormatterId: "formatAxisTickFromRows",
      categoryTickFormatterId: "WrappedCategoryYAxisTick",
    });
  });

  it("keeps Bar and H-Bar export plans stable", () => {
    const barContract = buildChartPresentationContract({
      chartId: "bar-1",
      source: "charts",
      apiChartType: "bar",
      resolvedKind: "bar",
      title: "Revenue by Region",
      rows,
      metricLabel: "Revenue",
      categoryLabel: "Region",
    });
    const hbarContract = buildChartPresentationContract({
      chartId: "hbar-2",
      source: "charts",
      apiChartType: "horizontalBar",
      resolvedKind: "bar_horizontal",
      title: "Revenue by Region",
      rows,
      metricLabel: "Revenue",
      categoryLabel: "Region",
    });

    const barPlan = resolveAxisPresentationPlan({
      profileId: "chartsPng",
      contract: barContract,
      kind: "bar",
      spec: buildPresentationExportSpec("bar", { categoryCount: rows.length }),
    });
    const hbarPlan = resolveAxisPresentationPlan({
      profileId: "chartsPng",
      contract: hbarContract,
      kind: "bar_horizontal",
      spec: buildPresentationExportSpec("bar_horizontal", {
        categoryCount: rows.length,
      }),
    });

    expect(formatAxisPresentationPlanSummary(barPlan)).toMatchInlineSnapshot(`
      {
        "categoryAxisHeightPx": 31,
        "categoryAxisWidthPx": null,
        "categoryOrientation": "x",
        "categoryTickCount": 4,
        "categoryTickFormatterId": "formatChartAxisCategoryTick",
        "chartKind": "bar",
        "margins": {
          "bottom": 30,
          "left": 158,
          "right": 26,
          "top": 16,
        },
        "planId": "axis-plan:bar:export:v1",
        "reason": null,
        "status": "supported",
        "valueAxisHeightPx": null,
        "valueAxisWidthPx": 144,
        "valueDomain": [
          0,
          123.2,
        ],
        "valueOrientation": "y",
        "valueTickCount": null,
        "valueTickFormatterId": "formatAxisTickFromRows",
        "valueTickValues": null,
      }
    `);
    expect(formatAxisPresentationPlanSummary(hbarPlan)).toMatchInlineSnapshot(`
      {
        "categoryAxisHeightPx": null,
        "categoryAxisWidthPx": 93,
        "categoryOrientation": "y",
        "categoryTickCount": 4,
        "categoryTickFormatterId": "WrappedCategoryYAxisTick",
        "chartKind": "bar_horizontal",
        "margins": {
          "bottom": 47,
          "left": 14,
          "right": 14,
          "top": 16,
        },
        "planId": "axis-plan:horizontal-bar:export:v1",
        "reason": null,
        "status": "supported",
        "valueAxisHeightPx": null,
        "valueAxisWidthPx": null,
        "valueDomain": [
          0,
          123.2,
        ],
        "valueOrientation": "x",
        "valueTickCount": null,
        "valueTickFormatterId": "formatAxisTickFromRows",
        "valueTickValues": null,
      }
    `);
  });

  it("returns a diagnostic-only plan for unsupported kinds", () => {
    const contract = buildChartPresentationContract({
      chartId: "line-1",
      source: "charts",
      apiChartType: "line",
      resolvedKind: "line",
      title: "Revenue Trend",
      rows,
      metricLabel: "Revenue",
      categoryLabel: "Month",
    });
    const plan = resolveAxisPresentationPlan({
      profileId: "chartsPng",
      contract,
      kind: "line",
      spec: buildPresentationExportSpec("line", { categoryCount: rows.length }),
    });

    expect(plan.status).toBe("unsupported");
    expect(plan.valueAxis.scale).toBe("none");
    expect(plan.categoryAxis.scale).toBe("none");
    expect(plan.diagnostics.reason).toContain("diagnostic-only");
  });

  it("extracts H-Bar value-axis props from AxisPresentationPlan when provided", () => {
    const contract = buildChartPresentationContract({
      chartId: "hbar-low-variance",
      source: "charts",
      apiChartType: "horizontalBar",
      resolvedKind: "bar_horizontal",
      title: "Satisfaction Score by Department",
      rows: [
        { name: "Sales", value: 4.06 },
        { name: "Marketing", value: 4.12 },
        { name: "Finance", value: 4.19 },
      ],
      metricLabel: "Satisfaction Score",
      categoryLabel: "Department",
    });
    const plan = resolveAxisPresentationPlan({
      profileId: "chartsPng",
      contract,
      kind: "bar_horizontal",
      spec: buildPresentationExportSpec("bar_horizontal", {
        categoryCount: 3,
      }),
    });

    expect(
      resolveHBarValueAxisProps({
        plan,
        chartKind: "bar_horizontal",
        rows: contract.data.rows,
        chartTitle: "Satisfaction Score by Department",
        metricLabel: "Satisfaction Score",
      })
    ).toEqual({
      allowDataOverflow: true,
      domain: [4.0275, 4.2225],
    });
    expect(
      resolveHBarValueAxisProps({
        plan: null,
        chartKind: "bar_horizontal",
        rows: contract.data.rows,
        chartTitle: "Satisfaction Score by Department",
        metricLabel: "Satisfaction Score",
      })
    ).toEqual({
      allowDataOverflow: true,
      domain: [4.0275, 4.2225],
    });
    expect(
      resolveHBarValueAxisProps({
        plan,
        chartKind: "bar",
        rows: contract.data.rows,
        chartTitle: "Satisfaction Score by Department",
        metricLabel: "Satisfaction Score",
      })
    ).toBeNull();
  });

  it("resolves zero-baseline H-Bar domain for live, AI, and PDF-like ChartRenderer paths", () => {
    const ordersRows = [
      { name: "Bengaluru", value: 1008 },
      { name: "Mumbai", value: 1015 },
      { name: "Delhi", value: 1002 },
      { name: "Pune", value: 1011 },
    ];

    const live = resolveHBarValueAxisProps({
      chartKind: "bar_horizontal",
      rows: ordersRows,
      chartTitle: "Orders by City",
      metricLabel: "Orders",
    });
    const ai = resolveHBarValueAxisProps({
      chartKind: "bar_horizontal",
      rows: ordersRows,
      chartTitle: "Orders by City",
      metricLabel: "Orders",
    });
    const pdf = resolveHBarValueAxisProps({
      chartKind: "bar_horizontal",
      rows: ordersRows,
      chartTitle: "Orders by City",
      metricLabel: "Orders",
    });

    expect(live).toEqual(ai);
    expect(ai).toEqual(pdf);
    expect(live!.domain![0]).toBe(0);
    expect(live!.domain![1]).toBeGreaterThan(1015);
  });

  it("preserves explicit H-Bar tick metadata when present", () => {
    const contract = buildChartPresentationContract({
      chartId: "hbar-ticks",
      source: "charts",
      apiChartType: "horizontalBar",
      resolvedKind: "bar_horizontal",
      title: "Score by Department",
      rows,
      metricLabel: "Score",
      categoryLabel: "Department",
    });
    const plan = resolveAxisPresentationPlan({
      profileId: "chartsPng",
      contract,
      kind: "bar_horizontal",
      spec: buildPresentationExportSpec("bar_horizontal", {
        categoryCount: rows.length,
      }),
    });
    const planWithTicks = {
      ...plan,
      valueAxis: {
        ...plan.valueAxis,
        tickCount: 4,
        tickValues: [80, 100, 120, 140],
      },
    };

    expect(
      resolveHBarValueAxisProps({
        plan: planWithTicks,
        chartKind: "bar_horizontal",
        rows: contract.data.rows,
        chartTitle: "Score by Department",
        metricLabel: "Score",
      })
    ).toEqual({
      allowDataOverflow: true,
      domain: [84.8, 123.2],
      tickCount: 4,
      ticks: [80, 100, 120, 140],
    });
  });

  it("export plan V-Bar profit domain starts at 0", () => {
    const profitRows = [
      { name: "Engineering", value: 205_126 },
      { name: "Sales", value: 210_000 },
      { name: "Marketing", value: 215_087 },
    ];
    const contract = buildChartPresentationContract({
      chartId: "profit-bar",
      source: "auto_dashboard",
      apiChartType: "bar",
      resolvedKind: "bar",
      title: "Profit by Department",
      rows: profitRows,
      metricLabel: "Profit",
      categoryLabel: "Department",
    });
    const plan = resolveAxisPresentationPlan({
      profileId: "overviewPng",
      contract,
      kind: "bar",
      spec: buildPresentationExportSpec("bar", { categoryCount: profitRows.length }),
    });
    expect(plan.valueAxis.domain![0]).toBe(0);
    expect(plan.valueAxis.domain![1]).toBeGreaterThan(215_087);
  });

  it("export plan H-Bar utilization domain starts at 0", () => {
    const utilizationRows = [
      { name: "Credit Card", value: 0.357 },
      { name: "Auto", value: 0.390 },
      { name: "Mortgage", value: 0.415 },
      { name: "Personal", value: 0.440 },
    ];
    const contract = buildChartPresentationContract({
      chartId: "util-hbar",
      source: "auto_dashboard",
      apiChartType: "horizontalBar",
      resolvedKind: "bar_horizontal",
      title: "Credit Utilization by Product Type",
      rows: utilizationRows,
      metricLabel: "Utilization Rate",
      categoryLabel: "Product Type",
    });
    const plan = resolveAxisPresentationPlan({
      profileId: "overviewPng",
      contract,
      kind: "bar_horizontal",
      spec: buildPresentationExportSpec("bar_horizontal", {
        categoryCount: utilizationRows.length,
      }),
    });
    expect(plan.valueAxis.domain![0]).toBe(0);
    expect(plan.valueAxis.domain![1]).toBeGreaterThan(0.44);
  });
});

describe("resolveVerticalBarValueAxisProps", () => {
  const satisfactionRows = [
    { name: "Sales", value: 4.06 },
    { name: "Marketing", value: 4.12 },
    { name: "Finance", value: 4.19 },
  ];

  it("uses vertical bar export plan domain when provided", () => {
    const contract = buildChartPresentationContract({
      chartId: "bar-1",
      source: "charts",
      apiChartType: "bar",
      resolvedKind: "bar",
      title: "Revenue by Region",
      rows,
      metricLabel: "Revenue",
      categoryLabel: "Region",
    });
    const plan = resolveAxisPresentationPlan({
      profileId: "chartsPng",
      contract,
      kind: "bar",
      spec: buildPresentationExportSpec("bar", { categoryCount: rows.length }),
    });

    expect(
      resolveVerticalBarValueAxisProps({
        plan,
        chartKind: "bar",
        rows: contract.data.rows,
        chartTitle: "Revenue by Region",
        metricLabel: "Revenue",
      })
    ).toEqual({
      allowDataOverflow: false,
      domain: plan.valueAxis.domain,
    });
  });

  it("falls back to overview bar domain for live charts and insights", () => {
    const overviewDomain = resolveOverviewBarValueDomain(satisfactionRows, {
      chartTitle: "Satisfaction Score by Department",
      metricLabel: "Satisfaction Score",
      presentationKind: "bar",
      executiveRounding: false,
    });
    const props = resolveVerticalBarValueAxisProps({
      plan: null,
      chartKind: "bar",
      rows: satisfactionRows,
      chartTitle: "Satisfaction Score by Department",
      metricLabel: "Satisfaction Score",
    });

    expect(props).toEqual({
      allowDataOverflow: false,
      domain: overviewDomain,
    });
    expect(props!.domain![0]).toBeGreaterThan(4);
    expect(props!.domain![1]).toBeLessThan(4.25);
  });

  it("applies the same fallback policy for histogram", () => {
    const histogramRows = [
      { name: "40-50k", value: 12 },
      { name: "50-60k", value: 28 },
      { name: "60-70k", value: 19 },
      { name: "70-80k", value: 8 },
    ];
    const overviewDomain = resolveOverviewBarValueDomain(histogramRows, {
      chartTitle: "Salary Distribution",
      metricLabel: "Employee Count",
      presentationKind: "histogram",
      executiveRounding: false,
    });

    expect(
      resolveVerticalBarValueAxisProps({
        plan: null,
        chartKind: "histogram",
        rows: histogramRows,
        chartTitle: "Salary Distribution",
        metricLabel: "Employee Count",
      })
    ).toEqual({
      allowDataOverflow: false,
      domain: overviewDomain,
    });
  });

  it("returns null for unsupported chart kinds", () => {
    expect(
      resolveVerticalBarValueAxisProps({
        chartKind: "line",
        rows: satisfactionRows,
        chartTitle: "Trend",
        metricLabel: "Revenue",
      })
    ).toBeNull();
  });
});
