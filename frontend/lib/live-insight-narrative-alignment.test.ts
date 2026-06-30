import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import type { ParsedAnswerSections } from "@/lib/build-executive-pdf-input";
import {
  alignLiveInsightPresentation,
  alignLiveParsedInsightAnswer,
  buildLiveInsightChartPrep,
} from "@/lib/live-insight-narrative-alignment";

const productTypeSnapshot = (): ChartSnapshot => ({
  id: "chart-banking-pt",
  source: "ai",
  createdAt: 1,
  title: "Spend Amount by Product Type",
  subtitle: "Grouped comparison",
  chartKind: "bar_horizontal",
  chartData: [
    { name: "Credit Card", value: 420000, displayValue: "420000" },
    { name: "Term Deposit", value: 310000, displayValue: "310000" },
    { name: "Personal Loan", value: 280000, displayValue: "280000" },
    { name: "Mortgage", value: 190000, displayValue: "190000" },
    { name: "Auto Loan", value: 95000, displayValue: "95000" },
  ],
  visualization: null,
  question: "Spend Amount by Product Type",
  contract: {
    id: "viz-1",
    source: "ai",
    title: "Spend Amount by Product Type",
    displayTitle: "Spend Amount by Product Type",
    chartType: "bar_horizontal",
    rendererType: "bar_horizontal",
    mode: "category",
    labels: ["Credit Card", "Term Deposit"],
    series: [420000, 310000],
    categoryKey: "product_type",
    metricKey: "spend_amount",
    aggregation: "sum",
    dimension: "product_type",
    timeKey: null,
    timeBucketLabel: "",
    metricLabel: "Spend Amount",
    aggregationLabel: "Sum",
    isTimeSeries: false,
    semanticContext: {
      metric: "spend_amount",
      metricLabel: "Spend Amount",
      aggregation: "sum",
      aggregationLabel: "Sum",
      dimension: "product_type",
      dimensionLabel: "Product Type",
      chartType: "bar_horizontal",
      datasetDomain: "banking",
    },
    generatedAt: 1,
  },
});

const segmentNarrative: ParsedAnswerSections = {
  summary:
    "Premium and SME customer segments drive nearly equal spend, while Corporate and Retail trail.",
  statistical:
    "Customer segment mix shows Premium at 28% and SME at 27% of total spend.",
};

describe("live-insight-narrative-alignment", () => {
  it("builds chart prep from the active insight snapshot", () => {
    const prep = buildLiveInsightChartPrep(productTypeSnapshot(), {
      category: "Product Type",
      value: "Spend Amount",
    });
    expect(prep?.chartAxisLabels?.category).toBe("Product Type");
    expect(prep?.chartData).toHaveLength(5);
  });

  it("replaces Customer Segment narrative for a Product Type chart", () => {
    const prep = buildLiveInsightChartPrep(productTypeSnapshot(), {
      category: "Product Type",
      value: "Spend Amount",
    });
    const aligned = alignLiveParsedInsightAnswer(segmentNarrative, prep);
    const blob = [
      aligned.summary,
      aligned.statistical,
      aligned.hypotheses,
      aligned.recommendations,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    expect(blob).toContain("product type");
    expect(blob).toContain("credit card");
    expect(blob).not.toContain("premium");
    expect(blob).not.toContain("customer segment");
  });

  it("leaves aligned product-type narrative unchanged", () => {
    const prep = buildLiveInsightChartPrep(productTypeSnapshot(), {
      category: "Product Type",
      value: "Spend Amount",
    });
    const good: ParsedAnswerSections = {
      summary:
        "Credit Card leads Spend Amount by Product Type, followed by Term Deposit and Personal Loan.",
    };
    const aligned = alignLiveParsedInsightAnswer(good, prep);
    expect(aligned.summary).toBe(good.summary);
  });
});

describe("live AI Insights UI wiring", () => {
  const pageSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../app/page.tsx"),
    "utf8"
  );

  it("applies live narrative alignment in parsedInsightAnswer", () => {
    expect(pageSrc).toContain("alignLiveInsightPresentation");
    expect(pageSrc).toContain("alignedInsightPresentation");
    expect(pageSrc).toContain("resolveLiveInsightAnswerText");
    expect(pageSrc).toContain("insightAnswerTextForDisplay");
  });

  it("alignLiveInsightPresentation replaces segment narrative for product type chart", () => {
    const prep = buildLiveInsightChartPrep(productTypeSnapshot(), {
      category: "Product Type",
      value: "Spend Amount",
    });
    const aligned = alignLiveInsightPresentation(
      { parsedInsightAnswer: segmentNarrative },
      prep
    );
    expect(aligned.usedChartAlignedFallback).toBe(true);
    expect(aligned.parsedInsightAnswer.summary?.toLowerCase()).toContain(
      "product type"
    );
  });
});
