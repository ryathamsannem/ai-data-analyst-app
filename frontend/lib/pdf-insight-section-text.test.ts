import { describe, expect, it } from "vitest";
import { stripRedundantPdfInsightSectionLabel } from "@/lib/pdf-insight-section-text";

describe("stripRedundantPdfInsightSectionLabel", () => {
  it("strips Executive takeaway prefix in executive takeaway section", () => {
    expect(
      stripRedundantPdfInsightSectionLabel(
        "Executive takeaway: North Grid leads total room revenue at 13.67M.",
        "executive_takeaway"
      )
    ).toBe("North Grid leads total room revenue at 13.67M.");
  });

  it("strips trailing Evidence label leaked into takeaway text", () => {
    expect(
      stripRedundantPdfInsightSectionLabel(
        "Suite leads room revenue across room types. Evidence:",
        "executive_takeaway"
      )
    ).toBe("Suite leads room revenue across room types.");
  });

  it("strips Evidence prefix in evidence section", () => {
    expect(
      stripRedundantPdfInsightSectionLabel(
        "Evidence:\n- Downtown leads all markets with 13.6M in room revenue.",
        "evidence"
      )
    ).toBe("Downtown leads all markets with 13.6M in room revenue.");
  });

  it("strips Recommended action prefix in strategic recommendation section", () => {
    expect(
      stripRedundantPdfInsightSectionLabel(
        "Recommended action: Compare occupancy by room type.",
        "strategic_recommendation"
      )
    ).toBe("Compare occupancy by room type.");
  });

  it("preserves meaning when no redundant label is present", () => {
    const text = "Suite leads with 11.86 million (21% of total).";
    expect(stripRedundantPdfInsightSectionLabel(text, "evidence")).toBe(text);
  });
});
