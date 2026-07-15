import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  shouldShowHBarValueLabels,
  formatOverviewHBarEndValueLabel,
  hBarEndLabelsNeedExtraPrecision,
} from "@/lib/overview-dashboard-export";
import { formatOverviewBarValueAxisTick } from "@/lib/overview-premium-axis-domain";
import { formatChartTooltipValueLine } from "@/lib/chart-tooltip-format";

const chartRendererSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/components/home/chart-renderer.tsx"),
  "utf8"
);
const pageSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/page.tsx"),
  "utf8"
);

describe("shouldShowHBarValueLabels", () => {
  const delinquencyRows = [
    { name: "Prime", value: 0.031 },
    { name: "Near Prime", value: 0.038 },
    { name: "Subprime", value: 0.041 },
  ];
  const delinquencyCtx = {
    metricLabel: "Delinquency Rate",
    chartTitle: "Delinquency Rate by Product Type",
    presentationKind: "bar_horizontal" as const,
  };
  const tickFmt = (v: number) =>
    formatOverviewBarValueAxisTick(v, delinquencyRows, delinquencyCtx);

  it("enables in-bar labels for typical banking H-Bar rate breakdowns", () => {
    expect(
      shouldShowHBarValueLabels(delinquencyRows, tickFmt, {
        metricCtx: delinquencyCtx,
      })
    ).toBe(true);
  });

  it("enables HR Salary by Department (7 categories, compact currency)", () => {
    const salaryRows = [
      { name: "Engineering", value: 16_494_589.38 },
      { name: "Sales", value: 13_479_144.06 },
      { name: "Marketing", value: 13_282_519.05 },
      { name: "Finance", value: 11_696_395.54 },
      { name: "HR", value: 11_452_139.23 },
      { name: "Operations", value: 11_068_643.83 },
      { name: "Support", value: 9_756_326.72 },
    ];
    const salaryCtx = {
      metricLabel: "Salary",
      chartTitle: "Salary by Department",
      presentationKind: "bar_horizontal" as const,
    };
    const salaryTick = (v: number) =>
      formatOverviewBarValueAxisTick(v, salaryRows, salaryCtx);
    expect(
      shouldShowHBarValueLabels(salaryRows, salaryTick, { metricCtx: salaryCtx })
    ).toBe(true);
  });

  it("keeps compact H-Bar end labels while tooltip stays exact for large currency", () => {
    const rows = [
      { name: "Active", value: 7_317_710 },
      { name: "Terminated", value: 5_200_000 },
    ];
    const ctx = {
      metricLabel: "Bonus",
      chartTitle: "Bonus by Employee Status",
      presentationKind: "bar_horizontal" as const,
      chartRows: rows,
    };
    const endLabel = formatOverviewBarValueAxisTick(7_317_710, rows, ctx);
    const [tooltipValue] = formatChartTooltipValueLine(
      { name: "Active", value: 7_317_710 },
      "Bonus",
      ctx
    );
    expect(endLabel).toMatch(/7\.3M|M/);
    expect(tooltipValue).toContain("7,317,710");
  });
});

describe("ChartRenderer H-Bar inlay labels", () => {
  it("declares showHBarEndLabels from horizontal plot routing and H-Bar gate", () => {
    expect(chartRendererSrc).toContain("showHBarEndLabels");
    expect(chartRendererSrc).toContain("shouldShowHBarValueLabels");
    expect(chartRendererSrc).toMatch(
      /const showHBarEndLabels[\s\S]*?shouldRenderHorizontal[\s\S]*?shouldShowHBarValueLabels\(rData, barValueTickFormatter/
    );
  });

  it("keeps V-Bar gate on barTopLabelFormatter only", () => {
    expect(chartRendererSrc).toMatch(
      /const showVBarTopLabels[\s\S]*?!shouldRenderHorizontal[\s\S]*?shouldShowOverviewBarValueLabels\(rData, barTopLabelFormatter/
    );
  });

  it("renders LabelList with per-bar H-Bar placement content when showHBarEndLabels is true", () => {
    expect(chartRendererSrc).toMatch(
      /if \(shouldRenderHorizontal\)[\s\S]*?showHBarEndLabels\s*\?\s*\([\s\S]*?HBarValueLabelListContent/
    );
  });

  it("H-Bar LabelList uses barHBarEndLabelFormatter via HBarValueLabelListContent", () => {
    const hBarLabelList = chartRendererSrc.match(
      /showHBarEndLabels\s*\?\s*\([\s\S]*?<LabelList[\s\S]*?\/>/
    )?.[0];
    expect(hBarLabelList).toBeDefined();
    expect(hBarLabelList).toMatch(/barHBarEndLabelFormatter/);
    expect(hBarLabelList).not.toContain("barTopLabelFormatter");
  });

  it("uses chart-bar-inlay-label token and CHART_BAR_INLAY_LABEL_CSS", () => {
    expect(chartRendererSrc).toMatch(
      /showHBarEndLabels[\s\S]*?HBarValueLabelListContent[\s\S]*?CHART_BAR_INLAY_LABEL_CSS/
    );
  });

  it("applies Overview-aligned right margin when H-Bar labels are shown", () => {
    expect(chartRendererSrc).toMatch(
      /const hBarRightMargin = showHBarEndLabels[\s\S]*?Math\.max\(hmBalanced\.marginRight, 52\)[\s\S]*?hBarOutsideLabelReserves\.right/
    );
  });

  it("resolves detail-live placement for Charts tab and AI Insights detail layout", () => {
    expect(chartRendererSrc).toContain("resolveHBarLabelPlacementMode");
    expect(chartRendererSrc).toMatch(
      /resolveHBarLabelPlacementMode\(\{[\s\S]*?detailLayout/
    );
    expect(chartRendererSrc).toMatch(
      /hBarPlacementMode !== "overview-live"[\s\S]*?computeHBarSignedOutsideLabelReservesPx/
    );
    expect(chartRendererSrc).toMatch(
      /placementMode=\{hBarPlacementMode\}/
    );
    expect(chartRendererSrc).toMatch(
      /outsideLabelReservePx=\{hBarOutsideLabelReserves\.right\}/
    );
  });

  it("keeps export capture placement and reserve unchanged", () => {
    expect(chartRendererSrc).toContain("computeHBarSignedOutsideLabelReservesPx");
    expect(chartRendererSrc).toMatch(
      /pngCapture: pngCaptureMode[\s\S]*?detailLayout/
    );
  });

  it("Overview inline H-Bar uses safe outside labels on live cards", () => {
    expect(pageSrc).toContain("resolveOverviewInlineHBarPlacementMode");
    expect(pageSrc).toMatch(
      /hBarPlacementMode = resolveOverviewInlineHBarPlacementMode\(pngCapture\)/
    );
    expect(pageSrc).toMatch(
      /showBarEndLabels[\s\S]*?computeHBarSignedOutsideLabelReservesPx/
    );
    expect(pageSrc).not.toMatch(
      /placementMode=\{pngCapture \? "export" : "overview-live"\}/
    );
    expect(pageSrc).toMatch(
      /placementMode=\{hBarPlacementMode\}/
    );
    expect(pageSrc).toMatch(
      /outsideLabelReservePx=\{hBarOutsideReserves\.right\}/
    );
    expect(pageSrc).toMatch(
      /outsideLabelReserveLeftPx=\{hBarOutsideReserves\.left\}/
    );
  });

  it("renders signed zero ReferenceLine for H-Bar and V-Bar when data is negative", () => {
    expect(chartRendererSrc).toContain("barChartRowsHaveNegativeValues");
    expect(chartRendererSrc).toMatch(
      /hBarSigned \? \([\s\S]*?<ReferenceLine[\s\S]*?x=\{0\}/
    );
    expect(chartRendererSrc).toMatch(
      /vBarSigned \? \([\s\S]*?<ReferenceLine[\s\S]*?y=\{0\}/
    );
  });

  it("showHBarEndLabels is not conditioned on pngCaptureMode", () => {
    const gateBlock = chartRendererSrc.match(
      /const showHBarEndLabels[\s\S]*?;/
    )?.[0];
    expect(gateBlock).toBeDefined();
    expect(gateBlock).not.toContain("pngCaptureMode");
  });
});

describe("formatOverviewHBarEndValueLabel", () => {
  const marketingCtx = {
    metricLabel: "Ad Spend",
    chartTitle: "Ad Spend by Audience Segment",
    presentationKind: "bar_horizontal" as const,
  };

  it("increases M precision when close ad spend values would all read as 1.6M", () => {
    const rows = [
      { name: "Families", value: 1_599_301 },
      { name: "Young Professionals", value: 1_598_200 },
      { name: "Students", value: 1_597_100 },
      { name: "Enterprise Buyers", value: 1_596_000 },
      { name: "Retail", value: 1_590_000 },
      { name: "Healthcare", value: 1_506_945 },
    ];
    const ctx = { ...marketingCtx, chartRows: rows };
    expect(hBarEndLabelsNeedExtraPrecision(rows, ctx)).toBe(true);

    const labels = rows.map((r) =>
      formatOverviewHBarEndValueLabel(r.value, rows, ctx)
    );
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toMatch(/1\.599M|1\.60M/);
    expect(labels[0]).not.toBe("1.6M");
    expect(labels[4]).toMatch(/1\.59M/);
    expect(labels[5]).toMatch(/1\.5\d+M/);
  });

  it("keeps simple compact labels when values are clearly distinct", () => {
    const rows = [
      { name: "A", value: 1_200_000 },
      { name: "B", value: 2_500_000 },
      { name: "C", value: 4_800_000 },
    ];
    const ctx = {
      metricLabel: "Revenue",
      chartTitle: "Revenue by Region",
      presentationKind: "bar_horizontal" as const,
      chartRows: rows,
    };
    expect(hBarEndLabelsNeedExtraPrecision(rows, ctx)).toBe(false);
    expect(formatOverviewHBarEndValueLabel(1_200_000, rows, ctx)).toBe("1.2M");
    expect(formatOverviewHBarEndValueLabel(4_800_000, rows, ctx)).toBe("4.8M");
  });

  it("increases K precision only when close K-scale values collide", () => {
    const rows = [
      { name: "A", value: 450_300 },
      { name: "B", value: 450_800 },
      { name: "C", value: 398_700 },
    ];
    const ctx = {
      metricLabel: "Spend",
      chartTitle: "Spend by Channel",
      presentationKind: "bar_horizontal" as const,
      chartRows: rows,
    };
    const labels = rows.map((r) =>
      formatOverviewHBarEndValueLabel(r.value, rows, ctx)
    );
    expect(labels[0]).toMatch(/450\.\dK/);
    expect(labels[1]).toMatch(/450\.\dK/);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[2]).toMatch(/398\.\dK|399K/);
  });

  it("leaves axis tick formatting unchanged while tooltips stay exact", () => {
    const rows = [
      { name: "Families", value: 1_599_301 },
      { name: "Young Professionals", value: 1_598_200 },
      { name: "Students", value: 1_597_100 },
      { name: "Enterprise Buyers", value: 1_596_000 },
      { name: "Retail", value: 1_590_000 },
      { name: "Healthcare", value: 1_506_945 },
    ];
    const ctx = { ...marketingCtx, chartRows: rows };
    const axisTick = formatOverviewBarValueAxisTick(1_599_301, rows, ctx);
    const endLabel = formatOverviewHBarEndValueLabel(1_599_301, rows, ctx);
    const [tooltipValue] = formatChartTooltipValueLine(
      { name: "Families", value: 1_599_301 },
      "Ad Spend",
      ctx
    );
    expect(axisTick).toBe("1.6M");
    expect(endLabel).toBe("1.599M");
    expect(tooltipValue).toContain("1,599,301");
  });
});
