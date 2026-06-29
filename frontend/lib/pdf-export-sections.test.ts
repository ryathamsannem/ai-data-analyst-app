import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pdfReportSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/pdf-report.ts"),
  "utf8"
);

describe("pdf-report optional sections", () => {
  it("renders advanced sections from include flags without analyst-only gate", () => {
    expect(pdfReportSrc).toContain(
      'if (input.includes.includeConversationContext)'
    );
    expect(pdfReportSrc).toContain('if (input.includes.includeDataQuality)');
    expect(pdfReportSrc).toContain(
      'if (input.includes.includeTechnicalAppendix)'
    );
    expect(pdfReportSrc).not.toMatch(
      /analystPdf && input\.includes\.includeDataQuality/
    );
    expect(pdfReportSrc).not.toMatch(
      /analystPdf && input\.includes\.includeConversationContext/
    );
    expect(pdfReportSrc).not.toMatch(
      /analystPdf && input\.includes\.includeTechnicalAppendix/
    );
  });

  it("places sample data appendix after visualization", () => {
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

  it("dedupes KPI dashboard cards against the executive snapshot strip", () => {
    expect(pdfReportSrc).toContain("shouldRenderPdfKpiDashboardSection");
    expect(pdfReportSrc).toMatch(
      /if \(shouldRenderPdfKpiDashboardSection\(input\.kpiCards\)\)/
    );
  });
});
