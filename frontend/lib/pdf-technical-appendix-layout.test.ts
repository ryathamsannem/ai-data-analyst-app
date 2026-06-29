import { describe, expect, it } from "vitest";
import {
  PDF_TECHNICAL_APPENDIX_MIN_START_MM,
  PDF_TECHNICAL_APPENDIX_SECTION_TITLE,
  pdfTechnicalAppendixIntro,
  pdfTechnicalAppendixSeriesSampleCaption,
  shouldRenderPdfTechnicalAppendixSeriesTable,
  shouldRenderPdfTechnicalAppendixThumbnails,
  shouldStartTechnicalAppendixOnNewPage,
} from "@/lib/pdf-technical-appendix-layout";

describe("pdf-technical-appendix-layout", () => {
  it("uses the SaaS-friendly appendix section title", () => {
    expect(PDF_TECHNICAL_APPENDIX_SECTION_TITLE).toBe(
      "Appendix: Technical details"
    );
  });

  it("uses executive-friendly intro copy by default", () => {
    expect(pdfTechnicalAppendixIntro(false)).toMatch(/audit|validation/i);
    expect(pdfTechnicalAppendixIntro(false)).not.toMatch(/data-team handoff/i);
  });

  it("keeps longer analyst intro when analyst mode is selected", () => {
    expect(pdfTechnicalAppendixIntro(true)).toMatch(/data-team handoff/i);
  });

  it("does not force a new page when enough room remains", () => {
    const footerY = 280;
    const y = footerY - PDF_TECHNICAL_APPENDIX_MIN_START_MM - 10;
    expect(shouldStartTechnicalAppendixOnNewPage(y, footerY)).toBe(false);
  });

  it("starts on a new page when heading would orphan", () => {
    const footerY = 280;
    const y = footerY - PDF_TECHNICAL_APPENDIX_MIN_START_MM + 2;
    expect(shouldStartTechnicalAppendixOnNewPage(y, footerY)).toBe(true);
  });

  it("hides thumbnails in executive mode when chart is already embedded", () => {
    expect(
      shouldRenderPdfTechnicalAppendixThumbnails({
        analystPdf: false,
        chartEmbedded: true,
        thumbCount: 2,
      })
    ).toBe(false);
    expect(
      shouldRenderPdfTechnicalAppendixThumbnails({
        analystPdf: false,
        chartEmbedded: false,
        thumbCount: 2,
      })
    ).toBe(true);
  });

  it("keeps thumbnails in analyst mode", () => {
    expect(
      shouldRenderPdfTechnicalAppendixThumbnails({
        analystPdf: true,
        chartEmbedded: true,
        thumbCount: 2,
      })
    ).toBe(true);
  });

  it("omits series table in executive mode", () => {
    expect(shouldRenderPdfTechnicalAppendixSeriesTable({ analystPdf: false })).toBe(
      false
    );
    expect(shouldRenderPdfTechnicalAppendixSeriesTable({ analystPdf: true })).toBe(
      true
    );
  });

  it("points executive readers to visualization for embedded series", () => {
    expect(pdfTechnicalAppendixSeriesSampleCaption(3, true)).toMatch(
      /Visualization section/i
    );
  });
});
