import { describe, expect, it } from "vitest";
import { buildPresentationExportSpec } from "@/lib/chart-png-export-layout";
import { isOffscreenPngExportRoot } from "@/lib/chart-png-capture";

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
});
