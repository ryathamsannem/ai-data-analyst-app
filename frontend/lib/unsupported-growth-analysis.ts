/**
 * Unsupported growth analysis mode — growth intent without time-series evidence.
 */

import {
  pluralizeFollowUpDimension,
  resolveFollowUpDimensionPhrase,
} from "@/lib/ai-follow-up-suggestions";

export type UnsupportedGrowthAnalysis = {
  active: boolean;
  periodsAvailable: number;
  status: string;
  leadSentence: string;
  recommendedAction: string;
  reasonCode?: string | null;
};

export const GROWTH_CANNOT_DETERMINE_LEAD =
  "Growth metric detected, but period/methodology is unknown — growth comparison is directional only because no date/baseline period exists.";

const GROWTH_INTENT_RE =
  /\b(growing\s+fastest|fastest\s+growing|fastest\s+growth|growth\s+rate|increasing\s+fastest|grow(?:ing)?\s+fastest|rate\s+of\s+change|period[- ]over[- ]period|month[- ]over[- ]month|\bmom\b|\byoy\b|which\s+\w+\s+(?:is|are)\s+growing|what\s+\w+\s+(?:is|are)\s+growing|momentum\s+by\s+\w+|trend\s+by\s+\w+\s+over\s+time)\b/i;

export function questionRequestsGrowthIntent(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (GROWTH_INTENT_RE.test(q)) return true;
  const ql = q.toLowerCase();
  if (/\b(grow(?:th|ing)?)\b/.test(ql) && /\b(fastest|highest\s+growth|most\s+growth|quickest)\b/.test(ql)) {
    return true;
  }
  if (
    /\b(growth|growing)\b/.test(ql) &&
    /\b(region|product|department|channel|segment|category|campaign)\b/.test(ql)
  ) {
    return true;
  }
  return false;
}

export function parseUnsupportedGrowthAnalysis(
  raw: unknown
): UnsupportedGrowthAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.active) return null;
  const periods = Number(o.periodsAvailable);
  return {
    active: true,
    periodsAvailable: Number.isFinite(periods) ? Math.max(0, Math.round(periods)) : 0,
    status: String(o.status ?? "Insufficient Time-Series Data").trim(),
    leadSentence: String(o.leadSentence ?? GROWTH_CANNOT_DETERMINE_LEAD).trim(),
    recommendedAction: String(
      o.recommendedAction ?? "Add multiple periods per region"
    ).trim(),
    reasonCode:
      typeof o.reasonCode === "string" ? o.reasonCode.trim() || null : null,
  };
}

function periodsFromTimeSeriesMeta(
  timeSeriesAnalysis?: Record<string, unknown> | null
): number | null {
  if (!timeSeriesAnalysis) return null;
  const n = Number(timeSeriesAnalysis.uniqueBuckets);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Client fallback when API omits unsupportedGrowthAnalysis (older backend). */
export function inferUnsupportedGrowthClient(args: {
  question: string;
  isTrendChart: boolean;
  chartTypeInternal?: string;
  timeSeriesAnalysis?: Record<string, unknown> | null;
  partialVisualizationWarning?: string | null;
  answerText?: string;
}): UnsupportedGrowthAnalysis | null {
  if (!questionRequestsGrowthIntent(args.question)) return null;

  const tsPeriods = periodsFromTimeSeriesMeta(args.timeSeriesAnalysis);
  if (args.isTrendChart && tsPeriods != null && tsPeriods >= 2) {
    return null;
  }

  const warn = (args.partialVisualizationWarning ?? "").toLowerCase();
  const answer = (args.answerText ?? "").toLowerCase();
  const narrativeSaysNoGrowth =
    /\bgrowth cannot\b|\bcannot be determined\b|\bcannot be measured\b|\bno time[- ]series\b|\bsingle (?:date|period|snapshot)\b|\bstatic regional\b/.test(
      answer
    );

  const ct = (args.chartTypeInternal ?? "").toLowerCase();
  const categorySnapshot =
    !args.isTrendChart &&
    (ct === "bar" ||
      ct === "bar_horizontal" ||
      ct === "horizontalbar" ||
      ct === "pie" ||
      ct === "donut");

  if (!categorySnapshot && !narrativeSaysNoGrowth && tsPeriods != null && tsPeriods >= 2) {
    return null;
  }

  if (
    !narrativeSaysNoGrowth &&
    !warn.includes("time-series") &&
    !warn.includes("time series") &&
    !warn.includes("growth")
  ) {
    if (tsPeriods != null && tsPeriods >= 2) return null;
    if (!categorySnapshot) return null;
  }

  const periods =
    tsPeriods ??
    (/\bsingle\s+date\b|\bone\s+date\b|\bsingle\s+period\b|\bone\s+period\b/.test(answer)
      ? 1
      : 0);

  return {
    active: true,
    periodsAvailable: periods,
    status: "Insufficient Time-Series Data",
    leadSentence: GROWTH_CANNOT_DETERMINE_LEAD,
    recommendedAction: "Add multiple periods per region",
    reasonCode: periods <= 1 ? "single_period" : "category_snapshot",
  };
}

export function resolveUnsupportedGrowthMode(args: {
  question: string;
  unsupportedGrowthAnalysis?: unknown;
  isTrendChart: boolean;
  chartTypeInternal?: string;
  timeSeriesAnalysis?: Record<string, unknown> | null;
  partialVisualizationWarning?: string | null;
  answerText?: string;
}): UnsupportedGrowthAnalysis | null {
  const fromApi = parseUnsupportedGrowthAnalysis(args.unsupportedGrowthAnalysis);
  if (fromApi) return fromApi;
  return inferUnsupportedGrowthClient({
    question: args.question,
    isTrendChart: args.isTrendChart,
    chartTypeInternal: args.chartTypeInternal,
    timeSeriesAnalysis: args.timeSeriesAnalysis,
    partialVisualizationWarning: args.partialVisualizationWarning,
    answerText: args.answerText,
  });
}

export type UnsupportedGrowthExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export function buildUnsupportedGrowthExecutiveCards(
  meta: UnsupportedGrowthAnalysis
): UnsupportedGrowthExecutiveCard[] {
  const stripes = [
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
  ] as const;
  return [
    {
      key: "ug-cannot",
      title: "Growth methodology",
      value: "Period unknown",
      hint: meta.leadSentence,
      dotClass: stripes[0],
    },
    {
      key: "ug-periods",
      title: "Time periods available",
      value: String(meta.periodsAvailable),
      dotClass: stripes[1],
    },
    {
      key: "ug-status",
      title: "Growth analysis status",
      value: meta.status,
      dotClass: stripes[2],
    },
    {
      key: "ug-action",
      title: "Recommended action",
      value: meta.recommendedAction,
      dotClass: stripes[3],
    },
  ];
}

export function buildUnsupportedGrowthFollowUpChips(
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
  return [
    `Do multiple dates exist for each ${dim}?`,
    `Show revenue trend by ${dim} over time`,
    `Compare ${plural} month over month`,
    `Which ${dim} has highest total revenue?`,
  ];
}

export function prependUnsupportedGrowthLead(
  summary: string,
  lead = GROWTH_CANNOT_DETERMINE_LEAD
): string {
  const s = summary.trim();
  const l = lead.trim();
  if (!l) return s;
  if (!s) return l;
  if (s.toLowerCase().startsWith(l.toLowerCase().slice(0, 24))) return s;
  return `${l} ${s}`;
}
