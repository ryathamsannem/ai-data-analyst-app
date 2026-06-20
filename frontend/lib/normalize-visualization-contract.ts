/**
 * Single normalization path for chart kind, layout, and axis metadata
 * across Overview, Charts tab, AI Insights, and export.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import {
  computeAutoDashboardChartPresentation,
  computeFinalChartPresentation,
  orientationForChartKind,
  type FinalChartOrientation,
} from "@/lib/final-chart-presentation";
import {
  resolvePresentationKindFromContract,
  type VisualizationContract,
} from "@/lib/selected-visualization";

export type NormalizedVisualizationContract = {
  kind: ChartKind;
  effectivePresentationKind: ChartKind;
  layout: FinalChartOrientation;
  title: string;
  metricLabel: string | null;
  dimensionLabel: string | null;
  xAxisLabel: string | null;
  yAxisLabel: string | null;
  rows: ChartRow[];
  insights: string | null;
};

export type NormalizeVisualizationContractArgs = {
  title: string;
  rows: ChartRow[];
  question?: string;
  apiChartType?: string | null;
  contract?: VisualizationContract | null;
  pinnedChartKind?: ChartKind | "";
  source?: "auto_dashboard" | "ai" | "overview" | "charts";
  scatterXLabel?: string | null;
  scatterYLabel?: string | null;
  metricColumn?: string | null;
  categoryColumn?: string | null;
  categoryColumnDisplay?: string | null;
};

function resolveKindFromPayload(
  args: NormalizeVisualizationContractArgs
): ChartKind {
  if (args.pinnedChartKind) return args.pinnedChartKind;

  const fromContract = resolvePresentationKindFromContract({
    chartKind: args.pinnedChartKind,
    contract: args.contract ?? null,
  });
  if (fromContract) return fromContract;

  if (args.source === "auto_dashboard") {
    return computeAutoDashboardChartPresentation({
      apiChartType: args.apiChartType ?? "bar",
      title: args.title,
      rows: args.rows,
    });
  }

  return computeFinalChartPresentation({
    apiChartType: args.apiChartType ?? "bar",
    title: args.title,
    question: args.question,
    rows: args.rows,
  });
}

export function normalizeVisualizationContract(
  args: NormalizeVisualizationContractArgs
): NormalizedVisualizationContract {
  const kind = resolveKindFromPayload(args);
  const effectivePresentationKind = kind;
  const layout = orientationForChartKind(kind);

  const metricLabel =
    args.contract?.metricLabel?.trim() ||
    args.scatterYLabel?.trim() ||
    args.metricColumn?.trim() ||
    null;
  const dimensionLabel =
    args.contract?.semanticContext?.dimensionLabel?.trim() ||
    args.categoryColumnDisplay?.trim() ||
    args.categoryColumn?.trim() ||
    args.contract?.dimension?.trim() ||
    null;

  const isScatter = kind === "scatter";
  const xAxisLabel = isScatter
    ? args.scatterXLabel?.trim() || dimensionLabel
    : dimensionLabel;
  const yAxisLabel = isScatter
    ? args.scatterYLabel?.trim() || metricLabel
    : metricLabel;

  return {
    kind,
    effectivePresentationKind,
    layout,
    title: args.contract?.displayTitle?.trim() || args.title.trim() || "Chart",
    metricLabel,
    dimensionLabel,
    xAxisLabel,
    yAxisLabel,
    rows: args.rows,
    insights: null,
  };
}

/** Resolve the chart kind used for ChartRenderer across session surfaces. */
export function resolveSnapshotPresentationKind(
  args: NormalizeVisualizationContractArgs
): ChartKind {
  return normalizeVisualizationContract(args).effectivePresentationKind;
}
