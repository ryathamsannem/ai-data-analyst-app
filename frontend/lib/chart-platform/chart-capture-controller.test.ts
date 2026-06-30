import { describe, expect, it } from "vitest";
import { buildChartPresentationContract } from "@/lib/chart-platform/build-chart-contract";
import {
  createChartPngCaptureRequest,
  pdfChartScatterUsesContentTightComposite,
  pdfChartUsesContentTightComposite,
} from "@/lib/chart-platform/chart-capture-controller";
import {
  PRESENTATION_EXPORT_COMPACT_WIDTH_PX,
  PRESENTATION_EXPORT_WIDTH_PX,
  STANDALONE_PNG_TREND_WIDTH_SPARSE_PX,
  STANDALONE_PNG_VBAR_WIDTH_MODERATE_PX,
} from "@/lib/chart-png-export-layout";

describe("pdfChartUsesContentTightComposite", () => {
  it("enables content-tight composite for pdfChart scatter, vertical bar, and histogram", () => {
    expect(pdfChartUsesContentTightComposite("pdfChart", "scatter")).toBe(true);
    expect(pdfChartUsesContentTightComposite("pdfChart", "bar")).toBe(true);
    expect(pdfChartUsesContentTightComposite("pdfChart", "histogram")).toBe(
      true
    );
    expect(pdfChartUsesContentTightComposite("pdfChart", "line")).toBe(false);
    expect(pdfChartUsesContentTightComposite("pdfChart", "area")).toBe(false);
    expect(pdfChartUsesContentTightComposite("pdfChart", "bar_horizontal")).toBe(
      false
    );
    expect(pdfChartUsesContentTightComposite("pdfChart", "donut")).toBe(false);
    expect(pdfChartUsesContentTightComposite("chartsPng", "bar")).toBe(false);
    expect(pdfChartUsesContentTightComposite("overviewPng", "bar")).toBe(false);
  });

  it("keeps scatter alias aligned with combined helper", () => {
    expect(pdfChartScatterUsesContentTightComposite("pdfChart", "scatter")).toBe(
      pdfChartUsesContentTightComposite("pdfChart", "scatter")
    );
  });
});

describe("createChartPngCaptureRequest", () => {
  const contract = buildChartPresentationContract({
    chartId: "chart-1",
    source: "charts",
    apiChartType: "bar",
    resolvedKind: "bar",
    title: "Credit Utilization by Customer Segment",
    rows: Array.from({ length: 5 }, (_, i) => ({
      name: `Segment ${i + 1}`,
      value: 10 + i,
    })),
  });

  it("uses category-aware width for chartsPng bar exports", () => {
    const request = createChartPngCaptureRequest({
      contract,
      profile: "chartsPng",
      sourceSurface: "charts",
      kind: "bar",
      categoryCount: 5,
      filename: "chart.png",
    });
    expect(request.layout.width).toBe(STANDALONE_PNG_VBAR_WIDTH_MODERATE_PX);
    expect(request.layout.width).toBeLessThan(PRESENTATION_EXPORT_WIDTH_PX);
  });

  it("keeps pdfChart bar export width unchanged", () => {
    const request = createChartPngCaptureRequest({
      contract,
      profile: "pdfChart",
      sourceSurface: "pdf",
      kind: "bar",
      categoryCount: 5,
      filename: "chart.png",
    });
    expect(request.layout.width).toBe(PRESENTATION_EXPORT_WIDTH_PX);
  });

  it("uses category-aware width for chartsPng line exports", () => {
    const lineContract = buildChartPresentationContract({
      chartId: "line-1",
      source: "charts",
      apiChartType: "line",
      resolvedKind: "line",
      title: "Monthly Enrollment Count Trend",
      rows: Array.from({ length: 6 }, (_, i) => ({
        name: `M${i + 1}`,
        value: 10 + i,
      })),
    });
    const request = createChartPngCaptureRequest({
      contract: lineContract,
      profile: "chartsPng",
      sourceSurface: "charts",
      kind: "line",
      categoryCount: 6,
      filename: "trend.png",
    });
    expect(request.layout.width).toBe(STANDALONE_PNG_TREND_WIDTH_SPARSE_PX);
    expect(request.layout.width).toBeLessThan(PRESENTATION_EXPORT_COMPACT_WIDTH_PX);
  });

  it("keeps pdfChart line export width unchanged", () => {
    const lineContract = buildChartPresentationContract({
      chartId: "line-1",
      source: "charts",
      apiChartType: "line",
      resolvedKind: "line",
      title: "Monthly Enrollment Count Trend",
      rows: Array.from({ length: 6 }, (_, i) => ({
        name: `M${i + 1}`,
        value: 10 + i,
      })),
    });
    const request = createChartPngCaptureRequest({
      contract: lineContract,
      profile: "pdfChart",
      sourceSurface: "pdf",
      kind: "line",
      categoryCount: 6,
      filename: "trend.png",
    });
    expect(request.layout.width).toBe(PRESENTATION_EXPORT_COMPACT_WIDTH_PX);
  });
});
