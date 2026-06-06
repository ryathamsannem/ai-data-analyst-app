/**
 * RoutingPlan — frontend mirror of backend routing backbone (Phase A).
 */

export type RoutingPlanPayload = {
  intent: string;
  executiveLens?: string | null;
  metricColumn?: string | null;
  metricDisplay?: string | null;
  dimensionColumn?: string | null;
  dimensionDisplay?: string | null;
  aggregation?: string | null;
  aggregationKey?: string | null;
  chartType?: string | null;
  chartTypeInternal?: string | null;
  chartSelectionReason?: string | null;
  confidence?: number | null;
  capabilityNotes?: string[];
  unsupportedReason?: string | null;
};

export function parseRoutingPlan(raw: unknown): RoutingPlanPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const intent = typeof o.intent === "string" ? o.intent.trim() : "";
  if (!intent) return null;
  return {
    intent,
    executiveLens:
      typeof o.executiveLens === "string" ? o.executiveLens.trim() || null : null,
    metricColumn:
      typeof o.metricColumn === "string" ? o.metricColumn.trim() || null : null,
    metricDisplay:
      typeof o.metricDisplay === "string" ? o.metricDisplay.trim() || null : null,
    dimensionColumn:
      typeof o.dimensionColumn === "string"
        ? o.dimensionColumn.trim() || null
        : null,
    dimensionDisplay:
      typeof o.dimensionDisplay === "string"
        ? o.dimensionDisplay.trim() || null
        : null,
    aggregation:
      typeof o.aggregation === "string" ? o.aggregation.trim() || null : null,
    aggregationKey:
      typeof o.aggregationKey === "string" ? o.aggregationKey.trim() || null : null,
    chartType: typeof o.chartType === "string" ? o.chartType.trim() || null : null,
    chartTypeInternal:
      typeof o.chartTypeInternal === "string"
        ? o.chartTypeInternal.trim() || null
        : null,
    chartSelectionReason:
      typeof o.chartSelectionReason === "string"
        ? o.chartSelectionReason.trim() || null
        : null,
    confidence:
      typeof o.confidence === "number" && Number.isFinite(o.confidence)
        ? o.confidence
        : null,
    capabilityNotes: Array.isArray(o.capabilityNotes)
      ? (o.capabilityNotes as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
      : undefined,
    unsupportedReason:
      typeof o.unsupportedReason === "string"
        ? o.unsupportedReason.trim() || null
        : null,
  };
}

/** Follow-up lens: prefer RoutingPlan over legacy executiveLens field. */
export function followUpLensFromRouting(
  plan: RoutingPlanPayload | null | undefined,
  legacyExecutiveLens?: string | null
): string | null {
  if (!plan) return legacyExecutiveLens?.trim() || null;
  if (plan.executiveLens?.trim()) return plan.executiveLens.trim().toLowerCase();
  const intent = plan.intent.trim().toLowerCase();
  if (intent === "profitability") return "loss";
  if (intent === "outlier") return "standout";
  if (intent === "executive" && plan.executiveLens) {
    return plan.executiveLens.trim().toLowerCase();
  }
  return legacyExecutiveLens?.trim() || null;
}
