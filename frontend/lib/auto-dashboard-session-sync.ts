/**
 * Auto-dashboard mini chart → session snapshot sync (Charts tab / AI Insights parity with Overview).
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import { formatExecutiveInsightMetricValue } from "@/lib/overview-dashboard-export";
import { chartKindToApiChartType } from "@/lib/final-chart-presentation";

export type AutoDashboardMiniLike = {
  title: string;
  chartType: string;
  labels: string[];
  values: number[];
  scatterXValues?: number[];
  scatterXFormatted?: string[];
  scatterXLabel?: string;
  scatterYLabel?: string;
  xColumn?: string;
  yColumn?: string;
  xMetricLabel?: string;
  yMetricLabel?: string;
  metricColumn?: string;
};

export function normalizeAutoDashboardChartKind(raw: string): ChartKind {
  const c = raw.toLowerCase().replace(/\s+/g, "");
  if (c === "horizontalbar" || c === "bar_horizontal" || c === "horizontal_bar")
    return "bar_horizontal";
  if (c === "line") return "line";
  if (c === "area") return "area";
  if (c === "scatter") return "scatter";
  if (c === "histogram") return "histogram";
  if (c === "pie") return "pie";
  if (c === "donut") return "donut";
  return "bar";
}

export function isScatterMiniChart(mini: AutoDashboardMiniLike): boolean {
  return normalizeAutoDashboardChartKind(mini.chartType) === "scatter";
}

export function resolveScatterAxisLabels(mini: AutoDashboardMiniLike): {
  scatterXLabel: string;
  scatterYLabel: string;
  xColumn: string | null;
  yColumn: string | null;
} {
  const scatterXLabel =
    mini.scatterXLabel?.trim() ||
    mini.xMetricLabel?.trim() ||
    mini.xColumn?.trim() ||
    "";
  const scatterYLabel =
    mini.scatterYLabel?.trim() ||
    mini.yMetricLabel?.trim() ||
    mini.yColumn?.trim() ||
    mini.metricColumn?.trim() ||
    "";
  return {
    scatterXLabel,
    scatterYLabel,
    xColumn: mini.xColumn?.trim() || null,
    yColumn: mini.yColumn?.trim() || mini.metricColumn?.trim() || null,
  };
}

export function buildRowsFromAutoDashboardMini(
  mini: AutoDashboardMiniLike,
  kindOverride?: ChartKind
): ChartRow[] {
  const chartKind = kindOverride ?? normalizeAutoDashboardChartKind(mini.chartType);
  const scatter = chartKind === "scatter";
  const cap = Math.min(mini.labels.length, mini.values.length);
  const baseRows: ChartRow[] = [];
  for (let i = 0; i < cap; i++) {
    const v = mini.values[i];
    if (!Number.isFinite(v)) continue;
    const row: ChartRow = {
      name: mini.labels[i] || "—",
      value: v,
    };
    if (scatter) {
      const xVal = mini.scatterXValues?.[i];
      if (typeof xVal === "number" && Number.isFinite(xVal)) {
        row.x = xVal;
        const xfmt = mini.scatterXFormatted?.[i]?.trim();
        if (xfmt) row.displayX = xfmt;
      }
    }
    baseRows.push(row);
  }
  const dispKind: ChartKind =
    chartKind === "donut"
      ? "pie"
      : chartKind === "bar_horizontal"
        ? "bar_horizontal"
        : chartKind === "histogram"
          ? "histogram"
          : scatter
            ? "scatter"
            : "bar";
  const metricCtx = {
    metricLabel: mini.title,
    chartTitle: mini.title,
    presentationKind: dispKind,
    chartRows: baseRows,
  };
  const rows = baseRows.map((row) => ({
    ...row,
    displayValue: formatExecutiveInsightMetricValue(row, metricCtx),
  }));
  if (scatter) {
    return rows.filter((r) => typeof r.x === "number" && Number.isFinite(r.x));
  }
  return rows;
}

export function buildStubVizFromAutoDashboardMini(
  mini: AutoDashboardMiniLike,
  chartKind: ChartKind,
  rows: ChartRow[]
): Record<string, unknown> {
  const scatter = chartKind === "scatter";
  const axis = scatter ? resolveScatterAxisLabels(mini) : null;
  const scatterX = scatter
    ? rows.map((r) => (typeof r.x === "number" ? r.x : Number.NaN))
    : undefined;
  const scatterXDisplay = scatter
    ? rows.map((r) => r.displayX?.trim() ?? "")
    : undefined;

  return {
    chartType: chartKindToApiChartType(chartKind),
    title: mini.title.trim(),
    subtitle: "Auto dashboard",
    labels: rows.map((r) => r.name),
    values: rows.map((r) => r.value),
    formattedValues: rows.map((r) => r.displayValue ?? ""),
    scatterXLabel: axis?.scatterXLabel || undefined,
    scatterYLabel: axis?.scatterYLabel || undefined,
    scatterX,
    scatterXDisplay,
    provenance: scatter
      ? {
          numericColumn: axis?.yColumn ?? mini.metricColumn ?? null,
          categoryColumn: axis?.xColumn ?? null,
          aggregation: "relationship",
        }
      : null,
    multiSeries: null,
    partialVisualizationWarning: null,
    interaction: null,
  };
}

export function autoDashboardChartRowsEqual(a: ChartRow[], b: ChartRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      String(row.name ?? "") === String(b[i]?.name ?? "") &&
      Number(row.value) === Number(b[i]?.value) &&
      Number(row.x ?? Number.NaN) === Number(b[i]?.x ?? Number.NaN)
  );
}
