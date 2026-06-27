import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  coercePercentDisplayNumber,
  metricFormatUsesPercent,
  metricLabelExcludesTightBarDomain,
  metricLabelImpliesPercent,
  metricLabelImpliesScoreLike,
  type MetricFormatContext,
} from "@/lib/metric-value-format";

const DEFAULT_BAR_RIGHT_PAD_RATIO = 0.06;

export type OverviewBarValueDomainOptions = {
  chartTitle?: string;
  metricLabel?: string;
  presentationKind?: ChartKind | string;
  /** Apply executive-friendly rounding (PNG export). */
  executiveRounding?: boolean;
  rightPadRatio?: number;
};

export type BoundedMetricBounds = {
  min: number;
  max: number;
  kind: "fraction" | "rating5" | "rating10" | "percent100";
};

const TIGHT_METRIC_LABEL_RE =
  /\b(satisfaction|rating|score|csat|nps|sentiment|utilization|rate|percent|percentage)\b/i;

/** Snap axis bounds to clean tick steps — avoids labels like 4.049999999. */
export function snapBarDomainBound(
  value: number,
  step: number,
  mode: "floor" | "ceil"
): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const scaled = value / step;
  const snapped =
    mode === "floor"
      ? Math.floor(scaled + 1e-9) * step
      : Math.ceil(scaled - 1e-9) * step;
  const decimals =
    step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : step >= 0.001 ? 3 : 4;
  return Number(snapped.toFixed(decimals));
}

export function inferDomainTickStep(span: number, boundsMax: number): number {
  if (boundsMax <= 1.05) {
    if (span <= 0.05) return 0.01;
    if (span <= 0.2) return 0.05;
    return 0.1;
  }
  if (boundsMax <= 5.5) {
    if (span <= 0.08) return 0.01;
    if (span <= 0.25) return 0.05;
    return 0.1;
  }
  if (boundsMax <= 10.5) {
    if (span <= 0.15) return 0.05;
    if (span <= 0.5) return 0.1;
    return 0.5;
  }
  if (boundsMax <= 100) {
    if (span <= 2) return 0.1;
    if (span <= 10) return 0.5;
    return 1;
  }
  if (span <= 2) return 0.1;
  if (span <= 10) return 0.5;
  return 1;
}

export function inferBoundedMetricBounds(args: {
  values: readonly number[];
  metricLabel?: string | null;
  chartTitle?: string | null;
  isPercent: boolean;
}): BoundedMetricBounds | null {
  const { values, metricLabel, chartTitle, isPercent } = args;
  if (values.length < 2) return null;
  if (metricLabelExcludesTightBarDomain(metricLabel, chartTitle)) return null;

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return null;

  const labelBlob = `${metricLabel ?? ""} ${chartTitle ?? ""}`.trim();
  const scoreLike = metricLabelImpliesScoreLike(metricLabel, chartTitle);
  const rateLike =
    isPercent ||
    metricLabelImpliesPercent(metricLabel) ||
    /\butilization\b/i.test(labelBlob);
  const tightLabel =
    scoreLike || rateLike || TIGHT_METRIC_LABEL_RE.test(labelBlob);

  if (isPercent || rateLike) {
    if (maxV <= 1.05 && minV >= 0) return { min: 0, max: 1, kind: "fraction" };
    return { min: 0, max: 100, kind: "percent100" };
  }

  if (scoreLike || /\b(satisfaction|rating|score|csat|nps|sentiment)\b/i.test(labelBlob)) {
    if (maxV <= 5.5 && minV >= 0) return { min: 0, max: 5, kind: "rating5" };
    if (maxV <= 10.5 && minV >= 0) return { min: 0, max: 10, kind: "rating10" };
    if (maxV <= 100 && minV >= 0) return { min: 0, max: 100, kind: "percent100" };
  }

  if (!tightLabel) return null;

  if (minV >= 0 && maxV <= 1.05) return { min: 0, max: 1, kind: "fraction" };
  if (minV >= 0 && maxV <= 5.5) return { min: 0, max: 5, kind: "rating5" };
  if (minV >= 0 && maxV <= 10.5) return { min: 0, max: 10, kind: "rating10" };
  if (minV >= 0 && maxV <= 100) return { min: 0, max: 100, kind: "percent100" };

  return null;
}

export function isLowVarianceOnBoundedScale(
  spanDisplay: number,
  bounds: BoundedMetricBounds,
  categoryCount: number
): boolean {
  const scaleSpan = bounds.max - bounds.min;
  if (scaleSpan <= 0) return false;
  const spreadPct = spanDisplay / scaleSpan;
  if (spreadPct < 0.25) return true;
  return categoryCount <= 8 && spreadPct < 0.4;
}

export function shouldUseTightBarDomain(args: {
  isPercent: boolean;
  spanDisplay: number;
  spreadRatio: number;
  categoryCount: number;
  minDisplay: number;
  maxDisplay: number;
  boundedBounds?: BoundedMetricBounds | null;
}): boolean {
  const {
    isPercent,
    spanDisplay,
    spreadRatio,
    categoryCount,
    minDisplay,
    maxDisplay,
    boundedBounds,
  } = args;

  if (
    boundedBounds &&
    isLowVarianceOnBoundedScale(spanDisplay, boundedBounds, categoryCount)
  ) {
    return true;
  }

  if (isPercent) {
    if (spanDisplay <= 8 && spreadRatio < 0.85) return true;
    if (maxDisplay <= 100 && minDisplay >= 0 && spreadRatio < 0.3) return true;
    if (maxDisplay <= 1.05 && spanDisplay <= 0.12) return true;
  }

  if (categoryCount <= 5 && spreadRatio < 0.12) return true;
  if (spreadRatio < 0.06) return true;
  return false;
}

export function zeroBaselineImprovesInterpretation(args: {
  isPercent: boolean;
  minDisplay: number;
  maxDisplay: number;
  spreadRatio: number;
  boundedBounds?: BoundedMetricBounds | null;
}): boolean {
  const { isPercent, minDisplay, maxDisplay, spreadRatio, boundedBounds } = args;
  if (minDisplay < 0) return false;

  if (
    boundedBounds &&
    isLowVarianceOnBoundedScale(
      maxDisplay - minDisplay,
      boundedBounds,
      2
    )
  ) {
    return false;
  }

  if (isPercent) {
    if (maxDisplay <= 100 && minDisplay > maxDisplay * 0.35) return false;
    if (maxDisplay <= 1.05 && minDisplay > 0.05) return false;
    return minDisplay <= maxDisplay * 0.2;
  }

  return minDisplay <= maxDisplay * 0.2 || spreadRatio >= 0.35;
}

/** Round padded axis maxima to executive-friendly tick boundaries. */
export function roundExecutiveAxisMaximum(paddedMax: number): number {
  if (!Number.isFinite(paddedMax) || paddedMax <= 0) return 1;
  const v = paddedMax;
  if (v <= 10) return Math.ceil(v);
  if (v <= 100) return Math.ceil(v / 5) * 5;
  if (v <= 1_000) return Math.ceil(v / 10) * 10;
  if (v <= 10_000) return Math.ceil(v / 100) * 100;
  if (v <= 100_000) return Math.ceil(v / 1_000) * 1_000;
  if (v <= 1_000_000) return Math.ceil(v / 10_000) * 10_000;
  return Math.ceil(v / 100_000) * 100_000;
}

function roundExecutiveDomainMinimum(
  value: number,
  span: number,
  bounds?: BoundedMetricBounds | null
): number {
  if (!Number.isFinite(value)) return value;
  if (bounds) {
    const step = inferDomainTickStep(span, bounds.max);
    return snapBarDomainBound(value, step, "floor");
  }
  const abs = Math.abs(value);
  if (abs <= 1) {
    const step = Math.max(span * 0.25, 0.002);
    return snapBarDomainBound(value, step, "floor");
  }
  if (abs <= 10 && span <= 2) {
    const step = inferDomainTickStep(span, 10);
    return snapBarDomainBound(value, step, "floor");
  }
  if (abs <= 100) {
    const step = span <= 2 ? 0.1 : span <= 10 ? 0.5 : 1;
    return snapBarDomainBound(value, step, "floor");
  }
  if (abs <= 10_000) return Math.floor(value / 10) * 10;
  return Math.floor(value / 100) * 100;
}

function roundExecutiveDomainMaximum(
  value: number,
  span: number,
  isPercent: boolean,
  bounds?: BoundedMetricBounds | null
): number {
  if (!Number.isFinite(value)) return value;
  if (bounds) {
    const step = inferDomainTickStep(span, bounds.max);
    return snapBarDomainBound(value, step, "ceil");
  }
  const abs = Math.abs(value);
  if (isPercent && abs <= 100) {
    const step = span <= 2 ? 0.1 : span <= 10 ? 0.5 : 1;
    return snapBarDomainBound(value, step, "ceil");
  }
  if (abs <= 1) {
    const step = Math.max(span * 0.25, 0.002);
    return snapBarDomainBound(value, step, "ceil");
  }
  if (abs <= 10 && span <= 2) {
    const step = inferDomainTickStep(span, 10);
    return snapBarDomainBound(value, step, "ceil");
  }
  return roundExecutiveAxisMaximum(value);
}

function boundedTightPadding(
  spanRaw: number,
  bounds: BoundedMetricBounds
): number {
  const minPad =
    bounds.kind === "rating5"
      ? 0.005
      : bounds.kind === "rating10"
        ? 0.05
        : bounds.kind === "fraction"
          ? 0.002
          : 0.05;
  return Math.max(spanRaw * 0.25, spanRaw * 0.15, minPad, 1e-6);
}

function clampDomainToBounds(
  domainMin: number,
  domainMax: number,
  bounds: BoundedMetricBounds
): [number, number] {
  const lo = Math.max(bounds.min, domainMin);
  const hiRaw = Math.min(bounds.max, domainMax);
  if (hiRaw <= lo) {
    return [lo, Math.min(bounds.max, lo + Math.max((hiRaw - lo) || 0.01, 1e-6))];
  }
  return [lo, hiRaw];
}

/** Smart bar value-axis domain — tight scale for low-spread / percent metrics. */
export function resolveOverviewBarValueDomain(
  rows: readonly { value: number }[],
  options: OverviewBarValueDomainOptions = {}
): [number, number] | undefined {
  const rawVals = rows.map((r) => r.value).filter((v) => Number.isFinite(v));
  if (rawVals.length < 2) return undefined;

  const minRaw = Math.min(...rawVals);
  const maxRaw = Math.max(...rawVals);
  const spanRaw = maxRaw - minRaw;
  if (spanRaw <= 0) return undefined;

  const metricCtx: MetricFormatContext = {
    chartTitle: options.chartTitle,
    metricLabel: options.metricLabel,
    presentationKind: options.presentationKind as ChartKind,
    chartRows: rows as ChartRow[],
  };
  const isPercent = metricFormatUsesPercent(metricCtx);
  const displayVals = isPercent
    ? rawVals.map((v) => coercePercentDisplayNumber(v))
    : rawVals;
  const minDisplay = Math.min(...displayVals);
  const maxDisplay = Math.max(...displayVals);
  const spanDisplay = maxDisplay - minDisplay;
  const spreadRatio = spanDisplay / Math.max(Math.abs(maxDisplay), 1e-9);

  const boundedBounds = inferBoundedMetricBounds({
    values: displayVals,
    metricLabel: options.metricLabel,
    chartTitle: options.chartTitle,
    isPercent,
  });

  const tight = shouldUseTightBarDomain({
    isPercent,
    spanDisplay,
    spreadRatio,
    categoryCount: rawVals.length,
    minDisplay,
    maxDisplay,
    boundedBounds,
  });

  // Bar charts encode absolute value via bar length — a truncated axis is misleading
  // for rate/percent metrics where the minimum is low (< 50pp). Scatter and trend
  // charts benefit from tight domains (position = relative value), but bar charts do not.
  const isBarChartKind =
    options.presentationKind === "bar" ||
    options.presentationKind === "bar_horizontal";

  const padRatio =
    options.rightPadRatio ?? DEFAULT_BAR_RIGHT_PAD_RATIO;
  let domainMin: number;
  let domainMax: number;

  if (tight) {
    const pad = boundedBounds
      ? boundedTightPadding(spanRaw, boundedBounds)
      : Math.max(spanRaw * 0.12, spanRaw * 0.08, 1e-6);
    domainMin = minRaw - pad;
    domainMax = maxRaw + pad;
    if (
      minRaw >= 0 &&
      !zeroBaselineImprovesInterpretation({
        isPercent,
        minDisplay,
        maxDisplay,
        spreadRatio,
        boundedBounds,
      })
    ) {
      domainMin = Math.max(0, domainMin);
    }
    if (boundedBounds) {
      [domainMin, domainMax] = clampDomainToBounds(
        domainMin,
        domainMax,
        boundedBounds
      );
    }
  } else if (zeroBaselineImprovesInterpretation({
    isPercent,
    minDisplay,
    maxDisplay,
    spreadRatio,
    boundedBounds,
  })) {
    domainMin = minRaw < 0 ? minRaw - spanRaw * 0.08 : 0;
    domainMax = maxRaw * (1 + padRatio);
  } else {
    const pad = Math.max(spanRaw * 0.1, 1e-6);
    domainMin = minRaw - pad;
    domainMax = maxRaw + pad;
    if (minRaw >= 0) domainMin = Math.max(0, domainMin);
  }

  // Post-process: bar charts encode absolute value via bar length, so a non-zero baseline
  // is misleading for normal positive metrics. Force zero baseline for bar/horizontal-bar
  // unless:
  //   1. Score/rating/NPS-like metrics — zero has no natural origin (satisfaction 4.0–4.5).
  //   2. 0-5 or 0-10 bounded rating scales — safety net for unlabeled rating metrics.
  //   3. Values include negatives (delta/change charts) — guarded by minRaw >= 0.
  // Callers without presentationKind (legacy / non-bar surfaces) skip this override.
  const isScoreOrRatingLike = metricLabelImpliesScoreLike(
    options.metricLabel ?? null,
    options.chartTitle ?? null
  );
  const hasBoundedRatingScale =
    boundedBounds != null &&
    (boundedBounds.kind === "rating5" || boundedBounds.kind === "rating10");

  if (
    isBarChartKind &&
    minRaw >= 0 &&
    !isScoreOrRatingLike &&
    !hasBoundedRatingScale &&
    domainMin > 0
  ) {
    domainMin = 0;
  }

  if (options.executiveRounding) {
    domainMax = roundExecutiveDomainMaximum(
      domainMax,
      spanDisplay,
      isPercent,
      boundedBounds
    );
    if (tight || domainMin > 0) {
      domainMin = roundExecutiveDomainMinimum(domainMin, spanDisplay, boundedBounds);
    }
    if (boundedBounds) {
      [domainMin, domainMax] = clampDomainToBounds(
        domainMin,
        domainMax,
        boundedBounds
      );
    }
  }

  if (domainMax <= domainMin) {
    domainMax = domainMin + Math.max(spanRaw * 0.1, 1e-6);
  }

  return [domainMin, domainMax];
}
