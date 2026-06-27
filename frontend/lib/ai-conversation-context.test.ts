import { describe, expect, it } from "vitest";
import {
  appendThreadMetaFollowUpChips,
  buildAskContinuationPayload,
  buildParentAnalysisContext,
  CHART_ENTRY_ASK_OPTS,
  shouldSendFollowUpContinuation,
  THREAD_META_FOLLOW_UP_CHIPS,
} from "@/lib/ai-conversation-context";

describe("buildParentAnalysisContext", () => {
  it("includes prior metric, dimension, and chain from snapshot", () => {
    const parent = buildParentAnalysisContext({
      conversationSnapshot: {
        lastQuestion: "Which city contributes most revenue?",
        rootQuestion: "Which city contributes most revenue?",
        metricColumn: "revenue",
        categoryColumn: "city",
        followUpChain: ["Which city contributes most revenue?"],
        lastAiAnswer: "Mumbai leads.",
      },
      alignedAnalysis: {
        metricColumn: "revenue",
        categoryColumn: "city",
        metricColumnDisplay: "Revenue",
        categoryColumnDisplay: "City",
        routingPlan: { intent: "ranking" },
      },
      lastAskedQuestion: "Which city contributes most revenue?",
      answer: "Mumbai leads.",
    });
    expect(parent?.metricColumn).toBe("revenue");
    expect(parent?.categoryColumn).toBe("city");
    expect(parent?.followUpChain).toEqual([
      "Which city contributes most revenue?",
    ]);
    expect(parent?.routingIntent).toBe("ranking");
  });

  it("includes reasoningBlocks from aligned analysis when present", () => {
    const parent = buildParentAnalysisContext({
      conversationSnapshot: {
        lastQuestion: "Which region has the highest total sales?",
        followUpChain: ["Which region has the highest total sales?"],
      },
      alignedAnalysis: {
        metricColumn: "sales_amount",
        categoryColumn: "region",
        reasoningBlocks: [
          {
            type: "contribution",
            claim: "North contributes 35% of total sales amount.",
            evidence: { share_pct: 35 },
          },
        ],
      },
      lastAskedQuestion: "Which region has the highest total sales?",
      answer: "North leads.",
    });
    expect(parent?.reasoningBlocks).toHaveLength(1);
    expect(parent?.reasoningBlocks?.[0]?.claim).toContain("North");
  });
});

describe("shouldSendFollowUpContinuation", () => {
  const parent = buildParentAnalysisContext({
    conversationSnapshot: {
      lastQuestion: "Which city contributes most revenue?",
      metricColumn: "revenue",
      categoryColumn: "city",
    },
    alignedAnalysis: null,
    lastAskedQuestion: "Which city contributes most revenue?",
    answer: "Mumbai leads.",
  });

  it("returns true for follow-up chip clicks", () => {
    expect(
      shouldSendFollowUpContinuation(parent, { fromFollowUpChip: true })
    ).toBe(true);
  });

  it("returns true for manual submit when prior analysis exists", () => {
    expect(
      shouldSendFollowUpContinuation(parent, { manualSubmit: true })
    ).toBe(true);
  });

  it("returns false for chart-entry fresh root even with prior analysis", () => {
    expect(shouldSendFollowUpContinuation(parent, CHART_ENTRY_ASK_OPTS)).toBe(
      false
    );
    expect(
      shouldSendFollowUpContinuation(parent, {
        mode: "fresh_root_from_suggestion",
      })
    ).toBe(false);
    expect(
      shouldSendFollowUpContinuation(parent, {
        manualSubmit: true,
        freshRoot: true,
      })
    ).toBe(false);
    expect(
      shouldSendFollowUpContinuation(parent, {
        fromFollowUpChip: true,
        freshRoot: true,
      })
    ).toBe(false);
  });
});

describe("buildAskContinuationPayload", () => {
  const baseArgs = {
    conversationSnapshot: {
      lastQuestion: "How does growth rate trend over order date?",
      metricColumn: "growth_rate",
      categoryColumn: "order_date",
    },
    alignedAnalysis: {
      metricColumn: "growth_rate",
      categoryColumn: "order_date",
      routingPlan: { intent: "trend" },
    },
    lastAskedQuestion: "How does growth rate trend over order date?",
    answer: "Growth accelerates in Q4.",
    hasValidAIAnswer: true,
    aiConversationState: {
      lastQuestion: "How does growth rate trend over order date?",
      followUpChain: ["How does growth rate trend over order date?"],
    },
  };

  it("sends no parent context for fresh_root_from_suggestion", () => {
    const payload = buildAskContinuationPayload({
      ...baseArgs,
      opts: { mode: "fresh_root_from_suggestion" },
    });
    expect(payload.continuationIntent).toBe(false);
    expect(payload.parentAnalysisContext).toBeNull();
  });

  it("sends parent context for scoped follow-up chips", () => {
    const payload = buildAskContinuationPayload({
      ...baseArgs,
      opts: { mode: "scoped_follow_up", fromFollowUpChip: true },
    });
    expect(payload.continuationIntent).toBe(true);
    expect(payload.parentAnalysisContext?.priorQuestion).toContain(
      "growth rate"
    );
  });
});

describe("chart entry ASK AI regression", () => {
  const chartAContext = buildParentAnalysisContext({
    conversationSnapshot: {
      lastQuestion: "Summarize what the chart \"Revenue by Region\" shows…",
      rootQuestion: "Summarize what the chart \"Revenue by Region\" shows…",
      metricColumn: "revenue",
      categoryColumn: "region",
      followUpChain: [
        "Summarize what the chart \"Revenue by Region\" shows…",
      ],
      lastAiAnswer: "West leads revenue.",
    },
    alignedAnalysis: {
      metricColumn: "revenue",
      categoryColumn: "region",
      chartTitle: "Revenue by Region",
    },
    lastAskedQuestion: "Summarize what the chart \"Revenue by Region\" shows…",
    answer: "West leads revenue.",
  });

  it("first dashboard chart ASK AI starts a fresh root (no continuation)", () => {
    expect(
      shouldSendFollowUpContinuation(chartAContext, CHART_ENTRY_ASK_OPTS)
    ).toBe(false);
  });

  it("second dashboard chart ASK AI does not inherit chart A follow-up chain", () => {
    const chartBQuestion =
      "Summarize what the chart \"Profit by Category\" shows and the sharpest takeaway for this dataset.";
    expect(chartBQuestion).not.toBe(chartAContext?.priorQuestion);
    expect(
      shouldSendFollowUpContinuation(chartAContext, {
        ...CHART_ENTRY_ASK_OPTS,
        manualSubmit: true,
      })
    ).toBe(false);
  });

  it("charts tab / KPI chart entry uses the same fresh-root contract", () => {
    expect(CHART_ENTRY_ASK_OPTS).toEqual({
      mode: "fresh_root_chart_entry",
      freshRoot: true,
    });
    expect(
      shouldSendFollowUpContinuation(chartAContext, CHART_ENTRY_ASK_OPTS)
    ).toBe(false);
  });

  it("follow-up chip inside AI Insights still continues the thread", () => {
    expect(
      shouldSendFollowUpContinuation(chartAContext, {
        fromFollowUpChip: true,
      })
    ).toBe(true);
  });

  it("manual submit inside AI Insights still continues when not fresh root", () => {
    expect(
      shouldSendFollowUpContinuation(chartAContext, { manualSubmit: true })
    ).toBe(true);
  });
});

describe("appendThreadMetaFollowUpChips", () => {
  it("adds audit/meta follow-ups", () => {
    const chips = appendThreadMetaFollowUpChips(["Why is Mumbai highest?"], 5);
    expect(chips.some((c) => THREAD_META_FOLLOW_UP_CHIPS.includes(c as (typeof THREAD_META_FOLLOW_UP_CHIPS)[number]))).toBe(
      true
    );
  });
});
