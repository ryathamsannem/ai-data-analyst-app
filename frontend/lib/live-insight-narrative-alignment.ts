import type { ChartSnapshot } from "@/contexts/chart-session-context";
import type {
  ParsedAnswerSections,
  PdfChartPrepContext,
} from "@/lib/build-executive-pdf-input";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";
import type { PdfRankedSignal } from "@/app/pdf-report";
import {
  alignInsightPresentationToChart,
  buildInsightChartPrepFromSnapshot,
  type AlignedInsightPresentation,
} from "@/lib/insight-chart-narrative-alignment";

export const buildLiveInsightChartPrep = buildInsightChartPrepFromSnapshot;

export type LiveInsightAlignInput = {
  parsedInsightAnswer: ParsedAnswerSections;
  insightExecutiveBrief?: string;
  insightExecutiveVizInsights?: ExecutiveVizInsightCard[];
  rankedSignals?: PdfRankedSignal[] | null;
};

/** Apply the shared chart-contract narrative guard to live AI Insights UI sections. */
export function alignLiveInsightPresentation(
  input: LiveInsightAlignInput,
  chartPrep: PdfChartPrepContext | null,
  snapshot?: ChartSnapshot | null
): AlignedInsightPresentation {
  if (!chartPrep) {
    return {
      parsedInsightAnswer: input.parsedInsightAnswer,
      insightExecutiveBrief: input.insightExecutiveBrief?.trim() ?? "",
      insightExecutiveVizInsights: input.insightExecutiveVizInsights ?? [],
      pdfInsightAnswer: input.parsedInsightAnswer.summary ?? "",
      usedChartAlignedFallback: false,
    };
  }

  return alignInsightPresentationToChart({
    chartPrep,
    parsedInsightAnswer: input.parsedInsightAnswer,
    insightExecutiveBrief: input.insightExecutiveBrief,
    insightExecutiveVizInsights: input.insightExecutiveVizInsights,
    pdfInsightAnswer: input.parsedInsightAnswer.summary,
    rankedSignals:
      input.rankedSignals ??
      chartPrep.rankedSignals ??
      undefined,
  });
}

/** @deprecated Prefer alignLiveInsightPresentation — kept for narrow parsed-only callers. */
export function alignLiveParsedInsightAnswer(
  parsed: ParsedAnswerSections,
  chartPrep: PdfChartPrepContext | null
): ParsedAnswerSections {
  return alignLiveInsightPresentation({ parsedInsightAnswer: parsed }, chartPrep)
    .parsedInsightAnswer;
}
