import { describe, expect, it } from "vitest";
import {
  computeSessionRadialPlotBandOccupancy,
  estimateExportLegendRows,
  RADIAL_COMPACT_OUTER_PX,
  RADIAL_EXPORT_LEGEND_FONT_PX,
  RADIAL_EXPORT_LEGEND_ICON_PX,
  RADIAL_EXPORT_PLOT_BAND_DIAMETER_RATIO,
  resolveProportionalSessionRadialRadii,
  resolveRadialChartRadii,
  resolveRadialExportCanvasHeight,
  resolveRadialExportPlotHeight,
  SESSION_RADIAL_PLOT_BAND_DIAMETER_RATIO,
} from "./radial-export-layout";
import {
  OVERVIEW_MINI_RADIAL_SIZE_SCALE,
  scaleOverviewMiniRadialRadii,
} from "./overview-mini-radial-polish";

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

  it("export capture uses lower occupancy than live (~62–65%)", () => {
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
    const liveOcc = computeSessionRadialPlotBandOccupancy({
      outerRadius: live.outerRadius,
      plotHeightPx: 480,
    });
    const exportOcc = computeSessionRadialPlotBandOccupancy({
      outerRadius: exported.outerRadius,
      plotHeightPx: 480,
    });
    expect(exportOcc).toBeLessThan(liveOcc);
    expect(exportOcc).toBeGreaterThanOrEqual(0.62);
    expect(exportOcc).toBeLessThanOrEqual(0.66);
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
    expect(occupancy).toBeGreaterThanOrEqual(0.62);
    expect(occupancy).toBeLessThanOrEqual(0.66);
  });

  it("keeps overview compact fixed radii unchanged for live", () => {
    const overview = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 260,
      compact: true,
      pngCaptureMode: false,
    });
    expect(overview.outerRadius).toBe(RADIAL_COMPACT_OUTER_PX);
    expect(overview.cy).toBe("50%");
  });

  it("overview live polish targets ~65–75% plot-band occupancy", () => {
    const base = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 300,
      plotWidthPx: 440,
      compact: true,
      pngCaptureMode: false,
    });
    const scaled = scaleOverviewMiniRadialRadii(base);
    const occupancy = computeSessionRadialPlotBandOccupancy({
      outerRadius: scaled.outerRadius,
      plotHeightPx: 300,
    });
    expect(occupancy).toBeGreaterThanOrEqual(0.65);
    expect(occupancy).toBeLessThanOrEqual(0.75);
    expect(scaled.outerRadius).toBe(
      Math.round(RADIAL_COMPACT_OUTER_PX * OVERVIEW_MINI_RADIAL_SIZE_SCALE)
    );
  });

  it("export legend typography meets readability floor", () => {
    expect(RADIAL_EXPORT_LEGEND_FONT_PX).toBeGreaterThanOrEqual(24);
    expect(RADIAL_EXPORT_LEGEND_ICON_PX).toBeGreaterThanOrEqual(17);
  });

  it("overview compact export uses balanced proportional occupancy", () => {
    const exported = resolveRadialChartRadii({
      kind: "donut",
      plotHeightPx: 400,
      plotWidthPx: 1400,
      compact: true,
      pngCaptureMode: true,
    });
    const occupancy = computeSessionRadialPlotBandOccupancy({
      outerRadius: exported.outerRadius,
      plotHeightPx: 400,
    });
    expect(occupancy).toBeGreaterThanOrEqual(0.62);
    expect(occupancy).toBeLessThanOrEqual(0.66);
    expect(exported.cy).toBe("50%");
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

  it("export plot band diameter ratio targets ~63%", () => {
    expect(RADIAL_EXPORT_PLOT_BAND_DIAMETER_RATIO).toBeCloseTo(0.63, 2);
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
