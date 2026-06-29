import type { PdfRankedSignal } from "@/app/pdf-report";
import type {
  ParsedAnswerSections,
  PdfChartPrepContext,
} from "@/lib/build-executive-pdf-input";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";
import {
  alignInsightPresentationToChart,
  buildChartAlignedInsightSummary,
  buildInsightChartNarrativeContext,
  filterExecutiveVizCardsForChart,
  insightNarrativeConflictsWithChart,
  type InsightChartNarrativeContext,
} from "@/lib/insight-chart-narrative-alignment";

export type PdfChartNarrativeContext = InsightChartNarrativeContext;

export const buildPdfChartNarrativeContext = buildInsightChartNarrativeContext;

export function pdfNarrativeConflictsWithChart(
  text: string,
  ctx: PdfChartNarrativeContext
): boolean {
  return insightNarrativeConflictsWithChart(text, ctx);
}

export const buildChartAlignedPdfSummary = buildChartAlignedInsightSummary;

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
  const aligned = alignInsightPresentationToChart({
    chartPrep: input.chartPrep,
    parsedInsightAnswer: input.parsedInsightAnswer,
    insightExecutiveBrief: input.insightExecutiveBrief,
    insightExecutiveVizInsights: input.insightExecutiveVizInsights,
    pdfInsightAnswer: input.pdfInsightAnswer,
    alignedInsightSummary: input.alignedInsightSummary,
    rankedSignals: input.rankedSignals,
  });

  return {
    ...input,
    pdfInsightAnswer: aligned.pdfInsightAnswer,
    insightExecutiveBrief: aligned.insightExecutiveBrief,
    insightExecutiveVizInsights: aligned.insightExecutiveVizInsights,
    parsedInsightAnswer: aligned.parsedInsightAnswer,
    alignedInsightSummary: aligned.alignedInsightSummary,
    usedChartAlignedFallback: aligned.usedChartAlignedFallback,
  };
}

export { filterExecutiveVizCardsForChart };
