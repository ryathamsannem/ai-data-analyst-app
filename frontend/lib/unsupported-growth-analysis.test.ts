import { describe, expect, it } from "vitest";
import {
  isStaticGrowthMetricComparison,
  resolveUnsupportedGrowthMode,
} from "@/lib/unsupported-growth-analysis";

describe("unsupported growth — static growth_rate column compare", () => {
  it("does not suppress bar chart when comparing growth_rate across categories", () => {
    const question = "Compare growth rate across regions";
    expect(
      isStaticGrowthMetricComparison({
        question,
        metricColumn: "growth_rate",
        chartSeriesPointCount: 4,
      })
    ).toBe(true);

    const mode = resolveUnsupportedGrowthMode({
      question,
      unsupportedGrowthAnalysis: {
        active: true,
        periodsAvailable: 1,
        status: "Insufficient Time-Series Data",
        leadSentence: "Growth cannot be determined",
        recommendedAction: "Add periods",
      },
      isTrendChart: false,
      chartTypeInternal: "bar",
      metricColumn: "growth_rate",
      chartSeriesPointCount: 4,
      answerText:
        "Growth metric detected, but period/methodology is unknown — directional only.",
    });
    expect(mode).toBeNull();
  });
});
