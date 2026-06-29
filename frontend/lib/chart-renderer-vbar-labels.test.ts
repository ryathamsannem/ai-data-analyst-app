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

  it("uses chart axis label token for V-Bar LabelList fill", () => {
    expect(chartRendererSrc).toMatch(
      /showVBarTopLabels[\s\S]*?<LabelList[\s\S]*?fill:\s*CHART_BAR_VALUE_LABEL_CSS/
    );
    expect(chartRendererSrc).toContain("className=\"chart-bar-value-label\"");
    expect(chartRendererSrc).toContain("offset={8}");
  });

  it("horizontal bar path reuses allowBarValueLabels with inlay LabelList", () => {
    expect(chartRendererSrc).toContain("allowBarValueLabels");
    expect(chartRendererSrc).toMatch(
      /allowBarValueLabels\s*\?\s*\([\s\S]*?position="insideRight"/
    );
    expect(chartRendererSrc).toMatch(
      /chart-bar-inlay-label[\s\S]*?CHART_BAR_INLAY_LABEL_CSS/
    );
  });

  it("allowBarValueLabels is not conditioned on pngCaptureMode", () => {
    const gateBlock = chartRendererSrc.match(
      /const allowBarValueLabels = useMemo\([\s\S]*?\);/
    )?.[0];
    expect(gateBlock).toBeDefined();
    expect(gateBlock).not.toContain("pngCaptureMode");
  });
});
