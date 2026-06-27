/**
 * Shared horizontal bar visual policy — radius, thickness, and category rhythm.
 * Keep in sync with V-Bar premium finish in page.tsx and chart-renderer.tsx.
 */

/** V-Bar overview band cap — reference for H-Bar parity. */
export const OVERVIEW_VBAR_MAX_BAR_SIZE = 52;

/** Overview H-Bar live — default for sparse (1–5 category) charts. */
export const OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE = 48;

/** Overview H-Bar PNG/export — same responsive policy as live (explicit export alias). */
export const OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE = 48;

/** Category-count bands for Overview H-Bar thickness — avoids crowding at 7–8 rows. */
export const OVERVIEW_HBAR_MAX_SIZE_BY_CATEGORY = {
  sparse: 48,
  six: 44,
  dense: 42,
  compact: 36,
} as const;

/**
 * Asymmetric all-corner radius aligned with V-Bar ([8,8,4,4] / [10,10,6,6]).
 * Scaled to typical H-Bar band height (~48px) so corners read premium, not pill-like.
 */
export const HORIZONTAL_BAR_END_RADIUS: [number, number, number, number] = [
  4, 6, 6, 4,
];

/** Session/detail H-Bar sizes — approach V-Bar detail caps (compact 40 / default 56). */
export const HORIZONTAL_BAR_MAX_SIZE = {
  compact: 36,
  detail: 48,
  default: 44,
} as const;

export const HORIZONTAL_BAR_STACKED_MAX_SIZE = {
  compact: 22,
  detail: 32,
  default: 26,
} as const;

export const HORIZONTAL_BAR_STACKED_RADIUS: [number, number, number, number] = [
  0, 5, 5, 0,
];

export type HorizontalBarCategoryGap = "16%" | "10%" | undefined;

/** Controlled 5-category fixture used in parity tests and manual validation. */
export const HBAR_VBAR_PARITY_FIXTURE = [
  { name: "Finance", value: 100 },
  { name: "Marketing", value: 80 },
  { name: "Operations", value: 65 },
  { name: "Sales", value: 60 },
  { name: "Support", value: 50 },
] as const;

export function resolveOverviewHBarMaxSizeForCategoryCount(
  categoryCount: number
): number {
  const n = Math.max(1, Math.floor(categoryCount));
  if (n <= 5) return OVERVIEW_HBAR_MAX_SIZE_BY_CATEGORY.sparse;
  if (n === 6) return OVERVIEW_HBAR_MAX_SIZE_BY_CATEGORY.six;
  if (n <= 8) return OVERVIEW_HBAR_MAX_SIZE_BY_CATEGORY.dense;
  return OVERVIEW_HBAR_MAX_SIZE_BY_CATEGORY.compact;
}

export function resolveOverviewHorizontalBarMaxSize(
  options: { pngCapture?: boolean; categoryCount?: number } = {}
): number {
  const count = options.categoryCount ?? 5;
  void options.pngCapture;
  return resolveOverviewHBarMaxSizeForCategoryCount(count);
}

export function resolveHorizontalBarMaxSize(args: {
  compact?: boolean;
  detailLayout?: boolean;
  /** Overview inline renderer — live vs PNG capture. */
  overviewCapture?: boolean;
  categoryCount?: number;
}): number {
  if (args.overviewCapture !== undefined) {
    return resolveOverviewHorizontalBarMaxSize({
      pngCapture: args.overviewCapture,
      categoryCount: args.categoryCount,
    });
  }
  if (args.compact) return HORIZONTAL_BAR_MAX_SIZE.compact;
  if (args.detailLayout) return HORIZONTAL_BAR_MAX_SIZE.detail;
  return HORIZONTAL_BAR_MAX_SIZE.default;
}

/**
 * Match the V-Bar sparse-category rhythm. Recharts caps bar thickness with
 * maxBarSize, but category gaps still control how much of each band reads as
 * bar vs air.
 */
export function resolveHorizontalBarCategoryGap(args: {
  categoryCount: number;
  detailLayout?: boolean;
}): HorizontalBarCategoryGap {
  const n = Math.max(1, args.categoryCount);
  if (args.detailLayout === true) {
    if (n <= 6) return "16%";
    if (n <= 10) return "10%";
    return undefined;
  }
  if (n <= 8) return "16%";
  return undefined;
}

/** Detail V-Bar uses the same intra-category gap for sparse grouped bars. */
export function resolveHorizontalBarGap(args: {
  categoryCount: number;
  detailLayout?: boolean;
}): number | undefined {
  const n = Math.max(1, args.categoryCount);
  return args.detailLayout === true && n <= 6 ? 4 : undefined;
}

/** Estimated bar-length share of the value axis (0–1) for plot-utilization diagnostics. */
export function estimateHorizontalBarLengthUtilization(args: {
  maxValue: number;
  domainMax: number;
}): number {
  const { maxValue, domainMax } = args;
  if (!Number.isFinite(maxValue) || !Number.isFinite(domainMax) || domainMax <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, maxValue / domainMax));
}

/** Estimated band fill ratio for parity diagnostics (not Recharts runtime). */
export function estimateHorizontalBarBandFillRatio(args: {
  plotInnerHeightPx: number;
  categoryCount: number;
  maxBarSize: number;
  categoryGap?: HorizontalBarCategoryGap;
}): number {
  const n = Math.max(1, args.categoryCount);
  const gapFactor = args.categoryGap === "16%" ? 0.84 : args.categoryGap === "10%" ? 0.9 : 0.92;
  const bandHeight = (args.plotInnerHeightPx / n) * gapFactor;
  if (bandHeight <= 0) return 0;
  return Math.min(1, args.maxBarSize / bandHeight);
}
