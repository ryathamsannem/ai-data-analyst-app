/** Minimal auto-dashboard chart shape for renderability checks. */
export type OverviewDashboardChartLike = {
  title?: string;
  chartType?: string;
  labels: string[];
  values: number[];
};

/** True when at least one label/value pair has a finite numeric value. */
export function overviewChartHasRenderableData(
  chart: OverviewDashboardChartLike
): boolean {
  const labels = chart.labels ?? [];
  const values = chart.values ?? [];
  const n = Math.min(labels.length, values.length);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

/** Drop charts that would render an empty grid cell (no plot body). */
export function filterOverviewRenderableCharts<
  T extends OverviewDashboardChartLike,
>(charts: T[]): T[] {
  return charts.filter(overviewChartHasRenderableData);
}
