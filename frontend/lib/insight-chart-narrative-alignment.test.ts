import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import type { ParsedAnswerSections } from "@/lib/build-executive-pdf-input";
import {
  alignInsightPresentationToChart,
  buildInsightChartNarrativeContext,
  buildInsightChartPrepFromSnapshot,
  insightNarrativeConflictsWithChart,
} from "@/lib/insight-chart-narrative-alignment";
import { alignPdfNarrativeToChart } from "@/lib/pdf-narrative-alignment";
import {
  alignLiveInsightPresentation,
  buildLiveInsightChartPrep,
} from "@/lib/live-insight-narrative-alignment";

const productTypePrep = () =>
  buildInsightChartPrepFromSnapshot(
    {
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
    },
    { category: "Product Type", value: "Spend Amount" }
  )!;

const roomTypePrep = () =>
  buildInsightChartPrepFromSnapshot(
    {
      id: "chart-hosp-rt",
      source: "ai",
      createdAt: 1,
      title: "Room Revenue by Room Type",
      subtitle: "Grouped comparison",
      chartKind: "bar",
      chartData: [
        { name: "Suite", value: 220000, displayValue: "220000" },
        { name: "Executive", value: 180000, displayValue: "180000" },
        { name: "Deluxe", value: 150000, displayValue: "150000" },
        { name: "Family", value: 120000, displayValue: "120000" },
        { name: "Standard", value: 90000, displayValue: "90000" },
      ],
      visualization: null,
      question: "Room Revenue by Room Type",
      contract: {
        id: "viz-2",
        source: "ai",
        title: "Room Revenue by Room Type",
        displayTitle: "Room Revenue by Room Type",
        chartType: "bar",
        rendererType: "bar",
        mode: "category",
        labels: ["Suite", "Executive"],
        series: [220000, 180000],
        categoryKey: "room_type",
        metricKey: "room_revenue",
        aggregation: "sum",
        dimension: "room_type",
        timeKey: null,
        timeBucketLabel: "",
        metricLabel: "Room Revenue",
        aggregationLabel: "Sum",
        isTimeSeries: false,
        semanticContext: {
          metric: "room_revenue",
          metricLabel: "Room Revenue",
          aggregation: "sum",
          aggregationLabel: "Sum",
          dimension: "room_type",
          dimensionLabel: "Room Type",
          chartType: "bar",
          datasetDomain: "hospitality",
        },
        generatedAt: 1,
      },
    },
    { category: "Room Type", value: "Room Revenue" }
  )!;

const marketNarrative: ParsedAnswerSections = {
  summary:
    "Downtown and Beach markets lead room revenue, while Suburban, Business District, and Airport markets trail.",
  statistical:
    "Market concentration shows Downtown at 24% of revenue and Beach at 22%.",
};

const segmentNarrative: ParsedAnswerSections = {
  summary:
    "Premium and SME customer segments drive nearly equal spend, while Corporate and Retail trail.",
  statistical:
    "Customer segment mix shows Premium at 28% and SME at 27% of total spend.",
};

describe("insight-chart-narrative-alignment", () => {
  it("detects Market narrative on a Room Type vertical bar chart", () => {
    const ctx = buildInsightChartNarrativeContext(roomTypePrep());
    expect(ctx?.dimensionLabel).toBe("Room Type");
    const stale = marketNarrative.summary!;
    expect(ctx).not.toBeNull();
    expect(insightNarrativeConflictsWithChart(stale, ctx!)).toBe(true);
  });

  it("replaces Market narrative with Room Type aligned summary (hospitality)", () => {
    const aligned = alignInsightPresentationToChart({
      chartPrep: roomTypePrep(),
      parsedInsightAnswer: marketNarrative,
      insightExecutiveBrief:
        "Beach and Downtown markets dominate hospitality revenue.",
      pdfInsightAnswer: marketNarrative.summary!,
    });
    const blob = [
      aligned.parsedInsightAnswer.summary,
      aligned.insightExecutiveBrief,
      aligned.pdfInsightAnswer,
    ]
      .join(" ")
      .toLowerCase();

    expect(aligned.usedChartAlignedFallback).toBe(true);
    expect(blob).toContain("room type");
    expect(blob).toContain("suite");
    expect(blob).not.toContain("downtown");
    expect(blob).not.toContain("beach");
    expect(blob).not.toContain("business district");
  });

  it("replaces Customer Segment narrative on Product Type horizontal bar (banking)", () => {
    const aligned = alignInsightPresentationToChart({
      chartPrep: productTypePrep(),
      parsedInsightAnswer: segmentNarrative,
      pdfInsightAnswer: segmentNarrative.summary!,
    });
    const blob = [
      aligned.parsedInsightAnswer.summary,
      aligned.parsedInsightAnswer.statistical,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    expect(aligned.usedChartAlignedFallback).toBe(true);
    expect(blob).toContain("product type");
    expect(blob).toContain("credit card");
    expect(blob).not.toContain("premium");
    expect(blob).not.toContain("customer segment");
  });

  it("leaves aligned narrative unchanged when chart categories already match", () => {
    const good: ParsedAnswerSections = {
      summary:
        "Credit Card leads Spend Amount by Product Type, followed by Term Deposit and Personal Loan.",
    };
    const aligned = alignInsightPresentationToChart({
      chartPrep: productTypePrep(),
      parsedInsightAnswer: good,
      pdfInsightAnswer: good.summary!,
    });
    expect(aligned.usedChartAlignedFallback).toBe(false);
    expect(aligned.parsedInsightAnswer.summary).toBe(good.summary);
  });

  it("live and PDF aligners share the same fallback for mismatched narrative", () => {
    const prep = roomTypePrep();
    const live = alignLiveInsightPresentation(
      { parsedInsightAnswer: marketNarrative },
      prep
    );
    const pdf = alignPdfNarrativeToChart({
      chartPrep: prep,
      pdfInsightAnswer: marketNarrative.summary!,
      insightExecutiveBrief: "",
      insightExecutiveVizInsights: [],
      parsedInsightAnswer: marketNarrative,
    });
    expect(live.parsedInsightAnswer.summary).toBe(pdf.parsedInsightAnswer.summary);
    expect(live.pdfInsightAnswer).toBe(pdf.pdfInsightAnswer);
  });

  it("buildLiveInsightChartPrep matches shared chart prep builder", () => {
    const snapshot = roomTypePrep();
    const fromLive = buildLiveInsightChartPrep(
      {
        id: "x",
        source: "ai",
        createdAt: 1,
        title: snapshot.chartTitle!,
        subtitle: snapshot.chartSubtitleMerged ?? null,
        chartKind: "bar",
        chartData: snapshot.chartData,
        visualization: null,
        question: "Room Revenue by Room Type",
        contract: snapshot.contract ?? null,
      } satisfies ChartSnapshot,
      { category: "Room Type", value: "Room Revenue" }
    );
    expect(fromLive?.chartAxisLabels?.category).toBe("Room Type");
    expect(fromLive?.chartData).toHaveLength(5);
  });
});

describe("live AI Insights UI wiring", () => {
  const pageSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../app/page.tsx"),
    "utf8"
  );

  it("applies shared insight presentation alignment in page.tsx", () => {
    expect(pageSrc).toContain("alignLiveInsightPresentation");
    expect(pageSrc).toContain("alignedInsightPresentation");
    expect(pageSrc).toContain("insightReasoningBlocksForDisplay");
    expect(pageSrc).toContain("resolveLiveInsightAnswerText");
  });
});
