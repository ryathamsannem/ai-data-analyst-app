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
    <div className="flex min-h-[360px] w-full flex-col items-center justify-center py-3 sm:min-h-[380px] sm:py-4 lg:min-h-[400px] lg:py-5">
      <div
        className={`mx-auto flex w-full min-w-0 justify-center ${innerMax} px-2 sm:px-3 lg:px-4`}
      >
        <div className="flex w-full min-w-0 max-w-full flex-col items-center justify-center [&_.recharts-cartesian-grid_line]:stroke-[color:var(--chart-axis-line)] [&_.recharts-cartesian-grid_line]:opacity-[var(--overview-dash-grid-opacity,0.28)] [&_.recharts-responsive-container]:mx-auto [&_.recharts-responsive-container]:max-w-full [&_.recharts-text]:fill-[color:var(--chart-axis-tick)]">
          {children}
        </div>
      </div>
    </div>
  );
}
