/**
 * Trend-mode signal cards, axes, and PDF highlights — never plant/category comparison copy.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import { fallbackChartNumericDisplay } from "@/app/chart-types";
import type { ChartSemanticHeaderModel } from "@/lib/chart-semantic-metadata";
import type { PdfRankedSignal } from "@/app/pdf-report";
import type { VisualizationContract } from "@/lib/selected-visualization";

export type TrendInsightCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

const STRIPES = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-slate-400",
] as const;

function shorten(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatTrendValue(
  v: number,
  kind: ChartKind,
  displayValue?: string
): string {
  if (displayValue?.trim()) return displayValue.trim();
  const fmt: ChartKind =
    kind === "area" ? "area" : kind === "line" ? "line" : "bar";
  return fallbackChartNumericDisplay(fmt, v);
}

export function buildTrendExecutiveVizInsights(
  rows: ChartRow[],
  metricLabel: string,
  timeBucketLabel: string,
  kind: ChartKind,
  roundingHint?: string
): TrendInsightCard[] {
  if (!rows.length) return [];

  let stripeIdx = 0;
  const nextDot = () => STRIPES[stripeIdx++ % STRIPES.length];

  if (rows.length === 1) {
    const r = rows[0];
    return [
      {
        key: "t-single-week",
        title: "Period",
        value: shorten(String(r.name ?? "—"), 44),
        hint: formatTrendValue(r.value, kind, r.displayValue),
        dotClass: nextDot(),
      },
      {
        key: "t-single-met",
        title: shorten(metricLabel, 36) || "Value",
        value: formatTrendValue(r.value, kind, r.displayValue),
        dotClass: nextDot(),
      },
      {
        key: "t-single-steps",
        title: "Time steps",
        value: "1",
        dotClass: nextDot(),
      },
    ];
  }

  let iMax = 0;
  let iMin = 0;
  rows.forEach((r, i) => {
    if (r.value > rows[iMax].value) iMax = i;
    if (r.value < rows[iMin].value) iMin = i;
  });
  const maxR = rows[iMax];
  const minR = rows[iMin];
  const spread = maxR.value - minR.value;
  const sum = rows.reduce((a, r) => a + r.value, 0);
  const avg = sum / rows.length;
  const bucket = timeBucketLabel.trim() || "Weekly";

  const fmt = (v: number, disp?: string) => formatTrendValue(v, kind, disp);

  return [
    {
      key: "t-peak",
      title: "Peak week",
      value: shorten(String(maxR.name ?? "—"), 44),
      hint: fmt(maxR.value, maxR.displayValue),
      dotClass: nextDot(),
    },
    {
      key: "t-low",
      title: "Lowest week",
      value: shorten(String(minR.name ?? "—"), 44),
      hint: fmt(minR.value, minR.displayValue),
      dotClass: nextDot(),
    },
    {
      key: "t-gap",
      title: "Gap (peak − lowest)",
      value: fmt(spread, undefined),
      hint: `${shorten(String(maxR.name ?? ""), 20)} ↔ ${shorten(String(minR.name ?? ""), 20)}`,
      dotClass: nextDot(),
    },
    {
      key: "t-avg",
      title: `Average ${bucket.toLowerCase()} total`,
      value: fmt(avg, undefined),
      dotClass: nextDot(),
    },
    {
      key: "t-steps",
      title: "Time steps",
      value: String(rows.length),
      dotClass: nextDot(),
    },
  ];
}

export function buildTrendPdfRankedSignals(
  rows: ChartRow[],
  kind: ChartKind,
  max = 3
): PdfRankedSignal[] | null {
  if (rows.length < 2) return null;

  let iMax = 0;
  let iMin = 0;
  rows.forEach((r, i) => {
    if (r.value > rows[iMax].value) iMax = i;
    if (r.value < rows[iMin].value) iMin = i;
  });
  const maxR = rows[iMax];
  const minR = rows[iMin];
  const spread = maxR.value - minR.value;

  const fmt = (r: ChartRow) =>
    r.displayValue?.trim() ||
    fallbackChartNumericDisplay(kind === "area" ? "area" : "line", r.value);

  const out: PdfRankedSignal[] = [
    {
      rank: "Peak week",
      category: String(maxR.name ?? "").trim() || "—",
      valueDisplay: fmt(maxR),
    },
    {
      rank: "Lowest week",
      category: String(minR.name ?? "").trim() || "—",
      valueDisplay: fmt(minR),
    },
    {
      rank: "Gap",
      category: `${shorten(String(maxR.name ?? ""), 16)} ↔ ${shorten(String(minR.name ?? ""), 16)}`,
      valueDisplay: fallbackChartNumericDisplay("line", spread),
    },
  ];
  return out.slice(0, max);
}

export function buildTrendAxisPresentation(contract: VisualizationContract): {
  axes: {
    categoryAxis: string;
    valueAxis: string;
    valueAxisCompact: string;
  };
  header: ChartSemanticHeaderModel;
} {
  const timeLabel = contract.timeBucketLabel.trim() || "Weekly";
  const metric = contract.metricLabel.trim() || "Value";
  return {
    axes: {
      categoryAxis: `${timeLabel.toLowerCase()} buckets`,
      valueAxis: metric,
      valueAxisCompact: metric.length > 28 ? `${metric.slice(0, 26)}…` : metric,
    },
    header: {
      mode: "mono",
      roleLabel: "Time",
      detailLabel: timeLabel,
    },
  };
}

export function trendInsightBadgeFromRows(
  rows: ChartRow[],
  kind: ChartKind
): string | null {
  if (!rows.length) return null;
  if (rows.length === 1) {
    return `Period: ${String(rows[0].name ?? "—")}`;
  }
  let iMax = 0;
  rows.forEach((r, i) => {
    if (r.value > rows[iMax].value) iMax = i;
  });
  const peak = rows[iMax];
  return `Peak week: ${String(peak.name ?? "—")}`;
}
