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
});
