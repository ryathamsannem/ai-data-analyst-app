import type { ChartRow } from "@/app/chart-types";
import { wrapCategoryLabelLines } from "@/lib/chart-axis-layout";

export function formatAxisTickFromRows(chartData: ChartRow[], tick: number): string {
  const row = chartData.find((r) => Math.abs(r.value - tick) < 1e-6);
  if (row?.displayValue?.trim()) return row.displayValue.trim();
  if (Number.isInteger(tick) && Math.abs(tick) < 1e12) return tick.toLocaleString();
  return tick.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatAxisTickFromScatterX(chartData: ChartRow[], tick: number): string {
  const row = chartData.find(
    (r) => typeof r.x === "number" && Number.isFinite(r.x) && Math.abs(r.x - tick) < 1e-6
  );
  if (row?.displayX?.trim()) return row.displayX.trim();
  if (Number.isInteger(tick) && Math.abs(tick) < 1e12) return tick.toLocaleString();
  return tick.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Softer axis labels for session charts: short dates, trim length, hide noise. */
export function formatChartAxisCategoryTick(raw: string, compact: boolean): string {
  const t = raw.trim();
  if (!t) return "—";
  const maxChars = compact ? 18 : 26;
  if (t.length > maxChars && !/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const [first] = wrapCategoryLabelLines(t, {
      maxCharsPerLine: maxChars,
      maxLines: 1,
    });
    if (first && first.length <= maxChars + 1) return first;
  }
  if (compact) {
    return t.length > 36 ? `${t.slice(0, 34)}…` : t;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(d);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(d);
    }
  }
  if (t.length > 28) return `${t.slice(0, 26)}…`;
  return t;
}
