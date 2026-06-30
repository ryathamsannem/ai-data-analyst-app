import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isOverviewChartGridSoloRow,
  overviewChartGridSoloRowCount,
  overviewChartGridSoloRowStyle,
} from "./overview-chart-grid-layout";

const pageSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/page.tsx"),
  "utf8"
);
const globalsCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"),
  "utf8"
);

describe("isOverviewChartGridSoloRow", () => {
  it("marks only the last chart for odd totals (3, 5, 7, 9)", () => {
    for (const total of [3, 5, 7, 9]) {
      const flags = Array.from({ length: total }, (_, i) =>
        isOverviewChartGridSoloRow(i, total),
      );
      expect(flags.filter(Boolean)).toEqual([true]);
      expect(flags[total - 1]).toBe(true);
      for (let i = 0; i < total - 1; i++) {
        expect(flags[i]).toBe(false);
      }
    }
  });

  it("does not span when total is even", () => {
    for (const total of [2, 4, 6, 8]) {
      expect(
        Array.from({ length: total }, (_, i) =>
          isOverviewChartGridSoloRow(i, total),
        ).some(Boolean),
      ).toBe(false);
    }
  });

  it("does not treat a single-chart dashboard as solo last row", () => {
    expect(isOverviewChartGridSoloRow(0, 1)).toBe(false);
    expect(overviewChartGridSoloRowCount(1)).toBe(1);
  });
});

describe("overviewChartGridSoloRowStyle", () => {
  it("centers solo row without stretching inner card to full width", () => {
    expect(overviewChartGridSoloRowStyle(4, 5)).toEqual({
      gridColumn: "1 / -1",
      justifySelf: "center",
      width: "100%",
    });
    expect(overviewChartGridSoloRowStyle(2, 3)).toEqual({
      gridColumn: "1 / -1",
      justifySelf: "center",
      width: "100%",
    });
    expect(overviewChartGridSoloRowStyle(6, 7)).toEqual({
      gridColumn: "1 / -1",
      justifySelf: "center",
      width: "100%",
    });
  });

  it("keeps paired cells on a single column span", () => {
    expect(overviewChartGridSoloRowStyle(0, 4)).toEqual({
      gridColumn: "span 1",
      width: "100%",
      maxWidth: "100%",
    });
    expect(overviewChartGridSoloRowStyle(3, 6)).toEqual({
      gridColumn: "span 1",
      width: "100%",
      maxWidth: "100%",
    });
  });
});

describe("overviewChartGridSoloRowCount", () => {
  it("expects exactly one solo row for odd multi-chart totals", () => {
    expect(overviewChartGridSoloRowCount(5)).toBe(1);
    expect(overviewChartGridSoloRowCount(7)).toBe(1);
    expect(overviewChartGridSoloRowCount(9)).toBe(1);
    expect(overviewChartGridSoloRowCount(8)).toBe(0);
  });
});

describe("Overview page solo-row wiring", () => {
  it("applies ovChartInnerSolo only for the last odd chart cell", () => {
    expect(pageSrc).toContain("ovChartInnerSolo");
    expect(pageSrc).toMatch(
      /isSoloLastRow \? ovChartInnerSolo : ovChartInner/
    );
  });
});

describe("Overview grid CSS solo-row centering", () => {
  it("constrains solo inner card to one column width on 2-col layout", () => {
    expect(globalsCss).toContain(".overview-chart-grid__inner--solo");
    expect(globalsCss).toMatch(
      /\.overview-chart-grid__inner--solo[\s\S]*?calc\(\(100% - var\(--overview-chart-grid-gap\)\) \/ 2\)/
    );
    expect(globalsCss).toMatch(
      /\.overview-chart-grid__cell--solo-row[\s\S]*?justify-content: center/
    );
  });

  it("keeps solo inner full width outside 2-col container query", () => {
    const soloBlock = globalsCss.match(
      /\.overview-chart-grid__inner--solo \{[\s\S]*?\}/
    )?.[0];
    expect(soloBlock).toContain("width: 100%");
    expect(soloBlock).toContain("max-width: 100%");
  });
});
