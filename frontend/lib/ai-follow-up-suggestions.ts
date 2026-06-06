/**
 * Domain-agnostic follow-up question chips after an AI insight (no dataset-specific literals).
 */

import {
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
} from "@/lib/analytics-metadata";
import type { ChartKind } from "@/app/chart-types";
import { isSyntheticScatterPointLabel } from "@/lib/relationship-scatter-labels";

export type AiFollowUpChipContext = {
  lastQuestion: string;
  chartTitle: string;
  chartKind: ChartKind;
  /** Full metric phrase (tooltips / titles). */
  valueAxisLabel: string;
  /** Dimension / category axis label. */
  categoryAxisLabel: string;
  datasetDomain: string;
  /** Primary series rows (category → value). */
  seriesRows: { name: string; value: number }[];
  /** Human-readable alternate numeric measures for “compare A with B”. */
  alternateMetricLabels: string[];
  /** Side-by-side revenue/spend (or similar) comparison chart. */
  dualMetricCompare?: boolean;
  /** Raw series keys for grouped dual-metric charts (e.g. revenue, profit). */
  dualMetricSeriesKeys?: string[];
  /** Dataset columns for natural business follow-ups. */
  columns?: string[];
  metricColumn?: string | null;
  metricColumnDisplay?: string | null;
  categoryColumn?: string | null;
  categoryColumnDisplay?: string | null;
  /** Breakdown dimension for scatter margin follow-ups (not the scatter X metric). */
  breakdownDimensionLabel?: string | null;
  /** Backend executive lens: opportunity | risk | summary | driver | explain | strategy | loss | standout */
  executiveLens?: string | null;
  /** Canonical routing backbone (preferred over executiveLens when present). */
  routingIntent?: string | null;
};

const QUESTION_LIKE_AXIS_RE =
  /^(?:is|are|what|which|how|does|do|can|could|will|would|should)\b|[?]|\b(correlat|relationship|associated|versus|vs\.?)\b/i;

const AWKWARD_TAKEAWAY_RE =
  /single clearest takeaway from this cut|leads on total revenue|leads on revenue|summarize the headline pattern|where should leadership dig in first/i;

const CHART_TITLE_JUNK_RE =
  /\b(outliers?|geographic|histogram|distribution|frequency)\b/i;

function isHistogramBucketLabel(name: string): boolean {
  const t = name.trim();
  return /^\[\s*[\d,.]+\s*,\s*[\d,.]+\s*\]/.test(t);
}

/** True when a label is a full chart title or router phrase, not a clean metric name. */
export function isChartTitleOrGeneratedLabel(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 3) return true;
  if (/[—–-]/.test(t) && (CHART_TITLE_JUNK_RE.test(t) || t.split(/\s+/).length > 5)) {
    return true;
  }
  if (/^total\s+/i.test(t) && /\b(outliers?|geographic)\b/i.test(t)) return true;
  if (/^geographic\s+outliers?/i.test(t)) return true;
  if (t.length > 52) return true;
  return false;
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

const AGG_WORDS_RE =
  /\b(total|average|avg|mean|sum|count|median|min|max|net|gross|overall)\b/gi;

/** Normalized metric noun for compare-chip deduping (strips aggregation prefixes). */
export function metricStemForCompare(label: string): string {
  return norm(label).replace(AGG_WORDS_RE, " ").replace(/\s+/g, " ").trim();
}

const COMPARE_CHIP_RE = /^compare\s+(.+?)\s+with\s+(.+?)(?:\s+by\s+.+)?$/i;

/** Strip chart-title noise; return a short metric noun (revenue, profit, …). */
export function sanitizeMetricPhraseForFollowUp(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  const byTail = s.match(/\s+by\s+[\w\s]+$/i);
  if (byTail) s = s.slice(0, byTail.index).trim();
  const dashParts = s.split(/\s*[—–-]\s*/);
  if (dashParts.length > 1) {
    const tail = dashParts[dashParts.length - 1]!.trim();
    if (tail && !CHART_TITLE_JUNK_RE.test(tail)) s = tail;
  }
  s = s
    .replace(/\b(geographic\s+)?outliers?\b/gi, "")
    .replace(/\b(total|average|avg|mean|sum)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const stem = metricStemForCompare(s);
  return stem || s.toLowerCase();
}

export type FollowUpQualityContext = {
  chartTitle?: string;
  valueAxisLabel?: string;
};

export function isLowQualityFollowUpChip(
  chip: string,
  ctx?: FollowUpQualityContext
): boolean {
  const t = chip.trim();
  if (!t || AWKWARD_TAKEAWAY_RE.test(t)) return true;
  if (CHART_TITLE_JUNK_RE.test(t) && /compare\s+/i.test(t)) return true;
  if (/compare\s+total\s+/i.test(t)) return true;

  const cm = t.match(COMPARE_CHIP_RE);
  if (cm) {
    const left = cm[1]!.trim();
    const right = cm[2]!.trim();
    if (isChartTitleOrGeneratedLabel(left) || isChartTitleOrGeneratedLabel(right)) {
      return true;
    }
    if (left.split(/\s+/).length > 5 || right.split(/\s+/).length > 5) return true;
  }

  if (ctx?.chartTitle) {
    const title = norm(ctx.chartTitle);
    if (title.length >= 10 && norm(t).includes(title)) return true;
  }
  if (ctx?.valueAxisLabel && isChartTitleOrGeneratedLabel(ctx.valueAxisLabel)) {
    const axis = norm(ctx.valueAxisLabel);
    if (axis.length >= 8 && norm(t).includes(axis)) return true;
  }
  return false;
}

function isAwkwardFollowUpChip(chip: string, ctx?: FollowUpQualityContext): boolean {
  return isLowQualityFollowUpChip(chip, ctx);
}

function axisLabelLooksLikeQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 56) return true;
  if (QUESTION_LIKE_AXIS_RE.test(t)) return true;
  return t.split(/\s+/).length >= 9;
}

/** Lowercase dimension phrase from chart/analysis metadata (zone stays zone). */
export function resolveFollowUpDimensionPhrase(
  categoryAxisLabel: string,
  categoryColumn?: string | null,
  categoryColumnDisplay?: string | null
): string {
  const fromDisplay = categoryColumnDisplay?.trim();
  if (fromDisplay && !axisLabelLooksLikeQuestion(fromDisplay)) {
    return polishFollowUpPhrase(fromDisplay);
  }
  if (categoryColumn?.trim()) {
    const h = humanizeColumnName(categoryColumn.trim());
    if (!axisLabelLooksLikeQuestion(h)) return polishFollowUpPhrase(h);
  }
  const axis = categoryAxisLabel.trim();
  if (axis && !axisLabelLooksLikeQuestion(axis)) {
    return polishFollowUpPhrase(axis);
  }
  return "category";
}

function polishFollowUpPhrase(label: string): string {
  let t = stripIntentNoiseFromMetricLabel(label.trim());
  t = polishMetricDisplay(t);
  t = t.replace(/\s+name$/i, "").trim();
  return t.toLowerCase() || "category";
}

/** Plural dimension for “across zones”, “across products”. */
export function pluralizeFollowUpDimension(phrase: string): string {
  const d = phrase.trim().toLowerCase();
  if (!d) return "categories";
  if (/\bcategories$/.test(d) || /\bsegments$/.test(d)) return d;
  if (d.endsWith("s") && !d.endsWith("ss")) return d;
  if (d.endsWith("segment")) return `${d}s`;
  if (d.endsWith("y") && !/[aeiou]y$/i.test(d)) return `${d.slice(0, -1)}ies`;
  return `${d}s`;
}

function resolveFollowUpDimensionFromCtx(ctx: AiFollowUpChipContext): string {
  return resolveFollowUpDimensionPhrase(
    ctx.categoryAxisLabel,
    ctx.categoryColumn,
    ctx.categoryColumnDisplay
  );
}

/**
 * Business-oriented follow-ups after a dual-metric compare chart (revenue vs spend, etc.).
 */
function seriesKeyIsSpendLike(key: string): boolean {
  return /spend|cost|budget|expense|ad[_\s-]?spend|cogs|opex/i.test(
    key.toLowerCase()
  );
}

function seriesKeyIsRevenueLike(key: string): boolean {
  return /revenue|sales|income/i.test(key.toLowerCase());
}

export function buildDualMetricCompareFollowUpChips(
  categoryAxisLabel: string,
  seriesKeys?: string[],
  opts?: {
    categoryColumn?: string | null;
    categoryColumnDisplay?: string | null;
  }
): string[] {
  const dim = resolveFollowUpDimensionPhrase(
    categoryAxisLabel,
    opts?.categoryColumn,
    opts?.categoryColumnDisplay
  );
  const plural = pluralizeFollowUpDimension(dim);
  const keys = (seriesKeys ?? []).map((k) => k.trim()).filter(Boolean);
  const keyLabels = keys.map((k) => {
    const s = sanitizeMetricPhraseForFollowUp(humanizeColumnName(k));
    return s || humanizeColumnName(k).toLowerCase();
  });
  const m1 = keyLabels[0] ?? "metric";
  const m2 = keyLabels[1] ?? "metric";
  const spendCompare =
    keys.length >= 2 &&
    keys.some(seriesKeyIsSpendLike) &&
    keys.some(seriesKeyIsRevenueLike);
  if (spendCompare) {
    return [
      `Which ${dim} has the best ROAS?`,
      `Which ${dim} spends most efficiently?`,
      `Show ROAS by ${dim}`,
      `Which ${dim} should receive more budget?`,
      `Compare ROAS across ${plural}`,
    ];
  }
  return filterMeaningfulFollowUpChips(
    [
      `Which ${dim} has the highest ${m1}?`,
      `Which ${dim} contributes most ${m2}?`,
      `Compare ${m1} and ${m2} across ${plural}`,
      `Compare ${m1} across ${plural}`,
      `What is the most important business insight?`,
    ],
    m1
  ).slice(0, 5);
}

/** True when two labels name the same measure (e.g. Total Revenue vs Revenue). */
export function metricsAreEquivalentForCompare(a: string, b: string): boolean {
  const sa = metricStemForCompare(a);
  const sb = metricStemForCompare(b);
  if (!sa || !sb) return false;
  return sa === sb;
}

export function isInvalidMetricCompareChip(
  chip: string,
  primaryMetric?: string
): boolean {
  const m = chip.trim().match(COMPARE_CHIP_RE);
  if (!m) return false;
  const left = m[1]!.trim();
  const right = m[2]!.trim();
  if (metricsAreEquivalentForCompare(left, right)) return true;
  if (primaryMetric?.trim()) {
    const p = primaryMetric.trim();
    if (
      metricsAreEquivalentForCompare(left, p) &&
      metricsAreEquivalentForCompare(right, p)
    ) {
      return true;
    }
  }
  return false;
}

export function filterMeaningfulFollowUpChips(
  chips: string[],
  primaryMetric?: string,
  qualityCtx?: FollowUpQualityContext
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chip of chips) {
    const t = chip.replace(/\s+/g, " ").trim();
    if (
      !t ||
      isInvalidMetricCompareChip(t, primaryMetric) ||
      isAwkwardFollowUpChip(t, qualityCtx)
    ) {
      continue;
    }
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function filterAlternateMetricLabels(
  primaryMetric: string,
  alternates: string[]
): string[] {
  const out: string[] = [];
  for (const alt of alternates) {
    const a = alt.trim();
    if (!a || metricsAreEquivalentForCompare(primaryMetric, a)) continue;
    out.push(a);
  }
  return out;
}

function columnHints(columns: string[]): {
  hasDate: boolean;
  numericMeasures: string[];
} {
  const lower = columns.map((c) => ({ raw: c, lc: c.toLowerCase() }));
  const numericMeasures: string[] = [];
  for (const { raw, lc } of lower) {
    if (/date|time|period|month|year|quarter|week/i.test(lc)) continue;
    if (/id$|_id$|uuid|index/i.test(lc)) continue;
    const phrase = sanitizeMetricPhraseForFollowUp(humanizeColumnName(raw));
    if (phrase && !numericMeasures.includes(phrase)) {
      numericMeasures.push(phrase);
    }
  }
  return {
    hasDate: lower.some((x) => /date|time|period|month|year|quarter|week/i.test(x.lc)),
    numericMeasures,
  };
}

export type NaturalFollowUpArgs = {
  dimensionPhrase: string;
  metricPhrase: string;
  columns: string[];
  lastQuestion: string;
  chartKind?: ChartKind;
  alternateMetricLabels?: string[];
  topCategoryName?: string | null;
};

/** Natural follow-ups from chart dimension, measure, schema, and chart type. */
export function buildNaturalBusinessFollowUpChips(
  args: NaturalFollowUpArgs
): string[] {
  const dim = args.dimensionPhrase.trim().toLowerCase() || "category";
  const plural = pluralizeFollowUpDimension(dim);
  const metric = args.metricPhrase.trim().toLowerCase() || "this metric";
  const qn = norm(args.lastQuestion);
  const h = columnHints(args.columns);
  const chips: string[] = [];

  const push = (chip: string) => {
    const t = chip.trim();
    if (!t || qn.includes(norm(t).slice(0, Math.min(28, norm(t).length)))) return;
    chips.push(t);
  };

  const top = args.topCategoryName?.trim();
  if (top && !isSyntheticScatterPointLabel(top)) {
    push(`Why is ${truncatePhrase(top, 48)} highest?`);
  }

  push(`Compare ${metric} across ${plural}`);

  const timeLike =
    h.hasDate ||
    args.chartKind === "line" ||
    args.chartKind === "area";
  if (timeLike) {
    push(`Which ${dim} is growing fastest?`);
  }

  push(`Which ${dim} contributes most ${metric}?`);
  push(`Which ${dim} has the highest ${metric}?`);

  const measures = [
    metric,
    ...h.numericMeasures,
    ...(args.alternateMetricLabels ?? []).map((l) =>
      sanitizeMetricPhraseForFollowUp(l)
    ),
  ].filter(Boolean);
  const uniqueMeasures = [...new Set(measures.map((m) => norm(m)))].map(
    (n) => measures.find((m) => norm(m) === n)!
  );
  if (uniqueMeasures.length >= 2) {
    const a = uniqueMeasures[0]!;
    const b = uniqueMeasures[1]!;
    if (a !== b) {
      push(`Compare ${a} and ${b} across ${plural}`);
    }
  }

  const profitLike = uniqueMeasures.find((m) => /\bprofit\b/.test(m));
  if (profitLike && profitLike !== metric) {
    push(`Compare ${profitLike} across ${plural}`);
    push(`Which ${dim} is most profitable?`);
  }

  if (/\bcity\b/.test(dim) || /\bcity\b/.test(qn)) {
    push(`Which city contributes most ${metric}?`);
  }

  return chips;
}

function resolveFollowUpMetricLabel(ctx: AiFollowUpChipContext): string {
  const fromDisplay = ctx.metricColumnDisplay?.trim();
  if (fromDisplay && !isChartTitleOrGeneratedLabel(fromDisplay)) {
    const s = sanitizeMetricPhraseForFollowUp(fromDisplay);
    if (s) return s;
  }
  if (ctx.metricColumn?.trim()) {
    const s = sanitizeMetricPhraseForFollowUp(
      humanizeColumnName(ctx.metricColumn.trim())
    );
    if (s) return s;
  }
  if (!isChartTitleOrGeneratedLabel(ctx.valueAxisLabel)) {
    const s = sanitizeMetricPhraseForFollowUp(ctx.valueAxisLabel);
    if (s) return s;
  }
  return "this metric";
}

/** Collapse near-duplicate “why is X highest” / “why does X lead” style chips. */
function followUpSemanticIntentKey(chip: string): string {
  const t = norm(chip);
  const whyLead = t.match(
    /why\s+(?:is|does)\s+(.+?)\s+(highest|lead|leading|top|best|lowest|worst|perform)/
  );
  if (whyLead) {
    const entity = whyLead[1]!.replace(/\s+/g, " ").trim().slice(0, 40);
    return `why|${entity}`;
  }
  const whichContrib = t.match(
    /which\s+(.+?)\s+(?:contributes|has|generates|leads)/
  );
  if (whichContrib) {
    return `which|${whichContrib[1]!.slice(0, 40)}|contrib`;
  }
  const compareAcross = t.match(/compare\s+(.+?)\s+across\s+(.+)/);
  if (compareAcross) {
    return `compare|${compareAcross[1]!.slice(0, 24)}|${compareAcross[2]!.slice(0, 24)}`;
  }
  return t.slice(0, 56);
}

/** Exported for tests — semantic + exact dedupe of follow-up chip strings. */
export function dedupeFollowUpChips(chips: string[], max: number): string[] {
  const seen = new Set<string>();
  const intentSeen = new Set<string>();
  const out: string[] = [];
  for (const c of chips) {
    const t = c.replace(/\s+/g, " ").trim();
    if (t.length < 6 || t.length > 160) continue;
    const k = norm(t);
    if (seen.has(k)) continue;
    const intentKey = followUpSemanticIntentKey(t);
    if (intentSeen.has(intentKey)) continue;
    seen.add(k);
    intentSeen.add(intentKey);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function isRankableBarLike(kind: ChartKind): boolean {
  return (
    kind === "bar" ||
    kind === "bar_horizontal" ||
    kind === "line" ||
    kind === "area" ||
    kind === "histogram"
  );
}

function truncatePhrase(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Build 3–5 short follow-up questions from the latest ask + chart context.
 */
export function buildRelationshipScatterFollowUpChips(
  xLabel: string,
  yLabel: string,
  marginDimensionLabel?: string | null
): string[] {
  const x =
    sanitizeMetricPhraseForFollowUp(xLabel) ||
    polishFollowUpPhrase(xLabel) ||
    "x";
  const y =
    sanitizeMetricPhraseForFollowUp(yLabel) ||
    polishFollowUpPhrase(yLabel) ||
    "y";
  const marginDim = marginDimensionLabel?.trim()
    ? resolveFollowUpDimensionPhrase(marginDimensionLabel, null, marginDimensionLabel)
    : "category";
  return dedupeFollowUpChips(
    [
      "Which points look like outliers?",
      "Which observation is driving the correlation?",
      `Does ${y} increase consistently with ${x}?`,
      `Compare profit margin by ${marginDim}`,
      `How strong is the linear link between ${x} and ${y}?`,
    ],
    5
  );
}

export function buildProfitMarginFollowUpChips(
  categoryAxisLabel: string,
  topLabel?: string | null,
  opts?: {
    categoryColumn?: string | null;
    categoryColumnDisplay?: string | null;
  }
): string[] {
  const dim = resolveFollowUpDimensionPhrase(
    categoryAxisLabel,
    opts?.categoryColumn,
    opts?.categoryColumnDisplay
  );
  const plural = pluralizeFollowUpDimension(dim);
  const leader = topLabel?.trim() || "the leader";
  return filterMeaningfulFollowUpChips(
    [
      `Compare profit margin across ${plural}`,
      `Which ${dim} has the lowest margin?`,
      `Why is ${leader} margin highest?`,
      `Which ${dim} is most profitable?`,
    ],
    "profit margin"
  ).slice(0, 5);
}

function executiveLensColumnHints(columns: string[]): {
  hasGrowth: boolean;
  hasProfit: boolean;
  hasCustomer: boolean;
} {
  const lc = columns.map((c) => c.toLowerCase().replace(/_/g, " "));
  return {
    hasGrowth: lc.some((c) => /\bgrowth\b/.test(c)),
    hasProfit: lc.some((c) => /\bprofit\b/.test(c)),
    hasCustomer: lc.some((c) => /\bcustomer/.test(c)),
  };
}

export function buildExecutiveLensFollowUpChips(
  lens: string,
  dimPhrase: string,
  metricNoun: string,
  columns: string[]
): string[] {
  const plural = pluralizeFollowUpDimension(dimPhrase);
  const { hasGrowth, hasProfit, hasCustomer } = executiveLensColumnHints(columns);
  const met = metricNoun.trim() || "revenue";

  if (lens === "risk") {
    return dedupeFollowUpChips(
      [
        `Which ${dimPhrase} has the highest concentration risk?`,
        hasGrowth
          ? `Which ${dimPhrase} is declining?`
          : `Which ${dimPhrase} is underperforming?`,
        `Is ${met} dependent on one ${dimPhrase}?`,
        hasProfit ? `Compare profit margin by ${dimPhrase}` : `Compare ${met} across ${plural}`,
      ],
      4
    );
  }
  if (lens === "opportunity") {
    return dedupeFollowUpChips(
      [
        hasGrowth
          ? `Which low-${met} ${dimPhrase} has high growth?`
          : `Which ${dimPhrase} has the highest upside?`,
        `Which ${dimPhrase} has the highest upside?`,
        hasGrowth
          ? `Which ${dimPhrase} is growing fastest?`
          : `Which ${dimPhrase} leads on ${met}?`,
        "Where should we invest next?",
      ],
      4
    );
  }
  if (lens === "summary") {
    return dedupeFollowUpChips(
      [
        `What is the headline ${met} pattern across ${plural}?`,
        hasGrowth ? `Which ${dimPhrase} is growing fastest?` : `Which ${dimPhrase} leads on ${met}?`,
        hasProfit ? `Compare profit margin by ${dimPhrase}` : `Compare ${met} across ${plural}`,
        "What are the biggest risks?",
      ],
      4
    );
  }
  if (lens === "driver") {
    return dedupeFollowUpChips(
      [
        "Which points look like outliers?",
        `Does the relationship hold by ${dimPhrase}?`,
        hasProfit ? `Compare profit with ${met}` : `How strong is the link with ${met}?`,
        `What explains the strongest ${dimPhrase}?`,
      ],
      4
    );
  }
  if (lens === "explain") {
    return dedupeFollowUpChips(
      [
        `What drives ${met} for this cohort?`,
        hasGrowth ? `How does growth compare to peers?` : `How does ${met} compare to peers?`,
        hasCustomer ? `Is customer volume aligned with ${met}?` : `Which factor stands out most?`,
        `What are the biggest opportunities?`,
      ],
      4
    );
  }
  if (lens === "strategy") {
    return dedupeFollowUpChips(
      [
        `What should we prioritize across ${plural}?`,
        `What are the biggest risks?`,
        `What are the biggest opportunities?`,
        hasProfit ? `Compare profit margin by ${dimPhrase}` : `Where should we improve?`,
        `What concerns you most?`,
      ],
      4
    );
  }
  if (lens === "loss") {
    return dedupeFollowUpChips(
      [
        hasProfit ? `Which ${dimPhrase} has the lowest profit margin?` : `Which ${dimPhrase} is least profitable?`,
        `Are any ${plural} loss-making in this cohort?`,
        `What profit threshold defines a loss segment?`,
        `Compare profit margin across ${plural}`,
        `Which product-region pairs are least profitable?`,
      ],
      4
    );
  }
  if (lens === "standout") {
    return dedupeFollowUpChips(
      [
        `Which ${dimPhrase} is an outlier on ${met}?`,
        `What is the largest gap across ${plural}?`,
        `Which points look unusual on ${met}?`,
        `What concerns you most?`,
      ],
      4
    );
  }
  return [];
}

export function buildAiFollowUpQuestionChips(ctx: AiFollowUpChipContext): string[] {
  const qualityCtx: FollowUpQualityContext = {
    chartTitle: ctx.chartTitle,
    valueAxisLabel: ctx.valueAxisLabel,
  };
  const columns = ctx.columns ?? [];
  const dimPhrase = resolveFollowUpDimensionFromCtx(ctx);
  const metricNoun = resolveFollowUpMetricLabel(ctx);
  const routingIntent = (ctx.routingIntent || "").trim().toLowerCase();
  const execLens = (ctx.executiveLens || "").trim().toLowerCase();

  if (routingIntent === "profitability" && !execLens) {
    const lossChips = buildExecutiveLensFollowUpChips(
      "loss",
      dimPhrase,
      metricNoun,
      columns
    );
    if (lossChips.length >= 3) {
      return filterMeaningfulFollowUpChips(lossChips, metricNoun, qualityCtx).slice(
        0,
        5
      );
    }
  }
  if (routingIntent === "outlier" && !execLens) {
    const standoutChips = buildExecutiveLensFollowUpChips(
      "standout",
      dimPhrase,
      metricNoun,
      columns
    );
    if (standoutChips.length >= 3) {
      return filterMeaningfulFollowUpChips(standoutChips, metricNoun, qualityCtx).slice(
        0,
        5
      );
    }
  }

  if (execLens) {
    const lensChips = buildExecutiveLensFollowUpChips(
      execLens,
      dimPhrase,
      metricNoun,
      columns
    );
    if (lensChips.length >= 3) {
      return filterMeaningfulFollowUpChips(lensChips, metricNoun, qualityCtx).slice(
        0,
        5
      );
    }
  }

  if (ctx.dualMetricCompare) {
    return filterMeaningfulFollowUpChips(
      buildDualMetricCompareFollowUpChips(
        ctx.categoryAxisLabel,
        ctx.dualMetricSeriesKeys,
        {
          categoryColumn: ctx.categoryColumn,
          categoryColumnDisplay: ctx.categoryColumnDisplay,
        }
      ),
      undefined,
      qualityCtx
    ).slice(0, 5);
  }

  if (ctx.chartKind === "scatter") {
    const marginDim =
      ctx.breakdownDimensionLabel?.trim() ||
      ctx.categoryColumnDisplay?.trim() ||
      null;
    return filterMeaningfulFollowUpChips(
      buildRelationshipScatterFollowUpChips(
        ctx.categoryAxisLabel,
        ctx.valueAxisLabel,
        marginDim
      ),
      undefined,
      qualityCtx
    ).slice(0, 5);
  }

  const chips: string[] = [];
  const lastQn = norm(ctx.lastQuestion);

  const rows = ctx.seriesRows
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      value: Number(r.value),
    }))
    .filter((r) => r.name && Number.isFinite(r.value));

  const sorted =
    rows.length >= 1
      ? [...rows].sort((a, b) => b.value - a.value)
      : [];
  const topName = sorted[0]?.name?.trim() || null;

  chips.push(
    ...buildNaturalBusinessFollowUpChips({
      dimensionPhrase: dimPhrase,
      metricPhrase: metricNoun,
      columns,
      lastQuestion: ctx.lastQuestion,
      chartKind: ctx.chartKind,
      alternateMetricLabels: ctx.alternateMetricLabels,
      topCategoryName: topName,
    })
  );

  if (
    (ctx.chartKind === "line" || ctx.chartKind === "area") &&
    rows.length >= 2
  ) {
    chips.push("Which period changed most vs the prior bucket?");
    chips.push(`Which ${dimPhrase} is growing fastest over time?`);
  }

  if (isRankableBarLike(ctx.chartKind) && rows.length >= 2) {
    const hi = sorted[0]!.name;
    const lo = sorted[sorted.length - 1]!.name;
    if (
      hi &&
      lo &&
      norm(hi) !== norm(lo) &&
      !isSyntheticScatterPointLabel(hi) &&
      !isSyntheticScatterPointLabel(lo) &&
      !isHistogramBucketLabel(hi) &&
      !isHistogramBucketLabel(lo)
    ) {
      if (!chips.some((c) => norm(c).includes(norm(hi)) && /highest/.test(c))) {
        chips.push(`Why is ${truncatePhrase(hi, 48)} highest?`);
      }
      chips.push(`What explains ${truncatePhrase(lo, 48)} being lowest?`);
    }
  }

  const leadChip = `Which ${dimPhrase} has the highest ${metricNoun}?`;
  if (!lastQn.includes(norm(leadChip).slice(0, 24))) {
    chips.push(leadChip);
  }

  if (!lastQn.includes("important business insight")) {
    chips.push("What is the most important business insight?");
  }

  const out = dedupeFollowUpChips(chips, 12);
  return filterMeaningfulFollowUpChips(out.slice(0, 5), metricNoun, qualityCtx);
}

/**
 * Pick other numeric columns (humanized) for cross-metric follow-ups.
 */
export function alternateNumericMetricLabels(
  columns: string[],
  columnTypes: Record<string, "number" | "date" | "text" | "category"> | undefined,
  excludeColumn: string | null,
  max = 6
): string[] {
  const ex = (excludeColumn || "").trim().toLowerCase();
  const out: string[] = [];
  for (const c of columns) {
    const raw = c.trim();
    if (!raw) continue;
    if (columnTypes && columnTypes[raw] !== "number") continue;
    if (raw.toLowerCase() === ex) continue;
    out.push(humanizeColumnName(raw));
    if (out.length >= max) break;
  }
  return out;
}
