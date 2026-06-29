import { describe, expect, it } from "vitest";
import {
  alignPdfNarrativeToChart,
  buildPdfChartNarrativeContext,
  pdfNarrativeConflictsWithChart,
} from "@/lib/pdf-narrative-alignment";
import {
  applyPdfExportPreset,
  buildExecutivePdfExportInput,
  type BuildExecutivePdfInputParams,
} from "@/lib/build-executive-pdf-input";

const productTypeChartPrep = (): NonNullable<
  BuildExecutivePdfInputParams["chartPrep"]
> => ({
  presentationKind: "bar_horizontal",
  chartData: [
    { name: "Credit Card", value: 420000 },
    { name: "Term Deposit", value: 310000 },
    { name: "Personal Loan", value: 280000 },
    { name: "Mortgage", value: 190000 },
    { name: "Auto Loan", value: 95000 },
  ],
  chartTitle: "Spend Amount by Product Type",
  chartSubtitleMerged: "Grouped comparison",
  exportDisplayTitle: "Spend Amount by Product Type",
  trendMode: false,
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
  rankedSignals: [
    {
      rank: "#1",
      category: "Credit Card",
      valueDisplay: "$420K",
    },
  ],
  metricColumn: "spend_amount",
  alignedMetricDisplay: "Spend Amount",
  aggregation: "sum",
  chartInsightBadge: null,
  chartAxisLabels: { category: "Product Type", value: "Spend Amount" },
  captureEl: null,
  chartAttribution: null,
  provenanceSlice: null,
  metricType: null,
  roundingHint: null,
  vizMetricType: null,
});

describe("pdf narrative alignment", () => {
  it("detects customer segment narrative on a Product Type chart", () => {
    const ctx = buildPdfChartNarrativeContext(productTypeChartPrep());
    expect(ctx?.dimensionLabel).toBe("Product Type");
    const stale =
      "Premium and SME customer segments drive the largest share of spend, while Corporate and Retail lag.";
    expect(ctx).not.toBeNull();
    expect(pdfNarrativeConflictsWithChart(stale, ctx!)).toBe(true);
  });

  it("replaces mismatched segment narrative with chart-aligned summary", () => {
    const staleAnswer =
      "Premium customer segment leads spend, followed by SME and Corporate segments.";
    const aligned = alignPdfNarrativeToChart({
      chartPrep: productTypeChartPrep(),
      pdfInsightAnswer: staleAnswer,
      insightExecutiveBrief: "Corporate segment underperforms Retail.",
      insightExecutiveVizInsights: [
        {
          key: "seg-1",
          title: "Segment risk",
          value: "Premium concentration",
          dotClass: "bg-rose-500",
        },
      ],
      parsedInsightAnswer: { summary: staleAnswer },
      alignedInsightSummary: staleAnswer,
    });

    expect(aligned.usedChartAlignedFallback).toBe(true);
    expect(aligned.pdfInsightAnswer.toLowerCase()).toContain("product type");
    expect(aligned.pdfInsightAnswer.toLowerCase()).not.toContain("premium");
    expect(aligned.pdfInsightAnswer.toLowerCase()).not.toContain("sme");
    expect(aligned.insightExecutiveBrief.toLowerCase()).toContain("product type");
    expect(aligned.insightExecutiveVizInsights).toHaveLength(0);
  });
});

describe("applyPdfExportPreset", () => {
  it("defaults AI Insights export to slim executive layout", () => {
    const preset = applyPdfExportPreset(
      {
        reportPreset: "insight",
        includeKPIs: true,
        includeAIInsight: true,
        includeChart: true,
        includeDataPreview: true,
        includeDataQuality: true,
        includeConversationContext: true,
      },
      { reportPreset: "insight" }
    );
    expect(preset.includeDataPreview).toBe(false);
    expect(preset.includeDataQuality).toBe(false);
    expect(preset.includeConversationContext).toBe(false);
    expect(preset.includeTechnicalAppendix).toBe(false);
    expect(preset.chartScope).toBe("insight");
  });

  it("allows explicit opt-in for appendix sections on insight preset", () => {
    const preset = applyPdfExportPreset(
      {
        reportPreset: "insight",
        includeKPIs: true,
        includeAIInsight: true,
        includeChart: true,
        includeDataPreview: true,
        includeDataQuality: true,
      },
      {
        reportPreset: "insight",
        includeDataPreview: true,
        includeDataQuality: true,
        includeConversationContext: true,
      }
    );
    expect(preset.includeDataPreview).toBe(true);
    expect(preset.includeDataQuality).toBe(true);
    expect(preset.includeConversationContext).toBe(true);
  });
});

describe("buildExecutivePdfExportInput insight preset", () => {
  const baseParams = (): BuildExecutivePdfInputParams => ({
    options: {
      reportPreset: "insight",
      includeKPIs: true,
      includeAIInsight: true,
      includeChart: true,
      includeDataPreview: false,
      includeDataQuality: false,
    },
    chartScope: "insight",
    chartPrep: productTypeChartPrep(),
    reportBranding: { companyName: "Acme", tagline: "", accentHex: "#2563eb" },
    mappingConfidence: "High",
    rows: 1000,
    columns: ["product_type", "spend_amount"],
    datasetKind: "banking",
    profile: null,
    preview: [],
    kpis: { total_rows: 1000, total_columns: 2 },
    alignedAnalysis: null,
    pdfAlignedAnalysis: null,
    question: "Spend Amount by Product Type",
    lastAskedQuestion: "Spend Amount by Product Type",
    pdfInsightAnswer:
      "Premium and SME customer segments dominate spend versus Corporate and Retail.",
    parsedInsightAnswer: {
      summary:
        "Premium and SME customer segments dominate spend versus Corporate and Retail.",
    },
    insightExecutiveBrief: "",
    insightExecutiveVizInsights: [],
    executiveVizInsights: [],
    insightSmartChartIntel: null,
    sessionSmartChartIntel: null,
    displayKpiCards: [],
    insightNarrativeTone: "neutral",
    insightNarrativeDisclaimer: null,
    chartHistory: [],
    conversationAppendix: null,
  });

  it("does not hardcode sample data for insight preset defaults", () => {
    const built = buildExecutivePdfExportInput(baseParams());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.includes.reportPreset).toBe("insight");
    expect(built.input.includes.includeDataPreview).toBe(false);
    expect(built.input.includes.includeConversationContext).toBe(false);
  });

  it("aligns insight narrative to exported chart contract", () => {
    const built = buildExecutivePdfExportInput(baseParams());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const answer = built.input.answer.toLowerCase();
    expect(answer).toContain("product type");
    expect(answer).not.toContain("premium");
    expect(answer).not.toContain("customer segment");
    expect(built.input.routingPlan).toBeUndefined();
  });
});
