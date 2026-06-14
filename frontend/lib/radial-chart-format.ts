import type { ChartRow } from "@/app/chart-types";
import { shareCompositionAllowed } from "@/lib/final-chart-presentation";

/** Tolerance when validating that share percentages sum to ~100%. */
export const RADIAL_SHARE_SUM_TOLERANCE = 1.5;

export function radialSliceTotal(rows: ChartRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum + (Number.isFinite(row.value) ? Math.abs(Number(row.value)) : 0),
    0
  );
}

/** share_pct = category_value / total_value * 100 */
export function radialSharePercent(value: number, total: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return (Math.abs(value) / total) * 100;
}

export function radialSharePercents(rows: ChartRow[]): number[] {
  const total = radialSliceTotal(rows);
  if (total <= 0) return [];
  return rows.map((row) => radialSharePercent(row.value, total) ?? 0);
}

/** Sum of computed share_pct values (should be ~100 for valid composition). */
export function radialSharePercentSum(rows: ChartRow[]): number {
  return radialSharePercents(rows).reduce((sum, pct) => sum + pct, 0);
}

function radialNumericValues(rows: ChartRow[]): number[] {
  return rows
    .map((row) => row.value)
    .filter((value): value is number => Number.isFinite(value));
}

/**
 * True when slice values are already percentage points (or fractions) that sum to ~100%.
 */
export function radialRawValuesSumTo100Percent(rows: ChartRow[]): boolean {
  const values = radialNumericValues(rows);
  if (values.length < 2 || values.some((value) => value < 0)) return false;
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (values.every((value) => value >= 0 && value <= 1)) {
    return sum >= 1 - 0.02 && sum <= 1 + 0.02;
  }
  if (values.every((value) => value <= 100)) {
    return (
      sum >= 100 - RADIAL_SHARE_SUM_TOLERANCE &&
      sum <= 100 + RADIAL_SHARE_SUM_TOLERANCE
    );
  }
  return false;
}

/**
 * False when slice values are rate metrics or %-points that do not form a whole
 * (e.g. conversion rates summing to >100%). In those cases show raw contributions.
 */
export function radialShouldUseSharePercentDisplay(rows: ChartRow[]): boolean {
  const values = radialNumericValues(rows);
  if (values.length < 2) return false;

  const positiveSum = values.reduce(
    (acc, value) => acc + (value > 0 ? value : 0),
    0
  );
  if (positiveSum <= 0) return false;

  if (radialRawValuesSumTo100Percent(rows)) return true;

  if (
    values.every((value) => value >= 0 && value <= 100) &&
    positiveSum > 100 + RADIAL_SHARE_SUM_TOLERANCE
  ) {
    return false;
  }

  const computedSum = radialSharePercentSum(rows);
  return (
    computedSum >= 100 - RADIAL_SHARE_SUM_TOLERANCE &&
    computedSum <= 100 + RADIAL_SHARE_SUM_TOLERANCE
  );
}

/** Format slice values as % only when data is already normalized to ~100%. */
export function radialShouldFormatValuesAsPercent(rows: ChartRow[]): boolean {
  return radialRawValuesSumTo100Percent(rows);
}

export function radialShareDisplayAllowed(
  rows: ChartRow[],
  title?: string | null,
  question?: string | null
): boolean {
  const titleAllowsShare = shareCompositionAllowed(title ?? "", question ?? undefined);
  if (!titleAllowsShare && !radialRawValuesSumTo100Percent(rows)) {
    return false;
  }
  return radialShouldUseSharePercentDisplay(rows);
}

function formatRadialNumeric(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Tooltip value line: raw contribution or share % depending on data shape. */
export function formatRadialTooltipValue(
  rows: ChartRow[],
  payload: ChartRow | undefined,
  rawValue: unknown
): string {
  const num =
    typeof rawValue === "number"
      ? rawValue
      : Number(payload?.value ?? rawValue);
  const display = payload?.displayValue?.trim();
  const valueText =
    display ||
    (Number.isFinite(num) ? formatRadialNumeric(num) : String(rawValue ?? "—"));

  if (!Number.isFinite(num) || rows.length < 2) return valueText;

  if (!radialShouldUseSharePercentDisplay(rows)) {
    return valueText;
  }

  const total = radialSliceTotal(rows);
  const share = radialSharePercent(num, total);
  if (share == null) return valueText;

  if (radialRawValuesSumTo100Percent(rows)) {
    return `${share.toFixed(1)}%`;
  }

  return `${valueText} (${share.toFixed(1)}%)`;
}
