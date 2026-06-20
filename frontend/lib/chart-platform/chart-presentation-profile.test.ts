import { describe, expect, it } from "vitest";
import { buildChartPresentationContract } from "@/lib/chart-platform/build-chart-contract";
import {
  buildChartPresentationProfile,
  formatChartPresentationProfileSummary,
  resolvePdfChartEmbedPolicy,
} from "@/lib/chart-platform/chart-presentation-profile";
import { buildPresentationExportSpec } from "@/lib/chart-png-export-layout";

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

  it("mirrors existing PNG export dimensions without changing them", () => {
    const spec = buildPresentationExportSpec("bar_horizontal", {
      categoryCount: 2,
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
      maxHeightMm: 150,
      minWidthRatio: 0.88,
    });
  });
});
