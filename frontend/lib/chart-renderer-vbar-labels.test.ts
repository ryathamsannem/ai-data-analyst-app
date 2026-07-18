import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  VBAR_TOP_LABEL_HEADROOM_PX,
  verticalCartesianOuterMargins,
} from "@/lib/chart-layout-config";
import { shouldShowOverviewBarValueLabels, formatOverviewBarTopValueLabel } from "@/lib/overview-dashboard-export";
import { formatOverviewBarValueAxisTick } from "@/lib/overview-premium-axis-domain";

const chartRendererSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/components/home/chart-renderer.tsx"),
  "utf8"
);
const pageSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/page.tsx"),
  "utf8"
);

describe("ChartRenderer V-Bar top labels", () => {
  const defectRows = [
    { name: "Night", value: 0.023 },
    { name: "Day", value: 0.025 },
    { name: "Swing", value: 0.025 },
  ];
  const metricCtx = {
    metricLabel: "Defect Rate",
    chartTitle: "Defect Rate by Shift",
    presentationKind: "bar" as const,
  };
  const pctFmt = (v: number) =>
    formatOverviewBarTopValueLabel(v, defectRows, metricCtx);

  it("enables top labels for Defect Rate by Shift on session-sized charts", () => {
    expect(
      shouldShowOverviewBarValueLabels(defectRows, pctFmt, { metricCtx })
    ).toBe(true);
  });

  it("enables HR Bonus by Employee Status despite skewed totals", () => {
    const bonusRows = [
      { name: "Active", value: 5_463_723.57 },
      { name: "Terminated", value: 1_993_808.96 },
      { name: "On Leave", value: 1_719_734.37 },
    ];
    const bonusCtx = {
      metricLabel: "Bonus",
      chartTitle: "Bonus by Employee Status",
      presentationKind: "bar" as const,
    };
    const bonusFmt = (v: number) =>
      formatOverviewBarTopValueLabel(v, bonusRows, bonusCtx);
    expect(
      shouldShowOverviewBarValueLabels(bonusRows, bonusFmt, { metricCtx: bonusCtx })
    ).toBe(true);
  });

  it("passes vBarTopLabels into session detail margins when labels are shown", () => {
    expect(chartRendererSrc).toContain("vBarTopLabels: showVBarTopLabels");
    const margins = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 48, marginRight: 24 },
      32,
      {
        insightUi: true,
        yAxisWidth: 64,
        pointCount: 3,
        vBarTopLabels: true,
      }
    );
    expect(margins.top).toBeGreaterThanOrEqual(VBAR_TOP_LABEL_HEADROOM_PX);
  });

  it("final V-Bar path renders LabelList when showVBarTopLabels is true", () => {
    expect(chartRendererSrc).toContain("showVBarTopLabels");
    expect(chartRendererSrc).toMatch(
      /showVBarTopLabels\s*\?\s*\(\s*<LabelList[\s\S]*?position="top"/
    );
  });

  it("V-Bar LabelList uses barTopLabelFormatter not axis tick formatter", () => {
    expect(chartRendererSrc).toContain("barTopLabelFormatter");
    expect(chartRendererSrc).toMatch(
      /showVBarTopLabels\s*\?\s*\([\s\S]*?position="top"[\s\S]*?formatter=\{\(v\) => barTopLabelFormatter/
    );
    expect(chartRendererSrc).not.toMatch(
      /showVBarTopLabels\s*\?\s*\([\s\S]*?position="top"[\s\S]*?formatter=\{\(v\) => barValueTickFormatter/
    );
  });

  it("focused defect-rate top labels avoid misleading duplicate percents", () => {
    const rows = [
      { name: "Night", value: 0.0246 },
      { name: "Day", value: 0.0253 },
      { name: "Swing", value: 0.0253 },
    ];
    const labels = rows.map((r) =>
      formatOverviewBarTopValueLabel(r.value, rows, metricCtx)
    );
    expect(labels).toEqual(["2.46%", "2.53%", "2.53%"]);
    expect(labels.filter((l) => l === "2.5%").length).toBe(0);
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("focused defect-rate tooltip matches top-label precision", () => {
    const rows = [
      { name: "Night", value: 0.0247 },
      { name: "Day", value: 0.0252 },
      { name: "Swing", value: 0.0266 },
    ];
    const ctx = {
      ...metricCtx,
      chartRows: rows,
    };
    const label = formatOverviewBarTopValueLabel(0.0247, rows, ctx);
    expect(label).toBe("2.47%");
  });

  it("uses chart axis label token for V-Bar LabelList fill", () => {
    expect(chartRendererSrc).toMatch(
      /showVBarTopLabels[\s\S]*?<LabelList[\s\S]*?fill:\s*CHART_BAR_VALUE_LABEL_CSS/
    );
    expect(chartRendererSrc).toContain("className=\"chart-bar-value-label\"");
    expect(chartRendererSrc).toContain("offset={8}");
  });

  it("V-Bar gate is not shared with H-Bar showHBarEndLabels", () => {
    expect(chartRendererSrc).toContain("showHBarEndLabels");
    expect(chartRendererSrc).not.toContain("allowBarValueLabels");
  });

  it("Overview inline V-Bar applies top label headroom when labels are enabled", () => {
    expect(pageSrc).toContain("VBAR_TOP_LABEL_HEADROOM_PX");
    expect(pageSrc).toMatch(
      /vBarTopLabelHeadroom[\s\S]*?VBAR_TOP_LABEL_HEADROOM_PX/
    );
    expect(pageSrc).toMatch(
      /top:\s*Math\.max\([\s\S]*?vBarTopLabelHeadroom/
    );
  });
});
