import { describe, expect, it } from "vitest";
import {
  chartHasRateAbove100,
  percentGapChipAriaLabel,
  RATE_EXCEEDS_100_WARNING,
} from "@/lib/chart-quality-warnings";
import type { ChartRow } from "@/app/chart-types";

describe("chartHasRateAbove100", () => {
  it("detects rate metrics with values above 100%", () => {
    const rows: ChartRow[] = [
      { name: "A", value: 87.3 },
      { name: "B", value: 251 },
    ];
    expect(chartHasRateAbove100(rows, "conversion_rate_pct")).toBe(true);
  });

  it("ignores non-rate metrics", () => {
    const rows: ChartRow[] = [{ name: "A", value: 500_000 }];
    expect(chartHasRateAbove100(rows, "total_revenue")).toBe(false);
  });
});

describe("percentGapChipAriaLabel", () => {
  it("explains percentage-point gap in plain language", () => {
    expect(percentGapChipAriaLabel("conversion_rate_pct")).toBe(
      "Difference between highest and lowest conversion rate in percentage points"
    );
  });
});

describe("RATE_EXCEEDS_100_WARNING", () => {
  it("is a subtle verification message prefixed with Note", () => {
    expect(RATE_EXCEEDS_100_WARNING).toMatch(/^Note:/);
    expect(RATE_EXCEEDS_100_WARNING).toContain("exceed 100%");
  });
});
