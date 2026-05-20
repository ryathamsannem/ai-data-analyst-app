/**
 * When `/ask` alignment corrects metric/category vs a stale visualization payload,
 * force chart axis labels (and downstream chips, executive facts, smart intel) to
 * follow aligned analysis + provenance — not prompt-shaped titles.
 */

import type { ChartKind } from "@/app/chart-types";
import {
  buildAxisLabelFromAggColumn,
  buildCompactAxisValueLabel,
  humanizeColumnName,
  polishMetricDisplay,
} from "@/lib/analytics-metadata";
import {
  resolveHistogramMeasureChipLabel,
  resolveSemanticCategoryAxisForCharts,
  type ChartSemanticAnalysisLike,
  type ChartSemanticVizLike,
} from "@/lib/chart-semantic-metadata";

export type MergedChartAxes = {
  categoryAxis: string;
  valueAxis: string;
  valueAxisCompact: string;
};

export type InsightAxisMergeMode = "full" | "category_only";

function isTimeSeriesKind(kind: ChartKind): boolean {
  return kind === "line" || kind === "area";
}

function aggTokenForAxis(
  analysis: ChartSemanticAnalysisLike,
  viz: ChartSemanticVizLike
): string {
  const a = String(
    analysis?.aggregationKey ??
      analysis?.aggregation ??
      viz?.provenance?.aggregationKey ??
      viz?.provenance?.aggregation ??
      ""
  )
    .trim()
    .toLowerCase();
  return a || "sum";
}

/**
 * Merge aligned metric/category columns into Recharts axis labels for AI insight charts.
 */
export function mergeInsightAxesWithAlignedAnalysis(args: {
  axes: MergedChartAxes;
  presentationKind: ChartKind;
  viz: ChartSemanticVizLike;
  analysis: ChartSemanticAnalysisLike | null;
  /** Only when true (AI insight bundle). */
  preferAligned: boolean;
  grainHintTitle: string;
  rawChartTitle: string;
  mode: InsightAxisMergeMode;
}): MergedChartAxes {
  if (!args.preferAligned || !args.analysis) return args.axes;
  const a = args.analysis;
  const mDisp = a.metricColumnDisplay?.trim();
  const mCol = a.metricColumn?.trim();
  const cDisp = a.categoryColumnDisplay?.trim();
  const cCol = a.categoryColumn?.trim();
  const hasMetric = Boolean(mDisp || mCol);
  const hasCategory = Boolean(cDisp || cCol);
  if (!hasMetric && !hasCategory) return args.axes;

  let { categoryAxis, valueAxis, valueAxisCompact } = args.axes;

  if (args.presentationKind === "histogram") {
    if (args.mode === "full" && hasMetric) {
      valueAxis = resolveHistogramMeasureChipLabel(
        args.viz,
        a,
        args.preferAligned
      );
      valueAxisCompact = valueAxis;
      return {
        categoryAxis: "Bucket range",
        valueAxis,
        valueAxisCompact,
      };
    }
    return args.axes;
  }

  if (isTimeSeriesKind(args.presentationKind)) {
    if (hasCategory || hasMetric) {
      categoryAxis = resolveSemanticCategoryAxisForCharts({
        presentationKind: args.presentationKind,
        chartTitle: args.rawChartTitle,
        grainTitleHint: args.grainHintTitle,
        viz: args.viz,
        analysis: a,
        preferAnalysisForCategory: true,
        refinedCategoryFallback:
          cDisp || (cCol ? humanizeColumnName(cCol) : categoryAxis),
      });
    }
    if (args.mode === "full" && hasMetric) {
      valueAxis = mDisp
        ? polishMetricDisplay(mDisp)
        : buildAxisLabelFromAggColumn(aggTokenForAxis(a, args.viz), mCol!);
      valueAxisCompact = buildCompactAxisValueLabel({
        metricColumnDisplay: mDisp ?? null,
        metricColumn: mCol ?? null,
        aggregationKey: a.aggregationKey ?? null,
        aggregationLabel: a.aggregation ?? null,
      });
    }
    return { categoryAxis, valueAxis, valueAxisCompact };
  }

  if (hasCategory) {
    categoryAxis = cDisp || humanizeColumnName(cCol!);
  }

  if (args.mode === "full" && hasMetric) {
    valueAxis = mDisp
      ? polishMetricDisplay(mDisp)
      : buildAxisLabelFromAggColumn(aggTokenForAxis(a, args.viz), mCol!);
    valueAxisCompact = buildCompactAxisValueLabel({
      metricColumnDisplay: mDisp ?? null,
      metricColumn: mCol ?? null,
      aggregationKey: a.aggregationKey ?? null,
      aggregationLabel: a.aggregation ?? null,
    });
  }

  return { categoryAxis, valueAxis, valueAxisCompact };
}
