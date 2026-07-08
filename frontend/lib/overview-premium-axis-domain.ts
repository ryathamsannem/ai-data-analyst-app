import type { ChartRow } from "@/app/chart-types";
import { LINE_BOTTOM_LABEL_HEADROOM_PX, LINE_TOP_LABEL_HEADROOM_PX } from "@/lib/chart-layout-config";
import {
  formatMetricNumber,
  readChartRowRawValue,
  resolveMetricValueFormat,
  type MetricFormatContext,
} from "@/lib/metric-value-format";
import { inferDomainTickStep } from "@/lib/overview-bar-value-domain";
import { sessionDetailVerticalOuterMargins } from "@/lib/shared-chart-layout";

/** Rounded domain + explicit tick positions for Overview mini charts (live only). */
export type OverviewPremiumAxisScale = {
  domain: [number, number];
  ticks: number[];
};

/** Subtle extra Y padding for Overview line mini cards (Pipeline B). */
export const OVERVIEW_LINE_PREMIUM_PAD_RATIO = 0.12;

/** Occupancy-tuned Y padding for Overview dashboard live line/area mini cards. */
export const OVERVIEW_MINI_LINE_PREMIUM_PAD_RATIO = 0.05;
export const OVERVIEW_MINI_AREA_PREMIUM_PAD_RATIO = 0.05;
export const OVERVIEW_MINI_TREND_MIN_PAD_RATIO = 0.04;

/** Tighter rounded domains for Overview scatter — occupancy-tuned in resolver. */
export const OVERVIEW_SCATTER_PREMIUM_PAD_RATIO = 0.045;

/** Minimum per-side pad floor for scatter (below generic 0.06 line/area floor). */
export const OVERVIEW_SCATTER_MIN_PAD_RATIO = 0.025;

/** Target share of axis span occupied by the data cluster (65–75% band). */
export const OVERVIEW_SCATTER_TARGET_OCCUPANCY = 0.74;

/** Anchor-min gutter — small pad below/left of cluster; tighter above/right. */
export const OVERVIEW_SCATTER_MIN_SIDE_GUTTER_RATIO = 0.06;
export const OVERVIEW_SCATTER_MAX_SIDE_GUTTER_RATIO = 0.08;

/** Live Overview line stroke / marker weights (Pipeline B). */
export const OVERVIEW_LINE_LIVE_STROKE_WIDTH_PX = 3;
export const OVERVIEW_LINE_LIVE_MARKER_R_PX = 5;
export const OVERVIEW_LINE_LIVE_MARKER_STROKE_PX = 1.5;

function snapDown(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  return Math.floor(value / step + 1e-9) * step;
}

function snapUp(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  return Math.ceil(value / step - 1e-9) * step;
}

/** Candidate step for human-friendly axis ticks on Overview cards. */
function overviewPremiumStepCandidate(span: number, maxAbs: number): number {
  const target = Math.max(span / 4, 1e-9);
  if (maxAbs <= 1.05) {
    if (target <= 0.02) return 0.01;
    if (target <= 0.05) return 0.05;
    return 0.1;
  }
  if (maxAbs <= 10) {
    if (target <= 0.1) return 0.05;
    if (target <= 0.5) return 0.5;
    return 1;
  }
  if (maxAbs <= 100) {
    if (target <= 1) return 1;
    if (target <= 5) return 5;
    return 10;
  }
  if (maxAbs <= 1_000) {
    if (target <= 50) return 50;
    if (target <= 100) return 100;
    return 200;
  }
  if (maxAbs <= 10_000) {
    if (target <= 500) return 500;
    if (target <= 1_000) return 1_000;
    return 2_000;
  }
  if (maxAbs <= 100_000) {
    if (target <= 5_000) return 5_000;
    if (target <= 10_000) return 10_000;
    return 20_000;
  }
  if (maxAbs <= 1_000_000) {
    if (target <= 50_000) return 50_000;
    if (target <= 100_000) return 100_000;
    return 200_000;
  }
  if (target <= 500_000) return 500_000;
  if (target <= 1_000_000) return 1_000_000;
  return 2_000_000;
}

function chooseOverviewPremiumStep(
  paddedMin: number,
  paddedMax: number
): number {
  const span = Math.max(paddedMax - paddedMin, 1e-9);
  const maxAbs = Math.max(Math.abs(paddedMin), Math.abs(paddedMax), 1);
  const base = overviewPremiumStepCandidate(span, maxAbs);
  const candidates = [0.5, 1, 2].map((m) => base * m).filter((s) => s > 0);

  for (const step of candidates) {
    const lo = snapDown(paddedMin, step);
    const hi = snapUp(paddedMax, step);
    const count = Math.round((hi - lo) / step) + 1;
    if (count >= 4 && count <= 6) return step;
  }
  return base;
}

function buildTicks(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step * 1e-6; t += step) {
    ticks.push(Number(t.toFixed(6)));
  }
  return ticks.length >= 2 ? ticks : [lo, hi];
}

/**
 * Clean integer ticks for zero-baseline count bar value axes (Overview live).
 * Uses the resolved bar domain — does not change domain/baseline policy.
 */
export function resolveOverviewBarCountValueAxisTicks(
  domain: readonly [number, number]
): number[] | undefined {
  const [dMin, dMax] = domain;
  if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMax <= dMin) {
    return undefined;
  }
  if (dMin < -1e-9) return undefined;

  const step = chooseOverviewPremiumStep(dMin, dMax);
  const lo = snapDown(dMin, step);
  const hi = snapUp(dMax, step);
  const ticks = buildTicks(lo, hi, step);
  if (ticks.length < 2 || ticks.length > 7) return undefined;
  if (ticks.some((t) => Math.abs(t - Math.round(t)) > 1e-6)) return undefined;
  return ticks;
}

/** Target share of axis span occupied by the data cluster on low-variance trends. */
export const OVERVIEW_TREND_LOW_VARIANCE_SPREAD_RATIO = 0.08;

/** Finer tick steps when trend values cluster (e.g. weekly units 1.02M–1.05M). */
export function chooseFocusedTrendAxisStep(span: number, maxAbs: number): number {
  if (maxAbs > 100_000 && span <= 100_000) {
    if (span <= 5_000) return 1_000;
    if (span <= 15_000) return 5_000;
    if (span <= 50_000) return 10_000;
    return 20_000;
  }
  return inferDomainTickStep(span, maxAbs);
}

/** True when line/area values sit in a tight million-scale band (matches focused axis ticks). */
export function trendValueSpanUsesFocusedMegaTicks(
  values: readonly number[]
): boolean {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return false;
  const span = Math.max(...nums) - Math.min(...nums);
  const maxAbs = Math.max(...nums.map((v) => Math.abs(v)));
  return maxAbs > 100_000 && span <= 100_000;
}

/** Point-label M suffix with two-decimal precision — mirrors focused axis tick style. */
export function formatOverviewLineFocusedMegaPointLabel(value: number): string {
  const m = value / 1_000_000;
  const label = m.toFixed(2).replace(/\.?0+$/, "");
  return `${label}M`;
}

const PREMIUM_AXIS_MAX_TICK_COUNT = 7;

function capPremiumAxisTicks(
  lo: number,
  hi: number,
  step: number
): { ticks: number[]; step: number; lo: number; hi: number } {
  let s = step;
  let domainLo = lo;
  let domainHi = hi;
  let ticks = buildTicks(domainLo, domainHi, s);
  while (ticks.length > PREMIUM_AXIS_MAX_TICK_COUNT && s < domainHi - domainLo) {
    s *= 2;
    domainLo = snapDown(lo, s);
    domainHi = snapUp(hi, s);
    ticks = buildTicks(domainLo, domainHi, s);
  }
  return { ticks, step: s, lo: domainLo, hi: domainHi };
}

/**
 * Data-focused axis with rounded bounds and 4–6 even ticks — Overview live charts only.
 */
export function resolveOverviewPremiumAxisScale(
  values: readonly number[],
  options?: { padRatio?: number; minPadRatio?: number }
): OverviewPremiumAxisScale | undefined {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return undefined;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  if (span <= 0) return undefined;

  const spreadRatio = span / Math.max(Math.abs(max), 1e-9);
  const lowVariance = spreadRatio < OVERVIEW_TREND_LOW_VARIANCE_SPREAD_RATIO;

  const padRatio = options?.padRatio ?? 0.1;
  const minPadRatio = options?.minPadRatio ?? 0.06;
  const effectivePadRatio = lowVariance ? Math.min(padRatio, 0.04) : padRatio;
  const effectiveMinPadRatio = lowVariance
    ? Math.min(minPadRatio, 0.02)
    : minPadRatio;
  const pad = Math.max(
    span * effectivePadRatio,
    span * effectiveMinPadRatio,
    1e-9
  );
  let paddedMin = min - pad;
  let paddedMax = max + pad;
  if (min >= 0 && paddedMin < 0) paddedMin = 0;

  const step = lowVariance
    ? chooseFocusedTrendAxisStep(span, max)
    : chooseOverviewPremiumStep(paddedMin, paddedMax);
  const initialLo = snapDown(paddedMin, step);
  const initialHi = snapUp(paddedMax, step);
  const capped = capPremiumAxisTicks(initialLo, initialHi, step);
  const domainMin = capped.lo;
  const domainMax = capped.hi;
  const ticks = capped.ticks;

  if (domainMax <= domainMin) return undefined;
  if (ticks.length < 2) return undefined;
  return { domain: [domainMin, domainMax], ticks };
}

/** Charts tab + AI Insights detail trend plots — occupancy-tuned pad (rounded ticks preserved). */
export const SESSION_DETAIL_TREND_PREMIUM_PAD_RATIO = 0.05;
export const SESSION_DETAIL_TREND_PREMIUM_MIN_PAD_RATIO = 0.04;

/** Session detail line/area — minimal Recharts margin caps inside the existing plot box. */
export const SESSION_DETAIL_TREND_MARGIN_TOP_PX = 2;
export const SESSION_DETAIL_TREND_MARGIN_BOTTOM_CAP_PX = 30;

export function resolveSessionPremiumTrendAxisScale(
  values: readonly number[],
  kind: "line" | "area"
): OverviewPremiumAxisScale | undefined {
  return resolveOverviewPremiumAxisScale(values, {
    padRatio:
      kind === "line"
        ? SESSION_DETAIL_TREND_PREMIUM_PAD_RATIO
        : 0.08,
    minPadRatio: SESSION_DETAIL_TREND_PREMIUM_MIN_PAD_RATIO,
  });
}

/** Recharts YAxis props for Line/Area trend charts — Overview premium domain everywhere. */
export type TrendValueAxisProps = {
  domain: readonly [number, number];
  ticks: readonly number[];
  allowDataOverflow: boolean;
};

/** Shared Overview-aligned premium Y scale for Line and Area trend charts. */
export function resolveTrendValueAxisScale(
  values: readonly number[],
  kind: "line" | "area"
): OverviewPremiumAxisScale | undefined {
  return kind === "line"
    ? resolveOverviewPremiumAxisScale(values, {
        padRatio: OVERVIEW_LINE_PREMIUM_PAD_RATIO,
      })
    : resolveOverviewPremiumAxisScale(values);
}

/** Overview dashboard mini-cards — tighter Y domains for higher data occupancy. */
export function resolveOverviewMiniTrendAxisScale(
  values: readonly number[],
  kind: "line" | "area"
): OverviewPremiumAxisScale | undefined {
  return resolveOverviewPremiumAxisScale(values, {
    padRatio:
      kind === "line"
        ? OVERVIEW_MINI_LINE_PREMIUM_PAD_RATIO
        : OVERVIEW_MINI_AREA_PREMIUM_PAD_RATIO,
    minPadRatio: OVERVIEW_MINI_TREND_MIN_PAD_RATIO,
  });
}

export type TrendAxisSurface = "overview" | "session" | "default";

/** Safe YAxis props for Line/Area — surface selects domain tightness. */
export function resolveTrendValueAxisProps(args: {
  chartKind: "line" | "area";
  values: readonly number[];
  surface?: TrendAxisSurface;
}): TrendValueAxisProps | null {
  const surface = args.surface ?? "default";
  const scale =
    surface === "session"
      ? resolveSessionPremiumTrendAxisScale(args.values, args.chartKind)
      : surface === "overview"
        ? resolveOverviewMiniTrendAxisScale(args.values, args.chartKind)
        : resolveTrendValueAxisScale(args.values, args.chartKind);
  if (!scale) return null;
  return {
    domain: scale.domain,
    ticks: scale.ticks,
    allowDataOverflow: true,
  };
}

/** Tighter optical side margins for session detail line/area (not Overview mini-cards). */
export function sessionTrendDetailSideMargins(
  yAxisWidth: number,
  options?: { lineChart?: boolean; pointCount?: number }
): {
  left: number;
  right: number;
} {
  const sides = sessionDetailVerticalOuterMargins({
    yAxisWidth,
    lineChart: options?.lineChart,
    pointCount: options?.pointCount,
  });
  return { left: sides.marginLeft, right: sides.marginRight };
}

/** Bottom margin input for session detail line/area before outer cap. */
export function sessionLineAreaDetailBottomMargin(computedBottom: number): number {
  return Math.min(Math.max(Math.ceil(computedBottom * 0.68), 26), 32);
}

/** Recharts outer margins for session detail line/area — maximizes plot band without resizing the shell. */
export function sessionTrendDetailPlotMargins(args: {
  computedBottom: number;
  yAxisWidth: number;
  pointCount?: number;
  lineChart?: boolean;
  lineTopLabels?: boolean;
  areaTopLabels?: boolean;
}): { top: number; right: number; bottom: number; left: number } {
  const side = sessionTrendDetailSideMargins(args.yAxisWidth, {
    lineChart: args.lineChart,
    pointCount: args.pointCount,
  });
  let top = SESSION_DETAIL_TREND_MARGIN_TOP_PX;
  let bottom = Math.min(
    sessionLineAreaDetailBottomMargin(args.computedBottom),
    SESSION_DETAIL_TREND_MARGIN_BOTTOM_CAP_PX
  );
  if (args.lineTopLabels) {
    top = Math.max(top, LINE_TOP_LABEL_HEADROOM_PX);
    bottom += LINE_BOTTOM_LABEL_HEADROOM_PX;
  }
  if (args.areaTopLabels) {
    top = Math.max(top, LINE_TOP_LABEL_HEADROOM_PX);
    bottom += LINE_BOTTOM_LABEL_HEADROOM_PX;
  }
  return {
    top,
    right: side.right,
    bottom,
    left: side.left,
  };
}

/** X-axis band height for session detail line/area (angled ticks + title). */
export function sessionLineAreaDetailXAxisHeightPx(): number {
  return 44;
}

/** Session detail scatter — same premium rounded domains as Overview scatter. */
export function resolveSessionScatterPremiumAxes(
  rows: readonly ChartRow[]
): ReturnType<typeof resolveOverviewScatterPremiumAxes> {
  return resolveOverviewScatterPremiumAxes(rows);
}

/**
 * Human-friendly Y-axis labels for Overview line mini cards — 600K, 650K, etc.
 * Tick positions stay exact; only display is compact.
 */
export function formatOverviewLineYAxisTick(
  tick: number,
  ctx: MetricFormatContext = {}
): string {
  if (!Number.isFinite(tick)) return String(tick);

  const format = resolveMetricValueFormat(ctx);
  if (format === "percent") {
    const rows = ctx.chartRows ?? [];
    const values = rows
      .map((r) => readChartRowRawValue(r))
      .filter((v) => Number.isFinite(v))
      .map((v) => Math.abs(v));
    const maxAbs = values.length ? Math.max(...values) : Math.abs(tick);
    const display = maxAbs <= 1.05 ? tick * 100 : tick;
    return formatMetricNumber(display, "percent");
  }

  const abs = Math.abs(tick);
  const rounded = Math.round(tick);
  const isWhole = Math.abs(tick - rounded) < 1e-6;

  if (abs >= 1_000_000 && isWhole) {
    if (rounded % 1_000_000 === 0) {
      return `${rounded / 1_000_000}M`;
    }
    if (rounded % 100_000 === 0) {
      const m = rounded / 1_000_000;
      return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
    }
    // Focused low-variance trends (e.g. weekly units 1.02M–1.05M) — avoid compact "1M" collapse.
    if (rounded % 10_000 === 0) {
      const m = rounded / 1_000_000;
      const label = m.toFixed(2).replace(/\.?0+$/, "");
      return `${label}M`;
    }
    const compactM = formatMetricNumber(tick, "compact", {
      compactThreshold: 10_000,
    });
    if (
      compactM.endsWith("M") &&
      compactM.length <= 2 &&
      rounded % 1_000_000 !== 0
    ) {
      const m = tick / 1_000_000;
      return `${m.toFixed(2).replace(/\.?0+$/, "")}M`;
    }
  }

  if (abs >= 1_000 && isWhole && rounded % 1_000 === 0) {
    return `${rounded / 1_000}K`;
  }

  if (abs >= 10_000) {
    return formatMetricNumber(tick, "compact", { compactThreshold: 10_000 });
  }

  return formatMetricNumber(
    tick,
    format === "currency" ? "currency" : "number"
  );
}

/** Human-friendly numeric ticks for Overview scatter axes (X and Y). */
export function formatOverviewScatterAxisTick(
  tick: number,
  ctx: MetricFormatContext = {}
): string {
  return formatOverviewLineYAxisTick(tick, ctx);
}

/**
 * Premium value-axis ticks for bar / horizontal-bar charts.
 *
 * - Percent / rate metrics: coerce a 0–1 fraction domain to percentage points so
 *   ticks read as `35%`, `45%` (utilization) or `3.4%`, `4.1%` (delinquency rate)
 *   instead of `0.35`, `0.04`.
 * - Currency / large numeric metrics: compact to `K` / `M` (e.g. `127.5M`) like the
 *   line and scatter axes, instead of long raw decimals (`127,500,000`).
 *
 * `rows` is used only to detect the percent value scale; it never changes the
 * underlying axis domain.
 */
export function formatOverviewBarValueAxisTick(
  tick: number,
  rows: readonly ChartRow[],
  ctx: MetricFormatContext = {}
): string {
  if (!Number.isFinite(tick)) return String(tick);

  const format = resolveMetricValueFormat(ctx);
  if (format === "percent") {
    const values = rows
      .map((r) => readChartRowRawValue(r))
      .filter((v) => Number.isFinite(v))
      .map((v) => Math.abs(v));
    const maxAbs = values.length ? Math.max(...values) : Math.abs(tick);
    // Fraction-scale percents (0–1) display as points; 0–100 values pass through.
    const display = maxAbs <= 1.05 ? tick * 100 : tick;
    return formatMetricNumber(display, "percent");
  }

  return formatOverviewLineYAxisTick(tick, ctx);
}

function scatterDataOccupancy(
  dataMin: number,
  dataMax: number,
  domainMin: number,
  domainMax: number
): number {
  const dataSpan = dataMax - dataMin;
  const domainSpan = domainMax - domainMin;
  if (dataSpan <= 0 || domainSpan <= 0) return 0;
  return dataSpan / domainSpan;
}

/** Scatter-only axis scale — tight rounded domain targeting ~65–75% cluster occupancy. */
export function resolveOverviewScatterPremiumAxisScale(
  values: readonly number[]
): OverviewPremiumAxisScale | undefined {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return undefined;

  const dataMin = Math.min(...nums);
  const dataMax = Math.max(...nums);
  const dataSpan = dataMax - dataMin;
  if (dataSpan <= 0) return undefined;

  const buildFromBounds = (lo: number, hi: number): OverviewPremiumAxisScale | undefined => {
    const baseStep = chooseOverviewPremiumStep(lo, hi);
    const stepCandidates = [0.25, 0.5, 1, 2]
      .map((m) => baseStep * m)
      .filter((s) => s > 0);

    let bestScale: OverviewPremiumAxisScale | undefined;
    let bestDelta = Infinity;

    for (const step of stepCandidates) {
      let domainMin = snapDown(lo, step);
      let domainMax = snapUp(hi, step);
      if (domainMin > dataMin) domainMin -= step;
      if (domainMax < dataMax) domainMax += step;
      if (dataMin >= 0 && domainMin < 0) domainMin = 0;

      while (domainMax - domainMin > dataSpan / 0.64) {
        let tightened = false;
        if (domainMax - step >= dataMax) {
          const nextMax = domainMax - step;
          const occ = scatterDataOccupancy(dataMin, dataMax, domainMin, nextMax);
          if (occ >= 0.62 && occ <= 0.82) {
            domainMax = nextMax;
            tightened = true;
          }
        }
        if (domainMin + step <= dataMin) {
          const nextMin = domainMin + step;
          const occ = scatterDataOccupancy(dataMin, dataMax, nextMin, domainMax);
          if (occ >= 0.62 && occ <= 0.82) {
            domainMin = nextMin;
            tightened = true;
          }
        }
        if (!tightened) break;
      }

      if (domainMin > dataMin || domainMax < dataMax) continue;
      const ticks = buildTicks(domainMin, domainMax, step);
      if (domainMax <= domainMin || ticks.length < 2) continue;

      const occupancy = scatterDataOccupancy(dataMin, dataMax, domainMin, domainMax);
      if (occupancy < 0.65 || occupancy > 0.8) continue;
      const delta = Math.abs(occupancy - OVERVIEW_SCATTER_TARGET_OCCUPANCY);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestScale = { domain: [domainMin, domainMax], ticks };
      }
    }

    return bestScale;
  };

  const targetSpan = dataSpan / OVERVIEW_SCATTER_TARGET_OCCUPANCY;
  const anchorMinCandidates: Array<{ lo: number; hi: number }> = [];

  for (const occupancy of [0.7, 0.72, 0.68, 0.74, 0.66]) {
    const span = dataSpan / occupancy;
    const minGutter = span * OVERVIEW_SCATTER_MIN_SIDE_GUTTER_RATIO;
    const maxGutter = span * OVERVIEW_SCATTER_MAX_SIDE_GUTTER_RATIO;
    let lo = dataMin - minGutter;
    let hi = dataMax + maxGutter;
    if (hi - lo < span) hi = lo + span;
    if (lo > dataMin) {
      const shift = lo - dataMin;
      lo -= shift;
      hi -= shift;
    }
    if (hi < dataMax) {
      hi = dataMax + maxGutter;
      lo = Math.min(lo, hi - span);
    }
    if (dataMin >= 0 && lo < 0) {
      hi -= lo;
      lo = 0;
    }
    anchorMinCandidates.push({ lo, hi });
  }

  const padCandidates = [0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.065];
  let best: OverviewPremiumAxisScale | undefined;
  let bestScore = Infinity;

  const consider = (scale: OverviewPremiumAxisScale | undefined) => {
    if (!scale) return;
    if (scale.domain[0] > dataMin || scale.domain[1] < dataMax) return;
    const occupancy = scatterDataOccupancy(
      dataMin,
      dataMax,
      scale.domain[0],
      scale.domain[1]
    );
    if (occupancy < 0.65 || occupancy > 0.8) return;
    const maxSlack = (scale.domain[1] - dataMax) / dataSpan;
    const minSlack = (dataMin - scale.domain[0]) / dataSpan;
    const score =
      Math.abs(occupancy - OVERVIEW_SCATTER_TARGET_OCCUPANCY) +
      maxSlack * 0.35 +
      minSlack * 0.06;
    if (score < bestScore) {
      bestScore = score;
      best = scale;
    }
  };

  for (const { lo, hi } of anchorMinCandidates) {
    consider(buildFromBounds(lo, hi));
  }

  for (const padRatio of padCandidates) {
    consider(
      resolveOverviewPremiumAxisScale(nums, {
        padRatio,
        minPadRatio: OVERVIEW_SCATTER_MIN_PAD_RATIO,
      })
    );
  }

  const tightenMaxBound = (
    scale: OverviewPremiumAxisScale | undefined
  ): OverviewPremiumAxisScale | undefined => {
    if (!scale || scale.ticks.length < 2) return scale;
    const step = scale.ticks[1] - scale.ticks[0];
    if (!Number.isFinite(step) || step <= 0) return scale;
    let domainMin = scale.domain[0];
    let domainMax = scale.domain[1];
    while (domainMax - step >= dataMax) {
      const nextMax = domainMax - step;
      const occ = scatterDataOccupancy(dataMin, dataMax, domainMin, nextMax);
      if (occ > 0.78) break;
      domainMax = nextMax;
    }
    const ticks = buildTicks(domainMin, domainMax, step);
    if (domainMax <= domainMin || ticks.length < 2) return scale;
    return { domain: [domainMin, domainMax], ticks };
  };

  return tightenMaxBound(
    best ??
      buildFromBounds(
        dataMin - targetSpan * OVERVIEW_SCATTER_MIN_SIDE_GUTTER_RATIO,
        dataMax + targetSpan * OVERVIEW_SCATTER_MAX_SIDE_GUTTER_RATIO
      ) ??
      resolveOverviewPremiumAxisScale(nums, {
        padRatio: OVERVIEW_SCATTER_PREMIUM_PAD_RATIO,
        minPadRatio: OVERVIEW_SCATTER_MIN_PAD_RATIO,
      })
  );
}

export function resolveOverviewScatterPremiumAxes(
  rows: readonly ChartRow[]
): { x: OverviewPremiumAxisScale; y: OverviewPremiumAxisScale } | undefined {
  const xs = rows
    .map((r) => r.x)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const ys = rows.map((r) => r.value).filter((v) => Number.isFinite(v));
  if (xs.length < 2 || ys.length < 2) return undefined;

  const x = resolveOverviewScatterPremiumAxisScale(xs);
  const y = resolveOverviewScatterPremiumAxisScale(ys);
  if (!x || !y) return undefined;
  return { x, y };
}

/** Recharts axis props for scatter X/Y — same domain/ticks across all surfaces. */
export type ScatterAxisChannelProps = {
  domain: readonly [number, number];
  ticks: readonly number[];
  allowDataOverflow: false;
};

export type ScatterValueAxisProps = {
  x: ScatterAxisChannelProps;
  y: ScatterAxisChannelProps;
};

/** Safe scatter axis props — Overview, Charts, AI Insights, and PDF share premium domains. */
export function resolveScatterValueAxisProps(
  rows: readonly ChartRow[]
): ScatterValueAxisProps | null {
  const axes = resolveOverviewScatterPremiumAxes(rows);
  if (!axes) return null;
  return {
    x: {
      domain: axes.x.domain,
      ticks: axes.x.ticks,
      allowDataOverflow: false,
    },
    y: {
      domain: axes.y.domain,
      ticks: axes.y.ticks,
      allowDataOverflow: false,
    },
  };
}
