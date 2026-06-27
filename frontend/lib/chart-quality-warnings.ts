import type { ChartKind, ChartRow } from "@/app/chart-types";
import { chartTooltipMetricLabel } from "@/lib/chart-tooltip-format";
import {
  coercePercentDisplayNumber,
  metricLabelImpliesPercent,
  readChartRowNormalizedValue,
  readChartRowRawValue,
} from "@/lib/metric-value-format";
import { radialShareDisplayAllowed } from "@/lib/radial-chart-format";

export const RATE_EXCEEDS_100_WARNING =
  "Note: Some rate values exceed 100%. Verify metric definition.";

export const CHART_RATE_QUALITY_WARNING_CLASS = "chart-rate-quality-warning";

/** True when a rate/pct metric has any displayed value above 100%. */
export function chartHasRateAbove100(
  rows: ChartRow[],
  metricLabel: string | null | undefined
): boolean {
  if (!metricLabelImpliesPercent(metricLabel)) return false;
  return rows.some((row) => {
    const raw = readChartRowRawValue(row);
    if (!Number.isFinite(raw)) return false;
    const display = coercePercentDisplayNumber(
      raw,
      readChartRowNormalizedValue(row)
    );
    return display > 100;
  });
}

/** Suppress rate>100 warning on valid share/composition radial charts (normalized to ~100%). */
export function resolveRateExceeds100Warning(args: {
  rows: ChartRow[];
  metricLabel: string | null | undefined;
  presentationKind?: ChartKind;
  chartTitle?: string | null;
  question?: string | null;
}): string | null {
  if (!chartHasRateAbove100(args.rows, args.metricLabel)) return null;

  const kind = args.presentationKind;
  if (kind === "pie" || kind === "donut") {
    const title = args.chartTitle ?? args.metricLabel;
    if (radialShareDisplayAllowed(args.rows, title, args.question)) {
      return null;
    }
  }

  return RATE_EXCEEDS_100_WARNING;
}

/** Accessible explanation for percentage-point gap chips. */
export function percentGapChipAriaLabel(
  metricLabel: string | null | undefined
): string {
  const metric = chartTooltipMetricLabel(metricLabel ?? "rate").toLowerCase();
  return `Difference between highest and lowest ${metric} in percentage points`;
}
