import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import { formatRadialTooltipValue } from "@/lib/radial-chart-format";

describe("radial chart tooltip formatting", () => {
  it("includes value and share percentage", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 40, displayValue: "40%" },
      { name: "B", value: 60, displayValue: "60%" },
    ];
    const text = formatRadialTooltipValue(rows, rows[0], 40);
    expect(text).toContain("40%");
    expect(text).toContain("(40.0%)");
  });
});
