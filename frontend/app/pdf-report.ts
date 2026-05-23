/**
 * Executive-grade PDF export (jsPDF): typography, KPI cards, chart embed,
 * headers/footers, branding, optional technical appendix (chart spec / raw series).
 */

import { Canvg } from "canvg";
import type { ChartKind, ChartRow } from "./chart-types";
import { fallbackChartNumericDisplay } from "./chart-types";
import { pdfXAxisLineTitle, pdfYAxisLineTitle } from "@/lib/chart-semantic-metadata";

type JsPdfDocument = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

/** PDF-only insight section labels (executive report tone). */
const PDF_INSIGHT_SECTION_LABELS = {
  overview: "Executive overview",
  findings: "Key findings",
  interpretation: "Business interpretation",
  actions: "Recommended actions",
  methodology: "How this was calculated",
} as const;

const PDF_BUSINESS_COPY_REPLACEMENTS: readonly [RegExp, string][] = [
  [/The dataset contains ([\d,]+) rows/gi, "The dataset contains $1 records"],
  [/\bRows in analysis\b/gi, "Records analyzed"],
  [/\bChart series points\b/gi, "Visualized categories"],
  [/\bRows in current filtered view\b/gi, "Records in filtered view"],
  [/\bTotal Rows\b/g, "Records in dataset"],
  [/\blimited evidence in this cohort\b/gi, "directional findings in this cohort"],
  [/\bdirectional read — limited evidence\b/gi, "Directional findings"],
  [/\bEvidence is limited\b/gi, "Evidence strength: Limited"],
  [/\btreat takeaways as directional, not definitive\b/gi, "treat findings as directional, not definitive"],
  [/\bUse cautious language\b/gi, "Use measured language"],
  [/\bchart points\b/gi, "visualized categories"],
  [/\brows analyzed\b/gi, "records analyzed"],
];

/** Polish user-facing PDF copy — terminology only; no layout changes. */
export function polishPdfBusinessCopy(raw: string | null | undefined): string {
  if (raw == null) return "";
  let t = String(raw).replace(/\s+/g, " ").trim();
  for (const [re, repl] of PDF_BUSINESS_COPY_REPLACEMENTS) {
    t = t.replace(re, repl);
  }
  return t;
}

function polishPdfKpiLabel(title: string): string {
  const key = title.trim().toLowerCase();
  const exact: Record<string, string> = {
    "rows in analysis": "Records analyzed",
    "chart series points": "Visualized categories",
    "rows in current filtered view": "Records in filtered view",
    "total rows": "Records in dataset",
  };
  if (exact[key]) return exact[key];
  return polishPdfBusinessCopy(title);
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
function measureMonolithicTableStackMm(
  doc: JsPdfDocument,
  contentWidth: number,
  headsIn: string[],
  bodyIn: string[][],
  fontSize: number
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
  const pad = 1.6;
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
  return totalH + 4;
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
  accentHex: "#0f766e",
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
  chartInsightBadge?: string | null;
  /** When set, executive summary + highlighted signals use these instead of prose/badge peeling. */
  pdfRankedSignals?: PdfRankedSignal[] | null;
  vizExecutiveFacts?: { title: string; value: string; hint?: string }[];
  /** First-line AI context for the chart (mirrors AI Insights Executive panel). */
  executiveInsightsBrief?: string | null;
  provenance: PdfProvenanceSlice | null;
  chart: {
    presentationKind: ChartKind;
    data: ChartRow[];
    title: string;
    subtitle: string;
    captureEl: HTMLElement | null;
    alignedMetric?: string | null;
    alignedMetricDisplay?: string | null;
    aggregation?: string | null;
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
  const execSummaryLines = raw.execSummaryLines
    .map((l) => polishPdfBusinessCopy(sLine(l)))
    .filter((l) => l.length > 0);

  const kpiCards = raw.kpiCards.map((c) => ({
    title: polishPdfKpiLabel(sanitizeUserFacingReportText(c.title)),
    value: polishPdfBusinessCopy(sanitizeUserFacingReportText(c.value)),
    subtitle:
      c.subtitle != null
        ? polishPdfBusinessCopy(sanitizeUserFacingReportText(String(c.subtitle)))
        : c.subtitle,
  }));

  const vizExecutiveFacts = (raw.vizExecutiveFacts ?? []).map((f) => ({
    title: polishPdfKpiLabel(sanitizeUserFacingReportText(f.title)),
    value: polishPdfBusinessCopy(sanitizeUserFacingReportText(f.value)),
    hint:
      f.hint != null
        ? polishPdfBusinessCopy(sanitizeUserFacingReportText(f.hint))
        : f.hint,
  }));

  const pdfRankedSignals = (raw.pdfRankedSignals ?? [])
    .map((r) => ({
      rank: sanitizeUserFacingReportText(r.rank),
      category: sanitizeUserFacingReportText(r.category),
      valueDisplay: sanitizeUserFacingReportText(r.valueDisplay),
    }))
    .filter((r) => r.rank.length > 0 && r.category.length > 0 && r.valueDisplay.length > 0);

  const chartThumbnails = raw.chartThumbnails.map((t) => ({
    ...t,
    title: sanitizeUserFacingReportText(t.title),
    kind: sanitizeUserFacingReportText(t.kind),
  }));

  let chart = raw.chart;
  if (chart) {
    chart = {
      ...chart,
      title: sanitizeUserFacingReportText(chart.title),
      subtitle: sanitizeUserFacingReportText(chart.subtitle),
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
        .map((q) => sanitizeUserFacingReportText(q))
        .filter((q) => q.length > 0),
      inheritedFilters: conversationAppendix.inheritedFilters
        .map((f) => sanitizeUserFacingReportText(f))
        .filter((f) => f.length > 0),
      activeDrillPath: conversationAppendix.activeDrillPath
        .map((d) => sanitizeUserFacingReportText(d))
        .filter((d) => d.length > 0),
      inheritedAssumptionNote:
        conversationAppendix.inheritedAssumptionNote != null
          ? sanitizeUserFacingReportText(conversationAppendix.inheritedAssumptionNote) ||
            null
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
    const sum = polishPdfBusinessCopy(
      sanitizeUserFacingReportText(insightSections.summary)
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
    kpiSectionTitle: sanitizeUserFacingReportText(raw.kpiSectionTitle),
    execSummaryLines,
    kpiCards,
    question: polishPdfBusinessCopy(sanitizeUserFacingReportText(raw.question)),
    answer,
    insightSections,
    insightSummary: raw.insightSummary
      ? polishPdfBusinessCopy(sanitizeUserFacingReportText(raw.insightSummary))
      : raw.insightSummary,
    chartInsightBadge: raw.chartInsightBadge
      ? polishPdfBusinessCopy(sanitizeUserFacingReportText(raw.chartInsightBadge))
      : raw.chartInsightBadge,
    pdfRankedSignals: pdfRankedSignals.length ? pdfRankedSignals : undefined,
    vizExecutiveFacts,
    executiveInsightsBrief: raw.executiveInsightsBrief?.trim()
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
  const step = w / Math.max(slice.length, 1);
  doc.setFillColor(248, 250, 252);
  doc.rect(x, yTop, w, h, "F");
  doc.setDrawColor(226, 232, 240);
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

async function renderChartSvgToPng(
  container: HTMLElement,
  scale = 2
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const svg = container.querySelector("svg");
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  let width = Math.max(1, Math.round(rect.width));
  let height = Math.max(1, Math.round(rect.height));
  if (width <= 2 || height <= 2) {
    width = Math.max(container.clientWidth || 720, 1);
    height = Math.max(container.clientHeight || 320, 1);
  }

  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const svgString = new XMLSerializer().serializeToString(clone);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const v = await Canvg.fromString(ctx, svgString);
  await v.render();
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

function sanitizeFileBase(s: string): string {
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

export function datasetKindLabel(kind: string): string {
  const k = (kind || "").trim().toLowerCase();
  const map: Record<string, string> = {
    ecommerce: "E-commerce / retail",
    manufacturing: "Manufacturing / operations",
    hr: "Human resources / people analytics",
    sales: "Sales / commercial",
    finance: "Finance / accounting",
    operations: "Operations / incidents",
    marketing: "Marketing / growth",
    generic: "General business",
  };
  if (map[k]) return map[k];
  if (!k) return "General business";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** Readable numbers for executive bullets, signal callouts, and mini-tables. */
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
  return s.replace(/\b(-?[\d,]+(?:\.\d+)?)\b/g, (match) => {
    const n = Number(match.replace(/,/g, ""));
    if (!Number.isFinite(n)) return match;
    return formatPdfBusinessNumber(n);
  });
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
function highlightSignalsToBulletLines(raw: string, max: number): string[] {
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
    const one = formatNumericTokensInSignalLine(t);
    return one ? [one.slice(0, 200) + (one.length > 200 ? "…" : "")] : [];
  }
  const scored = allPairs.map(([lbl, vs]) => {
    const n = Number(String(vs).replace(/,/g, ""));
    return { cat: extractShortSignalName(lbl), n };
  }).filter((x) => Number.isFinite(x.n) && x.cat.length > 0);
  if (!scored.length) {
    return [formatNumericTokensInSignalLine(t)].slice(0, max);
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
    .map((r) => `${r.cat}: ${formatPdfBusinessNumber(r.n)}`);
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
  const raw = text.trim();
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

  if (raw.length > 160) {
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
    "Analytics workspace";
  const tagline = input.branding.tagline.trim();

  const theme = {
    ink: [15, 23, 42] as [number, number, number],
    muted: [71, 85, 105] as [number, number, number],
    body: [51, 65, 85] as [number, number, number],
    line: [226, 232, 240] as [number, number, number],
    panel: [248, 250, 252] as [number, number, number],
    highlight: [236, 253, 245] as [number, number, number],
    accent,
  };

  let y = contentTop0;

  const ensurePageSpace = (neededHeight: number) => {
    if (y + neededHeight > footerY - 3) {
      doc.addPage();
      y = contentTop0;
    }
  };

  const ruleFull = (yy: number) => {
    doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
    doc.setLineWidth(0.35);
    doc.line(margin, yy, pageWidth - margin, yy);
  };

  const sectionTitle = (title: string) => {
    ensurePageSpace(16);
    y += 4;
    doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    doc.rect(margin, y - 3.5, 1.2, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(title, margin + 3.5, y + 2.5);
    y += 9;
    ruleFull(y);
    y += 7;
    doc.setTextColor(0, 0, 0);
  };

  const pdfBodyLineHeight = (fontSize: number) => fontSize * 0.42 + 1.52;

  const bodyText = (text: string, fontSize = 10, color = theme.body) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineH = pdfBodyLineHeight(fontSize);
    ensurePageSpace(lines.length * lineH + 2.5);
    doc.text(lines, margin, y);
    y += lines.length * lineH + 2.5;
    doc.setTextColor(0, 0, 0);
  };

  const bodyParagraphs = (text: string) => {
    const raw = text.trim();
    if (!raw) {
      bodyText("(No narrative provided.)", 10);
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
      if (i > 0) y += 2;
      bodyText(p, 10);
    });
  };

  /** Height (mm) for text rendered like {@link bodyParagraphs} at a given font size. */
  const estimateInsightBodyHeightMm = (
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

  const insightSubheading = (title: string) => {
    ensurePageSpace(9);
    y += 1.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(title, margin, y);
    y += 5.5;
    doc.setTextColor(0, 0, 0);
  };

  const drawExecBullet = (text: string, fontSize = 9.5) => {
    const wrapped = doc.splitTextToSize(`• ${text}`, contentWidth - 5);
    const lh = pdfBodyLineHeight(fontSize);
    ensurePageSpace(wrapped.length * lh + 2.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
    doc.text(wrapped, margin + 2, y);
    y += wrapped.length * lh + 1.25;
    doc.setTextColor(0, 0, 0);
  };

  const bodyBullets = (items: string[], fontSize = 9.5) => {
    const bullets = items.flatMap((t) => splitProseToInsightBullets(t, 6));
    if (!bullets.length) return;
    bullets.forEach((b, i) => {
      if (i > 0) y += 0.5;
      drawExecBullet(b, fontSize);
    });
    y += 2.5;
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    doc.text("Evidence strength", margin + 3, y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let hy = y + 8.5;
    polished.forEach((note) => {
      const wrapped = doc.splitTextToSize(note, contentWidth - 12);
      wrapped.forEach((ln: string) => {
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        doc.text(ln, margin + 3, hy);
        hy += linePitch;
      });
    });
    y += boxH + 4;
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
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    ensurePageSpace(5.5);
    doc.text(label, margin, y);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(value, margin + 48, y);
    y += 4.8;
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
    }
  ) => {
    const fontSize = options?.fontSize ?? 7;
    const maxCols = options?.maxCols ?? 7;
    const maxRows = options?.maxRows ?? 14;
    const suppressBreaks = options?.suppressRowPageBreaks === true;
    const n = Math.min(headers.length, maxCols);
    if (n === 0) return;
    const heads = headers.slice(0, n).map((h) => String(h ?? "").slice(0, 80));
    const body = rows.slice(0, maxRows).map((r) =>
      Array.from({ length: n }, (_, i) => {
        const v = r[i];
        if (v === null || v === undefined) return "—";
        const s = String(v);
        return s.length > 140 ? `${s.slice(0, 137)}…` : s;
      })
    );
    const pad = 1.6;
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
        measureMonolithicTableStackMm(doc, contentWidth, heads, body, fontSize) + 2
      );
    }

    const drawRow = (
      cells: string[],
      isHeader: boolean,
      fontStyle: "bold" | "normal"
    ) => {
      const cellLines = cells.map((cell, i) =>
        doc.splitTextToSize(cell, Math.max(4, colW[i] - pad * 2))
      );
      const maxLines = Math.min(
        isHeader ? 3 : 5,
        Math.max(1, ...cellLines.map((lines) => lines.length))
      );
      const linePitch = fontSize * 0.42 + 1.15;
      const rowH = maxLines * linePitch + pad * 2;
      if (!suppressBreaks) {
        ensurePageSpace(rowH + 1.2);
      }
      doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
      doc.setLineWidth(0.2);
      if (isHeader) {
        doc.setFillColor(theme.panel[0], theme.panel[1], theme.panel[2]);
        doc.rect(margin, y, contentWidth, rowH, "FD");
      } else {
        doc.rect(margin, y, contentWidth, rowH, "S");
      }
      let cx = margin;
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
          doc.line(cx, y, cx, y + rowH);
        }
        doc.setFont("helvetica", fontStyle);
        doc.setFontSize(isHeader ? fontSize + 0.6 : fontSize);
        doc.setTextColor(
          isHeader ? theme.ink[0] : theme.body[0],
          isHeader ? theme.ink[1] : theme.body[1],
          isHeader ? theme.ink[2] : theme.body[2]
        );
        const lines = cellLines[i].slice(0, maxLines);
        let yy = y + pad + (isHeader ? 3.3 : 2.8);
        lines.forEach((ln: string) => {
          doc.text(ln, cx + pad, yy);
          yy += linePitch;
        });
        cx += colW[i];
      }
      y += rowH;
    };

    drawRow(heads, true, "bold");
    for (const row of body) {
      drawRow(row, false, "normal");
    }
    y += 3;
    doc.setTextColor(0, 0, 0);
  };

  const kindLabel = datasetKindLabel(input.dataset.datasetKind);

  /* -------- Cover -------- */
  const coverH = 48;
  ensurePageSpace(coverH + 28);
  doc.setFillColor(theme.panel[0], theme.panel[1], theme.panel[2]);
  doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
  doc.roundedRect(margin, y, contentWidth, coverH, 2, 2, "FD");
  doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
  doc.rect(margin, y, 2.8, coverH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
  doc.text("Executive insight report", margin + 6, y + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
  doc.text(company, margin + 6, y + 20);
  if (tagline) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    const tl = doc.splitTextToSize(tagline, contentWidth - 10).slice(0, 2);
    doc.text(tl, margin + 6, y + 26);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
  const genStr = input.generatedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

  y += coverH + 10;
  doc.setTextColor(0, 0, 0);

  mutedLine("Dataset profile", kindLabel);
  mutedLine(
    "Volume",
    `${input.dataset.rows.toLocaleString()} records × ${input.dataset.colCount} columns` +
      (input.dataset.sheet ? ` · Sheet: ${input.dataset.sheet}` : "")
  );
  y += 3;

  const isChartRankedExecutiveLine = (line: string) =>
    /^(Highest|Second|Third|Largest)\s*:/i.test(line.trim());

  /* -------- Executive summary -------- */
  sectionTitle("Executive summary");
  if (!input.execSummaryLines.length) {
    bodyText("No executive summary could be assembled for this export.", 10);
  } else {
    const execLinesForLoop =
      input.pdfRankedSignals?.length && input.pdfRankedSignals.length > 0
        ? input.execSummaryLines.filter((l) => !isChartRankedExecutiveLine(l))
        : input.execSummaryLines;

    const partitioned = partitionExecSummaryLines(execLinesForLoop);

    if (partitioned.scope.length) {
      insightSubheading("Scope");
      partitioned.scope.forEach((s) => bodyText(s, 9.5));
    }
    if (partitioned.question) {
      insightSubheading("Question in scope");
      bodyText(partitioned.question, 10);
    }
    if (partitioned.takeaway) {
      insightSubheading("Main takeaway");
      bodyBullets([partitioned.takeaway], 10);
    }
    if (partitioned.metrics.length) {
      insightSubheading("Key metrics");
      partitioned.metrics.forEach((m) => drawExecBullet(m));
      y += 1.5;
    }
    if (partitioned.evidence.length) {
      drawEvidenceNoteBox(partitioned.evidence);
    }
    if (partitioned.other.length) {
      insightSubheading("Supporting signals");
      partitioned.other.forEach((line) => renderLegacyExecSummaryLine(line));
    }

    if (input.pdfRankedSignals?.length) {
      insightSubheading("Chart highlights");
      input.pdfRankedSignals.slice(0, 3).forEach((r) => {
        drawExecBullet(`${r.rank}: ${r.category} — ${r.valueDisplay}`);
      });
      y += 1.5;
    }

    doc.setTextColor(0, 0, 0);
  }
  y += 5;

  if (input.includes.includeKPIs && y > contentTop0 + 118) {
    doc.addPage();
    y = contentTop0;
  }

  /* -------- KPIs -------- */
  if (input.includes.includeKPIs) {
    sectionTitle(input.kpiSectionTitle);
    const cards = input.kpiCards;
    if (!cards.length) {
      bodyText(
        "KPI metrics are not available yet. Upload data or adjust column mapping.",
        10
      );
    } else {
      const gap = 4;
      const colW = (contentWidth - gap) / 2;
      const cardH = 22;
      const rows = Math.ceil(cards.length / 2);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          const idx = r * 2 + c;
          const card = cards[idx];
          const x = margin + c * (colW + gap);
          if (!card) continue;
          ensurePageSpace(cardH + 3);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
          doc.setLineWidth(0.25);
          doc.roundedRect(x, y, colW, cardH, 1.5, 1.5, "FD");
          doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
          doc.rect(x, y, 2.2, cardH, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
          const titleLines = doc.splitTextToSize(card.title, colW - 8);
          doc.text(titleLines.slice(0, 2), x + 4, y + 5.5);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
          const valLines = doc.splitTextToSize(String(card.value), colW - 8);
          doc.text(valLines.slice(0, 2), x + 4, y + 12);
          if (card.subtitle) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.8);
            doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
            const sub = doc.splitTextToSize(String(card.subtitle), colW - 8);
            doc.text(sub.slice(0, 2), x + 4, y + 18.5);
          }
        }
        y += cardH + gap;
      }
      y += 2;
    }
  }

  /* -------- AI insight -------- */
  if (input.includes.includeAIInsight) {
    sectionTitle("AI insight");
    {
      const q =
        input.question.trim() || "No question was recorded for this export.";
      const qFont = 10.5;
      const ql = doc.splitTextToSize(q, contentWidth);
      const lineH = qFont * 0.42 + 1.45;
      const labelH = 9 * 0.42 + 1.45 + 5;
      const questionBlockH = labelH + ql.length * lineH + 6;
      ensurePageSpace(questionBlockH);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    doc.text("Business question", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    {
      const q =
        input.question.trim() || "No question was recorded for this export.";
      const ql = doc.splitTextToSize(q, contentWidth);
      const lineH = 10.5 * 0.42 + 1.45;
      doc.text(ql, margin, y);
      y += ql.length * lineH + 5;
    }

    if (
      input.chartInsightBadge ||
      input.insightSummary ||
      input.pdfRankedSignals?.length
    ) {
      const signalLimit =
        input.includes.includeTechnicalAppendix === true ? 12 : 3;
      let bulletLines: string[] = [];
      if (input.pdfRankedSignals?.length) {
        bulletLines = input.pdfRankedSignals.slice(0, signalLimit).map(
          (r) => `${r.category}: ${r.valueDisplay}`
        );
      } else {
        const rawBadge = [input.chartInsightBadge, input.insightSummary]
          .filter(Boolean)
          .join(" · ");
        bulletLines = highlightSignalsToBulletLines(rawBadge, signalLimit);
        if (!bulletLines.length) {
          const fb = formatNumericTokensInSignalLine(
            stripRankingLeadIn(rawBadge)
          ).trim();
          if (fb) bulletLines = [fb.slice(0, 180) + (fb.length > 180 ? "…" : "")];
        }
      }
      const linePitch = 4.65;
      let contentH = 0;
      bulletLines.forEach((bl) => {
        const wrapped = doc.splitTextToSize(`• ${bl}`, contentWidth - 14);
        contentH += wrapped.length * linePitch;
      });
      if (contentH < linePitch) contentH = linePitch;
      const boxH = contentH + 10;
      ensurePageSpace(boxH + 6);
      doc.setFillColor(254, 252, 232);
      doc.setDrawColor(250, 204, 21);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, y, contentWidth, boxH, 1.2, 1.2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(120, 53, 15);
      doc.text("Highlighted signals", margin + 3, y + 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      let hy = y + 9;
      bulletLines.forEach((bl) => {
        const wrapped = doc.splitTextToSize(`• ${bl}`, contentWidth - 14);
        wrapped.forEach((ln: string) => {
          doc.text(ln, margin + 3, hy);
          hy += linePitch;
        });
      });
      y += boxH + 4;
    }

    if (input.insightConfidenceLevel) {
      const lvl = String(input.insightConfidenceLevel).toLowerCase();
      const mapped: Confidence =
        lvl === "high" ? "High" : lvl === "medium" ? "Medium" : "Low";
      drawConfidenceChip(doc, margin, y + 2, "Insight confidence", mapped);
      y += 7;
    }

    y += 6;
    const sec = input.insightSections;
    const hasStructured =
      sec &&
      (sec.summary?.trim() ||
        sec.statistical?.trim() ||
        sec.hypotheses?.trim() ||
        sec.recommendations?.trim());

    if (hasStructured && sec) {
      if (sec.summary?.trim()) {
        ensureAiBlockFits(
          PDF_INSIGHT_SECTION_LABELS.overview,
          9.5,
          sec.summary.trim(),
          9.5
        );
        insightSubheading(PDF_INSIGHT_SECTION_LABELS.overview);
        bodyBullets([sec.summary.trim()], 10);
      }
      const blocks: [string, string | undefined][] = [
        [PDF_INSIGHT_SECTION_LABELS.findings, sec.statistical],
        [PDF_INSIGHT_SECTION_LABELS.interpretation, sec.hypotheses],
        [PDF_INSIGHT_SECTION_LABELS.actions, sec.recommendations],
      ];
      for (const [heading, body] of blocks) {
        if (!body?.trim()) continue;
        ensureAiBlockFits(heading, 9.5, body.trim(), 9.5);
        insightSubheading(heading);
        bodyBullets([body.trim()], 9.5);
        y += 1.5;
      }
    } else if (input.answer.trim()) {
      ensureAiBlockFits("Analysis", 9.5, input.answer.trim(), 9.5);
      insightSubheading("Analysis");
      bodyBullets([input.answer.trim()], 9.5);
    } else {
      bodyText(
        "No AI answer yet. Ask a question in AI Insights before exporting.",
        10
      );
    }
    y += 3;
  }

  /* -------- AI conversation context (thread / filters) -------- */
  if (input.includes.includeConversationContext) {
    const ap = input.conversationAppendix;
    const hasThread = ap && ap.questionThread.length > 0;
    const hasFilters = ap && ap.inheritedFilters.length > 0;
    const hasDrill = ap && ap.activeDrillPath.length > 0;
    const hasAssumption = ap?.inheritedAssumptionNote?.trim();
    if (hasThread || hasFilters || hasDrill || hasAssumption) {
      sectionTitle("AI conversation context");
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
      ch.data.length === 0
        ? "No chart"
        : ch.title.trim() ||
          (ch.presentationKind === "line" || ch.presentationKind === "area"
            ? "Trend view"
            : ch.presentationKind === "pie" || ch.presentationKind === "donut"
              ? "Mix / share"
              : ch.presentationKind === "scatter"
                ? "Relationship view"
                : ch.presentationKind === "bar_horizontal"
                  ? "Ranking view"
                  : "Category comparison");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    ensurePageSpace(7);
    doc.text(pdfChartHeading, margin, y);
    y += 7;
    if (ch.data.length === 0 && ch.chartAttribution?.trim()) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      const attrLines = doc.splitTextToSize(ch.chartAttribution.trim(), contentWidth);
      ensurePageSpace(attrLines.length * 4 + 2);
      doc.text(attrLines, margin, y);
      y += attrLines.length * 4 + 3;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
    }
    if (ch.data.length > 0 && ch.subtitle.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      const subL = doc.splitTextToSize(ch.subtitle.trim(), contentWidth);
      ensurePageSpace(subL.length * 4.3 + 2);
      doc.text(subL, margin, y);
      y += subL.length * 4.3 + 4;
      doc.setTextColor(0, 0, 0);
    }

    if (
      ch.data.length > 0 &&
      input.chartAxisLabels &&
      (input.chartAxisLabels.category.trim() ||
        input.chartAxisLabels.value.trim())
    ) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      ensurePageSpace(5);
      doc.text("Axes", margin, y);
      y += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
      const pk = input.chart?.presentationKind;
      const xAxisPdfTitle =
        pk && pk.length > 0 ? pdfXAxisLineTitle(pk) : "Category";
      const yAxisPdfTitle =
        pk && pk.length > 0 ? pdfYAxisLineTitle(pk) : "Value";
      mutedLine(
        xAxisPdfTitle,
        input.chartAxisLabels.category.trim() || "—"
      );
      mutedLine(yAxisPdfTitle, input.chartAxisLabels.value.trim() || "—");
      y += 1;
    }

    if (ch.data.length > 0) {
      const mShow =
        ch.alignedMetricDisplay?.trim() || ch.alignedMetric?.trim();
      if (mShow) {
        mutedLine("Metric", mShow);
      }
    }

    const execBrief = input.executiveInsightsBrief?.trim() ?? "";
    const factSlice = (input.vizExecutiveFacts ?? []).slice(0, 6);
    const hasExecFacts = factSlice.length > 0;
    if (execBrief || hasExecFacts) {
      const gridRows = hasExecFacts ? Math.ceil(factSlice.length / 3) : 0;
      const briefLines = execBrief
        ? doc.splitTextToSize(execBrief, contentWidth).length
        : 0;
      const briefH = execBrief ? briefLines * 4.35 + 6 : 0;
      const gridEstimated = hasExecFacts ? 6 + gridRows * (22 + 4) + 6 : 0;
      ensurePageSpace(8 + briefH + gridEstimated);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
      doc.text("Executive insights", margin, y);
      y += 5;

      if (execBrief) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        const wrap = doc.splitTextToSize(execBrief, contentWidth);
        const lh = 4.35;
        ensurePageSpace(wrap.length * lh + 2);
        doc.text(wrap, margin, y);
        y += wrap.length * lh + (hasExecFacts ? 4 : 6);
      }

      if (hasExecFacts) {
        const factGap = 3;
        const fw = (contentWidth - factGap * 2) / 3;
        let fx = margin;
        let rowH = 0;
        factSlice.forEach((fact, i) => {
          if (i > 0 && i % 3 === 0) {
            fx = margin;
            y += rowH + 4;
            rowH = 0;
            ensurePageSpace(18);
          }
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
          doc.roundedRect(fx, y, fw, 14, 1, 1, "FD");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
          const ft = doc.splitTextToSize(fact.title, fw - 4);
          doc.text(ft.slice(0, 2), fx + 2, y + 4);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
          doc.text(
            doc
              .splitTextToSize(
                formatNumericTokensInSignalLine(String(fact.value)),
                fw - 4
              )
              .slice(0, 1),
            fx + 2,
            y + 10
          );
          rowH = Math.max(rowH, 14);
          fx += fw + factGap;
        });
        y += rowH + 8;
      } else {
        y += 2;
      }
    }

    if (ch.data.length === 0) {
      bodyText(
        ch.chartAttribution?.trim()
          ? ch.chartAttribution.trim()
          : "No chart generated yet. Ask an AI question that creates a chart.",
        10
      );
    } else {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const cap = ch.captureEl;
      if (!cap) {
        bodyText("Chart could not be prepared for PDF export.", 10);
      } else {
        const maxImgH = 118;
        ensurePageSpace(maxImgH + 10);
        try {
          const png = await renderChartSvgToPng(cap, 2);
          if (!png) throw new Error("Chart SVG not found");
          let imgWidth = contentWidth;
          let imgHeight = (png.height * imgWidth) / png.width;
          if (imgHeight > maxImgH) {
            imgHeight = maxImgH;
            imgWidth = (png.width * imgHeight) / png.height;
          }
          const imgX = margin + Math.max(0, (contentWidth - imgWidth) / 2);
          ensurePageSpace(imgHeight + 4);
          doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
          doc.setLineWidth(0.3);
          doc.roundedRect(imgX - 0.5, y - 1.5, imgWidth + 1.5, imgHeight + 3, 1, 1, "S");
          doc.addImage(png.dataUrl, "PNG", imgX, y, imgWidth, imgHeight);
          y += imgHeight + 2;
        } catch (chartCaptureError) {
          console.warn("Chart SVG capture for PDF failed:", chartCaptureError);
          try {
            const { default: html2canvas } = await import("html2canvas");
            const canvas = await html2canvas(cap, {
              scale: 2,
              useCORS: true,
              backgroundColor: "#ffffff",
            });
            let imgWidth = contentWidth;
            let imgHeight = (canvas.height * imgWidth) / canvas.width;
            if (imgHeight > maxImgH) {
              imgHeight = maxImgH;
              imgWidth = (canvas.width * imgHeight) / canvas.height;
            }
            const imgX = margin + Math.max(0, (contentWidth - imgWidth) / 2);
            ensurePageSpace(imgHeight + 4);
            doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
            doc.roundedRect(imgX - 0.5, y - 1.5, imgWidth + 1.5, imgHeight + 3, 1, 1, "S");
            doc.addImage(
              canvas.toDataURL("image/png"),
              "PNG",
              imgX,
              y,
              imgWidth,
              imgHeight
            );
            y += imgHeight + 2;
          } catch (fallbackErr) {
            console.warn("html2canvas fallback also failed:", fallbackErr);
            bodyText(
              "Chart image could not be embedded. See data summary below.",
              10
            );
          }
        }
      }
    }

    y += 2;
    doc.setTextColor(0, 0, 0);
  }

  /* -------- Preview -------- */
  if (input.includes.includeDataPreview) {
    const { rows: preview, columns: cols } = input.preview;
    const maxCols = cols.length ? Math.min(cols.length, 7) : 0;
    const maxPreviewRows = preview.length ? Math.min(preview.length, 12) : 0;
    const introBlockH =
      12 +
      (cols.length > maxCols ? 22 : 0) +
      (preview.length && cols.length ? 11 : 0);

    let previewHeads: string[] = [];
    let previewBody: string[][] = [];
    if (preview.length && cols.length) {
      previewHeads = cols.slice(0, maxCols);
      previewBody = preview.slice(0, maxPreviewRows).map((row) =>
        previewHeads.map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return "—";
          const s = String(v);
          return s.length > 80 ? `${s.slice(0, 77)}…` : s;
        })
      );
    }
    const previewTableH =
      previewBody.length > 0
        ? measureMonolithicTableStackMm(
            doc,
            contentWidth,
            previewHeads,
            previewBody,
            7
          )
        : 0;
    const sectionReserve = 30 + introBlockH + previewTableH + 12;
    if (y + sectionReserve > footerY - 6) {
      doc.addPage();
      y = contentTop0;
    }
    sectionTitle("Data preview");
    if (!preview.length || !cols.length) {
      bodyText("No preview rows available. Upload data to include a preview section.", 10);
    } else {
      bodyText(
        `Sample excerpt: ${maxPreviewRows} rows × ${previewHeads.length} columns.`,
        9
      );
      if (cols.length > previewHeads.length) {
        bodyText(
          `Showing first ${maxCols} columns only; remaining columns hidden to fit PDF width.`,
          8.5
        );
      }
      drawDataTable(previewHeads, previewBody, {
        fontSize: 7,
        maxCols: 7,
        maxRows: 12,
        suppressRowPageBreaks: true,
      });
    }
    y += 2;
  }

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
      bodyText(
        "Column profile was not loaded. Re-upload or refresh to see missing-value totals.",
        10
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
    if (
      hasChartMeta ||
      thumbsAp.length > 0 ||
      provNotesAp ||
      Boolean(input.provenance)
    ) {
      doc.addPage();
      y = contentTop0;
      sectionTitle("Technical appendix");
      bodyText(
        "Plot construction details, raw series samples, and engine metadata for audit or hand-off to data teams. Omit when sharing with non-technical stakeholders.",
        8.5
      );

      if (chAp?.chartAttribution?.trim()) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
        ensurePageSpace(5);
        doc.text("Visualization source note", margin, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        bodyParagraphs(chAp.chartAttribution!.trim());
      }

      if (input.provenance) {
        mutedLine("Analysis confidence", input.provenance.confidence);
        mutedLine("Records analyzed", String(input.provenance.rowsAnalyzed));
        mutedLine("Visualized categories", String(input.provenance.chartPoints));
        if (input.provenance.aggregation) {
          mutedLine("Aggregation (engine)", String(input.provenance.aggregation));
        }
      }
      mutedLine("Dataset mapping confidence", input.mappingConfidence);

      if (provNotesAp) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
        ensurePageSpace(5);
        doc.text("Provenance notes", margin, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        bodyParagraphs(provNotesAp);
      }

      if (thumbsAp.length >= 1) {
        sectionTitle("Session charts (sparkline thumbnails)");
        const thumbW = (contentWidth - 3 * 3) / 4;
        const thumbH = 16;
        let tx = margin;
        thumbsAp.slice(0, 4).forEach((t, i) => {
          if (i > 0 && i % 4 === 0) {
            tx = margin;
            y += thumbH + 14;
            ensurePageSpace(thumbH + 16);
          }
          drawSparkline(doc, tx, y, thumbW, thumbH, t.values, theme.accent);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
          const ttl = doc.splitTextToSize(t.title, thumbW);
          doc.text(ttl.slice(0, 2), tx, y + thumbH + 4);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
          doc.text(t.kind.slice(0, 28), tx, y + thumbH + 8.5);
          tx += thumbW + 3;
        });
        y += thumbH + 14;
      }

      if (chAp && hasSeries) {
        sectionTitle("Chart specification");
        mutedLine("Chart type", chartTypeLabel(chAp.presentationKind));
        if (chAp.alignedMetric) {
          const mShow = chAp.alignedMetricDisplay?.trim() || chAp.alignedMetric;
          mutedLine("Metric (aligned)", mShow);
        }
        if (chAp.aggregation) {
          mutedLine("Aggregation", String(chAp.aggregation));
        }
        mutedLine("Series points", String(chAp.data.length));
        const chartLines = chAp.data.slice(0, 24).map((row) => {
          const v =
            row.displayValue?.trim() ||
            fallbackChartNumericDisplay(
              chAp.presentationKind,
              Number(row.value)
            );
          if (chAp.presentationKind === "scatter") {
            const xStr =
              row.displayX?.trim() ||
              (typeof row.x === "number" && Number.isFinite(row.x)
                ? String(row.x)
                : "—");
            return `${String(row.name)}: x=${xStr} y=${v}`;
          }
          return `${String(row.name)}: ${v}`;
        });
        const block = chartLines.join("\n");
        const wrapped = doc.splitTextToSize(block, contentWidth);
        const lh = 4.2;
        ensurePageSpace(wrapped.length * lh + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(theme.body[0], theme.body[1], theme.body[2]);
        doc.text(wrapped, margin, y);
        y += wrapped.length * lh + 2;
        if (chAp.data.length > 24) {
          bodyText(`Showing first 24 of ${chAp.data.length} series points.`, 8);
        }
      }
    }
  }

  /* -------- Running header / footer every page -------- */
  const totalPages = doc.getNumberOfPages();
  const sourceRaw = (input.dataset.fileName || "").trim() || "—";
  const sourceShort =
    sourceRaw.length > 52 ? `${sourceRaw.slice(0, 49)}…` : sourceRaw;
  const shortTitle = "Executive insight report";
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    doc.rect(0, 0, pageWidth, 1.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(theme.ink[0], theme.ink[1], theme.ink[2]);
    doc.text(company, margin, margin + 1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    doc.text(shortTitle, margin, margin + 5);
    const rightW = doc.getTextWidth(genStr);
    doc.text(genStr, pageWidth - margin - rightW, margin + 1);

    doc.setDrawColor(theme.line[0], theme.line[1], theme.line[2]);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - footerBand + 2, pageWidth - margin, pageHeight - footerBand + 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    const footParts: string[] = [`Source: ${sourceShort}`, `Generated ${genStr}`];
    if (input.includes.includeTechnicalAppendix) {
      footParts.push(`Mapping: ${input.mappingConfidence}`);
      if (input.provenance) {
        footParts.push(`Analysis: ${input.provenance.confidence}`);
      }
    }
    const footLeft = footParts.join("   ·   ");
    const fl = doc.splitTextToSize(footLeft, contentWidth - 28);
    doc.text(fl, margin, pageHeight - 8);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(180, 190, 200);
    doc.text("AI Data Analyst App", pageWidth / 2, pageHeight - 4.5, {
      align: "center",
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(theme.muted[0], theme.muted[1], theme.muted[2]);
    doc.text(`Page ${i} / ${totalPages}`, pageWidth - margin - 18, pageHeight - 8);
    doc.setTextColor(0, 0, 0);
  }

  const base = sanitizeFileBase(input.branding.companyName || "analytics-brief");
  doc.save(`${base}-${input.generatedAt.toISOString().slice(0, 10)}.pdf`);
}
