import { describe, expect, it } from "vitest";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import {
  findChartIdForExportQuestion,
  resolvePdfExportContext,
} from "@/lib/resolve-pdf-export-context";

const rankingSnap: ChartSnapshot = {
  id: "rank-1",
  source: "ai",
  createdAt: 1,
  title: "Revenue by City",
  subtitle: "",
  chartKind: "bar",
  chartData: [{ name: "Ahmedabad", value: 100 }],
  visualization: null,
  question: "Which city generates the highest revenue?",
};

const scatterSnap: ChartSnapshot = {
  id: "scatter-1",
  source: "ai",
  createdAt: 2,
  title: "Revenue vs Profit",
  subtitle: "",
  chartKind: "scatter",
  chartData: [
    { name: "a", value: 1, x: 1, y: 2 },
    { name: "b", value: 2, x: 2, y: 3 },
  ],
  visualization: null,
};

const baseInput = () => ({
  options: {
    includeKPIs: true,
    includeAIInsight: true,
    includeChart: true,
    includeDataPreview: false,
    includeDataQuality: false,
  },
  chartHistory: [rankingSnap, scatterSnap],
  aiAnswerByChartId: {
    "rank-1": {
      answer: "Ahmedabad leads revenue.",
      lastAskedQuestion: "Which city generates the highest revenue?",
      hasValidAIAnswer: true,
      alignedAnalysis: { metricColumn: "revenue", categoryColumn: "city" },
      savedAt: 100,
    },
  },
  insightChartId: "rank-1",
  pinnedInsightChartId: "rank-1",
  activeChartId: "scatter-1",
  lastAskedQuestion: "Which city generates the highest revenue?",
  question: "Which city generates the highest revenue?",
  liveAnswer: "Ahmedabad leads revenue.",
  liveAlignedAnalysis: { metricColumn: "revenue", categoryColumn: "city" },
  insightChartMatchesCurrentQuestion: true,
  insightChartDataLength: 1,
});

describe("resolvePdfExportContext", () => {
  it("forces insight scope when AI insight + chart and stored bundle exists", () => {
    const ctx = resolvePdfExportContext(baseInput());
    expect(ctx.chartScope).toBe("insight");
    expect(ctx.chartId).toBe("rank-1");
    expect(ctx.snapshot?.title).toBe("Revenue by City");
    expect(ctx.insightAnswer).toContain("Ahmedabad");
  });

  it("uses ranking chart even when Charts tab selected scatter", () => {
    const ctx = resolvePdfExportContext({
      ...baseInput(),
      insightChartId: "scatter-1",
      pinnedInsightChartId: "scatter-1",
      insightChartMatchesCurrentQuestion: false,
      insightChartDataLength: 2,
    });
    expect(ctx.chartScope).toBe("insight");
    expect(ctx.chartId).toBe("rank-1");
    expect(ctx.snapshot?.chartKind).toBe("bar");
  });

  it("uses session chart for chart-only export", () => {
    const ctx = resolvePdfExportContext({
      ...baseInput(),
      options: {
        ...baseInput().options,
        includeAIInsight: false,
      },
    });
    expect(ctx.chartScope).toBe("session");
    expect(ctx.chartId).toBe("scatter-1");
    expect(ctx.snapshot?.title).toBe("Revenue vs Profit");
  });

  it("does not leak unrelated live answer into session export", () => {
    const ctx = resolvePdfExportContext({
      ...baseInput(),
      options: {
        ...baseInput().options,
        chartScope: "session",
      },
      insightChartMatchesCurrentQuestion: false,
    });
    expect(ctx.chartScope).toBe("session");
    expect(ctx.insightAnswer).toBe("");
    expect(ctx.lastAskedQuestion).toBe("");
  });

  it("finds chart id by normalized question", () => {
    const id = findChartIdForExportQuestion(
      baseInput().aiAnswerByChartId,
      "  Which   city generates the highest revenue? "
    );
    expect(id).toBe("rank-1");
  });

  it("exports follow-up saved result instead of stale root chart bundle", () => {
    const rootQuestion = "Spend Amount by Product Type";
    const followUpQuestion = "Why is Credit Card highest?";
    const store = {
      "product-chart": {
        answer: "Credit Card leads product-type spend.",
        lastAskedQuestion: rootQuestion,
        hasValidAIAnswer: true,
        alignedAnalysis: {
          metricColumn: "spend_amount",
          categoryColumn: "product_type",
          insightSummary: "Root summary about product types.",
        },
        savedAt: 100,
      },
    };
    const history = [
      {
        id: "result-root",
        turnId: "t1",
        question: rootQuestion,
        answer: "Credit Card leads product-type spend.",
        hasValidAIAnswer: true,
        alignedAnalysis: store["product-chart"].alignedAnalysis,
        chartId: "product-chart",
        isFollowUp: false,
        parentResultId: null,
        lastAskVisualizationHydrated: true,
        savedAt: 100,
      },
      {
        id: "result-follow",
        turnId: "t2",
        question: followUpQuestion,
        answer:
          "Credit Card is highest because it accounts for the largest share of spend in this cohort.",
        hasValidAIAnswer: true,
        alignedAnalysis: {
          metricColumn: "spend_amount",
          categoryColumn: "product_type",
          insightSummary: "Credit Card dominates spend among product types.",
        },
        chartId: "product-chart",
        isFollowUp: true,
        parentResultId: "result-root",
        lastAskVisualizationHydrated: true,
        savedAt: 200,
      },
    ];
    const snap = {
      ...rankingSnap,
      id: "product-chart",
      title: "Spend Amount by Product Type",
      question: rootQuestion,
    };
    const ctx = resolvePdfExportContext({
      ...baseInput(),
      chartHistory: [snap],
      aiAnswerByChartId: store,
      insightChartId: "product-chart",
      pinnedInsightChartId: "product-chart",
      lastAskedQuestion: followUpQuestion,
      question: followUpQuestion,
      liveAnswer: history[1]!.answer,
      liveAlignedAnalysis: history[1]!.alignedAnalysis,
      insightChartMatchesCurrentQuestion: true,
      insightChartDataLength: 5,
      insightResultHistory: history,
      exportInsightResultId: "result-follow",
    });
    expect(ctx.chartScope).toBe("insight");
    expect(ctx.chartId).toBe("product-chart");
    expect(ctx.lastAskedQuestion).toBe(followUpQuestion);
    expect(ctx.insightAnswer).toContain("Credit Card is highest");
    expect(ctx.insightAnswer).not.toContain("Root summary");
  });

  it("root answer export still uses root question when explicitly selected", () => {
    const rootQuestion = "Spend Amount by Product Type";
    const followUpQuestion = "Why is Credit Card highest?";
    const store = {
      "product-chart": {
        answer: "Follow-up narrative",
        lastAskedQuestion: followUpQuestion,
        hasValidAIAnswer: true,
        alignedAnalysis: { metricColumn: "spend_amount" },
        savedAt: 200,
      },
    };
    const history = [
      {
        id: "result-root",
        question: rootQuestion,
        answer: "Product-type ranking narrative.",
        hasValidAIAnswer: true,
        alignedAnalysis: { metricColumn: "spend_amount" },
        chartId: "product-chart",
        isFollowUp: false,
        parentResultId: null,
        lastAskVisualizationHydrated: true,
        savedAt: 100,
      },
      {
        id: "result-follow",
        question: followUpQuestion,
        answer: "Follow-up narrative",
        hasValidAIAnswer: true,
        alignedAnalysis: { metricColumn: "spend_amount" },
        chartId: "product-chart",
        isFollowUp: true,
        parentResultId: "result-root",
        lastAskVisualizationHydrated: true,
        savedAt: 200,
      },
    ];
    const ctx = resolvePdfExportContext({
      ...baseInput(),
      chartHistory: [
        {
          ...rankingSnap,
          id: "product-chart",
          title: rootQuestion,
          question: rootQuestion,
        },
      ],
      aiAnswerByChartId: store,
      insightChartId: "product-chart",
      pinnedInsightChartId: "product-chart",
      lastAskedQuestion: rootQuestion,
      question: rootQuestion,
      liveAnswer: history[0]!.answer,
      liveAlignedAnalysis: history[0]!.alignedAnalysis,
      insightChartMatchesCurrentQuestion: true,
      insightChartDataLength: 5,
      insightResultHistory: history,
      exportInsightResultId: "result-root",
    });
    expect(ctx.lastAskedQuestion).toBe(rootQuestion);
    expect(ctx.insightAnswer).toContain("Product-type ranking");
  });
});
