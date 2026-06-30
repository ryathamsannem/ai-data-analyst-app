import type { CSSProperties } from "react";

/**
 * True when a chart cell should span both columns in the overview 2-col grid
 * (odd total count, not the only chart, last index).
 */
export function isOverviewChartGridSoloRow(index: number, total: number): boolean {
  return total > 1 && total % 2 === 1 && index === total - 1;
}

/** Inline grid placement — sequential L→R; lone last row spans row and centers. */
export function overviewChartGridSoloRowStyle(
  index: number,
  total: number,
): CSSProperties {
  if (isOverviewChartGridSoloRow(index, total)) {
    return {
      gridColumn: "1 / -1",
      justifySelf: "center",
      width: "100%",
    };
  }
  return {
    gridColumn: "span 1",
    width: "100%",
    maxWidth: "100%",
  };
}

/** Count how many cells should span full width for a given chart total. */
export function overviewChartGridSoloRowCount(total: number): number {
  return total > 1 && total % 2 === 1 ? 1 : total === 1 ? 1 : 0;
}
