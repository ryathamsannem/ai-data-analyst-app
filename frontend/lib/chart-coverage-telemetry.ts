/** Backend auto-dashboard coverage telemetry payload (dev diagnostics). */
export type DashboardCoverageTelemetry = {
  maxCharts?: number;
  selectedCount?: number;
  discoveredCount?: number;
  mergedCandidateCount?: number;
  bucketsFilled?: string[];
  bucketsMissing?: string[];
  bucketsInDiscovery?: string[];
  chartTypesSelected?: string[];
  inventoryRichness?: {
    dates?: number;
    numerics?: number;
    categories?: number;
    geographic?: number;
  };
};

export function parseDashboardCoverageTelemetry(
  raw: unknown
): DashboardCoverageTelemetry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const invRaw = o.inventoryRichness;
  let inventoryRichness: DashboardCoverageTelemetry["inventoryRichness"];
  if (invRaw && typeof invRaw === "object") {
    const inv = invRaw as Record<string, unknown>;
    inventoryRichness = {
      dates: typeof inv.dates === "number" ? inv.dates : undefined,
      numerics: typeof inv.numerics === "number" ? inv.numerics : undefined,
      categories:
        typeof inv.categories === "number" ? inv.categories : undefined,
      geographic:
        typeof inv.geographic === "number" ? inv.geographic : undefined,
    };
  }
  const strArr = (key: string): string[] | undefined => {
    const v = o[key];
    if (!Array.isArray(v)) return undefined;
    return v.filter((x): x is string => typeof x === "string");
  };
  return {
    maxCharts: typeof o.maxCharts === "number" ? o.maxCharts : undefined,
    selectedCount:
      typeof o.selectedCount === "number" ? o.selectedCount : undefined,
    discoveredCount:
      typeof o.discoveredCount === "number" ? o.discoveredCount : undefined,
    mergedCandidateCount:
      typeof o.mergedCandidateCount === "number"
        ? o.mergedCandidateCount
        : undefined,
    bucketsFilled: strArr("bucketsFilled"),
    bucketsMissing: strArr("bucketsMissing"),
    bucketsInDiscovery: strArr("bucketsInDiscovery"),
    chartTypesSelected: strArr("chartTypesSelected"),
    inventoryRichness,
  };
}

/** Dev-only console log when `NEXT_PUBLIC_CHART_COVERAGE_DEBUG=true`. */
export function logDashboardCoverageTelemetry(
  payload: DashboardCoverageTelemetry | null | undefined,
  context?: { source?: string }
): void {
  if (process.env.NEXT_PUBLIC_CHART_COVERAGE_DEBUG !== "true") return;
  if (!payload) return;
  const source = context?.source?.trim();
  console.info(
    `[chart-coverage${source ? `:${source}` : ""}]`,
    {
      selected: payload.selectedCount,
      max: payload.maxCharts,
      filled: payload.bucketsFilled,
      missing: payload.bucketsMissing,
      discovery: payload.bucketsInDiscovery,
      types: payload.chartTypesSelected,
      inventory: payload.inventoryRichness,
    }
  );
}
