import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LINE_BOTTOM_LABEL_HEADROOM_PX,
  LINE_TOP_LABEL_HEADROOM_PX,
  verticalCartesianOuterMargins,
} from "@/lib/chart-layout-config";
import {
  buildAreaValueLabelIndexSet,
  buildLineValueLabelIndexSet,
  formatLineValueLabel,
  selectAreaValueLabelIndices,
  selectLineValueLabelIndices,
  shouldShowAreaPointLabels,
  shouldShowLinePointLabels,
} from "@/lib/line-value-labels";
import { sessionTrendDetailPlotMargins } from "@/lib/overview-premium-axis-domain";

const chartRendererSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/components/home/chart-renderer.tsx"),
  "utf8"
);
const lineLabelListSrc = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../app/components/home/line-value-label-list.tsx"
  ),
  "utf8"
);
const pageSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/page.tsx"),
  "utf8"
);

const weeklyUnits = [
  { name: "W1", value: 1_020_000 },
  { name: "W2", value: 1_030_000 },
  { name: "W3", value: 1_040_000 },
  { name: "W4", value: 1_050_000 },
];

describe("ChartRenderer line value labels", () => {
  const unitsCtx = {
    metricLabel: "Units Produced",
    chartTitle: "Weekly Units Produced Trend",
    presentationKind: "line" as const,
  };

  it("enables labels for sparse Weekly Units Produced Trend", () => {
    expect(shouldShowLinePointLabels(weeklyUnits)).toBe(true);
    expect(selectLineValueLabelIndices(weeklyUnits)).toEqual([0, 1, 2, 3]);
  });

  it("labels all points on 10-point enrollment-style trends when safe", () => {
    const enrollment = Array.from({ length: 10 }, (_, i) => ({
      name: `M${i + 1}`,
      value: 12_300 + i * 780,
    }));
    expect(
      selectLineValueLabelIndices(enrollment, { plotWidthPx: 360 }).length
    ).toBe(10);
  });

  it("formats weekly unit labels compactly", () => {
    expect(formatLineValueLabel(1_020_000, unitsCtx)).toBe("1.02M");
    expect(formatLineValueLabel(1_050_000, unitsCtx)).toBe("1.05M");
  });

  it("passes lineTopLabels into cartesian margins when labels are shown", () => {
    expect(chartRendererSrc).toContain("lineTopLabels: showLineValueLabels");
    const margins = verticalCartesianOuterMargins(
      "line",
      { marginLeft: 48, marginRight: 24 },
      32,
      { insightUi: false, lineTopLabels: true }
    );
    expect(margins.top).toBeGreaterThanOrEqual(LINE_TOP_LABEL_HEADROOM_PX);
    expect(margins.bottom).toBeGreaterThanOrEqual(32 + LINE_BOTTOM_LABEL_HEADROOM_PX);
  });

  it("does not raise top margin for area when lineTopLabels is set", () => {
    const margins = verticalCartesianOuterMargins(
      "area",
      { marginLeft: 48, marginRight: 24 },
      32,
      { insightUi: false, lineTopLabels: true }
    );
    expect(margins.top).toBe(11);
  });

  it("session detail line margins add headroom when line labels are shown", () => {
    const without = sessionTrendDetailPlotMargins({
      computedBottom: 30,
      yAxisWidth: 56,
      pointCount: 4,
      lineChart: true,
    });
    const withLabels = sessionTrendDetailPlotMargins({
      computedBottom: 30,
      yAxisWidth: 56,
      pointCount: 4,
      lineChart: true,
      lineTopLabels: true,
    });
    expect(withLabels.top).toBeGreaterThanOrEqual(LINE_TOP_LABEL_HEADROOM_PX);
    expect(withLabels.bottom).toBe(
      without.bottom + LINE_BOTTOM_LABEL_HEADROOM_PX
    );
  });

  it("line branch renders smart LabelList when showLineValueLabels is true", () => {
    expect(chartRendererSrc).toContain("showLineValueLabels");
    expect(chartRendererSrc).toContain("LineValueLabelListContent");
    expect(chartRendererSrc).toContain("lineValues={lineValueSeries}");
    expect(chartRendererSrc).toContain("lineLabelOptions");
    expect(chartRendererSrc).toMatch(
      /showLineValueLabels && lineValueLabelIndices[\s\S]*?<LabelList/
    );
  });

  it("line label list uses above/below placement helper", () => {
    expect(lineLabelListSrc).toContain("resolveLinePointLabelPlacement");
    expect(lineLabelListSrc).toContain("resolveLinePointLabelY");
    expect(lineLabelListSrc).toContain("dominantBaseline");
  });

  it("pngCaptureMode selects export surface for line labels", () => {
    expect(chartRendererSrc).toMatch(
      /lineLabelSurface[\s\S]*?pngCaptureMode\s*\?\s*"export"\s*:\s*"live"/
    );
  });

  it("line labels are gated to line kind only — not area", () => {
    expect(chartRendererSrc).toMatch(
      /showLineValueLabels\s*=\s*[\r\n\s]*rKind === "line"\s*&&/
    );
  });

  it("Overview inline line path applies label headroom when labels are enabled", () => {
    expect(pageSrc).toContain("LINE_TOP_LABEL_HEADROOM_PX");
    expect(pageSrc).toContain("LINE_BOTTOM_LABEL_HEADROOM_PX");
    expect(pageSrc).toContain("showLineValueLabels");
    expect(pageSrc).toContain("lineValues={lineValueSeries}");
    expect(pageSrc).toMatch(
      /top:\s*Math\.max\(trendLiveMargins\.top,\s*lineTopLabelHeadroom\)/
    );
    expect(pageSrc).toMatch(
      /bottom:\s*trendLiveMargins\.bottom \+ lineBottomLabelHeadroom/
    );
  });

  it("buildLineValueLabelIndexSet uses key labels only for dense charts", () => {
    const dense = Array.from({ length: 18 }, (_, i) => ({ value: i + 1 }));
    expect([...buildLineValueLabelIndexSet(dense)]).toEqual([0, 17]);
  });
});

describe("ChartRenderer area value labels", () => {
  const revenueCtx = {
    metricLabel: "Revenue",
    chartTitle: "Monthly Revenue Trend",
    presentationKind: "area" as const,
  };

  it("enables labels for sparse area trends", () => {
    const monthly = Array.from({ length: 8 }, (_, i) => ({
      name: `M${i + 1}`,
      value: 2_500_000 + i * 120_000,
    }));
    expect(
      shouldShowAreaPointLabels(monthly, {
        plotWidthPx: 360,
        formatLabel: (v) => formatLineValueLabel(v, revenueCtx),
      })
    ).toBe(true);
    expect(
      selectAreaValueLabelIndices(monthly, {
        plotWidthPx: 360,
        formatLabel: (v) => formatLineValueLabel(v, revenueCtx),
      }).length
    ).toBe(8);
  });

  it("passes areaTopLabels into cartesian margins when area labels are shown", () => {
    expect(chartRendererSrc).toContain("areaTopLabels: showAreaValueLabels");
    const margins = verticalCartesianOuterMargins(
      "area",
      { marginLeft: 48, marginRight: 24 },
      32,
      { insightUi: false, areaTopLabels: true }
    );
    expect(margins.top).toBeGreaterThanOrEqual(LINE_TOP_LABEL_HEADROOM_PX);
    expect(margins.bottom).toBeGreaterThanOrEqual(32 + LINE_BOTTOM_LABEL_HEADROOM_PX);
  });

  it("area branch renders LabelList with chartKind area", () => {
    expect(chartRendererSrc).toContain("showAreaValueLabels");
    expect(chartRendererSrc).toContain("areaValueLabelIndices");
    expect(chartRendererSrc).toMatch(
      /showAreaValueLabels && areaValueLabelIndices[\s\S]*?chartKind="area"/
    );
  });

  it("area labels are gated to area kind only — not line", () => {
    expect(chartRendererSrc).toMatch(
      /showAreaValueLabels\s*=\s*[\r\n\s]*rKind === "area"\s*&&/
    );
  });

  it("Overview inline area path applies label headroom when area labels are enabled", () => {
    expect(pageSrc).toContain("showAreaValueLabels");
    expect(pageSrc).toContain("areaValueLabelIndices");
    expect(pageSrc).toMatch(
      /showAreaValueLabels && areaValueLabelIndices[\s\S]*?chartKind="area"/
    );
    expect(pageSrc).toContain("showTrendValueLabels");
  });

  it("line label list supports area placement helper", () => {
    expect(lineLabelListSrc).toContain("resolveAreaPointLabelPlacement");
    expect(lineLabelListSrc).toContain('chartKind === "area"');
  });

  it("buildAreaValueLabelIndexSet uses key labels only for dense area charts", () => {
    const dense = Array.from({ length: 15 }, (_, i) => ({ value: i + 1 }));
    expect([...buildAreaValueLabelIndexSet(dense)]).toEqual([0, 14]);
  });
});
