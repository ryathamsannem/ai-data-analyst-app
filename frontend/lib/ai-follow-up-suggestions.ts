/**
 * Domain-agnostic follow-up question chips after an AI insight (no dataset-specific literals).
 */

import { humanizeColumnName } from "@/lib/analytics-metadata";
import type { ChartKind } from "@/app/chart-types";

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
};

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeChips(chips: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chips) {
    const t = c.replace(/\s+/g, " ").trim();
    if (t.length < 6 || t.length > 160) continue;
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
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
export function buildAiFollowUpQuestionChips(ctx: AiFollowUpChipContext): string[] {
  const chips: string[] = [];
  const met = ctx.valueAxisLabel.trim() || "this metric";
  const dim = ctx.categoryAxisLabel.trim() || "category";
  const metShort = truncatePhrase(met, 44);
  const dimShort = truncatePhrase(dim, 36);
  const lastQn = norm(ctx.lastQuestion);

  const rows = ctx.seriesRows
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      value: Number(r.value),
    }))
    .filter((r) => r.name && Number.isFinite(r.value));

  if (
    (ctx.chartKind === "line" || ctx.chartKind === "area") &&
    rows.length >= 2
  ) {
    chips.push("Which period changed most vs the prior bucket?");
  }

  if (isRankableBarLike(ctx.chartKind) && rows.length >= 2) {
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const hi = sorted[0]!.name;
    const lo = sorted[sorted.length - 1]!.name;
    if (hi && lo && norm(hi) !== norm(lo)) {
      chips.push(`Why is ${truncatePhrase(hi, 48)} highest?`);
      chips.push(`What explains ${truncatePhrase(lo, 48)} being lowest?`);
    }
  }

  if (ctx.chartKind === "scatter") {
    chips.push("Which points look like outliers relative to the cluster?");
  }

  for (const alt of ctx.alternateMetricLabels) {
    const a = alt.trim();
    if (!a || norm(a) === norm(met)) continue;
    chips.push(`Compare ${metShort} with ${truncatePhrase(a, 40)}`);
    break;
  }

  const drill = `Which ${dimShort} leads on ${metShort}?`;
  if (!lastQn || !lastQn.includes(norm(drill).slice(0, 28))) {
    chips.push(drill);
  }

  chips.push("What is the single clearest takeaway from this cut?");
  chips.push("Which filter or cohort should we test next?");

  const dom = ctx.datasetDomain.trim();
  if (dom && dom.toLowerCase() !== "generic") {
    chips.push(`What else matters for ${truncatePhrase(dom, 28)} performance?`);
  }

  let out = dedupeChips(chips, 10);
  const pad = [
    "Summarize the headline pattern in one sentence.",
    "Where should leadership dig in first?",
  ];
  for (const p of pad) {
    if (out.length >= 5) break;
    const k = norm(p);
    if (!out.some((x) => norm(x) === k)) out.push(p);
  }
  return out.slice(0, 5);
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
