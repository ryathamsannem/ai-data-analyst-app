import { PDF_SPACING } from "@/lib/pdf-enterprise-style";

/** Major-section title — aligns with "Appendix: Sample data". */
export const PDF_TECHNICAL_APPENDIX_SECTION_TITLE =
  "Appendix: Technical details";

/** Minimum vertical space (mm) for section title + intro + first metadata block. */
export const PDF_TECHNICAL_APPENDIX_MIN_START_MM = 58;

export function pdfTechnicalAppendixIntro(analystPdf: boolean): string {
  if (analystPdf) {
    return "Full calculation, routing, and chart metadata for data-team handoff. Omit this section for executive-only distribution.";
  }
  return "Supplementary reference for calculations, routing decisions, and chart metadata—useful for audit and validation.";
}

export function pdfTechnicalAppendixEmptyBody(): string {
  return "No supplementary technical metadata is available for this export.";
}

export function pdfTechnicalAppendixVisualizationKicker(): string {
  return "Attribution";
}

/** Start a new page when the appendix heading would orphan at the bottom. */
export function shouldStartTechnicalAppendixOnNewPage(
  y: number,
  footerY: number,
  pageSafeMm: number = PDF_SPACING.pageSafe,
  minStartMm: number = PDF_TECHNICAL_APPENDIX_MIN_START_MM
): boolean {
  return y + minStartMm > footerY - pageSafeMm;
}

export function shouldRenderPdfTechnicalAppendixThumbnails(args: {
  analystPdf: boolean;
  chartEmbedded: boolean;
  thumbCount: number;
}): boolean {
  if (args.thumbCount < 1) return false;
  if (args.analystPdf) return true;
  return !args.chartEmbedded;
}

export function shouldRenderPdfTechnicalAppendixSeriesTable(args: {
  analystPdf: boolean;
}): boolean {
  return args.analystPdf;
}

export function pdfTechnicalAppendixSeriesSampleCaption(
  pointCount: number,
  chartEmbedded: boolean
): string {
  if (chartEmbedded) {
    return `Series values (${pointCount} points) are shown in the Visualization section above.`;
  }
  return `Series sample includes ${pointCount} data points.`;
}
