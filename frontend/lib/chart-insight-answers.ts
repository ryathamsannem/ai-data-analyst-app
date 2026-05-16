/**
 * Per-chart AI answer persistence — keyed by session chart snapshot id.
 * Chart visualization lives in chart session; answers are independent.
 */

/** Opaque aligned-analysis payload from /ask (stored per chart). */
export type ChartInsightAlignedAnalysis = Record<string, unknown> | null;

export type ChartInsightAnswerBundle = {
  answer: string;
  lastAskedQuestion: string;
  hasValidAIAnswer: boolean;
  alignedAnalysis: ChartInsightAlignedAnalysis;
  savedAt: number;
};

export type ChartInsightAnswerStore = Record<string, ChartInsightAnswerBundle>;

export function getChartInsightAnswer(
  store: ChartInsightAnswerStore,
  chartId: string | null | undefined
): ChartInsightAnswerBundle | null {
  if (!chartId) return null;
  return store[chartId] ?? null;
}

export function resolveAnswerTextForChart(
  store: ChartInsightAnswerStore,
  chartId: string | null | undefined,
  liveAnswer: string
): string {
  const direct = liveAnswer.trim();
  if (direct) return liveAnswer;
  const stored = getChartInsightAnswer(store, chartId);
  return stored?.answer?.trim() ? stored.answer : "";
}

export function hasStoredValidAnswer(
  store: ChartInsightAnswerStore,
  chartId: string | null | undefined,
  liveAnswer: string,
  liveValid: boolean
): boolean {
  if (liveValid && liveAnswer.trim()) return true;
  const stored = getChartInsightAnswer(store, chartId);
  return Boolean(stored?.hasValidAIAnswer && stored.answer.trim());
}
