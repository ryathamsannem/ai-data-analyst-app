import { describe, expect, it } from "vitest";
import {
  appendInsightSavedResult,
  buildInsightConversationThread,
  buildInsightRestorePayload,
  chartExistsInHistory,
  clearInsightResultHistory,
  createInsightSavedResult,
  findInsightSavedResultByQuestion,
  MAX_INSIGHT_SAVED_RESULTS,
  newInsightResultId,
  resolveLiveInsightAnswerText,
  resolveParentResultIdForFollowUp,
} from "@/lib/insight-result-history";

function sampleResult(
  overrides: Partial<ReturnType<typeof createInsightSavedResult>> = {}
) {
  return createInsightSavedResult(
    {
      question: "Which region has the highest total sales?",
      answer: "North leads with 35% of sales.",
      hasValidAIAnswer: true,
      alignedAnalysis: {
        metricColumn: "sales_amount",
        categoryColumn: "region",
        reasoningBlocks: [{ type: "contribution", claim: "North contributes 35%." }],
      },
      chartId: "chart-1",
      isFollowUp: false,
      parentResultId: null,
      lastAskVisualizationHydrated: true,
      turnId: "turn-1",
      ...overrides,
    },
    () => "result-1"
  );
}

describe("insight-result-history", () => {
  it("appendInsightSavedResult adds newest first and caps history", () => {
    let history = appendInsightSavedResult([], sampleResult({ question: "Q1" }));
    history = appendInsightSavedResult(
      history,
      createInsightSavedResult(
        {
          question: "Q2",
          answer: "A2",
          hasValidAIAnswer: true,
          alignedAnalysis: null,
          chartId: "chart-2",
          isFollowUp: true,
          parentResultId: "result-1",
          lastAskVisualizationHydrated: true,
        },
        () => "result-2"
      )
    );
    expect(history).toHaveLength(2);
    expect(history[0]?.question).toBe("Q2");
    expect(history[1]?.isFollowUp).toBe(false);
  });

  it("dedupes by turnId when saving again", () => {
    const first = sampleResult({ turnId: "turn-abc" });
    const updated = createInsightSavedResult(
      {
        question: first.question,
        answer: "Updated answer",
        hasValidAIAnswer: true,
        alignedAnalysis: first.alignedAnalysis,
        chartId: first.chartId,
        isFollowUp: false,
        parentResultId: null,
        lastAskVisualizationHydrated: true,
        turnId: "turn-abc",
      },
      () => "result-2"
    );
    const history = appendInsightSavedResult(
      appendInsightSavedResult([], first),
      updated
    );
    expect(history).toHaveLength(1);
    expect(history[0]?.answer).toBe("Updated answer");
  });

  it("buildInsightRestorePayload maps saved fields for UI restore", () => {
    const saved = sampleResult();
    const payload = buildInsightRestorePayload(saved);
    expect(payload.resultId).toBe("result-1");
    expect(payload.answer).toContain("North leads");
    expect(payload.chartId).toBe("chart-1");
    expect(payload.alignedAnalysis).toEqual(saved.alignedAnalysis);
  });

  it("resolveParentResultIdForFollowUp prefers active then last saved main", () => {
    const main = sampleResult();
    const follow = createInsightSavedResult(
      {
        question: "Why?",
        answer: "Because mix.",
        hasValidAIAnswer: true,
        alignedAnalysis: null,
        chartId: "chart-2",
        isFollowUp: true,
        parentResultId: "result-1",
        lastAskVisualizationHydrated: true,
      },
      () => "follow-1"
    );
    const history = [follow, main];
    expect(
      resolveParentResultIdForFollowUp(history, "result-1", "follow-1")
    ).toBe("result-1");
    expect(resolveParentResultIdForFollowUp(history, null, "follow-1")).toBe(
      "follow-1"
    );
    expect(resolveParentResultIdForFollowUp(history, null, null)).toBe(
      "result-1"
    );
  });

  it("clearInsightResultHistory returns empty list", () => {
    expect(clearInsightResultHistory()).toEqual([]);
  });

  it("chartExistsInHistory checks chart session ids", () => {
    expect(chartExistsInHistory([{ id: "a" }, { id: "b" }], "b")).toBe(true);
    expect(chartExistsInHistory([{ id: "a" }], "missing")).toBe(false);
  });

  it("respects MAX_INSIGHT_SAVED_RESULTS cap", () => {
    let history: ReturnType<typeof sampleResult>[] = [];
    for (let i = 0; i < MAX_INSIGHT_SAVED_RESULTS + 5; i++) {
      history = appendInsightSavedResult(
        history,
        createInsightSavedResult(
          {
            question: `Q${i}`,
            answer: `A${i}`,
            hasValidAIAnswer: true,
            alignedAnalysis: null,
            chartId: `c-${i}`,
            isFollowUp: false,
            parentResultId: null,
            lastAskVisualizationHydrated: true,
          },
          () => `id-${i}`
        )
      );
    }
    expect(history).toHaveLength(MAX_INSIGHT_SAVED_RESULTS);
  });

  it("newInsightResultId returns unique ids", () => {
    expect(newInsightResultId()).not.toBe(newInsightResultId());
  });

  it("buildInsightConversationThread walks parent chain to root", () => {
    const main = sampleResult({ question: "Spend by product type" });
    const follow = createInsightSavedResult(
      {
        question: "Why is Credit Card highest?",
        answer: "Because it leads spend.",
        hasValidAIAnswer: true,
        alignedAnalysis: null,
        chartId: "chart-1",
        isFollowUp: true,
        parentResultId: "result-1",
        lastAskVisualizationHydrated: true,
      },
      () => "result-2"
    );
    const history = [follow, main];
    expect(buildInsightConversationThread(history, "result-2")).toEqual([
      "Spend by product type",
      "Why is Credit Card highest?",
    ]);
  });

  it("findInsightSavedResultByQuestion prefers newest match", () => {
    const older = sampleResult({ question: "Same question?" });
    const newer = createInsightSavedResult(
      {
        question: "Same question?",
        answer: "Newer answer",
        hasValidAIAnswer: true,
        alignedAnalysis: null,
        chartId: "chart-2",
        isFollowUp: false,
        parentResultId: null,
        lastAskVisualizationHydrated: true,
        savedAt: 500,
      },
      () => "result-new"
    );
    const history = appendInsightSavedResult(
      appendInsightSavedResult([], { ...older, savedAt: 100 }),
      newer
    );
    expect(findInsightSavedResultByQuestion(history, "same question?")?.answer).toBe(
      "Newer answer"
    );
  });

  it("prefers active saved result answer for the matching question", () => {
    const root = sampleResult({
      question: "Spend Amount by Product Type",
      answer: "Credit Card leads by Product Type.",
    });
    const followUp = createInsightSavedResult(
      {
        question: "Why is Credit Card highest?",
        answer: "Premium and SME customer segments drive spend.",
        hasValidAIAnswer: true,
        alignedAnalysis: null,
        chartId: "chart-1",
        isFollowUp: true,
        parentResultId: "result-1",
        lastAskVisualizationHydrated: true,
      },
      () => "result-2"
    );
    const history = appendInsightSavedResult(
      appendInsightSavedResult([], root),
      followUp
    );
    expect(
      resolveLiveInsightAnswerText({
        question: "Spend Amount by Product Type",
        lastAskedQuestion: "Spend Amount by Product Type",
        liveAnswer: "Premium and SME customer segments drive spend.",
        activeResultId: "result-1",
        history,
      })
    ).toBe("Credit Card leads by Product Type.");
  });
});

describe("suggested vs restore behavior contract", () => {
  it("restore payload does not include ask/network fields", () => {
    const payload = buildInsightRestorePayload(sampleResult());
    expect(payload).not.toHaveProperty("conversationSnapshot");
    expect(payload).not.toHaveProperty("conversationMeta");
    expect(Object.keys(payload).sort()).toEqual(
      [
        "alignedAnalysis",
        "answer",
        "chartId",
        "hasValidAIAnswer",
        "lastAskVisualizationHydrated",
        "question",
        "resultId",
      ].sort()
    );
  });
});
