import { describe, expect, it } from "vitest";
import { formatMetricSpreadGap } from "@/lib/metric-value-format";

describe("formatMetricSpreadGap", () => {
  it("formats revenue gaps with currency symbol", () => {
    expect(
      formatMetricSpreadGap(180_408.25, {
        metricLabel: "Total revenue by campaign",
        chartTitle: "Total revenue by campaign",
      })
    ).toBe("$180,408");
  });

  it("formats count gaps as whole numbers", () => {
    expect(
      formatMetricSpreadGap(2900.4, {
        metricLabel: "units sold",
        roundingHint: "int_0",
      })
    ).toBe("2,900");
  });

  it("formats percentage gaps as percentage points", () => {
    expect(
      formatMetricSpreadGap(22.64, {
        metricLabel: "conversion_rate_pct",
        presentationKind: "bar_horizontal",
      })
    ).toBe("22.6 pp");
  });

  it("formats rate-metric spread without misleading percent suffix", () => {
    expect(
      formatMetricSpreadGap(250.8 - 87.3, {
        metricLabel: "conversion_rate_pct",
        chartTitle: "Conversion rate by campaign",
      })
    ).toBe("163.5 pp");
  });

  it("formats score gaps with limited decimals", () => {
    expect(
      formatMetricSpreadGap(2.14, {
        metricLabel: "satisfaction_score",
      })
    ).toBe("2.1");
  });
});
