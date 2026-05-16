/**
 * Time-series / trend X-axis helpers (Recharts line & area).
 * Keeps tick density and date copy readable on dense dashboards.
 */

import {
  computeCategoryAxisBottomMargin,
  type ChartLayoutMode,
} from "./chart-axis-layout";

export const TREND_X_AXIS_ANGLE_DEG = -25;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseIsoDate(s: string): { y: number; m: number; d: number } | null {
  const t = s.trim();
  const dayPart = t.includes("T") ? t.slice(0, t.indexOf("T")) : t;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayPart.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31)
    return null;
  return { y, m: mo, d };
}

function formatSingleDayShort(p: { y: number; m: number; d: number }): string {
  const mon = MONTH_SHORT[p.m - 1] ?? "???";
  return `${mon} ${p.d}`;
}

function formatDateRangeShort(
  da: { y: number; m: number; d: number },
  db: { y: number; m: number; d: number }
): string {
  const ma = MONTH_SHORT[da.m - 1] ?? "";
  const mb = MONTH_SHORT[db.m - 1] ?? "";
  if (da.y === db.y && da.m === db.m) {
    return `${ma} ${da.d}–${db.d}`;
  }
  if (da.y === db.y) {
    return `${ma} ${da.d} – ${mb} ${db.d}`;
  }
  return `${ma} ${da.d}, ${da.y} – ${mb} ${db.d}, ${db.y}`;
}

/** Humanize ISO day or YYYY-MM-DD/YYYY-MM-DD week buckets for axis & tooltips. */
export function formatTrendXAxisTickLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return "—";

  const rangeSep = s.indexOf("/");
  if (rangeSep > 0) {
    const a = s.slice(0, rangeSep).trim();
    const b = s.slice(rangeSep + 1).trim();
    const da = parseIsoDate(a);
    const db = parseIsoDate(b);
    if (da && db) return formatDateRangeShort(da, db);
  }

  const single = parseIsoDate(s);
  if (single) return formatSingleDayShort(single);

  return s;
}

export function temporalTickStringsForChartRows(
  rows: { name?: unknown }[]
): string[] {
  return rows.map((r) => formatTrendXAxisTickLabel(String(r.name ?? "")));
}

/**
 * Recharts `interval`: show ticks where index % (interval + 1) === 0.
 * Target ~6 ticks on narrow viewports, ~10 on desktop; thin more past 8 / 15 points.
 */
export function computeLineAreaXAxisInterval(
  pointCount: number,
  opts: { compact: boolean; viewportWidthPx?: number }
): number {
  const n = Math.max(0, pointCount);
  const narrow =
    opts.compact ||
    (opts.viewportWidthPx != null && opts.viewportWidthPx < 640);
  const maxTicks = narrow ? 6 : 10;

  if (n <= 1) return 0;
  if (n <= 8) {
    return n <= maxTicks ? 0 : Math.max(0, Math.ceil(n / maxTicks) - 1);
  }
  if (n <= 15) {
    const step = n <= 10 ? 2 : 3;
    return Math.min(2, Math.max(1, step - 1));
  }
  return Math.max(2, Math.ceil(n / maxTicks) - 1);
}

export function lineAreaTickFontSizePx(
  compact: boolean,
  viewportWidthPx?: number
): number {
  const narrow =
    compact ||
    (viewportWidthPx != null && viewportWidthPx < 640);
  return narrow ? 10 : 11;
}

/** Reserved band under the plot for angled ticks + axis title. */
export function lineAreaXAxisHeightPx(compact: boolean): number {
  return compact ? 48 : 58;
}

/** Bottom outer margin; clamped for dense BI-style trend charts. */
export function computeLineAreaChartBottomMargin(args: {
  temporalTickStrings: string[];
  tickFontSizePx: number;
  chartLayoutMode: ChartLayoutMode;
}): number {
  const base = computeCategoryAxisBottomMargin({
    categoryTickStrings: args.temporalTickStrings,
    angled: true,
    tickFontSizePx: args.tickFontSizePx,
    chartLayoutMode: args.chartLayoutMode,
  });
  const lo = args.chartLayoutMode === "compact" ? 50 : 54;
  const hi = args.chartLayoutMode === "compact" ? 68 : 70;
  return Math.min(hi, Math.max(lo, base));
}
