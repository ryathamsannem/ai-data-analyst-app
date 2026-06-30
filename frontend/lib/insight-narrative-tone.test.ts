import { describe, expect, it } from "vitest";
import {
  resolveNarrativeTone,
  softenAssertiveProse,
  mappingConfidenceFromRoleMetadata,
} from "@/lib/insight-narrative-tone";

describe("mappingConfidenceFromRoleMetadata", () => {
  it("ignores unselected optional roles with low confidence", () => {
    expect(
      mappingConfidenceFromRoleMetadata({
        sales: { confidence: "high", selected: "salary" },
        product: { confidence: "high", selected: "department" },
        date: { confidence: "high", selected: "hire_date" },
        profit: { confidence: "high", selected: "performance_rating" },
        region: { confidence: "low", selected: null },
        customer: { confidence: "high", selected: "employee_status" },
      })
    ).toBe("high");
  });

  it("ignores selected optional customer with medium confidence in aggregate", () => {
    expect(
      mappingConfidenceFromRoleMetadata({
        sales: { confidence: "high", selected: "claim_amount" },
        product: { confidence: "high", selected: "department" },
        date: { confidence: "high", selected: "visit_date" },
        profit: { confidence: "high", selected: "wait_time_minutes" },
        region: { confidence: "low", selected: null },
        customer: { confidence: "medium", selected: "patient_segment" },
      })
    ).toBe("high");
  });
});

describe("resolveNarrativeTone", () => {
  it("does not downgrade large cohorts with few ranking categories", () => {
    expect(
      resolveNarrativeTone({
        analysisRowCount: 10_000,
        chartSeriesPointCount: 4,
        mappingConfidence: "high",
        unifiedConfidenceLevel: "high",
        isTrendChart: false,
        hasStrongReasoningEvidence: true,
      })
    ).toBe("confident");
  });

  it("stays cautious for thin cohorts", () => {
    expect(
      resolveNarrativeTone({
        analysisRowCount: 42,
        chartSeriesPointCount: 4,
        mappingConfidence: "high",
        unifiedConfidenceLevel: "high",
        isTrendChart: false,
      })
    ).toBe("cautious");
  });
});

describe("softenAssertiveProse", () => {
  it("omits limited-evidence caveat for large descriptive concentration reads", () => {
    const text = "North contributes 35% of total sales.";
    expect(
      softenAssertiveProse(text, "cautious", {
        analysisRowCount: 10_000,
        hasStrongReasoningEvidence: true,
        isDescriptiveFact: true,
      })
    ).toBe(text);
  });

  it("avoids limited-evidence wording when cohort is large with strong blocks", () => {
    const text = "Top 3 regions account for 86% of sales.";
    const out = softenAssertiveProse(text, "cautious", {
      analysisRowCount: 10_000,
      hasStrongReasoningEvidence: true,
      isDescriptiveFact: true,
    });
    expect(out).not.toMatch(/limited evidence in this cohort/i);
  });

  it("adds limited-evidence caveat for small cohorts", () => {
    const text = "North leads total sales.";
    expect(
      softenAssertiveProse(text, "cautious", {
        analysisRowCount: 42,
        hasStrongReasoningEvidence: false,
      })
    ).toMatch(/limited evidence in this cohort/i);
  });
});
