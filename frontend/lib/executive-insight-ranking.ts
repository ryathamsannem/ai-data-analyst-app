/**
 * Rank executive insight cards — prefer concentration / share narratives over raw amounts.
 */

import {
  buildInsightCardTitle,
  buildInsightDimensionCardTitle,
  insightCardTypeFromRankedKind,
  resolveExecutiveDimensionLabel,
  resolveExecutiveMeasureLabel,
  type ResolveExecutiveMeasureArgs,
} from "@/lib/insight-card-titles";

export type RankedExecutiveInsight = {
  kind?: string;
  priority?: number;
  title: string;
  value: string;
  hint?: string;
  narrativeLine?: string;
};

export type ExecutiveVizInsightCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

const STRIPES = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-slate-400",
] as const;

export function parseRankedExecutiveInsights(raw: unknown): RankedExecutiveInsight[] {
  if (!Array.isArray(raw)) return [];
  const out: RankedExecutiveInsight[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const value = typeof o.value === "string" ? o.value.trim() : "";
    if (!title || !value) continue;
    out.push({
      kind: typeof o.kind === "string" ? o.kind : undefined,
      priority: Number.isFinite(Number(o.priority)) ? Number(o.priority) : undefined,
      title,
      value,
      hint: typeof o.hint === "string" ? o.hint.trim() : undefined,
      narrativeLine:
        typeof o.narrativeLine === "string" ? o.narrativeLine.trim() : undefined,
    });
  }
  return out.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function rankedInsightsToExecutiveCards(
  ranked: RankedExecutiveInsight[],
  measureContext: ResolveExecutiveMeasureArgs,
  dimensionLabel?: string,
  max = 4
): ExecutiveVizInsightCard[] {
  const measure = resolveExecutiveMeasureLabel(measureContext);
  const dim = dimensionLabel ?? "Category";

  const cards: ExecutiveVizInsightCard[] = [];
  ranked.slice(0, max).forEach((item, i) => {
    const cardType = insightCardTypeFromRankedKind(item.kind, item.priority);
    const apiTitle = item.title?.trim() ?? "";
    let title: string;
    if (apiTitle) {
      // Prefer backend lens-specific titles (Growth Risk, Margin Risk, …).
      title = apiTitle;
    } else if (cardType === "leader") {
      title = buildInsightDimensionCardTitle(dim, "leader");
    } else if (cardType === "outlier" || cardType === "risk" || cardType === "trend") {
      title = buildInsightCardTitle(measure, cardType);
    } else {
      title = buildInsightCardTitle(measure, cardType);
    }
    cards.push({
      key: `ranked-${item.kind ?? "insight"}-${i}`,
      title,
      value: item.value,
      hint: item.hint ?? item.narrativeLine,
      dotClass: STRIPES[i % STRIPES.length],
    });
  });
  return cards;
}

function shareOfTotal(rows: { value: number }[]): number | null {
  const vals = rows.map((r) => r.value).filter((v) => Number.isFinite(v));
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 1e-12 || !vals.length) return null;
  const top = Math.max(...vals);
  return (100 * top) / total;
}

export type ExecutiveInsightAxisContext = {
  categoryAxis: string;
  valueAxis: string;
  measure?: ResolveExecutiveMeasureArgs;
  dimension?: {
    categoryColumnDisplay?: string | null;
    categoryColumn?: string | null;
    categoryAxis?: string | null;
  };
};

/** Client-side ranked cards when API payload is absent. */
export function buildRankedCategoryExecutiveCards(
  rows: { label: string; value: number; formatted: string }[],
  ctx: ExecutiveInsightAxisContext,
  kind: string
): ExecutiveVizInsightCard[] {
  if (rows.length < 2) return [];

  const measureArgs: ResolveExecutiveMeasureArgs = ctx.measure ?? {
    valueAxis: ctx.valueAxis,
    valueAxisCompact: ctx.valueAxis,
  };
  const measure = resolveExecutiveMeasureLabel(measureArgs);
  const dim = resolveExecutiveDimensionLabel(
    ctx.dimension ?? { categoryAxis: ctx.categoryAxis }
  );

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted[0]!;
  const share = shareOfTotal(sorted);
  const metPhrase = measure.toLowerCase();

  const ranked: RankedExecutiveInsight[] = [];
  if (share != null && share >= 28) {
    const pct = share >= 10 ? String(Math.round(share)) : share.toFixed(1);
    const narrative = `${top.label} contributes ${pct}% of total ${metPhrase} and dominates performance.`;
    const pri = share >= 40 ? 95 : 82;
    ranked.push({
      kind: "concentration",
      priority: pri,
      title: buildInsightCardTitle(
        measure,
        insightCardTypeFromRankedKind("concentration", pri)
      ),
      value: `${pct}%`,
      hint: narrative,
      narrativeLine: narrative,
    });
  }

  if (!ranked.length) {
    ranked.push({
      kind: "ranking",
      priority: 50,
      title: buildInsightDimensionCardTitle(dim, "leader"),
      value: top.label.slice(0, 44),
      hint: `Peak ${metPhrase}: ${top.formatted}`,
      narrativeLine: `${top.label} ranks highest on ${metPhrase} at ${top.formatted}.`,
    });
  }

  const base = rankedInsightsToExecutiveCards(ranked, measureArgs, dim, 4);
  if (base.length >= 2) return base;

  return buildLegacyFallbackCards(sorted, ctx, kind, measure, dim);
}

function buildLegacyFallbackCards(
  sorted: { label: string; value: number; formatted: string }[],
  ctx: ExecutiveInsightAxisContext,
  kind: string,
  measure: string,
  dim: string
): ExecutiveVizInsightCard[] {
  const top = sorted[0]!;
  const bot = sorted[sorted.length - 1]!;
  const cards: ExecutiveVizInsightCard[] = [
    {
      key: "cmp-max-cat",
      title: buildInsightDimensionCardTitle(dim, "highest"),
      value: top.label.slice(0, 44),
      hint: top.formatted,
      dotClass: STRIPES[0],
    },
    {
      key: "cmp-peak-met",
      title: buildInsightCardTitle(measure, "peak"),
      value: top.formatted,
      dotClass: STRIPES[1],
    },
  ];
  if (sorted.length > 1) {
    cards.push({
      key: "cmp-min-cat",
      title: buildInsightDimensionCardTitle(dim, "lowest"),
      value: bot.label.slice(0, 44),
      hint: bot.formatted,
      dotClass: STRIPES[2],
    });
  }
  cards.push({
    key: "cmp-points",
    title: buildInsightCardTitle(measure, "points"),
    value: String(sorted.length),
    dotClass: STRIPES[3],
  });
  return cards.slice(0, 4);
}
