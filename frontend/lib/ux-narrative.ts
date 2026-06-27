/**
 * Domain-aware UX copy: KPI footnotes, chart narratives, AI section labels.
 */

import { humanizeColumnName } from "@/lib/analytics-metadata";
import type { ChartKind } from "@/app/chart-types";
import {
  buildFollowupQuestion,
  formatMetricLabel,
  type SemanticMetricContext,
} from "@/lib/semantic-metric-engine";

export const AI_INSIGHT_SECTION_LABELS = {
  statistical: "Key findings",
  hypotheses: "What this may indicate",
  recommendations: "Suggested next steps",
  methodology: "How this was calculated",
} as const;

export type AiAnswerLeadInOptions = {
  routingIntent?: string | null;
  categoryColumn?: string | null;
  metricColumn?: string | null;
  isTimeSeries?: boolean;
};

function isDateLikeColumn(col: string | null | undefined): boolean {
  if (!col?.trim()) return false;
  const c = col.toLowerCase();
  return /date|time|month|week|year|day|period|quarter|timestamp/.test(c);
}

function isRankingOrComparisonIntent(intent: string | null | undefined): boolean {
  const i = (intent || "").trim().toLowerCase();
  return (
    i === "ranking" ||
    i === "comparison" ||
    i === "rank" ||
    i === "outlier"
  );
}

function isBankingRiskMetric(metricCol: string | null | undefined): boolean {
  const m = (metricCol || "").toLowerCase();
  return /loan|balance|delinquen|utilization|npl|credit|risk|default/.test(m);
}

function isWorkforceContext(
  domain: string,
  metricCol?: string | null
): boolean {
  const d = domain.trim().toLowerCase();
  if (d === "hr") return true;
  const m = (metricCol || "").toLowerCase();
  return /attrition|employee|department|salary|engagement|tenure|hire|headcount/.test(
    m
  );
}

function isActualTimeSeriesTrend(
  chartType: ChartKind,
  opts?: AiAnswerLeadInOptions
): boolean {
  if (chartType !== "line" && chartType !== "area") return false;
  if (opts?.isTimeSeries) return true;
  const intent = (opts?.routingIntent || "").trim().toLowerCase();
  if (intent === "trend" || intent === "time_series") return true;
  if (isRankingOrComparisonIntent(intent)) return false;
  return isDateLikeColumn(opts?.categoryColumn);
}

/** Map legacy / model section headers to display labels. */
export function normalizeAiSectionTitle(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (/statistical|key finding|statistical observation/.test(t)) return AI_INSIGHT_SECTION_LABELS.statistical;
  if (/hypothes|may indicate|inferred/.test(t)) return AI_INSIGHT_SECTION_LABELS.hypotheses;
  if (/recommend|next step/.test(t)) return AI_INSIGHT_SECTION_LABELS.recommendations;
  if (/method/.test(t)) return AI_INSIGHT_SECTION_LABELS.methodology;
  return raw.trim();
}

export function aiAnswerLeadIn(
  domain: string,
  chartType: ChartKind,
  opts?: AiAnswerLeadInOptions
): string | null {
  const d = domain.trim().toLowerCase();

  if (chartType === "histogram") return "Distribution insight";
  if (chartType === "scatter") return "Relationship insight";

  if (isActualTimeSeriesTrend(chartType, opts)) {
    if (d === "operations" || d === "manufacturing") return "Performance trend";
    return "Trend over time";
  }

  if (d === "banking" || isBankingRiskMetric(opts?.metricColumn)) {
    return "Risk insight";
  }
  if (isWorkforceContext(d, opts?.metricColumn)) {
    return "Workforce insight";
  }
  if (d === "sales" || d === "ecommerce" || d === "retail") {
    return "Commercial insight";
  }
  if (d === "operations" || d === "manufacturing") return "Operational insight";
  if (d === "finance" || d === "finance_fpa") return "Financial insight";
  if (d === "marketing") return "Marketing insight";

  if (
    isRankingOrComparisonIntent(opts?.routingIntent) ||
    chartType === "bar_horizontal" ||
    chartType === "bar" ||
    chartType === "pie" ||
    chartType === "donut"
  ) {
    return "Business comparison";
  }

  return "Key insight";
}

/** Strip backend / router jargon so narrative stays executive-readable. */
export function sanitizeRoutingHintForNarrative(hint: string): string | undefined {
  let t = hint.replace(/\s+/g, " ").trim();
  if (!t || t.length < 14) return undefined;
  if (/^measure:\s*/i.test(t)) {
    t = t.replace(/^measure:\s*[^.]+\.\s*/i, "").trim();
  }
  if (
    /comparison of one numeric metric|vertical bar chart selected|standard comparison;\s*vertical bar|very few points;\s*vertical bar|single-value summary/i.test(
      t
    )
  ) {
    return undefined;
  }
  return t.length >= 14 ? t : undefined;
}

export function buildChartNarrative(
  ctx: SemanticMetricContext,
  opts?: { chartLabel?: string; routingHint?: string }
): string {
  const met = ctx.metricLabel.trim();
  const dim = ctx.dimensionLabel.trim() || "category";
  const dimLc = dim.toLowerCase();
  const kind = ctx.chartType;
  const hintRaw = opts?.routingHint?.trim();
  const hint = hintRaw ? sanitizeRoutingHintForNarrative(hintRaw) : undefined;
  const label = opts?.chartLabel?.trim();

  let base = "";
  if (kind === "line" || kind === "area") {
    if (/weekly/.test(dimLc)) {
      base = `This chart tracks ${met} across weekly time buckets so you can see momentum, dips, and turning points at a glance.`;
    } else if (/month/.test(dimLc)) {
      base = `This chart tracks ${met} across monthly buckets so you can see momentum, dips, and turning points at a glance.`;
    } else {
      base = `This chart tracks ${met} over time so you can see momentum, dips, and turning points at a glance.`;
    }
  } else if (kind === "pie" || kind === "donut") {
    base = `This view shows how ${met} splits across ${dimLc} — useful when you care about share of the whole.`;
  } else if (kind === "scatter") {
    if (/\bvs\.?\b/i.test(met) || /\bvs\.?\b/i.test(dimLc)) {
      base = `This scatter plot compares ${dimLc} and ${met} to show how the two measures move together across observations.`;
    } else {
      base = `This scatter plot compares ${dimLc} with ${met} across observations — use it to spot clusters, gaps, and values outside the norm.`;
    }
  } else if (kind === "bar_horizontal") {
    base = `This ranks ${dimLc} by ${met} — ideal when labels are long or you want a clear leaderboard-style read.`;
  } else if (kind === "histogram") {
    base = `This shows how often values fall into ranges for ${met}, so you can see the overall shape of the data.`;
  } else {
    base = `Here ${met} is laid out across ${dimLc} so you can compare groups and see where performance diverges.`;
  }

  if (hint && hint.length > 12) {
    const clipped = hint.length > 220 ? `${hint.slice(0, 217)}…` : hint;
    return `${base} ${clipped}`;
  }
  if (label) {
    const lab = label.toLowerCase();
    if (!base.toLowerCase().includes(lab.slice(0, 24))) {
      return `${base} Presented as a ${lab}.`;
    }
  }
  return base;
}

export type KpiContextHints = {
  cardTitle: string;
  cardIndex: number;
  totalCards: number;
  isTrendChart: boolean;
  trendFirstLabel?: string;
  trendLastLabel?: string;
  trendRelChange?: number;
  topCategoryName?: string;
  topCategoryValueDisplay?: string;
  primaryMetricColumn?: string | null;
  rows?: number;
  nullCountOnPrimary?: number;
  profileMeanOnPrimary?: number | null;
};

function columnHintsFromSemantic(ctx: SemanticMetricContext): {
  met: string;
  dim: string;
  metricCol: string;
} {
  const met = ctx.metricLabel.toLowerCase();
  const dim = ctx.dimensionLabel.toLowerCase();
  const metricCol = (ctx.metric ?? "").toLowerCase();
  return { met, dim, metricCol };
}

function domainKpiTemplate(
  domain: string,
  ctx: SemanticMetricContext,
  hints: KpiContextHints
): string | null {
  const d = domain.trim().toLowerCase();
  const { met: metLc, dim: dimLc, metricCol } = columnHintsFromSemantic(ctx);
  const dimLabel = ctx.dimensionLabel;
  const metLabel = ctx.metricLabel;

  if (hints.topCategoryName && hints.topCategoryValueDisplay) {
    const name = hints.topCategoryName;
    const val = hints.topCategoryValueDisplay;
    if (d === "operations" || d === "manufacturing") {
      if (/severity|priority|risk/.test(dimLc)) {
        return `Highest-severity bucket: ${name} (${val}).`;
      }
      if (/plant|site|facility|location|warehouse/.test(dimLc)) {
        return `Plant with highest ${metLabel.toLowerCase()}: ${name} (${val}).`;
      }
      if (/downtime|outage|idle/.test(metLc)) {
        return `Incident category with most downtime: ${name} (${val}).`;
      }
      return `${dimLabel} with the highest ${metLabel.toLowerCase()}: ${name} (${val}).`;
    }
    if (d === "sales" || d === "ecommerce") {
      if (/region|territory|market|country|state/.test(dimLc)) {
        return `Best-performing region: ${name} (${val}).`;
      }
      return `Top ${dimLc}: ${name} (${val}).`;
    }
    if (d === "hr") {
      if (/attendance|present|absent|pto\b/.test(metricCol + metLc)) {
        return `Department with strongest attendance signal: ${name} (${val}).`;
      }
      if (/salary|comp|wage|pay/.test(metricCol + metLc)) {
        return `Department showing the highest ${metLabel.toLowerCase()}: ${name} (${val}).`;
      }
      return `${dimLabel} leading on ${metLabel.toLowerCase()}: ${name} (${val}).`;
    }
    if (d === "finance") {
      return `Largest ${dimLc} by ${metLabel.toLowerCase()}: ${name} (${val}).`;
    }
    return `Standout ${dimLc}: ${name} (${val}).`;
  }

  if (hints.isTrendChart && hints.trendRelChange != null) {
    const span =
      hints.trendFirstLabel && hints.trendLastLabel
        ? ` (${hints.trendFirstLabel} → ${hints.trendLastLabel})`
        : "";
    const rel = hints.trendRelChange;
    if (Math.abs(rel) < 0.03) {
      return `Performance is roughly flat across this window${span}.`;
    }
    if (rel < 0) {
      return `Latest period trails where the series started${span}.`;
    }
    return `Latest period runs ahead of where the series started${span}.`;
  }

  if (hints.profileMeanOnPrimary != null && Number.isFinite(hints.profileMeanOnPrimary)) {
    const formatted = hints.profileMeanOnPrimary.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
    if (d === "operations" || d === "manufacturing") {
      if (/downtime|outage|idle/.test(metricCol + metLc)) {
        return `Roughly ${formatted} average downtime per row in this extract — sanity-check against your incident definition.`;
      }
      return `Central tendency for ${metLabel.toLowerCase()} sits near ${formatted} in this file.`;
    }
    if (d === "hr") {
      if (/salary|comp|wage|pay/.test(metricCol + metLc)) {
        return `Average salary per employee lands near ${formatted} (file-level average).`;
      }
      return `Typical ${metLabel.toLowerCase()} per person or row is near ${formatted}.`;
    }
    if (d === "sales" || d === "ecommerce") {
      if (/order|transaction|invoice/.test(metricCol + dimLc)) {
        return `Average revenue per order is near ${formatted}.`;
      }
      return `Average ${metLabel.toLowerCase()} per record is near ${formatted}.`;
    }
    return `Typical ${metLabel.toLowerCase()} centers near ${formatted}.`;
  }

  return null;
}

/** Business-friendly top-category line when semantic template did not fire. */
export function semanticTopBucketCaption(
  dimensionLabel: string,
  metricPhrase: string,
  topName: string,
  valueDisplay: string
): string {
  const dim = dimensionLabel.trim() || "Category";
  const met = metricPhrase.trim() || "metric";
  return `${dim} ahead on ${met}: ${topName} (${valueDisplay}).`;
}

export function buildKpiContextLine(
  domain: string,
  ctx: SemanticMetricContext | null,
  hints: KpiContextHints
): string | null {
  if (ctx) {
    const templated = domainKpiTemplate(domain, ctx, hints);
    if (templated) return templated;
  }

  if (hints.nullCountOnPrimary != null && hints.nullCountOnPrimary > 0 && hints.rows) {
    const col = hints.primaryMetricColumn
      ? humanizeColumnName(hints.primaryMetricColumn)
      : "the primary measure";
    const n = hints.nullCountOnPrimary;
    return `${n.toLocaleString()} row${n === 1 ? "" : "s"} missing values for ${col}.`;
  }

  return null;
}

export function schemaAwareFollowUpSeeds(
  domain: string,
  columns: string[],
  ctx: SemanticMetricContext | null
): string[] {
  if (!ctx) return [];
  const lower = columns.map((c) => c.toLowerCase());
  const out: string[] = [];
  const d = domain.trim().toLowerCase();

  const hasSeverity = lower.some((c) => /severity|priority|risk/.test(c));
  const hasDowntime = lower.find((c) => /downtime|outage/.test(c));
  const hasRepair = lower.find((c) => /repair|maintenance/.test(c));
  const hasDate = lower.some((c) => /date|time|period|month/.test(c));

  if ((d === "operations" || d === "manufacturing") && hasSeverity && hasDowntime) {
    out.push(
      `Which ${humanizeColumnName(
        lower.find((c) => /severity|priority/.test(c)) ?? "severity"
      ).toLowerCase()} contributes most ${humanizeColumnName(hasDowntime).toLowerCase()}?`
    );
  }

  if (hasDowntime && hasRepair) {
    out.push(
      buildFollowupQuestion("compare", ctx, {
        otherMetricLabel: formatMetricLabel({
          metric: hasRepair,
          aggregation: ctx.aggregation,
          aggregationLabel: ctx.aggregationLabel,
          dimension: ctx.dimension,
          dimensionLabel: ctx.dimensionLabel,
        }),
      })
    );
  }

  const hasMargin = lower.some((c) => /\bmargin\b/.test(c));
  const hasCost = lower.find((c) => /\bcost|expense|opex|cogs\b/.test(c));
  const hasRev = lower.find((c) => /\brevenue|sales|income\b/.test(c));

  if ((d === "finance" || d === "sales") && hasMargin && hasCost) {
    out.push(
      buildFollowupQuestion("compare", ctx, {
        otherMetricLabel: formatMetricLabel({
          metric: hasCost,
          aggregation: ctx.aggregation,
          aggregationLabel: ctx.aggregationLabel,
          dimension: ctx.dimension,
          dimensionLabel: ctx.dimensionLabel,
        }),
      })
    );
  }

  if (d === "finance" && hasRev && hasCost && hasRev !== hasCost) {
    out.push(
      buildFollowupQuestion("compare", ctx, {
        otherMetricLabel: formatMetricLabel({
          metric: hasCost,
          aggregation: ctx.aggregation,
          aggregationLabel: ctx.aggregationLabel,
          dimension: ctx.dimension,
          dimensionLabel: ctx.dimensionLabel,
        }),
      })
    );
  }

  if (hasDate && (ctx.chartType === "line" || ctx.chartType === "area")) {
    out.push(buildFollowupQuestion("trend", ctx));
  }

  return out;
}
