import { describe, expect, it } from "vitest";
import { buildPresentationExportSpec } from "@/lib/chart-png-export-layout";
import { isOffscreenPngExportRoot } from "@/lib/chart-png-capture";
import { resolveChartsPngExportKind } from "@/lib/chart-png-export-session";

describe("chart PNG export session", () => {
  it("builds line export spec with fixed canvas", () => {
    const spec = buildPresentationExportSpec("line", { categoryCount: 12 });
    expect(spec.canvasWidth).toBe(1200);
    expect(spec.canvasHeight).toBe(800);
    expect(spec.width).toBe(1200);
    expect(spec.height).toBeGreaterThan(500);
  });

  it("builds horizontal-bar export spec with tighter width for moderate categories", () => {
    const spec = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 8,
    });
    expect(spec.canvasWidth).toBe(1100);
    expect(spec.canvasHeight).toBe(900);
  });

  it("detects offscreen export roots when DOM is available", () => {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    expect(isOffscreenPngExportRoot(el)).toBe(false);
    el.setAttribute("data-chart-png-offscreen", "1");
    expect(isOffscreenPngExportRoot(el)).toBe(true);
  });

  it("uses Overview effective H-Bar only for auto-dashboard Charts PNG export", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "auto_dashboard",
        overviewEffectiveKind: "bar_horizontal",
      })
    ).toBe("bar_horizontal");
  });

  it("keeps live Charts kind when no export override is present", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "auto_dashboard",
        overviewEffectiveKind: null,
      })
    ).toBe("bar");
  });

  it("does not apply Overview export kind to non-auto-dashboard charts", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "bar",
        snapshotSource: "ai",
        overviewEffectiveKind: "bar_horizontal",
      })
    ).toBe("bar");
  });

  it("does not apply the export override outside the bar family", () => {
    expect(
      resolveChartsPngExportKind({
        liveKind: "donut",
        snapshotSource: "auto_dashboard",
        overviewEffectiveKind: "bar_horizontal",
      })
    ).toBe("donut");
  });
});
