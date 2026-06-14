import { describe, expect, it } from "vitest";
import type { ParentAnalysisContext } from "@/lib/ai-conversation-context";
import {
  chipIntroducesNewAnalysisScope,
  isNewRootAnalyticalChip,
  isScopedFollowUpChip,
  resolveSuggestedChipAskOpts,
  shouldStartFreshRootFromSuggestedChip,
} from "@/lib/suggested-follow-up-continuation";

const growthTrendParent: ParentAnalysisContext = {
  rootQuestion: "How does growth rate trend over order date?",
  priorQuestion: "How does growth rate trend over order date?",
  metricColumn: "growth_rate",
  categoryColumn: "order_date",
  metricColumnDisplay: "Growth Rate",
  categoryColumnDisplay: "Order Date",
  aggregation: "mean",
  chartType: "line",
  chartTitle: "Growth Rate Trend",
  intentBucket: "trend",
  routingIntent: "trend",
  followUpChain: ["How does growth rate trend over order date?"],
  lastAiAnswer: "Growth rate rises in Q4.",
  turnId: "t1",
  routingPlan: null,
};

describe("isScopedFollowUpChip", () => {
  it("treats explain / audit chips as scoped follow-ups", () => {
    expect(isScopedFollowUpChip("Why is the highest value so large?")).toBe(true);
    expect(
      isScopedFollowUpChip("Which columns were used for this analysis?")
    ).toBe(true);
    expect(isScopedFollowUpChip("Show bottom three")).toBe(true);
    expect(isScopedFollowUpChip("Sort descending")).toBe(true);
  });
});

describe("isNewRootAnalyticalChip", () => {
  it("treats compare / trend / relationship chips as new analysis", () => {
    expect(
      isNewRootAnalyticalChip("Compare revenue and profit across order dates")
    ).toBe(true);
    expect(isNewRootAnalyticalChip("What is the correlation between revenue and profit?")).toBe(
      true
    );
    expect(isNewRootAnalyticalChip("How does revenue trend over time?")).toBe(true);
  });
});

describe("shouldStartFreshRootFromSuggestedChip", () => {
  it("starts fresh root when compare chip shifts metrics from growth rate trend", () => {
    const chip = "Compare revenue and profit across order dates";
    expect(isNewRootAnalyticalChip(chip)).toBe(true);
    expect(shouldStartFreshRootFromSuggestedChip(chip, growthTrendParent)).toBe(
      true
    );
    expect(resolveSuggestedChipAskOpts(chip, growthTrendParent)).toEqual({
      mode: "fresh_root_from_suggestion",
    });
  });

  it("keeps scoped drill-down chips on the same thread", () => {
    const chip = "Why is the highest value so large?";
    expect(shouldStartFreshRootFromSuggestedChip(chip, growthTrendParent)).toBe(
      false
    );
    expect(resolveSuggestedChipAskOpts(chip, growthTrendParent)).toEqual({
      mode: "scoped_follow_up",
      fromFollowUpChip: true,
    });
  });

  it("treats revenue by region → why west highest as follow-up", () => {
    const parent: ParentAnalysisContext = {
      ...growthTrendParent,
      rootQuestion: "Revenue by region",
      priorQuestion: "Revenue by region",
      metricColumn: "revenue",
      categoryColumn: "region",
      routingIntent: "ranking",
      intentBucket: "ranking",
    };
    const chip = "Why is West highest?";
    expect(shouldStartFreshRootFromSuggestedChip(chip, parent)).toBe(false);
    expect(resolveSuggestedChipAskOpts(chip, parent).mode).toBe("scoped_follow_up");
  });

  it("treats orders by city → compare revenue profit as fresh root", () => {
    const parent: ParentAnalysisContext = {
      ...growthTrendParent,
      rootQuestion: "Orders by city",
      priorQuestion: "Orders by city",
      metricColumn: "orders",
      categoryColumn: "city",
      routingIntent: "ranking",
      intentBucket: "ranking",
    };
    const chip = "Compare revenue and profit across cities";
    expect(shouldStartFreshRootFromSuggestedChip(chip, parent)).toBe(true);
    expect(resolveSuggestedChipAskOpts(chip, parent).mode).toBe(
      "fresh_root_from_suggestion"
    );
  });

  it("detects intent shift from trend to compare", () => {
    expect(
      chipIntroducesNewAnalysisScope(
        "Compare revenue and profit across order dates",
        growthTrendParent
      )
    ).toBe(true);
  });
});
