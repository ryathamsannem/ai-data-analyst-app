import { describe, expect, it } from "vitest";
import {
  appendThreadMetaFollowUpChips,
  buildParentAnalysisContext,
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
});

describe("appendThreadMetaFollowUpChips", () => {
  it("adds audit/meta follow-ups", () => {
    const chips = appendThreadMetaFollowUpChips(["Why is Mumbai highest?"], 5);
    expect(chips.some((c) => THREAD_META_FOLLOW_UP_CHIPS.includes(c as (typeof THREAD_META_FOLLOW_UP_CHIPS)[number]))).toBe(
      true
    );
  });
});
