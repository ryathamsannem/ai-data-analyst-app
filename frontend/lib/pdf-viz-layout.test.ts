import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  estimatePdfVizAnalysisContextHeight,
  pdfVizChartCohesionMinHeightMm,
  shouldStartPdfVizCoreOnFreshPage,
} from "@/app/pdf-report";

const pdfReportSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/pdf-report.ts"),
  "utf8"
);

describe("pdf visualization layout cohesion", () => {
  it("estimates analysis context block height from row count", () => {
    expect(estimatePdfVizAnalysisContextHeight(0)).toBe(0);
    expect(estimatePdfVizAnalysisContextHeight(5)).toBeGreaterThan(30);
  });

  it("requests fresh page when metadata + chart minimum would not fit", () => {
    const footerY = 280;
    const metaRows = 5;
    const insights = 24;
    const chartMin = pdfVizChartCohesionMinHeightMm();
    const needed =
      estimatePdfVizAnalysisContextHeight(metaRows) + chartMin + insights;
    const yTight = footerY - needed + 2;
    expect(
      shouldStartPdfVizCoreOnFreshPage({
        y: yTight,
        footerY,
        metaRowCount: metaRows,
        insightsReserveMm: insights,
      })
    ).toBe(true);
    expect(
      shouldStartPdfVizCoreOnFreshPage({
        y: 40,
        footerY,
        metaRowCount: metaRows,
        insightsReserveMm: insights,
      })
    ).toBe(false);
  });

  it("draws analysis context atomically without per-row mutedLine page breaks", () => {
    const vizSection = pdfReportSrc.slice(
      pdfReportSrc.indexOf('sectionTitle("Visualization")'),
      pdfReportSrc.indexOf("const embedCenteredChartImage")
    );
    expect(vizSection).toContain("drawMutedMetaLine");
    expect(vizSection).toContain("shouldStartPdfVizCoreOnFreshPage");
    expect(vizSection).toContain(
      "estimatePdfVizAnalysisContextHeight(metaRows.length)"
    );
    expect(vizSection).not.toMatch(
      /metaRows\.forEach\(\(\[label, value\]\) => \{\s*mutedLine/
    );
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
