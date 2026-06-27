import { describe, expect, it } from "vitest";
import {
  parseRecommendedActions,
  visibleRecommendedActions,
} from "@/lib/recommended-actions";

describe("parseRecommendedActions", () => {
  it("parses valid actions and caps at 3", () => {
    const raw = [
      {
        type: "drilldown",
        title: "Break down North by product category",
        description: "Compare mix within North.",
        question: "Compare North by product category.",
        priority: "high",
        reason: "Top share exceeds 30%.",
        basedOn: ["North contributes 35% of total sales."],
      },
      {
        type: "validation",
        title: "Validate concentration",
        description: "Top 3 groups dominate totals.",
        question: null,
        priority: "medium",
        reason: "Top-3 concentration exceeds 70%.",
        basedOn: [],
      },
      {
        type: "risk_check",
        title: "Third",
        description: "Third action.",
        priority: "low",
        reason: "r",
        basedOn: [],
      },
      {
        type: "comparison",
        title: "Fourth should drop",
        description: "Too many.",
        priority: "low",
        reason: "r",
        basedOn: [],
      },
    ];
    const parsed = parseRecommendedActions(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.title).toContain("North");
    expect(parsed[0]?.question).toContain("product category");
  });

  it("returns empty for invalid payloads", () => {
    expect(parseRecommendedActions(null)).toEqual([]);
    expect(parseRecommendedActions([{ title: "x" }])).toEqual([]);
  });

  it("visibleRecommendedActions returns max 3", () => {
    const actions = parseRecommendedActions([
      {
        type: "drilldown",
        title: "A",
        description: "a",
        priority: "high",
        reason: "r",
        basedOn: [],
      },
      {
        type: "drilldown",
        title: "B",
        description: "b",
        priority: "high",
        reason: "r",
        basedOn: [],
      },
      {
        type: "drilldown",
        title: "C",
        description: "c",
        priority: "high",
        reason: "r",
        basedOn: [],
      },
    ]);
    expect(visibleRecommendedActions(actions)).toHaveLength(3);
  });
});
