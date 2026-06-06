/**
 * Enterprise PDF presentation tokens — typography, spacing, and light draw helpers.
 * Print-first (light) palette; chart capture stays independent of app UI theme.
 */

import type { jsPDF } from "jspdf";

type JsPdfDocument = InstanceType<typeof jsPDF>;
type Rgb = [number, number, number];

/** Spacing rhythm (mm) — keep pagination behavior stable; tune in small steps only. */
export const PDF_SPACING = {
  sectionBefore: 6,
  sectionAfterRule: 9,
  subsectionBefore: 4,
  subsectionAfter: 7,
  paragraphAfter: 3.5,
  cardGap: 4.5,
  panelPad: 5,
  chartFramePad: 2.5,
  chartHeaderAfter: 5,
  chartAfter: 4,
  chartAfterWithInsights: 2.5,
  snapshotAfter: 9,
  appendixBlock: 5,
  execSummaryBlock: 5,
  bulletGap: 1.35,
  insightLineGap: 4.6,
  emptyStateAfter: 5,
  tableBefore: 4,
  tableAfter: 5,
  appendixGridGap: 3.5,
  thumbRowAfter: 4,
  sectionTail: 3,
  blockTight: 2,
  chartRuleAfter: 1.5,
  pageSafe: 4,
  kpiMinHeight: 26,
  kpiPadTop: 6,
  kpiPadSide: 6,
  kpiPadBottom: 5,
} as const;

/** Consistent corner radii (mm) across panels, cards, and tables. */
export const PDF_RADIUS = {
  panel: 1.8,
  card: 1.6,
  table: 1.8,
  tableCell: 1.2,
  pill: 1.2,
  thumb: 1.6,
} as const;

/** Shared enterprise table palette (preview + appendix series). */
export const PDF_TABLE_THEME = {
  headerBg: [241, 245, 249] as Rgb,
  headerInk: [15, 23, 42] as Rgb,
  bodyInk: [51, 65, 85] as Rgb,
  border: [203, 213, 225] as Rgb,
  stripe: [248, 250, 252] as Rgb,
  white: [255, 255, 255] as Rgb,
};

/** Professional empty-state copy for PDF export sections. */
export const PDF_EMPTY_STATES = {
  executiveSummary: {
    title: "Executive summary not assembled",
    body: "Ask a question in AI Insights or refresh field mapping, then export again to include a narrative summary.",
  },
  chart: {
    title: "No visualization included",
    body: "No visualization selected for this export. Generate a chart in the Charts tab or ask a question in AI Insights to include visual analysis.",
  },
  chartCapture: {
    title: "Chart capture unavailable",
    body: "The chart could not be embedded in this PDF. Return to the app, confirm the chart is visible, and export again.",
  },
  chartEmbedFailed: {
    title: "Chart image unavailable",
    body: "The visualization could not be rendered in this export. Review the chart on screen and try exporting again.",
  },
  kpi: {
    title: "KPI metrics unavailable",
    body: "Upload a dataset and confirm field mapping to populate KPI cards in this export.",
  },
  aiInsight: {
    title: "No AI insight included",
    body: "Ask a business question in AI Insights before exporting to include narrative analysis and recommendations.",
  },
  preview: {
    title: "Data preview unavailable",
    body: "Load a dataset in the app to include a structured sample table in this export.",
  },
  appendix: {
    title: "Technical appendix not populated",
    body: "Include a chart with series data, provenance metadata, or session thumbnails to populate audit tables in this section.",
  },
  narrative: {
    title: "Narrative not provided",
    body: "No written analysis was available for this export.",
  },
  lowData: {
    title: "Limited sample size",
    body: "This dataset contains very few records. Treat findings as directional until more data is loaded.",
  },
  dataQuality: {
    title: "Quality profile unavailable",
    body: "Re-upload the dataset or refresh the session to include missing-value and duplicate checks.",
  },
  conversationThread: {
    title: "Conversation thread unavailable",
    body: "No prior conversation entries captured. Ask a question in AI Insights and use follow-up chips to build a thread before exporting.",
  },
} as const;

/** Typography scale (pt) — executive report hierarchy. */
export const PDF_TYPE = {
  coverTitle: 20,
  coverCompany: 13.5,
  coverMeta: 8.75,
  section: 13,
  chartTitle: 11.5,
  subsection: 10,
  appendixHeading: 9.25,
  kicker: 7.5,
  kpiLabel: 7.5,
  kpiValue: 15.5,
  kpiSubtitle: 7,
  body: 10,
  bodySmall: 9.25,
  caption: 8.5,
  footer: 7,
  factLabel: 6.75,
  factValue: 10,
  label: 9,
  question: 10.5,
  snapshotValue: 10.5,
} as const;

export type PdfExportTheme = {
  ink: Rgb;
  muted: Rgb;
  body: Rgb;
  line: Rgb;
  lineSoft: Rgb;
  panel: Rgb;
  card: Rgb;
  highlight: Rgb;
  accent: Rgb;
};

/**
 * Print-safe PDF theme — identical for app light and dark UI.
 * PDFs always use light surfaces for projector/B&W readability.
 */
export function buildPdfExportTheme(accent: Rgb): PdfExportTheme {
  return {
    ink: PDF_ENTERPRISE_COLORS.ink,
    muted: PDF_ENTERPRISE_COLORS.muted,
    body: PDF_ENTERPRISE_COLORS.body,
    line: PDF_ENTERPRISE_COLORS.line,
    lineSoft: PDF_ENTERPRISE_COLORS.lineSoft,
    panel: PDF_ENTERPRISE_COLORS.panel,
    card: PDF_ENTERPRISE_COLORS.card,
    highlight: [236, 253, 245],
    accent,
  };
}

/** Chart raster scale — sharper embed without changing layout width. */
export const PDF_CHART_CAPTURE_SCALE = 2.5;

/** Print-safe enterprise palette (readable on projectors and B&W). */
export const PDF_ENTERPRISE_COLORS = {
  ink: [15, 23, 42] as Rgb,
  body: [51, 65, 85] as Rgb,
  muted: [100, 116, 139] as Rgb,
  footer: [71, 85, 105] as Rgb,
  line: [226, 232, 240] as Rgb,
  lineSoft: [241, 245, 249] as Rgb,
  panel: [248, 250, 252] as Rgb,
  card: [255, 255, 255] as Rgb,
  highlightWash: [254, 252, 245] as Rgb,
  highlightBorder: [250, 204, 21] as Rgb,
  highlightInk: [120, 53, 15] as Rgb,
};

export function pdfLineHeight(fontSize: number, factor = 0.44): number {
  return fontSize * factor + 1.55;
}

/** Proportional chart embed size — avoids stretch, clip, and extreme aspect ratios. */
export function computePdfChartEmbedDimensions(
  pxW: number,
  pxH: number,
  contentWidthMm: number,
  maxHeightMm: number,
  minWidthRatio = 0.74
): { widthMm: number; heightMm: number } {
  const safeW = Math.max(1, pxW);
  const safeH = Math.max(1, pxH);
  let imgWidth = contentWidthMm;
  let imgHeight = (safeH * imgWidth) / safeW;
  const minW = contentWidthMm * minWidthRatio;
  const maxAspect = 2.35;
  const minAspect = 0.32;

  if (imgHeight > maxHeightMm) {
    imgHeight = maxHeightMm;
    imgWidth = (safeW * imgHeight) / safeH;
  }
  const aspect = imgHeight / Math.max(imgWidth, 1);
  if (aspect > maxAspect) {
    imgHeight = imgWidth * maxAspect;
  } else if (aspect < minAspect) {
    imgHeight = imgWidth * minAspect;
    if (imgHeight > maxHeightMm) {
      imgHeight = maxHeightMm;
      imgWidth = (safeW * imgHeight) / safeH;
    }
  }
  if (imgWidth < minW) {
    const scaledW = minW;
    const scaledH = (safeH * scaledW) / safeW;
    if (scaledH <= maxHeightMm) {
      imgWidth = scaledW;
      imgHeight = scaledH;
    }
  }
  return {
    widthMm: Math.max(36, imgWidth),
    heightMm: Math.max(28, Math.min(imgHeight, maxHeightMm)),
  };
}

export function pdfDrawSoftRule(
  doc: JsPdfDocument,
  x1: number,
  y: number,
  x2: number,
  color: Rgb = PDF_ENTERPRISE_COLORS.lineSoft,
  width = 0.22
): void {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

export function pdfDrawAccentRule(
  doc: JsPdfDocument,
  x1: number,
  y: number,
  x2: number,
  accent: Rgb,
  width = 0.35
): void {
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

/** Section kicker with accent tick (EXECUTIVE SNAPSHOT, ANALYSIS CONTEXT, …). */
export function pdfDrawPanelKicker(
  doc: JsPdfDocument,
  x: number,
  y: number,
  label: string,
  muted: Rgb,
  accent: Rgb
): void {
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(x, y - 2.4, 1.15, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_TYPE.kicker);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(label.toUpperCase(), x + 2.8, y);
}

/** Rounded panel shell with optional left accent stripe. */
export function pdfDrawEnterprisePanel(
  doc: JsPdfDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  options: {
    fill?: Rgb;
    border?: Rgb;
    accent?: Rgb;
    radius?: number;
    accentWidth?: number;
  }
): void {
  const fill = options.fill ?? PDF_ENTERPRISE_COLORS.panel;
  const border = options.border ?? PDF_ENTERPRISE_COLORS.line;
  const radius = options.radius ?? PDF_RADIUS.panel;
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.setDrawColor(border[0], border[1], border[2]);
  doc.setLineWidth(0.24);
  doc.roundedRect(x, y, w, h, radius, radius, "FD");
  if (options.accent) {
    const aw = options.accentWidth ?? 2.2;
    doc.setFillColor(options.accent[0], options.accent[1], options.accent[2]);
    doc.rect(x, y, aw, h, "F");
  }
}

/** Premium empty-state panel — returns bottom Y (mm). */
export function pdfDrawPremiumEmptyState(
  doc: JsPdfDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  body: string,
  colors: {
    panel: Rgb;
    line: Rgb;
    ink: Rgb;
    muted: Rgb;
    accent: Rgb;
  }
): number {
  const pad = 5;
  const titleSize = PDF_TYPE.subsection;
  const bodySize = PDF_TYPE.bodySmall;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  const titleLines = doc.splitTextToSize(title, w - pad * 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  const bodyLines = doc.splitTextToSize(body, w - pad * 2);
  const lhT = pdfLineHeight(titleSize);
  const lhB = pdfLineHeight(bodySize);
  const h =
    pad + titleLines.length * lhT + 2.5 + bodyLines.length * lhB + pad;

  pdfDrawEnterprisePanel(doc, x, y, w, h, {
    fill: colors.panel,
    border: colors.line,
    accent: colors.accent,
    radius: 1.6,
  });

  let cy = y + pad + lhT * 0.35;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2]);
  doc.text(titleLines, x + pad, cy);
  cy += titleLines.length * lhT + 2.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2]);
  doc.text(bodyLines, x + pad, cy);
  doc.setTextColor(0, 0, 0);
  return y + h;
}

/** Subtle inset divider between executive-summary blocks. */
export function pdfDrawInsetSectionDivider(
  doc: JsPdfDocument,
  x1: number,
  y: number,
  x2: number,
  color: Rgb = PDF_ENTERPRISE_COLORS.lineSoft
): void {
  pdfDrawSoftRule(doc, x1, y, x2, color, 0.16);
}

/** True when a table cell is primarily numeric (for right alignment). */
export function pdfCellLooksNumeric(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t === "—") return false;
  if (/^x=/i.test(t) || /,/.test(t) && /[a-z]/i.test(t.replace(/,/g, ""))) {
    return false;
  }
  if (/%\s*$/.test(t)) return true;
  if (/^[$€£]/.test(t)) return true;
  const stripped = t.replace(/[,$%\s]/g, "");
  if (!stripped) return false;
  return /^-?[\d.()]+$/.test(stripped) && Number.isFinite(Number(stripped.replace(/[()]/g, "")));
}

/** Running header + footer chrome for every page. */
export function pdfDrawEnterpriseRunningChrome(
  doc: JsPdfDocument,
  args: {
    pageIndex: number;
    totalPages: number;
    pageWidth: number;
    pageHeight: number;
    margin: number;
    contentWidth: number;
    headerBand: number;
    footerBand: number;
    company: string;
    reportTitle: string;
    sourceLabel: string;
    accent: Rgb;
    ink: Rgb;
    muted: Rgb;
    line: Rgb;
    lineSoft?: Rgb;
    footerInk?: Rgb;
  }
): void {
  const {
    pageIndex,
    totalPages,
    pageWidth,
    pageHeight,
    margin,
    contentWidth,
    headerBand,
    footerBand,
    company,
    reportTitle,
    sourceLabel,
    accent,
    ink,
    muted,
    line,
    lineSoft = PDF_ENTERPRISE_COLORS.lineSoft,
    footerInk = PDF_ENTERPRISE_COLORS.footer,
  } = args;

  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, pageWidth, 1.35, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_TYPE.kicker);
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.text(company, margin, margin + 2.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_TYPE.caption);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(reportTitle, margin, margin + 6.8);
  pdfDrawSoftRule(
    doc,
    margin,
    margin + headerBand - 1.2,
    pageWidth - margin,
    line,
    0.2
  );

  const footerRuleY = pageHeight - footerBand + 0.9;
  pdfDrawSoftRule(doc, margin, footerRuleY, pageWidth - margin, lineSoft, 0.16);

  const footerBaseline = pageHeight - 5.6;
  const footerSize = PDF_TYPE.footer;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(footerSize);
  doc.setTextColor(footerInk[0], footerInk[1], footerInk[2]);
  doc.text(sourceLabel, margin, footerBaseline, {
    maxWidth: contentWidth * 0.4,
  });

  doc.text("Generated by AI Data Analyst", pageWidth / 2, footerBaseline, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.text(
    `Page ${pageIndex} of ${totalPages}`,
    pageWidth - margin,
    footerBaseline,
    { align: "right" }
  );
  doc.setTextColor(0, 0, 0);
}
