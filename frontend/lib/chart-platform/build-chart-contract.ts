import type { ChartKind, ChartRow } from "@/app/chart-types";
import type { VisualizationContract } from "@/lib/selected-visualization";
import {
  chartOrientationForKind,
  chartRendererFamilyForKind,
  type ChartContractSource,
  type ChartPresentationContract,
  type ChartStoryType,
} from "@/lib/chart-platform/chart-presentation-contract";
import {
  axisFromSemanticHeader,
  buildContractMetadataChips,
  buildFallbackSemanticHeader,
} from "@/lib/chart-platform/chart-contract-metadata";
import type { ChartSemanticHeaderModel } from "@/lib/chart-semantic-metadata";

export type BuildChartPresentationContractArgs = {
  chartId: string;
  source: ChartContractSource;
  apiChartType: string;
  resolvedKind: ChartKind;
  title: string;
  subtitle?: string | null;
  rows: ChartRow[];
  question?: string | null;
  dashboardChartKey?: string | null;
  datasetEpoch?: number | null;
  storyType?: ChartStoryType | null;
  coverageBucket?: string | null;
  metricLabel?: string | null;
  categoryLabel?: string | null;
  semanticHeader?: ChartSemanticHeaderModel | null;
  badgeCompact?: string | null;
  leadInsight?: string | null;
  warning?: string | null;
  aggregation?: string | null;
  legacyVisualizationContract?: VisualizationContract | null;
};

function inferStoryType(kind: ChartKind, title: string): ChartStoryType {
  const t = title.toLowerCase();
  if (kind === "line" || kind === "area" || /\btrend\b/.test(t)) return "trend";
  if (kind === "scatter") return "relationship";
  if (kind === "pie" || kind === "donut") return "composition";
  if (kind === "histogram" || /\bdistribution\b/.test(t)) return "distribution";
  if (/\btop|highest|lowest|rank/.test(t)) return "ranking";
  if (/\sby\s/.test(t)) return "comparison";
  return "unknown";
}

function finiteRowValueCount(rows: readonly ChartRow[]): number {
  return rows.reduce(
    (n, row) => n + (Number.isFinite(Number(row.value)) ? 1 : 0),
    0
  );
}

export function buildChartPresentationContract(
  args: BuildChartPresentationContractArgs
): ChartPresentationContract {
  const legacy = args.legacyVisualizationContract ?? null;
  const metricLabel =
    args.metricLabel?.trim() ||
    legacy?.metricLabel?.trim() ||
    legacy?.metricKey?.trim() ||
    "Value";
  const categoryLabel =
    args.categoryLabel?.trim() ||
    legacy?.dimension?.trim() ||
    legacy?.categoryKey?.trim() ||
    (args.resolvedKind === "line" || args.resolvedKind === "area"
      ? legacy?.timeBucketLabel?.trim() || "Period"
      : "Category");
  const semanticHeader =
    args.semanticHeader ??
    buildFallbackSemanticHeader({
      kind: args.resolvedKind,
      categoryLabel,
      metricLabel,
      xLabel: legacy?.categoryKey,
      yLabel: legacy?.metricLabel,
    });
  const axes = axisFromSemanticHeader({ header: semanticHeader, metricLabel });
  const chips = buildContractMetadataChips({
    renderedKind: args.resolvedKind,
    metricLabel,
    semanticHeader,
    badgeCompact: args.badgeCompact,
    groupCount: args.rows.length,
    leadInsight: args.leadInsight,
  });

  return {
    version: 1,
    identity: {
      chartId: args.chartId,
      source: args.source,
      datasetEpoch: args.datasetEpoch ?? null,
      sourceQuestion: args.question?.trim() || null,
      dashboardChartKey: args.dashboardChartKey?.trim() || null,
    },
    story: {
      type: args.storyType ?? inferStoryType(args.resolvedKind, args.title),
      reason: null,
      coverageBucket: args.coverageBucket ?? null,
    },
    kind: {
      apiChartType: args.apiChartType,
      resolvedKind: args.resolvedKind,
      rendererFamily: chartRendererFamilyForKind(args.resolvedKind),
      orientation: chartOrientationForKind(args.resolvedKind),
    },
    data: {
      rows: args.rows,
      rowCount: args.rows.length,
      groupCount: args.rows.length,
      categoryCount: args.rows.length,
      hasFiniteValues: finiteRowValueCount(args.rows) > 0,
    },
    semantics: {
      title: args.title.trim() || "Chart",
      subtitle: args.subtitle ?? null,
      metric: axes.metric,
      category: axes.category,
      xAxis: axes.xAxis,
      yAxis: axes.yAxis,
      aggregation: args.aggregation ?? legacy?.aggregation ?? null,
    },
    metadata: {
      chips,
      warning: args.warning ?? null,
      leadInsight: args.leadInsight ?? null,
    },
    legacy: {
      visualizationContractId: legacy?.id ?? null,
      rendererStillSurfaceOwned: true,
      exportStillSurfaceOwned: true,
    },
  };
}

export function withChartPresentationMetadata(
  contract: ChartPresentationContract,
  args: {
    metricLabel: string;
    semanticHeader: ChartSemanticHeaderModel;
    badgeCompact: string;
    leadInsight?: string | null;
    warning?: string | null;
  }
): ChartPresentationContract {
  return {
    ...contract,
    semantics: {
      ...contract.semantics,
      ...axisFromSemanticHeader({
        header: args.semanticHeader,
        metricLabel: args.metricLabel,
      }),
    },
    metadata: {
      chips: buildContractMetadataChips({
        renderedKind: contract.kind.resolvedKind,
        metricLabel: args.metricLabel,
        semanticHeader: args.semanticHeader,
        badgeCompact: args.badgeCompact,
        groupCount: contract.data.groupCount,
        leadInsight: args.leadInsight,
      }),
      warning: args.warning ?? null,
      leadInsight: args.leadInsight ?? null,
    },
  };
}
