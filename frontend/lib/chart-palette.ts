/** Shared categorical fills for stacked bars, pies, and overview minis. */
export const PIE_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
  "#14b8a6",
  "#ef4444",
  "#6366f1",
  "#22c55e",
  "#d946ef",
  "#f97316",
  "#06b6d4",
] as const;

/** Premium high-contrast palette for 2–4 slice radial charts on dark cards. */
export const RADIAL_SMALL_COUNT_COLORS = [
  "#818cf8",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
] as const;

export function resolveRadialPalette(
  sliceCount: number
): readonly string[] {
  return sliceCount <= 4 ? RADIAL_SMALL_COUNT_COLORS : PIE_COLORS;
}
