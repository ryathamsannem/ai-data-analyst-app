/**
 * Shared ExecutivePdfExportInput assembly — single source for Export tab + AI Insights export.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import { fallbackChartNumericDisplay } from "@/app/chart-types";
import type { ChartSnapshot } from "@/contexts/chart-session-context";
import type { ChartArtifact } from "@/lib/chart-platform/chart-artifact";
import type { ChartPresentationMetadataChip } from "@/lib/chart-platform/chart-presentation-contract";
import { buildKpiTitle, remapLegacyKpiTitle } from "@/lib/analytics-metadata";
import { getCanonicalChartTitle } from "@/lib/canonical-chart-title";
import {
  buildChartNarrative,
  normalizeAiSectionTitle,
} from "@/lib/ux-narrative";
import {
  isTrendMode,
  narrativeCopyForContract,
  sanitizeNarrativeForTrendContract,
  semanticContextFromContract,
  type VisualizationContract,
} from "@/lib/selected-visualization";
import { sortChartRowsChronologically } from "@/lib/chart-time-x-axis";
import { buildTrendPdfRankedSignals } from "@/lib/trend-visualization";
import type { ExecutiveVizInsightCard } from "@/lib/executive-insight-ranking";
import {
  softenExecutiveTakeaway,
  type NarrativeTone,
} from "@/lib/insight-narrative-tone";
import type { RoutingPlanPayload } from "@/lib/routing-plan";
import type { SmartChartIntel } from "@/lib/smart-chart-intelligence";
import { alignPdfNarrativeToChart } from "@/lib/pdf-narrative-alignment";
import { resolveOverviewDatasetTypeLabel } from "@/lib/resolved-dataset-type-label";
import {
  datasetKindLabel,
  type ExecutivePdfExportInput,
  type PdfChartIntelSlice,
  type PdfConversationAppendix,
  type PdfInsightSections,
  type PdfProvenanceSlice,
  type PdfRankedSignal,
  type PdfRoutingPlanSlice,
  type PdfVizExecutiveFact,
  type ReportBranding,
} from "@/app/pdf-report";

export type PdfExportMode = "executive" | "analyst";

export type PdfExportReportPreset = "insight" | "full";

export type ExecutivePdfExportOptions = {
  includeKPIs: boolean;
  includeAIInsight: boolean;
  includeChart: boolean;
  includeDataPreview: boolean;
  includeDataQuality: boolean;
  includeConversationContext?: boolean;
  includeTechnicalAppendix?: boolean;
  chartScope?: "insight" | "session";
  /** Default: executive (story-first). Analyst adds technical appendix + metadata sections. */
  pdfMode?: PdfExportMode;
  /** Slim AI Insights export vs Export-tab full selection. */
  reportPreset?: PdfExportReportPreset;
};

/** Insight preset defaults: story + chart first; appendix sections opt-in only from the call partial. */
export function applyPdfExportPreset(
  merged: ExecutivePdfExportOptions,
  call?: Partial<ExecutivePdfExportOptions>
): ExecutivePdfExportOptions {
  if (merged.reportPreset !== "insight") {
    return merged;
  }
  const explicit = call ?? {};
  return {
    ...merged,
    pdfMode: merged.pdfMode ?? "executive",
    includeKPIs: merged.includeKPIs ?? true,
    includeAIInsight: merged.includeAIInsight ?? true,
    includeChart: merged.includeChart ?? true,
    includeDataPreview: explicit.includeDataPreview === true,
    includeDataQuality: explicit.includeDataQuality === true,
    includeConversationContext: explicit.includeConversationContext === true,
    includeTechnicalAppendix: explicit.includeTechnicalAppendix === true,
    chartScope: merged.chartScope ?? "insight",
  };
}

function resolvePdfIncludes(
  options: ExecutivePdfExportOptions
): ExecutivePdfExportOptions & { pdfMode: PdfExportMode } {
  const mode = options.pdfMode ?? "executive";
  if (mode === "analyst") {
    return {
      ...options,
      pdfMode: "analyst",
      includeTechnicalAppendix: options.includeTechnicalAppendix ?? true,
    };
  }
  return {
    ...options,
    pdfMode: "executive",
    includeTechnicalAppendix: options.includeTechnicalAppendix === true,
    includeDataPreview: options.includeDataPreview === true,
    includeDataQuality: options.includeDataQuality === true,
    includeConversationContext: options.includeConversationContext === true,
  };
}

export type PdfKpiCard = {
  title: string;
  value: string;
  subtitle?: string | null;
};

export type PdfKpisSnapshot = {
  total_rows: number;
  total_columns: number;
  total_sales?: number | null;
  unique_products?: number | null;
  top_product?: { name: string; value: number } | null;
};

export type PdfDatasetProfile = {
  column_types?: Record<string, string>;
  null_counts?: Record<string, number>;
} | null;

export type ParsedAnswerSections = {
  summary: string;
  statistical?: string;
  hypotheses?: string;
  recommendations?: string;
  methodology?: string;
  moreDetail?: string;
};

const PLAIN_SECTION_LABEL_RE =
  /^(Key findings|What this may indicate|Suggested next steps|Next steps|How this was calculated|Statistical observations)\s*:?\s*$/i;

function parsePlainLabelSections(t: string): ParsedAnswerSections | null {
  const lines = t.split(/\r?\n/);
  const labelIndexes: { line: number; key: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (!PLAIN_SECTION_LABEL_RE.test(trimmed)) continue;
    const norm = normalizeAiSectionTitle(trimmed).toLowerCase();
    let key = "more";
    if (/statistical|key finding/.test(norm)) key = "statistical";
    else if (/hypothes|may indicate|inferred/.test(norm)) key = "hypotheses";
    else if (/recommend|next step/.test(norm)) key = "recommendations";
    else if (/method/.test(norm)) key = "methodology";
    labelIndexes.push({ line: i, key });
  }

  if (!labelIndexes.length) return null;

  const sections: ParsedAnswerSections = { summary: "" };
  const preamble = lines.slice(0, labelIndexes[0].line).join("\n").trim();
  if (preamble) sections.summary = preamble;

  for (let i = 0; i < labelIndexes.length; i++) {
    const start = labelIndexes[i].line + 1;
    const end =
      i + 1 < labelIndexes.length ? labelIndexes[i + 1].line : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    if (!body) continue;
    const key = labelIndexes[i].key;
    if (key === "statistical") sections.statistical = body;
    else if (key === "hypotheses") sections.hypotheses = body;
    else if (key === "recommendations") sections.recommendations = body;
    else if (key === "methodology") sections.methodology = body;
    else {
      sections.moreDetail = sections.moreDetail
        ? `${sections.moreDetail}\n\n${body}`
        : body;
    }
  }

  if (!sections.summary && !sections.statistical && !sections.hypotheses) {
    return null;
  }
  return sections;
}

function parseInlineLabelSections(t: string): ParsedAnswerSections | null {
  const inlineRe =
    /\b(Key findings|What this may indicate|Suggested next steps|Next steps)\s*:?\s*/gi;
  if (!inlineRe.test(t)) return null;
  inlineRe.lastIndex = 0;

  const matches = [...t.matchAll(inlineRe)];
  if (!matches.length) return null;

  const sections: ParsedAnswerSections = { summary: "" };
  const preamble = t.slice(0, matches[0].index ?? 0).trim();
  if (preamble) sections.summary = preamble;

  for (let i = 0; i < matches.length; i++) {
    const label = matches[i][1] ?? "";
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? t.length) : t.length;
    const body = t.slice(start, end).trim();
    if (!body) continue;
    const norm = normalizeAiSectionTitle(label).toLowerCase();
    if (/statistical|key finding/.test(norm)) sections.statistical = body;
    else if (/hypothes|may indicate|inferred/.test(norm)) sections.hypotheses = body;
    else if (/recommend|next step/.test(norm)) sections.recommendations = body;
    else {
      sections.moreDetail = sections.moreDetail
        ? `${sections.moreDetail}\n\n${body}`
        : body;
    }
  }

  return sections.summary || sections.statistical || sections.hypotheses
    ? sections
    : null;
}

function firstUsefulSentence(text: string | undefined): string {
  if (!text?.trim()) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  const cleaned = normalized.replace(/^(\d+[.)]\s+|[-•*–—]\s+)/, "");
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  return (match?.[0] ?? cleaned.slice(0, 320)).trim();
}

export type ResolveParsedAnswerSummaryOpts = {
  insightSummary?: string;
  reasoningBlockClaim?: string;
};

export function parsedAnswerHasDetailSections(
  sections: ParsedAnswerSections
): boolean {
  return Boolean(
    sections.statistical?.trim() ||
      sections.hypotheses?.trim() ||
      sections.recommendations?.trim() ||
      sections.methodology?.trim() ||
      sections.moreDetail?.trim()
  );
}

/** Derive a main-card summary when the parser left summary empty. */
export function resolveParsedAnswerSummary(
  sections: ParsedAnswerSections,
  opts?: ResolveParsedAnswerSummaryOpts
): string {
  if (sections.summary?.trim()) {
    const lead = firstUsefulSentence(sections.summary);
    return lead || sections.summary.trim();
  }

  const sources = [
    sections.statistical,
    opts?.insightSummary,
    sections.hypotheses,
    sections.recommendations,
    sections.methodology,
    sections.moreDetail,
    opts?.reasoningBlockClaim,
  ];

  for (const src of sources) {
    const sentence = firstUsefulSentence(src);
    if (sentence) return sentence;
  }
  return "";
}

/** Main AI Answer card summary — never "unavailable" when detail sections exist. */
export function insightAnswerSummaryForDisplay(
  sections: ParsedAnswerSections,
  opts?: ResolveParsedAnswerSummaryOpts
): string {
  const primary = sections.summary?.trim();
  if (primary) return primary;
  if (parsedAnswerHasDetailSections(sections)) {
    const fallback = resolveParsedAnswerSummary(sections, opts);
    if (fallback) return fallback;
  }
  return "Summary unavailable — see detail sections.";
}

function withSummaryFallback(
  sections: ParsedAnswerSections,
  insightSummary?: string,
  reasoningBlockClaim?: string
): ParsedAnswerSections {
  if (sections.summary?.trim()) return sections;
  const fallback = resolveParsedAnswerSummary(sections, {
    insightSummary,
    reasoningBlockClaim,
  });
  return fallback ? { ...sections, summary: fallback } : sections;
}

export type ParseAnswerIntoSectionsOpts = {
  reasoningBlockClaim?: string;
};

export type PdfAlignedAnalysisSlice = {
  focusKpis?: PdfKpiCard[];
  metricColumn?: string | null;
  metricColumnDisplay?: string | null;
  categoryColumn?: string | null;
  categoryColumnDisplay?: string | null;
  aggregation?: string | null;
  aggregationKey?: string | null;
  insightSummary?: string;
  insightConfidenceLevel?: string;
  insightConfidenceRationale?: string;
  routingPlan?: RoutingPlanPayload | null;
};

/** Chart + provenance resolved by page before export (capture refs stay in React). */
export type PdfChartPrepContext = {
  presentationKind: ChartKind;
  chartData: ChartRow[];
  chartTitle: string;
  chartSubtitleMerged: string;
  exportDisplayTitle: string;
  trendMode: boolean;
  contract: VisualizationContract | undefined;
  rankedSignals: PdfRankedSignal[] | null;
  metricColumn: string | null;
  alignedMetricDisplay: string | null;
  aggregation: string | null;
  chartInsightBadge: string | null;
  chartAxisLabels: { category: string; value: string } | null;
  metadataChips?: ChartPresentationMetadataChip[] | null;
  chartArtifact?: ChartArtifact | null;
  captureEl: HTMLElement | null;
  chartAttribution: string | null;
  provenanceSlice: PdfProvenanceSlice | null;
  metricType: string | null;
  roundingHint: string | null;
  vizMetricType: string | null;
};

export type BuildExecutivePdfInputParams = {
  options: ExecutivePdfExportOptions;
  chartScope: "insight" | "session";
  chartPrep: PdfChartPrepContext | null;
  reportBranding: ReportBranding;
  mappingConfidence: "High" | "Medium" | "Low";
  rows: number;
  columns: string[];
  selectedSheet?: string;
  uploadFileName?: string;
  datasetKind: string;
  typeLabel?: string | null;
  mappingDomain?: string | null;
  profile: PdfDatasetProfile;
  preview: Record<string, unknown>[];
  kpis: PdfKpisSnapshot | null;
  alignedAnalysis: PdfAlignedAnalysisSlice | null;
  pdfAlignedAnalysis: PdfAlignedAnalysisSlice | null;
  question: string;
  lastAskedQuestion: string;
  pdfInsightAnswer: string;
  parsedInsightAnswer: ParsedAnswerSections;
  insightExecutiveBrief: string;
  insightExecutiveVizInsights: ExecutiveVizInsightCard[];
  executiveVizInsights: ExecutiveVizInsightCard[];
  insightSmartChartIntel: SmartChartIntel | null;
  sessionSmartChartIntel: SmartChartIntel | null;
  displayKpiCards: PdfKpiCard[];
  primaryMetricColumn?: string | null;
  primaryBreakdownColumn?: string | null;
  insightNarrativeTone: NarrativeTone;
  insightNarrativeDisclaimer: string | null;
  pdfSnapSource?: ChartSnapshot["source"];
  chartHistory: ChartSnapshot[];
  conversationAppendix: PdfConversationAppendix | null;
};

export type BuildExecutivePdfInputResult =
  | { ok: true; input: ExecutivePdfExportInput }
  | { ok: false; error?: string };

export function parseAnswerIntoSections(
  raw: string,
  insightSummary?: string,
  opts?: ParseAnswerIntoSectionsOpts
): ParsedAnswerSections {
  const t = raw.trim();
  if (!t) {
    return withSummaryFallback(
      { summary: (insightSummary ?? "").trim() },
      insightSummary,
      opts?.reasoningBlockClaim
    );
  }

  if (/(^|\n)##\s+\S/m.test(t)) {
    const parts = t.split(/(?=\n##\s+)/);
    const head = (parts[0] ?? "").trim();
    const sections: ParsedAnswerSections = {
      summary: head || insightSummary?.trim() || "",
    };
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i].trim();
      const nl = block.indexOf("\n");
      const titleLine = nl >= 0 ? block.slice(0, nl) : block;
      const body = nl >= 0 ? block.slice(nl + 1).trim() : "";
      const titleRaw = titleLine.replace(/^##\s+/, "").trim();
      const titleNorm = normalizeAiSectionTitle(titleRaw).toLowerCase();
      if (/statistical|key finding/.test(titleNorm)) sections.statistical = body;
      else if (/hypothes|may indicate|inferred/.test(titleNorm))
        sections.hypotheses = body;
      else if (/recommend|next step/.test(titleNorm))
        sections.recommendations = body;
      else if (/method/.test(titleNorm)) sections.methodology = body;
      else {
        sections.moreDetail =
          (sections.moreDetail ? `${sections.moreDetail}\n\n` : "") +
          `${titleLine}\n${body}`.trim();
      }
    }
    return withSummaryFallback(
      sections,
      insightSummary,
      opts?.reasoningBlockClaim
    );
  }

  const plain = parsePlainLabelSections(t);
  if (plain) {
    return withSummaryFallback(plain, insightSummary, opts?.reasoningBlockClaim);
  }

  const inline = parseInlineLabelSections(t);
  if (inline) {
    return withSummaryFallback(inline, insightSummary, opts?.reasoningBlockClaim);
  }

  const lines = t.split(/\r?\n/);
  const maxLines = 6;
  if (lines.length <= maxLines) {
    return withSummaryFallback(
      { summary: t },
      insightSummary,
      opts?.reasoningBlockClaim
    );
  }
  return withSummaryFallback(
    {
      summary: lines.slice(0, maxLines).join("\n"),
      moreDetail: lines.slice(maxLines).join("\n"),
    },
    insightSummary,
    opts?.reasoningBlockClaim
  );
}

export function mergeParsedSectionsForPdfExport(
  p: ParsedAnswerSections
): PdfInsightSections {
  const summaryCore = p.summary.trim();
  const tail = [p.methodology, p.moreDetail].filter(Boolean).join("\n\n").trim();
  const summary =
    tail && !summaryCore
      ? tail
      : tail && summaryCore
        ? `${summaryCore}\n\n${tail}`
        : summaryCore;
  return {
    summary,
    statistical: p.statistical?.trim() || undefined,
    hypotheses: p.hypotheses?.trim() || undefined,
    recommendations: p.recommendations?.trim() || undefined,
  };
}

function applyBarChartSort(
  rows: ChartRow[],
  kind: ChartKind,
  ascending: boolean | null
): ChartRow[] {
  if (ascending === null) return rows;
  if (kind === "scatter" || kind === "histogram") return rows;
  if (!rows.length || rows.length <= 1) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = Number(a.value);
    const vb = Number(b.value);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0;
    return ascending ? va - vb : vb - va;
  });
  return copy;
}

function sortRowsForPresentation(
  rows: ChartRow[],
  kind: ChartKind,
  ascending: boolean | null,
  trendMode: boolean
): ChartRow[] {
  if (trendMode) return sortChartRowsChronologically(rows);
  return applyBarChartSort(rows, kind, ascending);
}

/** Same numeric ranking as key-figure cards for PDF executive summary highlights. */
export function computePdfRankedSignalsFromChartRows(
  rows: ChartRow[],
  kind: ChartKind,
  max = 3,
  orderForTieBreak?: ChartRow[],
  trendMode = false,
  ascending: boolean | null = null,
  trendBucketLabel = "Weekly"
): PdfRankedSignal[] | null {
  if (trendMode) {
    const trendSignals = buildTrendPdfRankedSignals(
      rows,
      kind,
      max,
      trendBucketLabel
    );
    if (trendSignals?.length) return trendSignals;
  }
  if (kind === "scatter" || !rows.length) return null;

  const dispKind: ChartKind =
    kind === "pie" || kind === "donut"
      ? "bar_horizontal"
      : kind === "bar_horizontal"
        ? "bar_horizontal"
        : "bar";

  const orderBase =
    orderForTieBreak && orderForTieBreak.length ? orderForTieBreak : rows;
  const firstIndex = new Map<string, number>();
  orderBase.forEach((row, idx) => {
    const cat = String(row.name ?? "").trim() || "—";
    if (!firstIndex.has(cat)) firstIndex.set(cat, idx);
  });

  const merged = new Map<string, ChartRow>();
  for (const row of rows) {
    const cat = String(row.name ?? "").trim() || "—";
    const v = Number(row.value);
    if (!Number.isFinite(v)) continue;
    const prev = merged.get(cat);
    if (!prev || v > Number(prev.value)) {
      merged.set(cat, { ...row, name: cat, value: v });
    }
  }

  const deduped = [...merged.values()];
  if (!deduped.length) return null;

  const preferLow = ascending === true;
  deduped.sort((a, b) => {
    const va = Number(a.value);
    const vb = Number(b.value);
    const delta = preferLow ? va - vb : vb - va;
    if (delta !== 0) return delta;
    const ia = firstIndex.get(String(a.name)) ?? 0;
    const ib = firstIndex.get(String(b.name)) ?? 0;
    return ia - ib;
  });

  const rankWords = preferLow
    ? (["Lowest", "Second lowest", "Third lowest"] as const)
    : ascending === false
      ? (["Highest", "Second highest", "Third highest"] as const)
      : kind === "pie" || kind === "donut"
        ? (["Largest", "Second", "Third"] as const)
        : (["Highest", "Second", "Third"] as const);

  return deduped.slice(0, max).map((row, i) => {
    const v = Number(row.value);
    const valueDisplay =
      row.displayValue?.trim() || fallbackChartNumericDisplay(dispKind, v);
    return {
      rank: rankWords[i] ?? `#${i + 1}`,
      category: String(row.name ?? "").trim() || "—",
      valueDisplay,
    };
  });
}

function formatNumberForExecutiveSummary(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 1) {
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 0,
    });
  }
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
}

function polishExecutiveSummaryMetricText(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const trailing = t.match(/^(.+)\s+(-?[\d,]+(?:\.[\d]+)?)\s*$/);
  if (trailing) {
    const label = trailing[1].trim();
    const num = Number(trailing[2].replace(/,/g, ""));
    if (Number.isFinite(num) && label.length > 0) {
      return `${label} ${formatNumberForExecutiveSummary(num)}`;
    }
  }
  const only = t.replace(/,/g, "");
  if (/^-?[\d.]+$/.test(only)) {
    const num = Number(only);
    if (Number.isFinite(num)) return formatNumberForExecutiveSummary(num);
  }
  return t;
}

function formatExecutiveSummaryKpiLine(card: PdfKpiCard): string {
  const title = card.title.replace(/\s+/g, " ").trim();
  const value = polishExecutiveSummaryMetricText(String(card.value ?? ""));
  const sub = card.subtitle?.trim()
    ? polishExecutiveSummaryMetricText(String(card.subtitle))
    : "";
  return sub ? `${title}: ${value} — ${sub}` : `${title}: ${value}`;
}

function firstSentenceForExecutiveSummary(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = (parts[0] ?? t).trim();
  if (first.length <= maxLen) return first;
  const slice = first.slice(0, maxLen);
  const sp = slice.lastIndexOf(" ");
  return sp > 48 ? `${slice.slice(0, sp)}…` : `${slice}…`;
}

function inferSalesColumn(
  cols: string[],
  profile: PdfDatasetProfile,
  explicit: string,
  datasetKind?: string
): string | null {
  if (explicit) return explicit;
  const nums = cols.filter((c) => profile?.column_types?.[c] === "number");
  const dk = (datasetKind || "").trim().toLowerCase();
  if (dk === "operations" || dk === "manufacturing") {
    const opsMetric = nums.find((c) =>
      /production_loss|downtime|repair|maintenance|defect|scrap|oee|yield|outage|loss_units/i.test(
        c
      )
    );
    if (opsMetric) return opsMetric;
  }
  const byName = nums.find((c) =>
    /sales|revenue|amount|total|value|qty|quantity/i.test(c)
  );
  if (byName) return byName;
  if (nums.length === 1) return nums[0];
  return null;
}

function buildFallbackKpiCards(
  kpis: PdfKpisSnapshot | null,
  profile: PdfDatasetProfile,
  columns: string[],
  datasetKind?: string,
  primaryMetricColumn?: string | null,
  primaryBreakdownColumn?: string | null
): PdfKpiCard[] {
  if (!kpis) return [];

  const remapOpts = {
    metricColumn: primaryMetricColumn ?? null,
    breakdownColumn: primaryBreakdownColumn ?? null,
  };
  const dk = (datasetKind || "").trim();

  const hasSalesSlice =
    kpis.total_sales != null ||
    kpis.top_product != null ||
    kpis.unique_products != null;

  if (hasSalesSlice) {
    const out: PdfKpiCard[] = [
      { title: "Total Rows", value: kpis.total_rows.toLocaleString() },
    ];
    if (kpis.total_sales != null) {
      const metricCol =
        primaryMetricColumn ||
        inferSalesColumn(columns, profile, "", datasetKind);
      const title =
        metricCol && ["operations", "manufacturing"].includes(dk.toLowerCase())
          ? buildKpiTitle({
              aggregationKey: "sum",
              aggregationLabel: "total",
              metricColumn: metricCol,
            })
          : remapLegacyKpiTitle("Total Sales", dk, remapOpts);
      out.push({
        title,
        value: kpis.total_sales.toLocaleString(),
      });
    }
    if (kpis.top_product) {
      out.push({
        title: remapLegacyKpiTitle("Top Product", dk, remapOpts),
        value: kpis.top_product.name,
        subtitle: kpis.top_product.value.toLocaleString(),
      });
    }
    if (kpis.unique_products != null) {
      out.push({
        title: remapLegacyKpiTitle("Products", dk, remapOpts),
        value: kpis.unique_products.toLocaleString(),
      });
    }
    return out.slice(0, 4);
  }

  let numN = 0;
  let catN = 0;
  for (const c of columns) {
    const t = profile?.column_types?.[c];
    if (t === "number") numN++;
    else if (t === "category" || t === "text") catN++;
  }
  return [
    { title: "Records", value: kpis.total_rows.toLocaleString() },
    { title: "Fields in file", value: kpis.total_columns.toLocaleString() },
    {
      title: "Metric fields",
      value: numN.toLocaleString(),
      subtitle: "Numeric columns (from profile)",
    },
    {
      title: "Dimension fields",
      value: catN.toLocaleString(),
      subtitle: "Category / text columns (from profile)",
    },
  ];
}

function resolvePdfKpiCards(params: BuildExecutivePdfInputParams): PdfKpiCard[] {
  const { alignedAnalysis, displayKpiCards, kpis, profile, columns, datasetKind } =
    params;
  if (alignedAnalysis?.focusKpis?.length) return alignedAnalysis.focusKpis;
  if (displayKpiCards.length) return displayKpiCards;
  return buildFallbackKpiCards(
    kpis,
    profile,
    columns,
    datasetKind,
    params.primaryMetricColumn,
    params.primaryBreakdownColumn
  );
}

export function executiveVizCardsToPdfFacts(
  cards: ExecutiveVizInsightCard[]
): PdfVizExecutiveFact[] {
  return cards.map((c) => ({
    title: c.title,
    value: c.value,
    hint: c.hint,
    kind: c.kind,
  }));
}

export function chartIntelSliceFromSmartChart(
  intel: SmartChartIntel | null | undefined
): PdfChartIntelSlice | undefined {
  if (!intel?.active) return undefined;
  const why = intel.whyThisChart?.trim();
  const blurb = intel.recommendationBlurb?.trim();
  const label = intel.recommendedLabel?.trim();
  if (!why && !blurb && !label) return undefined;
  return {
    recommendedLabel: label || null,
    whyThisChart: why || null,
    recommendationBlurb: blurb || null,
  };
}

export function routingPlanSliceForPdf(
  plan: RoutingPlanPayload | null | undefined,
  chartContract?: VisualizationContract | null
): PdfRoutingPlanSlice | undefined {
  if (!plan?.intent?.trim()) return undefined;
  const chartDimension =
    chartContract?.dimension?.trim() ||
    chartContract?.semanticContext?.dimensionLabel?.trim() ||
    null;
  return {
    intent: plan.intent.trim(),
    executiveLens: plan.executiveLens ?? null,
    metricColumn: plan.metricColumn ?? null,
    dimensionColumn: chartDimension ?? plan.dimensionColumn ?? null,
    chartType: plan.chartType ?? null,
    unsupportedReason: plan.unsupportedReason ?? null,
  };
}

function buildExecutiveSummaryLines(
  params: BuildExecutivePdfInputParams,
  cardsPdf: PdfKpiCard[],
  pdfRankedSignals: PdfRankedSignal[] | null
): string[] {
  const {
    chartScope,
    rows,
    columns,
    datasetKind,
    typeLabel,
    mappingDomain,
    kpis,
    question,
    lastAskedQuestion,
    pdfAlignedAnalysis,
    pdfInsightAnswer,
    parsedInsightAnswer,
    insightNarrativeTone,
    insightNarrativeDisclaimer,
    chartPrep,
    pdfSnapSource,
  } = params;

  const lines: string[] = [];
  const rowCount = kpis?.total_rows ?? rows;
  const colCount = kpis?.total_columns ?? columns.length;
  const domainLabel = resolveOverviewDatasetTypeLabel({
    datasetKind: datasetKind || "generic",
    typeLabel,
    mappingDomain,
  });

  lines.push(
    `The dataset contains ${Number(rowCount).toLocaleString()} rows and ${colCount} columns (${domainLabel} profile).`
  );

  const q =
    chartScope === "insight"
      ? lastAskedQuestion.trim() || question.trim()
      : question.trim() || lastAskedQuestion.trim();
  if (q) {
    const qShort = q.length > 200 ? `${q.slice(0, 197)}…` : q;
    lines.push(`Question: ${qShort}`);
  }

  const pdfContract = chartPrep?.contract;
  const pdfTrendMode = chartPrep?.trendMode ?? false;

  const mainTakeaway = (() => {
    const tone = insightNarrativeTone;
    const wrap = (raw: string) =>
      softenExecutiveTakeaway(firstSentenceForExecutiveSummary(raw, 200), tone);
    if (pdfSnapSource === "auto_dashboard" || pdfTrendMode) {
      const sem = semanticContextFromContract(pdfContract);
      if (sem) return wrap(buildChartNarrative(sem));
      return "";
    }
    const fromAligned = pdfAlignedAnalysis?.insightSummary?.trim();
    if (fromAligned) return wrap(fromAligned);
    const fromParsed =
      chartScope === "insight"
        ? parseAnswerIntoSections(
            pdfInsightAnswer,
            pdfAlignedAnalysis?.insightSummary ?? undefined
          ).summary?.trim()
        : parsedInsightAnswer.summary?.trim();
    if (fromParsed) return wrap(fromParsed);
    return "";
  })();

  if (mainTakeaway) lines.push(`Main takeaway: ${mainTakeaway}`);
  if (insightNarrativeDisclaimer) lines.push(insightNarrativeDisclaimer);

  const hasChartRankedSignals =
    pdfRankedSignals != null && pdfRankedSignals.length > 0;
  if (!hasChartRankedSignals) {
    cardsPdf.slice(0, 3).forEach((c) => {
      lines.push(formatExecutiveSummaryKpiLine(c));
    });
  }
  if (!hasChartRankedSignals && !cardsPdf.length && columns.length === 0) {
    lines.push(
      "Upload data to populate KPI aggregates for this executive summary."
    );
  }
  return lines.slice(0, 8);
}

function buildInsightSectionsForPdf(
  params: BuildExecutivePdfInputParams
): PdfInsightSections | null {
  const {
    options,
    chartScope,
    pdfInsightAnswer,
    parsedInsightAnswer,
    pdfAlignedAnalysis,
    chartPrep,
  } = params;
  if (!options.includeAIInsight) return null;

  const pdfContract = chartPrep?.contract;
  const _pdfTrendMode = chartPrep?.trendMode ?? false;

  const parsed =
    chartScope === "insight"
      ? (() => {
          const p = parseAnswerIntoSections(
            pdfInsightAnswer,
            pdfAlignedAnalysis?.insightSummary ?? undefined
          );
          if (!isTrendMode(pdfContract)) return p;
          const sanitize = (t?: string) =>
            t?.trim()
              ? sanitizeNarrativeForTrendContract(t, pdfContract)
              : t;
          return {
            ...p,
            summary: sanitize(p.summary) ?? "",
            statistical: sanitize(p.statistical),
            hypotheses: sanitize(p.hypotheses),
            recommendations: sanitize(p.recommendations),
            methodology: sanitize(p.methodology),
            moreDetail: sanitize(p.moreDetail),
          };
        })()
      : parsedInsightAnswer;

  return mergeParsedSectionsForPdfExport(parsed);
}

function buildChartThumbnails(chartHistory: ChartSnapshot[]) {
  return chartHistory
    .filter((h) => h.chartData.length > 1)
    .slice(-6)
    .map((h) => ({
      title: getCanonicalChartTitle({
        rawTitle: h.title?.trim() || "Chart",
        chartType: h.chartKind,
        contract: h.contract ?? null,
        labels: h.chartData.map((r) => String(r.name ?? "")),
        values: h.chartData.map((r) => r.value),
        aggregationKey: h.contract?.aggregation ?? "sum",
      }),
      kind: h.chartKind || h.source,
      values: h.chartData
        .map((r) => Number(r.value))
        .filter((n) => Number.isFinite(n)),
    }))
    .filter((t) => t.values.length > 1);
}

export const PDF_PREVIEW_DUPLICATE_METRIC_LABEL =
  "Sample duplicate-like rows (preview check)";

export function previewDuplicatesForPdf(
  preview: Record<string, unknown>[],
  columns: string[],
  totalRows: number
): { duplicates: number; note: string; label: string } {
  const label = PDF_PREVIEW_DUPLICATE_METRIC_LABEL;
  if (!preview.length || !columns.length) {
    return {
      duplicates: 0,
      label,
      note: "Preview duplicate check not available — no preview rows loaded.",
    };
  }
  const sigs = preview.map((row) =>
    columns.map((c) => String(row[c] ?? "")).join("\u001f")
  );
  const tally = new Map<string, number>();
  sigs.forEach((s) => tally.set(s, (tally.get(s) || 0) + 1));
  let dupExtra = 0;
  tally.forEach((n) => {
    if (n > 1) dupExtra += n - 1;
  });
  const totalLabel =
    totalRows > 0 ? `${totalRows.toLocaleString()} file rows` : "the full dataset";
  return {
    duplicates: dupExtra,
    label,
    note: `Preview duplicate check only — scans ${preview.length.toLocaleString()} loaded preview row${preview.length === 1 ? "" : "s"}, not all ${totalLabel}. This is not a full-file duplicate audit.`,
  };
}

/** Assemble the full export payload consumed by `runExecutivePdfExport`. */
export function buildExecutivePdfExportInput(
  params: BuildExecutivePdfInputParams
): BuildExecutivePdfInputResult {
  const {
    options,
    chartScope,
    chartPrep,
    reportBranding,
    mappingConfidence,
    rows,
    columns,
    selectedSheet,
    uploadFileName,
    datasetKind,
    typeLabel,
    mappingDomain,
    profile,
    preview,
    pdfAlignedAnalysis,
    question,
    lastAskedQuestion,
    pdfInsightAnswer,
    insightExecutiveBrief,
    insightExecutiveVizInsights,
    executiveVizInsights,
    insightSmartChartIntel,
    sessionSmartChartIntel,
    conversationAppendix,
    chartHistory,
  } = params;

  const resolved = resolvePdfIncludes(applyPdfExportPreset(options));
  const cardsPdf = resolvePdfKpiCards(params);
  const pdfRankedSignals = chartPrep?.rankedSignals ?? null;
  const pdfContract = chartPrep?.contract;
  const pdfTrendMode = chartPrep?.trendMode ?? false;

  const alignedNarrative =
    chartScope === "insight" && chartPrep
      ? alignPdfNarrativeToChart({
          chartPrep,
          pdfInsightAnswer,
          insightExecutiveBrief,
          insightExecutiveVizInsights,
          parsedInsightAnswer: params.parsedInsightAnswer,
          alignedInsightSummary: pdfAlignedAnalysis?.insightSummary,
          rankedSignals: pdfRankedSignals,
        })
      : null;

  const effectivePdfInsightAnswer =
    alignedNarrative?.pdfInsightAnswer ?? pdfInsightAnswer;
  const effectiveInsightBrief =
    alignedNarrative?.insightExecutiveBrief ?? insightExecutiveBrief;
  const effectiveInsightVizInsights =
    alignedNarrative?.insightExecutiveVizInsights ??
    insightExecutiveVizInsights;
  const effectiveParsedInsightAnswer =
    alignedNarrative?.parsedInsightAnswer ?? params.parsedInsightAnswer;
  const effectivePdfAlignedAnalysis =
    alignedNarrative?.alignedInsightSummary != null && pdfAlignedAnalysis
      ? {
          ...pdfAlignedAnalysis,
          insightSummary: alignedNarrative.alignedInsightSummary,
        }
      : pdfAlignedAnalysis;

  const narrativeParams: BuildExecutivePdfInputParams = {
    ...params,
    pdfInsightAnswer: effectivePdfInsightAnswer,
    insightExecutiveBrief: effectiveInsightBrief,
    insightExecutiveVizInsights: effectiveInsightVizInsights,
    parsedInsightAnswer: effectiveParsedInsightAnswer,
    pdfAlignedAnalysis: effectivePdfAlignedAnalysis,
  };

  const pdfExecutiveVizInsights =
    chartScope === "insight"
      ? effectiveInsightVizInsights
      : executiveVizInsights;

  const exportQuestion =
    chartScope === "insight"
      ? lastAskedQuestion.trim() || question.trim()
      : question.trim() || lastAskedQuestion.trim();

  const smartIntel =
    chartScope === "insight" ? insightSmartChartIntel : sessionSmartChartIntel;

  const profileLabel = resolveOverviewDatasetTypeLabel({
    datasetKind: datasetKind || "generic",
    typeLabel,
    mappingDomain,
  });

  const input: ExecutivePdfExportInput = {
    includes: {
      includeKPIs: resolved.includeKPIs,
      includeAIInsight: resolved.includeAIInsight,
      includeChart: resolved.includeChart,
      includeDataPreview: resolved.includeDataPreview,
      includeDataQuality: resolved.includeDataQuality,
      includeConversationContext: resolved.includeConversationContext === true,
      includeTechnicalAppendix: resolved.includeTechnicalAppendix === true,
      pdfMode: resolved.pdfMode,
      reportPreset: resolved.reportPreset,
    },
    branding: reportBranding,
    dataset: {
      rows,
      colCount: columns.length,
      sheet: selectedSheet || undefined,
      fileName: uploadFileName?.trim() || "No file name supplied.",
      datasetKind: datasetKind || "generic",
      profileLabel,
    },
    generatedAt: new Date(),
    mappingConfidence,
    execSummaryLines: buildExecutiveSummaryLines(
      narrativeParams,
      cardsPdf,
      pdfRankedSignals
    ),
    kpiSectionTitle: params.alignedAnalysis?.focusKpis?.length
      ? "KPI dashboard (aligned with your question)"
      : "KPI dashboard",
    kpiCards: cardsPdf,
    question: exportQuestion,
    answer:
      pdfTrendMode && pdfContract
        ? sanitizeNarrativeForTrendContract(
            effectivePdfInsightAnswer,
            pdfContract
          )
        : effectivePdfInsightAnswer,
    insightSections: buildInsightSectionsForPdf(narrativeParams),
    insightSummary:
      pdfTrendMode && pdfContract
        ? sanitizeNarrativeForTrendContract(
            narrativeCopyForContract(pdfContract) ||
              effectivePdfAlignedAnalysis?.insightSummary?.trim() ||
              "",
            pdfContract
          )
        : sanitizeNarrativeForTrendContract(
            effectivePdfAlignedAnalysis?.insightSummary?.trim() ?? "",
            pdfContract
          ) || effectivePdfAlignedAnalysis?.insightSummary?.trim(),
    insightConfidenceLevel: pdfAlignedAnalysis?.insightConfidenceLevel,
    insightConfidenceRationale:
      pdfAlignedAnalysis?.insightConfidenceRationale?.trim() || undefined,
    routingPlan: routingPlanSliceForPdf(
      effectivePdfAlignedAnalysis?.routingPlan,
      pdfContract
    ),
    chartIntel: chartIntelSliceFromSmartChart(smartIntel),
    chartInsightBadge: chartPrep?.chartInsightBadge ?? null,
    pdfRankedSignals:
      pdfRankedSignals != null && pdfRankedSignals.length > 0
        ? pdfRankedSignals
        : undefined,
    vizExecutiveFacts: executiveVizCardsToPdfFacts(pdfExecutiveVizInsights),
    executiveInsightsBrief:
      resolved.includeAIInsight &&
      (chartScope === "insight"
        ? effectiveInsightBrief.trim()
        : effectiveParsedInsightAnswer.summary?.trim() ?? "")
        ? chartScope === "insight"
          ? effectiveInsightBrief.trim()
          : effectiveParsedInsightAnswer.summary?.trim()
        : undefined,
    provenance: chartPrep?.provenanceSlice ?? null,
    chart:
      resolved.includeChart && chartPrep
        ? {
            presentationKind:
              chartPrep.chartData.length > 0
                ? chartPrep.presentationKind
                : ("" as ChartKind),
            data: chartPrep.chartData,
            title: chartPrep.exportDisplayTitle,
            subtitle: chartPrep.chartSubtitleMerged,
            metadataChips: chartPrep.metadataChips ?? null,
            chartArtifact: chartPrep.chartArtifact ?? null,
            captureEl: chartPrep.captureEl,
            alignedMetric: chartPrep.metricColumn,
            alignedMetricDisplay: chartPrep.alignedMetricDisplay,
            aggregation: chartPrep.aggregation,
            metricType: chartPrep.metricType,
            roundingHint: chartPrep.roundingHint,
            chartAttribution: chartPrep.chartAttribution,
          }
        : null,
    chartAxisLabels: chartPrep?.chartAxisLabels ?? null,
    chartThumbnails: buildChartThumbnails(chartHistory),
    preview: { rows: preview, columns },
    profile: profile ? { null_counts: profile.null_counts || {} } : null,
    previewDuplicates: () => previewDuplicatesForPdf(preview, columns, rows),
    conversationAppendix,
  };

  return { ok: true, input };
}

/** Re-export for chart prep in page.tsx — sorts rows consistently for PDF capture. */
export { sortRowsForPresentation };
