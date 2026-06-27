import { describe, expect, it } from "vitest";
import {
  chartPresentationConflictsWithAnalysis,
  chartSnapshotMatchesAnalysis,
  shouldPreservePinnedInsightChart,
} from "@/lib/insight-chart-alignment";

describe("insight-chart-alignment", () => {
  const trendSnap = {
    contract: { mode: "trend" as const, isTimeSeries: true },
    visualization: {
      provenance: {
        numericColumn: "sales_amount",
        categoryColumn: "order_date",
      },
    },
    question: "Show weekly sales trend",
  };

  const rankingAnalysis = {
    metricColumn: "sales_amount",
    categoryColumn: "region",
    chartTypeInternal: "bar_horizontal",
    routingPlan: { intent: "ranking" },
  };

  it("detects trend snapshot vs region ranking analysis conflict", () => {
    expect(
      chartPresentationConflictsWithAnalysis(trendSnap, rankingAnalysis)
    ).toBe(true);
    expect(
      chartSnapshotMatchesAnalysis(trendSnap, rankingAnalysis)
    ).toBe(false);
  });

  it("does not preserve pinned trend chart for misaligned follow-ups", () => {
    expect(
      shouldPreservePinnedInsightChart({
        pinned: trendSnap,
        question: "Which region has the highest total sales?",
        parsed: rankingAnalysis,
        followUpDetected: true,
      })
    ).toBe(false);
  });

  it("preserves pinned trend chart when analysis still matches trend", () => {
    const trendAnalysis = {
      metricColumn: "sales_amount",
      categoryColumn: "order_date",
      chartTypeInternal: "line",
      routingPlan: { intent: "trend" },
    };
    expect(
      shouldPreservePinnedInsightChart({
        pinned: trendSnap,
        question: "Break that down by product category",
        parsed: trendAnalysis,
        followUpDetected: true,
      })
    ).toBe(true);
  });
});
