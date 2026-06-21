import { describe, expect, it } from "vitest";
import {
  computeSessionRadialPlotBandOccupancy,
  estimateExportLegendRows,
  RADIAL_COMPACT_OUTER_PX,
  RADIAL_EXPORT_RADIUS_SCALE,
  resolveProportionalSessionRadialRadii,
  resolveRadialChartRadii,
  resolveRadialExportCanvasHeight,
  resolveRadialExportPlotHeight,
  SESSION_RADIAL_PLOT_BAND_DIAMETER_RATIO,
} from "./radial-export-layout";

describe("radial export layout", () => {
  it("uses proportional session detail radii (~65–75% plot band occupancy)", () => {
    const live = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 480,
      plotWidthPx: 760,
      compact: false,
      pngCaptureMode: false,
      piePad: { marginHorizontal: 12, marginBottom: 24 },
    });
    const occupancy = computeSessionRadialPlotBandOccupancy({
      outerRadius: live.outerRadius,
      plotHeightPx: 480,
    });
    expect(occupancy).toBeGreaterThanOrEqual(0.65);
    expect(occupancy).toBeLessThanOrEqual(0.75);
    expect(live.outerRadius).toBeGreaterThan(140);
    expect(live.innerRadius).toBeGreaterThan(0);
    expect(live.cy).toBe("48%");
  });

  it("matches live occupancy on export capture with legend outside chart", () => {
    const live = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 480,
      plotWidthPx: 860,
      compact: false,
      pngCaptureMode: false,
      piePad: { marginHorizontal: 12, marginBottom: 24 },
    });
    const exported = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 480,
      plotWidthPx: 860,
      compact: false,
      pngCaptureMode: true,
      piePad: { marginHorizontal: 12, marginBottom: 24 },
    });
    expect(exported.outerRadius).toBe(live.outerRadius);
    expect(exported.cy).toBe("50%");
  });

  it("scales export ring with plot band height (Charts PNG ~400px)", () => {
    const chartsPng = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 400,
      plotWidthPx: 1400,
      compact: false,
      pngCaptureMode: true,
      piePad: { marginHorizontal: 12, marginBottom: 24 },
    });
    const occupancy = computeSessionRadialPlotBandOccupancy({
      outerRadius: chartsPng.outerRadius,
      plotHeightPx: 400,
    });
    expect(occupancy).toBeGreaterThanOrEqual(0.65);
    expect(occupancy).toBeLessThanOrEqual(0.75);
  });

  it("keeps overview compact fixed radii unchanged", () => {
    const overview = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 260,
      compact: true,
      pngCaptureMode: false,
    });
    expect(overview.outerRadius).toBe(RADIAL_COMPACT_OUTER_PX);
    expect(overview.cy).toBe("50%");
  });

  it("shrinks overview compact export radii only", () => {
    const overview = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 300,
      compact: true,
      pngCaptureMode: false,
    });
    const exported = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 300,
      compact: true,
      pngCaptureMode: true,
    });
    expect(exported.outerRadius / overview.outerRadius).toBeCloseTo(
      RADIAL_EXPORT_RADIUS_SCALE,
      1
    );
  });

  it("reports before/after occupancy delta vs legacy fixed 88px ring", () => {
    const legacyOuter = 88;
    const legacyOccupancy = computeSessionRadialPlotBandOccupancy({
      outerRadius: legacyOuter,
      plotHeightPx: 480,
    });
    const proportional = resolveProportionalSessionRadialRadii({
      kind: "donut",
      plotWidthPx: 760,
      plotHeightPx: 480,
      legendInChart: true,
      piePad: { marginHorizontal: 12, marginBottom: 24 },
    });
    const nextOccupancy = computeSessionRadialPlotBandOccupancy({
      outerRadius: proportional.outerRadius,
      plotHeightPx: 480,
    });
    expect(legacyOccupancy).toBeCloseTo(0.367, 2);
    expect(nextOccupancy).toBeCloseTo(
      SESSION_RADIAL_PLOT_BAND_DIAMETER_RATIO,
      1
    );
    expect(nextOccupancy - legacyOccupancy).toBeGreaterThan(0.28);
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
