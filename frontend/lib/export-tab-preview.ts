/**
 * Export tab preview — same resolved chart context as PDF export (resolvePdfExportContext).
 */

import type { ChartSnapshot } from "@/contexts/chart-session-context";
import type { ExecutivePdfExportOptions } from "@/lib/build-executive-pdf-input";
import type { ResolvedPdfExportContext } from "@/lib/resolve-pdf-export-context";

export type ExportTabVisualizationPreview = {
  available: boolean;
  summaryLabel: string;
  titleTooltip: string;
  chartTitle: string;
  chartType: string;
  metric: string | null;
  dimension: string | null;
};

type SnapshotVizLike = {
  chartType?: string;
  title?: string;
  provenance?: {
    numericColumn?: string | null;
    numericColumnDisplay?: string | null;
    categoryColumn?: string | null;
    categoryColumnDisplay?: string | null;
    aggregation?: string | null;
  } | null;
} | null;

function metricAndDimensionFromSnapshot(snap: ChartSnapshot): {
  metric: string | null;
  dimension: string | null;
} {
  const viz = snap.visualization as SnapshotVizLike;
  const prov = viz?.provenance;
  const metric =
    prov?.numericColumnDisplay?.trim() ||
    prov?.numericColumn?.trim() ||
    snap.finalPresentation?.metric?.trim() ||
    null;
  const dimension =
    prov?.categoryColumnDisplay?.trim() ||
    prov?.categoryColumn?.trim() ||
    snap.contract?.dimension?.trim() ||
    snap.finalPresentation?.dimension?.trim() ||
    null;
  return { metric, dimension };
}

export function buildExportTabVisualizationPreview(
  ctx: ResolvedPdfExportContext,
  options: Pick<ExecutivePdfExportOptions, "includeChart">
): ExportTabVisualizationPreview {
  const empty: ExportTabVisualizationPreview = {
    available: false,
    summaryLabel: "Not in session yet",
    titleTooltip: "",
    chartTitle: "",
    chartType: "",
    metric: null,
    dimension: null,
  };

  if (!options.includeChart) {
    return {
      ...empty,
      summaryLabel: "Not included in report",
    };
  }

  const snap = ctx.snapshot;
  if (!snap?.chartData?.length) {
    return empty;
  }

  const viz = snap.visualization as SnapshotVizLike;
  const chartType = (snap.chartKind || viz?.chartType || "chart").trim();
  const chartTitle = snap.title?.trim() || viz?.title?.trim() || chartType;
  const pointCount = snap.chartData.length;
  const { metric, dimension } = metricAndDimensionFromSnapshot(snap);

  let summaryLabel = `${pointCount} points · ${chartType} — ${chartTitle}`;
  const metaTail = [metric, dimension].filter(Boolean).join(" · ");
  if (metaTail) {
    summaryLabel += ` · ${metaTail}`;
  }

  const titleTooltip = [
    chartTitle,
    `Type: ${chartType}`,
    metric ? `Measure: ${metric}` : null,
    dimension ? `Dimension: ${dimension}` : null,
    snap.subtitle?.trim() || null,
    provAggregationLabel(viz?.provenance?.aggregation),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    available: true,
    summaryLabel,
    titleTooltip,
    chartTitle,
    chartType,
    metric,
    dimension,
  };
}

function provAggregationLabel(aggregation: string | null | undefined): string | null {
  const a = aggregation?.trim();
  return a ? `Aggregation: ${a}` : null;
}

export function exportTabAiAnswerAvailable(
  ctx: ResolvedPdfExportContext,
  options: Pick<ExecutivePdfExportOptions, "includeAIInsight">,
  liveAnswer: string
): boolean {
  if (options.includeAIInsight) {
    return Boolean(ctx.insightAnswer.trim());
  }
  return Boolean(liveAnswer.trim());
}
