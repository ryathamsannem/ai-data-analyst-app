import type { ChartKind } from "@/app/chart-types";
import { buildMetricLabel } from "@/lib/analytics-metadata";
import type { ChartSemanticHeaderModel } from "@/lib/chart-semantic-metadata";
import {
  resolveHistogramMeasureChipLabel,
  type ChartSemanticVizLike,
} from "@/lib/chart-semantic-metadata";

type InsightProvenance = {
  aggregation?: string | null;
  aggregationKey?: string | null;
  numericColumn?: string | null;
  numericColumnDisplay?: string | null;
  rowsAnalyzed?: number | null;
};

type AlignedAnalysisContext = {
  aggregation?: string | null;
  aggregationKey?: string | null;
  metricColumn?: string | null;
  metricColumnDisplay?: string | null;
  analysisRowCount?: number | null;
};

type StoredVisualization = {
  subtitle?: string | null;
  analyzedRows?: number | null;
  provenance?: InsightProvenance | null;
  chartRecommendation?: {
    metricType?: string | null;
    detectedIntent?: string | null;
  } | null;
};

/** Unified metadata chip contract — UI, PNG composite, and PDF appendix. */
export type ChartMetadataChipKind = "labeled" | "mono" | "lead";

export type ChartMetadataChipSpec = {
  id: string;
  kind: ChartMetadataChipKind;
  label?: string;
  value: string;
  title?: string;
};

export type ExportChipLike = {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: "default" | "lead";
};

export function presentationKindUiLabel(kind: ChartKind): string {
  if (kind === "line") return "Line";
  if (kind === "area") return "Area";
  if (kind === "pie") return "Pie";
  if (kind === "donut") return "Donut";
  if (kind === "scatter") return "Scatter";
  if (kind === "histogram") return "Histogram";
  if (kind === "bar_horizontal") return "Horizontal";
  return "Bar";
}

export function chartTypeShortLabel(kind: ChartKind): string {
  if (kind === "line") return "Line";
  if (kind === "area") return "Area";
  if (kind === "pie") return "Pie";
  if (kind === "donut") return "Donut";
  if (kind === "scatter") return "Scatter";
  if (kind === "bar_horizontal") return "H-Bar";
  if (kind === "histogram") return "Histogram";
  if (!kind) return "Chart";
  return "Bar";
}

function inferAggAndMetricFromChartTitle(title: string): {
  aggLabel: string | null;
  metricPhrase: string | null;
} {
  const t = title.trim();
  const patterns: Array<{ re: RegExp; agg: string }> = [
    { re: /^(average|mean|median)\s+(.+?)\s+by\s+/i, agg: "MEAN" },
    {
      re: /^(lowest|minimum|least|bottom|smallest)\s+(.+?)\s+by\s+/i,
      agg: "MIN",
    },
    {
      re: /^(highest|maximum|top|largest|greatest)\s+(.+?)\s+by\s+/i,
      agg: "MAX",
    },
    { re: /^(total|sum)\s+(.+?)\s+by\s+/i, agg: "SUM" },
    { re: /^(count|number)\s+of\s+(.+?)\s+by\s+/i, agg: "COUNT" },
  ];
  for (const { re, agg } of patterns) {
    const m = t.match(re);
    if (m?.[2]) {
      return { aggLabel: agg, metricPhrase: m[2].trim() };
    }
  }
  return { aggLabel: null, metricPhrase: null };
}

export function inferAutoDashboardMetricFromTitle(title: string): string {
  const t = title.trim();
  const trendIdx = t.search(/\s+trend\s*\(/i);
  if (trendIdx > 0) return t.slice(0, trendIdx).trim();
  const idx = t.search(/\s+by\s+/i);
  if (idx > 0) return t.slice(0, idx).trim();
  return t || "Metric";
}

export function resolveAnalyzedRowsForChartMetadata(args: {
  preferAlignedAnalysis: boolean;
  analysis: AlignedAnalysisContext | null;
  prov?: InsightProvenance | null;
  vizAnalyzedRows?: number | null | undefined;
  filteredDatasetRows?: number | null | undefined;
  fullDatasetRows?: number | null | undefined;
}): number | null {
  const pos = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;

  const fromAligned =
    args.preferAlignedAnalysis && pos(args.analysis?.analysisRowCount)
      ? (args.analysis!.analysisRowCount as number)
      : null;
  const fromViz = pos(args.vizAnalyzedRows) ? (args.vizAnalyzedRows as number) : null;
  const fromProv = pos(args.prov?.rowsAnalyzed) ? args.prov!.rowsAnalyzed : null;
  const fromFiltered = pos(args.filteredDatasetRows)
    ? args.filteredDatasetRows!
    : null;
  const fromFull = pos(args.fullDatasetRows) ? args.fullDatasetRows! : null;

  return (
    fromAligned ?? fromViz ?? fromProv ?? fromFiltered ?? fromFull ?? null
  );
}

export function buildChartMetadataLine(
  kind: ChartKind,
  groupCount: number,
  viz: StoredVisualization | null,
  analysis: AlignedAnalysisContext | null,
  preferAlignedAnalysis: boolean,
  opts?: {
    chartTitle?: string;
    filteredDatasetRows?: number | null;
    fullDatasetRows?: number | null;
  }
): string {
  const prov = viz?.provenance ?? null;
  const title = opts?.chartTitle?.trim() ?? "";
  const rec = viz?.chartRecommendation ?? null;
  const titleInfer = inferAggAndMetricFromChartTitle(title);

  let aggRaw = "";
  let metricRaw = "";

  if (preferAlignedAnalysis && analysis) {
    aggRaw =
      String(analysis.aggregationKey || analysis.aggregation || "").trim();
    metricRaw = String(
      analysis.metricColumnDisplay || analysis.metricColumn || ""
    ).trim();
  }

  if (!aggRaw) {
    aggRaw = String(prov?.aggregationKey ?? prov?.aggregation ?? "").trim();
  }
  if (!aggRaw && titleInfer.aggLabel) {
    aggRaw = titleInfer.aggLabel;
  }
  if (!aggRaw && rec?.metricType) {
    const mt = String(rec.metricType).trim().toLowerCase();
    if (mt && mt !== "numeric" && mt !== "number") {
      aggRaw = String(rec.metricType);
    }
  }

  if (!metricRaw) {
    metricRaw = String(
      prov?.numericColumnDisplay ?? prov?.numericColumn ?? ""
    ).trim();
  }
  if (!metricRaw && titleInfer.metricPhrase) {
    metricRaw = titleInfer.metricPhrase;
  }
  if (!metricRaw && title && viz?.subtitle === "Auto dashboard") {
    metricRaw = inferAutoDashboardMetricFromTitle(title);
  }
  if (!metricRaw && rec?.detectedIntent) {
    metricRaw = String(rec.detectedIntent).replace(/_/g, " ");
  }
  if (!metricRaw && prov?.numericColumn) {
    metricRaw = String(prov.numericColumn).trim();
  }
  if (!metricRaw) {
    metricRaw = "metric";
  }

  const metric =
    kind === "histogram"
      ? resolveHistogramMeasureChipLabel(
          viz as ChartSemanticVizLike,
          analysis,
          preferAlignedAnalysis
        )
      : buildMetricLabel({
          aggregationKey: aggRaw || null,
          aggregationLabel: aggRaw || null,
          metricColumn:
            (preferAlignedAnalysis && analysis?.metricColumn?.trim()) ||
            prov?.numericColumn?.trim() ||
            null,
          metricColumnDisplay: metricRaw || null,
        });

  const rowsNum = resolveAnalyzedRowsForChartMetadata({
    preferAlignedAnalysis,
    analysis,
    prov: viz?.provenance ?? null,
    vizAnalyzedRows: viz?.analyzedRows,
    filteredDatasetRows: opts?.filteredDatasetRows,
    fullDatasetRows: opts?.fullDatasetRows,
  });

  const typeLabel =
    kind === "bar_horizontal" ? "H-Bar" : chartTypeShortLabel(kind);

  const parts: string[] = [typeLabel, metric];
  if (rowsNum != null && rowsNum > 0) {
    parts.push(`${rowsNum.toLocaleString()} rows`);
  }
  if (typeof groupCount === "number" && groupCount >= 0) {
    parts.push(`${groupCount.toLocaleString()} groups`);
  }
  return parts.join(" · ");
}

/** Compact badge for chart cards (full detail in `title=` tooltip). */
export function buildChartMetadataBadgeCompact(
  kind: ChartKind,
  groupCount: number,
  viz: StoredVisualization | null,
  analysis: AlignedAnalysisContext | null,
  preferAlignedAnalysis: boolean,
  opts?: {
    filteredDatasetRows?: number | null;
    fullDatasetRows?: number | null;
  }
): string {
  const prov = viz?.provenance ?? null;

  const rowsNum = resolveAnalyzedRowsForChartMetadata({
    preferAlignedAnalysis,
    analysis,
    prov,
    vizAnalyzedRows: viz?.analyzedRows,
    filteredDatasetRows: opts?.filteredDatasetRows,
    fullDatasetRows: opts?.fullDatasetRows,
  });

  const typeShort = chartTypeShortLabel(kind);

  const parts: string[] = [typeShort];
  if (rowsNum != null && rowsNum > 0) {
    parts.push(`${rowsNum.toLocaleString()} rows`);
  }
  if (typeof groupCount === "number" && groupCount >= 0) {
    parts.push(`${groupCount.toLocaleString()} groups`);
  }
  return parts.join(" · ");
}

/** Build the canonical View · Measure · Axis · badge chip row for any surface. */
export function buildChartMetadataChipSpecs(args: {
  renderedKind: ChartKind;
  metricLabel: string;
  semanticHeader: ChartSemanticHeaderModel;
  badgeCompact: string;
  leadInsight?: string | null;
}): ChartMetadataChipSpec[] {
  const specs: ChartMetadataChipSpec[] = [
    {
      id: "view",
      kind: "labeled",
      label: "View",
      value: presentationKindUiLabel(args.renderedKind),
    },
    {
      id: "measure",
      kind: "labeled",
      label: "Measure",
      value: args.metricLabel,
      title: args.metricLabel,
    },
  ];

  if (args.semanticHeader.mode === "scatter") {
    specs.push({
      id: "x",
      kind: "labeled",
      label: "X",
      value: args.semanticHeader.xLabel,
    });
    specs.push({
      id: "y",
      kind: "labeled",
      label: "Y",
      value: args.semanticHeader.yLabel,
    });
  } else {
    specs.push({
      id: "axis",
      kind: "labeled",
      label: args.semanticHeader.roleLabel,
      value: args.semanticHeader.detailLabel,
      title: args.semanticHeader.detailLabel,
    });
  }

  specs.push({
    id: "badge",
    kind: "mono",
    value: args.badgeCompact,
    title: args.badgeCompact,
  });

  const lead = args.leadInsight?.trim();
  if (lead) {
    specs.push({
      id: "lead",
      kind: "lead",
      value: lead,
      title: lead,
    });
  }

  return specs;
}

/** Map unified chip specs to PNG canvas composite chips. */
export function chipSpecsToExportChips(
  specs: readonly ChartMetadataChipSpec[]
): ExportChipLike[] {
  return specs.map((spec) => {
    if (spec.kind === "mono") {
      return { label: "", value: spec.value, mono: true };
    }
    if (spec.kind === "lead") {
      return { label: "", value: spec.value, mono: true };
    }
    return {
      label: spec.label ?? "",
      value: spec.value,
    };
  });
}

/** Count metadata chips rendered in an export capture root. */
export function countMetadataChipsInExportRoot(
  root: HTMLElement | null | undefined
): number {
  if (!root) return 0;
  const row = root.querySelector("[data-chart-metadata-chips]");
  if (!row) return 0;
  return row.querySelectorAll("[data-chart-metadata-chip]").length;
}
