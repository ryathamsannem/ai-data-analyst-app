import { describe, expect, it } from "vitest";
import {
  buildDataPreviewSuggestedQuestions,
  polishSuggestedQuestion,
  resolveDataPreviewSuggestedQuestions,
} from "@/lib/data-preview-suggested-questions";
import type { DataPreviewProfile } from "@/lib/data-preview-schema";

const profile: DataPreviewProfile = {
  column_types: {
    revenue: "number",
    order_date: "date",
    campaign_name: "category",
    region: "category",
  },
  null_counts: {
    revenue: 0,
    order_date: 0,
    campaign_name: 0,
    region: 0,
  },
  summary_stats: {},
};

describe("data preview suggested questions", () => {
  it("prefers API suggestions shared with AI Insights", () => {
    const out = resolveDataPreviewSuggestedQuestions({
      apiSuggestions: [
        "Which campaign name drive the most revenue?",
        "What are the top 10 campaign name ranked by revenue?",
      ],
      buildArgs: {
        columns: ["revenue", "region"],
        profile,
        datasetKind: "sales",
        primaryMetric: "revenue",
        primaryDate: "order_date",
        primaryBreakdown: "region",
      },
    });
    expect(out[0]).toBe("Which campaigns drive the most revenue?");
    expect(out[1]).toBe("What are the top 10 campaigns ranked by revenue?");
  });

  it("falls back to dataset-aware chips when API suggestions are absent", () => {
    const out = resolveDataPreviewSuggestedQuestions({
      apiSuggestions: [],
      buildArgs: {
        columns: ["revenue", "campaign_name", "order_date"],
        profile,
        datasetKind: "sales",
        primaryMetric: "revenue",
        primaryDate: "order_date",
        primaryBreakdown: "campaign_name",
      },
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((q) => /revenue/i.test(q))).toBe(true);
  });

  it("builds role-aware chips from mapped fields", () => {
    const out = buildDataPreviewSuggestedQuestions({
      columns: ["revenue", "campaign_name", "order_date"],
      profile,
      datasetKind: "sales",
      primaryMetric: "revenue",
      primaryDate: "order_date",
      primaryBreakdown: "campaign_name",
    });
    expect(out.some((q) => /campaigns drive the most revenue/i.test(q))).toBe(true);
    expect(out.some((q) => /top 10 campaigns ranked by revenue/i.test(q))).toBe(true);
  });

  it("polishes awkward API phrasing", () => {
    expect(
      polishSuggestedQuestion("Which campaign name drive the most revenue")
    ).toBe("Which campaigns drive the most revenue?");
  });
});
