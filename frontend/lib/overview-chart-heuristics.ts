/**
 * @deprecated Import `computeFinalChartPresentation` from `@/lib/final-chart-presentation`
 * so Overview and session snapshots share one code path.
 */
import type { ChartKind, ChartRow } from "@/app/chart-types";
import { computeFinalChartPresentation } from "@/lib/final-chart-presentation";

export function selectOverviewDisplayKind(args: {
  apiChartType: string;
  title: string;
  rows: ChartRow[];
}): ChartKind {
  return computeFinalChartPresentation({
    apiChartType: args.apiChartType,
    title: args.title,
    question: undefined,
    rows: args.rows,
  });
}
