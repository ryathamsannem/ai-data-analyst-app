import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  formatExecutiveMetricValue,
  formatExecutivePercentPointGap,
  formatExecutivePercentValue,
  formatMetricSpreadGap,
} from "@/lib/metric-value-format";

describe("formatExecutivePercentValue", () => {
  it("uses one decimal for rate values above 100", () => {
    expect(formatExecutivePercentValue(250.84)).toBe("250.8%");
    expect(formatExecutivePercentValue(251)).toBe("251.0%");
  });

  it("uses one decimal for rate values below 100", () => {
    expect(formatExecutivePercentValue(87.26)).toBe("87.3%");
  });
});

describe("formatExecutivePercentPointGap", () => {
  it("formats gap with one decimal and pp suffix", () => {
    expect(formatExecutivePercentPointGap(163.47)).toBe("163.5 pp");
  });
});

describe("metricLabelImpliesPercent composition titles", () => {
  it("does not treat profit share composition as a rate metric", () => {
    const rows = [
      { name: "North", value: 40000 },
      { name: "South", value: 60000 },
    ];
    const ctx = {
      presentationKind: "donut" as const,
      chartTitle: "Profit share by region",
      chartRows: rows,
      shareComposition: true,
    };
    const top = { name: "North", value: 40000 };
    expect(formatExecutiveMetricValue(top, ctx)).not.toMatch(/%/);
    expect(formatExecutiveMetricValue(top, ctx)).toMatch(/40,000|40000/);
  });
});

describe("formatExecutiveMetricValue rate chips", () => {
  it("formats top/lowest consistently for conversion rate", () => {
    const ctx = {
      metricLabel: "conversion_rate_pct",
      chartTitle: "Total conversion rate pct by campaign name",
      presentationKind: "bar_horizontal" as const,
    };
    const top: ChartRow = { name: "Referral Drive", value: 250.84 };
    const low: ChartRow = { name: "Flash Deal", value: 87.26 };
    expect(formatExecutiveMetricValue(top, ctx)).toBe("250.8%");
    expect(formatExecutiveMetricValue(low, ctx)).toBe("87.3%");
  });

  it("keeps revenue values as whole numbers", () => {
    const ctx = {
      metricLabel: "Total revenue by campaign",
      chartTitle: "Total revenue by campaign",
    };
    const row: ChartRow = { name: "Referral Drive", value: 342_828.4 };
    expect(formatExecutiveMetricValue(row, ctx)).toBe("$342,828");
  });
});

describe("formatMetricSpreadGap rate vs revenue", () => {
  it("keeps revenue gap whole-number currency", () => {
    expect(
      formatMetricSpreadGap(180_408.25, {
        metricLabel: "Monthly Total revenue trend",
      })
    ).toBe("$180,408");
  });
});
