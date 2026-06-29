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

export function normalizeInsightQuestionForMatch(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findInsightSavedResultById(
  history: InsightSavedResult[],
  resultId: string | null | undefined
): InsightSavedResult | null {
  if (!resultId?.trim()) return null;
  return history.find((r) => r.id === resultId) ?? null;
}

/** Newest saved result whose question matches (normalized). */
/** Prefer the saved result for the active question before chart-keyed bundle fallback. */
export function resolveLiveInsightAnswerText(args: {
  question: string;
  lastAskedQuestion: string;
  liveAnswer: string;
  activeResultId: string | null;
  history: InsightSavedResult[];
}): string {
  const displayQ = args.lastAskedQuestion.trim() || args.question.trim();
  if (args.activeResultId) {
    const active = findInsightSavedResultById(args.history, args.activeResultId);
    if (
      active?.answer.trim() &&
      normalizeInsightQuestionForMatch(active.question) ===
        normalizeInsightQuestionForMatch(displayQ)
    ) {
      return active.answer;
    }
  }
  const byQuestion = findInsightSavedResultByQuestion(args.history, displayQ);
  if (byQuestion?.answer.trim()) return byQuestion.answer;
  return args.liveAnswer;
}

export function findInsightSavedResultByQuestion(
  history: InsightSavedResult[],
  question: string
): InsightSavedResult | null {
  const asked = normalizeInsightQuestionForMatch(question);
  if (!asked) return null;
  let best: InsightSavedResult | null = null;
  for (const entry of history) {
    if (!entry.hasValidAIAnswer || !entry.answer.trim()) continue;
    if (normalizeInsightQuestionForMatch(entry.question) !== asked) continue;
    if (!best || entry.savedAt > best.savedAt) best = entry;
  }
  return best;
}

/** Prior questions in order up to and including the selected saved result. */
export function buildInsightConversationThread(
  history: InsightSavedResult[],
  resultId: string
): string[] {
  const thread: string[] = [];
  const visited = new Set<string>();
  let current = findInsightSavedResultById(history, resultId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const q = current.question.trim();
    if (q) thread.unshift(q);
    if (!current.parentResultId) break;
    current = findInsightSavedResultById(history, current.parentResultId);
  }
  return thread;
}
