import type { ChartRow } from "@/app/chart-types";
import {
  formatMetricNumber,
  resolveMetricValueFormat,
  type MetricFormatContext,
} from "@/lib/metric-value-format";

/** Rounded domain + explicit tick positions for Overview mini charts (live only). */
export type OverviewPremiumAxisScale = {
  domain: [number, number];
  ticks: number[];
};

/** Subtle extra Y padding for Overview line mini cards (Pipeline B). */
export const OVERVIEW_LINE_PREMIUM_PAD_RATIO = 0.12;

/** Tighter rounded domains for Overview scatter — occupancy-tuned in resolver. */
export const OVERVIEW_SCATTER_PREMIUM_PAD_RATIO = 0.045;

/** Minimum per-side pad floor for scatter (below generic 0.06 line/area floor). */
export const OVERVIEW_SCATTER_MIN_PAD_RATIO = 0.025;

/** Target share of axis span occupied by the data cluster (65–75% band). */
export const OVERVIEW_SCATTER_TARGET_OCCUPANCY = 0.7;

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

  const padRatio = options?.padRatio ?? 0.1;
  const minPadRatio = options?.minPadRatio ?? 0.06;
  const pad = Math.max(span * padRatio, span * minPadRatio, 1e-9);
  let paddedMin = min - pad;
  let paddedMax = max + pad;
  if (min >= 0 && paddedMin < 0) paddedMin = 0;

  const step = chooseOverviewPremiumStep(paddedMin, paddedMax);
  const domainMin = snapDown(paddedMin, step);
  const domainMax = snapUp(paddedMax, step);
  const ticks = buildTicks(domainMin, domainMax, step);

  if (domainMax <= domainMin) return undefined;
  return { domain: [domainMin, domainMax], ticks };
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
    return formatMetricNumber(tick, "percent");
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
