import { describe, expect, it } from "vitest";
import {
  buildAiFollowUpQuestionChips,
  buildNaturalBusinessFollowUpChips,
  buildRelationshipScatterFollowUpChips,
  columnHintsForFollowUp,
  filterFollowUpsAgainstPriorQuestions,
  followUpOverlapsPriorQuestion,
  isGenericInsightFollowUpChip,
  pluralizeFollowUpDimension,
  resolveFollowUpDimensionPhrase,
  schemaHasProfitColumn,
} from "./ai-follow-up-suggestions";

const COL_TYPES_RETAIL = {
  product_category: "category" as const,
  region: "category" as const,
  sales_amount: "number" as const,
  profit: "number" as const,
  quantity: "number" as const,
  order_date: "date" as const,
};

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
      columnTypes: {
        zone: "category",
        revenue: "number",
        profit: "number",
        order_date: "date",
      },
      categoryColumn: "zone",
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
      columnTypes: {
        product: "category",
        revenue: "number",
        profit: "number",
      },
      categoryColumn: "product",
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

describe("columnHints respects column_types", () => {
  it("excludes category columns from numeric measure hints", () => {
    const hints = columnHintsForFollowUp(
      ["product_category", "region", "sales_amount", "profit"],
      COL_TYPES_RETAIL
    );
    expect(hints.numericMeasures).toContain("sales amount");
    expect(hints.numericMeasures).toContain("profit");
    expect(hints.numericMeasures.some((m) => /product category|region/.test(m))).toBe(
      false
    );
  });
});

describe("FU-P1-01 generic insight fallback", () => {
  it("does not include generic insight when at least 3 quality chips exist", () => {
    const chips = buildAiFollowUpQuestionChips({
      lastQuestion: "How does conversion rate trend over campaign date?",
      chartTitle: "Conversion Rate by Channel",
      chartKind: "bar",
      valueAxisLabel: "Conversion Rate",
      categoryAxisLabel: "Channel",
      datasetDomain: "marketing",
      seriesRows: [
        { name: "Search", value: 3.2 },
        { name: "Social", value: 2.1 },
        { name: "Email", value: 4.0 },
      ],
      alternateMetricLabels: ["Revenue"],
      columns: ["channel", "campaign", "revenue", "conversion_rate", "campaign_date"],
      columnTypes: {
        channel: "category",
        campaign: "category",
        revenue: "number",
        conversion_rate: "number",
        campaign_date: "date",
      },
      metricColumn: "conversion_rate",
      categoryColumn: "channel",
      categoryColumnDisplay: "Channel",
    });
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.some(isGenericInsightFollowUpChip)).toBe(false);
  });

  it("allows generic insight only when fewer than 3 quality chips remain", () => {
    const chips = buildAiFollowUpQuestionChips({
      lastQuestion:
        "Compare claim amount across regions Which region contributes most claim amount Which region has the highest claim amount Why is North highest",
      chartTitle: "Claim Amount by Region",
      chartKind: "bar",
      valueAxisLabel: "Claim Amount",
      categoryAxisLabel: "Region",
      datasetDomain: "healthcare",
      seriesRows: [{ name: "North", value: 100 }],
      alternateMetricLabels: [],
      columns: ["department", "segment", "claim_amount", "readmission_rate"],
      columnTypes: {
        department: "category",
        segment: "category",
        claim_amount: "number",
        readmission_rate: "number",
      },
      metricColumn: "claim_amount",
      categoryColumn: "region",
    });
    expect(chips.some(isGenericInsightFollowUpChip)).toBe(true);
    expect(chips.length).toBeLessThanOrEqual(5);
  });
});

describe("FU-P1-03 profit-centric chips", () => {
  it("does not emit profit chips when schema has no profit column", () => {
    const chips = buildNaturalBusinessFollowUpChips({
      dimensionPhrase: "department",
      metricPhrase: "readmission rate",
      columns: ["department", "segment", "claim_amount", "readmission_rate"],
      columnTypes: {
        department: "category",
        segment: "category",
        claim_amount: "number",
        readmission_rate: "number",
      },
      categoryColumn: "department",
      lastQuestion: "",
      chartKind: "bar",
    });
    expect(chips.every((c) => !/\bprofit\b/i.test(c))).toBe(true);
    expect(schemaHasProfitColumn(["claim_amount", "readmission_rate"])).toBe(false);
  });

  it("gates scatter profit-margin chip on real profit column", () => {
    const withProfit = buildRelationshipScatterFollowUpChips(
      "Sales Amount",
      "Profit",
      "Product Category",
      ["product_category", "sales_amount", "profit"],
      { product_category: "category", sales_amount: "number", profit: "number" }
    );
    expect(withProfit.some((c) => /profit margin/i.test(c))).toBe(true);

    const withoutProfit = buildRelationshipScatterFollowUpChips(
      "Claim Amount",
      "Readmission Rate",
      "Department",
      ["department", "claim_amount", "readmission_rate"],
      {
        department: "category",
        claim_amount: "number",
        readmission_rate: "number",
      }
    );
    expect(withoutProfit.every((c) => !/\bprofit\b/i.test(c))).toBe(true);
  });
});

describe("temporal and trend follow-up guards", () => {
  it("does not emit compare across months on SaaS churn line", () => {
    const chips = buildAiFollowUpQuestionChips({
      lastQuestion: "How does churn rate trend over month?",
      chartTitle: "Churn Rate by Month",
      chartKind: "line",
      valueAxisLabel: "Churn Rate",
      categoryAxisLabel: "Month",
      datasetDomain: "saas",
      seriesRows: [
        { name: "Jan", value: 0.04 },
        { name: "Feb", value: 0.035 },
        { name: "Mar", value: 0.05 },
      ],
      alternateMetricLabels: ["Mrr"],
      columns: ["plan_type", "segment", "mrr", "churn_rate", "month"],
      columnTypes: {
        plan_type: "category",
        segment: "category",
        mrr: "number",
        churn_rate: "number",
        month: "date",
      },
      metricColumn: "churn_rate",
      categoryColumn: "month",
    });
    expect(chips.every((c) => !/compare churn rate across months/i.test(c))).toBe(
      true
    );
    expect(chips.every((c) => !/why is mar highest/i.test(c))).toBe(true);
    expect(
      chips.some(
        (c) =>
          /period changed most/i.test(c) || /driving the change/i.test(c)
      )
    ).toBe(true);
  });

  it("does not emit date-bucket why highest on line trend charts", () => {
    const chips = buildAiFollowUpQuestionChips({
      lastQuestion: "How does conversion rate trend over campaign date?",
      chartTitle: "Conversion Rate by Campaign Date",
      chartKind: "line",
      valueAxisLabel: "Conversion Rate",
      categoryAxisLabel: "Campaign Date",
      datasetDomain: "marketing",
      seriesRows: [
        { name: "2024-01", value: 2.1 },
        { name: "2024-02", value: 2.4 },
        { name: "2024-03", value: 3.0 },
      ],
      alternateMetricLabels: [],
      columns: ["channel", "conversion_rate", "campaign_date"],
      columnTypes: {
        channel: "category",
        conversion_rate: "number",
        campaign_date: "date",
      },
      metricColumn: "conversion_rate",
      categoryColumn: "campaign_date",
    });
    expect(chips.every((c) => !/why is 2024-03 highest/i.test(c))).toBe(true);
    expect(chips.every((c) => !/campaign date is growing fastest/i.test(c))).toBe(
      true
    );
  });
});

describe("FU-P1-02 dedupe vs upload suggestions", () => {
  it("detects near-duplicate overlap with upload-time suggested questions", () => {
    expect(
      followUpOverlapsPriorQuestion(
        "Which channel has the highest revenue?",
        ["Which channel has the highest revenue?"]
      )
    ).toBe(true);
    expect(
      followUpOverlapsPriorQuestion("Compare revenue across channels", [
        "Which channel has the highest revenue?",
      ])
    ).toBe(false);
  });

  it("filters follow-up chips that repeat visible suggested questions", () => {
    const filtered = filterFollowUpsAgainstPriorQuestions(
      [
        "Which channel has the highest revenue?",
        "Why is Search highest?",
        "Compare conversion rate across channels",
      ],
      [
        "Which channel has the highest revenue?",
        "How does conversion rate trend over campaign date?",
      ]
    );
    expect(filtered).not.toContain("Which channel has the highest revenue?");
    expect(filtered.length).toBeGreaterThan(0);
  });
});

describe("support CSAT follow-up wording", () => {
  it("uses CSAT risk and resolution wording instead of generic why highest", () => {
    const chips = buildAiFollowUpQuestionChips({
      lastQuestion: "What are the top 5 ticket category ranked by csat score?",
      chartTitle: "Csat Score by Ticket Category",
      chartKind: "bar_horizontal",
      valueAxisLabel: "Csat Score",
      categoryAxisLabel: "Ticket Category",
      datasetDomain: "customer_support",
      seriesRows: [
        { name: "Billing", value: 3.2 },
        { name: "Technical", value: 4.1 },
        { name: "Account", value: 4.5 },
      ],
      alternateMetricLabels: ["Resolution Hours"],
      columns: [
        "ticket_category",
        "priority",
        "csat_score",
        "resolution_hours",
        "opened_date",
      ],
      columnTypes: {
        ticket_category: "category",
        priority: "category",
        csat_score: "number",
        resolution_hours: "number",
        opened_date: "date",
      },
      metricColumn: "csat_score",
      categoryColumn: "ticket_category",
      categoryColumnDisplay: "Ticket Category",
    });
    const joined = chips.join(" ").toLowerCase();
    expect(chips.every((c) => !/why is account highest/i.test(c))).toBe(true);
    expect(
      /csat risk|improve csat|resolution/.test(joined)
    ).toBe(true);
  });
});
