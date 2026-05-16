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
    <div className="flex min-h-[420px] w-full flex-col items-center justify-center py-4 sm:py-5">
      <div
        className={`mx-auto flex w-full min-w-0 justify-center ${innerMax} px-1 sm:px-2`}
      >
        <div className="flex w-full min-w-0 max-w-full flex-col items-center justify-center [&_.recharts-responsive-container]:mx-auto [&_.recharts-responsive-container]:max-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
