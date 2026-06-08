import type { ChartRow } from "@/app/chart-types";

export function radialSliceTotal(rows: ChartRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum + (Number.isFinite(row.value) ? Math.abs(Number(row.value)) : 0),
    0
  );
}

export function radialSharePercent(value: number, total: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return (Math.abs(value) / total) * 100;
}

function formatRadialNumeric(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Tooltip value line: raw/display value plus share of total when meaningful. */
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

  const total = radialSliceTotal(rows);
  const share = Number.isFinite(num) ? radialSharePercent(num, total) : null;
  if (share != null && rows.length >= 2) {
    return `${valueText} (${share.toFixed(1)}%)`;
  }
  return valueText;
}
