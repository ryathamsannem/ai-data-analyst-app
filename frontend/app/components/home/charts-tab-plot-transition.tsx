"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  chartsTabVizPlotSlot,
  chartsTabVizPlotStage,
} from "@/lib/charts-tab-ui";

const TRANSITION_MS = 200;

/**
 * Wraps Charts tab plot area — brief shimmer + enter animation on timeline selection change.
 */
export function ChartsTabPlotTransition({
  chartId,
  plotHeightPx,
  children,
}: {
  chartId: string | null;
  plotHeightPx: number;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const prevIdRef = useRef(chartId);

  useEffect(() => {
    if (prevIdRef.current === chartId) return;
    prevIdRef.current = chartId;
    setPending(true);
    const t = window.setTimeout(() => setPending(false), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [chartId]);

  const plotStyle = {
    "--charts-tab-plot-h": `${plotHeightPx}px`,
    "--insights-viz-plot-h": `${plotHeightPx}px`,
  } as CSSProperties;

  return (
    <div className={chartsTabVizPlotStage}>
      <div
        key={chartId ?? "session-chart"}
        className={`${chartsTabVizPlotSlot} charts-tab-preview-enter`}
        style={plotStyle}
      >
        <div
          className="charts-tab-preview-plot-wrap relative w-full min-h-0"
          style={{ minHeight: plotHeightPx }}
        >
          {pending ? (
            <div
              className="charts-tab-preview-shimmer"
              aria-hidden
              role="presentation"
            />
          ) : null}
          <div
            className={
              pending
                ? "charts-tab-preview-plot-content charts-tab-preview-plot-content--pending"
                : "charts-tab-preview-plot-content"
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
