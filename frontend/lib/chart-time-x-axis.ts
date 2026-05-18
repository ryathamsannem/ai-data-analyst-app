/**
 * Time-series / trend X-axis helpers (Recharts line & area).
 * Keeps tick density and date copy readable on dense dashboards.
 */

import type { ChartRow } from "@/app/chart-types";
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

/** Chronological sort key for bucket labels (ISO, weekly ranges, quarters, months). */
export function bucketLabelChronologicalSortKey(label: string): [number, number, string] {
  const s = label.trim();
  if (!s) return [2, 0, ""];

  const iso = parseIsoDate(s);
  if (iso) {
    const ts = Date.UTC(iso.y, iso.m - 1, iso.d);
    if (!Number.isNaN(ts)) return [0, ts, s];
  }

  if (s.includes("/")) {
    const left = s.split("/")[0]?.trim() ?? "";
    const dl = parseIsoDate(left);
    if (dl) {
      const ts = Date.UTC(dl.y, dl.m - 1, dl.d);
      if (!Number.isNaN(ts)) return [0, ts, s];
    }
  }

  const qy = /^Q([1-4])\s*['\u2019]?\s*(\d{2,4})$/i.exec(s);
  if (qy) {
    const qn = Number(qy[1]);
    let yr = Number(qy[2]);
    if (yr < 100) yr += 2000;
    return [0, yr * 10 + qn, s];
  }

  const yq = /^(\d{4})[-\s]?Q([1-4])$/i.exec(s);
  if (yq) {
    return [0, Number(yq[1]) * 10 + Number(yq[2]), s];
  }

  const ym = /^(\d{4})-(\d{2})$/.exec(s);
  if (ym) {
    const ts = Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1);
    if (!Number.isNaN(ts)) return [0, ts, s];
  }

  const ymw = /^(\d{4})-(\d{2})-(\d{2})\//.exec(s);
  if (ymw) {
    const ts = Date.UTC(Number(ymw[1]), Number(ymw[2]) - 1, Number(ymw[3]));
    if (!Number.isNaN(ts)) return [0, ts, s];
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return [0, parsed, s];

  return [1, 0, s];
}

/** Preserve left-to-right chronological order for trend / time-series charts. */
export function sortChartRowsChronologically(rows: ChartRow[]): ChartRow[] {
  if (!rows.length || rows.length <= 1) return rows;
  const indexed = rows.map((row, i) => ({
    row,
    i,
    key: bucketLabelChronologicalSortKey(String(row.name ?? "")),
  }));
  indexed.sort((a, b) => {
    if (a.key[0] !== b.key[0]) return a.key[0] - b.key[0];
    if (a.key[1] !== b.key[1]) return a.key[1] - b.key[1];
    if (a.key[2] !== b.key[2]) return a.key[2].localeCompare(b.key[2]);
    return a.i - b.i;
  });
  return indexed.map((x) => x.row);
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
