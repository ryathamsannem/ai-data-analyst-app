import { describe, expect, it } from "vitest";
import {
  isOverviewChartGridSoloRow,
  overviewChartGridSoloRowCount,
  overviewChartGridSoloRowStyle,
} from "./overview-chart-grid-layout";

describe("isOverviewChartGridSoloRow", () => {
  it("marks only the last chart for odd totals (5, 7, 9)", () => {
    for (const total of [5, 7, 9]) {
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

  it("spans the only chart in a single-chart dashboard", () => {
    expect(isOverviewChartGridSoloRow(0, 1)).toBe(false);
    expect(overviewChartGridSoloRowCount(1)).toBe(1);
  });
});

describe("overviewChartGridSoloRowStyle", () => {
  it("returns full-row grid placement for solo cells", () => {
    expect(overviewChartGridSoloRowStyle(4, 5)).toEqual({
      gridColumn: "1 / -1",
      width: "100%",
      maxWidth: "100%",
    });
    expect(overviewChartGridSoloRowStyle(0, 4)).toEqual({
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
