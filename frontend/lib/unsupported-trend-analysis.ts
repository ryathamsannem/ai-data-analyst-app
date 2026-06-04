/**
 * Unsupported trend analysis — trend intent without enough time periods.
 */

import {
  pluralizeFollowUpDimension,
  resolveFollowUpDimensionPhrase,
  sanitizeMetricPhraseForFollowUp,
} from "@/lib/ai-follow-up-suggestions";

export type UnsupportedTrendAnalysis = {
  active: boolean;
  title: string;
  reason: string;
  requiredAction: string;
  periodsAvailable: number;
  status: string;
  leadSentence: string;
  reasonCode?: string | null;
};

const TREND_INTENT_RE =
  /\b(trend|over time|time series|timeseries|timeline|monthly|weekly|daily|by month|by week|by day|show trend|momentum)\b/i;

export function questionRequestsTrendIntent(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (TREND_INTENT_RE.test(q)) return true;
  return /\b(by|per)\s+(day|date|week|month|year|quarter)\b/i.test(q);
}

export function parseUnsupportedTrendAnalysis(
  raw: unknown
): UnsupportedTrendAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.active) return null;
  const periods = Number(o.periodsAvailable);
  return {
    active: true,
    title: String(o.title ?? "Trend Analysis Not Available").trim(),
    reason: String(
      o.reason ?? "Only one distinct time period exists."
    ).trim(),
    requiredAction: String(
      o.requiredAction ?? "Add multiple periods per region/zone."
    ).trim(),
    periodsAvailable: Number.isFinite(periods) ? Math.max(0, Math.round(periods)) : 0,
    status: String(o.status ?? "Insufficient Time-Series Data").trim(),
    leadSentence: String(
      o.leadSentence ?? "Trend analysis cannot be determined from the available data."
    ).trim(),
    reasonCode:
      typeof o.reasonCode === "string" ? o.reasonCode.trim() || null : null,
  };
}

export function resolveUnsupportedTrendMode(args: {
  question: string;
  unsupportedTrendAnalysis?: unknown;
  trendRequestUnsatisfied?: boolean;
}): UnsupportedTrendAnalysis | null {
  const fromApi = parseUnsupportedTrendAnalysis(args.unsupportedTrendAnalysis);
  if (fromApi) return fromApi;
  if (!args.trendRequestUnsatisfied || !questionRequestsTrendIntent(args.question)) {
    return null;
  }
  return {
    active: true,
    title: "Trend Analysis Not Available",
    reason: "Only one distinct time period exists.",
    requiredAction: "Add multiple periods per region/zone.",
    periodsAvailable: 1,
    status: "Insufficient Time-Series Data",
    leadSentence:
      "Trend analysis cannot be determined from the available data.",
    reasonCode: "single_period",
  };
}

export type UnsupportedTrendExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export function buildUnsupportedTrendExecutiveCards(
  meta: UnsupportedTrendAnalysis
): UnsupportedTrendExecutiveCard[] {
  const stripes = [
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
  ] as const;
  return [
    {
      key: "ut-title",
      title: "Analysis status",
      value: meta.title,
      hint: meta.leadSentence,
      dotClass: stripes[0],
    },
    {
      key: "ut-reason",
      title: "Reason",
      value: meta.reason,
      dotClass: stripes[1],
    },
    {
      key: "ut-periods",
      title: "Time periods available",
      value: String(meta.periodsAvailable),
      dotClass: stripes[2],
    },
    {
      key: "ut-required",
      title: "Required",
      value: meta.requiredAction,
      dotClass: stripes[3],
    },
  ];
}

export function buildUnsupportedTrendFollowUpChips(
  categoryAxisLabel: string,
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
  const profit = sanitizeMetricPhraseForFollowUp("profit") || "profit";
  const revenue = sanitizeMetricPhraseForFollowUp("revenue") || "revenue";
  return [
    `Which ${dim} has the highest ${revenue}?`,
    `Compare ${revenue} and ${profit} across ${plural}`,
    `Do multiple dates exist for each ${dim}?`,
    `Which ${dim} contributes most ${profit}?`,
  ];
}

export function prependUnsupportedTrendLead(
  summary: string,
  lead?: string
): string {
  const s = summary.trim();
  const l = (lead ?? "").trim();
  if (!l) return s;
  if (!s) return l;
  if (s.toLowerCase().startsWith(l.toLowerCase().slice(0, 20))) return s;
  return `${l} ${s}`;
}
