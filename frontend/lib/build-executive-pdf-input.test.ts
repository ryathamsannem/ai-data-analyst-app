import { describe, expect, it } from "vitest";
import {
  buildExecutivePdfExportInput,
  chartIntelSliceFromSmartChart,
  executiveVizCardsToPdfFacts,
  routingPlanSliceForPdf,
  type BuildExecutivePdfInputParams,
} from "@/lib/build-executive-pdf-input";
import {
  isValidPdfChartArtifact,
  normalizePdfChartMetadataChips,
  pickPdfVizExecutiveFacts,
  pdfChartMetadataChipText,
  resolvePdfChartImageCandidate,
  shouldStartPdfChartOnFreshPage,
} from "@/app/pdf-report";
import type { SmartChartIntel } from "@/lib/smart-chart-intelligence";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";
import type { ChartArtifact } from "@/lib/chart-platform/chart-artifact";
import type { ChartPresentationMetadataChip } from "@/lib/chart-platform/chart-presentation-contract";
import { computePdfChartEmbedDimensions } from "@/lib/pdf-enterprise-style";

const sampleMetadataChips: ChartPresentationMetadataChip[] = [
  { id: "view", kind: "labeled", label: "View", value: "H-Bar" },
  { id: "measure", kind: "labeled", label: "Measure", value: "Revenue" },
  { id: "axis", kind: "labeled", label: "Axis", value: "City" },
];

const validArtifact = (overrides: Partial<ChartArtifact> = {}): ChartArtifact => ({
  requestId: "req-1",
  chartId: "chart-1",
  profile: "pdfChart",
  format: "png",
  dataUrl: "data:image/png;base64,abc",
  widthPx: 1200,
  heightPx: 800,
  contractVersion: 1,
  capturedAt: 1,
  diagnostics: {
    statusTimeline: [],
    resolvedKind: "bar",
    svgCount: 1,
    markCount: 3,
    measuredWidthPx: 900,
    measuredHeightPx: 600,
    rootWidthPx: 900,
    rootHeightPx: 600,
    svgWidthPx: 860,
    svgHeightPx: 520,
    responsiveContainerWidthPx: 860,
    responsiveContainerHeightPx: 520,
    layoutSampleCount: 3,
    retries: 0,
  },
  ...overrides,
});

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

  it("carries resolved profileLabel from mapping domain into dataset and exec summary", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      datasetKind: "generic",
      typeLabel: "Generic",
      mappingDomain: "real_estate",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.dataset.profileLabel).toBe("Real Estate / Property");
    expect(built.input.execSummaryLines[0]).toContain("Real Estate / Property");
    expect(built.input.execSummaryLines[0]).not.toContain("General business");
  });

  it("keeps banking dataset_kind label without regression", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      datasetKind: "banking",
      typeLabel: "Banking / Financial Services",
      mappingDomain: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.dataset.profileLabel).toBe("Banking / Financial Services");
    expect(built.input.execSummaryLines[0]).toContain("Banking / Financial Services");
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

  it("assembles preview-only duplicate quality metadata with file row context", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      options: {
        ...baseParams().options,
        includeDataQuality: true,
      },
      preview: [
        { city: "A", revenue: 1 },
        { city: "A", revenue: 1 },
      ],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const dup = built.input.previewDuplicates();
    expect(dup.label).toMatch(/preview check/i);
    expect(dup.note).toMatch(/not a full-file duplicate audit/i);
    expect(dup.note).toMatch(/100 file rows/i);
  });

  it("respects Export tab flags when reportPreset is not insight", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      options: {
        ...baseParams().options,
        includeDataPreview: true,
        includeConversationContext: true,
        includeDataQuality: true,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.includes.includeDataPreview).toBe(true);
    expect(built.input.includes.includeConversationContext).toBe(true);
    expect(built.input.includes.includeDataQuality).toBe(true);
    expect(built.input.includes.reportPreset).toBeUndefined();
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

  it("carries chartArtifact through chart prep", () => {
    const artifact = validArtifact();
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      chartPrep: {
        presentationKind: "bar",
        chartData: [{ name: "Mumbai", value: 100 }],
        chartTitle: "Revenue by city",
        chartSubtitleMerged: "Grouped comparison",
        exportDisplayTitle: "Revenue by city",
        trendMode: false,
        contract: undefined,
        rankedSignals: null,
        metricColumn: "revenue",
        alignedMetricDisplay: "Revenue",
        aggregation: "sum",
        chartInsightBadge: null,
        chartAxisLabels: { category: "City", value: "Revenue" },
        metadataChips: sampleMetadataChips,
        chartArtifact: artifact,
        captureEl: null,
        chartAttribution: null,
        provenanceSlice: null,
        metricType: null,
        roundingHint: null,
        vizMetricType: null,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.chart?.chartArtifact).toBe(artifact);
    expect(built.input.chart?.metadataChips).toEqual(sampleMetadataChips);
    expect(built.input.chart?.captureEl).toBeNull();
  });

  it("works when metadata chips are missing", () => {
    const built = buildExecutivePdfExportInput({
      ...baseParams(),
      chartPrep: {
        presentationKind: "bar",
        chartData: [{ name: "Mumbai", value: 100 }],
        chartTitle: "Revenue by city",
        chartSubtitleMerged: "Grouped comparison",
        exportDisplayTitle: "Revenue by city",
        trendMode: false,
        contract: undefined,
        rankedSignals: null,
        metricColumn: "revenue",
        alignedMetricDisplay: "Revenue",
        aggregation: "sum",
        chartInsightBadge: null,
        chartAxisLabels: { category: "City", value: "Revenue" },
        captureEl: null,
        chartAttribution: null,
        provenanceSlice: null,
        metricType: null,
        roundingHint: null,
        vizMetricType: null,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.chart?.metadataChips).toBeNull();
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

describe("PDF chart artifact selection", () => {
  it("prefers a valid artifact over legacy captureEl", () => {
    const artifact = validArtifact();
    const legacyEl = {} as HTMLElement;
    expect(isValidPdfChartArtifact(artifact)).toBe(true);
    expect(
      resolvePdfChartImageCandidate({ artifact, captureEl: legacyEl })
    ).toMatchObject({
      source: "artifact",
      dataUrl: artifact.dataUrl,
      width: artifact.widthPx,
      height: artifact.heightPx,
    });
  });

  it("falls back when artifact is missing", () => {
    const legacyEl = {} as HTMLElement;
    expect(
      resolvePdfChartImageCandidate({ artifact: null, captureEl: legacyEl })
    ).toEqual({ source: "legacy", captureEl: legacyEl });
  });

  it("rejects invalid artifacts instead of embedding blank images", () => {
    const invalid = validArtifact({
      widthPx: 0,
      diagnostics: {
        ...validArtifact().diagnostics,
        markCount: 0,
        failureReason: "missing_marks",
      },
    });
    expect(isValidPdfChartArtifact(invalid)).toBe(false);
    expect(
      resolvePdfChartImageCandidate({ artifact: invalid, captureEl: null })
    ).toEqual({ source: "empty" });
  });
});

describe("PDF chart metadata chips", () => {
  it("formats labeled and mono chips for PDF-native rendering", () => {
    expect(pdfChartMetadataChipText(sampleMetadataChips[0]!)).toBe("View: H-Bar");
    expect(
      pdfChartMetadataChipText({ id: "badge", kind: "mono", value: "3 groups" })
    ).toBe("3 groups");
  });

  it("filters blank chips and tolerates missing chips", () => {
    expect(normalizePdfChartMetadataChips(null)).toEqual([]);
    expect(
      normalizePdfChartMetadataChips([
        ...sampleMetadataChips,
        { id: "blank", kind: "mono", value: " " },
      ])
    ).toEqual(sampleMetadataChips);
  });

  it("replaces Category: Category with the chart dimension label", () => {
    expect(
      pdfChartMetadataChipText(
        normalizePdfChartMetadataChips(
          [{ id: "axis", kind: "labeled", label: "Category", value: "Category" }],
          { dimensionFallback: "Product Type" }
        )[0]!
      )
    ).toBe("Category: Product Type");
    expect(
      normalizePdfChartMetadataChips(
        [{ id: "axis", kind: "labeled", label: "Category", value: "Category" }]
      )
    ).toEqual([]);
  });
});

describe("PDF chart embed sizing", () => {
  it("keeps H-Bar sizing stable with generic defaults", () => {
    const sized = computePdfChartEmbedDimensions(1100, 900, 180, 158, 0.74);
    expect(sized.heightMm).toBeLessThanOrEqual(158);
    expect(sized.widthMm).toBeGreaterThanOrEqual(180 * 0.74);
  });

  it("honors smaller donut cap and lower width ratio", () => {
    const sized = computePdfChartEmbedDimensions(1400, 720, 180, 108, 0.58, {
      minAspectRatio: 0.42,
      maxAspectRatio: 1.6,
    });
    expect(sized.heightMm).toBeLessThanOrEqual(108);
    expect(sized.widthMm).toBeGreaterThanOrEqual(180 * 0.58);
  });

  it("allows wider line and area placement", () => {
    const sized = computePdfChartEmbedDimensions(1200, 800, 180, 158, 0.9, {
      minAspectRatio: 0.36,
      maxAspectRatio: 2.1,
    });
    expect(sized.widthMm).toBeGreaterThanOrEqual(180 * 0.9);
    expect(sized.heightMm).toBeLessThanOrEqual(158);
  });

  it("starts crowded line and area PDF chart images on a fresh page only for trend charts", () => {
    expect(shouldStartPdfChartOnFreshPage("line", 106.9)).toBe(true);
    expect(shouldStartPdfChartOnFreshPage("area", 88)).toBe(true);
    expect(shouldStartPdfChartOnFreshPage("line", 107)).toBe(false);
    expect(shouldStartPdfChartOnFreshPage("area", 118)).toBe(false);

    expect(shouldStartPdfChartOnFreshPage("scatter", 88)).toBe(false);
    expect(shouldStartPdfChartOnFreshPage("bar_horizontal", 88)).toBe(false);
    expect(shouldStartPdfChartOnFreshPage("donut", 88)).toBe(false);
  });

  it("keeps scatter larger and balanced", () => {
    const sized = computePdfChartEmbedDimensions(1400, 900, 180, 150, 0.86, {
      minAspectRatio: 0.62,
      maxAspectRatio: 1.55,
    });
    expect(sized.widthMm).toBeGreaterThanOrEqual(180 * 0.86);
    expect(sized.heightMm / sized.widthMm).toBeGreaterThanOrEqual(0.62);
  });
});
