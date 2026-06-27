/**
 * Saved AI Insight results — revisit prior answers without rerunning /ask.
 */

import type { ChartInsightAlignedAnalysis } from "@/lib/chart-insight-answers";

export const MAX_INSIGHT_SAVED_RESULTS = 30;

export type InsightSavedResult = {
  id: string;
  turnId?: string | null;
  question: string;
  answer: string;
  hasValidAIAnswer: boolean;
  alignedAnalysis: ChartInsightAlignedAnalysis;
  chartId: string | null;
  isFollowUp: boolean;
  parentResultId: string | null;
  lastAskVisualizationHydrated: boolean;
  savedAt: number;
};

export type InsightSavedResultInput = Omit<InsightSavedResult, "id" | "savedAt">;

export function createInsightSavedResult(
  input: InsightSavedResultInput,
  idFactory: () => string = newInsightResultId
): InsightSavedResult {
  return {
    ...input,
    id: idFactory(),
    savedAt: Date.now(),
  };
}

let insightResultSeq = 0;
export function newInsightResultId(): string {
  insightResultSeq += 1;
  return `insight-result-${Date.now()}-${insightResultSeq}`;
}

export function appendInsightSavedResult(
  history: InsightSavedResult[],
  entry: InsightSavedResult
): InsightSavedResult[] {
  const withoutDupTurn =
    entry.turnId?.trim()
      ? history.filter((h) => h.turnId?.trim() !== entry.turnId?.trim())
      : history;
  return [entry, ...withoutDupTurn].slice(0, MAX_INSIGHT_SAVED_RESULTS);
}

export function clearInsightResultHistory(): InsightSavedResult[] {
  return [];
}

export function resolveParentResultIdForFollowUp(
  history: InsightSavedResult[],
  activeResultId: string | null,
  lastSavedResultId: string | null
): string | null {
  if (activeResultId) return activeResultId;
  if (lastSavedResultId) return lastSavedResultId;
  const latestMain = history.find((h) => !h.isFollowUp);
  return latestMain?.id ?? null;
}

/** Payload applied to live insight UI when restoring a saved result (no /ask). */
export type InsightRestoreLivePayload = {
  question: string;
  answer: string;
  hasValidAIAnswer: boolean;
  alignedAnalysis: ChartInsightAlignedAnalysis;
  chartId: string | null;
  lastAskVisualizationHydrated: boolean;
  resultId: string;
};

export function buildInsightRestorePayload(
  result: InsightSavedResult
): InsightRestoreLivePayload {
  return {
    resultId: result.id,
    question: result.question,
    answer: result.answer,
    hasValidAIAnswer: result.hasValidAIAnswer,
    alignedAnalysis: result.alignedAnalysis,
    chartId: result.chartId,
    lastAskVisualizationHydrated: result.lastAskVisualizationHydrated,
  };
}

export function chartExistsInHistory(
  chartHistory: ReadonlyArray<{ id: string }>,
  chartId: string | null | undefined
): boolean {
  if (!chartId?.trim()) return false;
  return chartHistory.some((h) => h.id === chartId);
}
