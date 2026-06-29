import type { PdfRankedSignal } from "@/app/pdf-report";
import type { ChartRow } from "@/app/chart-types";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import type {
  ParsedAnswerSections,
  PdfChartPrepContext,
} from "@/lib/build-executive-pdf-input";
import { humanizeColumnName } from "@/lib/analytics-metadata";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";

/** Chart contract slice used to validate insight narrative text. */
export type InsightChartNarrativeContext = {
  dimensionLabel: string;
  dimensionColumn: string | null;
  metricLabel: string;
  chartTitle: string;
  categoryNames: string[];
};

const SEGMENT_NAMES = ["premium", "sme", "corporate", "retail"] as const;

const SEGMENT_PHRASES = [
  /\bcustomer\s+segments?\b/i,
  /\bsegment\s+(mix|split|breakdown|distribution|concentration)\b/i,
];

const NARRATIVE_PHRASE_STOPWORDS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
  "into",
  "your",
  "their",
  "about",
  "across",
  "total",
  "sample",
  "evidence",
  "executive",
  "takeaway",
  "insight",
  "risk",
  "high",
  "medium",
  "low",
  "shows",
  "show",
  "sharpest",
  "directional",
  "comparison",
  "analysis",
  "generated",
  "dataset",
  "records",
  "rows",
  "groups",
  "group",
  "metric",
  "value",
  "values",
  "amount",
  "share",
  "concentration",
  "spread",
  "between",
  "strongest",
  "weakest",
  "leading",
  "leads",
  "lead",
  "account",
  "accounts",
  "million",
  "approximately",
]);

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildInsightChartNarrativeContext(
  chartPrep: PdfChartPrepContext | null | undefined
): InsightChartNarrativeContext | null {
  if (!chartPrep?.chartData?.length) return null;

  const dimensionLabel =
    chartPrep.chartAxisLabels?.category?.trim() ||
    chartPrep.contract?.semanticContext?.dimensionLabel?.trim() ||
    (chartPrep.contract?.dimension
      ? humanizeColumnName(chartPrep.contract.dimension)
      : "") ||
    "";

  const dimensionColumn = chartPrep.contract?.dimension?.trim() || null;
  const metricLabel =
    chartPrep.chartAxisLabels?.value?.trim() ||
    chartPrep.alignedMetricDisplay?.trim() ||
    chartPrep.contract?.semanticContext?.metricLabel?.trim() ||
    "";

  const categoryNames = chartPrep.chartData
    .map((r) => String(r.name ?? "").trim())
    .filter(Boolean);

  return {
    dimensionLabel,
    dimensionColumn,
    metricLabel,
    chartTitle:
      chartPrep.exportDisplayTitle?.trim() ||
      chartPrep.chartTitle?.trim() ||
      "",
    categoryNames,
  };
}

export function buildInsightChartPrepFromSnapshot(
  snapshot: ChartSnapshot | null | undefined,
  axisLabels?: { category?: string; value?: string } | null
): PdfChartPrepContext | null {
  if (!snapshot?.chartData?.length) return null;

  const dimensionLabel =
    axisLabels?.category?.trim() ||
    snapshot.contract?.semanticContext?.dimensionLabel?.trim() ||
    undefined;
  const metricLabel =
    axisLabels?.value?.trim() ||
    snapshot.contract?.semanticContext?.metricLabel?.trim() ||
    undefined;

  return {
    presentationKind: snapshot.chartKind,
    chartData: snapshot.chartData,
    chartTitle: snapshot.title,
    chartSubtitleMerged: snapshot.subtitle,
    exportDisplayTitle: snapshot.title,
    trendMode: false,
    contract: snapshot.contract ?? undefined,
    rankedSignals: null,
    metricColumn: snapshot.contract?.metricKey ?? null,
    alignedMetricDisplay: metricLabel ?? null,
    aggregation: snapshot.contract?.aggregation ?? null,
    chartInsightBadge: null,
    chartAxisLabels:
      dimensionLabel || metricLabel
        ? { category: dimensionLabel ?? "", value: metricLabel ?? "" }
        : null,
    metadataChips: snapshot.presentationContract?.metadata.chips ?? null,
    chartArtifact: null,
    captureEl: null,
    chartAttribution: null,
    provenanceSlice: null,
    metricType: null,
    roundingHint: null,
    vizMetricType: null,
  };
}

function chartCategoriesSet(ctx: InsightChartNarrativeContext): Set<string> {
  return new Set(ctx.categoryNames.map((n) => normToken(n)));
}

function phraseMatchesChartCategory(
  phrase: string,
  chartSet: Set<string>
): boolean {
  const norm = normToken(phrase);
  if (!norm) return false;
  for (const cat of chartSet) {
    if (!cat) continue;
    if (cat === norm || cat.includes(norm) || norm.includes(cat)) return true;
  }
  return false;
}

function countChartCategoryMentions(
  text: string,
  ctx: InsightChartNarrativeContext
): number {
  let hits = 0;
  for (const name of ctx.categoryNames) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text)) hits += 1;
  }
  return hits;
}

function extractCategoryLikePhrases(text: string): string[] {
  const found = new Set<string>();
  const multiRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = multiRe.exec(text)) !== null) {
    found.add(match[1]!);
  }
  const singleRe = /\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g;
  while ((match = singleRe.exec(text)) !== null) {
    const word = match[1]!;
    if (!NARRATIVE_PHRASE_STOPWORDS.has(word.toLowerCase())) {
      found.add(word);
    }
  }
  return [...found];
}

function countForeignCategoryMentions(
  text: string,
  ctx: InsightChartNarrativeContext
): number {
  const chartSet = chartCategoriesSet(ctx);
  const dimNorm = normToken(ctx.dimensionLabel);
  const metricNorm = normToken(ctx.metricLabel);
  let foreign = 0;
  for (const phrase of extractCategoryLikePhrases(text)) {
    const norm = normToken(phrase);
    if (norm.length < 3) continue;
    if (dimNorm && (dimNorm.includes(norm) || norm.includes(dimNorm))) continue;
    if (metricNorm && (metricNorm.includes(norm) || norm.includes(metricNorm))) {
      continue;
    }
    if (phraseMatchesChartCategory(phrase, chartSet)) continue;
    foreign += 1;
  }
  return foreign;
}

function mentionsSegmentDimension(text: string): boolean {
  return SEGMENT_PHRASES.some((re) => re.test(text));
}

function mentionsSegmentNameNotInChart(
  text: string,
  ctx: InsightChartNarrativeContext
): boolean {
  const chartSet = chartCategoriesSet(ctx);
  const dimNorm = normToken(ctx.dimensionLabel);
  for (const seg of SEGMENT_NAMES) {
    if (!new RegExp(`\\b${seg}\\b`, "i").test(text)) continue;
    const inChart = [...chartSet].some((c) => c.includes(seg));
    if (!inChart && !dimNorm.includes(seg)) return true;
  }
  return false;
}

function dimensionIsProductType(ctx: InsightChartNarrativeContext): boolean {
  const blob =
    `${ctx.dimensionLabel} ${ctx.dimensionColumn ?? ""} ${ctx.chartTitle}`.toLowerCase();
  return /\bproduct\s*type\b|\bproduct_type\b/.test(blob);
}

/** True when narrative text references a breakdown that conflicts with the active chart. */
export function insightNarrativeConflictsWithChart(
  text: string,
  ctx: InsightChartNarrativeContext
): boolean {
  const t = text.trim();
  if (!t || ctx.categoryNames.length < 2) return false;

  const chartHits = countChartCategoryMentions(t, ctx);
  const foreignHits = countForeignCategoryMentions(t, ctx);

  if (chartHits === 0 && foreignHits >= 2) return true;
  if (chartHits <= 1 && foreignHits >= 3) return true;

  if (dimensionIsProductType(ctx)) {
    if (mentionsSegmentDimension(t)) return true;
    if (mentionsSegmentNameNotInChart(t, ctx)) return true;
  }

  const dimWords = normToken(ctx.dimensionLabel);
  if (dimWords && mentionsSegmentDimension(t) && !dimWords.includes("segment")) {
    return true;
  }

  return false;
}

export function buildChartAlignedInsightSummary(
  ctx: InsightChartNarrativeContext,
  rankedSignals?: PdfRankedSignal[] | null
): string {
  const dim = ctx.dimensionLabel || "category";
  const metric = ctx.metricLabel || "values";

  if (rankedSignals?.length) {
    const lines = rankedSignals
      .slice(0, 3)
      .map((s) => `${s.rank}: ${s.category} (${s.valueDisplay})`);
    return `${metric} by ${dim} — ${lines.join("; ")}.`;
  }

  if (ctx.categoryNames.length) {
    const cats = ctx.categoryNames.slice(0, 6).join(", ");
    return `Comparison of ${metric} across ${dim}: ${cats}.`;
  }

  if (ctx.chartTitle) {
    return `${ctx.chartTitle} — aligned to the exported chart breakdown.`;
  }

  return `Analysis aligned to the ${dim} breakdown shown in the visualization.`;
}

function sanitizeSectionText(
  text: string | undefined,
  ctx: InsightChartNarrativeContext
): string | undefined {
  if (!text?.trim()) return text;
  if (insightNarrativeConflictsWithChart(text, ctx)) return undefined;
  return text;
}

export function filterExecutiveVizCardsForChart(
  cards: ExecutiveVizInsightCard[],
  ctx: InsightChartNarrativeContext
): ExecutiveVizInsightCard[] {
  return cards.filter((c) => {
    const blob = `${c.title} ${c.value} ${c.hint ?? ""}`;
    return !insightNarrativeConflictsWithChart(blob, ctx);
  });
}

export type AlignedInsightPresentationInput = {
  chartPrep: PdfChartPrepContext | null;
  parsedInsightAnswer: ParsedAnswerSections;
  insightExecutiveBrief?: string;
  insightExecutiveVizInsights?: ExecutiveVizInsightCard[];
  pdfInsightAnswer?: string;
  alignedInsightSummary?: string;
  rankedSignals?: PdfRankedSignal[] | null;
};

export type AlignedInsightPresentation = {
  parsedInsightAnswer: ParsedAnswerSections;
  insightExecutiveBrief: string;
  insightExecutiveVizInsights: ExecutiveVizInsightCard[];
  pdfInsightAnswer: string;
  alignedInsightSummary?: string;
  usedChartAlignedFallback: boolean;
};

/** Shared live UI + PDF insight alignment against the active chart contract. */
export function alignInsightPresentationToChart(
  input: AlignedInsightPresentationInput
): AlignedInsightPresentation {
  const ctx = buildInsightChartNarrativeContext(input.chartPrep);
  const parsed = input.parsedInsightAnswer;
  const brief = input.insightExecutiveBrief?.trim() ?? "";
  const cards = input.insightExecutiveVizInsights ?? [];
  const pdfInsightAnswer = input.pdfInsightAnswer?.trim() || parsed.summary || "";

  if (!ctx) {
    return {
      parsedInsightAnswer: parsed,
      insightExecutiveBrief: brief,
      insightExecutiveVizInsights: cards,
      pdfInsightAnswer,
      alignedInsightSummary: input.alignedInsightSummary,
      usedChartAlignedFallback: false,
    };
  }

  const combined = [
    pdfInsightAnswer,
    brief,
    input.alignedInsightSummary ?? "",
    ...cards.map((c) => `${c.title} ${c.value} ${c.hint ?? ""}`),
    parsed.summary,
    parsed.statistical,
    parsed.hypotheses,
    parsed.recommendations,
    parsed.methodology,
    parsed.moreDetail,
  ]
    .filter(Boolean)
    .join("\n");

  if (!insightNarrativeConflictsWithChart(combined, ctx)) {
    return {
      parsedInsightAnswer: parsed,
      insightExecutiveBrief: brief,
      insightExecutiveVizInsights: cards,
      pdfInsightAnswer,
      alignedInsightSummary: input.alignedInsightSummary,
      usedChartAlignedFallback: false,
    };
  }

  const fallback = buildChartAlignedInsightSummary(ctx, input.rankedSignals);
  const filteredCards = filterExecutiveVizCardsForChart(cards, ctx);
  const safeBrief = insightNarrativeConflictsWithChart(brief, ctx)
    ? fallback
    : brief;

  return {
    parsedInsightAnswer: {
      summary: fallback,
      statistical: sanitizeSectionText(parsed.statistical, ctx),
      hypotheses: sanitizeSectionText(parsed.hypotheses, ctx),
      recommendations: sanitizeSectionText(parsed.recommendations, ctx),
      methodology: sanitizeSectionText(parsed.methodology, ctx),
      moreDetail: sanitizeSectionText(parsed.moreDetail, ctx),
    },
    insightExecutiveBrief: safeBrief,
    insightExecutiveVizInsights: filteredCards,
    pdfInsightAnswer: fallback,
    alignedInsightSummary: fallback,
    usedChartAlignedFallback: true,
  };
}

export function chartRowsToRankedSignals(
  rows: readonly ChartRow[]
): PdfRankedSignal[] {
  const sorted = [...rows]
    .filter((r) => Number.isFinite(Number(r.value)))
    .sort((a, b) => Number(b.value) - Number(a.value));
  return sorted.slice(0, 3).map((row, i) => ({
    rank: `#${i + 1}`,
    category: String(row.name ?? "—"),
    valueDisplay: row.displayValue?.trim() || String(row.value ?? "—"),
  }));
}
