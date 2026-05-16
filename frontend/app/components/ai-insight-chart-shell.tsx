"use client";

import type { ReactNode } from "react";
import type { ChartKind } from "@/app/chart-types";
import { ChartInsightViewportWrapper } from "@/app/components/home/chart-insight-viewport-wrapper";

/**
 * Stable layout box for AI Insight charts only (not Overview session charts).
 * Centers a constrained viewport so vertical bars do not stretch across a wide card.
 */
export function AiInsightChartShell({
  chartKind,
  minOuterHeight = 430,
  children,
}: {
  chartKind: ChartKind;
  minOuterHeight?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[960px] min-w-0"
      style={{ minHeight: minOuterHeight }}
    >
      <ChartInsightViewportWrapper chartKind={chartKind}>
        {children}
      </ChartInsightViewportWrapper>
    </div>
  );
}
