import { describe, expect, it } from "vitest";
import {
  computeLineAreaXAxisInterval,
  formatCompactTrendXAxisTickLabel,
  formatTrendXAxisTickLabel,
} from "@/lib/chart-time-x-axis";

describe("chart time x-axis", () => {
  it("formats YYYY-MM buckets for readable monthly labels", () => {
    expect(formatTrendXAxisTickLabel("2026-01")).toBe("Jan '26");
    expect(formatTrendXAxisTickLabel("2026-05")).toBe("May '26");
  });

  it("uses single-month labels on very narrow cards", () => {
    expect(formatCompactTrendXAxisTickLabel("2026-03")).toBe("Mar");
  });

  it("thins ticks further below 420px width", () => {
    const narrow = computeLineAreaXAxisInterval(12, {
      compact: false,
      viewportWidthPx: 360,
    });
    const wide = computeLineAreaXAxisInterval(12, {
      compact: false,
      viewportWidthPx: 900,
    });
    expect(narrow).toBeGreaterThanOrEqual(wide);
  });
});
