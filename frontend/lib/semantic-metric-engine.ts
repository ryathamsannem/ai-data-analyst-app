/**
 * Central semantic context for metrics, aggregations, and chart titles.
 * Domain-agnostic — driven by column metadata and aggregation keys only.
 */

import type { ChartKind } from "@/app/chart-types";
import {
  buildMetricLabel,
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
  type MetricLabelContext,
} from "@/lib/analytics-metadata";
import {
  pickCategoryParts,
  pickMetricParts,
  type ChartSemanticAnalysisLike,
  type ChartSemanticVizLike,
} from "@/lib/chart-semantic-metadata";
import { apiChartStringToKind } from "@/lib/smart-chart-intelligence";
import {
  metricsAreEquivalentForCompare,
  resolveFollowUpDimensionPhrase,
  sanitizeMetricPhraseForFollowUp,
} from "@/lib/ai-follow-up-suggestions";

export type AggregationKey = "sum" | "mean" | "max" | "min" | "count" | string;

export type SemanticMetricContext = {
  metric: string | null;
  metricLabel: string;
  aggregation: AggregationKey;
  aggregationLabel: string;
  dimension: string | null;
  dimensionLabel: string;
  chartType: ChartKind;
  datasetDomain: string;
};

const AGG_LABELS: Record<string, string> = {
  sum: "Total",
  mean: "Average",
  avg: "Average",
  max: "Maximum",
  min: "Minimum",
  count: "Count of",
  median: "Median",
};

export function normalizeAggregationKey(
  raw: string | null | undefined,
  fallback: AggregationKey = "sum"
): AggregationKey {
  const k = (raw ?? "").trim().toLowerCase();
  if (k === "avg") return "mean";
  if (k && k in AGG_LABELS) return k;
  if (k === "total") return "sum";
  if (k === "average") return "mean";
  return fallback;
}

export function formatAggregationLabel(aggKey: string | null | undefined): string {
  const k = normalizeAggregationKey(aggKey, "sum");
  return AGG_LABELS[k] ?? "Total";
}

function stripLeadingAggFromPhrase(phrase: string): string {
  return phrase
    .replace(/^(total|sum|average|mean|median|minimum|min|maximum|max|count of)\s+/i, "")
    .trim();
}

function metricStemFromColumn(metricCol: string | null): string {
  if (!metricCol?.trim()) return "Value";
  return polishMetricDisplay(
    stripIntentNoiseFromMetricLabel(humanizeColumnName(metricCol))
  );
}

/**
 * Metric phrase with aggregation; avoids "Average total production loss units".
 */
export function formatMetricLabel(
  ctx: Pick<
    SemanticMetricContext,
    "aggregation" | "metric" | "dimension" | "dimensionLabel"
  > & {
    metricColumnDisplay?: string | null;
    aggregationLabel?: string | null;
  }
): string {
  const agg = normalizeAggregationKey(ctx.aggregation, "sum");
  const dimLabel = ctx.dimensionLabel?.trim() || "";
  const display = ctx.metricColumnDisplay?.trim();

  if (display) {
    const polished = polishMetricDisplay(stripIntentNoiseFromMetricLabel(display));
    if (agg === "scatter") {
      if (/\bvs\.?\b/i.test(polished)) return polished;
      return polished;
    }
    if (agg === "mean") {
      const stem = stripLeadingAggFromPhrase(polished);
      if (dimLabel && stem) return `Average ${stem.toLowerCase()} per ${dimLabel.toLowerCase()}`;
      if (stem) return `Average ${stem}`;
    }
    if (agg === "sum") {
      const stem = stripLeadingAggFromPhrase(polished);
      if (/^total\s/i.test(polished)) return polished;
      return stem ? `Total ${stem}` : "Total";
    }
    return buildMetricLabel({
      aggregationKey: agg,
      aggregationLabel: ctx.aggregationLabel,
      metricColumn: ctx.metric,
      metricColumnDisplay: display,
    });
  }

  const stem = metricStemFromColumn(ctx.metric);
  const stemLower = stem.toLowerCase();

  if (agg === "count") {
    return buildMetricLabel({
      aggregationKey: "count",
      metricColumn: ctx.metric,
    });
  }

  if (agg === "mean") {
    const core = stripLeadingAggFromPhrase(stem);
    if (dimLabel && core) {
      return `Average ${core.toLowerCase()} per ${dimLabel.toLowerCase()}`;
    }
    if (core) return `Average ${core}`;
    return "Average";
  }

  if (agg === "sum") {
    if (["total", "sum", "value"].includes(stemLower)) return "Total";
    const core = stripLeadingAggFromPhrase(stem);
    return core ? `Total ${core}` : "Total";
  }

  if (agg === "max") return stem ? `Maximum ${stem}` : "Maximum";
  if (agg === "min") return stem ? `Minimum ${stem}` : "Minimum";

  const aggLab = formatAggregationLabel(agg);
  return stem ? `${aggLab} ${stem}` : aggLab;
}

function defaultAggForChartKind(kind: ChartKind): AggregationKey {
  if (kind === "line" || kind === "area") return "sum";
  return "sum";
}

export function buildInsightTitle(ctx: SemanticMetricContext): string {
  const met = ctx.metricLabel.trim() || formatMetricLabel(ctx);
  const dim = ctx.dimensionLabel.trim() || "category";
  const kind = ctx.chartType;

  if (kind === "pie" || kind === "donut") return `${met} by ${dim.toLowerCase()}`;
  if (kind === "line" || kind === "area") return `${met} over time`;
  if (kind === "scatter") {
    if (/\bvs\.?\b/i.test(met)) return met;
    return `${met} vs ${dim}`;
  }
  if (kind === "histogram") return `Distribution — ${met}`;
  return `${met} by ${dim.toLowerCase()}`;
}

export type FollowupQuestionKind = "compare" | "drill" | "rank_high" | "trend";

function followUpMetricPhrase(label: string): string {
  const raw = label.trim();
  if (!raw) return "";
  const clean = sanitizeMetricPhraseForFollowUp(raw);
  if (clean) return clean;
  const polished = polishMetricDisplay(stripIntentNoiseFromMetricLabel(raw));
  return polished.trim() || raw;
}

export function buildFollowupQuestion(
  kind: FollowupQuestionKind,
  ctx: SemanticMetricContext,
  opts?: { otherMetricLabel?: string; categoryName?: string }
): string {
  const met = followUpMetricPhrase(
    ctx.metricLabel.trim() || formatMetricLabel(ctx)
  );
  const dim = resolveFollowUpDimensionPhrase(
    ctx.dimensionLabel.trim() || "category",
    ctx.dimension,
    ctx.dimensionLabel
  );
  const otherRaw = opts?.otherMetricLabel?.trim();

  switch (kind) {
    case "compare": {
      const other = otherRaw ? followUpMetricPhrase(otherRaw) : "";
      if (other) {
        if (metricsAreEquivalentForCompare(met, other)) return "";
        return `Compare ${met} with ${other}`;
      }
      return `Compare ${met} with another measure`;
    }
    case "drill":
      return `Which ${dim} has the highest ${met}?`;
    case "rank_high":
      if (opts?.categoryName) return `Why is ${opts.categoryName} highest?`;
      return `What drives the top ${dim}?`;
    case "trend":
      return "Which period changed most recently?";
    default:
      return `Explore ${met} further`;
  }
}

export function buildContextCore(args: {
  metricCol: string | null;
  metricDisp: string | null;
  categoryCol: string | null;
  categoryDisp: string | null;
  aggregationKey: string | null;
  aggregationLabel: string | null;
  chartType: ChartKind;
  datasetDomain?: string;
}): SemanticMetricContext {
  const chartType = args.chartType;
  const aggregation = normalizeAggregationKey(
    args.aggregationKey,
    defaultAggForChartKind(chartType)
  );
  const aggregationLabel =
    args.aggregationLabel?.trim() || formatAggregationLabel(aggregation);
  const dimension = args.categoryCol?.trim() || null;
  const dimensionLabel =
    args.categoryDisp?.trim() ||
    (dimension ? humanizeColumnName(dimension) : "Category");
  const metric = args.metricCol?.trim() || null;

  const draft: SemanticMetricContext = {
    metric,
    metricLabel: "",
    aggregation,
    aggregationLabel,
    dimension,
    dimensionLabel,
    chartType,
    datasetDomain: (args.datasetDomain ?? "").trim().toLowerCase() || "generic",
  };

  draft.metricLabel = formatMetricLabel({
    ...draft,
    metricColumnDisplay: args.metricDisp,
    aggregationLabel,
  });

  return draft;
}

export function fromAlignedAnalysis(
  analysis: ChartSemanticAnalysisLike,
  viz: ChartSemanticVizLike,
  chartKind: ChartKind,
  datasetDomain?: string
): SemanticMetricContext | null {
  if (!analysis && !viz?.provenance) return null;
  const { col: metCol, display: metDisp } = pickMetricParts(viz, analysis, true);
  const { col: catCol, display: catDisp } = pickCategoryParts(viz, analysis, true);
  if (!metCol?.trim() && !metDisp?.trim() && !catCol?.trim() && !catDisp?.trim()) {
    return null;
  }
  let aggKey =
    analysis?.aggregationKey ??
    analysis?.aggregation ??
    viz?.provenance?.aggregationKey ??
    viz?.provenance?.aggregation ??
    null;
  const aggLabel = analysis?.aggregation ?? viz?.provenance?.aggregation ?? null;
  if (chartKind === "scatter") {
    aggKey = "scatter";
  }

  let metricDispOut = metDisp;
  let categoryDispOut = catDisp;
  if (chartKind === "scatter") {
    const sx = viz?.scatterXLabel?.trim();
    const sy = viz?.scatterYLabel?.trim();
    if (sx) categoryDispOut = sx;
    if (sy) metricDispOut = sy;
    if (metricDispOut && /\bvs\.?\b/i.test(metricDispOut) && sy) {
      metricDispOut = sy;
    }
  }

  return buildContextCore({
    metricCol: metCol,
    metricDisp: metricDispOut,
    categoryCol: catCol,
    categoryDisp: categoryDispOut,
    aggregationKey: typeof aggKey === "string" ? aggKey : String(aggKey ?? ""),
    aggregationLabel: typeof aggLabel === "string" ? aggLabel : null,
    chartType: chartKind,
    datasetDomain,
  });
}

export function fromVisualizationProvenance(
  viz: ChartSemanticVizLike,
  chartKind: ChartKind,
  datasetDomain?: string
): SemanticMetricContext | null {
  return fromAlignedAnalysis(null, viz, chartKind, datasetDomain);
}

export type AutoDashboardChartLike = {
  title?: string;
  chartType?: string;
  aggregationKey?: string | null;
  metricColumn?: string | null;
  categoryColumn?: string | null;
};

export function fromAutoDashboardChart(
  chart: AutoDashboardChartLike,
  datasetDomain?: string
): SemanticMetricContext | null {
  const chartType = apiChartStringToKind(chart.chartType ?? "bar");
  const metricCol = chart.metricColumn?.trim() || null;
  const categoryCol = chart.categoryColumn?.trim() || null;
  const agg = chart.aggregationKey ?? (chartType === "line" ? "sum" : "sum");

  if (metricCol || categoryCol) {
    return buildContextCore({
      metricCol,
      metricDisp: null,
      categoryCol,
      categoryDisp: null,
      aggregationKey: agg,
      aggregationLabel: null,
      chartType,
      datasetDomain,
    });
  }

  const title = (chart.title ?? "").trim();
  if (!title) return null;

  const byIdx = title.toLowerCase().indexOf(" by ");
  if (byIdx > 0) {
    const left = title.slice(0, byIdx).trim();
    const right = title.slice(byIdx + 4).trim();
    return buildContextCore({
      metricCol: null,
      metricDisp: left,
      categoryCol: null,
      categoryDisp: right,
      aggregationKey: agg,
      aggregationLabel: null,
      chartType,
      datasetDomain,
    });
  }

  if (/trend/i.test(title)) {
    const weekly = /\bweekly\b|\(weekly\)/i.test(title);
    const stem = title.replace(/\s+trend\b.*$/i, "").trim();
    return buildContextCore({
      metricCol: null,
      metricDisp: stem,
      categoryCol: null,
      categoryDisp: weekly ? "Weekly periods" : "Time",
      aggregationKey: "sum",
      aggregationLabel: null,
      chartType: "line",
      datasetDomain,
    });
  }

  return null;
}

export function metricLabelContextFromSemantic(
  ctx: SemanticMetricContext
): MetricLabelContext {
  return {
    aggregationKey: ctx.aggregation,
    aggregationLabel: ctx.aggregationLabel,
    metricColumn: ctx.metric,
    metricColumnDisplay: ctx.metricLabel,
  };
}

export function formatAlternateMetricLabel(
  columnName: string,
  inheritFrom?: SemanticMetricContext | null
): string {
  const human = humanizeColumnName(columnName);
  if (!inheritFrom) return human;
  return formatMetricLabel({
    metric: columnName,
    metricColumnDisplay: null,
    aggregation: inheritFrom.aggregation,
    aggregationLabel: inheritFrom.aggregationLabel,
    dimension: inheritFrom.dimension,
    dimensionLabel: inheritFrom.dimensionLabel,
  });
}
