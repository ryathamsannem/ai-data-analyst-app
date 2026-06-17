import { describe, expect, it } from "vitest";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import {
  buildExportTabVisualizationPreview,
  exportTabAiAnswerAvailable,
} from "@/lib/export-tab-preview";
import type { ResolvedPdfExportContext } from "@/lib/resolve-pdf-export-context";

const regionSnap: ChartSnapshot = {
  id: "region-1",
  source: "ai",
  createdAt: 1,
  title: "Revenue by Region",
  subtitle: "Generated from AI analysis",
  chartKind: "bar",
  chartData: [
    { name: "West", value: 100 },
    { name: "East", value: 50 },
    { name: "North", value: 40 },
    { name: "South", value: 30 },
  ],
  visualization: {
    chartType: "bar",
    title: "Revenue by Region",
    labels: ["West", "East", "North", "South"],
    provenance: {
      numericColumn: "revenue",
      numericColumnDisplay: "revenue",
      categoryColumn: "region",
      categoryColumnDisplay: "region",
      aggregation: "sum",
    },
  },
};

const scatterSnap: ChartSnapshot = {
  id: "scatter-1",
  source: "auto_dashboard",
  createdAt: 2,
  title: "Revenue vs Profit",
  subtitle: "Auto dashboard",
  chartKind: "scatter",
  chartData: Array.from({ length: 36 }, (_, i) => ({
    name: String(i),
    value: i,
    x: i,
    y: i * 2,
  })),
  visualization: {
    chartType: "scatter",
    title: "Revenue vs Profit",
    labels: [],
  },
};

const insightCtx = (
  snapshot: ChartSnapshot | null,
  insightAnswer = "West leads."
): ResolvedPdfExportContext => ({
  chartScope: "insight",
  chartId: snapshot?.id ?? null,
  snapshot,
  insightAnswer,
  alignedAnalysis: null,
  lastAskedQuestion: "Which region has the highest revenue?",
});

describe("buildExportTabVisualizationPreview", () => {
  it("uses resolved insight snapshot, not session scatter", () => {
    const preview = buildExportTabVisualizationPreview(insightCtx(regionSnap), {
      includeChart: true,
    });
    expect(preview.available).toBe(true);
    expect(preview.chartTitle).toBe("Revenue by Region");
    expect(preview.chartType).toBe("bar");
    expect(preview.summaryLabel).toContain("Revenue by Region");
    expect(preview.summaryLabel).not.toContain("scatter");
    expect(preview.summaryLabel).toContain("revenue");
    expect(preview.summaryLabel).toContain("region");
  });

  it("uses session snapshot for chart-only export", () => {
    const preview = buildExportTabVisualizationPreview(
      {
        chartScope: "session",
        chartId: scatterSnap.id,
        snapshot: scatterSnap,
        insightAnswer: "",
        alignedAnalysis: null,
        lastAskedQuestion: "",
      },
      { includeChart: true }
    );
    expect(preview.chartTitle).toBe("Revenue vs Profit");
    expect(preview.chartType).toBe("scatter");
    expect(preview.summaryLabel).toContain("scatter");
  });

  it("reports unavailable when resolved snapshot has no rows", () => {
    const preview = buildExportTabVisualizationPreview(
      insightCtx({ ...regionSnap, chartData: [] }),
      { includeChart: true }
    );
    expect(preview.available).toBe(false);
    expect(preview.summaryLabel).toBe("Not in session yet");
  });
});

describe("exportTabAiAnswerAvailable", () => {
  it("uses stored insight answer when AI insight section is included", () => {
    expect(
      exportTabAiAnswerAvailable(insightCtx(regionSnap, "Stored answer."), {
        includeAIInsight: true,
      }, "")
    ).toBe(true);
    expect(
      exportTabAiAnswerAvailable(insightCtx(regionSnap, ""), {
        includeAIInsight: true,
      }, "")
    ).toBe(false);
  });
});
