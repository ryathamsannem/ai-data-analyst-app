import { describe, expect, it } from "vitest";
import {
  RADIAL_EXPORT_RADIUS_SCALE,
  estimateExportLegendRows,
  resolveRadialChartRadii,
  resolveRadialExportCanvasHeight,
  resolveRadialExportPlotHeight,
} from "./radial-export-layout";

describe("radial export layout", () => {
  it("reduces export donut radius by ~15-20%", () => {
    const onScreen = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 400,
      compact: false,
      pngCaptureMode: false,
    });
    const exported = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 400,
      compact: false,
      pngCaptureMode: true,
    });
    expect(exported.outerRadius / onScreen.outerRadius).toBeCloseTo(
      RADIAL_EXPORT_RADIUS_SCALE,
      1
    );
    expect(exported.innerRadius).toBeLessThan(onScreen.innerRadius);
  });

  it("grows canvas height for 4, 6, and 8 category donuts", () => {
    const h4 = resolveRadialExportCanvasHeight(4);
    const h6 = resolveRadialExportCanvasHeight(6);
    const h8 = resolveRadialExportCanvasHeight(8);
    expect(h6).toBeGreaterThan(h4);
    expect(h8).toBeGreaterThan(h6);
    expect(estimateExportLegendRows(8)).toBeGreaterThan(estimateExportLegendRows(4));
  });

  it("allocates taller plot band when category count increases", () => {
    expect(resolveRadialExportPlotHeight(8)).toBeGreaterThan(
      resolveRadialExportPlotHeight(4)
    );
  });
});
