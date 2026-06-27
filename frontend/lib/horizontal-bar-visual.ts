/**
 * Shared horizontal bar visual policy — radius, thickness, and category rhythm.
 * Keep in sync with V-Bar premium finish in page.tsx and chart-renderer.tsx.
 */

/** V-Bar overview band cap — reference for H-Bar parity. */
export const OVERVIEW_VBAR_MAX_BAR_SIZE = 52;

/** Overview H-Bar live — targets ~92% of V-Bar band fill on the same plot height. */
export const OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE = 48;

/** Overview H-Bar PNG/export — same policy as live (explicit export alias). */
export const OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE = 48;

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

export function resolveOverviewHorizontalBarMaxSize(
  pngCapture?: boolean
): number {
  return pngCapture
    ? OVERVIEW_HBAR_EXPORT_MAX_BAR_SIZE
    : OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE;
}

export function resolveHorizontalBarMaxSize(args: {
  compact?: boolean;
  detailLayout?: boolean;
  /** Overview inline renderer — live vs PNG capture. */
  overviewCapture?: boolean;
}): number {
  if (args.overviewCapture !== undefined) {
    return resolveOverviewHorizontalBarMaxSize(args.overviewCapture);
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
  if (n <= 6) return "16%";
  if (args.detailLayout === true && n <= 10) return "10%";
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
