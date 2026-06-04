/**
 * Unsupported multi-metric comparison — compare X vs Y when an operand column is missing.
 */

import type { AnalysisIntentPayload } from "@/lib/analysis-intent-debug";
import {
  pluralizeFollowUpDimension,
  resolveFollowUpDimensionPhrase,
  sanitizeMetricPhraseForFollowUp,
} from "@/lib/ai-follow-up-suggestions";

export type UnsupportedMultiMetricAnalysis = {
  active: boolean;
  requestedMetrics: string[];
  missingMetrics: string[];
  missingMetricLabels: string[];
  requestedMetricLabels: string[];
  availableRelatedColumns: string[];
  status: string;
  leadSentence: string;
  recommendedAction: string;
  reasonCode?: string | null;
  reasonCodes?: string[];
};

export type UnsupportedMultiMetricParsedSections = {
  summary: string;
  statistical?: string;
  hypotheses?: string;
  recommendations?: string;
  methodology?: string;
  moreDetail?: string;
};

const MULTI_METRIC_COMPARE_RE =
  /\bcompare\b.*\b(vs\.?|versus)\b|\b(vs\.?|versus)\b.*\b(revenue|sales|profit|spend|ad\s*spend|margin|cost|budget)\b/i;

export function questionRequestsMultiMetricComparison(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  const ql = q.toLowerCase();
  if (/\brelationship\b|\bcorrelat/i.test(ql)) return false;
  if (/\bby\s+(region|product|category|department|channel)\b/.test(ql)) {
    if (/\bcompare\b/.test(ql) && !/\b(vs\.?|versus)\b/.test(ql)) return false;
  }
  if (MULTI_METRIC_COMPARE_RE.test(q)) return true;
  return (
    /\bcompare\b/.test(ql) &&
    /\b(revenue|sales|profit|spend|ad\s*spend|margin)\b/.test(ql) &&
    /\b(and|vs\.?|versus)\b/.test(ql)
  );
}

export function parseUnsupportedMultiMetricAnalysis(
  raw: unknown
): UnsupportedMultiMetricAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.active) return null;
  const requestedMetrics = Array.isArray(o.requestedMetrics)
    ? o.requestedMetrics.map(String).filter(Boolean)
    : [];
  const missingMetrics = Array.isArray(o.missingMetrics)
    ? o.missingMetrics.map(String).filter(Boolean)
    : [];
  const requestedMetricLabels = Array.isArray(o.requestedMetricLabels)
    ? o.requestedMetricLabels.map(String).filter(Boolean)
    : requestedMetrics.map(formatMetricId);
  const missingMetricLabels = Array.isArray(o.missingMetricLabels)
    ? o.missingMetricLabels.map(String).filter(Boolean)
    : missingMetrics.map(formatMetricId);
  const availableRelatedColumns = Array.isArray(o.availableRelatedColumns)
    ? o.availableRelatedColumns.map(String).filter(Boolean)
    : [];
  return {
    active: true,
    requestedMetrics,
    missingMetrics,
    missingMetricLabels,
    requestedMetricLabels,
    availableRelatedColumns,
    status: String(o.status ?? "Missing Required Metric Column").trim(),
    leadSentence: String(
      o.leadSentence ??
        "Requested metrics cannot be compared with the available columns."
    ).trim(),
    recommendedAction: String(
      o.recommendedAction ??
        "Add the missing metric columns to your dataset"
    ).trim(),
    reasonCode:
      typeof o.reasonCode === "string" ? o.reasonCode.trim() || null : null,
    reasonCodes: Array.isArray(o.reasonCodes)
      ? o.reasonCodes.map(String).filter(Boolean)
      : undefined,
  };
}

function formatMetricId(id: string): string {
  const labels: Record<string, string> = {
    revenue: "Revenue",
    ad_spend: "Ad spend",
    profit: "Profit",
    spend: "Spend",
    margin: "Margin",
  };
  return labels[id] ?? id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferRecommendedAction(question: string, missing: string[]): string {
  const ql = question.toLowerCase();
  if (missing.some((m) => m === "ad_spend" || m === "spend") || /\bad\s*spend\b/.test(ql)) {
    return "Add ad_spend or map advertising spend to an existing spend/cost column";
  }
  const labels = missing.map(formatMetricId);
  if (labels.length) {
    return `Add ${labels.join(", ")} column(s) to your dataset`;
  }
  return "Add the missing metric columns to your dataset";
}

function columnPhraseForMissing(metricId: string): string {
  const mid = metricId.trim();
  if (!mid) return "a required metric column";
  const article = /^[aeiou]/i.test(mid) ? "an" : "a";
  return `${article} ${mid} column`;
}

function buildLeadSentence(
  requestedMetrics: string[],
  missingMetrics: string[]
): string {
  const reqLabels = requestedMetrics.map(formatMetricId);
  const requestedText =
    reqLabels.length >= 2 ? reqLabels.join(" vs ") : reqLabels.join(", ");
  if (missingMetrics.length === 1) {
    return `${requestedText} cannot be compared because the dataset does not include ${columnPhraseForMissing(missingMetrics[0])}.`;
  }
  if (missingMetrics.length > 1) {
    const cols = missingMetrics.map(columnPhraseForMissing).join(", ");
    return `${requestedText} cannot be compared because the dataset does not include ${cols}.`;
  }
  return "Requested metrics cannot be compared with the available columns.";
}

/** Client fallback when API omits unsupportedMultiMetricAnalysis (older backend). */
export function inferUnsupportedMultiMetricFromIntent(
  question: string,
  analysisIntent?: AnalysisIntentPayload | null
): UnsupportedMultiMetricAnalysis | null {
  if (!questionRequestsMultiMetricComparison(question)) return null;
  if (!analysisIntent) return null;
  if (analysisIntent.primaryGoal !== "multi_metric_comparison") return null;
  if (analysisIntent.support?.supported !== false) return null;

  const reasonCodes = analysisIntent.support?.reasonCodes ?? [];
  if (
    !reasonCodes.includes("missing_metric_operand") &&
    !reasonCodes.includes("missing_ad_spend_column")
  ) {
    return null;
  }

  const requestedMetrics = Array.isArray(analysisIntent.requestedMetrics)
    ? analysisIntent.requestedMetrics.map(String)
    : ["revenue", "ad_spend"];
  const colMap = analysisIntent.requestedMetricColumns ?? {};
  const missingMetrics = requestedMetrics.filter(
    (id) => !colMap[id]
  );
  const missingMetricLabels = missingMetrics.map(formatMetricId);
  const requestedMetricLabels = requestedMetrics.map(formatMetricId);

  return {
    active: true,
    requestedMetrics,
    missingMetrics,
    missingMetricLabels,
    requestedMetricLabels,
    availableRelatedColumns: [],
    status: "Missing Required Metric Column",
    leadSentence: buildLeadSentence(requestedMetrics, missingMetrics),
    recommendedAction: inferRecommendedAction(question, missingMetrics),
    reasonCode: reasonCodes.includes("missing_ad_spend_column")
      ? "missing_ad_spend_column"
      : reasonCodes[0] ?? "missing_metric_operand",
    reasonCodes,
  };
}

export function resolveUnsupportedMultiMetricMode(args: {
  question: string;
  unsupportedMultiMetricAnalysis?: unknown;
  analysisIntent?: AnalysisIntentPayload | null;
}): UnsupportedMultiMetricAnalysis | null {
  const fromApi = parseUnsupportedMultiMetricAnalysis(
    args.unsupportedMultiMetricAnalysis
  );
  if (fromApi) return fromApi;
  return inferUnsupportedMultiMetricFromIntent(args.question, args.analysisIntent);
}

export type UnsupportedMultiMetricExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export function buildUnsupportedMultiMetricExecutiveCards(
  meta: UnsupportedMultiMetricAnalysis
): UnsupportedMultiMetricExecutiveCard[] {
  const stripes = [
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
  ] as const;
  const missingValue =
    meta.missingMetricLabels.join(", ") || meta.missingMetrics.join(", ") || "—";
  const requestedValue =
    meta.requestedMetricLabels.length >= 2
      ? meta.requestedMetricLabels.join(" vs ")
      : meta.requestedMetricLabels.join(", ") ||
        meta.requestedMetrics.join(", ");

  return [
    {
      key: "umm-missing",
      title: "Missing metric",
      value: missingValue,
      hint: meta.leadSentence,
      dotClass: stripes[0],
    },
    {
      key: "umm-requested",
      title: "Requested metrics",
      value: requestedValue,
      dotClass: stripes[1],
    },
    {
      key: "umm-status",
      title: "Comparison status",
      value: meta.status,
      dotClass: stripes[2],
    },
    {
      key: "umm-action",
      title: "Recommended action",
      value: meta.recommendedAction,
      dotClass: stripes[3],
    },
  ];
}

export function buildUnsupportedMultiMetricFollowUpChips(
  meta: UnsupportedMultiMetricAnalysis,
  opts?: {
    categoryAxisLabel?: string;
    categoryColumn?: string | null;
    categoryColumnDisplay?: string | null;
  }
): string[] {
  const missing = meta.missingMetricLabels[0] ?? meta.missingMetrics[0] ?? "metric";
  const dim = resolveFollowUpDimensionPhrase(
    opts?.categoryAxisLabel ?? "",
    opts?.categoryColumn,
    opts?.categoryColumnDisplay
  );
  const plural = pluralizeFollowUpDimension(dim);
  const labels = meta.requestedMetricLabels.length
    ? meta.requestedMetricLabels
    : meta.requestedMetrics;
  const metrics = labels
    .map((l) => sanitizeMetricPhraseForFollowUp(formatMetricId(l)) || formatMetricId(l))
    .filter(Boolean);
  const m1 = metrics[0] ?? "revenue";
  const m2 = metrics[1] ?? "profit";
  const compareChip =
    metrics.length >= 2
      ? `Compare ${m1} and ${m2} across ${plural}`
      : `Compare ${m1} across ${plural}`;
  return [
    `Which columns are available for spend or cost?`,
    compareChip,
    `Show total ${m1} trend over time`,
    `How do I add a ${missing.replace(/_/g, " ").toLowerCase()} column to this dataset?`,
  ];
}

/** Focused AI Answer sections — no ranking / product fallback prose. */
export function buildUnsupportedMultiMetricParsedSections(
  meta: UnsupportedMultiMetricAnalysis
): UnsupportedMultiMetricParsedSections {
  const avail =
    meta.availableRelatedColumns.length > 0
      ? meta.availableRelatedColumns.join(", ")
      : "—";
  const summary = [
    meta.leadSentence,
    "",
    `Requested metrics: ${meta.requestedMetrics.join(", ")}`,
    `Missing metric: ${meta.missingMetrics.join(", ")}`,
    `Available related columns: ${avail}`,
    `Recommended action: ${meta.recommendedAction}`,
  ].join("\n");

  return {
    summary,
    recommendations: meta.recommendedAction,
  };
}

export function prependUnsupportedMultiMetricLead(
  summary: string,
  lead: string
): string {
  const s = summary.trim();
  const l = lead.trim();
  if (!l) return s;
  if (!s) return l;
  if (s.toLowerCase().startsWith(l.toLowerCase().slice(0, 20))) return s;
  return `${l} ${s}`;
}
