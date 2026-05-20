"use client";

import type { ChartKind } from "@/app/chart-types";
import { insightViewportMaxClassForChartKind } from "@/lib/chart-layout-config";

/**
 * Centers the insight chart block horizontally and vertically inside the visualization card
 * (AI Insights tab + off-screen PDF capture). Does not affect Overview session charts.
 */
export function ChartInsightViewportWrapper({
  chartKind,
  children,
}: {
  chartKind: ChartKind;
  children: React.ReactNode;
}) {
  const innerMax = insightViewportMaxClassForChartKind(chartKind);
  return (
    <div
      className={`ai-insights-viz-plot-host grid w-full min-w-0 place-items-center ${innerMax}`}
    >
      <div className="grid w-full min-w-0 place-items-center [&_.recharts-cartesian-grid_line]:stroke-[color:var(--chart-axis-line)] [&_.recharts-cartesian-grid_line]:opacity-[var(--overview-dash-grid-opacity,0.28)] [&_.recharts-text]:fill-[color:var(--chart-axis-tick)]">
        {children}
      </div>
    </div>
  );
}
