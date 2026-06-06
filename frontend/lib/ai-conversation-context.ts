/**
 * Durable AI Insights conversation / follow-up context for `/ask` payloads.
 */

import type { RoutingPlanPayload } from "@/lib/routing-plan";

export type ParentAnalysisContext = {
  rootQuestion: string | null;
  priorQuestion: string | null;
  metricColumn: string | null;
  categoryColumn: string | null;
  metricColumnDisplay: string | null;
  categoryColumnDisplay: string | null;
  aggregation: string | null;
  chartType: string | null;
  chartTitle: string | null;
  intentBucket: string | null;
  routingIntent: string | null;
  followUpChain: string[];
  lastAiAnswer: string | null;
  turnId: string | null;
  routingPlan: RoutingPlanPayload | null;
};

export type ConversationSnapshotLike = {
  lastQuestion?: string | null;
  rootQuestion?: string | null;
  metricColumn?: string | null;
  categoryColumn?: string | null;
  aggregation?: string | null;
  chartType?: string | null;
  lastChartTitle?: string | null;
  intentBucket?: string | null;
  followUpChain?: string[] | null;
  lastAiAnswer?: string | null;
  turnId?: string | null;
};

export type AlignedAnalysisLike = {
  metricColumn?: string | null;
  categoryColumn?: string | null;
  metricColumnDisplay?: string | null;
  categoryColumnDisplay?: string | null;
  aggregation?: string | null;
  chartType?: string | null;
  chartTitle?: string | null;
  insightSummary?: string | null;
  routingPlan?: RoutingPlanPayload | null;
};

export type BuildParentAnalysisContextArgs = {
  conversationSnapshot: ConversationSnapshotLike | null;
  alignedAnalysis: AlignedAnalysisLike | null;
  lastAskedQuestion: string;
  answer: string;
  aiConversationState?: {
    followUpChain?: string[];
    turnId?: string | null;
    lastQuestion?: string;
  } | null;
};

export function buildParentAnalysisContext(
  args: BuildParentAnalysisContextArgs
): ParentAnalysisContext | null {
  const snap = args.conversationSnapshot;
  const analysis = args.alignedAnalysis;
  const priorQuestion =
    snap?.lastQuestion?.trim() ||
    args.aiConversationState?.lastQuestion?.trim() ||
    args.lastAskedQuestion.trim() ||
    null;
  if (!priorQuestion) return null;

  const rootQuestion =
    snap?.rootQuestion?.trim() ||
    snap?.followUpChain?.[0]?.trim() ||
    priorQuestion;

  const chain =
    snap?.followUpChain?.length
      ? [...snap.followUpChain]
      : args.aiConversationState?.followUpChain?.length
        ? [...args.aiConversationState.followUpChain]
        : [rootQuestion];

  return {
    rootQuestion,
    priorQuestion,
    metricColumn: analysis?.metricColumn ?? snap?.metricColumn ?? null,
    categoryColumn: analysis?.categoryColumn ?? snap?.categoryColumn ?? null,
    metricColumnDisplay: analysis?.metricColumnDisplay ?? null,
    categoryColumnDisplay: analysis?.categoryColumnDisplay ?? null,
    aggregation: analysis?.aggregation ?? snap?.aggregation ?? null,
    chartType: analysis?.chartType ?? snap?.chartType ?? null,
    chartTitle: analysis?.chartTitle ?? snap?.lastChartTitle ?? null,
    intentBucket: snap?.intentBucket ?? analysis?.routingPlan?.intent ?? null,
    routingIntent: analysis?.routingPlan?.intent ?? null,
    followUpChain: chain,
    lastAiAnswer:
      snap?.lastAiAnswer?.trim() ||
      args.answer.replace(/\s+/g, " ").trim().slice(0, 2800) ||
      analysis?.insightSummary?.trim() ||
      null,
    turnId: snap?.turnId ?? args.aiConversationState?.turnId ?? null,
    routingPlan: analysis?.routingPlan ?? null,
  };
}

export function shouldSendFollowUpContinuation(
  parent: ParentAnalysisContext | null,
  opts?: { fromFollowUpChip?: boolean; manualSubmit?: boolean }
): boolean {
  if (!parent?.priorQuestion?.trim()) return false;
  if (opts?.fromFollowUpChip) return true;
  if (opts?.manualSubmit) return true;
  return false;
}

/** Universal meta follow-ups after any answered insight (provenance / audit). */
export const THREAD_META_FOLLOW_UP_CHIPS = [
  "What evidence supports this conclusion?",
  "Which columns were used for this analysis?",
  "Show the calculations behind this answer.",
] as const;

export function appendThreadMetaFollowUpChips(chips: string[], max = 5): string[] {
  const seen = new Set(chips.map((c) => c.trim().toLowerCase()));
  const out = [...chips];
  for (const chip of THREAD_META_FOLLOW_UP_CHIPS) {
    const k = chip.toLowerCase();
    if (seen.has(k)) continue;
    out.push(chip);
    seen.add(k);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}
