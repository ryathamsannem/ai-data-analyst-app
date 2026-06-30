import type { MetricFormatContext } from "@/lib/metric-value-format";
import { formatOverviewLineYAxisTick } from "@/lib/overview-premium-axis-domain";

export type LineValueLabelSurface = "live" | "export";

export type LineValueLabelRow = { value: number };

export type LineValueLabelPlacement = "above" | "below";

export type LineValueLabelOptions = {
  surface?: LineValueLabelSurface;
  /** Plot inner width — improves collision checks when known. */
  plotWidthPx?: number;
  /** Label text estimator — defaults to numeric string. */
  formatLabel?: (value: number) => string;
  fontSizePx?: number;
};

export type TrendValueLabelChartKind = "line" | "area";

export type LineValueLabelViewBox = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const DEFAULT_OVERVIEW_PLOT_WIDTH_PX = 320;
const DEFAULT_SESSION_PLOT_WIDTH_PX = 760;
const DEFAULT_EXPORT_PLOT_WIDTH_PX = 860;

/** Plot-top / plot-bottom band where labels flip to the opposite side. */
const LINE_LABEL_EDGE_BAND_RATIO = 0.2;

export const LINE_LABEL_OFFSET_PX = 8;
export const LINE_LABEL_CHAR_WIDTH_PX = 6.1;
export const LINE_LABEL_MIN_SLOT_PAD_PX = 3;

/** Area charts use a slightly stricter horizontal spacing estimate. */
const AREA_LABEL_WIDTH_USAGE_RATIO = 0.84;
const AREA_LABEL_EXTRA_SLOT_PAD_PX = 2;
/** Area charts label every point only up to this count when spacing is safe. */
const AREA_ALL_LABELS_MAX_POINTS = 6;
/** 7–8 point area charts may show all labels only when spacing is clean. */
const AREA_ALL_LABELS_WITH_SAFETY_MAX_POINTS = 8;

/** Indices for first, latest, highest, and lowest finite points — deduped. */
export function selectLineKeyPointIndices(
  rows: readonly LineValueLabelRow[]
): number[] {
  if (rows.length === 0) return [];

  const indices = new Set<number>();
  indices.add(0);
  indices.add(rows.length - 1);

  let hiIdx = -1;
  let loIdx = -1;
  let hiVal = -Infinity;
  let loVal = Infinity;

  for (let i = 0; i < rows.length; i++) {
    const v = rows[i]!.value;
    if (!Number.isFinite(v)) continue;
    if (hiIdx < 0 || v > hiVal) {
      hiIdx = i;
      hiVal = v;
    }
    if (loIdx < 0 || v < loVal) {
      loIdx = i;
      loVal = v;
    }
  }

  if (hiIdx >= 0) indices.add(hiIdx);
  if (loIdx >= 0) indices.add(loIdx);
  return [...indices].sort((a, b) => a - b);
}

export function resolveDefaultLineLabelPlotWidthPx(
  surface: LineValueLabelSurface = "live",
  explicit?: number
): number {
  if (explicit != null && explicit > 0) return explicit;
  return surface === "export"
    ? DEFAULT_EXPORT_PLOT_WIDTH_PX
    : DEFAULT_SESSION_PLOT_WIDTH_PX;
}

export function estimateLineLabelTextWidthPx(
  text: string,
  fontSizePx = 11
): number {
  const scale = fontSizePx / 11;
  return Math.max(
    text.length * LINE_LABEL_CHAR_WIDTH_PX * scale,
    fontSizePx * 1.8
  );
}

/** Horizontal spacing heuristic — if false, fall back to key labels for 7–12 point charts. */
export function canSafelyLabelAllLinePoints(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): boolean {
  const finite = rows
    .map((row, index) => ({ index, value: row.value }))
    .filter((entry) => Number.isFinite(entry.value));

  if (finite.length < 2) return false;

  const surface = options?.surface ?? "live";
  const plotWidth = resolveDefaultLineLabelPlotWidthPx(
    surface,
    options?.plotWidthPx
  );
  const fontSize = options?.fontSizePx ?? (surface === "export" ? 11 : 10);
  const formatLabel = options?.formatLabel ?? ((v: number) => String(v));
  const usableWidth = plotWidth * 0.86;
  const slotWidth = usableWidth / finite.length;
  const maxLabelWidth = Math.max(
    ...finite.map((entry) =>
      estimateLineLabelTextWidthPx(formatLabel(entry.value), fontSize)
    )
  );

  return slotWidth >= maxLabelWidth + LINE_LABEL_MIN_SLOT_PAD_PX;
}

/** Stricter spacing heuristic for area charts — heavier fill reads as more crowded. */
export function canSafelyLabelAllAreaPoints(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): boolean {
  const finite = rows
    .map((row, index) => ({ index, value: row.value }))
    .filter((entry) => Number.isFinite(entry.value));

  if (finite.length < 2) return false;

  const surface = options?.surface ?? "live";
  const plotWidth = resolveDefaultLineLabelPlotWidthPx(
    surface,
    options?.plotWidthPx
  );
  const fontSize = options?.fontSizePx ?? (surface === "export" ? 11 : 10);
  const formatLabel = options?.formatLabel ?? ((v: number) => String(v));
  const usableWidth = plotWidth * AREA_LABEL_WIDTH_USAGE_RATIO;
  const slotWidth = usableWidth / finite.length;
  const maxLabelWidth = Math.max(
    ...finite.map((entry) =>
      estimateLineLabelTextWidthPx(formatLabel(entry.value), fontSize)
    )
  );

  return (
    slotWidth >=
    maxLabelWidth + LINE_LABEL_MIN_SLOT_PAD_PX + AREA_LABEL_EXTRA_SLOT_PAD_PX
  );
}

/**
 * Clutter-safe line value label selection:
 * - 2–12 finite points: all points when spacing is safe, else key points
 * - 13–24: first, latest, highest, lowest
 * - dense: key points only up to live/export caps, else none
 */
export function selectLineValueLabelIndices(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): number[] {
  const surface = options?.surface ?? "live";
  const finiteIndices = rows
    .map((row, index) => ({ index, value: row.value }))
    .filter((entry) => Number.isFinite(entry.value))
    .map((entry) => entry.index);

  if (finiteIndices.length < 2) return [];

  const n = rows.length;
  const keyIndices = selectLineKeyPointIndices(rows);

  if (n <= 12) {
    return canSafelyLabelAllLinePoints(rows, options)
      ? finiteIndices
      : keyIndices;
  }

  if (n <= 24) return keyIndices;

  if (surface === "export" && n <= 36) return keyIndices;
  return [];
}

/**
 * Clutter-safe area value label selection (more conservative than line):
 * - 2–6 finite points: all points when spacing is safe, else key points
 * - 7–8: all points only when spacing is clean, else key points
 * - 9–12: key points only (first, latest, highest, lowest)
 * - 13+: key points only up to live/export caps, else none
 */
export function selectAreaValueLabelIndices(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): number[] {
  const surface = options?.surface ?? "live";
  const finiteIndices = rows
    .map((row, index) => ({ index, value: row.value }))
    .filter((entry) => Number.isFinite(entry.value))
    .map((entry) => entry.index);

  if (finiteIndices.length < 2) return [];

  const n = rows.length;
  const keyIndices = selectLineKeyPointIndices(rows);
  const canLabelAll = canSafelyLabelAllAreaPoints(rows, options);

  if (n <= AREA_ALL_LABELS_MAX_POINTS) {
    return canLabelAll ? finiteIndices : keyIndices;
  }

  if (n <= AREA_ALL_LABELS_WITH_SAFETY_MAX_POINTS) {
    return canLabelAll ? finiteIndices : keyIndices;
  }

  if (n <= 12) return keyIndices;

  if (n <= 24) return keyIndices;

  if (surface === "export" && n <= 36) return keyIndices;
  return [];
}

export function buildAreaValueLabelIndexSet(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): Set<number> {
  return new Set(selectAreaValueLabelIndices(rows, options));
}

export function shouldShowAreaPointLabels(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): boolean {
  return selectAreaValueLabelIndices(rows, options).length > 0;
}

export function buildLineValueLabelIndexSet(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): Set<number> {
  return new Set(selectLineValueLabelIndices(rows, options));
}

export function shouldShowLinePointLabels(
  rows: readonly LineValueLabelRow[],
  options?: LineValueLabelOptions
): boolean {
  return selectLineValueLabelIndices(rows, options).length > 0;
}

/**
 * Smart above/below placement — no rotation.
 * Top band: below point. Bottom band: above point. Middle: slope / parity.
 */
export function resolveLinePointLabelPlacement(args: {
  index: number;
  y: number;
  value: number;
  values: readonly number[];
  viewBox?: LineValueLabelViewBox;
}): LineValueLabelPlacement {
  const plotTop = Number(args.viewBox?.y ?? NaN);
  const plotHeight = Number(args.viewBox?.height ?? NaN);

  if (Number.isFinite(plotTop) && Number.isFinite(plotHeight) && plotHeight > 0) {
    const relativeY = (args.y - plotTop) / plotHeight;
    if (relativeY <= LINE_LABEL_EDGE_BAND_RATIO) return "below";
    if (relativeY >= 1 - LINE_LABEL_EDGE_BAND_RATIO) return "above";
  }

  const prev = args.index > 0 ? args.values[args.index - 1] : args.value;
  const next =
    args.index < args.values.length - 1
      ? args.values[args.index + 1]
      : args.value;
  const prevFinite = Number.isFinite(prev);
  const nextFinite = Number.isFinite(next);

  if (prevFinite && nextFinite) {
    const isPeak = args.value >= prev && args.value >= next;
    const isTrough = args.value <= prev && args.value <= next;
    if (isPeak && !isTrough) return "below";
    if (isTrough && !isPeak) return "above";
  }

  return args.index % 2 === 0 ? "above" : "below";
}

export function resolveLinePointLabelY(
  y: number,
  placement: LineValueLabelPlacement,
  offsetPx = LINE_LABEL_OFFSET_PX
): number {
  return placement === "below" ? y + offsetPx : y - offsetPx;
}

/**
 * Area labels prefer the stroke edge — above the point in the middle band so
 * text does not sit inside the filled region.
 */
export function resolveAreaPointLabelPlacement(args: {
  index: number;
  y: number;
  value: number;
  values: readonly number[];
  viewBox?: LineValueLabelViewBox;
}): LineValueLabelPlacement {
  const plotTop = Number(args.viewBox?.y ?? NaN);
  const plotHeight = Number(args.viewBox?.height ?? NaN);

  if (Number.isFinite(plotTop) && Number.isFinite(plotHeight) && plotHeight > 0) {
    const relativeY = (args.y - plotTop) / plotHeight;
    if (relativeY <= LINE_LABEL_EDGE_BAND_RATIO) return "below";
    if (relativeY >= 1 - LINE_LABEL_EDGE_BAND_RATIO) return "above";
    return "above";
  }

  return resolveLinePointLabelPlacement(args);
}

/** Line point labels — same metric-aware compact formatting as line Y-axis ticks. */
export function formatLineValueLabel(
  value: number,
  ctx: MetricFormatContext = {}
): string {
  return formatOverviewLineYAxisTick(value, ctx);
}

/** Area point labels reuse the same trend-axis formatter as line charts. */
export const formatAreaValueLabel = formatLineValueLabel;
