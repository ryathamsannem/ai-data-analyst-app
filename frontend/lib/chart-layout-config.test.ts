import { describe, expect, it } from "vitest";
import { verticalCartesianOuterMargins } from "@/lib/chart-layout-config";

describe("verticalCartesianOuterMargins session detail", () => {
  it("uses outer left pad for detail V-Bar — not duplicated Y-axis width", () => {
    const margins = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 94, marginRight: 24 },
      36,
      { insightUi: true, yAxisWidth: 72, pointCount: 5 }
    );
    expect(margins.left).toBeLessThanOrEqual(10);
    expect(margins.right).toBeGreaterThanOrEqual(18);
  });

  it("legacy full layout still caps side margin from vmBalanced", () => {
    const margins = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 94, marginRight: 24 },
      36,
      { insightUi: false }
    );
    expect(margins.left).toBe(36);
  });
});
