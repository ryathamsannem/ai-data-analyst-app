import { describe, expect, it } from "vitest";
import {
  aggregateMappingConfidenceFromMetadata,
  mappingConfidenceDisplayLabel,
  shouldShowMappingLowConfidenceWarning,
  validateColumnMappingSelections,
} from "@/lib/column-mapping-validation";

describe("validateColumnMappingSelections", () => {
  const columns = ["sales_amount", "region", "order_date"];

  it("accepts empty auto-detect selections", () => {
    expect(
      validateColumnMappingSelections(columns, {
        sales: "",
        region: "",
      })
    ).toEqual({ ok: true });
  });

  it("accepts valid column names", () => {
    expect(
      validateColumnMappingSelections(columns, {
        sales: "sales_amount",
        date: "order_date",
      })
    ).toEqual({ ok: true });
  });

  it("rejects columns not in the dataset", () => {
    const result = validateColumnMappingSelections(columns, {
      sales: "revenue_total",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Primary metric");
      expect(result.message).toContain("revenue_total");
    }
  });
});

/** Role metadata captured from 1k domain fixtures (backend validation). */
const FIXTURE_ROLE_META = {
  hr: {
    sales: { selected: "salary", confidence: "high" },
    product: { selected: "department", confidence: "high" },
    date: { selected: "hire_date", confidence: "high" },
    profit: { selected: "performance_rating", confidence: "high" },
    region: { selected: null, confidence: "low" },
    customer: { selected: "employee_status", confidence: "high" },
  },
  healthcare: {
    sales: { selected: "claim_amount", confidence: "high" },
    product: { selected: "department", confidence: "high" },
    date: { selected: "visit_date", confidence: "high" },
    profit: { selected: "wait_time_minutes", confidence: "high" },
    region: { selected: null, confidence: "low" },
    customer: { selected: "patient_segment", confidence: "medium" },
  },
  banking: {
    sales: { selected: "spend_amount", confidence: "high" },
    product: { selected: "product_type", confidence: "high" },
    date: { selected: "report_month", confidence: "high" },
    profit: { selected: "credit_utilization", confidence: "medium" },
    region: { selected: null, confidence: "low" },
    customer: { selected: "customer_segment", confidence: "high" },
  },
  manufacturing: {
    sales: { selected: "units_produced", confidence: "high" },
    product: { selected: "product_line", confidence: "high" },
    date: { selected: "production_date", confidence: "high" },
    profit: { selected: "defect_rate", confidence: "high" },
    region: { selected: "plant", confidence: "high" },
    customer: { selected: null, confidence: "low" },
  },
  marketing: {
    sales: { selected: "revenue", confidence: "high" },
    product: { selected: "campaign_name", confidence: "high" },
    date: { selected: "campaign_date", confidence: "high" },
    profit: { selected: "conversion_rate", confidence: "high" },
    region: { selected: "region", confidence: "high" },
    customer: { selected: null, confidence: "low" },
  },
  education: {
    sales: { selected: "enrollment_count", confidence: "high" },
    product: { selected: "grade_level", confidence: "high" },
    date: { selected: "term_date", confidence: "high" },
    profit: { selected: "pass_rate", confidence: "high" },
    region: { selected: "school_region", confidence: "high" },
    customer: { selected: null, confidence: "low" },
  },
} as const;

describe("aggregateMappingConfidenceFromMetadata", () => {
  it("returns High for HR when unselected region has low confidence", () => {
    expect(
      aggregateMappingConfidenceFromMetadata({ roles: FIXTURE_ROLE_META.hr })
    ).toBe("high");
    expect(
      mappingConfidenceDisplayLabel(
        aggregateMappingConfidenceFromMetadata({ roles: FIXTURE_ROLE_META.hr })
      )
    ).toBe("High");
  });

  it("returns Medium for healthcare and banking fixtures", () => {
    expect(
      aggregateMappingConfidenceFromMetadata({
        roles: FIXTURE_ROLE_META.healthcare,
      })
    ).toBe("medium");
    expect(
      aggregateMappingConfidenceFromMetadata({
        roles: FIXTURE_ROLE_META.banking,
      })
    ).toBe("medium");
  });

  it("returns High for manufacturing, marketing, and education", () => {
    for (const key of ["manufacturing", "marketing", "education"] as const) {
      expect(
        aggregateMappingConfidenceFromMetadata({
          roles: FIXTURE_ROLE_META[key],
        })
      ).toBe("high");
    }
  });

  it("prefers backend mapping_confidence when provided", () => {
    expect(
      aggregateMappingConfidenceFromMetadata(
        { roles: FIXTURE_ROLE_META.hr },
        "medium"
      )
    ).toBe("medium");
  });

  it("does not treat unselected customer with low confidence as Low", () => {
    expect(
      aggregateMappingConfidenceFromMetadata({
        roles: FIXTURE_ROLE_META.manufacturing,
      })
    ).toBe("high");
    expect(
      aggregateMappingConfidenceFromMetadata({
        roles: FIXTURE_ROLE_META.marketing,
      })
    ).toBe("high");
  });

  it("includes profit role in aggregate (low profit forces Low)", () => {
    expect(
      aggregateMappingConfidenceFromMetadata({
        roles: {
          ...FIXTURE_ROLE_META.hr,
          profit: { selected: "performance_rating", confidence: "low" },
        },
      })
    ).toBe("low");
  });
});

describe("shouldShowMappingLowConfidenceWarning", () => {
  it("hides warning when user confirmed mapping", () => {
    expect(
      shouldShowMappingLowConfidenceWarning(
        { roles: FIXTURE_ROLE_META.hr },
        true
      )
    ).toBe(false);
  });

  it("shows warning only for genuinely low aggregate", () => {
    expect(
      shouldShowMappingLowConfidenceWarning(
        { roles: FIXTURE_ROLE_META.hr },
        false
      )
    ).toBe(false);
    expect(
      shouldShowMappingLowConfidenceWarning(
        {
          roles: {
            sales: { selected: null, confidence: "low" },
            product: { selected: null, confidence: "low" },
            date: { selected: null, confidence: "low" },
            profit: { selected: null, confidence: "low" },
            region: { selected: null, confidence: "low" },
          },
        },
        false
      )
    ).toBe(true);
  });

  it("does not warn for strong education mapping despite generic domain label", () => {
    expect(
      shouldShowMappingLowConfidenceWarning(
        { roles: FIXTURE_ROLE_META.education },
        false
      )
    ).toBe(false);
    expect(
      mappingConfidenceDisplayLabel(
        aggregateMappingConfidenceFromMetadata({
          roles: FIXTURE_ROLE_META.education,
        })
      )
    ).toBe("High");
  });
});
