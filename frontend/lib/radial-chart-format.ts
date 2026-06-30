import type { ChartRow } from "@/app/chart-types";
import { resolveRadialPalette } from "@/lib/chart-palette";
import { shareCompositionAllowed } from "@/lib/final-chart-presentation";
import {
  appendMetricUnitSuffix,
  formatExecutiveMetricValue,
  formatMetricNumber,
  readChartRowRawValue,
  resolveMetricValueFormat,
  type MetricFormatContext,
} from "@/lib/metric-value-format";

/** Middle dot separator for radial legend / tooltip / footer lines. */
export const RADIAL_LEGEND_SEP = " · ";

/** Tolerance when validating that share percentages sum to ~100%. */
export const RADIAL_SHARE_SUM_TOLERANCE = 1.5;

export function radialSliceTotal(rows: readonly ChartRow[]): number {
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

export function radialSharePercents(rows: readonly ChartRow[]): number[] {
  const total = radialSliceTotal(rows);
  if (total <= 0) return [];
  return rows.map((row) => radialSharePercent(row.value, total) ?? 0);
}

/** Sum of computed share_pct values (should be ~100 for valid composition). */
export function radialSharePercentSum(rows: readonly ChartRow[]): number {
  return radialSharePercents(rows).reduce((sum, pct) => sum + pct, 0);
}

function radialNumericValues(rows: readonly ChartRow[]): number[] {
  return rows
    .map((row) => row.value)
    .filter((value): value is number => Number.isFinite(value));
}

/**
 * True when slice values are already percentage points (or fractions) that sum to ~100%.
 */
export function radialRawValuesSumTo100Percent(rows: readonly ChartRow[]): boolean {
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
export function radialShouldUseSharePercentDisplay(
  rows: readonly ChartRow[]
): boolean {
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
export function radialShouldFormatValuesAsPercent(rows: readonly ChartRow[]): boolean {
  return radialRawValuesSumTo100Percent(rows);
}

export function radialShareDisplayAllowed(
  rows: readonly ChartRow[],
  title?: string | null,
  question?: string | null
): boolean {
  const titleAllowsShare = shareCompositionAllowed(title ?? "", question ?? undefined);
  if (!titleAllowsShare && !radialRawValuesSumTo100Percent(rows)) {
    return false;
  }
  return radialShouldUseSharePercentDisplay(rows);
}

function radialContributionFormatContext(
  row: ChartRow,
  ctx?: MetricFormatContext
): MetricFormatContext {
  return {
    ...ctx,
    presentationKind: undefined,
    shareComposition: false,
    chartRows: ctx?.chartRows ?? [row],
  };
}

function formatRadialContributionValue(
  row: ChartRow,
  ctx?: MetricFormatContext
): string {
  const raw = readChartRowRawValue(row);
  if (!Number.isFinite(raw)) {
    return row.displayValue?.trim() || "—";
  }
  const contributionCtx = radialContributionFormatContext(row, ctx);
  if (Math.abs(raw) >= 10_000) {
    const compact = formatMetricNumber(raw, "compact");
    return appendMetricUnitSuffix(
      compact,
      contributionCtx.metricLabel,
      contributionCtx.chartTitle
    );
  }
  const formatted = formatExecutiveMetricValue(row, contributionCtx);
  if (resolveMetricValueFormat(contributionCtx) === "percent") {
    return formatted;
  }
  return appendMetricUnitSuffix(
    formatted,
    contributionCtx.metricLabel,
    contributionCtx.chartTitle
  );
}

function formatRadialSharePercentDisplay(
  value: number,
  total: number,
  rows: readonly ChartRow[]
): string | null {
  const share = radialSharePercent(value, total);
  if (share == null) return null;
  const decimals = resolveRadialSharePercentDecimals(rows, total);
  if (decimals === 0) return `${Math.round(share)}%`;
  const text = share.toFixed(1);
  return `${text.endsWith(".0") ? text.slice(0, -2) : text}%`;
}

/**
 * Decimal places for radial share labels — 1 when rounded integers would collide
 * or when adjacent shares are very close.
 */
export function resolveRadialSharePercentDecimals(
  rows: readonly ChartRow[],
  total: number
): number {
  if (!radialShouldUseSharePercentDisplay(rows) || total <= 0) return 0;
  const shares = rows
    .map((row) => radialSharePercent(row.value, total))
    .filter((share): share is number => share != null);
  if (shares.length < 2) return 0;

  const rounded0 = shares.map((share) => Math.round(share));
  if (new Set(rounded0).size < rounded0.length) return 1;

  const sorted = [...shares].sort((a, b) => b - a);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]! - sorted[i + 1]! < 1) return 1;
  }
  return 0;
}

/** Truncate radial legend line — preserve share/value tail after middle dot. */
export function truncateRadialLegendLine(
  line: string,
  maxChars: number
): string {
  if (line.length <= maxChars) return line;
  const sepIdx = line.indexOf(RADIAL_LEGEND_SEP);
  if (sepIdx === -1) {
    return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line;
  }
  const tail = line.slice(sepIdx);
  if (tail.length >= maxChars) {
    return tail.length > maxChars ? `${tail.slice(0, maxChars - 1)}…` : tail;
  }
  const name = line.slice(0, sepIdx);
  const nameBudget = maxChars - tail.length - 1;
  if (name.length <= nameBudget) return line;
  if (nameBudget <= 1) return `…${tail}`;
  return `${name.slice(0, nameBudget - 1)}…${tail}`;
}

/** Legend / footer line: Category · 54% · 4.27M */
export function formatRadialLegendEntry(
  rows: readonly ChartRow[],
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

  const shareText = formatRadialSharePercentDisplay(row.value, total, rows) ?? "—";
  if (radialRawValuesSumTo100Percent(rows)) {
    return `${name}${RADIAL_LEGEND_SEP}${shareText}`;
  }

  const valueText = formatRadialContributionValue(row, ctx);
  return `${name}${RADIAL_LEGEND_SEP}${shareText}${RADIAL_LEGEND_SEP}${valueText}`;
}

/** Formatted slice total for radial footer chips. */
export function formatRadialSliceTotalLabel(
  rows: readonly ChartRow[],
  ctx?: MetricFormatContext
): string {
  const total = radialSliceTotal(rows);
  if (total <= 0) return "—";
  if (radialShouldUseSharePercentDisplay(rows) && !radialRawValuesSumTo100Percent(rows)) {
    const compact = formatMetricNumber(total, "compact");
    return appendMetricUnitSuffix(
      compact,
      ctx?.metricLabel,
      ctx?.chartTitle
    );
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

/**
 * Sort share/composition radial rows high-to-low for legend and slice display.
 * Tie-break: category label ascending, then original row order.
 */
export function sortRadialDisplayRows(rows: readonly ChartRow[]): ChartRow[] {
  return rows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((a, b) => {
      const av = a.row.value;
      const bv = b.row.value;
      const aFin = Number.isFinite(av);
      const bFin = Number.isFinite(bv);
      if (aFin && bFin && av !== bv) return bv - av;
      if (aFin !== bFin) return aFin ? -1 : 1;
      const an = String(a.row.name ?? "").trim();
      const bn = String(b.row.name ?? "").trim();
      const labelCmp = an.localeCompare(bn, undefined, { sensitivity: "base" });
      if (labelCmp !== 0) return labelCmp;
      return a.sourceIndex - b.sourceIndex;
    })
    .map(({ row }) => row);
}

/** Order radial display rows for part-to-whole share charts; preserve source order otherwise. */
export function orderRadialShareDisplayRows(rows: readonly ChartRow[]): ChartRow[] {
  if (rows.length < 2 || !radialShouldUseSharePercentDisplay(rows)) {
    return [...rows];
  }
  return sortRadialDisplayRows(rows);
}

/** Stable slice fill — small-count palette for 2–4 slices; full palette otherwise. */
export function resolveRadialSliceFill(
  sourceRows: readonly ChartRow[],
  categoryName: string
): string {
  const palette = resolveRadialPalette(sourceRows.length);
  const colorIndex = radialSliceStableColorIndex(sourceRows, categoryName);
  return palette[colorIndex % palette.length] ?? palette[0] ?? "#6366f1";
}

/** Stable palette index from pre-sort row order (category name → original index). */
export function radialSliceStableColorIndex(
  sourceRows: readonly ChartRow[],
  categoryName: string
): number {
  const name = categoryName.trim();
  const idx = sourceRows.findIndex(
    (row) => String(row.name ?? "").trim() === name
  );
  return idx >= 0 ? idx : 0;
}

export type RadialLegendPayloadItem = {
  value: string;
  type: "circle";
  color: string;
  id: string;
};

/**
 * Explicit Recharts legend payload — preserves high-to-low display order.
 * (Default Pie Legend sorts categories alphabetically by name.)
 */
export function buildRadialLegendPayload(
  displayRows: readonly ChartRow[],
  sourceRows: readonly ChartRow[]
): RadialLegendPayloadItem[] {
  return displayRows.map((row, i) => {
    const name = String(row.name ?? "");
    return {
      value: name,
      type: "circle",
      color: resolveRadialSliceFill(sourceRows, name),
      id: `radial-legend-${name || i}`,
    };
  });
}

export type RadialExportLegendEntry = {
  label: string;
  color: string;
};

/** Ordered legend lines + colors for PNG/PDF composite (matches live ChartRenderer). */
export function buildRadialExportLegendEntries(
  displayRows: readonly ChartRow[],
  sourceRows: readonly ChartRow[],
  ctx?: MetricFormatContext
): RadialExportLegendEntry[] {
  const payload = buildRadialLegendPayload(displayRows, sourceRows);
  const lines = formatRadialVisibleLegendLines(displayRows, sourceRows, ctx);
  return payload.map((item, i) => ({
    label: lines[i] ?? item.value,
    color: item.color,
  }));
}

/** Visible legend label lines in slice/display order (feeds Recharts Legend formatter). */
export function formatRadialVisibleLegendLines(
  displayRows: readonly ChartRow[],
  sourceRows: readonly ChartRow[],
  ctx?: MetricFormatContext
): string[] {
  return displayRows.map((row) =>
    formatRadialLegendEntry(sourceRows, String(row.name ?? ""), ctx)
  );
}

/** Tooltip value line: Category · share · contribution when composition is valid. */
export function formatRadialTooltipValue(
  rows: readonly ChartRow[],
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
  const shareText = formatRadialSharePercentDisplay(num, total, rows);
  if (shareText == null) return valueText;

  if (radialRawValuesSumTo100Percent(rows)) {
    return shareText;
  }

  return `${shareText}${RADIAL_LEGEND_SEP}${valueText}`;
}
