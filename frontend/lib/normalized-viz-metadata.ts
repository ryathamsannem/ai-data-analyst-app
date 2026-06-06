/**
 * Business-safe chart titles and axis semantics — never surface raw conversational prompts
 * as visualization titles, axis labels, or KPI copy.
 */

import type { ChartKind } from "@/app/chart-types";
import {
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
} from "@/lib/analytics-metadata";
import {
  pickCategoryParts,
  pickMetricParts,
  type ChartSemanticAnalysisLike,
  type ChartSemanticVizLike,
} from "@/lib/chart-semantic-metadata";
import { apiChartStringToKind } from "@/lib/smart-chart-intelligence";
import {
  buildRelationshipMeasureLabel,
  buildRelationshipScatterDisplayTitle,
  looksLikeDuplicatedRelationshipTitle,
} from "@/lib/relationship-scatter-labels";
import {
  buildInsightTitle,
  fromAlignedAnalysis,
  type SemanticMetricContext,
} from "@/lib/semantic-metric-engine";

const CHAT_TITLE_RE =
  /\b(summarize|summarise|explain|describe|analyze|analyse|what\s+does\s+the\s+chart|what\s+the\s+chart|how\s+does\s+the\s+chart|chart\s+shows|based\s+on\s+(the|your)\s+(question|prompt|chart)|please\s+(tell|show|give)|tell\s+me\s+about|walk\s+me\s+through|can\s+you\s+)\b/i;

/** Raw persisted titles that look like user chat rather than a chart name. */
export function isPromptLikeVisualizationTitle(raw: string): boolean {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (t.length > 88) return true;
  if (CHAT_TITLE_RE.test(t)) return true;
  if (t.includes("?") && t.length > 28) return true;
  if (/^show\s+me\b/i.test(t) && t.length > 18) return true;
  if (/^plot\b|^graph\b|^visuali[sz]e\b/i.test(t) && t.length > 24) return true;
  return false;
}

/** Pull a short chart phrase embedded in chatty titles, e.g. chart "Revenue by product". */
export function extractEmbeddedChartTitlePhrase(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  const m1 = t.match(/\bchart\s*["""']([^"""']{3,100})["""']/i);
  if (m1?.[1]) {
    const inner = m1[1].replace(/\s+/g, " ").trim();
    if (inner && !isPromptLikeVisualizationTitle(inner)) return inner;
  }
  const m2 = t.match(/\b(?:titled|called|named)\s+["']([^"']{3,100})["']/i);
  if (m2?.[1]) {
    const inner = m2[1].replace(/\s+/g, " ").trim();
    if (inner && !isPromptLikeVisualizationTitle(inner)) return inner;
  }
  return null;
}

export type SemanticProfileKind =
  | "provenance_columns"
  | "embedded_phrase"
  | "clean_persisted_title"
  | "heuristic_template";

export type NormalizedVizMetadata = {
  /** Heading / PDF chart title — never the raw user prompt. */
  chartTitle: string;
  /** Same as chartTitle unless a shorter phrase is better for grain parsing. */
  grainHintTitle: string;
  /** Title passed into `inferChartAxesFromContext` (short, business-shaped). */
  titleForInference: string;
  metricLabel: string;
  categoryLabel: string;
  chartType: ChartKind;
  semanticProfile: SemanticProfileKind;
  confidence: "high" | "medium" | "low";
};

function _isTimeSeriesKind(kind: ChartKind): boolean {
  return kind === "line" || kind === "area";
}

function templateChartTitle(
  kind: ChartKind,
  metric: string,
  category: string
): string {
  const met = metric.trim() || "Value";
  const cat = category.trim() || "Category";
  if (kind === "pie" || kind === "donut") return `${met} by ${cat}`;
  if (kind === "line" || kind === "area") return `${met} over time`;
  if (kind === "scatter") {
    if (/\bvs\.?\b/i.test(met)) return met;
    return buildRelationshipMeasureLabel(cat, met);
  }
  if (kind === "histogram") return `Distribution — ${met}`;
  if (kind === "bar_horizontal") return `${met} by ${cat}`;
  return `${met} by ${cat}`;
}

function looksLikeShortBusinessTitle(t: string): boolean {
  const s = t.trim();
  if (!s || s.length > 72) return false;
  if (isPromptLikeVisualizationTitle(s)) return false;
  if (/\b(summarize|explain|chart)\b/i.test(s)) return false;
  return true;
}

/**
 * Build display + inference titles and canonical metric/category labels from
 * provenance / aligned analysis, never from conversational wrappers.
 */
export function buildNormalizedVizMetadata(args: {
  rawPersistedTitle: string;
  chartSubtitle: string;
  presentationKind: ChartKind;
  viz: ChartSemanticVizLike;
  analysis: ChartSemanticAnalysisLike;
  preferAnalysisForCategory: boolean;
}): NormalizedVizMetadata {
  const kind = args.presentationKind || "";
  const { col: catCol, display: catDisp } = pickCategoryParts(
    args.viz,
    args.analysis,
    args.preferAnalysisForCategory
  );
  const { col: metCol, display: metDisp } = pickMetricParts(
    args.viz,
    args.analysis,
    args.preferAnalysisForCategory
  );

  const metricLabel = polishMetricDisplay(
    stripIntentNoiseFromMetricLabel(
      metDisp?.trim() || (metCol ? humanizeColumnName(metCol) : "") || ""
    )
  ).trim() || "Value";

  let categoryLabel =
    catDisp?.trim() || (catCol ? humanizeColumnName(catCol) : "").trim() || "Category";

  if (kind === "histogram") {
    categoryLabel = "Value range";
  }

  const hasMetric = Boolean(metCol?.trim() || metDisp?.trim());
  const hasCategory = Boolean(catCol?.trim() || catDisp?.trim());
  const confidence: NormalizedVizMetadata["confidence"] =
    hasMetric && hasCategory ? "high" : hasMetric || hasCategory ? "medium" : "low";

  const semanticCtx: SemanticMetricContext | null = fromAlignedAnalysis(
    args.analysis,
    args.viz,
    kind
  );

  const raw = args.rawPersistedTitle.replace(/\s+/g, " ").trim();
  const relMeasure = args.viz?.relationshipMeasureLabel?.trim() ?? "";

  let semanticProfile: SemanticProfileKind = "heuristic_template";
  let chartTitle = semanticCtx
    ? buildInsightTitle(semanticCtx)
    : templateChartTitle(kind, metricLabel, categoryLabel);
  if (kind === "scatter" && relMeasure) {
    chartTitle = buildRelationshipScatterDisplayTitle({
      question: "",
      xLabel: categoryLabel,
      yLabel: metricLabel,
      persistedTitle: raw,
      relationshipMeasureLabel: relMeasure,
    });
  } else if (
    kind === "scatter" &&
    raw &&
    !looksLikeDuplicatedRelationshipTitle(raw)
  ) {
    chartTitle = polishMetricDisplay(stripIntentNoiseFromMetricLabel(raw)).trim();
  }
  let titleForInference = chartTitle;
  const metricLabelOut = semanticCtx?.metricLabel?.trim() || metricLabel;
  const categoryLabelOut = semanticCtx?.dimensionLabel?.trim() || categoryLabel;

  const embedded = extractEmbeddedChartTitlePhrase(raw);
  if (embedded && !semanticCtx) {
    chartTitle = embedded;
    titleForInference = embedded;
    semanticProfile = "embedded_phrase";
  } else if (looksLikeShortBusinessTitle(raw) && !semanticCtx) {
    chartTitle = polishMetricDisplay(stripIntentNoiseFromMetricLabel(raw)).trim() || chartTitle;
    titleForInference = chartTitle;
    semanticProfile = "clean_persisted_title";
  } else if (semanticCtx || hasMetric || hasCategory) {
    if (semanticCtx) {
      chartTitle = buildInsightTitle(semanticCtx);
    }
    titleForInference = chartTitle;
    semanticProfile = semanticCtx ? "provenance_columns" : "heuristic_template";
  } else {
    semanticProfile = "heuristic_template";
  }

  const grainHintTitle = chartTitle;

  return {
    chartTitle,
    grainHintTitle,
    titleForInference,
    metricLabel: metricLabelOut,
    categoryLabel: categoryLabelOut,
    chartType: kind,
    semanticProfile,
    confidence,
  };
}

/** Strip chatty scatter axis labels; prefer provenance column human names. */
export function sanitizeVisualizationSemanticLabels(
  viz: ChartSemanticVizLike,
  analysis: ChartSemanticAnalysisLike,
  preferAnalysisForCategory: boolean
): ChartSemanticVizLike {
  if (!viz) return viz;
  if (String(viz.chartType ?? "").toLowerCase() !== "scatter") return viz;

  const { col: mx, display: mxd } = pickMetricParts(
    viz,
    analysis,
    preferAnalysisForCategory
  );
  const { col: cx, display: cxd } = pickCategoryParts(
    viz,
    analysis,
    preferAnalysisForCategory
  );

  const xRaw = viz.scatterXLabel?.trim() ?? "";
  const yRaw = viz.scatterYLabel?.trim() ?? "";

  const fallbackX =
    cxd?.trim() || (cx ? humanizeColumnName(cx) : "") || "X";
  const fallbackY =
    mxd?.trim() || (mx ? humanizeColumnName(mx) : "") || "Y";

  const xLooksVs = /\bvs\.?\b/i.test(xRaw);
  const yLooksVs = /\bvs\.?\b/i.test(yRaw);
  const xLabel =
    xRaw && !isPromptLikeVisualizationTitle(xRaw) && !xLooksVs ? xRaw : fallbackX;
  const yLabel =
    yRaw && !isPromptLikeVisualizationTitle(yRaw) && !yLooksVs ? yRaw : fallbackY;

  if (xLabel === xRaw && yLabel === yRaw) return viz;
  return {
    ...viz,
    scatterXLabel: xLabel,
    scatterYLabel: yLabel,
  };
}

/** KPI / chip titles that accidentally contain prompt boilerplate. */
export function sanitizeKpiLabelPhrase(label: string): string {
  const t = label.replace(/\s+/g, " ").trim();
  if (!t) return t;
  if (!isPromptLikeVisualizationTitle(t)) return t;
  const e = extractEmbeddedChartTitlePhrase(t);
  if (e) return e.length > 80 ? `${e.slice(0, 77)}…` : e;
  const stripped = stripIntentNoiseFromMetricLabel(t);
  const polished = polishMetricDisplay(stripped).trim();
  if (polished && !isPromptLikeVisualizationTitle(polished)) return polished.slice(0, 80);
  return "Key metric";
}

export function normalizeAlignedAnalysisChartTitle(args: {
  rawTitle: string;
  chartTypeStr: string;
  metricColumn: string | null;
  metricColumnDisplay: string | null;
  categoryColumn: string | null;
  categoryColumnDisplay: string | null;
}): string {
  const viz: ChartSemanticVizLike = {
    chartType: args.chartTypeStr,
    provenance: {
      numericColumn: args.metricColumn,
      numericColumnDisplay: args.metricColumnDisplay,
      categoryColumn: args.categoryColumn,
      categoryColumnDisplay: args.categoryColumnDisplay,
    },
  };
  const analysis: ChartSemanticAnalysisLike = {
    metricColumn: args.metricColumn,
    metricColumnDisplay: args.metricColumnDisplay,
    categoryColumn: args.categoryColumn,
    categoryColumnDisplay: args.categoryColumnDisplay,
  };
  return buildNormalizedVizMetadata({
    rawPersistedTitle: args.rawTitle,
    chartSubtitle: "",
    presentationKind: apiChartStringToKind(args.chartTypeStr),
    viz,
    analysis,
    preferAnalysisForCategory: true,
  }).chartTitle;
}
