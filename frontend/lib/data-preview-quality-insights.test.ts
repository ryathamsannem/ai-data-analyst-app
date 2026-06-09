import { describe, expect, it } from "vitest";
import { buildDataPreviewQualityInsights } from "@/lib/data-preview-quality-insights";
import type { DataPreviewProfile } from "@/lib/data-preview-schema";

const profile: DataPreviewProfile = {
  column_types: {
    order_id: "text",
    region: "category",
    order_date: "date",
    revenue: "number",
  },
  null_counts: {
    order_id: 0,
    region: 2,
    order_date: 0,
    revenue: 0,
  },
  summary_stats: {},
  unique_counts: {
    order_id: 180,
    region: 5,
  },
};

const preview = Array.from({ length: 10 }, (_, i) => ({
  order_id: `ORD-${i}`,
  region: i % 2 === 0 ? "East" : "West",
  order_date: i < 5 ? "2024-01-01" : "2025-06-01",
  revenue: 100 + i,
}));

describe("data preview quality insights", () => {
  it("assigns info severity to identifier detection", () => {
    const insights = buildDataPreviewQualityInsights({
      columns: ["order_id", "region"],
      profile,
      preview,
      totalRows: 180,
    });
    const identifier = insights.find((i) => /identifier/i.test(i.message));
    expect(identifier?.severity).toBe("info");
  });

  it("assigns warning for low missing-value rates and attention above 5%", () => {
    const lowMissing: DataPreviewProfile = {
      ...profile,
      null_counts: { ...profile.null_counts, region: 3 },
    };
    const highMissing: DataPreviewProfile = {
      ...profile,
      null_counts: { ...profile.null_counts, region: 12 },
    };

    const warning = buildDataPreviewQualityInsights({
      columns: ["region"],
      profile: lowMissing,
      preview,
      totalRows: 180,
    }).find((i) => /missing values/i.test(i.message));
    expect(warning?.severity).toBe("warning");

    const attention = buildDataPreviewQualityInsights({
      columns: ["region"],
      profile: highMissing,
      preview,
      totalRows: 180,
    }).find((i) => /missing values/i.test(i.message));
    expect(attention?.severity).toBe("attention");
  });
});
