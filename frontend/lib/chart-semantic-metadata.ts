import type { ChartKind } from "@/app/chart-types";
import { humanizeColumnName, polishMetricDisplay } from "@/lib/analytics-metadata";
import { canonicalMetricLabelFromChartTitle } from "@/lib/canonical-chart-title";

export type ChartSemanticVizLike = {
  chartType?: string;
  scatterXLabel?: string | null;
  scatterYLabel?: string | null;
  relationshipMeasureLabel?: string | null;
  multiSeries?: {
    layout?: string;
    seriesKeys?: unknown[];
    categoryAxisTitle?: string | null;
    stackAxisTitle?: string | null;
  } | null;
  provenance?: {
    categoryColumn?: string | null;
    categoryColumnDisplay?: string | null;
    numericColumn?: string | null;
    numericColumnDisplay?: string | null;
    aggregation?: string | null;
    aggregationKey?: string | null;
    timeSeriesAnalysis?: Record<string, unknown> | null;
    visualizationType?: string | null;
  } | null;
} | null;

export type ChartSemanticAnalysisLike = {
  categoryColumn?: string | null;
  categoryColumnDisplay?: string | null;
  metricColumn?: string | null;
  metricColumnDisplay?: string | null;
  aggregation?: string | null;
  aggregationKey?: string | null;
} | null;

/** Structured semantics for badges, PDF, and future persistence. */
export type ChartSemanticMetadata = {
  chartType: ChartKind;
  metric: string;
  dimension: string | null;
  timeColumn: string | null;
  aggregation: string | null;
  grain: string | null;
  xAxisRole: "time" | "category" | "bucket" | "scatter";
};

export type ChartSemanticHeaderModel =
  | { mode: "scatter"; xLabel: string; yLabel: string }
  | { mode: "mono"; roleLabel: string; detailLabel: string };

const TIME_BUCKET_LABEL: Record<string, string> = {
  M: "Monthly",
  W: "Weekly",
  D: "Daily",
  H: "Hourly",
  T: "By minute",
  raw: "Raw timestamps",
};

function titleCaseGrainPhrase(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  if (s === "by minute") return "By minute";
  if (s === "raw timestamps") return "Raw timestamps";
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Map engine `timeBucket` code or human freq string to a short grain label. */
export function grainLabelFromTimeMeta(
  timeSeriesAnalysis: Record<string, unknown> | null | undefined
): string | null {
  if (!timeSeriesAnalysis) return null;
  const tb = String(timeSeriesAnalysis.timeBucket ?? "").trim();
  if (tb && TIME_BUCKET_LABEL[tb]) return TIME_BUCKET_LABEL[tb];
  if (tb) return titleCaseGrainPhrase(tb);
  return null;
}

/** Parse trailing "(weekly)" / "(monthly)" from titles like "Orders over time (weekly)". */
export function grainLabelFromChartTitle(title: string): string | null {
  const m = title.trim().match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const inner = m[1].trim().toLowerCase();
  const inv: Record<string, string> = {
    monthly: "Monthly",
    weekly: "Weekly",
    daily: "Daily",
    hourly: "Hourly",
    "by minute": "By minute",
    "raw timestamps": "Raw timestamps",
  };
  if (inv[inner]) return inv[inner];
  return titleCaseGrainPhrase(inner);
}

const WEEK_RANGE_LABEL_RE =
  /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/;
const MONTH_BUCKET_LABEL_RE = /^\d{4}-\d{2}$/;
const DAY_BUCKET_LABEL_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Infer trend grain from bucket labels (overrides stale title copy). */
export function inferTrendGrainFromLabels(labels: string[]): string | null {
  const samples = labels.map((l) => String(l ?? "").trim()).filter(Boolean);
  if (samples.length < 2) return null;

  const weekRanges = samples.filter((l) => WEEK_RANGE_LABEL_RE.test(l)).length;
  if (weekRanges >= Math.ceil(samples.length * 0.5)) return "Weekly";

  const monthBuckets = samples.filter((l) => MONTH_BUCKET_LABEL_RE.test(l)).length;
  if (monthBuckets >= Math.ceil(samples.length * 0.5)) return "Monthly";

  const dayBuckets = samples.filter((l) => DAY_BUCKET_LABEL_RE.test(l)).length;
  if (dayBuckets >= Math.ceil(samples.length * 0.5)) return "Daily";

  const quarterBuckets = samples.filter((l) =>
    /\bQ[1-4]\b/i.test(l) || /^\d{4}-Q[1-4]$/i.test(l)
  ).length;
  if (quarterBuckets >= Math.ceil(samples.length * 0.5)) return "Quarterly";

  const yearBuckets = samples.filter((l) => /^\d{4}$/.test(l)).length;
  if (yearBuckets >= Math.ceil(samples.length * 0.5)) return "Yearly";

  return null;
}

/** Prefer engine bucket metadata over title defaults (avoids weekly copy on monthly series). */
export function resolveTrendBucketLabel(args: {
  title?: string;
  timeSeriesAnalysis?: Record<string, unknown> | null;
  timeBucketLabelOverride?: string | null;
  question?: string;
  labels?: string[];
}): string {
  const override = args.timeBucketLabelOverride?.trim();
  if (override && override.toLowerCase() !== "time") return override;

  const fromMeta = grainLabelFromTimeMeta(args.timeSeriesAnalysis);
  if (fromMeta) return fromMeta;

  const fromTitle = grainLabelFromChartTitle(args.title ?? "");
  if (fromTitle) return fromTitle;

  const ql = (args.question ?? "").toLowerCase();
  if (/\b(by month|monthly|month[- ]wise|each month|per month|every month)\b/.test(ql)) {
    return "Monthly";
  }
  if (/\b(by week|weekly|each week|per week)\b/.test(ql)) {
    return "Weekly";
  }
  if (/\b(by day|daily|each day|per day)\b/.test(ql)) {
    return "Daily";
  }

  const labels = (args.labels ?? []).map((l) => String(l ?? "").trim());
  const fromLabels = inferTrendGrainFromLabels(labels);
  if (fromLabels) return fromLabels;

  if (
    labels.length >= 2 &&
    labels.every((l) => /^\d{4}-\d{2}(-\d{2})?/.test(l) || /^\d{4}-\d{2}$/.test(l))
  ) {
    return "Monthly";
  }

  if (/\bmonthly\b/i.test(args.title ?? "")) return "Monthly";
  if (/\bweekly\b/i.test(args.title ?? "")) return "Weekly";

  return "Weekly";
}

export function pickCategoryParts(
  viz: ChartSemanticVizLike,
  analysis: ChartSemanticAnalysisLike,
  preferAnalysisForCategory: boolean
): { col: string | null; display: string | null } {
  if (preferAnalysisForCategory && analysis) {
    const col = analysis.categoryColumn?.trim() || null;
    const display = analysis.categoryColumnDisplay?.trim() || null;
    if (col || display) return { col, display };
  }
  const p = viz?.provenance;
  return {
    col: p?.categoryColumn?.trim() || null,
    display: p?.categoryColumnDisplay?.trim() || null,
  };
}

export function pickMetricParts(
  viz: ChartSemanticVizLike,
  analysis: ChartSemanticAnalysisLike,
  preferAnalysisForCategory: boolean
): { col: string | null; display: string | null } {
  if (preferAnalysisForCategory && analysis) {
    const col = analysis.metricColumn?.trim() || null;
    const display = analysis.metricColumnDisplay?.trim() || null;
    if (col || display) return { col, display };
  }
  const p = viz?.provenance;
  return {
    col: p?.numericColumn?.trim() || null,
    display: p?.numericColumnDisplay?.trim() || null,
  };
}

/** Strip aligned-analysis aggregation prefixes from a humanized column phrase. */
function stripLeadingAggFromMetricPhrase(phrase: string): string {
  return phrase
    .replace(/^(average|mean|avg|total|sum|maximum|minimum|max|min)\s+/i, "")
    .trim();
}

/**
 * Histogram measure chip: the numeric column being distributed (e.g. Salary),
 * not a stale aligned "Average salary" from a prior grouped chart.
 */
export function resolveHistogramMeasureChipLabel(
  viz: ChartSemanticVizLike,
  analysis: ChartSemanticAnalysisLike,
  preferAnalysis: boolean
): string {
  const p = viz?.provenance;
  const provDisp = p?.numericColumnDisplay?.trim();
  const provCol = p?.numericColumn?.trim();
  if (provDisp) {
    return (
      polishMetricDisplay(stripLeadingAggFromMetricPhrase(provDisp)) || "Value"
    );
  }
  if (provCol) {
    return polishMetricDisplay(humanizeColumnName(provCol)) || "Value";
  }

  const { col, display } = pickMetricParts(viz, analysis, preferAnalysis);
  const raw =
    display?.trim() || (col ? humanizeColumnName(col) : "").trim();
  if (!raw) return "Value";
  return polishMetricDisplay(stripLeadingAggFromMetricPhrase(raw)) || "Value";
}

function formatTimeAxisCaption(
  columnDisplay: string,
  columnRaw: string | null,
  grain: string | null
): string {
  const col =
    columnDisplay.trim() ||
    (columnRaw ? humanizeColumnName(columnRaw) : "").trim();
  if (col && grain) return `${col} (${grain})`;
  if (col) return col;
  if (grain) return `Timeline (${grain})`;
  return "Time";
}

function isTimeSeriesKind(kind: ChartKind): boolean {
  return kind === "line" || kind === "area";
}

/**
 * X-axis caption for Recharts `Label` / `ChartAxes.categoryAxis`
 * (not the small-multiples header — use `buildChartSemanticHeader` for that).
 */
export function resolveSemanticCategoryAxisForCharts(args: {
  presentationKind: ChartKind;
  chartTitle: string;
  /** Short semantic title for parsing trailing "(weekly)" etc. — never pass raw user prompts. */
  grainTitleHint?: string;
  viz: ChartSemanticVizLike;
  analysis: ChartSemanticAnalysisLike;
  preferAnalysisForCategory: boolean;
  /** From infer + refine when no provenance category exists */
  refinedCategoryFallback: string;
}): string {
  const {
    presentationKind,
    chartTitle,
    grainTitleHint,
    viz,
    analysis,
    preferAnalysisForCategory,
    refinedCategoryFallback,
  } = args;
  const grainSource = (grainTitleHint ?? chartTitle).trim();

  if (presentationKind === "histogram") {
    return "Bucket range";
  }

  if (presentationKind === "scatter") {
    const x = viz?.scatterXLabel?.trim();
    if (x) return x;
    return refinedCategoryFallback;
  }

  if (isTimeSeriesKind(presentationKind)) {
    const { col, display } = pickCategoryParts(
      viz,
      analysis,
      preferAnalysisForCategory
    );
    const colDisp =
      display?.trim() ||
      (col ? humanizeColumnName(col) : "").trim() ||
      (refinedCategoryFallback !== "Category" &&
      refinedCategoryFallback !== "Period"
        ? refinedCategoryFallback
        : "");
    const ts = viz?.provenance?.timeSeriesAnalysis;
    const grain =
      grainLabelFromTimeMeta(ts ?? null) ??
      grainLabelFromChartTitle(grainSource || chartTitle);
    return formatTimeAxisCaption(colDisp, col, grain);
  }

  const { col, display } = pickCategoryParts(
    viz,
    analysis,
    preferAnalysisForCategory
  );
  const cat =
    display?.trim() || (col ? humanizeColumnName(col) : "").trim() || "";
  if (cat) return cat;

  return refinedCategoryFallback;
}

export function buildChartSemanticMetadata(args: {
  presentationKind: ChartKind;
  chartTitle: string;
  grainTitleHint?: string;
  viz: ChartSemanticVizLike;
  analysis: ChartSemanticAnalysisLike;
  preferAnalysisForCategory: boolean;
  refinedCategoryFallback: string;
  refinedMetricLabel: string;
}): ChartSemanticMetadata {
  const { presentationKind, viz, analysis, preferAnalysisForCategory } = args;
  const grainSource = (args.grainTitleHint ?? args.chartTitle).trim();
  const { col: catCol, display: catDisp } = pickCategoryParts(
    viz,
    analysis,
    preferAnalysisForCategory
  );
  const { col: metCol, display: metDisp } = pickMetricParts(
    viz,
    analysis,
    preferAnalysisForCategory
  );
  const relMeasure = viz?.relationshipMeasureLabel?.trim();
  let metricPhrase =
    polishMetricDisplay(
      metDisp?.trim() ||
        (metCol ? humanizeColumnName(metCol) : "") ||
        args.refinedMetricLabel
    ).trim() || args.refinedMetricLabel;
  if (presentationKind === "scatter" && relMeasure) {
    metricPhrase = polishMetricDisplay(relMeasure);
  } else if (
    /\b(monthly|weekly|daily|quarterly|yearly)\s+.+\btrend\b/i.test(
      args.chartTitle
    ) ||
    /\btrend\b/i.test(metricPhrase)
  ) {
    const canonical = canonicalMetricLabelFromChartTitle(args.chartTitle, {
      metricColumn: metCol,
    });
    if (canonical !== "Value") metricPhrase = canonical;
  }

  const ts = viz?.provenance?.timeSeriesAnalysis;
  const grain = isTimeSeriesKind(presentationKind)
    ? grainLabelFromTimeMeta(ts ?? null) ??
      grainLabelFromChartTitle(grainSource || args.chartTitle)
    : null;

  let xAxisRole: ChartSemanticMetadata["xAxisRole"] = "category";
  if (presentationKind === "scatter") xAxisRole = "scatter";
  else if (presentationKind === "histogram") xAxisRole = "bucket";
  else if (isTimeSeriesKind(presentationKind)) xAxisRole = "time";

  const timeColumn =
    isTimeSeriesKind(presentationKind) && (catCol || catDisp)
      ? catDisp?.trim() || (catCol ? humanizeColumnName(catCol) : null)
      : null;

  const agg =
    (preferAnalysisForCategory && analysis?.aggregation?.trim()) ||
    viz?.provenance?.aggregation?.trim() ||
    (viz?.provenance?.aggregationKey != null
      ? String(viz.provenance.aggregationKey)
      : null) ||
    null;

  return {
    chartType: presentationKind,
    metric: metricPhrase,
    dimension:
      xAxisRole === "time" || xAxisRole === "scatter"
        ? null
        : xAxisRole === "bucket"
          ? metricPhrase
          : catDisp?.trim() || (catCol ? humanizeColumnName(catCol) : null),
    timeColumn,
    aggregation: agg,
    grain,
    xAxisRole,
  };
}

export function buildChartSemanticHeader(args: {
  presentationKind: ChartKind;
  chartTitle: string;
  grainTitleHint?: string;
  viz: ChartSemanticVizLike;
  analysis: ChartSemanticAnalysisLike;
  preferAnalysisForCategory: boolean;
  refinedCategoryFallback: string;
  refinedMetricLabel: string;
}): ChartSemanticHeaderModel {
  const api = String(args.viz?.chartType ?? "").toLowerCase();
  if (api === "scatter") {
    const x = args.viz?.scatterXLabel?.trim() || "X";
    const y = args.viz?.scatterYLabel?.trim() || args.refinedMetricLabel || "Y";
    return { mode: "scatter", xLabel: x, yLabel: y };
  }

  const catCaption = resolveSemanticCategoryAxisForCharts({
    presentationKind: args.presentationKind,
    chartTitle: args.chartTitle,
    grainTitleHint: args.grainTitleHint,
    viz: args.viz,
    analysis: args.analysis,
    preferAnalysisForCategory: args.preferAnalysisForCategory,
    refinedCategoryFallback: args.refinedCategoryFallback,
  });

  if (args.presentationKind === "histogram") {
    const detail =
      resolveHistogramMeasureChipLabel(
        args.viz,
        args.analysis,
        args.preferAnalysisForCategory
      ) || args.refinedMetricLabel;
    return { mode: "mono", roleLabel: "Bucket range", detailLabel: detail };
  }

  if (isTimeSeriesKind(args.presentationKind)) {
    return { mode: "mono", roleLabel: "Time", detailLabel: catCaption };
  }

  return { mode: "mono", roleLabel: "Category", detailLabel: catCaption };
}

/** PDF / export: left column title for the horizontal axis value row. */
export function pdfXAxisLineTitle(kind: ChartKind): string {
  if (kind === "scatter") return "X axis";
  if (kind === "histogram") return "Bucket range";
  if (kind === "line" || kind === "area") return "Time";
  return "Category";
}

export function pdfYAxisLineTitle(kind: ChartKind): string {
  if (kind === "scatter") return "Y axis";
  return "Value";
}
