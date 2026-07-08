import { describe, expect, it } from "vitest";
import { buildChartPresentationContract } from "@/lib/chart-platform/build-chart-contract";
import {
  buildChartPresentationProfile,
  formatChartPresentationProfileSummary,
  resolvePdfChartEmbedPolicy,
} from "@/lib/chart-platform/chart-presentation-profile";
import { buildPresentationExportSpec, PRESENTATION_EXPORT_COMPACT_WIDTH_PX, PRESENTATION_EXPORT_WIDTH_PX } from "@/lib/chart-png-export-layout";

const contract = buildChartPresentationContract({
  chartId: "chart-1",
  source: "auto_dashboard",
  apiChartType: "bar_horizontal",
  resolvedKind: "bar_horizontal",
  title: "Revenue by city",
  rows: [
    { name: "Mumbai", value: 100 },
    { name: "Delhi", value: 80 },
  ],
});

describe("ChartPresentationProfile", () => {
  it("defines live profiles without owning capture dimensions", () => {
    const profile = buildChartPresentationProfile({
      id: "overviewLive",
      contract,
      kind: "bar_horizontal",
    });

    expect(profile.surface).toBe("overview");
    expect(profile.captureWidth).toBeNull();
    expect(profile.canvasHeight).toBeNull();
    expect(profile.aspectPolicy).toBe("compact-card");
    expect(profile.metadataMode).toBe("compact-contract-chips");
  });

  it("mirrors standalone PNG export dimensions for chartsPng profile", () => {
    const spec = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 2,
      exportProfile: "chartsPng",
    });
    const profile = buildChartPresentationProfile({
      id: "chartsPng",
      contract,
      kind: "bar_horizontal",
      categoryCount: 2,
      spec,
    });

    expect(profile.captureWidth).toBe(spec.width);
    expect(profile.captureHeight).toBe(spec.height);
    expect(profile.plotHeight).toBe(spec.height);
    expect(profile.canvasWidth).toBe(spec.canvasWidth);
    expect(profile.canvasHeight).toBe(spec.canvasHeight);
    expect(profile.aspectPolicy).toBe("presentation-canvas");
  });

  it("keeps pdfChart export widths unchanged for low-category bar charts", () => {
    const pdfBar = buildPresentationExportSpec("bar", { categoryCount: 5 });
    expect(pdfBar.canvasWidth).toBe(PRESENTATION_EXPORT_WIDTH_PX);

    const pdfHBar = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 5,
    });
    expect(pdfHBar.canvasWidth).toBe(1100);

    const pdfProfile = buildChartPresentationProfile({
      id: "pdfChart",
      contract,
      kind: "bar",
      categoryCount: 5,
    });
    expect(pdfProfile.canvasWidth).toBe(PRESENTATION_EXPORT_WIDTH_PX);
    expect(pdfProfile.pdfEmbed).toEqual(resolvePdfChartEmbedPolicy("bar"));
  });

  it("keeps pdfChart export widths unchanged for line, area, and histogram", () => {
    expect(
      buildPresentationExportSpec("line", { categoryCount: 6 }).canvasWidth
    ).toBe(PRESENTATION_EXPORT_COMPACT_WIDTH_PX);
    expect(
      buildPresentationExportSpec("area", { categoryCount: 12 }).canvasWidth
    ).toBe(PRESENTATION_EXPORT_COMPACT_WIDTH_PX);
    expect(
      buildPresentationExportSpec("histogram", { categoryCount: 6 }).canvasWidth
    ).toBe(PRESENTATION_EXPORT_WIDTH_PX);

    const pdfLine = buildChartPresentationProfile({
      id: "pdfChart",
      contract: buildChartPresentationContract({
        chartId: "line-1",
        source: "charts",
        apiChartType: "line",
        resolvedKind: "line",
        title: "Trend",
        rows: Array.from({ length: 6 }, (_, i) => ({
          name: `M${i + 1}`,
          value: i,
        })),
      }),
      kind: "line",
      categoryCount: 6,
    });
    expect(pdfLine.canvasWidth).toBe(PRESENTATION_EXPORT_COMPACT_WIDTH_PX);
    expect(pdfLine.pdfEmbed).toEqual(resolvePdfChartEmbedPolicy("line"));
  });

  it("captures known profile mismatches as read-only diagnostics data", () => {
    const overview = buildChartPresentationProfile({
      id: "overviewPng",
      contract,
      kind: "bar_horizontal",
    });
    const charts = buildChartPresentationProfile({
      id: "chartsPng",
      contract,
      kind: "bar_horizontal",
    });
    const pdf = buildChartPresentationProfile({
      id: "pdfChart",
      contract,
      kind: "bar_horizontal",
    });

    expect(overview.axisPolicyId).toBe("overview-inline:horizontal-bar:v1");
    expect(charts.axisPolicyId).toBe("chart-renderer:horizontal-bar:v1");
    expect(pdf.metadataMode).toBe("pdf-native-context");
    expect(pdf.pdfEmbed).toEqual(resolvePdfChartEmbedPolicy("bar_horizontal"));
    expect(formatChartPresentationProfileSummary(pdf)).toMatchObject({
      id: "pdfChart",
      surface: "pdf",
      pdfMaxHeightMm: 158,
    });
  });

  it("resolves pdfChart embed policies by chart kind", () => {
    expect(resolvePdfChartEmbedPolicy("bar_horizontal")).toMatchObject({
      maxHeightMm: 158,
      minWidthRatio: 0.74,
    });
    expect(resolvePdfChartEmbedPolicy("donut")).toMatchObject({
      maxHeightMm: 108,
      minWidthRatio: 0.58,
    });
    expect(resolvePdfChartEmbedPolicy("line")).toMatchObject({
      maxHeightMm: 158,
      minWidthRatio: 0.9,
    });
    expect(resolvePdfChartEmbedPolicy("area")).toMatchObject({
      maxHeightMm: 158,
      minWidthRatio: 0.9,
    });
    expect(resolvePdfChartEmbedPolicy("scatter")).toMatchObject({
      maxHeightMm: 150,
      minWidthRatio: 0.92,
    });
    expect(resolvePdfChartEmbedPolicy("bar")).toMatchObject({
      maxHeightMm: 158,
      minWidthRatio: 0.88,
      minAspectRatio: 0.58,
    });
    expect(resolvePdfChartEmbedPolicy("histogram")).toEqual(
      resolvePdfChartEmbedPolicy("bar")
    );
  });
});
