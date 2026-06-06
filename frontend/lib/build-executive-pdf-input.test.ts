import { describe, expect, it } from "vitest";
import {
  buildExecutivePdfExportInput,
  chartIntelSliceFromSmartChart,
  executiveVizCardsToPdfFacts,
  routingPlanSliceForPdf,
  type BuildExecutivePdfInputParams,
} from "@/lib/build-executive-pdf-input";
import { pickPdfVizExecutiveFacts } from "@/app/pdf-report";
import type { SmartChartIntel } from "@/lib/smart-chart-intelligence";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";

const baseParams = (): BuildExecutivePdfInputParams => ({
  options: {
    includeKPIs: true,
    includeAIInsight: true,
    includeChart: true,
    includeDataPreview: false,
    includeDataQuality: false,
  },
  chartScope: "insight",
  chartPrep: null,
  reportBranding: {
    companyName: "Acme",
    tagline: "",
    accentHex: "#2563eb",
  },
  mappingConfidence: "High",
  rows: 100,
  columns: ["city", "revenue"],
  datasetKind: "sales",
  profile: { column_types: { city: "category", revenue: "number" } },
  preview: [],
  kpis: { total_rows: 100, total_columns: 2 },
  alignedAnalysis: {
    focusKpis: [{ title: "Total revenue", value: "1.2M" }],
    insightConfidenceLevel: "High",
    insightConfidenceRationale: "Strong cohort coverage across cities.",
    routingPlan: {
      intent: "executive",
      executiveLens: "risk",
      metricColumn: "revenue",
      dimensionColumn: "city",
    },
  },
  pdfAlignedAnalysis: {
    insightConfidenceLevel: "High",
    insightConfidenceRationale: "Strong cohort coverage across cities.",
    routingPlan: {
      intent: "executive",
      executiveLens: "risk",
    },
  },
  question: "What are the biggest risks?",
  lastAskedQuestion: "What are the biggest risks?",
  pdfInsightAnswer: "Risk summary line.",
  parsedInsightAnswer: { summary: "Risk summary line." },
  insightExecutiveBrief: "Executive brief line.",
  insightExecutiveVizInsights: [
    {
      key: "risk-1",
      title: "Growth Risk",
      value: "West region trails peers",
      hint: "Concentration signal",
      dotClass: "bg-rose-500",
    },
  ],
  executiveVizInsights: [],
  insightSmartChartIntel: null,
  sessionSmartChartIntel: null,
  displayKpiCards: [],
  insightNarrativeTone: "neutral",
  insightNarrativeDisclaimer: null,
  chartHistory: [],
  conversationAppendix: null,
});

describe("buildExecutivePdfExportInput", () => {
  it("returns expected ExecutivePdfExportInput shape", () => {
    const built = buildExecutivePdfExportInput(baseParams());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const input = built.input;
    expect(input.kpiCards).toHaveLength(1);
    expect(input.execSummaryLines.length).toBeGreaterThan(0);
    expect(input.insightSections?.summary).toContain("Risk");
    expect(input.insightConfidenceRationale).toContain("cohort");
    expect(input.routingPlan?.intent).toBe("executive");
    expect(input.routingPlan?.executiveLens).toBe("risk");
    expect(input.vizExecutiveFacts?.[0]?.title).toBe("Growth Risk");
    expect(input.includes.pdfMode).toBe("executive");
  });

  it("defaults analyst mode to technical appendix", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      options: {
        ...baseParams().options,
        pdfMode: "analyst",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.includes.pdfMode).toBe("analyst");
    expect(built.input.includes.includeTechnicalAppendix).toBe(true);
  });

  it("passes includeDataPreview when enabled in executive mode", () => {
    const rows = [
      { city: "Mumbai", revenue: 100 },
      { city: "Delhi", revenue: 80 },
    ];
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      options: {
        ...baseParams().options,
        includeDataPreview: true,
      },
      preview: rows,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.includes.includeDataPreview).toBe(true);
    expect(built.input.preview.rows).toHaveLength(2);
    expect(built.input.preview.columns).toEqual(["city", "revenue"]);
  });

  it("passes advanced section flags in executive mode when selected", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      options: {
        ...baseParams().options,
        includeDataQuality: true,
        includeConversationContext: true,
        includeTechnicalAppendix: true,
        pdfMode: "executive",
      },
      conversationAppendix: {
        questionThread: ["Which city contributes most revenue?"],
        inheritedFilters: [],
        activeDrillPath: [],
        inheritedAssumptionNote: null,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.includes.pdfMode).toBe("executive");
    expect(built.input.includes.includeDataQuality).toBe(true);
    expect(built.input.includes.includeConversationContext).toBe(true);
    expect(built.input.includes.includeTechnicalAppendix).toBe(true);
  });

  it("passes UI-built risk/opportunity cards unchanged to PDF facts", () => {
    const cards: ExecutiveVizInsightCard[] = [
      {
        key: "opp-1",
        title: "Growth Opportunity",
        value: "Mumbai leads revenue",
        dotClass: "bg-emerald-500",
      },
    ];
    const facts = executiveVizCardsToPdfFacts(cards);
    expect(facts).toEqual([
      { title: "Growth Opportunity", value: "Mumbai leads revenue", hint: undefined },
    ]);
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      insightExecutiveVizInsights: cards,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.vizExecutiveFacts).toEqual(facts);
  });

  it("includes chartIntel when smart chart intel is active", () => {
    const intel: SmartChartIntel = {
      active: true,
      recommendedKind: "bar",
      histogramStyle: false,
      recommendedLabel: "Vertical bar chart",
      recommendationBlurb: "Best for category comparison.",
      currentKind: "bar",
      currentLabel: "Vertical bar chart",
      suggestedKind: "bar",
      suggestedLabel: "Vertical bar chart",
      alignsWithRecommendation: true,
      whyThisChart: "Grouped comparison across categories.",
      anomalyNote: null,
    };
    const slice = chartIntelSliceFromSmartChart(intel);
    expect(slice?.whyThisChart).toContain("Grouped comparison");
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      insightSmartChartIntel: intel,
    });
    if (!built.ok) return;
    expect(built.input.chartIntel?.whyThisChart).toBe(intel.whyThisChart);
  });

  it("maps routing plan slice without hardcoded dimension values", () => {
    const slice = routingPlanSliceForPdf({
      intent: "profitability",
      metricColumn: "profit",
      unsupportedReason: "Missing dimension",
    });
    expect(slice?.intent).toBe("profitability");
    expect(slice?.metricColumn).toBe("profit");
    expect(slice?.unsupportedReason).toBe("Missing dimension");
  });
});

describe("pickPdfVizExecutiveFacts", () => {
  it("prefers UI facts and skips chart derivation when present", () => {
    const ui = [{ title: "Growth Risk", value: "West trails" }];
    const derived = [{ title: "Derived leader", value: "99" }];
    expect(pickPdfVizExecutiveFacts(ui, derived)).toEqual(ui);
  });

  it("falls back to derived facts only when UI facts are empty", () => {
    const derived = [{ title: "Derived leader", value: "99" }];
    expect(pickPdfVizExecutiveFacts([], derived)).toEqual(derived);
    expect(pickPdfVizExecutiveFacts(undefined, derived)).toEqual(derived);
  });
});
