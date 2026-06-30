import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  estimatePdfVizAnalysisContextHeight,
  estimatePdfVizPresentationHeaderHeightMm,
  PDF_VIZ_SECTION_TITLE_BLOCK_MM,
  pdfVizChartCohesionMinHeightMm,
  shouldStartPdfVisualizationBlockOnFreshPage,
} from "@/app/pdf-report";

const pdfReportSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/pdf-report.ts"),
  "utf8"
);

describe("pdf visualization layout cohesion", () => {
  it("requests fresh page when full Visualization block would not fit", () => {
    const footerY = 280;
    const metaRows = 5;
    const insights = 24;
    const header = estimatePdfVizPresentationHeaderHeightMm(3);
    const needed =
      PDF_VIZ_SECTION_TITLE_BLOCK_MM +
      header +
      estimatePdfVizAnalysisContextHeight(metaRows) +
      pdfVizChartCohesionMinHeightMm() +
      insights;
    const yTight = footerY - needed + 2;
    expect(
      shouldStartPdfVisualizationBlockOnFreshPage({
        y: yTight,
        footerY,
        metaRowCount: metaRows,
        insightsReserveMm: insights,
        presentationHeaderMm: header,
      })
    ).toBe(true);
    expect(
      shouldStartPdfVisualizationBlockOnFreshPage({
        y: 8,
        footerY,
        metaRowCount: 0,
        insightsReserveMm: 0,
        presentationHeaderMm: estimatePdfVizPresentationHeaderHeightMm(0),
      })
    ).toBe(false);
  });

  it("starts Visualization block before section title when cohesion guard fires", () => {
    const vizStart = pdfReportSrc.indexOf("/* -------- Chart -------- */");
    const sectionTitleIdx = pdfReportSrc.indexOf(
      'sectionTitle("Visualization")',
      vizStart
    );
    const guardIdx = pdfReportSrc.indexOf(
      "shouldStartPdfVisualizationBlockOnFreshPage",
      vizStart
    );
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(sectionTitleIdx);
  });

  it("does not orphan chart embed on cohesion min-height alone", () => {
    const embedIdx = pdfReportSrc.indexOf("const embedCenteredChartImage");
    const embedSlice = pdfReportSrc.slice(embedIdx, embedIdx + 1200);
    expect(embedSlice).not.toContain("availableMm < pdfVizChartCohesionMinHeightMm()");
  });

  it("keeps sample data appendix after visualization in render path", () => {
    const vizIdx = pdfReportSrc.indexOf('sectionTitle("Visualization")');
    const previewIdx = pdfReportSrc.indexOf('sectionTitle("Appendix: Sample data")');
    const drawPreviewIdx = pdfReportSrc.indexOf("drawDataPreviewSection();");
    expect(vizIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(-1);
    expect(drawPreviewIdx).toBeGreaterThan(vizIdx);
    expect(pdfReportSrc.indexOf("drawDataPreviewSection();", vizIdx)).toBe(
      drawPreviewIdx
    );
  });
});
