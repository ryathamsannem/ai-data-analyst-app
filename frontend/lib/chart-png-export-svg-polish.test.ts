import { describe, expect, it } from "vitest";
import {
  applyPngExportSvgPolish,
  PNG_EXPORT_GRID_OPACITY_DARK,
  PNG_EXPORT_TICK_FONT_PX,
  polishHorizontalBarExportAxisTitle,
  shouldHideHorizontalBarExportAxisTitle,
} from "@/lib/chart-png-export-svg-polish";

describe("chart PNG export SVG polish", () => {
  it("strips leading By from horizontal-bar axis titles", () => {
    expect(polishHorizontalBarExportAxisTitle("By Campaign Name")).toBe(
      "Campaign Name"
    );
    expect(polishHorizontalBarExportAxisTitle("by region")).toBe("Region");
  });

  it("extracts dimension from metric-by-dimension phrases", () => {
    expect(polishHorizontalBarExportAxisTitle("Revenue By Campaign Name")).toBe(
      "Campaign Name"
    );
    expect(
      polishHorizontalBarExportAxisTitle("Total conversion rate pct by campaign name")
    ).toBe("Campaign Name");
  });

  it("keeps concise metric-only titles", () => {
    expect(polishHorizontalBarExportAxisTitle("Conversion Rate")).toBe(
      "Conversion Rate"
    );
    expect(polishHorizontalBarExportAxisTitle("Revenue")).toBe("Revenue");
  });

  it("hides redundant By-dimension titles when category ticks exist", () => {
    expect(
      shouldHideHorizontalBarExportAxisTitle("By Campaign Name", 8)
    ).toBe(true);
    expect(
      shouldHideHorizontalBarExportAxisTitle("Revenue By Campaign Name", 8)
    ).toBe(true);
    expect(shouldHideHorizontalBarExportAxisTitle("Revenue", 8)).toBe(false);
    expect(shouldHideHorizontalBarExportAxisTitle("By Campaign Name", 1)).toBe(
      false
    );
  });

  it("uses premium export typography constants", () => {
    expect(PNG_EXPORT_TICK_FONT_PX).toBeGreaterThanOrEqual(13);
    expect(PNG_EXPORT_GRID_OPACITY_DARK).toBeLessThan(0.25);
  });

  it("softens grid lines and hides redundant h-bar titles in cloned SVG", () => {
    if (typeof document === "undefined") return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = `
      <g class="recharts-cartesian-grid-vertical">
        <line stroke="#fff" stroke-opacity="0.38" stroke-dasharray="4 12" />
      </g>
      <g class="recharts-yAxis">
        <g class="recharts-cartesian-axis-tick"><text font-size="11">Electronics</text></g>
        <g class="recharts-cartesian-axis-tick"><text font-size="11">Clothing</text></g>
      </g>
      <g class="recharts-xAxis">
        <g class="recharts-cartesian-axis-tick"><text font-size="11">0</text></g>
        <g class="recharts-cartesian-axis-tick"><text font-size="11">100</text></g>
        <text font-size="11" font-weight="600">Revenue By Product Category</text>
      </g>
    `;
    applyPngExportSvgPolish(svg, { darkBackground: true });
    const grid = svg.querySelector(".recharts-cartesian-grid-vertical line")!;
    expect(grid.getAttribute("stroke-opacity")).toBe("0.16");
    expect(svg.querySelector(".recharts-xAxis text[font-weight='600']")).toBeNull();
    const tick = svg.querySelector(
      ".recharts-yAxis .recharts-cartesian-axis-tick text"
    );
    expect(tick?.getAttribute("font-size")).toBe("13");
  });
});
