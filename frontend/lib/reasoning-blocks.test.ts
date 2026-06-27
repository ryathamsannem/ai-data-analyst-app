import { describe, expect, it } from "vitest";
import { parseReasoningBlocks } from "./reasoning-blocks";

describe("parseReasoningBlocks", () => {
  it("returns empty for non-array input", () => {
    expect(parseReasoningBlocks(null)).toEqual([]);
    expect(parseReasoningBlocks({})).toEqual([]);
  });

  it("parses valid blocks and skips invalid rows", () => {
    const blocks = parseReasoningBlocks([
      {
        type: "contribution",
        claim: "North contributes 35% of total sales.",
        metric: "Sales",
        dimension: "Region",
        entity: "North",
        value: 3500,
        comparisonValue: 10000,
        sharePct: 35,
        gapRatio: null,
        cohortN: 120,
        confidence: "high",
        reason: "Top region share from chart series.",
      },
      { claim: "" },
      null,
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("contribution");
    expect(blocks[0]?.confidence).toBe("high");
    expect(blocks[0]?.sharePct).toBe(35);
  });

  it("defaults unknown type and confidence", () => {
    const blocks = parseReasoningBlocks([
      {
        type: "unknown",
        claim: "Sales decreased 12% in the latest period.",
        confidence: "maybe",
      },
    ]);
    expect(blocks[0]?.type).toBe("evidence");
    expect(blocks[0]?.confidence).toBe("medium");
  });
});
