/**
 * Immutable visualization contract — single source of truth across
 * Overview, Charts, AI Insights, and PDF export.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  chartKindToApiChartType,
  computeFinalChartPresentation,
} from "@/lib/final-chart-presentation";
import { polishMetricDisplay } from "@/lib/analytics-metadata";
import {
  aggregationPrefixLabel,
  metricStemFromRawTitle,
  trendGrainFromTitle,
} from "@/lib/canonical-chart-title";
import {
  buildContextCore,
  formatAggregationLabel,
  fromAutoDashboardChart,
  normalizeAggregationKey,
  type SemanticMetricContext,
} from "@/lib/semantic-metric-engine";
import { apiChartStringToKind } from "@/lib/smart-chart-intelligence";
import { buildChartNarrative } from "@/lib/ux-narrative";

export type VisualizationSource = "overview" | "ai" | "charts" | "auto_dashboard";

/** Semantic routing mode — frozen at selection; never re-inferred from AI. */
export type VisualizationMode =
  | "trend"
  | "category"
  | "distribution"
  | "comparison";

/** Canonical pinned visualization payload (alias: SelectedVisualization). */
export type VisualizationContract = {
  id: string;
  source: VisualizationSource;
  /** Full display title including aggregation when applicable. */
  title: string;
  displayTitle: string;
  chartType: ChartKind;
  rendererType: ChartKind;
  mode: VisualizationMode;
  labels: string[];
  series: number[];
  categoryKey: string | null;
  metricKey: string | null;
  aggregation: string;
  dimension: string | null;
  timeKey: string | null;
  timeBucketLabel: string;
  metricLabel: string;
  aggregationLabel: string;
  isTimeSeries: boolean;
  semanticContext: SemanticMetricContext | null;
  aiContext?: Record<string, unknown> | null;
  generatedAt: number;
};

export type SelectedVisualization = VisualizationContract;

function labelLooksTemporal(name: string): boolean {
  const s = String(name ?? "").trim();
  if (!s) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s))
    return true;
  if (/\bq[1-4]\b(?:\s*[''\u2019]?|\/|\s|,)\s*\d{2,4}$/i.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  if (/^w\d{1,2}\b/i.test(s) || /\bweek\b/i.test(s)) return true;
  if (/^\d{4}-w\d{1,2}$/i.test(s)) return true;
  const parsed = Date.parse(s);
  return !Number.isNaN(parsed);
}

export function labelsLookTemporal(labels: string[]): boolean {
  if (labels.length < 2) return false;
  return labels.every((l) => labelLooksTemporal(l));
}

export function isTimeSeriesChartKind(kind: ChartKind): boolean {
  return kind === "line" || kind === "area";
}

export function isTrendMode(
  contract: VisualizationContract | null | undefined
): boolean {
  return contract?.mode === "trend" || Boolean(contract?.isTimeSeries);
}

function extractTimeBucketLabel(title: string): string {
  const paren = title.match(/\(([^)]+)\)\s*$/);
  if (paren) {
    const inner = paren[1].trim().toLowerCase();
    if (inner.includes("week")) return "Weekly";
    if (inner.includes("month")) return "Monthly";
    if (inner.includes("day") || inner.includes("daily")) return "Daily";
    if (inner.includes("quarter")) return "Quarterly";
    if (inner.includes("year")) return "Yearly";
    return polishMetricDisplay(paren[1].trim());
  }
  if (/\bweekly\b/i.test(title)) return "Weekly";
  if (/\bmonthly\b/i.test(title)) return "Monthly";
  return "Time";
}

function buildTrendMetricLabel(stem: string, aggregation: string): string {
  const core = metricStemFromRawTitle(stem) || polishMetricDisplay(stem) || "Value";
  const agg = aggregationPrefixLabel(aggregation);
  if (agg === "Count of") return `${agg} ${core}`;
  return `${agg} ${core}`;
}

function buildTrendDisplayTitle(
  rawTitle: string,
  metricLabel: string
): string {
  const grain = trendGrainFromTitle(rawTitle);
  return `${metricLabel} trend (${grain})`;
}

function buildComparisonDisplayTitle(
  rawTitle: string,
  aggregation: string
): string {
  const byIdx = rawTitle.toLowerCase().indexOf(" by ");
  if (byIdx <= 0) return rawTitle;
  const left = rawTitle.slice(0, byIdx).trim();
  const right = rawTitle.slice(byIdx + 4).trim();
  const metricLabel = buildTrendMetricLabel(left, aggregation);
  return `${metricLabel} by ${polishMetricDisplay(right)}`;
}

export function inferVisualizationMode(args: {
  title: string;
  chartType: ChartKind;
  isTimeSeries: boolean;
  labels: string[];
}): VisualizationMode {
  const titleLc = args.title.toLowerCase();
  if (
    args.isTimeSeries ||
    isTimeSeriesChartKind(args.chartType) ||
    /\btrend\b/i.test(titleLc) ||
    labelsLookTemporal(args.labels)
  ) {
    return "trend";
  }
  if (args.chartType === "histogram" || /\bdistribution\b/i.test(titleLc)) {
    return "distribution";
  }
  if (args.chartType === "pie" || args.chartType === "donut") {
    return "distribution";
  }
  if (/\s+by\s+/i.test(args.title)) {
    return "comparison";
  }
  return "category";
}

export function freezeVisualizationContract(args: {
  id: string;
  source: VisualizationSource;
  title: string;
  apiChartType: string;
  chartKindPinned?: ChartKind | null;
  labels: string[];
  values: number[];
  rows: ChartRow[];
  question?: string;
  metricColumn?: string | null;
  categoryColumn?: string | null;
  aggregationKey?: string;
  datasetDomain?: string;
  aiContext?: Record<string, unknown> | null;
}): VisualizationContract {
  const rawTitle = args.title.trim() || "Chart";
  const temporalLabels = labelsLookTemporal(args.labels);
  const titleImpliesTrend = /\btrend\b/i.test(rawTitle);

  let chartType =
    args.chartKindPinned ??
    computeFinalChartPresentation({
      apiChartType: args.apiChartType,
      title: rawTitle,
      question: args.question,
      rows: args.rows,
    });

  const aggregation = normalizeAggregationKey(args.aggregationKey ?? "sum", "sum");
  const aggregationLabel = formatAggregationLabel(aggregation);

  let isTimeSeries =
    isTimeSeriesChartKind(chartType) ||
    temporalLabels ||
    titleImpliesTrend;

  if (
    isTimeSeries &&
    (chartType === "bar" || chartType === "bar_horizontal")
  ) {
    chartType = "line";
  }

  const effectiveKind: ChartKind = isTimeSeries
    ? isTimeSeriesChartKind(chartType)
      ? chartType
      : "line"
    : chartType;

  isTimeSeries =
    isTimeSeries ||
    isTimeSeriesChartKind(effectiveKind) ||
    titleImpliesTrend;

  const mode = inferVisualizationMode({
    title: rawTitle,
    chartType: effectiveKind,
    isTimeSeries,
    labels: args.labels,
  });

  const timeBucketLabel =
    mode === "trend" ? extractTimeBucketLabel(rawTitle) : "";

  let metricLabel = polishMetricDisplay(metricStemFromRawTitle(rawTitle) || rawTitle);
  let displayTitle = rawTitle;
  if (mode === "trend") {
    metricLabel = buildTrendMetricLabel(rawTitle, aggregation);
    displayTitle = buildTrendDisplayTitle(rawTitle, metricLabel);
  } else if (mode === "comparison" || /\s+by\s+/i.test(rawTitle)) {
    displayTitle = buildComparisonDisplayTitle(rawTitle, aggregation);
    const byIdx = rawTitle.toLowerCase().indexOf(" by ");
    if (byIdx > 0) {
      metricLabel = buildTrendMetricLabel(rawTitle.slice(0, byIdx), aggregation);
    }
  }

  const timeDimension =
    mode === "trend" ? timeBucketLabel || "Weekly" : null;

  let semanticContext: SemanticMetricContext | null = null;

  if (mode === "trend") {
    semanticContext = buildContextCore({
      metricCol: args.metricColumn ?? null,
      metricDisp: metricLabel,
      categoryCol: null,
      categoryDisp: timeDimension,
      aggregationKey: aggregation,
      aggregationLabel: null,
      chartType: effectiveKind,
      datasetDomain: args.datasetDomain,
    });
  } else {
    semanticContext = fromAutoDashboardChart(
      {
        title: displayTitle,
        chartType: chartKindToApiChartType(effectiveKind),
        metricColumn: args.metricColumn ?? null,
        categoryColumn: args.categoryColumn ?? null,
        aggregationKey: aggregation,
      },
      args.datasetDomain
    );
    if (semanticContext && isTimeSeries) {
      semanticContext = {
        ...semanticContext,
        chartType: effectiveKind,
        dimension: timeDimension,
        dimensionLabel: timeDimension ?? "Time",
      };
    }
  }

  return {
    id: args.id,
    source: args.source,
    title: displayTitle,
    displayTitle,
    chartType: effectiveKind,
    rendererType: effectiveKind,
    mode,
    labels: [...args.labels],
    series: [...args.values],
    categoryKey: mode === "trend" ? null : args.categoryColumn ?? null,
    metricKey: args.metricColumn ?? semanticContext?.metric ?? null,
    aggregation,
    dimension: mode === "trend" ? timeDimension : semanticContext?.dimensionLabel ?? null,
    timeKey: mode === "trend" ? timeDimension : null,
    timeBucketLabel: timeBucketLabel || (mode === "trend" ? "Weekly" : ""),
    metricLabel,
    aggregationLabel,
    isTimeSeries: mode === "trend" || isTimeSeries,
    semanticContext,
    aiContext: args.aiContext ?? null,
    generatedAt: Date.now(),
  };
}

export function resolvePresentationKindFromContract(
  snap: { chartKind?: ChartKind; contract?: VisualizationContract | null } | null
): ChartKind | "" {
  if (!snap) return "";
  const k = snap.contract?.chartType ?? snap.chartKind;
  return k || "";
}

export function contractDisplayTitle(
  contract: VisualizationContract | null | undefined,
  fallback = ""
): string {
  return contract?.displayTitle?.trim() || contract?.title?.trim() || fallback;
}

/** Re-export for callers that already import from this module. */
export { getCanonicalChartTitle, type CanonicalChartSpec } from "@/lib/canonical-chart-title";

export function narrativeCopyForContract(
  contract: VisualizationContract | null | undefined
): string {
  if (!contract) return "";
  if (contract.mode === "trend") {
    if (contract.semanticContext) {
      return buildChartNarrative(contract.semanticContext);
    }
    const bucket = (contract.timeBucketLabel || "weekly").toLowerCase();
    return `This chart tracks ${contract.metricLabel} across ${bucket} time buckets to show momentum, dips, and turning points.`;
  }
  return "";
}

export function sanitizeNarrativeForTrendContract(
  text: string,
  contract: VisualizationContract | null | undefined
): string {
  if (!contract || contract.mode !== "trend" || !text.trim()) return text;
  const bucket = contract.timeBucketLabel || "Weekly";
  const bucketLc = bucket.toLowerCase();
  let t = text;
  t = t.replace(
    /\baggregated\s+by\s+plant\b/gi,
    `aggregated by ${bucketLc} time buckets`
  );
  t = t.replace(/\baggregated\s+by\s+[^,.]+(?=\s+across)/gi, (m) => {
    if (/plant|severity|category/i.test(m)) {
      return `aggregated by ${bucketLc} time buckets`;
    }
    return m;
  });
  t = t.replace(/\bby\s+plant\b/gi, `by ${bucketLc} time buckets`);
  t = t.replace(/\bplant[- ]level\b/gi, `${bucketLc} time-bucket`);
  t = t.replace(/\bcategory\s+comparison\b/gi, "time-series view");
  t = t.replace(/\bvertical\s+bar\s+chart\b/gi, "line chart");
  return t;
}

export function semanticContextFromContract(
  contract: VisualizationContract | null | undefined
): SemanticMetricContext | null {
  return contract?.semanticContext ?? null;
}

export function validateExportMatchesContract(args: {
  exportChartId: string | null;
  exportChartType: ChartKind;
  exportDimension: string | null;
  contract: VisualizationContract | null | undefined;
}): { ok: boolean; warnings: string[] } {
  const { contract } = args;
  if (!contract) return { ok: true, warnings: [] };
  const warnings: string[] = [];
  if (args.exportChartId && args.exportChartId !== contract.id) {
    warnings.push(
      `id mismatch: export=${args.exportChartId} contract=${contract.id}`
    );
  }
  if (args.exportChartType !== contract.chartType) {
    warnings.push(
      `chartType mismatch: export=${args.exportChartType} contract=${contract.chartType}`
    );
  }
  if (contract.mode === "trend") {
    const exportDim = (args.exportDimension ?? "").trim().toLowerCase();
    if (
      exportDim &&
      (exportDim === "category" ||
        exportDim.includes("plant") ||
        exportDim.includes("severity"))
    ) {
      warnings.push(
        `dimension mismatch: trend chart used category axis "${args.exportDimension}"`
      );
    }
  }
  return { ok: warnings.length === 0, warnings };
}

export function apiChartTypeFromContract(
  contract: VisualizationContract | null | undefined,
  fallbackApi = "bar"
): string {
  if (!contract) return fallbackApi;
  return chartKindToApiChartType(contract.chartType);
}
