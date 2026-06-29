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

  it("renders LabelList insideRight when showHBarEndLabels is true", () => {
    expect(chartRendererSrc).toMatch(
      /if \(shouldRenderHorizontal\)[\s\S]*?showHBarEndLabels\s*\?\s*\([\s\S]*?position="insideRight"/
    );
  });

  it("H-Bar LabelList uses barValueTickFormatter not barTopLabelFormatter", () => {
    const hBarLabelList = chartRendererSrc.match(
      /showHBarEndLabels\s*\?\s*\([\s\S]*?<LabelList[\s\S]*?\/>/
    )?.[0];
    expect(hBarLabelList).toBeDefined();
    expect(hBarLabelList).toMatch(
      /formatter=\{\(v\) => barValueTickFormatter/
    );
    expect(hBarLabelList).not.toContain("barTopLabelFormatter");
  });

  it("uses chart-bar-inlay-label token and CHART_BAR_INLAY_LABEL_CSS", () => {
    expect(chartRendererSrc).toMatch(
      /showHBarEndLabels[\s\S]*?className="chart-bar-inlay-label"[\s\S]*?CHART_BAR_INLAY_LABEL_CSS/
    );
  });

  it("applies Overview-aligned right margin when H-Bar labels are shown", () => {
    expect(chartRendererSrc).toMatch(
      /const hBarRightMargin = showHBarEndLabels[\s\S]*?Math\.max\(hmBalanced\.marginRight, 52\)/
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
