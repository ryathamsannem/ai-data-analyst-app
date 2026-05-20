"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ChartKind } from "@/app/chart-types";
import { ChartInsightViewportWrapper } from "@/app/components/home/chart-insight-viewport-wrapper";

/**
 * Stable layout box for AI Insight charts only (not Overview session charts).
 * Height follows the plot — no extra min-height dead space.
 */
export function AiInsightChartShell({
  chartKind,
  plotHeight,
  children,
}: {
  chartKind: ChartKind;
  plotHeight: number;
  children: ReactNode;
}) {
  return (
    <div
      className="ai-insights-viz-chart-frame mx-auto w-full max-w-[960px] min-w-0 rounded-[1.1rem] border border-[color:var(--border-default)]/50 p-1 sm:p-1.5 lg:max-w-[min(960px,100%)]"
      style={
        {
          "--insights-viz-plot-h": `${plotHeight}px`,
        } as CSSProperties
      }
    >
      <ChartInsightViewportWrapper chartKind={chartKind}>
        {children}
      </ChartInsightViewportWrapper>
    </div>
  );
}
