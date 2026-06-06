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

function periodNounFromBucket(bucket: string): string {
  if (/\bmonth/i.test(bucket)) return "month";
  if (/\bweek/i.test(bucket)) return "week";
  if (/\bday/i.test(bucket)) return "day";
  if (/\bquarter/i.test(bucket)) return "quarter";
  if (/\byear/i.test(bucket)) return "year";
  return "period";
}

function trendAvgCardTitle(bucket: string, metricLabel: string): string {
  const core = metricLabel.trim().replace(/^total\s+/i, "").trim() || "Revenue";
  const polished = core.charAt(0).toUpperCase() + core.slice(1);
  if (/\bmonth/i.test(bucket)) return `Avg Monthly ${polished}`;
  if (/\bweek/i.test(bucket)) return `Avg Weekly ${polished}`;
  if (/\bday/i.test(bucket)) return `Avg Daily ${polished}`;
  return `Avg ${bucket.trim() || "Period"} ${polished}`;
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
  rows.forEach((r, i) => {
    if (r.value > rows[iMax].value) iMax = i;
  });
  const maxR = rows[iMax];
  const sum = rows.reduce((a, r) => a + r.value, 0);
  const avg = sum / rows.length;
  const bucket = timeBucketLabel.trim() || "Weekly";
  const periodNoun = /\bmonth/i.test(bucket)
    ? "Month"
    : /\bweek/i.test(bucket)
      ? "Week"
      : /\bday/i.test(bucket)
        ? "Day"
        : "Period";

  const fmt = (v: number, disp?: string) => formatTrendValue(v, kind, disp);

  const chron = [...rows].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""))
  );
  const firstV = chron[0]?.value ?? 0;
  const lastV = chron[chron.length - 1]?.value ?? 0;
  let growthPct: number | null = null;
  if (Number.isFinite(firstV) && Math.abs(firstV) > 1e-9 && Number.isFinite(lastV)) {
    growthPct = ((lastV - firstV) / firstV) * 100;
  }
  const growthDisp =
    growthPct != null && Number.isFinite(growthPct)
      ? `${growthPct >= 0 ? "+" : ""}${
          Math.abs(growthPct) >= 10
            ? Math.round(growthPct)
            : growthPct.toFixed(1)
        }%`
      : "—";

  const avgTitle = trendAvgCardTitle(bucket, metricLabel.trim() || "Revenue");

  return [
    {
      key: "t-peak",
      title: `Best ${periodNoun}`,
      value: shorten(String(maxR.name ?? "—"), 44),
      hint: fmt(maxR.value, maxR.displayValue),
      dotClass: nextDot(),
    },
    {
      key: "t-baseline",
      title: chron.length >= 2 ? `Starting ${periodNoun}` : `Baseline ${periodNoun}`,
      value: shorten(String(chron[0]?.name ?? "—"), 44),
      hint: fmt(chron[0]?.value ?? 0, chron[0]?.displayValue),
      dotClass: nextDot(),
    },
    {
      key: "t-growth",
      title: "Total Growth",
      value: growthDisp,
      hint:
        chron.length >= 2
          ? `${shorten(String(chron[0]?.name ?? ""), 14)} → ${shorten(String(chron[chron.length - 1]?.name ?? ""), 14)}`
          : undefined,
      dotClass: nextDot(),
    },
    {
      key: "t-avg",
      title: avgTitle.length > 42 ? `${avgTitle.slice(0, 40)}…` : avgTitle,
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
  max = 3,
  timeBucketLabel = "Weekly"
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

  const peakRank = `Peak ${periodNounFromBucket(timeBucketLabel)}`;
  const lowRank = `Lowest ${periodNounFromBucket(timeBucketLabel)}`;

  const out: PdfRankedSignal[] = [
    {
      rank: peakRank.charAt(0).toUpperCase() + peakRank.slice(1),
      category: String(maxR.name ?? "").trim() || "—",
      valueDisplay: fmt(maxR),
    },
    {
      rank: lowRank.charAt(0).toUpperCase() + lowRank.slice(1),
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
      roleLabel: "Granularity",
      detailLabel: timeLabel,
    },
  };
}

export function trendInsightBadgeFromRows(
  rows: ChartRow[],
  kind: ChartKind,
  timeBucketLabel = "Weekly"
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
  const noun = periodNounFromBucket(timeBucketLabel);
  return `Peak ${noun}: ${String(peak.name ?? "—")}`;
}
