import type { ChartRow } from "@/app/chart-types";
import { shareCompositionAllowed } from "@/lib/final-chart-presentation";
import {
  formatExecutiveMetricValue,
  formatMetricNumber,
  readChartRowRawValue,
  type MetricFormatContext,
} from "@/lib/metric-value-format";

/** Middle dot separator for radial legend / tooltip / footer lines. */
export const RADIAL_LEGEND_SEP = " · ";

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

function formatRadialContributionValue(
  row: ChartRow,
  ctx?: MetricFormatContext
): string {
  const raw = readChartRowRawValue(row);
  if (!Number.isFinite(raw)) {
    return row.displayValue?.trim() || "—";
  }
  if (Math.abs(raw) >= 10_000) {
    return formatMetricNumber(raw, "compact");
  }
  return formatExecutiveMetricValue(row, ctx ?? { chartRows: [row] });
}

function formatRadialSharePercentRounded(value: number, total: number): string | null {
  const share = radialSharePercent(value, total);
  if (share == null) return null;
  return `${Math.round(share)}%`;
}

/** Legend / footer line: Category · 54% · 4.27M */
export function formatRadialLegendEntry(
  rows: ChartRow[],
  categoryName: string,
  ctx?: MetricFormatContext
): string {
  const name = categoryName.trim();
  const row = rows.find((r) => String(r.name ?? "").trim() === name);
  if (!row || rows.length < 2) return name;

  const total = radialSliceTotal(rows);
  if (total <= 0) return name;

  if (!radialShouldUseSharePercentDisplay(rows)) {
    return `${name}${RADIAL_LEGEND_SEP}${formatRadialContributionValue(row, ctx)}`;
  }

  const shareText = formatRadialSharePercentRounded(row.value, total) ?? "—";
  if (radialRawValuesSumTo100Percent(rows)) {
    return `${name}${RADIAL_LEGEND_SEP}${shareText}`;
  }

  const valueText = formatRadialContributionValue(row, ctx);
  return `${name}${RADIAL_LEGEND_SEP}${shareText}${RADIAL_LEGEND_SEP}${valueText}`;
}

/** Formatted slice total for radial footer chips. */
export function formatRadialSliceTotalLabel(
  rows: ChartRow[],
  ctx?: MetricFormatContext
): string {
  const total = radialSliceTotal(rows);
  if (total <= 0) return "—";
  if (radialShouldUseSharePercentDisplay(rows) && !radialRawValuesSumTo100Percent(rows)) {
    return formatMetricNumber(total, "compact");
  }
  return "100%";
}

/** Recharts Pie soft-edge props for premium donut/pie presentation. */
export function resolveRadialPieEdgeProps(args: {
  kind: "pie" | "donut";
  overviewMiniRadial?: boolean;
}): { paddingAngle: number; cornerRadius: number } {
  const paddingAngle = args.overviewMiniRadial ? 3 : 2;
  const cornerRadius = args.kind === "donut" ? (args.overviewMiniRadial ? 4 : 3) : 0;
  return { paddingAngle, cornerRadius };
}

/** Tooltip value line: Category · share · contribution when composition is valid. */
export function formatRadialTooltipValue(
  rows: ChartRow[],
  payload: ChartRow | undefined,
  rawValue: unknown,
  ctx?: MetricFormatContext
): string {
  const name = String(payload?.name ?? "").trim();
  if (name && rows.length >= 2) {
    const legendLine = formatRadialLegendEntry(rows, name, ctx);
    if (legendLine.includes(RADIAL_LEGEND_SEP)) return legendLine;
  }

  const num =
    typeof rawValue === "number"
      ? rawValue
      : Number(payload?.value ?? rawValue);
  const display = payload?.displayValue?.trim();
  const valueText =
    display ||
    (Number.isFinite(num) ? formatRadialContributionValue(payload ?? { name: "", value: num }, ctx) : String(rawValue ?? "—"));

  if (!Number.isFinite(num) || rows.length < 2) return valueText;

  if (!radialShouldUseSharePercentDisplay(rows)) {
    return valueText;
  }

  const total = radialSliceTotal(rows);
  const shareText = formatRadialSharePercentRounded(num, total);
  if (shareText == null) return valueText;

  if (radialRawValuesSumTo100Percent(rows)) {
    return shareText;
  }

  return `${shareText}${RADIAL_LEGEND_SEP}${valueText}`;
}
