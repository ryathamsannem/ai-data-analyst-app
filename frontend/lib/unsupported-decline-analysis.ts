/**
 * Unsupported decline analysis mode — decline intent without time-series evidence.
 */

import type { AnalysisIntentPayload } from "@/lib/analysis-intent-debug";
import {
  pluralizeFollowUpDimension,
  resolveFollowUpDimensionPhrase,
} from "@/lib/ai-follow-up-suggestions";

export type UnsupportedDeclineAnalysis = {
  active: boolean;
  periodsAvailable: number;
  status: string;
  leadSentence: string;
  recommendedAction: string;
  reasonCode?: string | null;
};

export const DECLINE_CANNOT_DETERMINE_LEAD =
  "Decline cannot be determined from the available data.";

const ENTITY_DECLINE_RE =
  /\b(which|what)\s+\w+.*\b(declin(?:e|ing|ed)|decreas(?:e|ing|ed)|falling|dropping|shrinking)\b/i;

const DIMENSION_MENTION_RE =
  /\b(category|categories|product|products|region|regions|department|departments|channel|channels|segment|segments|campaign|campaigns)\b/i;

export function questionRequestsEntityDecline(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (ENTITY_DECLINE_RE.test(q)) return true;
  return (
    /\bdeclin(?:e|ing|ed)\b/i.test(q) && DIMENSION_MENTION_RE.test(q)
  );
}

export function parseUnsupportedDeclineAnalysis(
  raw: unknown
): UnsupportedDeclineAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.active) return null;
  const periods = Number(o.periodsAvailable);
  return {
    active: true,
    periodsAvailable: Number.isFinite(periods) ? Math.max(0, Math.round(periods)) : 0,
    status: String(o.status ?? "Insufficient Time-Series Data").trim(),
    leadSentence: String(o.leadSentence ?? DECLINE_CANNOT_DETERMINE_LEAD).trim(),
    recommendedAction: String(
      o.recommendedAction ?? "Add multiple periods per category"
    ).trim(),
    reasonCode:
      typeof o.reasonCode === "string" ? o.reasonCode.trim() || null : null,
  };
}

function inferRecommendedAction(question: string): string {
  const ql = question.toLowerCase();
  if (/\bcategory\b/.test(ql)) return "Add multiple periods per category";
  if (/\bregion\b/.test(ql)) return "Add multiple periods per region";
  if (/\bproduct\b/.test(ql)) return "Add multiple periods per product";
  return "Add multiple order dates per entity to compare period-over-period decline";
}

/** Client fallback when API omits unsupportedDeclineAnalysis (older backend). */
export function inferUnsupportedDeclineFromIntent(
  question: string,
  analysisIntent?: AnalysisIntentPayload | null
): UnsupportedDeclineAnalysis | null {
  if (!questionRequestsEntityDecline(question)) return null;
  if (!analysisIntent) return null;
  if (analysisIntent.primaryGoal !== "decline") return null;
  if (analysisIntent.support?.supported !== false) return null;

  const declineMeta = analysisIntent.support?.decline;
  const periodsRaw = declineMeta?.periodsAvailable;
  const periods =
    periodsRaw != null && Number.isFinite(Number(periodsRaw))
      ? Math.max(0, Math.round(Number(periodsRaw)))
      : 0;

  return {
    active: true,
    periodsAvailable: periods,
    status: "Insufficient Time-Series Data",
    leadSentence: DECLINE_CANNOT_DETERMINE_LEAD,
    recommendedAction: inferRecommendedAction(question),
    reasonCode:
      analysisIntent.support.reasonCodes?.[0] ?? "insufficient_time_series",
  };
}

export function resolveUnsupportedDeclineMode(args: {
  question: string;
  unsupportedDeclineAnalysis?: unknown;
  analysisIntent?: AnalysisIntentPayload | null;
}): UnsupportedDeclineAnalysis | null {
  const fromApi = parseUnsupportedDeclineAnalysis(args.unsupportedDeclineAnalysis);
  if (fromApi) return fromApi;
  return inferUnsupportedDeclineFromIntent(args.question, args.analysisIntent);
}

export type UnsupportedDeclineExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export function buildUnsupportedDeclineExecutiveCards(
  meta: UnsupportedDeclineAnalysis
): UnsupportedDeclineExecutiveCard[] {
  const stripes = [
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
  ] as const;
  return [
    {
      key: "ud-cannot",
      title: "Cannot determine decline",
      value: "Not supported",
      hint: meta.leadSentence,
      dotClass: stripes[0],
    },
    {
      key: "ud-periods",
      title: "Time periods available",
      value: String(meta.periodsAvailable),
      dotClass: stripes[1],
    },
    {
      key: "ud-status",
      title: "Analysis status",
      value: meta.status,
      dotClass: stripes[2],
    },
    {
      key: "ud-action",
      title: "Recommended action",
      value: meta.recommendedAction,
      dotClass: stripes[3],
    },
  ];
}

export function buildUnsupportedDeclineFollowUpChips(
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

export function prependUnsupportedDeclineLead(
  summary: string,
  lead = DECLINE_CANNOT_DETERMINE_LEAD
): string {
  const s = summary.trim();
  const l = lead.trim();
  if (!l) return s;
  if (!s) return l;
  if (s.toLowerCase().startsWith(l.toLowerCase().slice(0, 24))) return s;
  return `${l} ${s}`;
}
