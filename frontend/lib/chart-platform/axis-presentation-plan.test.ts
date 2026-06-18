import { describe, expect, it } from "vitest";
import { buildPresentationExportSpec } from "@/lib/chart-png-export-layout";
import { buildChartPresentationContract } from "@/lib/chart-platform/build-chart-contract";
import {
  compareAxisPresentationPlans,
  formatAxisPresentationPlanSummary,
  resolveAxisPresentationPlan,
  resolveHBarExportValueAxisProps,
} from "@/lib/chart-platform/axis-presentation-plan";
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
          84,
          130,
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
          84,
          130,
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

  it("extracts safe H-Bar value-axis props only for PNG capture", () => {
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
      resolveHBarExportValueAxisProps({
        plan,
        chartKind: "bar_horizontal",
        pngCaptureMode: true,
      })
    ).toEqual({
      allowDataOverflow: true,
      domain: [4, 4.25],
    });
    expect(
      resolveHBarExportValueAxisProps({
        plan,
        chartKind: "bar_horizontal",
        pngCaptureMode: false,
      })
    ).toBeNull();
    expect(
      resolveHBarExportValueAxisProps({
        plan,
        chartKind: "bar",
        pngCaptureMode: true,
      })
    ).toBeNull();
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
      resolveHBarExportValueAxisProps({
        plan: planWithTicks,
        chartKind: "bar_horizontal",
        pngCaptureMode: true,
      })
    ).toEqual({
      allowDataOverflow: true,
      domain: [84, 130],
      tickCount: 4,
      ticks: [80, 100, 120, 140],
    });
  });
});
