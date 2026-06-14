import type { ChartKind, ChartRow } from "@/app/chart-types";
import { polishMetricDisplay } from "@/lib/analytics-metadata";
import {
  bucketLabelChronologicalSortKey,
  sortChartRowsChronologically,
} from "@/lib/chart-time-x-axis";
import { inferTrendGrainFromLabels } from "@/lib/chart-semantic-metadata";
import { percentGapChipAriaLabel } from "@/lib/chart-quality-warnings";
import {
  formatExecutiveMetricValue,
  formatMetricSpreadGap,
  metricFormatUsesPercent,
  type MetricFormatContext,
} from "@/lib/metric-value-format";

export type OverviewMiniInsightChip = {
  key: "top" | "lowest" | "gap" | "relationship";
  text: string;
  title?: string;
};

export function inferTrendPeriodLabelFromTitle(chartTitle?: string): string {
  const blob = String(chartTitle ?? "").toLowerCase();
  if (/\bweekly\b|\bweek\b/.test(blob)) return "Week";
  if (/\bdaily\b|\bday\b/.test(blob)) return "Day";
  if (/\bmonthly\b|\bmonth\b/.test(blob)) return "Month";
  if (/\bquarter/.test(blob)) return "Quarter";
  if (/\byearly\b|\byear\b/.test(blob)) return "Year";
  return "Period";
}

/** Prefer label-inferred grain over stale title copy for trend chip prefixes. */
export function resolveTrendPeriodLabel(
  chartTitle?: string,
  labels?: string[]
): string {
  const fromLabels = labels?.length ? inferTrendGrainFromLabels(labels) : null;
  if (fromLabels === "Weekly") return "Week";
  if (fromLabels === "Daily") return "Day";
  if (fromLabels === "Monthly") return "Month";
  if (fromLabels === "Quarterly") return "Quarter";
  if (fromLabels === "Yearly") return "Year";
  return inferTrendPeriodLabelFromTitle(chartTitle);
}

export function trendPeriodChipLabels(
  chartTitle?: string,
  labels?: string[]
): {
  startLabel: string;
  latestLabel: string;
} {
  const period = resolveTrendPeriodLabel(chartTitle, labels);
  return {
    startLabel: `Start ${period}`,
    latestLabel: `Latest ${period}`,
  };
}

/** First and last chronologically ordered trend observations. */
export function resolveChronologicalTrendEndpoints(
  rows: ChartRow[]
): { start: ChartRow; latest: ChartRow } | null {
  const finite = rows.filter((r) => Number.isFinite(r.value));
  if (finite.length < 2) return null;

  const temporalCount = finite.filter(
    (r) => bucketLabelChronologicalSortKey(String(r.name ?? ""))[0] === 0
  ).length;

  if (temporalCount >= 2) {
    const sorted = sortChartRowsChronologically(finite);
    return {
      start: sorted[0]!,
      latest: sorted[sorted.length - 1]!,
    };
  }

  return {
    start: finite[0]!,
    latest: finite[finite.length - 1]!,
  };
}

function formatPercentChange(from: number, to: number): string | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  const pct = ((to - from) / Math.abs(from)) * 100;
  if (!Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

/** Period-over-period change; falls back to peak-vs-trough when labels are not temporal. */
export function computeTrendPeriodChangePercent(rows: ChartRow[]): string | null {
  const finite = rows.filter((r) => Number.isFinite(r.value));
  if (finite.length < 2) return null;

  const temporalCount = finite.filter(
    (r) => bucketLabelChronologicalSortKey(String(r.name ?? ""))[0] === 0
  ).length;

  if (temporalCount >= 2) {
    const sorted = sortChartRowsChronologically(finite);
    const firstVal = sorted[0]!.value;
    const lastVal = sorted[sorted.length - 1]!.value;
    const periodChange = formatPercentChange(firstVal, lastVal);
    if (periodChange) return periodChange;
  }

  let hi = finite[0]!;
  let lo = finite[0]!;
  for (const r of finite) {
    if (r.value > hi.value) hi = r;
    if (r.value < lo.value) lo = r;
  }
  return formatPercentChange(lo.value, hi.value);
}

/** Pearson r for paired finite x/y scatter observations. */
export function computePearsonCorrelation(
  xs: number[],
  ys: number[]
): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX <= 0 || denY <= 0) return null;
  const r = num / Math.sqrt(denX * denY);
  return Number.isFinite(r) ? r : null;
}

export function extractScatterXY(rows: ChartRow[]): {
  xs: number[];
  ys: number[];
} {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const row of rows) {
    const y = Number(row.value);
    const x = Number(row.x);
    if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

export function describeScatterRelationship(rows: ChartRow[]): string | null {
  const { xs, ys } = extractScatterXY(rows);
  const r = computePearsonCorrelation(xs, ys);
  if (r == null) return null;
  const abs = Math.abs(r);
  const strength =
    abs >= 0.7 ? "Strong" : abs >= 0.4 ? "Moderate" : "Weak";
  const direction = r >= 0 ? "Positive" : "Negative";
  return `${strength} ${direction}`;
}

function formatScatterAxisValue(
  value: number,
  axisLabel: string,
  baseCtx: MetricFormatContext
): string {
  return formatExecutiveMetricValue(
    { name: axisLabel, value },
    { ...baseCtx, metricLabel: axisLabel, chartTitle: axisLabel }
  );
}

function formatScatterInsightChips(
  rows: ChartRow[],
  hi: ChartRow,
  lo: ChartRow,
  opts: {
    chartTitle?: string;
    presentationKind?: ChartKind;
    xMetricLabel?: string;
    yMetricLabel?: string;
  }
): OverviewMiniInsightChip[] {
  const yLabel = polishMetricDisplay(opts.yMetricLabel?.trim() || "Y");
  const xLabel = polishMetricDisplay(opts.xMetricLabel?.trim() || "X");
  const yCtx: MetricFormatContext = {
    metricLabel: yLabel,
    chartTitle: opts.chartTitle ?? yLabel,
    presentationKind: "scatter",
  };
  const xCtx: MetricFormatContext = {
    metricLabel: xLabel,
    chartTitle: opts.chartTitle ?? xLabel,
    presentationKind: "scatter",
  };

  const hiY =
    typeof hi.value === "number" && Number.isFinite(hi.value)
      ? formatScatterAxisValue(hi.value, yLabel, yCtx)
      : "—";
  const loY =
    typeof lo.value === "number" && Number.isFinite(lo.value)
      ? formatScatterAxisValue(lo.value, yLabel, yCtx)
      : "—";
  const hiX =
    typeof hi.x === "number" && Number.isFinite(hi.x)
      ? formatScatterAxisValue(hi.x, xLabel, xCtx)
      : hi.displayX?.trim() || "—";
  const loX =
    typeof lo.x === "number" && Number.isFinite(lo.x)
      ? formatScatterAxisValue(lo.x, xLabel, xCtx)
      : lo.displayX?.trim() || "—";

  const gap =
    typeof hi.value === "number" && typeof lo.value === "number"
      ? hi.value - lo.value
      : NaN;
  const spreadDisp = Number.isFinite(gap)
    ? formatMetricSpreadGap(gap, {
        metricLabel: yLabel,
        chartTitle: opts.chartTitle ?? yLabel,
        presentationKind: "scatter",
      })
    : "—";

  const chips: OverviewMiniInsightChip[] = [
    {
      key: "top",
      text: `Highest ${yLabel}: ${xLabel} ${hiX}, ${yLabel} ${hiY}`,
    },
    {
      key: "lowest",
      text: `Lowest ${yLabel}: ${xLabel} ${loX}, ${yLabel} ${loY}`,
    },
    {
      key: "gap",
      text: `${yLabel} Spread: ${spreadDisp}`,
    },
  ];

  const relationship = describeScatterRelationship(rows);
  if (relationship) {
    chips.push({
      key: "relationship",
      text: `Relationship: ${relationship}`,
    });
  }

  return chips;
}

/** Structured insight pills for overview mini charts (avoids merged single-line text). */
export function formatOverviewMiniInsightChips(
  rows: ChartRow[],
  opts?: {
    chartTitle?: string;
    presentationKind?: ChartKind;
    isTrendChart?: boolean;
    isScatterChart?: boolean;
    xMetricLabel?: string;
    yMetricLabel?: string;
  }
): OverviewMiniInsightChip[] {
  if (rows.length < 2) return [];
  let hi = rows[0]!;
  let lo = rows[0]!;
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    if (r.value > hi.value) hi = r;
    if (r.value < lo.value) lo = r;
  }
  if (String(hi.name) === String(lo.name)) return [];

  const isScatter =
    opts?.isScatterChart === true || opts?.presentationKind === "scatter";
  if (
    isScatter &&
    (opts?.xMetricLabel?.trim() || opts?.yMetricLabel?.trim())
  ) {
    return formatScatterInsightChips(rows, hi, lo, opts);
  }

  const metricCtx: MetricFormatContext = {
    metricLabel: opts?.chartTitle,
    chartTitle: opts?.chartTitle,
    presentationKind: opts?.presentationKind,
    chartRows: rows,
  };
  const hiDisp = formatExecutiveMetricValue(hi, metricCtx);
  const loDisp = formatExecutiveMetricValue(lo, metricCtx);

  const isTrend =
    opts?.isTrendChart === true ||
    opts?.presentationKind === "line" ||
    opts?.presentationKind === "area";

  if (isTrend) {
    const labelNames = rows.map((r) => String(r.name ?? ""));
    const { startLabel, latestLabel } = trendPeriodChipLabels(
      opts?.chartTitle,
      labelNames
    );
    const endpoints = resolveChronologicalTrendEndpoints(rows);
    const startRow = endpoints?.start ?? lo;
    const latestRow = endpoints?.latest ?? hi;
    const startDisp = formatExecutiveMetricValue(startRow, metricCtx);
    const latestDisp = formatExecutiveMetricValue(latestRow, metricCtx);
    const change = computeTrendPeriodChangePercent(rows);
    const gap =
      typeof startRow.value === "number" && typeof latestRow.value === "number"
        ? latestRow.value - startRow.value
        : NaN;
    const gapDisp = Number.isFinite(gap)
      ? formatMetricSpreadGap(gap, {
          metricLabel: opts?.chartTitle,
          chartTitle: opts?.chartTitle,
          presentationKind: opts?.presentationKind,
        })
      : "—";
    const gapChip: OverviewMiniInsightChip = change
      ? { key: "gap", text: `Change: ${change}` }
      : { key: "gap", text: `Gap: ${gapDisp}` };
    if (metricFormatUsesPercent(metricCtx)) {
      gapChip.title = percentGapChipAriaLabel(opts?.chartTitle);
    }
    return [
      {
        key: "top",
        text: `${startLabel}: ${String(startRow.name)} (${startDisp})`,
      },
      {
        key: "lowest",
        text: `${latestLabel}: ${String(latestRow.name)} (${latestDisp})`,
      },
      gapChip,
    ];
  }

  const gap =
    typeof hi.value === "number" && typeof lo.value === "number"
      ? hi.value - lo.value
      : NaN;
  const gapDisp = Number.isFinite(gap)
    ? formatMetricSpreadGap(gap, {
        metricLabel: opts?.chartTitle,
        chartTitle: opts?.chartTitle,
        presentationKind: opts?.presentationKind,
      })
    : "—";
  const gapChip: OverviewMiniInsightChip = {
    key: "gap",
    text: `Gap: ${gapDisp}`,
  };
  if (metricFormatUsesPercent(metricCtx)) {
    gapChip.title = percentGapChipAriaLabel(opts?.chartTitle);
  }
  return [
    { key: "top", text: `Top: ${String(hi.name)} (${hiDisp})` },
    { key: "lowest", text: `Lowest: ${String(lo.name)} (${loDisp})` },
    gapChip,
  ];
}
