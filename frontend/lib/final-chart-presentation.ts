/**
 * Single deterministic chart presentation for a dataset slice.
 * Used by Overview mini-cards, Charts tab session snapshots, AI Insights, PDF, and PNG
 * so the same rows + API chart type always resolve to the same kind/orientation.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import { grainLabelFromTimeMeta } from "@/lib/chart-semantic-metadata";
import { humanizeColumnName } from "@/lib/analytics-metadata";
import { apiChartStringToKind } from "@/lib/smart-chart-intelligence";

function labelLooksTemporal(name: string): boolean {
  const s = String(name ?? "").trim();
  if (!s) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s))
    return true;
  if (/\bq[1-4]\b(?:\s*[''\u2019]?|\/|\s|,)\s*\d{2,4}$/i.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  const parsed = Date.parse(s);
  return !Number.isNaN(parsed);
}

function rowsLookTemporal(rows: ChartRow[]): boolean {
  if (rows.length < 2) return false;
  return rows.every((r) => labelLooksTemporal(String(r.name ?? "")));
}

function rowsHaveScatterPoints(rows: ChartRow[]): boolean {
  return rows.some(
    (r) => typeof r.x === "number" && Number.isFinite(r.x as number)
  );
}

/** API / persistence string aligned with backend `_chart_type_for_api`. */
export function chartKindToApiChartType(kind: ChartKind): string {
  switch (kind) {
    case "bar_horizontal":
      return "horizontalBar";
    case "bar":
      return "bar";
    case "line":
      return "line";
    case "area":
      return "area";
    case "scatter":
      return "scatter";
    case "histogram":
      return "histogram";
    case "pie":
      return "pie";
    case "donut":
      return "donut";
    default:
      return "bar";
  }
}

export type FinalChartOrientation =
  | "vertical"
  | "horizontal"
  | "radial"
  | "cartesian2d";

export type FinalChartPresentationMeta = {
  chartType: ChartKind;
  orientation: FinalChartOrientation;
  metric?: string;
  dimension?: string;
  /** Date / period column driving time-series X when applicable */
  timeColumn?: string | null;
  /** @deprecated use timeColumn — kept for older snapshots */
  dateColumn?: string | null;
  aggregation?: string;
  /** Adaptive bucket (Weekly, Daily, …) when engine provides `timeSeriesAnalysis` */
  grain?: string | null;
};

export function orientationForChartKind(kind: ChartKind): FinalChartOrientation {
  if (kind === "bar_horizontal") return "horizontal";
  if (kind === "pie" || kind === "donut") return "radial";
  if (kind === "scatter") return "cartesian2d";
  return "vertical";
}

function rankIntentFromText(title: string, question?: string): boolean {
  const blob = `${title} ${question ?? ""}`.toLowerCase();
  if (
    /\b(outliers?|anomal(?:y|ies)|ranked\s+by|value\s+distribution)\b/i.test(blob)
  ) {
    return true;
  }
  return /\b(rank|ranking|top\s*\d+|bottom\s*\d+|highest|lowest|leading|trailing|sorted)\b/i.test(
    blob
  );
}

function barFamilyKindFromRows(args: {
  apiBarLike: ChartKind;
  title: string;
  question?: string;
  rows: ChartRow[];
}): ChartKind {
  const { apiBarLike, title, question, rows } = args;

  if (!rows.length) {
    return apiBarLike === "pie" || apiBarLike === "donut" ? apiBarLike : "bar";
  }

  const n = rows.length;
  const labels = rows.map((r) => String(r.name ?? ""));
  const maxLen = Math.max(0, ...labels.map((s) => s.length));
  const avgLen =
    labels.reduce((a, b) => a + b.length, 0) / Math.max(1, labels.length);

  if (rowsLookTemporal(rows)) {
    return "line";
  }

  const values = rows
    .map((r) => Number(r.value))
    .filter((v) => Number.isFinite(v));
  const sum = values.reduce((a, b) => a + b, 0);
  const shareLike =
    values.length === n &&
    n >= 2 &&
    n <= 7 &&
    values.every((v) => v >= 0) &&
    ((sum >= 99.5 &&
      sum <= 100.5 &&
      values.every((v) => v <= 100)) ||
      (sum >= 0.98 &&
        sum <= 1.02 &&
        values.every((v) => v <= 1 && v >= 0)));

  if (shareLike && shareCompositionAllowed(title, question)) {
    return n <= 4 ? "pie" : "donut";
  }

  if (apiBarLike === "histogram") {
    return "histogram";
  }

  const rankIntent = rankIntentFromText(title, question);
  const shortLabels = maxLen <= 14 && avgLen <= 10;
  const useVerticalBar = n <= 6 && shortLabels && !rankIntent;

  if (useVerticalBar) {
    return "bar";
  }

  if (rankIntent || n > 6 || maxLen > 18 || avgLen > 12) {
    return "bar_horizontal";
  }

  return "bar_horizontal";
}

/** Radial charts only for composition/share questions — not min/max ranking. */
export function shareCompositionAllowed(title: string, question?: string): boolean {
  const blob = `${title} ${question ?? ""}`.toLowerCase();
  if (rankIntentFromText(title, question)) return false;
  if (/\b(lowest|minimum|least|highest|maximum|top|bottom|rank|ranking)\b/.test(blob)) {
    return false;
  }
  return /\b(share|composition|mix|split|portion|breakdown|distribution of|percent of total|percentage of total)\b/.test(
    blob
  );
}

/**
 * Returns the chart kind actually rendered (including `bar_horizontal` vs `bar`).
 * Does not use viewport width — only labels, row count, API type, and title/question hints.
 */
export function computeFinalChartPresentation(args: {
  apiChartType: string;
  title: string;
  question?: string;
  rows: ChartRow[];
}): ChartKind {
  const api = apiChartStringToKind(args.apiChartType);
  const { rows, title, question } = args;

  if (api === "scatter" && rowsHaveScatterPoints(rows)) {
    return "scatter";
  }

  if (api === "area") return "area";
  if (api === "line") return "line";
  if (api === "pie") return "pie";
  if (api === "donut") return "donut";
  if (api === "bar_horizontal") return "bar_horizontal";

  const apiBarLike: ChartKind =
    api === "scatter"
      ? "bar"
      : api === "histogram"
        ? "histogram"
        : "bar";

  return barFamilyKindFromRows({
    apiBarLike,
    title,
    question,
    rows,
  });
}

export function buildFinalChartPresentationMeta(
  kind: ChartKind,
  _rows: ChartRow[],
  prov?: {
    numericColumn?: string | null;
    categoryColumn?: string | null;
    categoryColumnDisplay?: string | null;
    timeSeriesAnalysis?: Record<string, unknown> | null;
    aggregation?: string;
  } | null
): FinalChartPresentationMeta {
  const isTime = kind === "line" || kind === "area";
  const timeCol =
    isTime && prov
      ? (prov.categoryColumnDisplay?.trim() ||
          (prov.categoryColumn
            ? humanizeColumnName(prov.categoryColumn)
            : null)) ??
        null
      : null;
  const grain =
    isTime && prov?.timeSeriesAnalysis
      ? grainLabelFromTimeMeta(prov.timeSeriesAnalysis)
      : null;

  return {
    chartType: kind,
    orientation: orientationForChartKind(kind),
    metric: prov?.numericColumn?.trim() || undefined,
    dimension:
      isTime || kind === "scatter"
        ? undefined
        : prov?.categoryColumn?.trim() || undefined,
    timeColumn: timeCol,
    dateColumn: timeCol,
    aggregation: prov?.aggregation?.trim() || undefined,
    grain: grain ?? null,
  };
}
