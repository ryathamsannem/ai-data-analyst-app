import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE,
} from "@/lib/horizontal-bar-visual";
import {
  formatExecutiveMetricValue,
  formatExecutivePercentPointGap,
  formatMetricSpreadGap,
  metricLabelImpliesPrecisionBarLabels,
  readChartRowRawValue,
  resolveMetricValueFormat,
  type MetricFormatContext,
} from "@/lib/metric-value-format";
import {
  isFocusedVerticalBarRateChart,
  resolveOverviewBarValueDomain,
  roundExecutiveAxisMaximum,
} from "@/lib/overview-bar-value-domain";
import { formatOverviewBarValueAxisTick } from "@/lib/overview-premium-axis-domain";
import { countMetadataChipsInExportRoot } from "@/lib/chart-metadata-chips";

export { roundExecutiveAxisMaximum };

/** Export-only typography and plot tuning (on-screen dashboard unchanged). */
export const OVERVIEW_PNG_EXPORT_AXIS_TICK_PX = 14;
export const OVERVIEW_PNG_EXPORT_AXIS_TITLE_PX = 15;
export const OVERVIEW_PNG_EXPORT_LINE_STROKE_PX = 4;
export const OVERVIEW_PNG_EXPORT_MARKER_R_PX = 6;
export const OVERVIEW_PNG_EXPORT_HBAR_VALUE_PAD_RATIO = 0.06;
export const OVERVIEW_PNG_EXPORT_HBAR_CATEGORY_PAD_PX = 14;
/** Re-export — canonical value lives in horizontal-bar-visual.ts */
export const OVERVIEW_PNG_EXPORT_HBAR_MAX_SIZE = OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE;
export const OVERVIEW_PNG_EXPORT_VBAR_MAX_SIZE = 52;
/** Touching histogram bins on overview mini cards (live). */
export const OVERVIEW_HISTOGRAM_LIVE_MAX_BAR_SIZE = 52;
/** Histogram export — wider bins for PNG readability at capture resolution. */
export const OVERVIEW_PNG_EXPORT_HISTOGRAM_MAX_SIZE = 58;
export const OVERVIEW_PNG_EXPORT_MARGIN_TOP = 4;
export const OVERVIEW_PNG_EXPORT_MARGIN_SIDE = 6;
export const OVERVIEW_PNG_EXPORT_MARGIN_BOTTOM_HBAR = 18;
export const OVERVIEW_PNG_EXPORT_MARGIN_BOTTOM_VBAR = 22;
export const OVERVIEW_PNG_EXPORT_PRIMARY_BAR_COLOR = "#6366f1";

/**
 * Chart kind actually rendered in an overview dashboard card (may differ from
 * `displayKind` when bar charts fall back to horizontal orientation).
 */
export function resolveOverviewEffectivePresentationKind(
  displayKind: ChartKind,
  renderBarAsHorizontal: boolean
): ChartKind {
  if (renderBarAsHorizontal) return "bar_horizontal";
  return displayKind;
}

/** End-of-bar value labels when categorical spread is tight (export-only). */
export function shouldShowPngBarEndValueLabels(
  rows: readonly { value: number }[]
): boolean {
  const vals = rows
    .map((r) => r.value)
    .filter((v) => Number.isFinite(v));
  if (vals.length < 2) return false;
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = maxV - minV;
  if (span <= 0) return false;
  const spreadRatio = span / Math.max(Math.abs(maxV), 1);
  return spreadRatio < 0.28 || span <= 10;
}

const BAR_LABEL_MAX_SAFE_CHARS = 7;
const BAR_LABEL_MIN_BAR_RATIO = 0.62;
/** Default max categories for vertical bar top labels when overlap risk is low. */
const BAR_VALUE_LABEL_MAX_CATEGORIES = 6;
/** Percent/rate/score metrics may show labels on slightly more categories. */
const BAR_VALUE_LABEL_PRECISION_MAX_CATEGORIES = 8;

/** True when in-bar labels would likely clip or bleed on the shortest bar. */
export function barValueLabelOverlapRisk(
  values: readonly number[],
  formatValue: (value: number) => string
): boolean {
  if (values.length <= 1) return false;
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  if (!Number.isFinite(maxV) || maxV <= 0) return true;
  if (minV / maxV < BAR_LABEL_MIN_BAR_RATIO) return true;

  const labels = values.map((v) => formatValue(v));
  const maxLen = Math.max(...labels.map((s) => String(s).length));
  if (maxLen > BAR_LABEL_MAX_SAFE_CHARS) return true;

  return false;
}

/**
 * Vertical bar top labels when category count is modest and labels fit without overlap.
 * Percent/rate/score metrics allow a few more categories than large numeric metrics.
 */
export function shouldShowOverviewBarValueLabels(
  rows: readonly { value: number }[],
  formatValue: (value: number) => string,
  options?: { metricCtx?: MetricFormatContext }
): boolean {
  const values = rows.map((r) => r.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return false;
  const maxCategories =
    options?.metricCtx && metricLabelImpliesPrecisionBarLabels(options.metricCtx)
      ? BAR_VALUE_LABEL_PRECISION_MAX_CATEGORIES
      : BAR_VALUE_LABEL_MAX_CATEGORIES;
  if (values.length > maxCategories) return false;
  return !barValueLabelOverlapRisk(values, formatValue);
}

function formatPercentBarTopLabelDisplay(
  display: number,
  decimals: number
): string {
  const rounded = Number(display.toFixed(decimals));
  return `${rounded.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })}%`;
}

/** True when focused V-Bar percent labels need extra decimal precision. */
export function overviewBarLabelsNeedExtraPrecision(
  rows: readonly ChartRow[],
  ctx: MetricFormatContext
): boolean {
  return barTopLabelsNeedExtraPrecision(rows, ctx);
}

function barTopLabelsNeedExtraPrecision(
  rows: readonly ChartRow[],
  ctx: MetricFormatContext
): boolean {
  if (!isFocusedVerticalBarRateChart(rows, ctx)) return false;

  const rawVals = rows
    .map((r) => readChartRowRawValue(r))
    .filter((v) => Number.isFinite(v));
  if (rawVals.length < 2) return false;

  const defaultLabels = rawVals.map((v) =>
    formatOverviewBarValueAxisTick(v, rows, ctx)
  );

  for (let i = 0; i < rawVals.length; i++) {
    for (let j = i + 1; j < rawVals.length; j++) {
      if (Math.abs(rawVals[i]! - rawVals[j]!) <= 1e-9) continue;
      if (defaultLabels[i] === defaultLabels[j]) return true;
    }
  }
  return false;
}

/**
 * V-Bar top / in-bar value labels — may use extra decimal precision on focused
 * percent/rate charts when default axis rounding would duplicate distinct values.
 * Axis tick formatting is unchanged; pass this only to LabelList formatters.
 */
export function formatOverviewBarTopValueLabel(
  value: number,
  rows: readonly ChartRow[],
  ctx: MetricFormatContext = {}
): string {
  if (!Number.isFinite(value)) return String(value);

  const defaultLabel = formatOverviewBarValueAxisTick(value, rows, ctx);
  if (!barTopLabelsNeedExtraPrecision(rows, ctx)) return defaultLabel;

  const format = resolveMetricValueFormat(ctx);
  if (format !== "percent") return defaultLabel;

  const rawVals = rows
    .map((r) => readChartRowRawValue(r))
    .filter((v) => Number.isFinite(v));
  const maxAbs = rawVals.length
    ? Math.max(...rawVals.map((v) => Math.abs(v)))
    : Math.abs(value);
  const display = maxAbs <= 1.05 ? value * 100 : value;

  let decimals = 2;
  while (decimals <= 3) {
    const labels = rawVals.map((v) => {
      const d = maxAbs <= 1.05 ? v * 100 : v;
      return formatPercentBarTopLabelDisplay(d, decimals);
    });
    if (new Set(labels).size === labels.length) {
      return formatPercentBarTopLabelDisplay(display, decimals);
    }
    decimals += 1;
  }

  return formatPercentBarTopLabelDisplay(display, 3);
}

/**
 * Executive insight / signal card metric display — matches V-Bar top label
 * precision on focused percent/rate vertical bars; otherwise unchanged.
 */
export function formatExecutiveInsightMetricValue(
  row: ChartRow,
  ctx: MetricFormatContext = {}
): string {
  const raw = readChartRowRawValue(row);
  if (!Number.isFinite(raw)) {
    return formatExecutiveMetricValue(row, ctx);
  }
  const format = resolveMetricValueFormat(ctx);
  const rows = ctx.chartRows;
  if (
    format === "percent" &&
    ctx.presentationKind === "bar" &&
    rows &&
    rows.length >= 2 &&
    overviewBarLabelsNeedExtraPrecision(rows, ctx)
  ) {
    return formatOverviewBarTopValueLabel(raw, rows, ctx);
  }
  return formatExecutiveMetricValue(row, ctx);
}

/**
 * Top/Lowest spread for executive insight chips — matches focused V-Bar label
 * precision (percentage points) when extra decimal precision is required.
 */
export function formatExecutiveInsightSpreadGap(
  gap: number,
  ctx: MetricFormatContext = {}
): string {
  const rows = ctx.chartRows;
  const format = resolveMetricValueFormat(ctx);
  if (
    format === "percent" &&
    ctx.presentationKind === "bar" &&
    rows &&
    rows.length >= 2 &&
    overviewBarLabelsNeedExtraPrecision(rows, ctx)
  ) {
    let pp = gap;
    const vals = rows
      .map((row) => readChartRowRawValue(row))
      .filter((v) => Number.isFinite(v));
    const maxV = vals.length ? Math.max(...vals.map(Math.abs)) : Math.abs(gap);
    if (Math.abs(gap) <= 1 && maxV <= 1.05) {
      pp = gap * 100;
    }
    return formatExecutivePercentPointGap(pp, {
      skipFractionScale: true,
      decimals: 2,
    });
  }
  return formatMetricSpreadGap(gap, ctx);
}

/** Value-axis domain for horizontal bars — smart scale + export rounding. */
export function horizontalBarValueDomain(
  rows: readonly { value: number }[],
  rightPadRatio = OVERVIEW_PNG_EXPORT_HBAR_VALUE_PAD_RATIO,
  options?: { chartTitle?: string; metricLabel?: string }
): [number, number] {
  const smart = resolveOverviewBarValueDomain(rows, {
    chartTitle: options?.chartTitle,
    metricLabel: options?.metricLabel,
    presentationKind: "bar_horizontal",
    executiveRounding: true,
    rightPadRatio,
    overviewHorizontalBarHeadroom: true,
  });
  if (smart) return smart;

  const vals = rows.map((r) => r.value).filter((v) => Number.isFinite(v));
  const maxV = vals.length ? Math.max(0, ...vals) : 0;
  if (maxV <= 0) return [0, 1];
  const padded = maxV * (1 + rightPadRatio);
  return [0, roundExecutiveAxisMaximum(padded)];
}

export type OverviewBarChartOrientation = "horizontal" | "vertical" | "none";

/** Infer rendered bar orientation from Recharts grid layers in a capture root. */
export function detectOverviewExportBarOrientation(
  root: HTMLElement | null | undefined
): OverviewBarChartOrientation {
  if (!root) return "none";
  const hasVerticalGrid = Boolean(
    root.querySelector(
      ".recharts-cartesian-grid-vertical line, .recharts-cartesian-grid-vertical path"
    )
  );
  const hasHorizontalGrid = Boolean(
    root.querySelector(
      ".recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-horizontal path"
    )
  );
  if (hasVerticalGrid && !hasHorizontalGrid) return "horizontal";
  if (hasHorizontalGrid && !hasVerticalGrid) return "vertical";
  return "none";
}

export type OverviewDashboardExportParityInput = {
  displayKind: ChartKind;
  renderBarAsHorizontal: boolean;
  exportKind: ChartKind;
  exportRoot?: HTMLElement | null;
  chartTitle?: string | null;
  expectedPrimaryBarColor?: string;
  theme?: "light" | "dark";
  /** When set, export root must include at least this many metadata chips. */
  expectedMetadataChipCount?: number;
};

export type OverviewDashboardExportParityCheck = {
  id: "chartKind" | "orientation" | "colors" | "labels" | "theme" | "metadataChips";
  ok: boolean;
  message?: string;
};

export type OverviewDashboardExportParityResult = {
  ok: boolean;
  checks: OverviewDashboardExportParityCheck[];
};

function expectedOrientationForKind(kind: ChartKind): OverviewBarChartOrientation {
  if (kind === "bar_horizontal") return "horizontal";
  if (kind === "bar" || kind === "histogram") return "vertical";
  return "none";
}

function readPrimaryBarFill(root: HTMLElement | null | undefined): string | null {
  if (!root) return null;
  const shape = root.querySelector(
    ".recharts-bar-rectangle path, .recharts-bar-rectangle rect, .recharts-bar path"
  );
  if (!(shape instanceof SVGElement)) return null;
  const fill = shape.getAttribute("fill") || window.getComputedStyle(shape).fill;
  return fill?.trim() || null;
}

function normalizeHexColor(color: string): string {
  return color.trim().toLowerCase().replace(/\s/g, "");
}

/** Validate dashboard ↔ PNG export parity before/after offscreen capture. */
export function validateOverviewDashboardExportParity(
  input: OverviewDashboardExportParityInput
): OverviewDashboardExportParityResult {
  const expectedKind = resolveOverviewEffectivePresentationKind(
    input.displayKind,
    input.renderBarAsHorizontal
  );
  const checks: OverviewDashboardExportParityCheck[] = [];

  checks.push({
    id: "chartKind",
    ok: input.exportKind === expectedKind,
    message:
      input.exportKind === expectedKind
        ? undefined
        : `export kind ${input.exportKind} !== dashboard ${expectedKind}`,
  });

  const expectedOrientation = expectedOrientationForKind(expectedKind);
  const actualOrientation = detectOverviewExportBarOrientation(input.exportRoot);
  const orientationOk =
    expectedOrientation === "none" ||
    actualOrientation === "none" ||
    expectedOrientation === actualOrientation;
  checks.push({
    id: "orientation",
    ok: orientationOk,
    message: orientationOk
      ? undefined
      : `export orientation ${actualOrientation} !== dashboard ${expectedOrientation}`,
  });

  const expectedColor = normalizeHexColor(
    input.expectedPrimaryBarColor ?? OVERVIEW_PNG_EXPORT_PRIMARY_BAR_COLOR
  );
  const actualColorRaw = readPrimaryBarFill(input.exportRoot);
  const colorOk =
    !actualColorRaw ||
    normalizeHexColor(actualColorRaw) === expectedColor ||
    normalizeHexColor(actualColorRaw) === normalizeHexColor("#6366f1");
  checks.push({
    id: "colors",
    ok: colorOk,
    message: colorOk
      ? undefined
      : `bar fill ${actualColorRaw} !== expected ${expectedColor}`,
  });

  const titleEl = input.exportRoot?.querySelector(
    ".overview-png-export-header h3, .overview-dash-chart-card__title"
  );
  const exportTitle = titleEl?.textContent?.trim() ?? "";
  const expectedTitle = input.chartTitle?.trim() ?? "";
  const labelsOk = !expectedTitle || !exportTitle || exportTitle === expectedTitle;
  checks.push({
    id: "labels",
    ok: labelsOk,
    message: labelsOk
      ? undefined
      : `export title "${exportTitle}" !== dashboard "${expectedTitle}"`,
  });

  const themeOk =
    !input.theme ||
    !input.exportRoot ||
    (input.theme === "dark") ===
      document.documentElement.classList.contains("dark");
  checks.push({
    id: "theme",
    ok: themeOk,
    message: themeOk ? undefined : "export theme does not match document theme",
  });

  const expectedChipCount = input.expectedMetadataChipCount ?? 0;
  const actualChipCount = countMetadataChipsInExportRoot(input.exportRoot ?? null);
  const chipsOk =
    expectedChipCount <= 0 || actualChipCount >= expectedChipCount;
  checks.push({
    id: "metadataChips",
    ok: chipsOk,
    message: chipsOk
      ? undefined
      : `export metadata chips ${actualChipCount} < expected ${expectedChipCount}`,
  });

  return {
    ok: checks.every((c) => c.ok),
    checks,
  };
}
