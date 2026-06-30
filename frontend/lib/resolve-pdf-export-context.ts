/**
 * Resolves a single chart + narrative context for PDF export so question,
 * executive summary, AI insight, visualization, facts, and metadata align.
 */

import type { ChartSnapshot } from "@/contexts/chart-session-context";
import {
  getChartInsightAnswer,
  type ChartInsightAnswerStore,
} from "@/lib/chart-insight-answers";
import type { ExecutivePdfExportOptions } from "@/lib/build-executive-pdf-input";
import {
  findInsightSavedResultById,
  findInsightSavedResultByQuestion,
  type InsightSavedResult,
} from "@/lib/insight-result-history";

export type PdfAlignedAnalysisLike = Record<string, unknown> | null;

export function normalizeQuestionForPdfMatch(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findChartIdForExportQuestion(
  store: ChartInsightAnswerStore,
  question: string
): string | null {
  const asked = normalizeQuestionForPdfMatch(question);
  if (!asked) return null;
  let best: { id: string; savedAt: number } | null = null;
  for (const [id, bundle] of Object.entries(store)) {
    if (!bundle.hasValidAIAnswer || !bundle.answer.trim()) continue;
    if (normalizeQuestionForPdfMatch(bundle.lastAskedQuestion) !== asked) {
      continue;
    }
    if (!best || bundle.savedAt > best.savedAt) {
      best = { id, savedAt: bundle.savedAt };
    }
  }
  return best?.id ?? null;
}

function bundleIsExportable(
  store: ChartInsightAnswerStore,
  chartId: string | null | undefined
): boolean {
  if (!chartId) return false;
  const bundle = getChartInsightAnswer(store, chartId);
  return Boolean(bundle?.hasValidAIAnswer && bundle.answer.trim());
}

export type ResolvePdfExportContextInput = {
  options: ExecutivePdfExportOptions;
  chartHistory: ChartSnapshot[];
  aiAnswerByChartId: ChartInsightAnswerStore;
  insightChartId: string | null;
  pinnedInsightChartId: string | null;
  activeChartId: string | null;
  lastAskedQuestion: string;
  question: string;
  liveAnswer: string;
  liveAlignedAnalysis: PdfAlignedAnalysisLike;
  insightChartMatchesCurrentQuestion: boolean;
  insightChartDataLength: number;
  /** Saved insight results — authoritative for follow-up Q/A when chart bundle is shared. */
  insightResultHistory?: InsightSavedResult[];
  /** Explicit saved result to export (active follow-up or restored answer). */
  exportInsightResultId?: string | null;
};

export type ResolvedPdfExportContext = {
  chartScope: "insight" | "session";
  chartId: string | null;
  snapshot: ChartSnapshot | null;
  insightAnswer: string;
  alignedAnalysis: PdfAlignedAnalysisLike;
  lastAskedQuestion: string;
};

export function resolvePdfExportContext(
  input: ResolvePdfExportContextInput
): ResolvedPdfExportContext {
  const {
    options,
    chartHistory,
    aiAnswerByChartId,
    insightChartId,
    pinnedInsightChartId,
    activeChartId,
    question,
    liveAnswer,
    liveAlignedAnalysis,
    insightChartMatchesCurrentQuestion,
    insightChartDataLength,
  } = input;

  const includeAI = options.includeAIInsight === true;
  const includeChart = options.includeChart === true;
  const explicitScope = options.chartScope;

  const questionForLookup =
    input.lastAskedQuestion.trim() || question.trim();
  const history = input.insightResultHistory ?? [];
  const savedFromId = findInsightSavedResultById(
    history,
    input.exportInsightResultId
  );
  const savedFromQuestion =
    !savedFromId && includeAI
      ? findInsightSavedResultByQuestion(history, questionForLookup)
      : null;
  const savedResult = savedFromId ?? savedFromQuestion;
  const savedChartId =
    savedResult?.chartId &&
    chartHistory.some((h) => h.id === savedResult.chartId)
      ? savedResult.chartId
      : null;

  const chartIdFromQuestion = includeAI
    ? findChartIdForExportQuestion(aiAnswerByChartId, questionForLookup)
    : null;

  const pinnedId = pinnedInsightChartId ?? insightChartId;
  const pinnedExportable = bundleIsExportable(aiAnswerByChartId, pinnedId);
  const insightExportable = bundleIsExportable(
    aiAnswerByChartId,
    insightChartId
  );
  const sessionExportable = bundleIsExportable(
    aiAnswerByChartId,
    activeChartId
  );

  const hasAnyInsightExport =
    Boolean(
      savedResult?.hasValidAIAnswer && savedResult.answer.trim()
    ) ||
    Boolean(chartIdFromQuestion) ||
    pinnedExportable ||
    insightExportable ||
    (insightChartMatchesCurrentQuestion && insightChartDataLength > 0);

  let chartScope: "insight" | "session";
  if (explicitScope === "insight" || explicitScope === "session") {
    chartScope = explicitScope;
  } else if (includeAI && includeChart && hasAnyInsightExport) {
    chartScope = "insight";
  } else if (includeAI && !includeChart && hasAnyInsightExport) {
    chartScope = "insight";
  } else if (includeChart) {
    chartScope = "session";
  } else if (includeAI) {
    chartScope = "insight";
  } else {
    chartScope = "session";
  }

  let chartId: string | null = null;
  if (chartScope === "insight") {
    chartId =
      savedChartId ??
      chartIdFromQuestion ??
      (pinnedExportable ? pinnedId : null) ??
      (insightExportable ? insightChartId : null) ??
      (insightChartMatchesCurrentQuestion ? insightChartId : null);
  } else {
    chartId = includeChart ? activeChartId : null;
  }

  const snapshot =
    (chartId ? chartHistory.find((h) => h.id === chartId) : null) ??
    (chartScope === "insight"
      ? insightChartId
        ? (chartHistory.find((h) => h.id === insightChartId) ?? null)
        : null
      : activeChartId
        ? (chartHistory.find((h) => h.id === activeChartId) ?? null)
        : null);

  const resolvedChartId = snapshot?.id ?? chartId;

  let insightAnswer = "";
  let alignedAnalysis: PdfAlignedAnalysisLike = null;
  let exportQuestion = "";

  if (chartScope === "insight") {
    const bundle = resolvedChartId
      ? getChartInsightAnswer(aiAnswerByChartId, resolvedChartId)
      : null;
    const savedExportable = Boolean(
      savedResult?.hasValidAIAnswer && savedResult.answer.trim()
    );
    if (savedExportable && savedResult) {
      insightAnswer = savedResult.answer.trim();
      alignedAnalysis =
        (savedResult.alignedAnalysis as PdfAlignedAnalysisLike) ??
        (bundle?.alignedAnalysis as PdfAlignedAnalysisLike) ??
        liveAlignedAnalysis;
      exportQuestion = savedResult.question.trim();
    } else {
      insightAnswer =
        bundle?.answer?.trim() ||
        (resolvedChartId === insightChartId ? liveAnswer.trim() : "") ||
        liveAnswer;
      alignedAnalysis =
        (resolvedChartId === insightChartId && liveAlignedAnalysis
          ? liveAlignedAnalysis
          : null) ??
        (bundle?.alignedAnalysis as PdfAlignedAnalysisLike) ??
        liveAlignedAnalysis;
      exportQuestion =
        bundle?.lastAskedQuestion?.trim() ||
        input.lastAskedQuestion.trim() ||
        question.trim();
    }
  } else {
    const sessionBundle = activeChartId
      ? getChartInsightAnswer(aiAnswerByChartId, activeChartId)
      : null;
    if (includeAI && sessionExportable && sessionBundle) {
      insightAnswer = sessionBundle.answer;
      alignedAnalysis =
        (sessionBundle.alignedAnalysis as PdfAlignedAnalysisLike) ?? null;
      exportQuestion = sessionBundle.lastAskedQuestion.trim();
    } else if (includeAI) {
      insightAnswer = "";
      alignedAnalysis = null;
      exportQuestion = "";
    } else {
      insightAnswer = liveAnswer;
      alignedAnalysis = liveAlignedAnalysis;
      exportQuestion = question.trim() || input.lastAskedQuestion.trim();
    }
  }

  return {
    chartScope,
    chartId: resolvedChartId,
    snapshot,
    insightAnswer,
    alignedAnalysis,
    lastAskedQuestion: exportQuestion,
  };
}
