/**
 * Executive insight card titles — measure + insight type only (never raw user questions).
 */

import {
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
} from "@/lib/analytics-metadata";
import { sanitizeMetricPhraseForFollowUp } from "@/lib/ai-follow-up-suggestions";

export type InsightCardType =
  | "share"
  | "gap"
  | "concentration"
  | "average"
  | "correlation"
  | "outlier"
  | "risk"
  | "trend"
  | "sample"
  | "points"
  | "segments"
  | "highest"
  | "lowest"
  | "peak"
  | "leader"
  | "largest"
  | "smallest"
  | "roas";

const FIXED_TYPE_LABELS: Partial<Record<InsightCardType, string>> = {
  correlation: "Correlation",
  outlier: "Outlier Signal",
  risk: "Underperformer",
  trend: "Recent Change",
  sample: "Sample Size",
  points: "Data Points",
  segments: "Segments",
  roas: "Best ROAS",
};

const QUESTION_START_RE =
  /^(?:is|are|what|which|how|does|do|can|could|will|would|should)\b/i;
const RELATIONSHIP_QUESTION_RE =
  /\b(correlat(?:e|ed|ion)?|relationship|associated|association|versus|vs\.?|impact\s+of|between)\b/i;

export function isQuestionLikeLabel(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length < 3) return true;
  if (t.includes("?")) return true;
  if (QUESTION_START_RE.test(t)) return true;
  if (RELATIONSHIP_QUESTION_RE.test(t) && t.split(/\s+/).length >= 4) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 9) return true;
  if (t.length > 56) return true;
  return false;
}

/** Normalize a measure name for card titles (column/display driven). */
export function sanitizeExecutiveMeasureLabel(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s || isQuestionLikeLabel(s)) return "";

  s = stripIntentNoiseFromMetricLabel(s);
  s = polishMetricDisplay(s);
  const stem = sanitizeMetricPhraseForFollowUp(s);
  if (stem && !isQuestionLikeLabel(stem)) {
    s = stem
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  if (!s || isQuestionLikeLabel(s)) return "";
  if (s.length > 40) {
    s = s.slice(0, 40).trim();
  }
  return s;
}

export function sanitizeExecutiveDimensionLabel(raw: string): string {
  let d = raw.replace(/\s+/g, " ").trim();
  if (!d || isQuestionLikeLabel(d)) return "Category";
  d = d.replace(/\s+name$/i, "").trim();
  d = polishMetricDisplay(stripIntentNoiseFromMetricLabel(d));
  if (!d || isQuestionLikeLabel(d)) return "Category";
  if (d.length > 36) d = `${d.slice(0, 35)}…`;
  return d;
}

function matchMeasureFromDatasetColumns(
  text: string,
  columns: string[]
): string | null {
  const t = text.toLowerCase().replace(/[?.,!]/g, " ");
  if (!t.trim()) return null;
  let best: { label: string; score: number } | null = null;
  for (const col of columns) {
    const raw = col.trim();
    if (!raw) continue;
    const human = humanizeColumnName(raw);
    const tokens = [
      raw.toLowerCase(),
      raw.toLowerCase().replace(/_/g, " "),
      human.toLowerCase(),
    ];
    for (const tok of tokens) {
      if (tok.length < 3) continue;
      const idx = t.indexOf(tok);
      if (idx < 0) continue;
      const score = tok.length * 10 - idx;
      const label = sanitizeExecutiveMeasureLabel(human);
      if (!label) continue;
      if (!best || score > best.score) {
        best = { label, score };
      }
    }
  }
  return best?.label ?? null;
}

export type ResolveExecutiveMeasureArgs = {
  metricColumnDisplay?: string | null;
  metricColumn?: string | null;
  valueAxis?: string | null;
  valueAxisCompact?: string | null;
  chartTitle?: string | null;
  datasetColumns?: string[];
};

/** Pick the best measure label from analysis/chart metadata — never the raw question. */
export function resolveExecutiveMeasureLabel(
  args: ResolveExecutiveMeasureArgs
): string {
  const candidates = [
    args.metricColumnDisplay,
    args.metricColumn ? humanizeColumnName(args.metricColumn) : null,
    args.valueAxisCompact,
    args.valueAxis,
  ];
  for (const c of candidates) {
    const s = sanitizeExecutiveMeasureLabel(c ?? "");
    if (s) return s;
  }
  const cols = args.datasetColumns ?? [];
  for (const source of [args.chartTitle, args.valueAxis, args.metricColumnDisplay]) {
    if (!source?.trim() || !cols.length) continue;
    const matched = matchMeasureFromDatasetColumns(source, cols);
    if (matched) return matched;
  }
  return "Value";
}

export function resolveExecutiveDimensionLabel(args: {
  categoryColumnDisplay?: string | null;
  categoryColumn?: string | null;
  categoryAxis?: string | null;
}): string {
  const candidates = [
    args.categoryColumnDisplay,
    args.categoryColumn ? humanizeColumnName(args.categoryColumn) : null,
    args.categoryAxis,
  ];
  for (const c of candidates) {
    const d = sanitizeExecutiveDimensionLabel(c ?? "");
    if (d && d !== "Category") return d;
  }
  for (const c of candidates) {
    const d = sanitizeExecutiveDimensionLabel(c ?? "");
    if (d) return d;
  }
  return "Category";
}

/**
 * Build a KPI card title from detected measure + insight type.
 * @example buildInsightCardTitle("Revenue", "gap") → "Revenue Gap"
 */
export function buildInsightCardTitle(
  measure: string,
  insightType: InsightCardType
): string {
  const fixed = FIXED_TYPE_LABELS[insightType];
  if (fixed) return fixed;

  const m = sanitizeExecutiveMeasureLabel(measure) || "Value";

  switch (insightType) {
    case "share":
      return `${m} Share`;
    case "gap":
      return `${m} Gap`;
    case "concentration":
      return `${m} Concentration`;
    case "average":
      return `${m} Average`;
    case "highest":
      return `Highest ${m}`;
    case "lowest":
      return `Lowest ${m}`;
    case "peak":
      return `Peak ${m}`;
    case "leader":
      return `Top ${m}`;
    case "largest":
      return "Largest Segment";
    case "smallest":
      return "Smallest Segment";
    default:
      return m;
  }
}

export function buildInsightDimensionCardTitle(
  dimension: string,
  insightType: "highest" | "lowest" | "leader" | "share"
): string {
  const d = sanitizeExecutiveDimensionLabel(dimension);
  switch (insightType) {
    case "highest":
      return `Highest ${d}`;
    case "lowest":
      return `Lowest ${d}`;
    case "leader":
      return `Top ${d}`;
    case "share":
      return `${d} Share`;
    default:
      return d;
  }
}

/** Map API ranked-insight `kind` → card title type. */
export function insightCardTypeFromRankedKind(
  kind: string | undefined,
  priority?: number
): InsightCardType {
  const k = (kind ?? "").trim().toLowerCase();
  if (k === "concentration") {
    return (priority ?? 0) >= 90 ? "concentration" : "share";
  }
  if (k === "opportunity") return "gap";
  if (k === "outlier") return "outlier";
  if (k === "risk") return "risk";
  if (k === "trend") return "trend";
  if (k === "ranking") return "leader";
  return "share";
}
