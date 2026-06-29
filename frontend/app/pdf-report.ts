/**
 * Executive-grade PDF export (jsPDF): typography, KPI cards, chart embed,
 * headers/footers, branding, optional technical appendix (chart spec / raw series).
 */

import { Canvg } from "canvg";
import type { ChartKind, ChartRow } from "./chart-types";
import type { ChartArtifact } from "@/lib/chart-platform/chart-artifact";
import type { ChartPresentationMetadataChip } from "@/lib/chart-platform/chart-presentation-contract";
import { isNumberedExecutiveBrief } from "@/lib/executive-insights-brief";
import {
  formatExecutiveMetricValue,
  formatMetricSpreadGap,
  formatRawMetricValue,
  readChartRowRawValue,
  type MetricFormatContext,
} from "@/lib/metric-value-format";
import {
  formatPdfGeneratedTimestamp,
  normalizePdfIsoDatesInText,
  parsePdfIsoDateLabel,
} from "@/lib/pdf-date-format";
import {
  PDF_CHART_CAPTURE_SCALE,
  PDF_EMPTY_STATES,
  PDF_ENTERPRISE_COLORS,
  PDF_RADIUS,
  PDF_SPACING,
  PDF_TABLE_THEME,
  PDF_TYPE,
  buildPdfExportTheme,
  computePdfChartEmbedDimensions,
  PDF_VIZ_EMBED_DEFAULT_MAX_HEIGHT_MM,
  PDF_VIZ_EMBED_DEFAULT_MIN_WIDTH_RATIO,
  PDF_VIZ_EMBED_MIN_HEIGHT_MM,
  pdfCellLooksNumeric,
  pdfDrawEnterprisePanel,
  pdfDrawEnterpriseRunningChrome,
  pdfDrawInsetSectionDivider,
  pdfDrawPanelKicker,
  pdfDrawPremiumEmptyState,
  pdfDrawSoftRule,
  pdfLineHeight,
} from "@/lib/pdf-enterprise-style";
import {
  buildExportPdfFilename,
  BRANDING,
  resolvePdfExportFooter,
} from "@/lib/branding-config";
import {
  buildPdfExecutiveContentPlan,
  pdfExecutiveHierarchyHeadings,
  type PdfExecutiveContentPlan,
} from "@/lib/pdf-executive-content";

type JsPdfDocument = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

/** PDF-only insight section labels (executive report tone). */
const PDF_REPORT_TITLE = "Executive insight report";
const PDF_LINE_AREA_MIN_IMAGE_HEIGHT_MM = 107;

const _PDF_INSIGHT_SECTION_LABELS = {
  overview: "Executive overview",
  findings: "Key findings",
  interpretation: "Business interpretation",
  actions: "Recommendations",
  methodology: "How this was calculated",
} as const;

const PDF_BUSINESS_COPY_REPLACEMENTS: readonly [RegExp, string][] = [
  [/The dataset contains ([\d,]+) rows/gi, "The dataset contains $1 records"],
  [/\bRows in analysis\b/gi, "Records analyzed"],
  [/\bChart series points\b/gi, "Visualized categories"],
  [/\bRows in current filtered view\b/gi, "Records in filtered view"],
  [/\bTotal Rows\b/g, "Records in dataset"],
  [/\blimited evidence in this cohort\b/gi, "based on a limited sample in this view"],
  [/\bdirectional findings in this cohort\b/gi, "based on a limited sample in this view"],
  [/\bdirectional read — limited evidence\b/gi, "Preliminary read"],
  [/\bDirectional findings\b/gi, "Preliminary read"],
  [/\bEvidence is limited\b/gi, "Confidence: Limited"],
  [/\bEvidence strength: Limited\b/gi, "Confidence: Limited"],
  [/\btreat takeaways as directional, not definitive\b/gi, "treat as preliminary guidance"],
  [/\btreat findings as directional, not definitive\b/gi, "treat as preliminary guidance"],
  [/\bUse cautious language\b/gi, "Use careful wording"],
  [/\bUse measured language\b/gi, "Use careful wording"],
  [/\bcolumn mapping is still inferred\b/gi, "field mapping is auto-detected"],
  [/\bconfirm metric and breakdown fields\b/gi, "verify metric and dimension fields"],
  [/\bexploratory pattern\b/gi, "early pattern"],
  [/\bexploratory analysis\b/gi, "initial analysis"],
  [/\bPartial alignment or visualization caveats\b/gi, "Chart alignment notes"],
  [/\bThin evidence in view\b/gi, "Limited sample in view"],
  [/\bchart points\b/gi, "visualized categories"],
  [/\brows analyzed\b/gi, "records analyzed"],
  [/\bThis view is based on ([\d,]+) filtered row\(s\)/gi, "This view reflects $1 filtered records"],
  [/\bDataset mapping confidence\b/gi, "Field mapping confidence"],
  [/\bin this cohort\b/gi, "in this view"],
  [/\bcohort\b/gi, "view"],
  [/\binferred from the data\b/gi, "auto-detected from the data"],
  [/\bengine metadata\b/gi, "system metadata"],
  [
    /\bdirectional read\s*[—–-]\s*based on a limited sample in this view\b/gi,
    "Preliminary read based on a limited sample",
  ],
  [/\bPreliminary read\s*[—–-]\s*based on a limited sample in this view\b/gi, "Preliminary read based on a limited sample"],
  [/\bbased on a limited sample in this view\b/gi, "based on a limited sample"],
  [
    /\bGap\s*\(\s*peak\s*["'”]?\s*[^)]*lowest[^)]*\)/gi,
    "Gap between peak and lowest",
  ],
  [/\bGap\s*\([^)]*↔[^)]*\)/gi, "Gap between peak and lowest"],
  [/\bcitys\b/gi, "cities"],
];

/** Spacing below insight paragraphs in PDF (~14–18px). */
const PDF_INSIGHT_PARAGRAPH_GAP_MM = 5;
/** Extra space before KPI rows in executive snapshot. */
const PDF_SNAPSHOT_KPI_TOP_GAP_MM = PDF_SPACING.panelPad;

/** Strip control chars and fix common PDF encoding glitches. */
function sanitizePdfSpecialCharacters(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/↔/g, " to ")
    .replace(/[“”]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s*!\s*["'`]?\s*$/g, "")
    .replace(/["'`]{1,3}\s*(?=lowest)/gi, "")
    .replace(/\(\s*peak\s*["'`]?\s*/gi, "(peak ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Collapse consecutive duplicate words globally (case-insensitive). */
function collapsePdfDuplicateWords(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 8; pass++) {
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2) break;
    const out: string[] = [];
    for (const w of words) {
      const prev = out[out.length - 1];
      if (prev && prev.toLowerCase() === w.toLowerCase()) continue;
      out.push(w);
    }
    const next = out.join(" ");
    if (next === t) break;
    t = next;
  }
  return t;
}

const PDF_RANKING_LEAD_RE =
  /^(?:(?:highest|high|lowest|low|maximum|max|minimum|min|top|bottom|peak|largest|smallest|least)\s+)+/i;

function stripLeadingRankingQualifiers(phrase: string): string {
  let m = phrase.trim();
  let prev = "";
  while (m !== prev) {
    prev = m;
    m = m.replace(PDF_RANKING_LEAD_RE, "").trim();
  }
  return m;
}

function metricPhraseStartsWithRanking(phrase: string): boolean {
  return /^(?:highest|high|lowest|low|maximum|max|minimum|min|top|bottom|peak|largest|smallest|least)\b/i.test(
    phrase.trim()
  );
}

/** Category axis label for PDF (dates stay YYYY-MM-DD, no thousands separators). */
function formatPdfCategoryLabel(raw: string): string {
  const iso = parsePdfIsoDateLabel(raw);
  if (iso) return iso;
  return polishPdfBusinessCopy(humanizePdfDumpLabel(raw));
}

function normalizePdfMetricPhrase(metricHint: string | null | undefined): string {
  let m = polishPdfBusinessCopy(String(metricHint ?? "").trim());
  m = stripLeadingRankingQualifiers(m);
  m = m.replace(/^total\s+/i, "total ");
  return collapsePdfDuplicateWords(m.trim()) || "value";
}

/** Verb phrase for ranked narratives — avoids "highest highest …" when metric already ranks. */
function pdfRankedVerbPhrase(
  metric: string,
  preferLow: boolean,
  preferHigh: boolean
): string {
  const m = metric.trim() || "value";
  if (preferLow) {
    return metricPhraseStartsWithRanking(m)
      ? `has the ${m}`
      : `has the lowest ${m}`;
  }
  if (preferHigh) {
    return metricPhraseStartsWithRanking(m)
      ? `has the ${m}`
      : `has the highest ${m}`;
  }
  return `leads with ${m}`;
}

function pdfIsTrendChart(kind: ChartKind, data: ChartRow[]): boolean {
  if (kind !== "line" && kind !== "area") return false;
  if (data.length < 2) return false;
  const sample = data.slice(0, Math.min(8, data.length));
  const dateHits = sample.filter((r) =>
    parsePdfIsoDateLabel(String(r.name ?? ""))
  ).length;
  return dateHits >= Math.max(2, Math.ceil(sample.length * 0.4));
}

function isStaleStandaloneMetricTitle(
  text: string,
  metricHint: string | null,
  chartTitle: string | null
): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;
  if (/\b(has|at|followed|between|with|during|from|to)\b/i.test(t)) return false;
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const tn = norm(t);
  for (const hint of [metricHint, chartTitle]) {
    if (!hint?.trim()) continue;
    const hn = norm(hint);
    if (tn === hn || tn === `total ${hn}` || hn === tn) return true;
  }
  if (
    /^(total\s+)?[a-z][a-z\s]{2,60}(units|percent|cost|loss|count|amount)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/** Polish user-facing PDF copy — terminology only; no layout changes. */
export function polishPdfBusinessCopy(raw: string | null | undefined): string {
  if (raw == null) return "";
  let t = String(raw).replace(/\s+/g, " ").trim();
  t = sanitizePdfSpecialCharacters(t);
  for (const [re, repl] of PDF_BUSINESS_COPY_REPLACEMENTS) {
    t = t.replace(re, repl);
  }
  t = collapsePdfDuplicateWords(t);
  t = normalizePdfIsoDatesInText(t);
  return t.trim();
}

/** Executive-friendly labels for KPI cards, insight tiles, and metadata. */
function polishPdfExecutiveLabel(title: string): string {
  const key = title.trim().toLowerCase();
  const exact: Record<string, string> = {
    "rows in analysis": "Records analyzed",
    "chart series points": "Visualized categories",
    "rows in current filtered view": "Records in filtered view",
    "total rows": "Records in dataset",
    axes: "Chart dimensions",
    metric: "Primary metric",
    "auto dashboard": "Automated dashboard",
    "auto_dashboard": "Automated dashboard",
  };
  if (exact[key]) return exact[key];

  let t = title.trim();
  const phraseRules: readonly [RegExp, string][] = [
    [/production\s+loss\s+units\s+gap/gi, "Production Loss Gap"],
    [/highest\s+production\s+loss(?:\s+units)?/gi, "Highest Production Loss"],
    [/lowest\s+production\s+loss(?:\s+units)?/gi, "Lowest Production Loss"],
    [/average\s+production\s+loss(?:\s+units)?/gi, "Average Production Loss"],
    [/maximum\s+production\s+loss(?:\s+units)?/gi, "Maximum Production Loss"],
    [/minimum\s+production\s+loss(?:\s+units)?/gi, "Minimum Production Loss"],
    [/production\s+loss\s+units/gi, "Production Loss"],
    [/^\s*highest\s+plant\s*$/i, "Top Plant"],
    [/^\s*lowest\s+plant\s*$/i, "Bottom Plant"],
    [/^\s*highest\s+(\w+)/i, "Highest $1"],
    [/^\s*lowest\s+(\w+)/i, "Lowest $1"],
    [/gap\s+between\s+peak\s+and\s+lowest/gi, "Gap between peak and lowest"],
  ];
  for (const [re, repl] of phraseRules) {
    t = t.replace(re, repl);
  }
  t = polishPdfBusinessCopy(t);
  if (/^[a-z0-9][a-z0-9\s/_-]*$/.test(t) && t.length > 2) {
    t = t
      .split(/\s+/)
      .map((w) => {
        if (!w) return w;
        if (/^(by|of|and|or|in|to|vs)$/i.test(w)) return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  }
  return t;
}

function polishPdfKpiLabel(title: string): string {
  return polishPdfExecutiveLabel(title);
}

function polishPdfConfidenceLevel(level: Confidence): string {
  if (level === "High") return "High";
  if (level === "Medium") return "Moderate";
  return "Limited";
}

/**
 * Height (mm) of a non-split table: must match `drawDataTable` row measurement
 * when `suppressRowPageBreaks` is true (used for page-break planning).
 */
function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  ratio: number
): [number, number, number] {
  const t = Math.min(1, Math.max(0, ratio));
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

function measureMonolithicTableStackMm(
  doc: JsPdfDocument,
  contentWidth: number,
  headsIn: string[],
  bodyIn: string[][],
  fontSize: number,
  cellPad = 1.6,
  outerFrameMm = 4
): number {
  const n = headsIn.length;
  if (n === 0) return 0;
  const heads = headsIn.slice(0, n).map((h) => String(h ?? "").slice(0, 80));
  const body = bodyIn.map((r) =>
    Array.from({ length: n }, (_, i) => {
      const v = r[i];
      if (v === null || v === undefined) return "—";
      const s = String(v);
      return s.length > 140 ? `${s.slice(0, 137)}…` : s;
    })
  );
  const pad = cellPad;
  const weights = heads.map((head, col) => {
    let w = Math.min(Math.max(head.length, 6), 26);
    for (const row of body) {
      const c = row[col] ?? "";
      w = Math.max(w, Math.min(c.length, 32));
    }
    return w;
  });
  const tw = weights.reduce((a, b) => a + b, 0) || 1;
  const colW = weights.map((w) => (w / tw) * contentWidth);
  const linePitch0 = fontSize * 0.42 + 1.15;
  let totalH = 0;
  const measureRow = (cells: string[], isHeader: boolean) => {
    const cellLines = cells.map((cell, i) =>
      doc.splitTextToSize(cell, Math.max(4, colW[i] - pad * 2))
    );
    const maxLines = Math.min(
      isHeader ? 3 : 5,
      Math.max(1, ...cellLines.map((lines) => lines.length))
    );
    totalH += maxLines * linePitch0 + pad * 2;
  };
  measureRow(heads, true);
  for (const row of body) measureRow(row, false);
  return totalH + outerFrameMm;
}

/** Data preview excerpt limits (structured PDF table — not screenshots). */
const PDF_DATA_PREVIEW_MAX_ROWS = 15;
const PDF_DATA_PREVIEW_MAX_COLS = 7;

const PDF_PREVIEW_TABLE_THEME = PDF_TABLE_THEME;

/** Readable numbers for executive bullets, signal callouts, and tables. */
function formatPdfBusinessNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const asInt = Math.round(n);
  if (abs >= 1000 && Math.abs(n - asInt) < 1e-5) {
    return asInt.toLocaleString();
  }
  if (abs >= 1_000_000) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 1000) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 100) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 10) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 1) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
}

/** Consistent dates and numbers for PDF table cells. */
function formatPdfTableCellValue(value: unknown, maxChars = 140): string {
  if (value === null || value === undefined) return "—";
  let s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return "—";
  const isoOnly = parsePdfIsoDateLabel(s);
  if (isoOnly) s = isoOnly;
  else s = normalizePdfIsoDatesInText(s);
  const plainNum = s.replace(/,/g, "");
  if (/^-?[\d]+(\.\d+)?$/.test(plainNum)) {
    const n = Number(plainNum);
    if (Number.isFinite(n)) s = formatPdfBusinessNumber(n);
  }
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}

function truncatePdfPreviewColumnLabel(label: string, maxLen = 28): string {
  const s = String(label ?? "").trim();
  if (!s) return "—";
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function formatPdfPreviewCellValue(value: unknown, maxChars = 56): string {
  return formatPdfTableCellValue(value, maxChars);
}

function ellipsizePdfCellToWidth(
  doc: JsPdfDocument,
  text: string,
  maxWidthMm: number,
  fontSize: number,
  fontStyle: "normal" | "bold" = "normal"
): string {
  const t = text || "—";
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  const innerW = Math.max(2, maxWidthMm);
  if (doc.getTextWidth(t) <= innerW) return t;
  const ell = "…";
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${t.slice(0, mid)}${ell}`;
    if (doc.getTextWidth(candidate) <= innerW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${t.slice(0, lo)}${ell}` : ell;
}

function computePdfPreviewColumnWidths(
  doc: JsPdfDocument,
  contentWidth: number,
  headers: string[],
  body: string[][],
  fontSize: number
): number[] {
  const n = headers.length;
  if (n === 0) return [];
  const pad = 2.1;
  const weights = headers.map((head, col) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize + 0.5);
    let w = doc.getTextWidth(truncatePdfPreviewColumnLabel(head)) + pad * 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    for (const row of body) {
      const cell = formatPdfPreviewCellValue(row[col]);
      w = Math.max(
        w,
        Math.min(doc.getTextWidth(cell) + pad * 2, contentWidth * 0.3)
      );
    }
    return Math.max(w, 12);
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (w / total) * contentWidth);
}

function measurePdfDataPreviewTableStackMm(
  headers: string[],
  bodyRowCount: number
): number {
  const n = Math.min(headers.length, PDF_DATA_PREVIEW_MAX_COLS);
  const rows = Math.min(bodyRowCount, PDF_DATA_PREVIEW_MAX_ROWS);
  if (n === 0 || rows === 0) return 0;
  const fontSize = 7.5;
  const headerH = fontSize * 0.42 + 1.18 + 5.4;
  const bodyRowH = fontSize * 0.42 + 1.12 + 4.6;
  return headerH + rows * bodyRowH + 5;
}

/** Native jsPDF table for Data preview — no html2canvas. */
function drawPdfDataPreviewTable(args: {
  doc: JsPdfDocument;
  margin: number;
  contentWidth: number;
  y: number;
  footerY: number;
  contentTopY: number;
  accent: [number, number, number];
  headers: string[];
  body: string[][];
}): number {
  const { doc, margin, contentWidth, footerY, contentTopY, accent, headers, body } =
    args;
  let y = args.y;
  const T = PDF_PREVIEW_TABLE_THEME;
  const n = Math.min(headers.length, PDF_DATA_PREVIEW_MAX_COLS);
  if (n === 0) return y;

  const heads = headers.slice(0, n).map((h) => truncatePdfPreviewColumnLabel(h));
  const rows = body
    .slice(0, PDF_DATA_PREVIEW_MAX_ROWS)
    .map((r) =>
      Array.from({ length: n }, (_, i) => formatPdfPreviewCellValue(r[i]))
    );
  if (rows.length === 0) return y;

  const fontSize = 7.5;
  const pad = 2.35;
  const headerFontSize = fontSize + 0.65;
  const headerRowH = headerFontSize * 0.42 + 1.25 + 6;
  const bodyRowH = fontSize * 0.42 + 1.15 + 4.85;
  const colW = computePdfPreviewColumnWidths(doc, contentWidth, heads, rows, fontSize);
  const numericCols = Array.from({ length: n }, (_, col) => {
    let hits = 0;
    let seen = 0;
    for (const row of rows.slice(0, 8)) {
      const v = row[col];
      if (!v || v === "—") continue;
      seen++;
      if (pdfCellLooksNumeric(v)) hits++;
    }
    return seen > 0 && hits / seen >= 0.55;
  });

  let segmentTopY = y;

  const strokeSegmentFrame = (top: number, bottom: number) => {
    if (bottom <= top + 0.5) return;
    doc.setDrawColor(T.border[0], T.border[1], T.border[2]);
    doc.setLineWidth(0.32);
    doc.roundedRect(margin, top, contentWidth, bottom - top, 1.8, 1.8, "S");
  };

  const startNewTablePage = () => {
    strokeSegmentFrame(segmentTopY, y);
    doc.addPage();
    y = contentTopY;
    segmentTopY = y;
  };

  const drawHeaderRow = () => {
    if (y + headerRowH > footerY - 3) {
      startNewTablePage();
    }
    const headerBg = mixRgb(T.headerBg, accent, 0.12);
    doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    doc.setDrawColor(T.border[0], T.border[1], T.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentWidth, headerRowH, "F");
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(0.55);
    doc.line(margin, y, margin + contentWidth, y);
    doc.setLineWidth(0.5);
    doc.line(margin, y + headerRowH, margin + contentWidth, y + headerRowH);

    let cx = margin;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        doc.setDrawColor(T.border[0], T.border[1], T.border[2]);
        doc.setLineWidth(0.18);
        doc.line(cx, y, cx, y + headerRowH);
      }
      const label = ellipsizePdfCellToWidth(
        doc,
        heads[i],
        colW[i] - pad * 2,
        headerFontSize,
        "bold"
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headerFontSize + 0.15);
      doc.setTextColor(T.headerInk[0], T.headerInk[1], T.headerInk[2]);
      doc.text(label, cx + pad, y + headerRowH - 2.1);
      cx += colW[i];
    }
    y += headerRowH;
  };

  const drawBodyRow = (cells: string[], rowIndex: number) => {
    if (y + bodyRowH > footerY - 3) {
      startNewTablePage();
      drawHeaderRow();
    }

    const fill = rowIndex % 2 === 0 ? T.white : T.stripe;
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setDrawColor(T.border[0], T.border[1], T.border[2]);
    doc.setLineWidth(0.16);
    doc.rect(margin, y, contentWidth, bodyRowH, "FD");
    doc.setDrawColor(T.border[0], T.border[1], T.border[2]);
    doc.setLineWidth(0.14);
    doc.line(margin, y + bodyRowH, margin + contentWidth, y + bodyRowH);

    let cx = margin;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        doc.setDrawColor(T.border[0], T.border[1], T.border[2]);
        doc.setLineWidth(0.16);
        doc.line(cx, y, cx, y + bodyRowH);
      }
      const display = ellipsizePdfCellToWidth(
        doc,
        cells[i] ?? "—",
        colW[i] - pad * 2,
        fontSize,
        "normal"
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(T.bodyInk[0], T.bodyInk[1], T.bodyInk[2]);
      const textX = numericCols[i] ? cx + colW[i] - pad : cx + pad;
      doc.text(display, textX, y + bodyRowH - 1.95, {
        align: numericCols[i] ? "right" : "left",
      });
      cx += colW[i];
    }
    y += bodyRowH;
  };

  drawHeaderRow();
  rows.forEach((row, ri) => drawBodyRow(row, ri));
  strokeSegmentFrame(segmentTopY, y);
  doc.setTextColor(0, 0, 0);
  return y + PDF_SPACING.tableAfter;
}

/** Compact appendix list — chart title, type, sparkline preview per row. */
function drawPdfAppendixThumbnailList(
  doc: JsPdfDocument,
  margin: number,
  yTop: number,
  contentWidth: number,
  thumbs: PdfChartThumb[],
  accent: [number, number, number],
  themeLine: [number, number, number],
  themeInk: [number, number, number],
  themeMuted: [number, number, number],
  themePanel: [number, number, number]
): number {
  const slice = thumbs.slice(0, 8);
  if (!slice.length) return yTop;

  const rowH = 16;
  const headerH = 6;
  const sparkW = 34;
  const tableH = headerH + slice.length * rowH + 2;
  const tableTop = yTop;

  doc.setFillColor(
    PDF_ENTERPRISE_COLORS.panel[0],
    PDF_ENTERPRISE_COLORS.panel[1],
    PDF_ENTERPRISE_COLORS.panel[2]
  );
  doc.setDrawColor(themeLine[0], themeLine[1], themeLine[2]);
  doc.setLineWidth(0.22);
  doc.roundedRect(margin, tableTop, contentWidth, tableH, PDF_RADIUS.table, PDF_RADIUS.table, "FD");
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(margin, tableTop, 1.4, tableH, "F");

  let ry = tableTop + 3.2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_TYPE.caption);
  doc.setTextColor(themeMuted[0], themeMuted[1], themeMuted[2]);
  doc.text("Chart", margin + 5, ry);
  doc.text("Type", margin + contentWidth * 0.48, ry);
  doc.text("Preview", margin + contentWidth - sparkW - 4, ry);
  ry += 2.8;
  pdfDrawSoftRule(
    doc,
    margin + 4,
    ry,
    margin + contentWidth - 4,
    PDF_ENTERPRISE_COLORS.lineSoft,
    0.16
  );
  ry += 2.2;

  const typeColX = margin + contentWidth * 0.48;
  const sparkX = margin + contentWidth - sparkW - 4;
  const titleMaxW = typeColX - margin - 10;

  slice.forEach((thumb, ri) => {
    const rowY = ry;
    if (ri % 2 === 1) {
      doc.setFillColor(
        PDF_TABLE_THEME.stripe[0],
        PDF_TABLE_THEME.stripe[1],
        PDF_TABLE_THEME.stripe[2]
      );
      doc.rect(margin + 1.4, rowY, contentWidth - 1.4, rowH, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(themeInk[0], themeInk[1], themeInk[2]);
    doc.text(
      doc.splitTextToSize(polishPdfExecutiveLabel(thumb.title), titleMaxW).slice(0, 1),
      margin + 5,
      rowY + 5.2
    );
    drawPdfChartKindBadge(
      doc,
      typeColX,
      rowY + 4.2,
      contentWidth * 0.22,
      pdfChartKindExecutiveLabel(thumb.kind),
      accent,
      themePanel
    );
    drawSparkline(doc, sparkX, rowY + 3, sparkW, 9.5, thumb.values, accent);
    doc.setDrawColor(themeLine[0], themeLine[1], themeLine[2]);
    doc.setLineWidth(0.12);
    doc.line(margin + 4, rowY + rowH, margin + contentWidth - 4, rowY + rowH);
    ry += rowH;
  });

  doc.setTextColor(0, 0, 0);
  return tableTop + tableH + PDF_SPACING.blockTight;
}

export const REPORT_BRANDING_STORAGE_KEY = "ai-data-analyst-report-branding-v1";

export type ReportBranding = {
  companyName: string;
  tagline: string;
  accentHex: string;
};

export const DEFAULT_REPORT_BRANDING: ReportBranding = {
  companyName: "",
  tagline: "",
  accentHex: BRANDING.primaryColor,
};

export function loadReportBranding(): ReportBranding {
  if (typeof window === "undefined") return { ...DEFAULT_REPORT_BRANDING };
  try {
    const raw = window.localStorage.getItem(REPORT_BRANDING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REPORT_BRANDING };
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      companyName:
        typeof o.companyName === "string" ? o.companyName.slice(0, 120) : "",
      tagline: typeof o.tagline === "string" ? o.tagline.slice(0, 160) : "",
      accentHex:
        typeof o.accentHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.accentHex)
          ? o.accentHex
          : DEFAULT_REPORT_BRANDING.accentHex,
    };
  } catch {
    return { ...DEFAULT_REPORT_BRANDING };
  }
}

export function saveReportBranding(b: ReportBranding): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      REPORT_BRANDING_STORAGE_KEY,
      JSON.stringify({
        companyName: b.companyName.trim().slice(0, 120),
        tagline: b.tagline.trim().slice(0, 160),
        accentHex: /^#[0-9A-Fa-f]{6}$/.test(b.accentHex)
          ? b.accentHex
          : DEFAULT_REPORT_BRANDING.accentHex,
      })
    );
  } catch {
    /* ignore */
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return [15, 118, 110];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [15, 118, 110];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Confidence = "High" | "Medium" | "Low";

export type PdfExportMode = "executive" | "analyst";

export type PdfExportIncludes = {
  includeKPIs: boolean;
  includeAIInsight: boolean;
  includeChart: boolean;
  includeDataPreview: boolean;
  includeDataQuality: boolean;
  /** Prior questions, follow-up chain, inherited filters from BI copilot thread */
  includeConversationContext: boolean;
  /** Raw chart series dump, sparkline strip, engine field dump — not for client-facing briefs */
  includeTechnicalAppendix?: boolean;
  /** Executive (default): story-first brief. Analyst: technical appendix + metadata. */
  pdfMode?: PdfExportMode;
  /** Slim AI Insights preset vs Export-tab full selection. */
  reportPreset?: "insight" | "full";
};

export type PdfProvenanceSlice = {
  confidence: Confidence;
  rowsAnalyzed: number;
  chartPoints: number;
  aggregation: string;
  notes?: string | null;
};

export type PdfChartThumb = {
  title: string;
  values: number[];
  kind: string;
};

export type PdfConversationAppendix = {
  /** Ordered questions in the AI Insights thread (includes follow-ups). */
  questionThread: string[];
  inheritedFilters: string[];
  activeDrillPath: string[];
  inheritedAssumptionNote?: string | null;
};

/** Parsed AI answer blocks (matches UI `parseAnswerIntoSections` contract). */
export type PdfInsightSections = {
  summary: string;
  statistical?: string;
  hypotheses?: string;
  recommendations?: string;
  methodology?: string;
  moreDetail?: string;
};

/** Top chart categories for PDF executive summary + highlighted signals (numeric order matches key figures). */
export type PdfRankedSignal = {
  rank: string;
  category: string;
  valueDisplay: string;
};

export type PdfVizExecutiveFact = {
  title: string;
  value: string;
  hint?: string;
  kind?: string;
};

/** Optional chart recommendation intel carried from shared UI logic. */
export type PdfChartIntelSlice = {
  recommendedLabel?: string | null;
  whyThisChart?: string | null;
  recommendationBlurb?: string | null;
};

/** Routing backbone slice for export payload (Phase A). */
export type PdfRoutingPlanSlice = {
  intent: string;
  executiveLens?: string | null;
  metricColumn?: string | null;
  dimensionColumn?: string | null;
  chartType?: string | null;
  unsupportedReason?: string | null;
};

export type ExecutivePdfExportInput = {
  includes: PdfExportIncludes;
  branding: ReportBranding;
  /** Rows, columns count, optional sheet & file label */
  dataset: {
    rows: number;
    colCount: number;
    sheet?: string;
    fileName: string;
    datasetKind: string;
    /** Resolved domain/type label (Overview parity); falls back to datasetKind. */
    profileLabel?: string;
  };
  generatedAt: Date;
  mappingConfidence: Confidence;
  execSummaryLines: string[];
  kpiSectionTitle: string;
  kpiCards: { title: string; value: string; subtitle?: string | null }[];
  question: string;
  answer: string;
  /** When set, insight narrative uses these blocks instead of raw `answer`. */
  insightSections?: PdfInsightSections | null;
  /** Category (X) and value (Y) axis labels for the exported chart context */
  chartAxisLabels?: { category: string; value: string } | null;
  /** Structured one-liner from aligned analysis when present */
  insightSummary?: string;
  insightConfidenceLevel?: string;
  insightConfidenceRationale?: string | null;
  routingPlan?: PdfRoutingPlanSlice | null;
  chartIntel?: PdfChartIntelSlice | null;
  chartInsightBadge?: string | null;
  /** When set, executive summary + highlighted signals use these instead of prose/badge peeling. */
  pdfRankedSignals?: PdfRankedSignal[] | null;
  vizExecutiveFacts?: PdfVizExecutiveFact[];
  /** First-line AI context for the chart (mirrors AI Insights Executive panel). */
  executiveInsightsBrief?: string | null;
  provenance: PdfProvenanceSlice | null;
  chart: {
    presentationKind: ChartKind;
    data: ChartRow[];
    title: string;
    subtitle: string;
    metadataChips?: ChartPresentationMetadataChip[] | null;
    chartArtifact?: ChartArtifact | null;
    captureEl: HTMLElement | null;
    alignedMetric?: string | null;
    alignedMetricDisplay?: string | null;
    aggregation?: string | null;
    /** Chart recommendation metric type (`numeric`, `currency`, …). */
    metricType?: string | null;
    /** API rounding hint (`pct_1`, `money_0`, …) for metric formatting. */
    roundingHint?: string | null;
    /** e.g. auto-dashboard vs AI no-chart placeholder */
    chartAttribution?: string | null;
  } | null;
  chartThumbnails: PdfChartThumb[];
  preview: { rows: Record<string, unknown>[]; columns: string[] };
  profile: { null_counts: Record<string, number> } | null;
  previewDuplicates: () => { duplicates: number; note: string };
  conversationAppendix?: PdfConversationAppendix | null;
};

/** Case-insensitive: drop everything from the first match onward. */
const PDF_TRUNCATE_MARKERS: readonly string[] = [
  "DATASET CONTEXT",
  "DATASET CONTEXT (schema/stats/sample):",
  "Use the dataset context below",
  "use the dataset context below to answer",
  "schema/stats/sample:",
  "SCHEMA / STATS / SAMPLE",
  "INTERNAL ANALYSIS PAYLOAD",
  "INTERNAL CONTEXT",
  "CONVERSATION CONTEXT (FOR MODEL ONLY)",
  "SYSTEM INSTRUCTIONS",
  "--- BEGIN DATASET JSON ---",
  "---BEGIN DATASET JSON---",
];

const PDF_LINE_LEAK_PATTERNS: readonly RegExp[] = [
  /^\s*["']?file_name["']?\s*:/i,
  /^\s*["']?selected_sheet["']?\s*:/i,
  /^\s*["']?column_types["']?\s*:/i,
  /^\s*["']?summary_stats["']?\s*:/i,
  /^\s*["']?sample_rows["']?\s*:/i,
  /^\s*["']?null_counts["']?\s*:/i,
  /^\s*["']?rows["']?\s*:\s*\d+/i,
  /^\s*\{\s*["']?file_name["']?\s*:/i,
];

function stripLeakyMarkdownFencedBlocks(text: string): string {
  return text.replace(/```(?:json|JSON)?\s*\r?\n([\s\S]*?)```/g, (full, inner) => {
    const s = String(inner);
    if (s.length < 40) return full;
    const looksInternal =
      /"column_types"\s*:|'column_types'\s*:|column_types\s*=/i.test(s) ||
      /"sample_rows"\s*:|'sample_rows'\s*:|sample_rows\s*=/i.test(s) ||
      /"summary_stats"\s*:|'summary_stats'\s*:/i.test(s) ||
      (/null_counts/i.test(s) && /"rows"\s*:\s*\d+/i.test(s));
    return looksInternal ? "" : full;
  });
}

function truncateFromFirstInternalMarker(text: string): string {
  const lower = text.toLowerCase();
  let cut = -1;
  for (const m of PDF_TRUNCATE_MARKERS) {
    const i = lower.indexOf(m.toLowerCase());
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut < 0) return text;
  return text.slice(0, cut).trimEnd();
}

function dropJsonDumpLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let skippingJsonTail = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!skippingJsonTail && PDF_LINE_LEAK_PATTERNS.some((re) => re.test(line))) {
      skippingJsonTail = true;
      continue;
    }
    if (skippingJsonTail) {
      if (trimmed === "" || trimmed === "}" || trimmed === "]" || trimmed === "},") {
        if (trimmed === "") skippingJsonTail = false;
        continue;
      }
      if (/^[\[{}\],\s:"'0-9eE+.-]+$/.test(trimmed) && trimmed.length > 20) {
        continue;
      }
      skippingJsonTail = false;
    }
    if (
      !skippingJsonTail &&
      trimmed.length > 400 &&
      /"column_types"\s*:/.test(trimmed) &&
      /"sample_rows"\s*:/.test(trimmed)
    ) {
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Remove internal prompt / dataset-context leakage from user-facing export text.
 */
/** Prefer UI-built executive facts; derive from chart only when empty. */
export function pickPdfVizExecutiveFacts(
  uiFacts: PdfVizExecutiveFact[] | undefined,
  derivedFacts: PdfVizExecutiveFact[] | null | undefined
): PdfVizExecutiveFact[] {
  const ui = (uiFacts ?? []).filter(
    (f) => String(f.title ?? "").trim() && String(f.value ?? "").trim()
  );
  return ui.length ? ui : derivedFacts ?? [];
}

export function sanitizeUserFacingReportText(raw: string | null | undefined): string {
  if (raw == null) return "";
  let t = String(raw).replace(/\u00a0/g, " ");
  t = stripLeakyMarkdownFencedBlocks(t);
  t = truncateFromFirstInternalMarker(t);
  t = dropJsonDumpLines(t);
  t = stripLeakyMarkdownFencedBlocks(t);
  t = truncateFromFirstInternalMarker(t);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeExecutivePdfExportInput(
  raw: ExecutivePdfExportInput
): ExecutivePdfExportInput {
  const sLine = (line: string) => sanitizeUserFacingReportText(line);
  const questionClean = polishPdfBusinessCopy(
    sanitizeUserFacingReportText(raw.question)
  );
  const ascendingQ = pdfAscendingFromQuestion(questionClean);
  const rankingQ = pdfIsRankingQuestion(questionClean);

  let chart = raw.chart;
  if (chart) {
    const coercedKind = pdfCoercePresentationKindForRanking(
      chart.presentationKind,
      questionClean
    );
    const metricCtxDraft = pdfChartMetricFormatContext(
      { ...chart, presentationKind: coercedKind },
      questionClean
    );
    const data = chart.data.map((row) => ({
      ...row,
      displayValue: rankingQ
        ? formatPdfChartRowMetricDisplay(row, metricCtxDraft)
        : row.displayValue,
    }));
    chart = {
      ...chart,
      presentationKind: coercedKind,
      data,
      title: resolvePdfChartTitle(
        questionClean,
        sanitizeUserFacingReportText(chart.title),
        chart.alignedMetricDisplay
          ? sanitizeUserFacingReportText(chart.alignedMetricDisplay)
          : null,
        chart.aggregation
          ? sanitizeUserFacingReportText(chart.aggregation)
          : null
      ),
      subtitle: sanitizeUserFacingReportText(chart.subtitle),
      metadataChips:
        chart.metadataChips
          ?.map((chip) => ({
            ...chip,
            label:
              chip.label != null
                ? sanitizeUserFacingReportText(chip.label)
                : chip.label,
            value: sanitizeUserFacingReportText(chip.value),
            title:
              chip.title != null
                ? sanitizeUserFacingReportText(chip.title)
                : chip.title,
          }))
          .filter((chip) => chip.value.trim())
          .slice(0, 6) ?? null,
      chartArtifact: chart.chartArtifact ?? null,
      alignedMetric: chart.alignedMetric
        ? sanitizeUserFacingReportText(chart.alignedMetric)
        : chart.alignedMetric,
      alignedMetricDisplay: chart.alignedMetricDisplay
        ? sanitizeUserFacingReportText(chart.alignedMetricDisplay)
        : chart.alignedMetricDisplay,
      aggregation: chart.aggregation
        ? sanitizeUserFacingReportText(chart.aggregation)
        : chart.aggregation,
      chartAttribution:
        chart.chartAttribution != null
          ? sanitizeUserFacingReportText(chart.chartAttribution) || null
          : chart.chartAttribution,
    };
  }

  const trendQ = Boolean(
    chart?.data.length && pdfIsTrendChart(chart.presentationKind, chart.data)
  );

  let pdfRankedSignals = (raw.pdfRankedSignals ?? [])
    .map((r) => ({
      rank: polishPdfBusinessCopy(sanitizeUserFacingReportText(r.rank)),
      category: formatPdfCategoryLabel(sanitizeUserFacingReportText(r.category)),
      valueDisplay: polishPdfBusinessCopy(
        sanitizeUserFacingReportText(r.valueDisplay)
      ),
    }))
    .filter((r) => r.rank.length > 0 && r.category.length > 0 && r.valueDisplay.length > 0);

  if (chart?.data.length && trendQ) {
    pdfRankedSignals = pdfTrendRankedSignalsFromChartData(
      chart.data,
      chart.presentationKind,
      pdfChartMetricFormatContext(chart, questionClean),
      3
    );
  } else if (chart?.data.length && rankingQ) {
    const fromChart = pdfRankedSignalsFromChartData(
      chart.data,
      chart.presentationKind,
      ascendingQ,
      pdfChartMetricFormatContext(chart, questionClean),
      3
    );
    if (fromChart.length) pdfRankedSignals = fromChart;
  }

  const metricHintForNarrative =
    chart?.alignedMetricDisplay?.trim() ||
    chart?.alignedMetric?.trim() ||
    raw.chartAxisLabels?.value?.trim() ||
    null;
  const executiveNarrative =
    pdfRankedSignals.length > 0
      ? polishPdfBusinessCopy(
          formatPdfRankedSignalsNarrative(
            pdfRankedSignals,
            metricHintForNarrative,
            questionClean
          )
        )
      : "";

  let execSummaryLines = raw.execSummaryLines
    .map((l) => polishPdfBusinessCopy(sLine(l)))
    .filter((l) => l.length > 0);

  const staleTitle = chart?.title?.trim() ?? null;
  if (executiveNarrative) {
    execSummaryLines = execSummaryLines
      .filter((l) => {
        const t = l.trim();
        if (/^name\s+value\b/i.test(t)) return false;
        if (isStructuredDumpExecutiveLine(t)) return false;
        const afterColon = t.includes(":")
          ? t.slice(t.indexOf(":") + 1).trim()
          : t;
        if (isStructuredDumpExecutiveLine(afterColon)) return false;
        if (
          isStaleStandaloneMetricTitle(
            afterColon || t,
            metricHintForNarrative,
            staleTitle
          )
        ) {
          return false;
        }
        return true;
      })
      .map((l) => {
        if (/^main takeaway:/i.test(l)) {
          return `Main takeaway: ${executiveNarrative}`;
        }
        return l;
      });
    if (!execSummaryLines.some((l) => /^main takeaway:/i.test(l))) {
      execSummaryLines.splice(
        Math.min(2, execSummaryLines.length),
        0,
        `Main takeaway: ${executiveNarrative}`
      );
    }
  }

  const kpiCards = raw.kpiCards.map((c) => ({
    title: polishPdfKpiLabel(sanitizeUserFacingReportText(c.title)),
    value: polishPdfBusinessCopy(sanitizeUserFacingReportText(c.value)),
    subtitle:
      c.subtitle != null
        ? polishPdfBusinessCopy(sanitizeUserFacingReportText(String(c.subtitle)))
        : c.subtitle,
  }));

  const chartMetricCtx = chart
    ? pdfChartMetricFormatContext(chart, questionClean)
    : null;
  const uiVizFacts = (raw.vizExecutiveFacts ?? []).filter(
    (f) => String(f.title ?? "").trim() && String(f.value ?? "").trim()
  );
  const derivedTrendFacts =
    chart?.data.length && trendQ && chartMetricCtx
      ? buildPdfTrendVizExecutiveFacts(
          chart.data,
          chart.alignedMetricDisplay ?? chart.alignedMetric ?? null,
          chartMetricCtx
        ).map((f) => ({
          title: polishPdfKpiLabel(f.title),
          value: polishPdfBusinessCopy(f.value),
        }))
      : null;
  const derivedRankingFacts =
    chart?.data.length && rankingQ && chartMetricCtx
      ? buildPdfVizExecutiveFacts(
          chart.data,
          chart.presentationKind,
          ascendingQ,
          chart.alignedMetricDisplay ?? chart.alignedMetric ?? null,
          raw.chartAxisLabels?.category ?? null,
          chartMetricCtx
        ).map((f) => ({
          title: polishPdfKpiLabel(f.title),
          value: polishPdfBusinessCopy(f.value),
          hint: f.hint ? polishPdfBusinessCopy(f.hint) : undefined,
        }))
      : null;
  const vizExecutiveFacts = pickPdfVizExecutiveFacts(
    uiVizFacts,
    derivedTrendFacts ?? derivedRankingFacts
  ).map((f) => ({
    title: polishPdfKpiLabel(sanitizeUserFacingReportText(f.title)),
    value: polishPdfBusinessCopy(sanitizeUserFacingReportText(f.value)),
    hint:
      f.hint != null
        ? polishPdfBusinessCopy(sanitizeUserFacingReportText(f.hint))
        : f.hint,
    kind: f.kind,
  }));

  const chartThumbnails = raw.chartThumbnails.map((t) => ({
    ...t,
    title: sanitizeUserFacingReportText(t.title),
    kind: sanitizeUserFacingReportText(t.kind),
  }));

  let provenance = raw.provenance;
  if (provenance?.notes) {
    provenance = {
      ...provenance,
      notes: sanitizeUserFacingReportText(provenance.notes) || null,
    };
  }

  let conversationAppendix = raw.conversationAppendix;
  if (conversationAppendix) {
    conversationAppendix = {
      questionThread: conversationAppendix.questionThread
        .map((q) => polishPdfBusinessCopy(sanitizeUserFacingReportText(q)))
        .filter((q) => q.length > 0),
      inheritedFilters: conversationAppendix.inheritedFilters
        .map((f) => polishPdfBusinessCopy(sanitizeUserFacingReportText(f)))
        .filter((f) => f.length > 0),
      activeDrillPath: conversationAppendix.activeDrillPath
        .map((d) => polishPdfBusinessCopy(sanitizeUserFacingReportText(d)))
        .filter((d) => d.length > 0),
      inheritedAssumptionNote:
        conversationAppendix.inheritedAssumptionNote != null
          ? polishPdfBusinessCopy(
              sanitizeUserFacingReportText(
                conversationAppendix.inheritedAssumptionNote
              )
            ) || null
          : conversationAppendix.inheritedAssumptionNote,
    };
  }

  let answer = polishPdfBusinessCopy(sanitizeUserFacingReportText(raw.answer));
  if (!answer.trim() && raw.answer.trim().length > 80) {
    answer =
      "The narrative was omitted from this PDF because it contained internal technical context. Ask the assistant again for a concise business summary suitable for export.";
  }

  let insightSections = raw.insightSections;
  if (insightSections) {
    const sumRaw = sanitizeUserFacingReportText(insightSections.summary);
    const sum = polishPdfBusinessCopy(
      executiveNarrative &&
        (isStructuredDumpExecutiveLine(sumRaw) || /^name\s+value\b/i.test(sumRaw))
        ? executiveNarrative
        : sumRaw
    );
    const st = insightSections.statistical
      ? polishPdfBusinessCopy(
          sanitizeUserFacingReportText(insightSections.statistical)
        )
      : undefined;
    const hy = insightSections.hypotheses
      ? polishPdfBusinessCopy(
          sanitizeUserFacingReportText(insightSections.hypotheses)
        )
      : undefined;
    const rec = insightSections.recommendations
      ? polishPdfBusinessCopy(
          sanitizeUserFacingReportText(insightSections.recommendations)
        )
      : undefined;
    const meth = insightSections.methodology
      ? sanitizeUserFacingReportText(insightSections.methodology)
      : undefined;
    const more = insightSections.moreDetail
      ? sanitizeUserFacingReportText(insightSections.moreDetail)
      : undefined;
    const hasAny =
      sum.trim() ||
      st?.trim() ||
      hy?.trim() ||
      rec?.trim() ||
      meth?.trim() ||
      more?.trim();
    insightSections = hasAny
      ? {
          summary: sum,
          statistical: st?.trim() ? st : undefined,
          hypotheses: hy?.trim() ? hy : undefined,
          recommendations: rec?.trim() ? rec : undefined,
          methodology: meth?.trim() ? meth : undefined,
          moreDetail: more?.trim() ? more : undefined,
        }
      : null;
  }

  let chartAxisLabels = raw.chartAxisLabels;
  if (chartAxisLabels) {
    chartAxisLabels = {
      category: sanitizeUserFacingReportText(chartAxisLabels.category),
      value: sanitizeUserFacingReportText(chartAxisLabels.value),
    };
    if (!chartAxisLabels.category.trim() && !chartAxisLabels.value.trim()) {
      chartAxisLabels = null;
    }
  }

  return {
    ...raw,
    kpiSectionTitle: polishPdfExecutiveLabel(
      sanitizeUserFacingReportText(raw.kpiSectionTitle)
    ),
    execSummaryLines,
    kpiCards,
    question: questionClean,
    answer,
    insightSections,
    insightSummary: executiveNarrative
      ? executiveNarrative
      : raw.insightSummary
        ? polishPdfBusinessCopy(sanitizeUserFacingReportText(raw.insightSummary))
        : raw.insightSummary,
    chartInsightBadge: raw.chartInsightBadge
      ? polishPdfBusinessCopy(sanitizeUserFacingReportText(raw.chartInsightBadge))
      : raw.chartInsightBadge,
    insightConfidenceRationale: raw.insightConfidenceRationale?.trim()
      ? polishPdfBusinessCopy(
          sanitizeUserFacingReportText(raw.insightConfidenceRationale)
        )
      : raw.insightConfidenceRationale,
    routingPlan: raw.routingPlan,
    chartIntel: raw.chartIntel,
    pdfRankedSignals: pdfRankedSignals.length ? pdfRankedSignals : undefined,
    vizExecutiveFacts,
    executiveInsightsBrief: executiveNarrative
      ? executiveNarrative
      : raw.executiveInsightsBrief?.trim()
        ? polishPdfBusinessCopy(
            sanitizeUserFacingReportText(raw.executiveInsightsBrief)
          )
        : undefined,
    provenance,
    chart,
    chartAxisLabels,
    chartThumbnails,
    conversationAppendix,
    dataset: {
      ...raw.dataset,
      fileName:
        sanitizeUserFacingReportText(raw.dataset.fileName) || raw.dataset.fileName,
      sheet: raw.dataset.sheet
        ? sanitizeUserFacingReportText(raw.dataset.sheet)
        : raw.dataset.sheet,
    },
  };
}

function confidenceFill(level: Confidence): [number, number, number] {
  if (level === "High") return [16, 185, 129];
  if (level === "Medium") return [245, 158, 11];
  return [244, 63, 94];
}

function drawConfidenceChip(
  doc: JsPdfDocument,
  x: number,
  y: number,
  label: string,
  level: Confidence
): number {
  const rgb = confidenceFill(level);
  const text = `${label}: ${polishPdfConfidenceLevel(level)}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const w = doc.getTextWidth(text) + 5;
  const h = 5;
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setDrawColor(Math.max(0, rgb[0] - 40), Math.max(0, rgb[1] - 35), Math.max(0, rgb[2] - 30));
  doc.roundedRect(x, y - h + 1.2, w, h, 1, 1, "FD");
  doc.setTextColor(255, 255, 255);
  doc.text(text, x + 2.5, y);
  doc.setTextColor(0, 0, 0);
  return w + 2;
}

function drawSparkline(
  doc: JsPdfDocument,
  x: number,
  yTop: number,
  w: number,
  h: number,
  values: number[],
  accent: [number, number, number]
) {
  const vals = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (!vals.length) {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(x, yTop, w, h, "S");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("—", x + w / 2 - 1.5, yTop + h / 2 + 1);
    doc.setTextColor(0, 0, 0);
    return;
  }
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const span = mx - mn || 1;
  const n = Math.min(vals.length, 48);
  const slice = vals.length > n ? vals.slice(-n) : vals;
  void (w / Math.max(slice.length, 1));
  doc.setFillColor(
    PDF_TABLE_THEME.stripe[0],
    PDF_TABLE_THEME.stripe[1],
    PDF_TABLE_THEME.stripe[2]
  );
  doc.rect(x, yTop, w, h, "F");
  doc.setDrawColor(
    PDF_TABLE_THEME.border[0],
    PDF_TABLE_THEME.border[1],
    PDF_TABLE_THEME.border[2]
  );
  doc.rect(x, yTop, w, h, "S");
  const pad = 1.2;
  const innerH = h - pad * 2;
  const innerW = w - pad * 2;
  slice.forEach((v, i) => {
    const t = (v - mn) / span;
    const barH = Math.max(0.4, t * innerH);
    const bx = x + pad + i * (innerW / Math.max(slice.length, 1));
    const bw = Math.max(0.35, innerW / Math.max(slice.length, 1) - 0.15);
    const by = yTop + h - pad - barH;
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(bx, by, bw, barH, "F");
  });
}

function resolvePdfChartPlotRoot(container: HTMLElement): HTMLElement {
  const selectors = [
    ".ai-insights-viz-plot-host .recharts-responsive-container",
    ".ai-insights-viz-plot .recharts-responsive-container",
    ".recharts-responsive-container",
    ".recharts-wrapper",
  ];
  for (const sel of selectors) {
    const el = container.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return container;
}

function findPrimaryChartSvg(root: HTMLElement): SVGSVGElement | null {
  const svgs = [...root.querySelectorAll("svg")].filter(
    (s): s is SVGSVGElement => s instanceof SVGSVGElement
  );
  if (!svgs.length) return null;
  let best = svgs[0]!;
  let bestArea = 0;
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      bestArea = area;
      best = svg;
    }
  }
  return bestArea > 4 ? best : svgs[0] ?? null;
}

function cloneSvgWithInlineStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const tagSel =
    "path,rect,circle,line,text,polygon,polyline,g";
  const srcEls = source.querySelectorAll(tagSel);
  const cloneEls = clone.querySelectorAll(tagSel);
  cloneEls.forEach((el, i) => {
    const src = srcEls[i];
    if (!src) return;
    const cs = window.getComputedStyle(src);
    const fill = cs.fill;
    const stroke = cs.stroke;
    if (fill && fill !== "none" && !fill.includes("rgba(0, 0, 0, 0)")) {
      el.setAttribute("fill", fill);
    }
    if (stroke && stroke !== "none") {
      el.setAttribute("stroke", stroke);
    }
    const sw = cs.strokeWidth;
    if (sw && sw !== "0px") el.setAttribute("stroke-width", sw);
    if (el.tagName === "text") {
      const col = cs.fill || cs.color;
      if (col) el.setAttribute("fill", col);
      const fs = cs.fontSize;
      if (fs) el.setAttribute("font-size", fs);
    }
  });
  return clone;
}

async function renderChartSvgToPng(
  container: HTMLElement,
  scale = 2
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const plotRoot = resolvePdfChartPlotRoot(container);
  const svg = findPrimaryChartSvg(plotRoot);
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  let width = Math.max(1, Math.round(rect.width));
  let height = Math.max(1, Math.round(rect.height));
  if (width <= 2 || height <= 2) {
    const pr = plotRoot.getBoundingClientRect();
    width = Math.max(pr.width || plotRoot.clientWidth || 720, 1);
    height = Math.max(pr.height || plotRoot.clientHeight || 320, 1);
  }

  const plotBox = plotRoot.getBoundingClientRect();
  if (width < 320 && plotBox.width > width) {
    width = Math.max(width, Math.round(Math.min(plotBox.width, 960)));
    height = Math.max(height, Math.round(Math.min(plotBox.height, 540)));
  }
  const vbPad = 6;
  const clone = cloneSvgWithInlineStyles(svg);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute(
    "viewBox",
    `${-vbPad} ${-vbPad} ${width + vbPad * 2} ${height + vbPad * 2}`
  );
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.setAttribute("overflow", "visible");

  const svgString = new XMLSerializer().serializeToString(clone);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const v = await Canvg.fromString(ctx, svgString);
  await v.render();
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

async function captureChartPlotToPng(
  container: HTMLElement,
  scale = 2
): Promise<{ dataUrl: string; width: number; height: number }> {
  try {
    const fromSvg = await renderChartSvgToPng(container, scale);
    if (fromSvg?.dataUrl) return fromSvg;
  } catch (err) {
    console.warn("Chart SVG capture for PDF failed:", err);
  }
  const plotRoot = resolvePdfChartPlotRoot(container);
  const { default: html2canvas } = await import("html2canvas");
  const capW = Math.max(
    plotRoot.scrollWidth,
    plotRoot.clientWidth,
    plotRoot.getBoundingClientRect().width,
    480
  );
  const capH = Math.max(
    plotRoot.scrollHeight,
    plotRoot.clientHeight,
    plotRoot.getBoundingClientRect().height,
    260
  );
  const canvas = await html2canvas(plotRoot, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: capW,
    height: capH,
    windowWidth: capW,
    windowHeight: capH,
    ignoreElements: (el) => {
      if (!(el instanceof HTMLElement)) return false;
      return Boolean(
        el.closest("[aria-hidden='true']") &&
          !el.closest(".recharts-wrapper")
      );
    },
  });
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: Math.max(1, Math.round(canvas.width / scale)),
    height: Math.max(1, Math.round(canvas.height / scale)),
  };
}

export type PdfChartImageCandidate =
  | {
      source: "artifact";
      dataUrl: string;
      width: number;
      height: number;
    }
  | { source: "legacy"; captureEl: HTMLElement }
  | { source: "empty" };

export function isValidPdfChartArtifact(
  artifact: ChartArtifact | null | undefined
): artifact is ChartArtifact {
  return Boolean(
    artifact &&
      artifact.format === "png" &&
      artifact.dataUrl.startsWith("data:image/png") &&
      Number.isFinite(artifact.widthPx) &&
      Number.isFinite(artifact.heightPx) &&
      artifact.widthPx > 2 &&
      artifact.heightPx > 2 &&
      artifact.diagnostics.markCount > 0 &&
      !artifact.diagnostics.failureReason
  );
}

export function resolvePdfChartImageCandidate(args: {
  artifact?: ChartArtifact | null;
  captureEl: HTMLElement | null;
}): PdfChartImageCandidate {
  if (isValidPdfChartArtifact(args.artifact)) {
    return {
      source: "artifact",
      dataUrl: args.artifact.dataUrl,
      width: args.artifact.widthPx,
      height: args.artifact.heightPx,
    };
  }
  return args.captureEl
    ? { source: "legacy", captureEl: args.captureEl }
    : { source: "empty" };
}

export function shouldStartPdfChartOnFreshPage(
  kind: ChartKind,
  availableHeightMm: number,
  requiredHeightMm = PDF_LINE_AREA_MIN_IMAGE_HEIGHT_MM
): boolean {
  if (kind !== "line" && kind !== "area") return false;
  return availableHeightMm < requiredHeightMm;
}

/** Height of the Visualization “Analysis context” metadata block (kicker + rows). */
export function estimatePdfVizAnalysisContextHeight(rowCount: number): number {
  if (rowCount <= 0) return 0;
  const metaRowH = pdfLineHeight(PDF_TYPE.bodySmall) + PDF_SPACING.blockTight;
  return 5.5 + rowCount * metaRowH + PDF_SPACING.blockTight;
}

/** True when analysis-context metadata + chart minimum should start on a fresh page. */
export function shouldStartPdfVizCoreOnFreshPage(args: {
  y: number;
  footerY: number;
  metaRowCount: number;
  chartMinHeightMm?: number;
  insightsReserveMm?: number;
  pageSafeMm?: number;
}): boolean {
  const chartMin =
    args.chartMinHeightMm ??
    PDF_VIZ_EMBED_MIN_HEIGHT_MM + PDF_SPACING.chartFramePad * 2 + 10;
  const insights = args.insightsReserveMm ?? 0;
  const safe = args.pageSafeMm ?? PDF_SPACING.pageSafe;
  const needed =
    estimatePdfVizAnalysisContextHeight(args.metaRowCount) + chartMin + insights;
  return args.y + needed > args.footerY - safe;
}

/** Minimum chart footprint used for viz cohesion checks (not embed sizing). */
export function pdfVizChartCohesionMinHeightMm(): number {
  return PDF_VIZ_EMBED_MIN_HEIGHT_MM + PDF_SPACING.chartFramePad * 2 + 10;
}

export function pdfChartMetadataChipText(
  chip: ChartPresentationMetadataChip
): string {
  const label = chip.label?.trim();
  const value = chip.value.trim();
  return label ? `${label}: ${value}` : value;
}

export function normalizePdfChartMetadataChips(
  chips: readonly ChartPresentationMetadataChip[] | null | undefined,
  opts?: { dimensionFallback?: string | null }
): ChartPresentationMetadataChip[] {
  const dimensionFallback = opts?.dimensionFallback?.trim() || "";
  return (chips ?? [])
    .map((chip) => {
      const value = chip.value.trim();
      if (!value) return null;
      const label = chip.label?.trim() ?? "";
      const labelLower = label.toLowerCase();
      const valueLower = value.toLowerCase();
      if (
        chip.kind === "labeled" &&
        (labelLower === "category" || labelLower === "axis") &&
        valueLower === "category" &&
        dimensionFallback
      ) {
        return {
          ...chip,
          label: labelLower === "axis" ? "Grouped by" : label,
          value: dimensionFallback,
        };
      }
      return chip;
    })
    .filter((chip): chip is ChartPresentationMetadataChip => {
      if (!chip) return false;
      const value = chip.value.trim();
      const label = chip.label?.trim().toLowerCase() ?? "";
      return !(label === "category" && value.toLowerCase() === "category");
    })
    .slice(0, 6);
}

function _sanitizeFileBase(s: string): string {
  const t = s.trim().slice(0, 48) || "analytics-brief";
  return t.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "analytics-brief";
}

function chartTypeLabel(kind: ChartKind): string {
  if (!kind) return "—";
  if (kind === "pie") return "Pie";
  if (kind === "donut") return "Donut";
  if (kind === "bar_horizontal") return "H-Bar";
  if (kind === "line") return "Line";
  if (kind === "area") return "Area";
  if (kind === "scatter") return "Scatter";
  if (kind === "histogram") return "Histogram";
  return "Bar";
}

/** Presentation labels for appendix badges and metadata. */
function pdfChartKindExecutiveLabel(kind: ChartKind | string): string {
  const k = String(kind ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const map: Record<string, string> = {
    bar_horizontal: "Horizontal Bar Chart",
    horizontalbar: "Horizontal Bar Chart",
    bar: "Category Bar Chart",
    line: "Trend Line Chart",
    area: "Trend Area Chart",
    pie: "Category Distribution",
    donut: "Share Distribution",
    scatter: "Relationship Chart",
    histogram: "Distribution Histogram",
    auto_dashboard: "Automated Dashboard",
  };
  return map[k] ?? polishPdfExecutiveLabel(chartTypeLabel(kind as ChartKind));
}

function drawPdfChartKindBadge(
  doc: JsPdfDocument,
  x: number,
  y: number,
  maxW: number,
  label: string,
  accent: [number, number, number],
  panel: [number, number, number]
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  const text = label.slice(0, 42);
  const tw = Math.min(maxW - 4, doc.getTextWidth(text) + 4);
  const bh = 4.2;
  const fill = mixRgb(panel, accent, 0.35);
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, tw, bh, 0.8, 0.8, "FD");
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(text, x + 2, y + 2.8);
  doc.setTextColor(0, 0, 0);
}

function _drawPdfSessionThumbnailCard(
  doc: JsPdfDocument,
  x: number,
  yTop: number,
  w: number,
  h: number,
  thumb: PdfChartThumb,
  accent: [number, number, number],
  themePanel: [number, number, number],
  themeLine: [number, number, number],
  themeInk: [number, number, number],
  themeMuted: [number, number, number]
) {
  const pad = 2.4;
  doc.setFillColor(
    PDF_ENTERPRISE_COLORS.card[0],
    PDF_ENTERPRISE_COLORS.card[1],
    PDF_ENTERPRISE_COLORS.card[2]
  );
  doc.setDrawColor(themeLine[0], themeLine[1], themeLine[2]);
  doc.setLineWidth(0.22);
  doc.roundedRect(x, yTop, w, h, PDF_RADIUS.thumb, PDF_RADIUS.thumb, "FD");
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(x, yTop, 1.3, h, "F");

  let cy = yTop + pad;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.75);
  doc.setTextColor(themeInk[0], themeInk[1], themeInk[2]);
  const ttl = doc.splitTextToSize(
    polishPdfExecutiveLabel(thumb.title),
    w - pad * 2 - 1
  );
  doc.text(ttl.slice(0, 1), x + pad, cy + 2.2);
  cy += 5.5;

  const badgeLabel = pdfChartKindExecutiveLabel(thumb.kind);
  const badgeH = 4.4;
  const plotH = Math.max(9, h - (cy - yTop) - badgeH - pad - 1.5);
  drawSparkline(doc, x + pad, cy, w - pad * 2, plotH, thumb.values, accent);
  cy += plotH + 1.8;

  drawPdfChartKindBadge(
    doc,
    x + pad,
    cy,
    w - pad * 2,
    badgeLabel,
    accent,
    themePanel
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(themeMuted[0], themeMuted[1], themeMuted[2]);
  const pts =
    thumb.values.length > 1
      ? `${thumb.values.length} points`
      : "Single value";
  doc.text(pts, x + pad, yTop + h - 2.2);
  doc.setTextColor(0, 0, 0);
}

export function datasetKindLabel(kind: string): string {
  const k = (kind || "").trim().toLowerCase();
  const map: Record<string, string> = {
    ecommerce: "E-commerce / retail",
    manufacturing: "Manufacturing / operations",
    hr: "Human resources / people analytics",
    sales: "Sales / commercial",
    banking: "Banking / Financial Services",
    finance: "Finance / accounting",
    operations: "Operations / incidents",
    marketing: "Marketing / growth",
    generic: "General business",
  };
  if (map[k]) return map[k];
  if (!k) return "General business";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** Domain/type line for PDF cover, snapshot, and exec summary. */
export function resolvePdfDatasetProfileLabel(dataset: {
  datasetKind: string;
  profileLabel?: string;
}): string {
  const explicit = (dataset.profileLabel ?? "").trim();
  if (explicit) return explicit;
  return datasetKindLabel(dataset.datasetKind);
}

function humanizePdfDumpLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** Peel alternating text / trailing numeric tokens from the right (handles chained key-value dumps). */
function peelTrailingNumericPairs(
  text: string,
  maxPairs: number
): [string, string][] {
  const pairs: [string, string][] = [];
  let rest = text.replace(/\s+/g, " ").trim();
  const re = /^(.*?)\s+(-?[\d,]+(?:\.\d+)?)\s*$/;
  while (rest.length > 0 && pairs.length < maxPairs) {
    const m = rest.match(re);
    if (!m) break;
    const left = m[1].trim();
    const n = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(n) || left.length < 1) break;
    pairs.unshift([humanizePdfDumpLabel(left), formatPdfBusinessNumber(n)]);
    rest = left;
  }
  return pairs;
}

function isStructuredDumpExecutiveLine(line: string): boolean {
  const t = line.trim();
  if (/^(The dataset contains|Question:|Main takeaway:|Upload data)/i.test(t)) {
    return false;
  }
  if (t.length < 40) return false;
  const peel = peelTrailingNumericPairs(t, 6);
  if (peel.length >= 2) return true;
  if (/\d\.\d{5,}/.test(t)) return true;
  if ((t.match(/_/g)?.length ?? 0) >= 2 && /\d/.test(t) && t.length >= 48) {
    return true;
  }
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 8 && /\d/.test(t) && t.length >= 55) return true;
  if (peel.length === 1 && peel[0][0].length >= 36 && /\d/.test(t)) {
    if (/\d\.\d{5,}/.test(t) || (t.match(/_/g)?.length ?? 0) >= 1) {
      return true;
    }
  }
  return false;
}

function formatNumericTokensInSignalLine(s: string): string {
  const normalized = normalizePdfIsoDatesInText(s);
  const formatted = normalized.replace(
    /\b(-?[\d,]+(?:\.\d+)?)\b/g,
    (match, _g1, offset, full) => {
      const before = full.slice(Math.max(0, offset - 6), offset);
      const after = full.slice(offset + match.length, offset + match.length + 4);
      if (/\d{4}-$/.test(before) || /^-\d{1,2}/.test(after)) {
        return match.replace(/,/g, "");
      }
      const n = Number(match.replace(/,/g, ""));
      if (!Number.isFinite(n)) return match;
      if (n >= 1900 && n <= 2100 && /-$/.test(before)) {
        return String(Math.round(n));
      }
      return formatPdfBusinessNumber(n);
    }
  );
  return collapsePdfDuplicateWords(formatted);
}

/** Short category-style label for PDF bullets (drops long metric-prefixed junk). */
function extractShortSignalName(rawLabel: string): string {
  const t = humanizePdfDumpLabel(rawLabel);
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return t.slice(0, 24);
  const last = words[words.length - 1]!;
  if (
    last.length >= 1 &&
    last.length <= 22 &&
    /^[A-Za-z0-9._+-]+$/.test(last)
  ) {
    return last;
  }
  if (words.length >= 2) {
    const two = words.slice(-2).join(" ");
    if (two.length <= 28) return two;
  }
  return t.length > 28 ? `${t.slice(0, 25)}…` : t;
}

function pdfAscendingFromQuestion(question: string): boolean | null {
  const q = question.toLowerCase();
  if (/\b(lowest|minimum|least|bottom|smallest)\b/.test(q)) return true;
  if (/\b(highest|maximum|top|largest|greatest)\b/.test(q)) return false;
  return null;
}

function pdfIsRankingQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    pdfAscendingFromQuestion(question) !== null ||
    /\b(rank|ranking|compare|comparison|which\s+\w+\s+has)\b/.test(q)
  );
}

function pdfChartMetricFormatContext(
  chart: NonNullable<ExecutivePdfExportInput["chart"]>,
  question: string
): MetricFormatContext {
  return {
    presentationKind: chart.presentationKind,
    roundingHint: chart.roundingHint ?? null,
    metricLabel: chart.alignedMetricDisplay?.trim() || chart.alignedMetric?.trim() || null,
    metricType: chart.metricType ?? null,
    chartTitle: chart.title,
    question,
  };
}

function effectivePdfMetricNumber(
  row: ChartRow,
  _ctx: MetricFormatContext
): number {
  const raw = readChartRowRawValue(row);
  if (!Number.isFinite(raw)) {
    const dv = row.displayValue?.trim();
    if (dv) {
      const parsed = Number(dv.replace(/[^0-9.-]+/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
  }
  return raw;
}

function formatPdfChartRowMetricDisplay(
  row: ChartRow,
  ctx: MetricFormatContext
): string {
  return formatExecutiveMetricValue(row, ctx);
}

function formatPdfAppendixSeriesValue(
  row: ChartRow,
  ctx: MetricFormatContext
): string {
  return formatRawMetricValue(row, ctx);
}

function pdfCoercePresentationKindForRanking(
  kind: ChartKind,
  question: string
): ChartKind {
  if (!pdfIsRankingQuestion(question)) return kind;
  if (kind === "pie" || kind === "donut") return "bar_horizontal";
  return kind;
}

export function resolvePdfChartTitle(
  question: string,
  fallbackTitle: string,
  metricDisplay?: string | null,
  aggregation?: string | null
): string {
  const q = question.toLowerCase();
  const fb = fallbackTitle.trim();
  const ascending = pdfAscendingFromQuestion(question);
  const staleEmployee =
    /\bemployee\s+count\b/i.test(fb) &&
    (/\battendance\b/.test(q) || /\battendance\b/i.test(metricDisplay ?? ""));

  if (/\battendance\b/.test(q) && /\bdepartment\b/.test(q)) {
    if (ascending === true) return "Minimum attendance percent by department";
    if (ascending === false) return "Maximum attendance percent by department";
    return "Total attendance percent by department";
  }

  if (staleEmployee && metricDisplay) {
    const met = metricDisplay.trim();
    if (/\battendance\b/i.test(met)) {
      if (ascending === true) return `Minimum ${met} by department`;
      if (ascending === false) return `Maximum ${met} by department`;
      return `${met} by department`;
    }
  }

  if (staleEmployee) {
    return ascending === true
      ? "Minimum attendance percent by department"
      : "Total attendance percent by department";
  }

  if (fb && !staleEmployee) return fb;
  if (metricDisplay?.trim()) {
    const agg = (aggregation ?? "").toLowerCase();
    const prefix =
      agg === "min" || agg === "minimum"
        ? "Minimum "
        : agg === "max" || agg === "maximum"
          ? "Maximum "
          : "";
    return `${prefix}${metricDisplay.trim()} by department`;
  }
  return fb || "Chart";
}

function resolvePdfRankedMetricPhrase(
  question: string,
  metricHint: string | null | undefined,
  preferLow: boolean
): string {
  const q = question.toLowerCase();
  const hint = (metricHint ?? "").toLowerCase();
  if (/\battendance\b/.test(q) || /\battendance\b/.test(hint)) {
    if (/\b(lowest|minimum|least)\b/.test(q) || preferLow) {
      return "minimum attendance percent";
    }
    if (/\b(highest|maximum|top)\b/.test(q)) return "maximum attendance percent";
    return "attendance percent";
  }
  const cleaned = normalizePdfMetricPhrase(metricHint);
  if (!cleaned || cleaned === "value") {
    return preferLow ? "lowest value" : "highest value";
  }
  if (preferLow) {
    return metricPhraseStartsWithRanking(cleaned)
      ? cleaned
      : `lowest ${cleaned}`;
  }
  return metricPhraseStartsWithRanking(cleaned) ? cleaned : `highest ${cleaned}`;
}

function formatPdfTrendRankedNarrative(
  signals: PdfRankedSignal[],
  metricHint?: string | null
): string {
  const ranked = signals.filter(
    (s) => !/^gap\b/i.test(s.rank) && !/↔/.test(s.category)
  );
  if (!ranked.length) return "";
  const lead = ranked[0]!;
  const metric = normalizePdfMetricPhrase(metricHint);
  const cat0 = formatPdfCategoryLabel(lead.category);
  const val0 = polishPdfBusinessCopy(lead.valueDisplay);
  const leadPhrase = pdfRankedVerbPhrase(metric, false, true);
  let sentence = `${cat0} ${leadPhrase} at ${val0}`;
  if (ranked[1]) {
    const cat1 = formatPdfCategoryLabel(ranked[1].category);
    const val1 = polishPdfBusinessCopy(ranked[1].valueDisplay);
    sentence += `, followed by ${cat1} at ${val1}`;
  }
  return polishPdfBusinessCopy(`${sentence}.`);
}

/** Executive sentence from ranked chart signals (e.g. lowest attendance by department). */
export function formatPdfRankedSignalsNarrative(
  signals: PdfRankedSignal[],
  metricHint?: string | null,
  question = ""
): string {
  if (!signals.length) return "";
  const lead = signals[0]!;
  const leadCat = formatPdfCategoryLabel(lead.category);
  const trendLike =
    /^(peak|highest|lowest)\b/i.test(lead.rank) &&
    (parsePdfIsoDateLabel(lead.category) != null ||
      /^\d{4}-\d{2}-\d{2}/.test(leadCat));
  if (trendLike || /peak\s+week/i.test(lead.rank)) {
    const trendNarrative = formatPdfTrendRankedNarrative(signals, metricHint);
    if (trendNarrative) return polishPdfBusinessCopy(trendNarrative);
  }
  const preferLow = /^lowest/i.test(lead.rank.trim());
  const preferHigh = /^highest/i.test(lead.rank.trim());
  const metric = resolvePdfRankedMetricPhrase(question, metricHint, preferLow);
  const leadPhrase = pdfRankedVerbPhrase(metric, preferLow, preferHigh);
  const leadVal = polishPdfBusinessCopy(lead.valueDisplay);
  if (signals.length === 1) {
    return polishPdfBusinessCopy(`${leadCat} ${leadPhrase} at ${leadVal}.`);
  }
  const followers = signals.slice(1, 3).filter((s) => !/^gap\b/i.test(s.rank));
  let followText = "";
  if (followers.length === 1) {
    followText = `followed by ${formatPdfCategoryLabel(followers[0]!.category)} at ${polishPdfBusinessCopy(followers[0]!.valueDisplay)}`;
  } else if (followers.length >= 2) {
    followText = `followed by ${formatPdfCategoryLabel(followers[0]!.category)} at ${polishPdfBusinessCopy(followers[0]!.valueDisplay)} and ${formatPdfCategoryLabel(followers[1]!.category)} at ${polishPdfBusinessCopy(followers[1]!.valueDisplay)}`;
  }
  if (!followText) {
    return polishPdfBusinessCopy(`${leadCat} ${leadPhrase} at ${leadVal}.`);
  }
  return polishPdfBusinessCopy(`${leadCat} ${leadPhrase} at ${leadVal}, ${followText}.`);
}

function pdfTrendRankedSignalsFromChartData(
  data: ChartRow[],
  kind: ChartKind,
  ctx: MetricFormatContext,
  max = 3
): PdfRankedSignal[] {
  const sorted = [...data].sort(
    (a, b) => readChartRowRawValue(b) - readChartRowRawValue(a)
  );
  const fmt = (row: ChartRow) =>
    polishPdfBusinessCopy(formatPdfChartRowMetricDisplay(row, ctx));
  return sorted.slice(0, max).map((row, i) => ({
    rank: i === 0 ? "Highest" : i === 1 ? "Second" : "Third",
    category: formatPdfCategoryLabel(String(row.name ?? "")),
    valueDisplay: fmt(row),
  }));
}

function pdfRankedSignalsFromChartData(
  data: ChartRow[],
  kind: ChartKind,
  ascending: boolean | null,
  ctx: MetricFormatContext,
  max = 3
): PdfRankedSignal[] {
  if (!data.length || kind === "scatter") return [];
  const merged = new Map<string, ChartRow>();
  for (const row of data) {
    const cat = String(row.name ?? "").trim() || "—";
    const v = effectivePdfMetricNumber(row, ctx);
    if (!Number.isFinite(v)) continue;
    const prev = merged.get(cat);
    if (!prev || v > effectivePdfMetricNumber(prev, ctx)) {
      merged.set(cat, row);
    }
  }
  const deduped = [...merged.values()];
  if (!deduped.length) return [];
  const preferLow = ascending === true;
  deduped.sort((a, b) => {
    const va = effectivePdfMetricNumber(a, ctx);
    const vb = effectivePdfMetricNumber(b, ctx);
    return preferLow ? va - vb : vb - va;
  });
  const rankWords = preferLow
    ? (["Lowest", "Second lowest", "Third lowest"] as const)
    : ascending === false
      ? (["Highest", "Second highest", "Third highest"] as const)
      : (["Highest", "Second", "Third"] as const);
  return deduped.slice(0, max).map((row, i) => {
    const valueDisplay = formatPdfChartRowMetricDisplay(row, ctx);
    return {
      rank: rankWords[i] ?? `#${i + 1}`,
      category: formatPdfCategoryLabel(String(row.name ?? "").trim() || "—"),
      valueDisplay: polishPdfBusinessCopy(valueDisplay),
    };
  });
}

function buildPdfVizExecutiveFacts(
  data: ChartRow[],
  kind: ChartKind,
  ascending: boolean | null,
  metricLabel: string | null,
  categoryLabel: string | null,
  metricCtx: MetricFormatContext
): { title: string; value: string; hint?: string }[] {
  if (!data.length) return [];
  const scored = data
    .map((row) => ({
      row,
      n: effectivePdfMetricNumber(row, metricCtx),
    }))
    .filter((x) => Number.isFinite(x.n));
  if (!scored.length) return [];

  const preferLow = ascending === true;
  let minEntry = scored[0]!;
  let maxEntry = scored[0]!;
  for (const x of scored) {
    if (x.n < minEntry.n) minEntry = x;
    if (x.n > maxEntry.n) maxEntry = x;
  }
  const spread = Math.max(0, maxEntry.n - minEntry.n);
  const spreadLabel = formatMetricSpreadGap(spread, metricCtx);
  const fmt = (row: ChartRow) => formatPdfChartRowMetricDisplay(row, metricCtx);
  const cat = polishPdfKpiLabel(
    (categoryLabel ?? "department").replace(/^by\s+/i, "").trim() || "department"
  );
  const met = normalizePdfMetricPhrase(metricLabel);

  const sortedDesc = [...scored].sort((a, b) => b.n - a.n);
  const sortedAsc = [...scored].sort((a, b) => a.n - b.n);
  const nextHighest = sortedDesc[1];
  const nextLowest = sortedAsc[1];

  if (preferLow) {
    return [
      {
        title: `Lowest ${cat}`,
        value: formatPdfCategoryLabel(String(minEntry.row.name ?? "—")),
      },
      { title: `Lowest ${met}`, value: fmt(minEntry.row) },
      ...(nextLowest
        ? [
            {
              title: "Next lowest category",
              value: formatPdfCategoryLabel(String(nextLowest.row.name ?? "")),
            },
            {
              title: `Next lowest ${met}`,
              value: fmt(nextLowest.row),
            },
          ]
        : [
            {
              title: "Next lowest category",
              value: "—",
            },
          ]),
      {
        title: "Gap between peak and lowest",
        value: spreadLabel,
      },
    ];
  }

  return [
    {
      title: `Highest ${cat}`,
      value: formatPdfCategoryLabel(String(maxEntry.row.name ?? "—")),
    },
    { title: `Highest ${met}`, value: fmt(maxEntry.row) },
    ...(nextHighest
      ? [
          {
            title: "Next highest category",
            value: formatPdfCategoryLabel(String(nextHighest.row.name ?? "")),
          },
          {
            title: `Next highest ${met}`,
            value: fmt(nextHighest.row),
          },
        ]
      : [
          {
            title: "Next highest category",
            value: "—",
          },
        ]),
    {
      title: "Gap between peak and lowest",
      value: spreadLabel,
    },
  ];
}

function buildPdfTrendVizExecutiveFacts(
  data: ChartRow[],
  metricLabel: string | null,
  metricCtx: MetricFormatContext
): { title: string; value: string }[] {
  if (!data.length) return [];
  const sorted = [...data].sort(
    (a, b) => readChartRowRawValue(b) - readChartRowRawValue(a)
  );
  const peak = sorted[0]!;
  const low = sorted[sorted.length - 1]!;
  const second = sorted[1];
  const spread = Math.round(
    readChartRowRawValue(peak) - readChartRowRawValue(low)
  );
  const met = normalizePdfMetricPhrase(metricLabel);
  const fmt = (row: ChartRow) => formatPdfChartRowMetricDisplay(row, metricCtx);
  return [
    { title: "Peak period", value: formatPdfCategoryLabel(String(peak.name ?? "")) },
    { title: `Peak ${met}`, value: fmt(peak) },
    ...(second
      ? [
          {
            title: "Next highest period",
            value: formatPdfCategoryLabel(String(second.name ?? "")),
          },
          {
            title: `Next highest ${met}`,
            value: fmt(second),
          },
        ]
      : [
          {
            title: "Next highest period",
            value: "—",
          },
        ]),
    {
      title: "Gap between peak and lowest",
      value: formatPdfBusinessNumber(spread),
    },
  ];
}

function resolvePdfExecutiveNarrative(input: ExecutivePdfExportInput): string {
  const metricHint =
    input.chart?.alignedMetricDisplay?.trim() ||
    input.chart?.alignedMetric?.trim() ||
    input.chartAxisLabels?.value?.trim() ||
    null;
  const q = input.question.trim();
  if (input.pdfRankedSignals?.length) {
    const narrative = formatPdfRankedSignalsNarrative(
      input.pdfRankedSignals,
      metricHint,
      q
    );
    if (narrative) return polishPdfBusinessCopy(narrative);
  }
  const candidates = [
    input.executiveInsightsBrief,
    input.insightSummary,
    partitionExecSummaryLines(input.execSummaryLines).takeaway,
  ];
  for (const raw of candidates) {
    const t = polishPdfBusinessCopy(String(raw ?? "").trim());
    if (!t || isStructuredDumpExecutiveLine(t)) continue;
    if (/^name\s+value\b/i.test(t)) continue;
    if (
      isStaleStandaloneMetricTitle(
        t,
        metricHint,
        input.chart?.title ?? null
      )
    ) {
      continue;
    }
    return t;
  }
  return "";
}

function executiveDumpToRankedBullets(
  pairs: [string, string][],
  max = 3
): string[] {
  const scored = pairs.map(([lbl, vs]) => {
    const n = Number(String(vs).replace(/,/g, ""));
    return { cat: extractShortSignalName(lbl), n };
  }).filter((x) => Number.isFinite(x.n) && x.cat.length > 0);
  if (!scored.length) return [];
  const byCat = new Map<string, number>();
  for (const row of scored) {
    const prev = byCat.get(row.cat);
    if (prev == null || row.n > prev) byCat.set(row.cat, row.n);
  }
  const uniq = [...byCat.entries()].map(([cat, n]) => ({ cat, n }));
  uniq.sort((a, b) => b.n - a.n);
  const top = uniq.slice(0, max);
  const rankWords = ["Highest", "Second", "Third"] as const;
  return top.map((row, i) => {
    const r = rankWords[i] ?? `#${i + 1}`;
    return `${r}: ${row.cat} — ${formatPdfBusinessNumber(row.n)}`;
  });
}

function executiveDumpToSignalValueRows(
  pairs: [string, string][],
  max = 3
): [string, string][] {
  return pairs.slice(0, max).map(([lbl, vs]) => {
    const n = Number(String(vs).replace(/,/g, ""));
    const display = Number.isFinite(n) ? formatPdfBusinessNumber(n) : vs;
    return [extractShortSignalName(lbl), display];
  });
}

function stripRankingLeadIn(s: string): string {
  return s
    .replace(/^\s*(?:Highest|High|Top)\s*[:#\-–—]?\s*/i, "")
    .replace(/^\s*(?:Lowest|Low|Bottom)\s*[:#\-–—]?\s*/i, "")
    .trim();
}

/** Up to `max` lines like "Category: 79,750" for the highlighted-signals box. */
function _highlightSignalsToBulletLines(raw: string, max: number): string[] {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const chunks = t
    .split(/\s*·\s*|\s*;\s*|\s*\|\s*|\n+/)
    .map((s) => stripRankingLeadIn(s.trim()))
    .filter(Boolean);
  const sourceChunks = chunks.length ? chunks : [stripRankingLeadIn(t)];
  const allPairs: [string, string][] = [];
  for (const ch of sourceChunks) {
    peelTrailingNumericPairs(ch, 32).forEach((p) => allPairs.push(p));
  }
  if (!allPairs.length) {
    const one = polishPdfBusinessCopy(formatNumericTokensInSignalLine(t));
    return one ? [one.slice(0, 200) + (one.length > 200 ? "…" : "")] : [];
  }
  const scored = allPairs.map(([lbl, vs]) => {
    const n = Number(String(vs).replace(/,/g, ""));
    return { cat: extractShortSignalName(lbl), n };
  }).filter((x) => Number.isFinite(x.n) && x.cat.length > 0);
  if (!scored.length) {
    return [polishPdfBusinessCopy(formatNumericTokensInSignalLine(t))].slice(0, max);
  }
  const byCat = new Map<string, number>();
  for (const row of scored) {
    const prev = byCat.get(row.cat);
    if (prev == null || row.n > prev) byCat.set(row.cat, row.n);
  }
  const rows = [...byCat.entries()].map(([cat, n]) => ({ cat, n }));
  rows.sort((a, b) => b.n - a.n);
  return rows
    .slice(0, max)
    .map((r) =>
      polishPdfBusinessCopy(`${r.cat}: ${formatPdfBusinessNumber(r.n)}`)
    );
}

type ExecSummaryPartition = {
  scope: string[];
  question: string;
  takeaway: string;
  evidence: string[];
  metrics: string[];
  other: string[];
};

function partitionExecSummaryLines(lines: string[]): ExecSummaryPartition {
  const scope: string[] = [];
  let question = "";
  let takeaway = "";
  const evidence: string[] = [];
  const metrics: string[] = [];
  const other: string[] = [];

  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (/^question:/i.test(s)) {
      question = s.replace(/^question:\s*/i, "").trim();
      continue;
    }
    if (/^main takeaway:/i.test(s)) {
      takeaway = s.replace(/^main takeaway:\s*/i, "").trim();
      continue;
    }
    if (/^the dataset contains/i.test(s)) {
      scope.push(s);
      continue;
    }
    if (
      /treat (takeaways|findings)|evidence strength|directional findings|mapping is still|moderate sample|qualify strong claims|filtered row|measured language|visualized categor/i.test(
        s
      )
    ) {
      evidence.push(s);
      continue;
    }
    if (/^upload data/i.test(s)) {
      other.push(s);
      continue;
    }
    const colon = s.indexOf(":");
    if (colon > 0 && colon < 52 && !isStructuredDumpExecutiveLine(s)) {
      metrics.push(s);
      continue;
    }
    other.push(s);
  }

  return { scope, question, takeaway, evidence, metrics, other };
}

/** Split narrative prose into scannable executive bullets. */
function splitProseToInsightBullets(text: string, maxBullets = 7): string[] {
  const raw = polishPdfBusinessCopy(text).trim();
  if (!raw) return [];

  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const explicit = lines.filter(
    (l) => /^[-•*]\s+/.test(l) || /^\d+[.)]\s+/.test(l)
  );
  if (explicit.length >= 2) {
    return explicit
      .map((l) => l.replace(/^[-•*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
      .slice(0, maxBullets);
  }

  const clauseSplit = raw
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (clauseSplit.length >= 2) {
    return clauseSplit.slice(0, maxBullets);
  }

  if (raw.length > 120) {
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 14);
    if (sentences.length >= 2) {
      return sentences.slice(0, maxBullets);
    }
  }

  return [raw];
}

export async function runExecutivePdfExport(
  rawInput: ExecutivePdfExportInput
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const input = sanitizeExecutivePdfExportInput(rawInput);
  const pdfMode: PdfExportMode = input.includes.pdfMode ?? "executive";
  const analystPdf = pdfMode === "analyst";
  const metricHintForPlan =
    input.chart?.alignedMetricDisplay?.trim() ||
    input.chart?.alignedMetric?.trim() ||
    input.chartAxisLabels?.value?.trim() ||
    null;
  const chartHighlightsNarrative =
    input.pdfRankedSignals?.length &&
    input.pdfRankedSignals.length > 0
      ? polishPdfBusinessCopy(
          formatPdfRankedSignalsNarrative(
            input.pdfRankedSignals.slice(0, 3),
            metricHintForPlan,
            input.question
          )
        )
      : null;
  const contentPlan: PdfExecutiveContentPlan = buildPdfExecutiveContentPlan({
    question: input.question,
    execSummaryLines: input.execSummaryLines,
    insightSections: input.insightSections ?? undefined,
    insightSummary: input.insightSummary,
    executiveInsightsBrief: input.executiveInsightsBrief,
    pdfRankedSignals: input.pdfRankedSignals,
    chartInsightBadge: input.chartInsightBadge,
    vizExecutiveFacts: input.vizExecutiveFacts,
    insightConfidenceLevel: input.insightConfidenceLevel,
    insightConfidenceRationale: input.insightConfidenceRationale,
    chartIntel: input.chartIntel,
    routingPlan: input.routingPlan,
    chartHighlightsNarrative,
  });
  const hierarchyLabels = pdfExecutiveHierarchyHeadings();
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const headerBand = 11;
  const footerBand = 11;
  const contentTop0 = margin + headerBand;
  const footerY = pageHeight - footerBand;
  const contentWidth = pageWidth - margin * 2;

  const accent = hexToRgb(input.branding.accentHex || DEFAULT_REPORT_BRANDING.accentHex);
  const company =
    input.branding.companyName.trim() ||
    BRANDING.appName;
  const tagline = input.branding.tagline.trim();

  /** Print-safe palette — same for app light/dark UI (see buildPdfExportTheme). */
  const theme = buildPdfExportTheme(accent);

  let y = contentTop0;

  const ensurePageSpace = (neededHeight: number) => {
    if (y + neededHeight > footerY - PDF_SPACING.pageSafe) {
      doc.addPage();
      y = contentTop0;
    }
  };

  const ruleFull = (yy: number) => {
    pdfDrawSoftRule(doc, margin, yy, pageWidth - margin, theme.lineSoft, 0.28);
  };

  const sectionTitle = (title: string) => {
    ensurePageSpace(18);
    y += PDF_SPACING.sectionBefore;
    doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    doc.rect(margin, y - 3.5, 1.25, 9.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.section);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(title, margin + 4, y + 2.6);
    y += 9.5;
    ruleFull(y);
    y += PDF_SPACING.sectionAfterRule;
    doc.setTextColor(0, 0, 0);
  };

  const pdfBodyLineHeight = (fontSize: number) => pdfLineHeight(fontSize);

  const bodyText = (
    text: string,
    fontSize: number = PDF_TYPE.body,
    color = theme.body
  ) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineH = pdfBodyLineHeight(fontSize);
    ensurePageSpace(lines.length * lineH + PDF_SPACING.paragraphAfter);
    doc.text(lines, margin, y);
    y += lines.length * lineH + PDF_SPACING.paragraphAfter;
    doc.setTextColor(0, 0, 0);
  };

  const drawPremiumEmptyState = (title: string, body: string) => {
    ensurePageSpace(28);
    const bottom = pdfDrawPremiumEmptyState(
      doc,
      margin,
      y,
      contentWidth,
      title,
      body,
      {
        panel: theme.panel,
        line: theme.line,
        ink: theme.ink,
        muted: theme.muted,
        accent: theme.accent,
      }
    );
    y = bottom + PDF_SPACING.emptyStateAfter;
  };

  const drawDataPreviewSection = () => {
    if (!input.includes.includeDataPreview) return;

    const { rows: preview, columns: cols } = input.preview;
    const maxCols = cols.length
      ? Math.min(cols.length, PDF_DATA_PREVIEW_MAX_COLS)
      : 0;
    const excerptRowCount = preview.length
      ? Math.min(preview.length, PDF_DATA_PREVIEW_MAX_ROWS)
      : 0;
    const introBlockH =
      12 +
      (cols.length > maxCols ? 22 : 0) +
      (preview.length && cols.length ? 11 : 0);

    let previewHeads: string[] = [];
    let previewBody: string[][] = [];
    if (preview.length && cols.length) {
      const previewColKeys = cols.slice(0, maxCols);
      previewHeads = previewColKeys;
      previewBody = preview.slice(0, excerptRowCount).map((row) =>
        previewColKeys.map((c) => formatPdfPreviewCellValue(row[c]))
      );
    }
    const previewTableH =
      previewBody.length > 0
        ? measurePdfDataPreviewTableStackMm(previewHeads, previewBody.length)
        : 0;
    const sectionReserve = 30 + introBlockH + previewTableH + 12;
    if (y + sectionReserve > footerY - 6) {
      doc.addPage();
      y = contentTop0;
    }
    sectionTitle("Appendix: Sample data");
    if (!preview.length || !cols.length) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.preview.title,
        PDF_EMPTY_STATES.preview.body
      );
    } else {
      y += PDF_SPACING.tableBefore;
      bodyText(
        `Sample excerpt: ${formatPdfBusinessNumber(excerptRowCount)} rows × ${formatPdfBusinessNumber(previewHeads.length)} columns (structured table).`,
        PDF_TYPE.bodySmall
      );
      if (cols.length > previewHeads.length) {
        bodyText(
          `Showing first ${maxCols} columns only; remaining columns omitted to fit PDF width.`,
          8.5
        );
      }
      y = drawPdfDataPreviewTable({
        doc,
        margin,
        contentWidth,
        y,
        footerY,
        contentTopY: contentTop0,
        accent: theme.accent,
        headers: previewHeads,
        body: previewBody,
      });
    }
    y += 4;
    doc.setTextColor(0, 0, 0);
  };

  const _bodyParagraphs = (text: string) => {
    const raw = text.trim();
    if (!raw) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.narrative.title,
        PDF_EMPTY_STATES.narrative.body
      );
      return;
    }
    const byBlank = raw
      .split(/\n\s*\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const paras =
      byBlank.length > 1
        ? byBlank
        : raw.split("\n").map((s) => s.trim()).filter(Boolean);
    paras.forEach((p, i) => {
      if (i > 0) y += PDF_SPACING.paragraphAfter * 0.5;
      bodyText(p, PDF_TYPE.body);
    });
  };

  /** Height (mm) for text rendered like {@link bodyParagraphs} at a given font size. */
  const _estimateInsightBodyHeightMm = (
    text: string,
    fontSize = 10
  ): number => {
    const raw = text.trim();
    if (!raw) return fontSize * 0.42 + 1.45 + 2;
    const lineH = fontSize * 0.42 + 1.45;
    const byBlank = raw
      .split(/\n\s*\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const paras =
      byBlank.length > 1
        ? byBlank
        : raw.split("\n").map((s) => s.trim()).filter(Boolean);
    let h = 0;
    paras.forEach((p, i) => {
      if (i > 0) h += 2;
      const lines = doc.splitTextToSize(p, contentWidth);
      h += lines.length * lineH + 2;
    });
    return h;
  };

  const estimateBulletBodyHeightMm = (text: string, fontSize = 9.5) => {
    const bullets = splitProseToInsightBullets(text, 7);
    const lh = pdfBodyLineHeight(fontSize);
    let h = 0;
    bullets.forEach((b, i) => {
      if (i > 0) h += 0.5;
      const lines = doc.splitTextToSize(`• ${b}`, contentWidth - 5);
      h += lines.length * lh + 1.25;
    });
    return h + 3;
  };

  /** Keep subsection title with its body; start on a new page if the block would break awkwardly. */
  const ensureAiBlockFits = (
    subsectionTitle: string,
    titleFontSize: number,
    body: string,
    bodyFontSize = 9.5
  ) => {
    const titleLineH = titleFontSize * 0.42 + 1.45;
    const titleH = subsectionTitle.trim() ? titleLineH + 6 : 0;
    const bodyH = estimateBulletBodyHeightMm(body, bodyFontSize);
    ensurePageSpace(titleH + bodyH + 10);
  };

  const insightSubheading = (title: string, bodyReserveMm = 12) => {
    ensurePageSpace(
      PDF_SPACING.subsectionBefore + PDF_SPACING.subsectionAfter + bodyReserveMm
    );
    y += PDF_SPACING.subsectionBefore;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.subsection);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(title, margin, y);
    pdfDrawSoftRule(doc, margin, y + 1.8, margin + 28, theme.lineSoft, 0.2);
    y += PDF_SPACING.subsectionAfter;
    doc.setTextColor(0, 0, 0);
  };

  const drawExecBullet = (text: string, fontSize = 9.5) => {
    const wrapped = doc.splitTextToSize(`• ${text}`, contentWidth - 8);
    const lh = pdfBodyLineHeight(fontSize);
    ensurePageSpace(wrapped.length * lh + 2.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
    doc.text(wrapped, margin + 3, y);
    y += wrapped.length * lh + PDF_SPACING.bulletGap;
    doc.setTextColor(0, 0, 0);
  };

  const execSummaryBreather = () => {
    y += PDF_SPACING.execSummaryBlock * 0.45;
    pdfDrawInsetSectionDivider(
      doc,
      margin + 6,
      y,
      pageWidth - margin - 6,
      theme.lineSoft
    );
    y += PDF_SPACING.execSummaryBlock * 0.55;
  };

  const drawMainTakeawayCallout = (text: string) => {
    const polished = polishPdfBusinessCopy(text);
    if (!polished) return;
    const lines = doc.splitTextToSize(polished, contentWidth - 14);
    const lh = pdfBodyLineHeight(PDF_TYPE.body);
    const boxH = PDF_SPACING.panelPad + lines.length * lh + PDF_SPACING.panelPad;
    ensurePageSpace(boxH + 6);
    pdfDrawEnterprisePanel(doc, margin, y, contentWidth, boxH, {
      fill: theme.card,
      border: theme.line,
      accent: theme.accent,
      radius: 1.6,
    });
    pdfDrawPanelKicker(
      doc,
      margin + 4,
      y + PDF_SPACING.panelPad,
      "Main takeaway",
      theme.muted,
      theme.accent
    );
    let cy = y + PDF_SPACING.panelPad + 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.body);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    lines.forEach((ln: string) => {
      doc.text(ln, margin + 5, cy);
      cy += lh;
    });
    y += boxH + PDF_SPACING.subsectionAfter;
    doc.setTextColor(0, 0, 0);
  };

  const bodyBullets = (items: string[], fontSize = 9.5) => {
    const bullets = items
      .flatMap((t) => splitProseToInsightBullets(t, 5))
      .flatMap((b) => {
        if (b.length <= 108) return [b];
        return b
          .split(/(?<=[;])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 10)
          .slice(0, 3);
      })
      .slice(0, 6);
    if (!bullets.length) return;
    bullets.forEach((b, i) => {
      if (i > 0) y += PDF_SPACING.bulletGap;
      drawExecBullet(b, fontSize);
    });
    y += PDF_INSIGHT_PARAGRAPH_GAP_MM;
  };

  const drawEvidenceNoteBox = (notes: string[]) => {
    if (!notes.length) return;
    const polished = notes.map((n) => polishPdfBusinessCopy(n)).filter(Boolean);
    if (!polished.length) return;
    const linePitch = pdfBodyLineHeight(9);
    let contentH = 0;
    polished.forEach((note) => {
      const wrapped = doc.splitTextToSize(note, contentWidth - 12);
      contentH += wrapped.length * linePitch;
    });
    const boxH = contentH + 9;
    ensurePageSpace(boxH + 4);
    doc.setFillColor(theme.panel[0], theme.panel[1], theme.panel[2]);
    doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, contentWidth, boxH, 1.2, 1.2, "FD");
    pdfDrawPanelKicker(doc, margin + 3, y + 4.5, "Evidence strength", theme.muted, theme.accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let hy = y + 8.5;
    polished.forEach((note, ni) => {
      if (ni > 0) hy += PDF_SPACING.bulletGap + 0.5;
      const wrapped = doc.splitTextToSize(note, contentWidth - 14);
      wrapped.forEach((ln: string) => {
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        doc.text(ln, margin + 5, hy);
        hy += linePitch;
      });
    });
    y += boxH + PDF_SPACING.subsectionBefore;
    doc.setTextColor(0, 0, 0);
  };

  const renderLegacyExecSummaryLine = (line: string) => {
    const stripped = line.trim();
    const colonIdx = stripped.indexOf(":");
    const afterColon =
      colonIdx > 0 && colonIdx < 72 ? stripped.slice(colonIdx + 1).trim() : "";
    const dumpScan =
      afterColon.length > 30 && isStructuredDumpExecutiveLine(afterColon)
        ? afterColon
        : stripped;

    if (
      input.pdfRankedSignals?.length &&
      isStructuredDumpExecutiveLine(dumpScan)
    ) {
      return;
    }

    if (isStructuredDumpExecutiveLine(dumpScan)) {
      const pairs = peelTrailingNumericPairs(dumpScan, 8);
      if (pairs.length === 0) {
        const cleaned = formatNumericTokensInSignalLine(dumpScan);
        drawExecBullet(cleaned);
        return;
      }
      const bullets = executiveDumpToRankedBullets(pairs, 3);
      if (bullets.length > 0) {
        bullets.forEach((b) => drawExecBullet(b));
        return;
      }
      const rows = executiveDumpToSignalValueRows(pairs, 3);
      ensurePageSpace(rows.length * 7 + 22);
      drawDataTable(["Signal", "Value"], rows, {
        fontSize: 8,
        maxCols: 2,
        maxRows: 3,
      });
      return;
    }
    drawExecBullet(stripped);
  };

  const mutedLine = (label: string, value: string) => {
    ensurePageSpace(pdfLineHeight(PDF_TYPE.bodySmall) + 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.label);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.bodySmall);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(value, margin + 50, y);
    y += pdfLineHeight(PDF_TYPE.bodySmall) + PDF_SPACING.blockTight;
    doc.setTextColor(0, 0, 0);
  };

  /** Prefer a new page when a major section would start mid-page with little room. */
  const breakBeforeMajorSection = (reserveMm = 52) => {
    if (y > footerY - reserveMm) {
      doc.addPage();
      y = contentTop0;
    }
  };

  /** Bordered table with variable column weights; text wraps within cells. */
  const drawDataTable = (
    headers: string[],
    rows: string[][],
    options?: {
      fontSize?: number;
      maxCols?: number;
      maxRows?: number;
      /** When true, table is not split across pages (caller should start on a fresh page). */
      suppressRowPageBreaks?: boolean;
      /** BI-style striping and header for data preview / appendix tables. */
      variant?: "default" | "preview" | "appendix";
    }
  ) => {
    const variant = options?.variant ?? "default";
    const isPreviewTable = variant === "preview";
    const isPreview = isPreviewTable || variant === "appendix";
    const fontSize = options?.fontSize ?? (isPreview ? 8 : 7);
    const maxCols = options?.maxCols ?? 7;
    const maxRows = options?.maxRows ?? 14;
    const suppressBreaks = options?.suppressRowPageBreaks === true;
    const n = Math.min(headers.length, maxCols);
    if (n === 0) return;
    const heads = headers.slice(0, n).map((h) => String(h ?? "").slice(0, 80));
    const body = rows.slice(0, maxRows).map((r) =>
      Array.from({ length: n }, (_, i) => formatPdfTableCellValue(r[i]))
    );
    const pad = isPreviewTable ? 2.35 : isPreview ? 2.25 : 1.6;
    const headerFill = isPreview
      ? variant === "appendix"
        ? PDF_TABLE_THEME.headerBg
        : mixRgb(theme.panel, theme.accent, 0.22)
      : theme.panel;
    const stripeOdd: [number, number, number] = PDF_TABLE_THEME.white;
    const stripeEven: [number, number, number] = isPreview
      ? PDF_TABLE_THEME.stripe
      : theme.panel;
    const valueColRight =
      isPreview && (n === 2 || heads[n - 1]?.toLowerCase() === "value");
    const weights = heads.map((head, col) => {
      let w = Math.min(Math.max(head.length, 6), 26);
      for (const row of body) {
        const c = row[col] ?? "";
        w = Math.max(w, Math.min(c.length, 32));
      }
      return w;
    });
    const tw = weights.reduce((a, b) => a + b, 0) || 1;
    const colW = weights.map((w) => (w / tw) * contentWidth);

    if (suppressBreaks) {
      ensurePageSpace(
        measureMonolithicTableStackMm(
          doc,
          contentWidth,
          heads,
          body,
          fontSize,
          pad,
          isPreview ? 5 : 4
        ) + 2
      );
    }

    const tableTopY = y;

    if (isPreviewTable) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
      doc.setLineWidth(0.2);
    }

    const drawRow = (
      cells: string[],
      isHeader: boolean,
      fontStyle: "bold" | "normal",
      bodyRowIndex: number
    ) => {
      const cellLines = cells.map((cell, i) =>
        doc.splitTextToSize(cell, Math.max(4, colW[i] - pad * 2))
      );
      const maxLines = Math.min(
        isHeader ? 3 : 5,
        Math.max(1, ...cellLines.map((lines) => lines.length))
      );
      const linePitch =
        fontSize * 0.42 + (isPreviewTable ? 1.18 : isPreview ? 1.24 : 1.15);
      const headerPad = isPreviewTable ? 2.6 : isPreview ? 2.5 : pad;
      const bodyPad = isPreviewTable ? 2.85 : isPreview ? 2.65 : pad;
      const rowPad = isHeader && isPreviewTable ? headerPad : bodyPad;
      const rowH = maxLines * linePitch + rowPad * 2;
      if (!suppressBreaks && !isHeader) {
        const pagesBefore = doc.getNumberOfPages();
        ensurePageSpace(rowH + 1.2);
        if (doc.getNumberOfPages() > pagesBefore) {
          drawRow(heads, true, "bold", 0);
        }
      } else if (!suppressBreaks) {
        ensurePageSpace(rowH + 1.2);
      }
      doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
      doc.setLineWidth(isHeader && isPreview ? 0.28 : 0.2);
      if (isHeader) {
        doc.setFillColor(headerFill[0], headerFill[1], headerFill[2]);
        doc.rect(margin, y, contentWidth, rowH, "FD");
        if (isPreview) {
          doc.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
          doc.setLineWidth(0.45);
          doc.line(margin, y + rowH, margin + contentWidth, y + rowH);
        }
      } else if (isPreview) {
        const fill = bodyRowIndex % 2 === 0 ? stripeOdd : stripeEven;
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.rect(margin, y, contentWidth, rowH, "F");
        doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
        doc.setLineWidth(0.18);
        doc.rect(margin, y, contentWidth, rowH, "S");
      } else {
        doc.rect(margin, y, contentWidth, rowH, "S");
      }
      let cx = margin;
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
          doc.setLineWidth(0.18);
          doc.line(cx, y, cx, y + rowH);
        }
        doc.setFont("helvetica", fontStyle);
        doc.setFontSize(isHeader ? fontSize + (isPreview ? 0.55 : 0.6) : fontSize);
        const headerInk = isHeader
          ? isPreview
            ? PDF_TABLE_THEME.headerInk
            : theme.ink
          : theme.body;
        doc.setTextColor(headerInk[0], headerInk[1], headerInk[2]);
        const lines = cellLines[i].slice(0, maxLines);
        const rightAlign =
          !isHeader &&
          (valueColRight
            ? i === n - 1
            : isPreview && pdfCellLooksNumeric(cells[i] ?? ""));
        let yy =
          y +
          rowPad +
          (isHeader ? (isPreviewTable ? 2.7 : isPreview ? 3.1 : 3.3) : isPreviewTable ? 2.85 : isPreview ? 3 : 2.8);
        const textX = rightAlign ? cx + colW[i] - pad : cx + pad;
        lines.forEach((ln: string) => {
          doc.text(ln, textX, yy, { align: rightAlign ? "right" : "left" });
          yy += linePitch;
        });
        cx += colW[i];
      }
      y += rowH;
    };

    drawRow(heads, true, "bold", 0);
    body.forEach((row, ri) => {
      drawRow(row, false, "normal", ri);
    });

    if (isPreview && y > tableTopY) {
      doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
      doc.setLineWidth(isPreviewTable ? 0.32 : 0.35);
      doc.roundedRect(
        margin,
        tableTopY,
        contentWidth,
        y - tableTopY,
        isPreviewTable ? PDF_RADIUS.table : PDF_RADIUS.card,
        isPreviewTable ? PDF_RADIUS.table : PDF_RADIUS.card,
        "S"
      );
    }

    y += isPreviewTable ? PDF_SPACING.tableAfter : isPreview ? PDF_SPACING.tableAfter - 1 : 3;
    doc.setTextColor(0, 0, 0);
  };

  /** Compact KPI-style metadata grid for technical appendix. */
  const drawAppendixFactGrid = (
    items: { label: string; value: string }[],
    columns: 2 | 3 = 2
  ) => {
    if (!items.length) return;
    const cols = columns;
    const gap = PDF_SPACING.appendixGridGap;
    const colW = (contentWidth - gap * (cols - 1)) / cols;
    const cardH = 15.5;
    const rows = Math.ceil(items.length / cols);
    const blockH = rows * cardH + Math.max(0, rows - 1) * gap;
    ensurePageSpace(blockH + PDF_SPACING.subsectionBefore);

    let fx = margin;
    items.forEach((item, i) => {
      if (i > 0 && i % cols === 0) {
        fx = margin;
        y += cardH + gap;
        ensurePageSpace(cardH + gap + 4);
      }
      pdfDrawEnterprisePanel(doc, fx, y, colW, cardH, {
        fill: theme.card,
        border: theme.line,
        accent: theme.accent,
        radius: 1.4,
      });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.factLabel);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      const lbl = doc.splitTextToSize(item.label, colW - 8);
      doc.text(lbl.slice(0, 2), fx + 4, y + 4.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.factValue);
      doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
      const val = formatPdfTableCellValue(item.value, 48);
      const valLines = doc.splitTextToSize(val, colW - 8);
      doc.text(valLines.slice(0, 2), fx + 4, y + 9.5);
      fx += colW + gap;
    });
    y += cardH + PDF_SPACING.tableAfter;
    doc.setTextColor(0, 0, 0);
  };

  const drawAppendixNotePanel = (title: string, body: string) => {
    const lines = doc.splitTextToSize(body, contentWidth - 14);
    const lh = pdfLineHeight(PDF_TYPE.bodySmall);
    const boxH = PDF_SPACING.panelPad + 4 + lines.length * lh + PDF_SPACING.panelPad;
    ensurePageSpace(boxH + 4);
    pdfDrawEnterprisePanel(doc, margin, y, contentWidth, boxH, {
      fill: theme.panel,
      border: theme.line,
      accent: theme.accent,
      radius: 1.5,
    });
    pdfDrawPanelKicker(doc, margin + 4, y + PDF_SPACING.panelPad, title, theme.muted, theme.accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.bodySmall);
    doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
    let hy = y + PDF_SPACING.panelPad + 5;
    lines.forEach((ln: string) => {
      doc.text(ln, margin + 5, hy);
      hy += lh;
    });
    y += boxH + PDF_SPACING.subsectionBefore;
    doc.setTextColor(0, 0, 0);
  };

  const kindLabel = resolvePdfDatasetProfileLabel(input.dataset);
  const genStr = formatPdfGeneratedTimestamp(input.generatedAt);
  const sourceRaw = (input.dataset.fileName || "").trim() || "—";
  const sourceShort =
    sourceRaw.length > 48 ? `${sourceRaw.slice(0, 45)}…` : sourceRaw;
  const volumeLine =
    `${input.dataset.rows.toLocaleString()} records × ${input.dataset.colCount} columns` +
    (input.dataset.sheet ? ` · ${input.dataset.sheet}` : "");

  const drawExecutiveSnapshotPanel = () => {
    const snapshotKpis = input.kpiCards.slice(0, 3);
    const dominantInsight = contentPlan.suppressDominantInsight
      ? ""
      : contentPlan.snapshotTagline ||
        resolvePdfExecutiveNarrative(input);

    if (!snapshotKpis.length && dominantInsight.length < 12) {
      mutedLine("Dataset profile", kindLabel);
      mutedLine("Volume", volumeLine);
      y += 3;
      return;
    }

    const panelPad = PDF_SPACING.panelPad;
    const kpiRowH = snapshotKpis.length ? 17 : 0;
    const insightMaxW = contentWidth - 8;
    const insightLines = dominantInsight
      ? doc.splitTextToSize(dominantInsight, insightMaxW)
      : [];
    const insightLineCount = Math.min(3, insightLines.length);
    const insightBlockH = insightLineCount
      ? 5 +
        insightLineCount * pdfBodyLineHeight(PDF_TYPE.body) +
        PDF_INSIGHT_PARAGRAPH_GAP_MM
      : 0;
    const lowDataNoteH =
      input.dataset.rows > 0 && input.dataset.rows < 15 ? 10 : 0;
    const panelH =
      panelPad +
      4.5 +
      5 +
      lowDataNoteH +
      (kpiRowH ? PDF_SNAPSHOT_KPI_TOP_GAP_MM + kpiRowH + 3 : 0) +
      insightBlockH +
      panelPad;

    ensurePageSpace(panelH + 5);
    const panelTop = y;
    pdfDrawEnterprisePanel(doc, margin, y, contentWidth, panelH, {
      fill: theme.panel,
      border: theme.line,
      accent: theme.accent,
    });

    let hy = y + panelPad + 3.5;
    pdfDrawPanelKicker(doc, margin + 4, hy, "Executive snapshot", theme.muted, theme.accent);
    hy += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.bodySmall);
    doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
    const profileLine = `${kindLabel} · ${volumeLine}`;
    const profileWrap = doc.splitTextToSize(profileLine, contentWidth - 10);
    doc.text(profileWrap.slice(0, 2), margin + 4, hy);
    hy +=
      profileWrap.length * pdfLineHeight(PDF_TYPE.bodySmall) +
      (snapshotKpis.length ? PDF_SNAPSHOT_KPI_TOP_GAP_MM + 1 : 2);
    if (input.dataset.rows > 0 && input.dataset.rows < 15) {
      hy += 2;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(PDF_TYPE.caption);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      const lowNote = doc.splitTextToSize(
        PDF_EMPTY_STATES.lowData.body,
        contentWidth - 10
      );
      doc.text(lowNote.slice(0, 2), margin + 4, hy);
      hy += lowNote.length * pdfLineHeight(PDF_TYPE.caption) + 1;
      doc.setFont("helvetica", "normal");
    }

    if (snapshotKpis.length) {
      const gap = 3;
      const kw = (contentWidth - 8 - gap * (snapshotKpis.length - 1)) / snapshotKpis.length;
      snapshotKpis.forEach((card, i) => {
        const kx = margin + 4 + i * (kw + gap);
        doc.setFillColor(theme.card[0], theme.card[1], theme.card[2]);
        doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
        doc.setLineWidth(0.2);
        doc.roundedRect(kx, hy, kw, kpiRowH, 1.2, 1.2, "FD");
        doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
        doc.rect(kx, hy, 1.8, kpiRowH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(PDF_TYPE.kpiLabel);
        doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
        doc.text(
          doc.splitTextToSize(card.title, kw - 6).slice(0, 1),
          kx + 4,
          hy + 4.5
        );
        doc.setFont("helvetica", "bold");
        doc.setFontSize(PDF_TYPE.snapshotValue);
        doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
        doc.text(
          doc.splitTextToSize(String(card.value), kw - 6).slice(0, 1),
          kx + 4,
          hy + 11.5
        );
      });
      hy += kpiRowH + 4;
    }

    if (dominantInsight && insightLineCount > 0) {
      pdfDrawPanelKicker(doc, margin + 4, hy, "Dominant insight", theme.muted, theme.accent);
      hy += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_TYPE.body);
      doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
      insightLines.slice(0, insightLineCount).forEach((ln: string) => {
        doc.text(ln, margin + 4, hy);
        hy += pdfBodyLineHeight(PDF_TYPE.body);
      });
    }

    y = panelTop + panelH + PDF_SPACING.snapshotAfter;
    doc.setTextColor(0, 0, 0);

    const trendThumb = input.chartThumbnails.find((t) => t.values.length > 1);
    if (trendThumb) {
      const sparkH = 14;
      ensurePageSpace(sparkH + 4);
      drawSparkline(
        doc,
        margin + 4,
        y,
        contentWidth - 8,
        sparkH,
        trendThumb.values,
        theme.accent
      );
      y += sparkH + 4;
    }
  };

  /* -------- Cover -------- */
  const coverH = 48;
  ensurePageSpace(coverH + 28);
  pdfDrawEnterprisePanel(doc, margin, y, contentWidth, coverH, {
    fill: theme.panel,
    border: theme.line,
    accent: theme.accent,
    radius: 2,
    accentWidth: 2.8,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_TYPE.coverTitle);
  doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
  doc.text(PDF_REPORT_TITLE, margin + 6, y + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_TYPE.coverCompany);
  doc.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
  doc.text(company, margin + 6, y + 20);
  if (tagline) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(PDF_TYPE.bodySmall);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    const tl = doc.splitTextToSize(tagline, contentWidth - 10).slice(0, 2);
    doc.text(tl, margin + 6, y + 26);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_TYPE.coverMeta);
  doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
  doc.text(`Generated ${genStr}`, margin + 6, y + 34);
  doc.text(
    `Source: ${input.dataset.fileName || "—"}`,
    margin + 6,
    y + 38.5
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
  const confLine = `Dataset mapping confidence: ${input.mappingConfidence}`;
  const confWrap = doc.splitTextToSize(confLine, contentWidth - 10);
  doc.text(confWrap, margin + 6, y + 41);

  y += coverH + 8;
  doc.setTextColor(0, 0, 0);

  drawExecutiveSnapshotPanel();

  const isChartRankedExecutiveLine = (line: string) =>
    /^(Highest|Second|Third|Largest)\s*:/i.test(line.trim());

  /* -------- Executive summary -------- */
  sectionTitle("Executive summary");
  if (!input.execSummaryLines.length) {
    drawPremiumEmptyState(
      PDF_EMPTY_STATES.executiveSummary.title,
      PDF_EMPTY_STATES.executiveSummary.body
    );
  } else {
    const execLinesForLoop =
      input.pdfRankedSignals?.length && input.pdfRankedSignals.length > 0
        ? input.execSummaryLines.filter((l) => !isChartRankedExecutiveLine(l))
        : input.execSummaryLines;

    const partitioned = partitionExecSummaryLines(execLinesForLoop);

    if (partitioned.scope.length) {
      insightSubheading("Scope");
      partitioned.scope.forEach((s) => bodyText(s, PDF_TYPE.bodySmall));
    }
    if (partitioned.question) {
      if (partitioned.scope.length) execSummaryBreather();
      insightSubheading("Question in scope");
      bodyText(partitioned.question, PDF_TYPE.body);
    }
    const takeawayBody =
      partitioned.takeaway && !isStructuredDumpExecutiveLine(partitioned.takeaway)
        ? partitioned.takeaway
        : contentPlan.snapshotTagline || "";
    if (takeawayBody) {
      if (partitioned.scope.length || partitioned.question) execSummaryBreather();
      drawMainTakeawayCallout(takeawayBody);
    }
    if (partitioned.metrics.length) {
      if (
        partitioned.scope.length ||
        partitioned.question ||
        takeawayBody
      ) {
        execSummaryBreather();
      }
      insightSubheading("Key metrics");
      partitioned.metrics.forEach((m) => drawExecBullet(m));
      y += PDF_SPACING.subsectionBefore;
    }
    if (partitioned.evidence.length) {
      execSummaryBreather();
      drawEvidenceNoteBox(partitioned.evidence);
    }
    if (partitioned.other.length) {
      execSummaryBreather();
      insightSubheading("Supporting signals");
      partitioned.other.forEach((line) => renderLegacyExecSummaryLine(line));
    }

    if (contentPlan.execSummaryChartHighlights) {
      execSummaryBreather();
      insightSubheading("Chart highlights");
      drawExecBullet(contentPlan.execSummaryChartHighlights);
      y += PDF_SPACING.subsectionBefore;
    }

    execSummaryBreather();
    insightSubheading("Confidence", 10);
    drawConfidenceChip(
      doc,
      margin,
      y + 2,
      "Field mapping",
      input.mappingConfidence
    );
    y += 7;

    doc.setTextColor(0, 0, 0);
  }
  y += PDF_SPACING.sectionBefore;

  if (input.includes.includeKPIs && y > contentTop0 + 118) {
    doc.addPage();
    y = contentTop0;
  }

  const measureKpiRowHeightMm = (
    pair: Array<
      { title: string; value: string; subtitle?: string | null } | undefined
    >,
    colW: number
  ) => {
    let titleExtra = 0;
    let hasSubtitle = false;
    for (const card of pair) {
      if (!card) continue;
      const titleLines = doc.splitTextToSize(card.title, colW - 12);
      titleExtra = Math.max(titleExtra, Math.max(0, titleLines.length - 1));
      if (card.subtitle?.trim()) hasSubtitle = true;
    }
    return (
      PDF_SPACING.kpiMinHeight +
      titleExtra * pdfLineHeight(PDF_TYPE.kpiLabel) +
      (hasSubtitle ? 4 : 0)
    );
  };

  const drawKpiCard = (
    x: number,
    yPos: number,
    w: number,
    h: number,
    card: { title: string; value: string; subtitle?: string | null }
  ) => {
    doc.setFillColor(theme.card[0], theme.card[1], theme.card[2]);
    doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
    doc.setLineWidth(0.22);
    doc.roundedRect(x, yPos, w, h, PDF_RADIUS.card, PDF_RADIUS.card, "FD");
    doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    doc.rect(x, yPos, 2.6, h, "F");
    const innerX = x + PDF_SPACING.kpiPadSide;
    const innerW = w - PDF_SPACING.kpiPadSide * 2 - 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.kpiLabel);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    const titleLines = doc.splitTextToSize(card.title, innerW);
    const titleUsed = Math.min(2, titleLines.length);
    doc.text(titleLines.slice(0, 2), innerX, yPos + PDF_SPACING.kpiPadTop);
    const valueY =
      yPos +
      PDF_SPACING.kpiPadTop +
      titleUsed * pdfLineHeight(PDF_TYPE.kpiLabel) +
      1.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.kpiValue);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    const valLines = doc.splitTextToSize(String(card.value), innerW);
    doc.text(valLines.slice(0, 2), innerX, valueY);
    if (card.subtitle?.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_TYPE.kpiSubtitle);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      const sub = doc.splitTextToSize(String(card.subtitle), innerW);
      doc.text(sub.slice(0, 1), innerX, yPos + h - PDF_SPACING.kpiPadBottom);
    }
  };

  /* -------- KPIs -------- */
  if (input.includes.includeKPIs) {
    sectionTitle(input.kpiSectionTitle);
    const cards = input.kpiCards;
    if (!cards.length) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.kpi.title,
        PDF_EMPTY_STATES.kpi.body
      );
    } else {
      const gap = PDF_SPACING.cardGap;
      const colW = (contentWidth - gap) / 2;
      const rows = Math.ceil(cards.length / 2);
      for (let r = 0; r < rows; r++) {
        const pair = [cards[r * 2], cards[r * 2 + 1]];
        const rowH = measureKpiRowHeightMm(pair, colW);
        ensurePageSpace(rowH + gap + PDF_SPACING.pageSafe);
        for (let c = 0; c < 2; c++) {
          const card = pair[c];
          const x = margin + c * (colW + gap);
          if (!card) continue;
          drawKpiCard(x, y, colW, rowH, card);
        }
        y += rowH + gap;
      }
      y += PDF_SPACING.sectionTail;
    }
  }

  /* -------- AI insight -------- */
  if (input.includes.includeAIInsight) {
    sectionTitle("AI insight");
    {
      const q =
        input.question.trim() || "No question was recorded for this export.";
      const qFont = PDF_TYPE.question;
      const ql = doc.splitTextToSize(q, contentWidth);
      const lineH = pdfLineHeight(qFont);
      const labelH = pdfLineHeight(PDF_TYPE.label) + PDF_SPACING.blockTight;
      const questionBlockH = labelH + ql.length * lineH + PDF_SPACING.subsectionBefore;
      ensurePageSpace(questionBlockH);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.label);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    doc.text("Business question", margin, y);
    y += pdfLineHeight(PDF_TYPE.label);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.question);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    {
      const q =
        input.question.trim() || "No question was recorded for this export.";
      const ql = doc.splitTextToSize(q, contentWidth);
      const lineH = pdfLineHeight(PDF_TYPE.question);
      doc.text(ql, margin, y);
      y += ql.length * lineH + PDF_SPACING.subsectionBefore;
    }

    if (
      !contentPlan.suppressHighlightedSignals &&
      contentPlan.highlightedSignals.length > 0
    ) {
      const bulletLines = contentPlan.highlightedSignals;
      const linePitch = PDF_SPACING.insightLineGap;
      let contentH = 0;
      bulletLines.forEach((bl) => {
        const wrapped = doc.splitTextToSize(`• ${bl}`, contentWidth - 16);
        contentH += wrapped.length * linePitch;
      });
      if (contentH < linePitch) contentH = linePitch;
      const boxH = contentH + PDF_SPACING.panelPad * 2 + 2;
      ensurePageSpace(boxH + 6);
      doc.setFillColor(
        PDF_ENTERPRISE_COLORS.highlightWash[0],
        PDF_ENTERPRISE_COLORS.highlightWash[1],
        PDF_ENTERPRISE_COLORS.highlightWash[2]
      );
      doc.setDrawColor(
        PDF_ENTERPRISE_COLORS.highlightBorder[0],
        PDF_ENTERPRISE_COLORS.highlightBorder[1],
        PDF_ENTERPRISE_COLORS.highlightBorder[2]
      );
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, contentWidth, boxH, 1.4, 1.4, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.caption);
      doc.setTextColor(
        PDF_ENTERPRISE_COLORS.highlightInk[0],
        PDF_ENTERPRISE_COLORS.highlightInk[1],
        PDF_ENTERPRISE_COLORS.highlightInk[2]
      );
      doc.text("Highlighted signals", margin + 5, y + PDF_SPACING.panelPad);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_TYPE.bodySmall);
      let hy = y + PDF_SPACING.panelPad + 5;
      bulletLines.forEach((bl, bi) => {
        if (bi > 0) hy += PDF_SPACING.bulletGap;
        const wrapped = doc.splitTextToSize(`• ${bl}`, contentWidth - 16);
        wrapped.forEach((ln: string) => {
          doc.text(ln, margin + 5, hy);
          hy += linePitch;
        });
      });
      y += boxH + PDF_INSIGHT_PARAGRAPH_GAP_MM;
    }

    if (input.insightConfidenceLevel) {
      const lvl = String(input.insightConfidenceLevel).toLowerCase();
      const mapped: Confidence =
        lvl === "high" ? "High" : lvl === "medium" ? "Medium" : "Low";
      drawConfidenceChip(doc, margin, y + 2, "Insight confidence", mapped);
      y += pdfLineHeight(PDF_TYPE.caption);
    }

    if (contentPlan.confidenceRationale) {
      ensurePageSpace(14);
      insightSubheading(
        `Why confidence is ${String(input.insightConfidenceLevel || "rated").trim()}`,
        12
      );
      bodyText(contentPlan.confidenceRationale, PDF_TYPE.bodySmall);
    }

    if (contentPlan.chartIntelBlocks) {
      const intel = contentPlan.chartIntelBlocks;
      ensurePageSpace(20);
      insightSubheading("Chart view", 12);
      bodyText(`Why this chart: ${intel.whySelected}`, PDF_TYPE.bodySmall);
      bodyText(`Recommended read: ${intel.interpretation}`, PDF_TYPE.bodySmall);
      bodyText(`Chart fit: ${intel.suitability}`, PDF_TYPE.bodySmall);
    }

    y += PDF_SPACING.subsectionBefore;
    const hierarchy = contentPlan.hierarchy;
    const hasHierarchy = Boolean(
      hierarchy.executiveSummary?.trim() ||
        hierarchy.businessInterpretation?.trim() ||
        hierarchy.strategicRecommendation?.trim()
    );

    if (hasHierarchy) {
      if (hierarchy.executiveSummary?.trim()) {
        ensureAiBlockFits(
          hierarchyLabels.summary,
          9.5,
          hierarchy.executiveSummary.trim(),
          9.5
        );
        insightSubheading(hierarchyLabels.summary, 18);
        bodyBullets([hierarchy.executiveSummary.trim()], PDF_TYPE.bodySmall);
      }
      if (hierarchy.businessInterpretation?.trim()) {
        ensureAiBlockFits(
          hierarchyLabels.interpretation,
          9.5,
          hierarchy.businessInterpretation.trim(),
          9.5
        );
        y += PDF_SPACING.bulletGap;
        insightSubheading(hierarchyLabels.interpretation);
        bodyBullets([hierarchy.businessInterpretation.trim()], 9.5);
        y += PDF_SPACING.subsectionBefore;
      }
      if (hierarchy.strategicRecommendation?.trim()) {
        ensureAiBlockFits(
          hierarchyLabels.recommendation,
          9.5,
          hierarchy.strategicRecommendation.trim(),
          9.5
        );
        y += PDF_SPACING.bulletGap;
        insightSubheading(hierarchyLabels.recommendation);
        bodyBullets([hierarchy.strategicRecommendation.trim()], 9.5);
        y += PDF_SPACING.subsectionBefore;
      }
    } else if (input.answer.trim()) {
      ensureAiBlockFits("Analysis", 9.5, input.answer.trim(), 9.5);
      insightSubheading("Analysis");
      bodyBullets([input.answer.trim()], 9.5);
    } else {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.aiInsight.title,
        PDF_EMPTY_STATES.aiInsight.body
      );
    }
    y += PDF_SPACING.subsectionAfter;
  }

  /* -------- AI conversation thread -------- */
  if (input.includes.includeConversationContext) {
    breakBeforeMajorSection(56);
    sectionTitle("AI conversation thread");
    const ap = input.conversationAppendix;
    const hasThread = ap && ap.questionThread.length > 0;
    const hasFilters = ap && ap.inheritedFilters.length > 0;
    const hasDrill = ap && ap.activeDrillPath.length > 0;
    const hasAssumption = ap?.inheritedAssumptionNote?.trim();
    if (!hasThread && !hasFilters && !hasDrill && !hasAssumption) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.conversationThread.title,
        "Conversation thread: No prior conversation entries captured."
      );
    } else {
      if (hasThread && ap) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
        ensurePageSpace(5);
        doc.text(
          ap.questionThread.length > 1
            ? "Follow-up chain (summary)"
            : "Question in focus",
          margin,
          y
        );
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        ap.questionThread.forEach((q, i) => {
          const line = `${i + 1}. ${q}`;
          const wrapped = doc.splitTextToSize(line, contentWidth);
          const lh = 4.5;
          ensurePageSpace(wrapped.length * lh + 1.5);
          doc.text(wrapped, margin, y);
          y += wrapped.length * lh + 0.5;
        });
        y += 2;
        doc.setTextColor(0, 0, 0);
      }

      if (hasFilters && ap) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
        ensurePageSpace(5);
        doc.text("Inherited filters (analysis cohort)", margin, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        ap.inheritedFilters.forEach((f) => {
          const wrapped = doc.splitTextToSize(`• ${f}`, contentWidth);
          const lh = 4.3;
          ensurePageSpace(wrapped.length * lh + 1);
          doc.text(wrapped, margin, y);
          y += wrapped.length * lh;
        });
        y += 2;
        doc.setTextColor(0, 0, 0);
      }

      if (hasDrill && ap) {
        mutedLine(
          "Drill path",
          ap.activeDrillPath.join(" → ")
        );
        y += 2;
      }

      if (hasAssumption && ap?.inheritedAssumptionNote?.trim()) {
        const note = ap.inheritedAssumptionNote.trim();
        const wrap = doc.splitTextToSize(note, contentWidth - 8);
        const boxH = wrap.length * 4.5 + 10;
        ensurePageSpace(boxH);
        doc.setFillColor(254, 252, 232);
        doc.setDrawColor(250, 204, 21);
        doc.setLineWidth(0.35);
        doc.roundedRect(margin, y, contentWidth, boxH, 1.2, 1.2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(120, 53, 15);
        doc.text("Confidence — inherited assumptions", margin + 3, y + 4.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        let hy = y + 9;
        wrap.forEach((line: string) => {
          doc.text(line, margin + 3, hy);
          hy += 4.5;
        });
        y += boxH + 4;
        doc.setTextColor(0, 0, 0);
      }
      y += 2;
    }
  }

  /* -------- Chart -------- */
  if (input.includes.includeChart && input.chart) {
    breakBeforeMajorSection(56);
    const ch = input.chart;
    sectionTitle("Visualization");
    const pdfChartHeading =
      ch.title.trim() ||
      (ch.presentationKind === "line" || ch.presentationKind === "area"
        ? "Trend view"
        : ch.presentationKind === "pie" || ch.presentationKind === "donut"
          ? "Mix / share"
          : ch.presentationKind === "scatter"
            ? "Relationship view"
            : ch.presentationKind === "bar_horizontal"
              ? "Ranking view"
              : "Category comparison");

    const drawChartPresentationHeader = () => {
      const subtitle = ch.subtitle.trim();
      const metadataChips = normalizePdfChartMetadataChips(ch.metadataChips, {
        dimensionFallback: input.chartAxisLabels?.category?.trim() || null,
      });
      const attr =
        ch.data.length === 0 && ch.chartAttribution?.trim()
          ? ch.chartAttribution.trim()
          : "";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.chartTitle);
      const titleLines = doc.splitTextToSize(pdfChartHeading, contentWidth - 12);
      let subLines: string[] = [];
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(PDF_TYPE.caption);
        subLines = doc.splitTextToSize(subtitle, contentWidth - 12);
      } else if (attr) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(PDF_TYPE.caption);
        subLines = doc.splitTextToSize(attr, contentWidth - 12);
      }
      const lhT = pdfLineHeight(PDF_TYPE.chartTitle);
      const lhS = subLines.length ? pdfLineHeight(PDF_TYPE.caption) : 0;
      const chipGap = 2;
      const chipH = 5.8;
      const chipRowGap = 1.8;
      const chipPadX = 2.4;
      const chipMaxW = contentWidth - 12;
      const chipRows: { chip: ChartPresentationMetadataChip; text: string; w: number }[][] = [];
      if (metadataChips.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        let row: { chip: ChartPresentationMetadataChip; text: string; w: number }[] = [];
        let rowW = 0;
        for (const chip of metadataChips) {
          const text = pdfChartMetadataChipText(chip);
          const w = Math.min(
            chipMaxW,
            doc.getTextWidth(text) + chipPadX * 2
          );
          if (row.length && rowW + chipGap + w > chipMaxW) {
            chipRows.push(row);
            row = [];
            rowW = 0;
          }
          row.push({ chip, text, w });
          rowW += (rowW ? chipGap : 0) + w;
        }
        if (row.length) chipRows.push(row);
      }
      const chipsH = chipRows.length
        ? chipRows.length * chipH + Math.max(0, chipRows.length - 1) * chipRowGap
        : 0;
      const boxH =
        PDF_SPACING.panelPad +
        titleLines.length * lhT +
        (subLines.length ? 2 + subLines.length * lhS : 0) +
        (chipsH ? 3 + chipsH : 0) +
        PDF_SPACING.panelPad;
      ensurePageSpace(boxH + PDF_SPACING.chartHeaderAfter);
      pdfDrawEnterprisePanel(doc, margin, y, contentWidth, boxH, {
        fill: theme.panel,
        border: theme.line,
        accent: theme.accent,
        radius: 1.6,
      });
      let cy = y + PDF_SPACING.panelPad;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.chartTitle);
      doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
      titleLines.forEach((ln: string) => {
        doc.text(ln, margin + 5, cy);
        cy += lhT;
      });
      if (subLines.length) {
        cy += 1;
        doc.setFont("helvetica", attr ? "italic" : "normal");
        doc.setFontSize(PDF_TYPE.caption);
        doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
        subLines.slice(0, 3).forEach((ln: string) => {
          doc.text(ln, margin + 5, cy);
          cy += lhS;
        });
      }
      if (chipRows.length) {
        cy += 3;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        chipRows.forEach((row) => {
          let cx = margin + 5;
          row.forEach(({ chip, text, w }) => {
            const fill =
              chip.kind === "lead"
                ? ([239, 246, 255] as const)
                : ([255, 255, 255] as const);
            const border =
              chip.kind === "lead"
                ? ([147, 197, 253] as const)
                : ([226, 232, 240] as const);
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.setDrawColor(border[0], border[1], border[2]);
            doc.setLineWidth(0.18);
            doc.roundedRect(cx, cy - 3.6, w, chipH, 1.6, 1.6, "FD");
            doc.setTextColor(
              theme.body[0],
              theme.body[1],
              theme.body[2]
            );
            const clipped =
              doc.getTextWidth(text) > w - chipPadX * 2
                ? `${text.slice(0, 38).trim()}…`
                : text;
            doc.text(clipped, cx + chipPadX, cy);
            cx += w + chipGap;
          });
          cy += chipH + chipRowGap;
        });
      }
      y += boxH + PDF_SPACING.chartHeaderAfter;
      doc.setTextColor(0, 0, 0);
    };

    drawChartPresentationHeader();

    const execBrief = contentPlan.vizBrief?.trim() ?? "";
    const execBriefNumbered = isNumberedExecutiveBrief(execBrief);
    const factSlice = contentPlan.vizFacts.slice(0, 6);
    const hasExecFacts = factSlice.length > 0;
    const hasLensPanel = contentPlan.useLensExecutivePanel;
    const vizInsightsFollow = Boolean(
      execBrief || hasExecFacts || hasLensPanel
    );

    const estimateVizInsightsBlockMm = () => {
      if (!execBrief && !hasExecFacts && !hasLensPanel) return 0;
      let h = 6;
      if (hasLensPanel) {
        h +=
          contentPlan.lensSections.length *
          (PDF_SPACING.insightLineGap * 2 + 8);
      }
      if (execBrief) {
        const wrap = doc.splitTextToSize(execBrief, contentWidth - 10);
        const lineCap = execBriefNumbered
          ? Math.min(8, wrap.length)
          : Math.min(2, wrap.length);
        h += lineCap * PDF_SPACING.insightLineGap + 3;
      }
      if (hasExecFacts) {
        const gridRows = Math.ceil(factSlice.length / 3);
        h += 5 + gridRows * 17;
      }
      return h + 2;
    };

    const drawMutedMetaLine = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.label);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_TYPE.bodySmall);
      doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
      doc.text(value, margin + 50, y);
      y += pdfLineHeight(PDF_TYPE.bodySmall) + PDF_SPACING.blockTight;
      doc.setTextColor(0, 0, 0);
    };

    if (ch.data.length > 0) {
      const metaRows: string[][] = [];
      metaRows.push([
        "Analysis Type",
        pdfChartKindExecutiveLabel(ch.presentationKind),
      ]);
      const mShow =
        ch.alignedMetricDisplay?.trim() || ch.alignedMetric?.trim();
      if (mShow) {
        metaRows.push(["Primary Metric", polishPdfExecutiveLabel(mShow)]);
      }
      const groupedBy = input.chartAxisLabels?.category?.trim();
      if (groupedBy) {
        metaRows.push(["Grouped By", polishPdfExecutiveLabel(groupedBy)]);
      }
      const recordsEval =
        input.provenance?.rowsAnalyzed ?? input.dataset.rows;
      metaRows.push([
        "Records Evaluated",
        Number(recordsEval).toLocaleString(),
      ]);
      const attr = ch.chartAttribution?.trim().toLowerCase() ?? "";
      if (attr.includes("auto") && attr.includes("dashboard")) {
        metaRows.push(["Source", "Automated dashboard"]);
      }
      const insightsReserve = estimateVizInsightsBlockMm();
      if (
        shouldStartPdfVizCoreOnFreshPage({
          y,
          footerY,
          metaRowCount: metaRows.length,
          insightsReserveMm: insightsReserve,
        })
      ) {
        doc.addPage();
        y = contentTop0;
      }
      const metaBlockH = estimatePdfVizAnalysisContextHeight(metaRows.length);
      ensurePageSpace(metaBlockH);
      pdfDrawPanelKicker(doc, margin, y, "Analysis context", theme.muted, theme.accent);
      y += 5.5;
      metaRows.forEach(([label, value]) => {
        drawMutedMetaLine(label, value);
      });
      y += PDF_SPACING.blockTight;
    }

    const embedCenteredChartImage = async (
      candidate: Exclude<PdfChartImageCandidate, { source: "empty" }>
    ) => {
      let insightsReserve = estimateVizInsightsBlockMm();
      let availableMm = footerY - y - insightsReserve - 5;
      const pdfEmbed =
        candidate.source === "artifact"
          ? ch.chartArtifact?.presentationProfile?.pdfEmbed
          : null;
      let maxImgH = Math.min(
        pdfEmbed?.maxHeightMm ?? PDF_VIZ_EMBED_DEFAULT_MAX_HEIGHT_MM,
        Math.max(
          PDF_VIZ_EMBED_MIN_HEIGHT_MM,
          availableMm > 48 ? availableMm : Math.max(72, footerY - y - 12)
        )
      );
      if (
        shouldStartPdfChartOnFreshPage(ch.presentationKind, availableMm) ||
        availableMm < pdfVizChartCohesionMinHeightMm()
      ) {
        doc.addPage();
        y = contentTop0;
        insightsReserve = estimateVizInsightsBlockMm();
        availableMm = footerY - y - insightsReserve - 5;
        maxImgH = Math.min(
          pdfEmbed?.maxHeightMm ?? PDF_VIZ_EMBED_DEFAULT_MAX_HEIGHT_MM,
          Math.max(
            PDF_VIZ_EMBED_MIN_HEIGHT_MM,
            availableMm > 48 ? availableMm : Math.max(72, footerY - y - 12)
          )
        );
      }
      ensurePageSpace(maxImgH + 6);
      const placeImage = (dataUrl: string, pxW: number, pxH: number) => {
        const sized = computePdfChartEmbedDimensions(
          pxW,
          pxH,
          contentWidth,
          maxImgH,
          pdfEmbed?.minWidthRatio ?? PDF_VIZ_EMBED_DEFAULT_MIN_WIDTH_RATIO,
          {
            minAspectRatio: pdfEmbed?.minAspectRatio,
            maxAspectRatio: pdfEmbed?.maxAspectRatio,
          }
        );
        const imgWidth = sized.widthMm;
        const imgHeight = sized.heightMm;
        const imgX = margin + Math.max(0, (contentWidth - imgWidth) / 2);
        const framePad = PDF_SPACING.chartFramePad;
        ensurePageSpace(imgHeight + framePad * 2 + PDF_SPACING.chartAfter);
        doc.setFillColor(theme.panel[0], theme.panel[1], theme.panel[2]);
        doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
        doc.setLineWidth(0.22);
        doc.roundedRect(
          imgX - framePad - 0.5,
          y - framePad - 0.5,
          imgWidth + framePad * 2 + 1,
          imgHeight + framePad * 2 + 1,
          PDF_RADIUS.card,
          PDF_RADIUS.card,
          "FD"
        );
        doc.setFillColor(theme.card[0], theme.card[1], theme.card[2]);
        doc.roundedRect(
          imgX - 0.25,
          y - 0.25,
          imgWidth + 0.5,
          imgHeight + 0.5,
          PDF_RADIUS.tableCell,
          PDF_RADIUS.tableCell,
          "F"
        );
        doc.addImage(dataUrl, "PNG", imgX, y, imgWidth, imgHeight);
        y +=
          imgHeight +
          framePad +
          (vizInsightsFollow
            ? PDF_SPACING.chartAfterWithInsights
            : PDF_SPACING.chartAfter);
        if (!vizInsightsFollow) {
          pdfDrawSoftRule(doc, margin, y, pageWidth - margin, theme.lineSoft, 0.18);
          y += PDF_SPACING.chartRuleAfter;
        }
      };
      if (candidate.source === "artifact") {
        placeImage(candidate.dataUrl, candidate.width, candidate.height);
        return;
      }
      const png = await captureChartPlotToPng(
        candidate.captureEl,
        PDF_CHART_CAPTURE_SCALE
      );
      placeImage(png.dataUrl, png.width, png.height);
    };

    if (ch.data.length === 0) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.chart.title,
        PDF_EMPTY_STATES.chart.body
      );
    } else {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
      const imageCandidate = resolvePdfChartImageCandidate({
        artifact: ch.chartArtifact,
        captureEl: ch.captureEl,
      });
      if (imageCandidate.source === "empty") {
        drawPremiumEmptyState(
          PDF_EMPTY_STATES.chartCapture.title,
          PDF_EMPTY_STATES.chartCapture.body
        );
      } else {
        try {
          await embedCenteredChartImage(imageCandidate);
        } catch (fallbackErr) {
          console.warn("Chart image embed failed:", fallbackErr);
          if (imageCandidate.source === "artifact" && ch.captureEl) {
            try {
              await embedCenteredChartImage({
                source: "legacy",
                captureEl: ch.captureEl,
              });
            } catch (legacyErr) {
              console.warn("Legacy chart image embed failed:", legacyErr);
              drawPremiumEmptyState(
                PDF_EMPTY_STATES.chartEmbedFailed.title,
                PDF_EMPTY_STATES.chartEmbedFailed.body
              );
            }
          } else {
            drawPremiumEmptyState(
              PDF_EMPTY_STATES.chartEmbedFailed.title,
              PDF_EMPTY_STATES.chartEmbedFailed.body
            );
          }
        }
      }
    }

    if (execBrief || hasExecFacts || hasLensPanel) {
      const factCols = 3;
      const factGap = PDF_SPACING.appendixGridGap;
      const factCardH = 15.5;
      const gridRows = hasExecFacts ? Math.ceil(factSlice.length / factCols) : 0;
      const briefWrap = execBrief
        ? doc.splitTextToSize(execBrief, contentWidth - 10)
        : [];
      const briefLines = execBriefNumbered
        ? Math.min(8, briefWrap.length)
        : Math.min(2, briefWrap.length);
      const lensBlockH = hasLensPanel
        ? contentPlan.lensSections.reduce((acc, section) => {
            const bodyWrap = doc.splitTextToSize(section.body, contentWidth - 12);
            return acc + bodyWrap.length * PDF_SPACING.insightLineGap + 9;
          }, 0)
        : 0;
      const factBlockH = hasExecFacts
        ? PDF_SPACING.panelPad +
          gridRows * factCardH +
          Math.max(0, gridRows - 1) * factGap
        : 0;
      const briefBlockH = briefLines
        ? briefLines * PDF_SPACING.insightLineGap + PDF_SPACING.panelPad
        : 0;
      const panelH =
        PDF_SPACING.panelPad +
        4 +
        lensBlockH +
        (lensBlockH && briefBlockH ? 3 : 0) +
        briefBlockH +
        (briefBlockH && factBlockH ? 3 : 0) +
        factBlockH +
        PDF_SPACING.panelPad;
      ensurePageSpace(panelH + PDF_SPACING.pageSafe);
      const panelTop = y;
      pdfDrawEnterprisePanel(doc, margin, y, contentWidth, panelH, {
        fill: theme.panel,
        border: theme.line,
        accent: theme.accent,
      });
      let py = y + 3.5;
      const panelTitle =
        contentPlan.lens === "risk"
          ? "Risk lens"
          : contentPlan.lens === "opportunity"
            ? "Opportunity lens"
            : contentPlan.lens === "strategy"
              ? "Strategy lens"
              : "Executive insights";
      pdfDrawPanelKicker(
        doc,
        margin + 3,
        py,
        panelTitle,
        theme.muted,
        theme.accent
      );
      py += 4.5;
      if (hasLensPanel) {
        contentPlan.lensSections.forEach((section) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(PDF_TYPE.caption);
          doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
          doc.text(section.heading, margin + 5, py);
          py += 4;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(PDF_TYPE.bodySmall);
          doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
          const bodyWrap = doc.splitTextToSize(section.body, contentWidth - 12);
          bodyWrap.forEach((ln: string) => {
            doc.text(ln, margin + 5, py);
            py += PDF_SPACING.insightLineGap;
          });
          py += 2;
        });
        if (execBrief || hasExecFacts) py += 2;
      }
      if (execBrief && briefWrap.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(PDF_TYPE.body);
        doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
        briefWrap.slice(0, briefLines).forEach((ln: string) => {
          doc.text(ln, margin + 5, py);
          py += PDF_SPACING.insightLineGap;
        });
        py += hasExecFacts ? 3 : PDF_SPACING.blockTight;
      }
      if (hasExecFacts) {
        const fw = (contentWidth - 6 - factGap * (factCols - 1)) / factCols;
        let fx = margin + 3;
        factSlice.forEach((fact, i) => {
          if (i > 0 && i % factCols === 0) {
            fx = margin + 3;
            py += factCardH + factGap;
          }
          doc.setFillColor(theme.card[0], theme.card[1], theme.card[2]);
          doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
          doc.setLineWidth(0.18);
          doc.roundedRect(fx, py, fw, factCardH, PDF_RADIUS.tableCell, PDF_RADIUS.tableCell, "FD");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(PDF_TYPE.factLabel);
          doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
          doc.text(
            doc.splitTextToSize(fact.title, fw - 5).slice(0, 1),
            fx + 2.5,
            py + 3.8
          );
          doc.setFont("helvetica", "bold");
          doc.setFontSize(PDF_TYPE.factValue);
          doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
          doc.text(
            doc
              .splitTextToSize(
                formatNumericTokensInSignalLine(String(fact.value)),
                fw - 5
              )
              .slice(0, 1),
            fx + 2.5,
            py + 9.5
          );
          fx += fw + factGap;
        });
        py += factCardH;
      }
      y = panelTop + panelH + PDF_SPACING.blockTight;
      doc.setTextColor(0, 0, 0);
    }

    doc.setTextColor(0, 0, 0);
  }

  drawDataPreviewSection();

  /* -------- Data quality -------- */
  if (input.includes.includeDataQuality) {
    breakBeforeMajorSection(92);
    sectionTitle("Data quality");
    const nullCounts = input.profile?.null_counts || {};
    const totalMissing = Object.values(nullCounts).reduce(
      (a, n) => a + (typeof n === "number" ? n : 0),
      0
    );
    const totalCells =
      input.dataset.rows > 0 && input.dataset.colCount > 0
        ? input.dataset.rows * input.dataset.colCount
        : 0;
    const pctMissing =
      totalCells > 0
        ? ((totalMissing / totalCells) * 100).toFixed(1)
        : null;

    if (!input.profile) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.dataQuality.title,
        "Data quality: No quality profile available."
      );
    } else {
      const { duplicates, note } = input.previewDuplicates();
      const summaryRows: string[][] = [
        ["Total rows", input.dataset.rows.toLocaleString()],
        ["Total columns", String(input.dataset.colCount)],
        ["Missing cells (all columns)", totalMissing.toLocaleString()],
      ];
      if (pctMissing !== null) {
        summaryRows.push(["Estimated missing rate", `${pctMissing}% of cells`]);
      }
      summaryRows.push(["Duplicate-like rows (sample)", String(duplicates)]);
      drawDataTable(["Metric", "Value"], summaryRows, {
        fontSize: 8.5,
        maxCols: 2,
        maxRows: 8,
      });

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      const noteWrapped = doc.splitTextToSize(note, contentWidth);
      ensurePageSpace(noteWrapped.length * 3.9);
      doc.text(noteWrapped, margin, y);
      y += noteWrapped.length * 3.9 + 4;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      const rowsForPct = Math.max(1, input.dataset.rows);
      const missingByCol = Object.entries(nullCounts)
        .filter(([, n]) => typeof n === "number" && n > 0)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 14);
      if (missingByCol.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
        ensurePageSpace(6);
        doc.text("Columns with missing values", margin, y);
        y += 6;
        drawDataTable(
          ["Column", "Missing cells", "% of rows"],
          missingByCol.map(([col, n]) => {
            const miss = n as number;
            return [
              col,
              miss.toLocaleString(),
              `${((miss / rowsForPct) * 100).toFixed(1)}%`,
            ];
          }),
          { fontSize: 7.5, maxCols: 3, maxRows: 14 }
        );
      }

      const issues: string[] = [];
      if (pctMissing !== null && parseFloat(pctMissing) > 8) {
        issues.push(
          `Missing values exceed typical tolerance (~${pctMissing}% of cells). Consider cleaning source data or mapping key columns explicitly.`
        );
      }
      if (input.dataset.colCount === 0) {
        issues.push("No loaded columns detected in the client preview.");
      }
      if (!issues.length) {
        issues.push("No additional quality notes.");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
      doc.text("Quality notes", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      issues.slice(0, 4).forEach((issue) => {
        const w = doc.splitTextToSize(`• ${issue}`, contentWidth);
        const lh = 4;
        ensurePageSpace(w.length * lh);
        doc.text(w, margin, y);
        y += w.length * lh + 1;
      });
    }
    y += 6;
  }

  /* -------- Technical appendix (optional) -------- */
  if (input.includes.includeTechnicalAppendix) {
    const chAp = input.chart;
    const thumbsAp = input.chartThumbnails.filter((t) => t.values.length > 1);
    const provNotesAp = input.provenance?.notes?.trim();
    const hasSeries = Boolean(chAp?.data.length);
    const hasChartMeta =
      Boolean(chAp) &&
      (hasSeries ||
        Boolean(chAp?.chartAttribution?.trim()) ||
        Boolean(chAp?.alignedMetric) ||
        Boolean(chAp?.aggregation));
    const appendixHasContent =
      hasChartMeta ||
      thumbsAp.length > 0 ||
      Boolean(provNotesAp) ||
      Boolean(input.provenance);
    doc.addPage();
    y = contentTop0;
    sectionTitle("Technical appendix");
    bodyText(
      analystPdf
        ? "Reference metadata for audit and data-team handoff. Omit this section for executive-only distribution."
        : "Reference metadata for audit, routing, and calculation context.",
      PDF_TYPE.bodySmall
    );
    y += PDF_SPACING.subsectionBefore;
    if (!appendixHasContent) {
      drawPremiumEmptyState(
        PDF_EMPTY_STATES.appendix.title,
        "Technical appendix: No technical metadata available."
      );
    } else if (
      hasChartMeta ||
      thumbsAp.length > 0 ||
      provNotesAp ||
      Boolean(input.provenance)
    ) {

      const appendixSubheading = (title: string) => {
        y += PDF_SPACING.appendixBlock;
        doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
        doc.rect(margin, y - 2.2, 1.1, 3.6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(PDF_TYPE.appendixHeading);
        doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
        doc.text(title, margin + 2.8, y);
        pdfDrawSoftRule(doc, margin, y + 1.6, pageWidth - margin, theme.lineSoft, 0.18);
        y += PDF_SPACING.subsectionAfter;
        doc.setTextColor(0, 0, 0);
      };

      if (input.provenance || input.mappingConfidence) {
        appendixSubheading("Analysis metadata");
        const metaItems: { label: string; value: string }[] = [];
        if (input.provenance) {
          metaItems.push({
            label: "Analysis confidence",
            value: polishPdfConfidenceLevel(input.provenance.confidence),
          });
          metaItems.push({
            label: "Records evaluated",
            value: formatPdfBusinessNumber(input.provenance.rowsAnalyzed),
          });
          metaItems.push({
            label: "Visualized categories",
            value: formatPdfBusinessNumber(input.provenance.chartPoints),
          });
          if (input.provenance.aggregation) {
            metaItems.push({
              label: "Aggregation",
              value: String(input.provenance.aggregation),
            });
          }
        }
        metaItems.push({
          label: "Field mapping",
          value: polishPdfConfidenceLevel(input.mappingConfidence),
        });
        drawAppendixFactGrid(metaItems, metaItems.length >= 5 ? 3 : 2);
      }

      if (chAp?.chartAttribution?.trim()) {
        appendixSubheading("Visualization source");
        drawAppendixNotePanel(
          "Source",
          polishPdfBusinessCopy(chAp.chartAttribution!.trim())
        );
      }

      if (provNotesAp) {
        appendixSubheading("Provenance notes");
        drawAppendixNotePanel("Notes", polishPdfBusinessCopy(provNotesAp));
      }

      if (thumbsAp.length >= 1) {
        appendixSubheading("Session chart thumbnails");
        const rowH = 16;
        const headerH = 6;
        const listH = headerH + Math.min(thumbsAp.length, 8) * rowH + 2;
        ensurePageSpace(listH + PDF_SPACING.thumbRowAfter);
        y = drawPdfAppendixThumbnailList(
          doc,
          margin,
          y,
          contentWidth,
          thumbsAp,
          theme.accent,
          theme.line,
          theme.ink,
          theme.muted,
          theme.panel
        );
        y += PDF_SPACING.blockTight;
      }

      if (chAp && hasSeries) {
        const specRows: string[][] = [
          [
            "Analysis Type",
            pdfChartKindExecutiveLabel(chAp.presentationKind),
          ],
        ];
        if (chAp.alignedMetric) {
          const mShow = chAp.alignedMetricDisplay?.trim() || chAp.alignedMetric;
          specRows.push(["Primary Metric", polishPdfExecutiveLabel(mShow)]);
        }
        if (chAp.aggregation) {
          specRows.push(["Aggregation", String(chAp.aggregation)]);
        }
        specRows.push(["Series points", String(chAp.data.length)]);
        const appendixMetricCtx = pdfChartMetricFormatContext(
          chAp,
          input.question
        );
        const seriesRows = chAp.data.slice(0, 20).map((row) => {
          const v = formatPdfAppendixSeriesValue(row, appendixMetricCtx);
          if (chAp.presentationKind === "scatter") {
            const xStr =
              row.displayX?.trim() ||
              (typeof row.x === "number" && Number.isFinite(row.x)
                ? String(row.x)
                : "—");
            return [String(row.name), `x=${xStr}, y=${v}`];
          }
          return [formatPdfCategoryLabel(String(row.name)), v];
        });
        const seriesHeads =
          chAp.presentationKind === "scatter"
            ? ["Point", "Coordinates"]
            : ["Category", "Value"];
        const specItems = specRows.map(([label, value]) => ({
          label,
          value,
        }));
        const seriesTableH = measureMonolithicTableStackMm(
          doc,
          contentWidth,
          seriesHeads,
          seriesRows,
          7.5,
          2.25,
          5
        );
        const specGridRows = Math.ceil(specItems.length / 2);
        const blockH =
          specGridRows * 15.5 +
          Math.max(0, specGridRows - 1) * PDF_SPACING.appendixGridGap +
          PDF_SPACING.appendixBlock +
          seriesTableH +
          14;
        ensurePageSpace(blockH);
        appendixSubheading("Chart specification");
        drawAppendixFactGrid(specItems, specItems.length >= 4 ? 3 : 2);
        appendixSubheading("Series sample");
        drawDataTable(seriesHeads, seriesRows, {
          variant: "appendix",
          fontSize: 7.5,
          maxCols: 2,
          maxRows: 20,
          suppressRowPageBreaks: true,
        });
        if (chAp.data.length > 20) {
          bodyText(
            `Showing first 20 of ${chAp.data.length} series points.`,
            PDF_TYPE.caption
          );
        }
      }
    }
  }

  /* -------- Running header / footer every page -------- */
  const pdfFooter = resolvePdfExportFooter({
    reportCompanyName: input.branding.companyName,
    globalBranding: BRANDING,
  });
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    pdfDrawEnterpriseRunningChrome(doc, {
      pageIndex: i,
      totalPages,
      pageWidth,
      pageHeight,
      margin,
      contentWidth,
      headerBand,
      footerBand,
      company,
      reportTitle: PDF_REPORT_TITLE,
      sourceLabel: sourceShort,
      generatedByLine: pdfFooter.generatedByLine,
      supportLine: pdfFooter.supportLine,
      accent: theme.accent,
      ink: theme.ink,
      muted: theme.muted,
      line: theme.line,
      lineSoft: theme.lineSoft,
    });
  }

  doc.save(buildExportPdfFilename(BRANDING.exportFilePrefix));
}
