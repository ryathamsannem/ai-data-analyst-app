import { describe, expect, it } from "vitest";
import {
  buildNaturalBusinessFollowUpChips,
  pluralizeFollowUpDimension,
  resolveFollowUpDimensionPhrase,
} from "./ai-follow-up-suggestions";

describe("follow-up dimension phrasing", () => {
  it("keeps zone as zone (not region)", () => {
    expect(
      resolveFollowUpDimensionPhrase("Zone", "zone", "Zone")
    ).toBe("zone");
    expect(pluralizeFollowUpDimension("zone")).toBe("zones");
  });

  it("uses customer segment label", () => {
    expect(
      resolveFollowUpDimensionPhrase(
        "Customer Segment",
        "customer_segment",
        "Customer Segment"
      )
    ).toBe("customer segment");
    expect(pluralizeFollowUpDimension("customer segment")).toBe(
      "customer segments"
    );
  });

  it("generates zone and revenue follow-ups from chart context", () => {
    const chips = buildNaturalBusinessFollowUpChips({
      dimensionPhrase: "zone",
      metricPhrase: "revenue",
      columns: ["zone", "revenue", "profit", "order_date"],
      lastQuestion: "",
      chartKind: "bar",
      topCategoryName: "South",
    });
    expect(chips.some((c) => /Why is South highest/i.test(c))).toBe(true);
    expect(chips.some((c) => /Compare revenue across zones/i.test(c))).toBe(
      true
    );
    expect(chips.some((c) => /Which zone contributes most revenue/i.test(c))).toBe(
      true
    );
    expect(chips.every((c) => !/\bregion\b/i.test(c))).toBe(true);
  });

  it("generates product follow-ups", () => {
    const chips = buildNaturalBusinessFollowUpChips({
      dimensionPhrase: "product",
      metricPhrase: "revenue",
      columns: ["product", "revenue", "profit"],
      lastQuestion: "",
      chartKind: "bar",
    });
    expect(
      chips.some((c) => /Which product contributes most revenue/i.test(c))
    ).toBe(true);
    expect(chips.some((c) => /Compare profit across products/i.test(c))).toBe(
      true
    );
  });
});
