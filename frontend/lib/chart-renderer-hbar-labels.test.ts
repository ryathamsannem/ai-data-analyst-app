import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  shouldShowHBarValueLabels,
} from "@/lib/overview-dashboard-export";
import { formatOverviewBarValueAxisTick } from "@/lib/overview-premium-axis-domain";

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

  it("H-Bar LabelList uses barValueTickFormatter via HBarValueLabelListContent", () => {
    const hBarLabelList = chartRendererSrc.match(
      /showHBarEndLabels\s*\?\s*\([\s\S]*?<LabelList[\s\S]*?\/>/
    )?.[0];
    expect(hBarLabelList).toBeDefined();
    expect(hBarLabelList).toMatch(/barValueTickFormatter/);
    expect(hBarLabelList).not.toContain("barTopLabelFormatter");
  });

  it("uses chart-bar-inlay-label token and CHART_BAR_INLAY_LABEL_CSS", () => {
    expect(chartRendererSrc).toMatch(
      /showHBarEndLabels[\s\S]*?HBarValueLabelListContent[\s\S]*?CHART_BAR_INLAY_LABEL_CSS/
    );
  });

  it("applies Overview-aligned right margin when H-Bar labels are shown", () => {
    expect(chartRendererSrc).toMatch(
      /const hBarRightMargin = showHBarEndLabels[\s\S]*?Math\.max\(hmBalanced\.marginRight, 52\)[\s\S]*?hBarOutsideLabelReserve/
    );
  });

  it("resolves detail-live placement for Charts tab and AI Insights detail layout", () => {
    expect(chartRendererSrc).toContain("resolveHBarLabelPlacementMode");
    expect(chartRendererSrc).toMatch(
      /resolveHBarLabelPlacementMode\(\{[\s\S]*?detailLayout/
    );
    expect(chartRendererSrc).toMatch(
      /hBarPlacementMode !== "overview-live"[\s\S]*?computeHBarOutsideLabelReservePx/
    );
    expect(chartRendererSrc).toMatch(
      /placementMode=\{hBarPlacementMode\}/
    );
    expect(chartRendererSrc).toMatch(
      /outsideLabelReservePx=\{hBarOutsideLabelReserve\}/
    );
  });

  it("keeps export capture placement and reserve unchanged", () => {
    expect(chartRendererSrc).toContain("computeHBarOutsideLabelReservePx");
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
      /showBarEndLabels[\s\S]*?computeHBarOutsideLabelReservePx/
    );
    expect(pageSrc).not.toMatch(
      /placementMode=\{pngCapture \? "export" : "overview-live"\}/
    );
    expect(pageSrc).toMatch(
      /placementMode=\{hBarPlacementMode\}/
    );
    expect(pageSrc).toMatch(
      /outsideLabelReservePx=\{hBarOutsideReserve\}/
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
