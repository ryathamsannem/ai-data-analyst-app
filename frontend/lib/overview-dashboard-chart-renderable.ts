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

function chartTypeLower(chart: OverviewDashboardChartLike): string {
  return String(chart.chartType ?? "").trim().toLowerCase();
}

function chartTitleLower(chart: OverviewDashboardChartLike): string {
  return String(chart.title ?? "").trim().toLowerCase();
}

function dimensionFromTitle(title: string): string | null {
  const m = title.match(/\sby\s+(.+)$/i);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

function metricStrengthFromTitle(title: string): number {
  const t = title.toLowerCase();
  if (/\b(sales|revenue|profit|margin|loan balance|spend|deposit balance|delinquency|utilization)\b/.test(t)) {
    return 100;
  }
  if (/\b(account age|age months|tenure|vintage)\b/.test(t)) return 22;
  if (/\b(quantity|units|qty)\b/.test(t)) return 40;
  if (/\b(delivery|shipping|discount|rating)\b/.test(t)) return 35;
  return 50;
}

function isLifecycleOverviewTitle(title: string): boolean {
  return /\b(account age|age months|tenure|vintage)\b/i.test(title);
}

function isBankingRiskMetricTitle(title: string): boolean {
  return /\b(delinquency|utilization|credit score)\b/i.test(title);
}

function isGeographicDimensionTitle(dim: string): boolean {
  return /\b(city|cities|region|state|country|province)\b/i.test(dim);
}

function isBankingBusinessDimensionTitle(dim: string): boolean {
  return /\b(customer segment|product type|segment|product)\b/i.test(dim);
}

/**
 * Overview-only chart list: demote scatter and quantity breakdowns when stronger
 * business charts are available. Does not affect Charts tab or AI Insights payloads.
 */
export function filterOverviewAutoDashboardCharts<
  T extends OverviewDashboardChartLike,
>(charts: T[]): T[] {
  const renderable = filterOverviewRenderableCharts(charts);
  if (renderable.length === 0) return renderable;

  const withoutScatter = renderable.filter((c) => chartTypeLower(c) !== "scatter");
  let working =
    withoutScatter.length >= 4 ? withoutScatter : renderable;

  const dimBestStrength = new Map<string, number>();
  for (const chart of working) {
    const dim = dimensionFromTitle(chartTitleLower(chart));
    if (!dim) continue;
    const strength = metricStrengthFromTitle(chartTitleLower(chart));
    dimBestStrength.set(dim, Math.max(dimBestStrength.get(dim) ?? 0, strength));
  }

  working = working.filter((chart) => {
    const title = chartTitleLower(chart);
    const dim = dimensionFromTitle(title);
    if (!dim) return true;
    const strength = metricStrengthFromTitle(title);
    const best = dimBestStrength.get(dim) ?? strength;
    if (strength <= 45 && best >= 80 && best - strength >= 20) {
      return false;
    }
    return true;
  });

  const hasStrongBusiness = working.some(
    (c) => metricStrengthFromTitle(chartTitleLower(c)) >= 80
  );
  if (hasStrongBusiness) {
    working = working.filter((c) => !isLifecycleOverviewTitle(chartTitleLower(c)));
  }

  const hasBusinessDimensions = working.some((c) => {
    const dim = dimensionFromTitle(chartTitleLower(c));
    return dim != null && isBankingBusinessDimensionTitle(dim);
  });
  if (hasBusinessDimensions) {
    working = working.filter((c) => {
      const title = chartTitleLower(c);
      const dim = dimensionFromTitle(title);
      if (!dim || !isGeographicDimensionTitle(dim)) return true;
      return !isBankingRiskMetricTitle(title);
    });
  }

  return working;
}
