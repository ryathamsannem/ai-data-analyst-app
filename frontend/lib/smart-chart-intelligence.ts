import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
} from "@/lib/analytics-metadata";
import type { SemanticMetricContext } from "@/lib/semantic-metric-engine";
import { buildChartNarrative } from "@/lib/ux-narrative";

/** Grouped dual-metric bar metadata — same source as visualization `multiSeries`. */
export type GroupedBarSeriesMeta = {
  seriesKeys?: string[];
  seriesLabels?: Record<string, string>;
  categoryAxisTitle?: string | null;
};

const GROUPED_BAR_FALLBACK_BLURB =
  "If multiple measures are compared, grouped bars show differences across categories.";

function formatMeasureList(labels: string[]): string | null {
  const parts = labels.map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function pluralizeDimensionLabel(label: string): string {
  const t = label.trim();
  if (!t) return "categories";
  const lc = t.toLowerCase();
  if (/\bregions?\b/.test(lc)) return "regions";
  if (/\bproducts?\b/.test(lc)) return "products";
  if (/\bcampaigns?\b/.test(lc)) return "campaigns";
  if (/\bdepartments?\b/.test(lc)) return "departments";
  if (/\bchannels?\b/.test(lc)) return "channels";
  if (/\bcustomers?\b/.test(lc)) return "customers";
  if (/\bsegments?\b/.test(lc)) return "segments";
  if (/\bcategories?\b/.test(lc)) return "categories";
  if (/s$/i.test(t)) return lc;
  if (/^[A-Za-z][\w\s-]*$/.test(t) && !/\s/.test(t)) return `${lc}s`;
  return lc;
}

function measureLabelsFromMeta(
  meta: GroupedBarSeriesMeta | null | undefined,
  valueAxisFallback: string
): string[] {
  const keys = meta?.seriesKeys ?? [];
  const fromMeta = keys
    .map((k) => meta?.seriesLabels?.[k]?.trim() || k.trim())
    .filter(Boolean);
  if (fromMeta.length) return fromMeta;
  const fromAxis = valueAxisFallback
    .split(/\s*&\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return fromAxis;
}

/** One-line “why grouped bars” copy from visualization multi-series metadata. */
export function buildGroupedBarChartBlurb(
  meta: GroupedBarSeriesMeta | null | undefined,
  axisFallback?: { valueAxis?: string; categoryAxis?: string }
): string {
  const measures = formatMeasureList(
    measureLabelsFromMeta(meta, axisFallback?.valueAxis ?? "")
  );
  const dimRaw =
    meta?.categoryAxisTitle?.trim() ||
    axisFallback?.categoryAxis?.trim() ||
    "";
  const dim = pluralizeDimensionLabel(dimRaw);
  if (measures && dim) {
    return `Grouped side-by-side bars compare ${measures} across ${dim}.`;
  }
  return GROUPED_BAR_FALLBACK_BLURB;
}

export type ChartRoutingRec = {
  detectedIntent?: string;
  selectionExplanation?: string;
  recommendedChart?: string;
} | null;

export type SmartChartIntel = {
  /** False when chart is stacked/multi-series or rows empty — hide panel. */
  active: boolean;
  /** Always the chart kind actually rendered (same as `currentKind`). */
  recommendedKind: ChartKind;
  /** True when `recommendCore` chose a distribution-style vertical bar read. */
  histogramStyle: boolean;
  /** Human label for the rendered chart (same as `currentLabel`). */
  recommendedLabel: string;
  recommendationBlurb: string;
  currentKind: ChartKind;
  currentLabel: string;
  /** `recommendCore` kind — may differ from `currentKind` (e.g. vertical vs horizontal). */
  suggestedKind: ChartKind;
  suggestedLabel: string;
  alignsWithRecommendation: boolean;
  whyThisChart: string;
  anomalyNote: string | null;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

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

function avgMaxLabelLen(rows: ChartRow[]): { avg: number; max: number } {
  if (!rows.length) return { avg: 0, max: 0 };
  let sum = 0;
  let max = 0;
  for (const r of rows) {
    const L = String(r.name ?? "").length;
    sum += L;
    if (L > max) max = L;
  }
  return { avg: sum / rows.length, max };
}

function classifyQuestion(q: string): {
  trend: boolean;
  distribution: boolean;
  share: boolean;
  correlate: boolean;
  rank: boolean;
  outlier: boolean;
} {
  const t = norm(q);
  return {
    trend: /\b(trend|over\s*time|time\s*series|monthly|yearly|quarter|since|historical|evolution|trajectory|by\s+month|by\s+year)\b/i.test(
      t
    ),
    distribution: /\b(distribution|histogram|frequency|spread\s+of|density|how\s+values\s+are\s+spread)\b/i.test(
      t
    ),
    share: /\b(share|proportion|percentage|percent|part\s+of|mix|split|breakdown\s+by\s+share)\b/i.test(
      t
    ),
    correlate: /\b(correlation|correlate|correlations?|relationship|versus|vs\.?|dependency|dependencies|impact|against\s+each|scatter|pearson|regression|numeric\s+relationship)\b/i.test(
      t
    ),
    rank: /\b(rank|ranking|top\s*\d|bottom|sorted|ordered|highest|lowest|leading|trailing)\b/i.test(
      t
    ),
    outlier:
      /\b(outliers?|anomal(?:y|ies)|unusually\s+(?:high|low)|extreme\s+values?)\b/i.test(
        t
      ) ||
      /\bwhere\s+are\b.*\boutliers?\b/i.test(t) ||
      (/\b(?:largest|smallest|max|min)\b/i.test(t) &&
        /\b(?:outliers?|distribution|spread|range)\b/i.test(t)),
  };
}

function columnHintsTemporal(columns: string[]): boolean {
  return columns.some((c) =>
    /\b(date|time|timestamp|month|year|quarter|week|day)\b/i.test(c)
  );
}

export function apiChartStringToKind(api: string): ChartKind {
  const c = String(api || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (c === "horizontalbar" || c === "bar_horizontal") return "bar_horizontal";
  if (c === "scatter") return "scatter";
  if (c === "pie") return "pie";
  if (c === "donut") return "donut";
  if (c === "line") return "line";
  if (c === "area") return "area";
  if (c === "timeseries") return "line";
  if (c === "histogram") return "histogram";
  return "bar";
}

const GENERIC_DIMENSION_LABEL_RE =
  /^(category|categories|dimension|group|groups|breakdown|segment)$/i;

/** Lowercase dimension noun for chart view labels (zone, product, department, …). */
export function dimensionPhraseForComparison(
  categoryAxis: string,
  semanticContext?: SemanticMetricContext | null,
  groupedCategoryTitle?: string | null
): string {
  const polish = (raw: string): string => {
    let t = raw.trim();
    if (!t || t.length > 52 || /\?/.test(t)) return "";
    if (/^(is|are|what|which|how)\b/i.test(t)) return "";
    t = polishMetricDisplay(stripIntentNoiseFromMetricLabel(t));
    t = humanizeColumnName(t.replace(/_/g, " ")).trim();
    t = t.replace(/\s+name$/i, "").trim();
    return t.toLowerCase() || "";
  };

  const candidates = [
    semanticContext?.dimensionLabel?.trim(),
    groupedCategoryTitle?.trim(),
    categoryAxis.trim(),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const phrase = polish(raw);
    if (phrase && !GENERIC_DIMENSION_LABEL_RE.test(phrase)) {
      return phrase;
    }
  }
  for (const raw of candidates) {
    const phrase = polish(raw);
    if (phrase) return phrase;
  }
  return "category";
}

function presentationLabel(
  kind: ChartKind,
  histogramStyle: boolean,
  dimensionPhrase: string
): string {
  const dim = dimensionPhrase.trim().toLowerCase() || "category";
  if (kind === "histogram") return `Histogram (${dim} distribution)`;
  if (histogramStyle && kind === "bar")
    return `Vertical bar chart (${dim} distribution)`;
  if (kind === "line") return `Line chart (${dim} trend)`;
  if (kind === "area") return `Area chart (${dim} trend)`;
  if (kind === "pie") return `Pie chart (${dim} share)`;
  if (kind === "donut") return `Donut chart (${dim} share)`;
  if (kind === "scatter") return "Scatter plot (numeric relationship)";
  if (kind === "bar_horizontal")
    return `Horizontal bar chart (${dim} comparison)`;
  return `Vertical bar chart (${dim} comparison)`;
}

function _kindsStrictPresentationMatch(recK: ChartKind, curK: ChartKind): boolean {
  if (recK === curK) return true;
  if (
    (recK === "pie" || recK === "donut") &&
    (curK === "pie" || curK === "donut")
  )
    return true;
  return false;
}

function stdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let s = 0;
  for (const v of values) {
    const d = v - mean;
    s += d * d;
  }
  return Math.sqrt(s / (n - 1));
}

export function detectScatterRelationshipAnomaly(args: {
  rows: ChartRow[];
  xLabel: string;
  yLabel: string;
  scatterX?: number[];
  strongestOutliers?: {
    x?: number | null;
    y?: number | null;
    xLabel?: string;
    yLabel?: string;
  }[];
}): string | null {
  const { rows, xLabel, yLabel, scatterX: _scatterX, strongestOutliers } = args;
  void _scatterX;
  if (!rows.length) return null;
  const apiOut = strongestOutliers?.[0];
  if (apiOut && Number.isFinite(Number(apiOut.x)) && Number.isFinite(Number(apiOut.y))) {
    const xn = (apiOut.xLabel ?? xLabel).trim() || "X";
    const yn = (apiOut.yLabel ?? yLabel).trim() || "Y";
    const xv = Number(apiOut.x);
    const yv = Number(apiOut.y);
    const fmt = (n: number) =>
      Math.abs(n) >= 1000
        ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `Potential outlier detected near ${xn}=${fmt(xv)}, ${yn}=${fmt(yv)}.`;
  }
  if (rows.length >= 3) {
    return "One observation appears outside the normal cluster.";
  }
  return null;
}

export function detectNumericAnomalies(
  rows: ChartRow[],
  kind: ChartKind
): string | null {
  if (kind === "scatter") return null;
  if (!rows.length || kind === "pie" || kind === "donut") return null;
  const vals = rows
    .map((r) => Number(r.value))
    .filter((n) => Number.isFinite(n));
  if (vals.length < 3) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = stdDev(vals);
  const parts: string[] = [];

  if (sd > 1e-9) {
    let outlierName: string | null = null;
    let outlierZ = 0;
    for (const r of rows) {
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      const z = Math.abs((v - mean) / sd);
      if (z > 2.5 && z > outlierZ) {
        outlierZ = z;
        outlierName = String(r.name ?? "").trim() || null;
      }
    }
    if (outlierName) {
      parts.push(
        `One category (${outlierName.slice(0, 48)}${
          outlierName.length > 48 ? "…" : ""
        }) sits well outside the typical range compared to the series average.`
      );
    }
  }

  const sorted = [...vals].sort((a, b) => b - a);
  if (
    sorted.length >= 2 &&
    sorted[1]! > 1e-9 &&
    sorted[0]! / sorted[1]! >= 2.5
  ) {
    parts.push(
      "The largest value is much higher than the next value — the lead may deserve a closer look."
    );
  }

  const pos = vals.filter((v) => v > 0).length;
  const neg = vals.filter((v) => v < 0).length;
  if (pos >= Math.ceil(vals.length * 0.7) && neg > 0) {
    parts.push(
      "Most points are positive but at least one category is negative — worth validating business meaning."
    );
  }

  if (!parts.length) return null;
  return parts.slice(0, 2).join(" ");
}

type RecommendArgs = {
  question: string;
  columns: string[];
  rows: ChartRow[];
  apiChartType: string;
  /** Human axis labels — personalize recommendation blurbs. */
  valueAxis?: string;
  categoryAxis?: string;
};

function _recommendCore(args: RecommendArgs): {
  kind: ChartKind;
  histogramStyle: boolean;
  blurb: string;
} {
  const { question, columns, rows } = args;
  const q = classifyQuestion(question);
  const { avg, max } = avgMaxLabelLen(rows);
  const n = rows.length;
  const temporalRows = rowsLookTemporal(rows);
  const temporalCols = columnHintsTemporal(columns);
  const apiKind = apiChartStringToKind(args.apiChartType);
  const met = (args.valueAxis ?? "").trim() || "your metric";
  const dim = (args.categoryAxis ?? "").trim() || "each category";

  if (q.outlier && !/\bby\s+[a-z0-9]/i.test(norm(question))) {
    if (apiKind === "histogram") {
      return {
        kind: "histogram",
        histogramStyle: false,
        blurb:
          `Bins ${met} values so extreme salaries or records stand out in the tails — not department averages.`,
      };
    }
    return {
      kind: "bar_horizontal",
      histogramStyle: false,
      blurb:
        `Ranks individual ${met} values to highlight outliers. Grouped department averages hide extreme records.`,
    };
  }

  if (apiKind === "histogram") {
    return {
      kind: "histogram",
      histogramStyle: false,
      blurb:
        "Bins values into ranges so you can see whether the data piles up in the middle, tails left/right, or splits into modes.",
    };
  }

  if (
    apiKind === "scatter" ||
    (q.correlate && /\b(scatter|pearson|correlation\s+coefficient)\b/i.test(norm(question)))
  ) {
    return {
      kind: "scatter",
      histogramStyle: false,
      blurb:
        `Suited when you want to relate two quantitative signals — here ${met} against ${dim}.`,
    };
  }

  if (
    q.trend ||
    temporalRows ||
    (temporalCols &&
      n >= 3 &&
      /\b(over\s+time|time\s+series|by\s+(month|year|day|week)|trend|since)\b/i.test(
        norm(question)
      ))
  ) {
    return {
      kind: "line",
      histogramStyle: false,
      blurb:
        `Shows how ${met} moves across ordered periods (${dim}) so change reads naturally left-to-right.`,
    };
  }

  if (q.share && n >= 2 && n <= 8) {
    const kind: ChartKind = n <= 5 ? "pie" : "donut";
    return {
      kind,
      histogramStyle: false,
      blurb:
        `Best when you care about parts of a whole — ${met} allocated across a small set of ${dim}.`,
    };
  }

  if (q.distribution && n >= 4) {
    return {
      kind: "bar",
      histogramStyle: true,
      blurb:
        `Surfaces how ${met} spreads across ${dim} buckets — similar to a histogram for grouped categories.`,
    };
  }

  if (/\b(patterns?|signals?|strongest)\b/i.test(norm(question)) && n >= 6) {
    return {
      kind: "bar_horizontal",
      histogramStyle: false,
      blurb:
        `With several ${dim} values, horizontal bars make ${met} easier to scan and compare side-by-side.`,
    };
  }

  if (
    q.rank ||
    avg > 14 ||
    max > 22 ||
    n > 8 ||
    (n > 6 && !temporalRows)
  ) {
    return {
      kind: "bar_horizontal",
      histogramStyle: false,
      blurb:
        `Ranks ${dim} by ${met} — easiest layout when labels run long or you are comparing many groups.`,
    };
  }

  return {
    kind: "bar",
    histogramStyle: false,
    blurb:
      `Side-by-side view of ${met} across ${dim} — the default when you want straightforward group comparisons.`,
  };
}

function blurbForRenderedChart(params: {
  kind: ChartKind;
  histogramStyle: boolean;
  valueAxis: string;
  categoryAxis: string;
  groupedDualMetric?: boolean;
  groupedBarMeta?: GroupedBarSeriesMeta | null;
}): string {
  const met = params.valueAxis.trim() || "your metric";
  const dim = params.categoryAxis.trim() || "each category";
  if (params.groupedDualMetric) {
    return buildGroupedBarChartBlurb(params.groupedBarMeta, {
      valueAxis: met,
      categoryAxis: dim,
    });
  }
  if (params.kind === "histogram") {
    return `Bins ${met} into ranges to show spread and tail behavior across the cohort.`;
  }
  if (params.kind === "bar_horizontal") {
    return `Horizontal bars rank ${dim} by ${met} — easiest when labels are long or you are comparing many groups.`;
  }
  if (params.kind === "line") {
    const dimLc = dim.toLowerCase();
    const timeBuckets =
      /\bbuckets?\b/.test(dimLc) ||
      /\b(monthly|weekly|daily|hourly|quarterly|yearly)\b/.test(dimLc);
    return timeBuckets
      ? `Line chart shows how ${met} moves across ordered ${dim}.`
      : `Line chart shows how ${met} moves across ordered ${dim} periods.`;
  }
  if (params.kind === "area") {
    return `Area chart emphasizes trend and movement of ${met} across ${dim}.`;
  }
  if (params.kind === "scatter") {
    return `Scatter plot relates two numeric measures to surface correlation patterns.`;
  }
  if (params.kind === "pie" || params.kind === "donut") {
    return `Shows how ${met} splits across a modest set of ${dim} segments (part-to-whole).`;
  }
  if (params.histogramStyle && params.kind === "bar") {
    return `Vertical bars show how ${met} spreads across ${dim} buckets.`;
  }
  return `Vertical bars compare ${met} side-by-side across ${dim}.`;
}

function buildWhyThisChart(params: {
  currentLabel: string;
  categoryAxis: string;
  valueAxis: string;
  routing: ChartRoutingRec;
  answerSummary?: string;
  semanticContext?: SemanticMetricContext | null;
  chartBlurb?: string;
}): string {
  const expl = params.routing?.selectionExplanation?.trim();
  const dim = params.categoryAxis.trim() || "categories";
  const met = params.valueAxis.trim() || "values";

  if (params.chartBlurb?.trim()) {
    return params.chartBlurb.trim();
  }

  if (params.semanticContext) {
    const narrative = buildChartNarrative(params.semanticContext, {
      chartLabel: params.currentLabel,
      routingHint: expl || undefined,
    });
    if (narrative.trim()) return narrative;
  }

  if (expl && expl.length > 0) {
    const clipped = expl.length > 320 ? `${expl.slice(0, 317)}…` : expl;
    return `${clipped} Rendered as ${params.currentLabel.toLowerCase()} using “${met}” by “${dim}”.`;
  }
  const hint = params.answerSummary?.trim();
  const base = `This ${params.currentLabel.toLowerCase()} maps “${met}” across “${dim}”, which matches how the assistant structured the answer for your question.`;
  if (hint && hint.length > 24) {
    const one = hint.replace(/\s+/g, " ").slice(0, 200);
    return `${base} Narrative context: ${one}${hint.length > 200 ? "…" : ""}`;
  }
  return base;
}

export function computeSmartChartIntel(params: {
  question: string;
  columns: string[];
  rows: ChartRow[];
  apiChartType: string;
  presentationKind: ChartKind;
  stackedOrMultiSeries: boolean;
  multiSeriesLayout?: string | null;
  groupedBarMeta?: GroupedBarSeriesMeta | null;
  categoryAxis: string;
  valueAxis: string;
  routing: ChartRoutingRec;
  answerSummary?: string;
  semanticContext?: SemanticMetricContext | null;
  relationshipInsights?: {
    strongestOutliers?: {
      x?: number | null;
      y?: number | null;
      xLabel?: string;
      yLabel?: string;
    }[];
  } | null;
  scatterXValues?: number[];
  nearPerfectCorrelationCaution?: string | null;
}): SmartChartIntel | null {
  if (!params.rows.length) {
    return null;
  }

  const currentKind = params.presentationKind || "bar";
  const histogramStyle = false;
  const dimensionPhrase = dimensionPhraseForComparison(
    params.categoryAxis,
    params.semanticContext,
    params.groupedBarMeta?.categoryAxisTitle
  );
  const currentLabel = presentationLabel(
    currentKind,
    histogramStyle,
    dimensionPhrase
  );
  const groupedDual = params.multiSeriesLayout === "grouped_bar";
  const chartBlurb = blurbForRenderedChart({
    kind: currentKind,
    histogramStyle,
    valueAxis: params.valueAxis,
    categoryAxis: params.categoryAxis,
    groupedDualMetric: groupedDual,
    groupedBarMeta: groupedDual ? params.groupedBarMeta ?? null : null,
  });

  if (params.stackedOrMultiSeries) {
    const stackedBlurb = groupedDual
      ? chartBlurb
      : "Each stack shows sub-parts within a category — useful for mix effects while keeping the same cohort.";
    const whyThisChart = buildWhyThisChart({
      currentLabel: currentLabel,
      categoryAxis: params.categoryAxis,
      valueAxis: params.valueAxis,
      routing: params.routing,
      answerSummary: params.answerSummary,
      semanticContext: params.semanticContext,
      chartBlurb: stackedBlurb,
    });
    return {
      active: true,
      recommendedKind: currentKind,
      histogramStyle: false,
      recommendedLabel: currentLabel,
      recommendationBlurb: groupedDual ? "" : stackedBlurb,
      currentKind,
      currentLabel,
      suggestedKind: currentKind,
      suggestedLabel: currentLabel,
      alignsWithRecommendation: true,
      whyThisChart,
      anomalyNote: detectNumericAnomalies(params.rows, currentKind),
    };
  }

  // Always describe the rendered chart kind — never contradict orientation via stale routing copy.
  const whyThisChart = buildWhyThisChart({
    currentLabel,
    categoryAxis: params.categoryAxis,
    valueAxis: params.valueAxis,
    routing: params.routing,
    answerSummary: params.answerSummary,
    semanticContext: params.semanticContext,
    chartBlurb,
  });

  return {
    active: true,
    recommendedKind: currentKind,
    histogramStyle,
    recommendedLabel: currentLabel,
    recommendationBlurb: "",
    currentKind,
    currentLabel,
    suggestedKind: currentKind,
    suggestedLabel: currentLabel,
    alignsWithRecommendation: true,
    whyThisChart,
    anomalyNote: (() => {
      const parts: string[] = [];
      const near = params.nearPerfectCorrelationCaution?.trim();
      if (near) parts.push(near);
      const scatter =
        currentKind === "scatter"
          ? detectScatterRelationshipAnomaly({
              rows: params.rows,
              xLabel: params.categoryAxis,
              yLabel: params.valueAxis,
              scatterX: params.scatterXValues,
              strongestOutliers: params.relationshipInsights?.strongestOutliers,
            })
          : null;
      if (scatter) parts.push(scatter);
      const numeric =
        currentKind !== "scatter"
          ? detectNumericAnomalies(params.rows, currentKind)
          : null;
      if (numeric) parts.push(numeric);
      return parts.length ? parts.join(" ") : null;
    })(),
  };
}
