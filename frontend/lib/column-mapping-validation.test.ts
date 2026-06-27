import { describe, expect, it } from "vitest";
import { validateColumnMappingSelections } from "@/lib/column-mapping-validation";

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
