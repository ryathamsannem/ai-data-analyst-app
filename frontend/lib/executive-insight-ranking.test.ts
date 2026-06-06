import { describe, expect, it } from "vitest";
import { rankedInsightsToExecutiveCards } from "@/lib/executive-insight-ranking";

describe("rankedInsightsToExecutiveCards", () => {
  it("preserves backend lens-specific titles instead of collapsing risk cards", () => {
    const cards = rankedInsightsToExecutiveCards(
      [
        {
          kind: "concentration",
          title: "Revenue concentration",
          value: "42%",
          priority: 92,
        },
        {
          kind: "risk",
          title: "Growth Risk",
          value: "East",
          priority: 80,
        },
        {
          kind: "risk",
          title: "Margin Risk",
          value: "West",
          priority: 74,
        },
        {
          kind: "risk",
          title: "Underperformer",
          value: "South",
          priority: 68,
        },
      ],
      { metricColumn: "revenue", metricColumnDisplay: "Revenue" },
      "Region"
    );

    expect(cards.map((c) => c.title)).toEqual([
      "Revenue concentration",
      "Growth Risk",
      "Margin Risk",
      "Underperformer",
    ]);
    expect(new Set(cards.map((c) => c.title)).size).toBe(4);
  });
});
