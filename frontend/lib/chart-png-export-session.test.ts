import { describe, expect, it } from "vitest";
import {
  PRESENTATION_EXPORT_COMPACT_WIDTH_PX,
  PRESENTATION_EXPORT_WIDTH_PX,
  STANDALONE_PNG_HBAR_WIDTH_MODERATE_PX,
  STANDALONE_PNG_TREND_WIDTH_MODERATE_PX,
  STANDALONE_PNG_TREND_WIDTH_SPARSE_PX,
  STANDALONE_PNG_VBAR_WIDTH_MODERATE_PX,
  buildPresentationExportSpec,
} from "@/lib/chart-png-export-layout";
import { isOffscreenPngExportRoot } from "@/lib/chart-png-capture";
import { resolveChartsPngExportKind } from "@/lib/chart-png-export-session";

describe("chart PNG export session", () => {
  it("builds legacy line export spec with fixed canvas (no exportProfile)", () => {
    const spec = buildPresentationExportSpec("line", { categoryCount: 12 });
    expect(spec.canvasWidth).toBe(1200);
    expect(spec.canvasHeight).toBe(800);
    expect(spec.width).toBe(1200);
    expect(spec.height).toBeGreaterThan(500);
  });

  it("builds standalone PNG trend specs with point-aware widths", () => {
    const line = buildPresentationExportSpec("line", {
      categoryCount: 6,
      exportProfile: "chartsPng",
    });
    expect(line.canvasWidth).toBe(STANDALONE_PNG_TREND_WIDTH_SPARSE_PX);
    expect(line.width).toBe(line.canvasWidth);

    const area = buildPresentationExportSpec("area", {
      categoryCount: 12,
      exportProfile: "overviewPng",
    });
    expect(area.canvasWidth).toBe(STANDALONE_PNG_TREND_WIDTH_MODERATE_PX);
    expect(area.width).toBe(area.canvasWidth);
  });

  it("builds horizontal-bar export spec with tighter width for moderate categories", () => {
    const spec = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 8,
    });
    expect(spec.canvasWidth).toBe(1100);
    expect(spec.canvasHeight).toBe(900);
  });

  it("builds standalone PNG bar specs with category-aware widths", () => {
    const vBar = buildPresentationExportSpec("bar", {
      categoryCount: 5,
      exportProfile: "overviewPng",
    });
    expect(vBar.canvasWidth).toBe(STANDALONE_PNG_VBAR_WIDTH_MODERATE_PX);
    expect(vBar.width).toBe(vBar.canvasWidth);

    const hBar = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 5,
      exportProfile: "chartsPng",
    });
    expect(hBar.canvasWidth).toBe(STANDALONE_PNG_HBAR_WIDTH_MODERATE_PX);
    expect(hBar.width).toBe(hBar.canvasWidth);
  });

  it("detects offscreen export roots when DOM is available", () => {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    expect(isOffscreenPngExportRoot(el)).toBe(false);
    el.setAttribute("data-chart-png-offscreen", "1");
    expect(isOffscreenPngExportRoot(el)).toBe(true);
  });

  it("uses pinned snapshot chartKind for auto-dashboard Charts PNG export", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "auto_dashboard",
        snapshotChartKind: "bar",
      })
    ).toBe("bar");
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "auto_dashboard",
        snapshotChartKind: "bar_horizontal",
      })
    ).toBe("bar_horizontal");
  });

  it("ignores stale layout kind and prefers snapshot chartKind over live drift", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar_horizontal",
        snapshotSource: "auto_dashboard",
        snapshotChartKind: "bar",
      })
    ).toBe("bar");
  });

  it("keeps live Charts kind when no snapshot kind is present", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "auto_dashboard",
        snapshotChartKind: null,
      })
    ).toBe("bar");
  });

  it("does not apply snapshot kind to non-auto-dashboard charts", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "ai",
        snapshotChartKind: "bar_horizontal",
      })
    ).toBe("bar");
  });

  it("does not apply the export override outside the bar family", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "donut",
        snapshotSource: "auto_dashboard",
        snapshotChartKind: "bar_horizontal",
      })
    ).toBe("donut");
  });
});
