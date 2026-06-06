import { describe, expect, it } from "vitest";
import { dedupeFollowUpChips } from "@/lib/ai-follow-up-suggestions";

describe("follow-up semantic deduplication", () => {
  it("keeps one why-style chip per entity", () => {
    const chips = dedupeFollowUpChips(
      [
        "Why is West highest?",
        "Why does West lead?",
        "Compare revenue across regions",
        "Which region contributes most revenue?",
      ],
      8
    );
    const whyWest = chips.filter((c) => /west/i.test(c) && /why/i.test(c));
    expect(whyWest.length).toBeLessThanOrEqual(1);
    expect(chips.length).toBeGreaterThanOrEqual(2);
  });
});
