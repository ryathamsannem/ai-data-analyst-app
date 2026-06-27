/**
 * Durable AI Insights conversation / follow-up context for `/ask` payloads.
 */

import type { RoutingPlanPayload } from "@/lib/routing-plan";
import type { ReasoningBlock } from "@/lib/reasoning-blocks";

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
  reasoningBlocks?: ReasoningBlock[];
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
  reasoningBlocks?: ReasoningBlock[];
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

export type AskAiMode =
  | "default"
  | "scoped_follow_up"
  | "fresh_root_chart_entry"
  | "fresh_root_from_suggestion";

export type AskAiContinuationOpts = {
  mode?: AskAiMode;
  fromFollowUpChip?: boolean;
  manualSubmit?: boolean;
  /** Chart entry (Overview / Charts / KPI) — always a new root analysis, never a follow-up. */
  freshRoot?: boolean;
};

export function resolveAskAiMode(opts?: AskAiContinuationOpts): AskAiMode {
  if (opts?.mode) return opts.mode;
  if (opts?.freshRoot) return "fresh_root_chart_entry";
  if (opts?.fromFollowUpChip) return "scoped_follow_up";
  return "default";
}

export function isFreshRootAskMode(opts?: AskAiContinuationOpts): boolean {
  const mode = resolveAskAiMode(opts);
  return (
    mode === "fresh_root_chart_entry" || mode === "fresh_root_from_suggestion"
  );
}

export function isFreshRootFromSuggestionMode(
  opts?: AskAiContinuationOpts
): boolean {
  return resolveAskAiMode(opts) === "fresh_root_from_suggestion";
}

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
    reasoningBlocks: analysis?.reasoningBlocks?.length
      ? [...analysis.reasoningBlocks]
      : undefined,
  };
}

export function shouldSendFollowUpContinuation(
  parent: ParentAnalysisContext | null,
  opts?: AskAiContinuationOpts
): boolean {
  if (isFreshRootAskMode(opts)) return false;
  if (!parent?.priorQuestion?.trim()) return false;
  if (resolveAskAiMode(opts) === "scoped_follow_up") return true;
  if (opts?.fromFollowUpChip) return true;
  if (opts?.manualSubmit) return true;
  return false;
}

/** Options for ASK AI launched from a chart tile (not from in-thread follow-up). */
export const CHART_ENTRY_ASK_OPTS: AskAiContinuationOpts = {
  mode: "fresh_root_chart_entry",
  freshRoot: true,
};

export type BuildAskContinuationPayloadArgs = BuildParentAnalysisContextArgs & {
  opts?: AskAiContinuationOpts;
  hasValidAIAnswer?: boolean;
  aiConversationState?: {
    followUpChain?: string[];
    turnId?: string | null;
    lastQuestion?: string;
  } | null;
};

/** Pure helper — mirrors `/ask` continuation fields for tests and askAI. */
export function buildAskContinuationPayload(
  args: BuildAskContinuationPayloadArgs
): {
  continuationIntent: boolean;
  parentAnalysisContext: ParentAnalysisContext | null;
} {
  const opts = args.opts;
  const freshRoot = isFreshRootAskMode(opts);
  const parentAnalysisContext = freshRoot
    ? null
    : buildParentAnalysisContext(args);
  const continuationIntent = shouldSendFollowUpContinuation(
    parentAnalysisContext,
    {
      ...opts,
      freshRoot,
      manualSubmit: freshRoot
        ? false
        : Boolean(
            opts?.manualSubmit ??
              (parentAnalysisContext?.priorQuestion?.trim() &&
                (args.conversationSnapshot?.lastQuestion?.trim() ||
                  args.aiConversationState?.lastQuestion?.trim() ||
                  args.hasValidAIAnswer))
          ),
    }
  );
  return { continuationIntent, parentAnalysisContext };
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
