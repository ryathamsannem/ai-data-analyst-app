import type { PdfRankedSignal } from "@/app/pdf-report";
import type {
  ParsedAnswerSections,
  PdfChartPrepContext,
} from "@/lib/build-executive-pdf-input";
import { humanizeColumnName } from "@/lib/analytics-metadata";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";

export type PdfChartNarrativeContext = {
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

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildPdfChartNarrativeContext(
  chartPrep: PdfChartPrepContext | null | undefined
): PdfChartNarrativeContext | null {
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

function chartCategoriesSet(ctx: PdfChartNarrativeContext): Set<string> {
  return new Set(ctx.categoryNames.map((n) => normToken(n)));
}

function mentionsSegmentDimension(text: string): boolean {
  return SEGMENT_PHRASES.some((re) => re.test(text));
}

function mentionsSegmentNameNotInChart(
  text: string,
  ctx: PdfChartNarrativeContext
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

function dimensionIsProductType(ctx: PdfChartNarrativeContext): boolean {
  const blob =
    `${ctx.dimensionLabel} ${ctx.dimensionColumn ?? ""} ${ctx.chartTitle}`.toLowerCase();
  return /\bproduct\s*type\b|\bproduct_type\b/.test(blob);
}

/** True when narrative text references a breakdown that conflicts with the exported chart. */
export function pdfNarrativeConflictsWithChart(
  text: string,
  ctx: PdfChartNarrativeContext
): boolean {
  const t = text.trim();
  if (!t) return false;

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

export function buildChartAlignedPdfSummary(
  ctx: PdfChartNarrativeContext,
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
  ctx: PdfChartNarrativeContext
): string | undefined {
  if (!text?.trim()) return text;
  if (pdfNarrativeConflictsWithChart(text, ctx)) return undefined;
  return text;
}

export function filterExecutiveVizCardsForChart(
  cards: ExecutiveVizInsightCard[],
  ctx: PdfChartNarrativeContext
): ExecutiveVizInsightCard[] {
  return cards.filter((c) => {
    const blob = `${c.title} ${c.value} ${c.hint ?? ""}`;
    return !pdfNarrativeConflictsWithChart(blob, ctx);
  });
}

export type PdfNarrativeAlignInput = {
  chartPrep: PdfChartPrepContext | null;
  pdfInsightAnswer: string;
  insightExecutiveBrief: string;
  insightExecutiveVizInsights: ExecutiveVizInsightCard[];
  parsedInsightAnswer: ParsedAnswerSections;
  alignedInsightSummary?: string;
  rankedSignals?: PdfRankedSignal[] | null;
};

export type PdfNarrativeAlignResult = PdfNarrativeAlignInput & {
  usedChartAlignedFallback: boolean;
};

/** Replace stale sidecar / AI narrative when it conflicts with the exported chart contract. */
export function alignPdfNarrativeToChart(
  input: PdfNarrativeAlignInput
): PdfNarrativeAlignResult {
  const ctx = buildPdfChartNarrativeContext(input.chartPrep);
  if (!ctx) {
    return { ...input, usedChartAlignedFallback: false };
  }

  const combined = [
    input.pdfInsightAnswer,
    input.insightExecutiveBrief,
    input.alignedInsightSummary ?? "",
    ...input.insightExecutiveVizInsights.map((c) => `${c.title} ${c.value}`),
    input.parsedInsightAnswer.summary,
    input.parsedInsightAnswer.statistical,
    input.parsedInsightAnswer.hypotheses,
  ]
    .filter(Boolean)
    .join("\n");

  if (!pdfNarrativeConflictsWithChart(combined, ctx)) {
    return { ...input, usedChartAlignedFallback: false };
  }

  const fallback = buildChartAlignedPdfSummary(ctx, input.rankedSignals);
  const filteredCards = filterExecutiveVizCardsForChart(
    input.insightExecutiveVizInsights,
    ctx
  );

  const brief = pdfNarrativeConflictsWithChart(input.insightExecutiveBrief, ctx)
    ? ""
    : input.insightExecutiveBrief.trim();

  return {
    ...input,
    pdfInsightAnswer: fallback,
    insightExecutiveBrief: brief,
    insightExecutiveVizInsights: filteredCards,
    parsedInsightAnswer: {
      summary: fallback,
      statistical: sanitizeSectionText(
        input.parsedInsightAnswer.statistical,
        ctx
      ),
      hypotheses: sanitizeSectionText(
        input.parsedInsightAnswer.hypotheses,
        ctx
      ),
      recommendations: sanitizeSectionText(
        input.parsedInsightAnswer.recommendations,
        ctx
      ),
      methodology: sanitizeSectionText(
        input.parsedInsightAnswer.methodology,
        ctx
      ),
      moreDetail: sanitizeSectionText(input.parsedInsightAnswer.moreDetail, ctx),
    },
    alignedInsightSummary: fallback,
    usedChartAlignedFallback: true,
  };
}
