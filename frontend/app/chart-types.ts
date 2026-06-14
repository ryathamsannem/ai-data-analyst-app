/** Shared chart primitives for AI + dashboard snapshots (used by chart session + page). */

export type ChartRow = {
  name: string;
  value: number;
  /** Axis/tooltip formatted string — do not use for PDF appendix or raw exports. */
  displayValue?: string;
  /** Analytical magnitude when distinct from `value` (optional). */
  rawValue?: number;
  /** Normalized magnitude (e.g. 0–1 share) when distinct from `value` (optional). */
  normalizedValue?: number;
  x?: number;
  displayX?: string;
  [segmentKey: string]: string | number | undefined;
};

export type ChartKind =
  | "bar"
  | "line"
  | "area"
  | "bar_horizontal"
  | "pie"
  | "donut"
  | "scatter"
  | "histogram"
  | "";

export function fallbackChartNumericDisplay(
  chartKind: ChartKind,
  num: number,
  opts?: { radialValuesArePercent?: boolean }
): string {
  if (!Number.isFinite(num)) return String(num);
  if (
    (chartKind === "pie" || chartKind === "donut") &&
    opts?.radialValuesArePercent
  ) {
    return `${num.toFixed(1)}%`;
  }
  if (chartKind === "histogram") {
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (Number.isInteger(num)) return num.toLocaleString();
  const abs = Math.abs(num);
  const decimals = abs >= 100 || abs < 1e-6 ? 0 : 1;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
