"use client";

import { memo } from "react";
import {
  chartsTabChartReasonIcon,
  chartsTabChartReasonLabel,
  chartsTabChartReasonStrip,
  chartsTabChartReasonText,
} from "@/lib/charts-tab-ui";

function ChartReasonIcon() {
  return (
    <svg
      className={chartsTabChartReasonIcon}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 2.5a5.5 5.5 0 0 0-3.2 10v1.2c0 .6.5 1.1 1.1 1.1h4.2c.6 0 1.1-.5 1.1-1.1v-1.2A5.5 5.5 0 0 0 10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 15.8h3.6"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const ChartsTabChartReason = memo(function ChartsTabChartReason({
  chartId,
  reason,
}: {
  chartId: string | null;
  reason: string | null;
}) {
  const text = reason?.trim();
  if (!text) return null;

  return (
    <p
      key={chartId ?? "chart-reason"}
      className={chartsTabChartReasonStrip}
      role="note"
      aria-label={`Why this chart: ${text}`}
    >
      <ChartReasonIcon />
      <span className={chartsTabChartReasonLabel}>Why this chart</span>
      <span className={chartsTabChartReasonText}>{text}</span>
    </p>
  );
});
