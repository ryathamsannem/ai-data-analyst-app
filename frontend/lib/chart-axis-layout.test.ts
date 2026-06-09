import { describe, expect, it } from "vitest";
import {
  balanceHorizontalOuterMargins,
  computeHorizontalBarAxisLayout,
} from "@/lib/chart-axis-layout";

describe("computeHorizontalBarAxisLayout", () => {
  it("reserves category width on YAxis only — not duplicated in margin-left", () => {
    const layout = computeHorizontalBarAxisLayout({
      categoryTickStrings: ["Campaign A", "Campaign B", "Campaign C"],
      valueAxisLabel: "Revenue",
      valueAxisFull: "Total revenue",
      categoryAxisLabel: "Campaign",
      chartLayoutMode: "full",
    });

    expect(layout.categoryAxisWidth).toBeGreaterThan(52);
    expect(layout.marginLeft).toBeLessThanOrEqual(16);
  });

  it("uses a modest right gutter in compact mode (no mirror of left margin)", () => {
    const layout = computeHorizontalBarAxisLayout({
      categoryTickStrings: ["North", "South", "East", "West"],
      valueAxisLabel: "Sales",
      categoryAxisLabel: "Region",
      chartLayoutMode: "compact",
    });
    const balanced = balanceHorizontalOuterMargins({
      marginLeft: layout.marginLeft,
      chartLayoutMode: "compact",
    });

    expect(balanced.marginRight).toBeLessThan(balanced.marginLeft + 40);
    expect(balanced.marginRight).toBeLessThanOrEqual(20);
  });
});
