/**
 * Phase 2 — read-only parsing and logging for `analysis.intent` (debug only).
 * Does not drive chart, card, or answer behavior.
 */

/** Flip to false to hide Intent Engine Debug UI and console logs. */
export const SHOW_INTENT_DEBUG = true;

export type AnalysisIntentMetric = {
  kind?: string | null;
  columnKey?: string | null;
  displayLabel?: string | null;
  aggregation?: { key?: string | null; label?: string | null };
  requestedMetrics?: string[];
  requestedMetricColumns?: Record<string, string | null>;
};

export type AnalysisIntentDimension = {
  columnKey?: string | null;
  displayLabel?: string | null;
  secondaryColumnKey?: string | null;
  resolvedVia?: string | null;
};

export type AnalysisIntentSupport = {
  supported?: boolean;
  reasonCodes?: string[];
  growth?: Record<string, unknown> | null;
  trend?: Record<string, unknown> | null;
  margin?: Record<string, unknown> | null;
  decline?: Record<string, unknown> | null;
  multiMetric?: Record<string, unknown> | null;
};

export type AnalysisIntentDerivedCandidate = {
  id?: string | null;
  computable?: boolean;
  operands?: Record<string, unknown>;
  formulaDescription?: string | null;
  unavailableReason?: string | null;
};

export type AnalysisIntentPayload = {
  version?: number;
  question?: string;
  normalizedQuestion?: string;
  primaryGoal?: string;
  metric?: AnalysisIntentMetric;
  dimension?: AnalysisIntentDimension;
  chart?: {
    routingBucket?: string;
    legacyRoutingBucket?: string;
    recommendedInternalType?: string;
  };
  support?: AnalysisIntentSupport;
  derivedMetricCandidate?: AnalysisIntentDerivedCandidate | null;
  tags?: string[];
  flags?: Record<string, unknown>;
  requestedMetrics?: string[];
  requestedMetricColumns?: Record<string, string | null>;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function parseMetric(raw: unknown): AnalysisIntentMetric | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  const agg = asRecord(o.aggregation);
  const reqCols = asRecord(o.requestedMetricColumns);
  const colMap: Record<string, string | null> | undefined = reqCols
    ? Object.fromEntries(
        Object.entries(reqCols).map(([k, v]) => [
          k,
          typeof v === "string" ? v : v == null ? null : String(v),
        ])
      )
    : undefined;
  return {
    kind: typeof o.kind === "string" ? o.kind : null,
    columnKey: typeof o.columnKey === "string" ? o.columnKey : null,
    displayLabel: typeof o.displayLabel === "string" ? o.displayLabel : null,
    aggregation: agg
      ? {
          key: typeof agg.key === "string" ? agg.key : null,
          label: typeof agg.label === "string" ? agg.label : null,
        }
      : undefined,
    requestedMetrics: Array.isArray(o.requestedMetrics)
      ? o.requestedMetrics.map(String)
      : undefined,
    requestedMetricColumns: colMap,
  };
}

function parseDimension(raw: unknown): AnalysisIntentDimension | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  return {
    columnKey: typeof o.columnKey === "string" ? o.columnKey : null,
    displayLabel: typeof o.displayLabel === "string" ? o.displayLabel : null,
    secondaryColumnKey:
      typeof o.secondaryColumnKey === "string" ? o.secondaryColumnKey : null,
    resolvedVia: typeof o.resolvedVia === "string" ? o.resolvedVia : null,
  };
}

function parseSupport(raw: unknown): AnalysisIntentSupport | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  return {
    supported: typeof o.supported === "boolean" ? o.supported : undefined,
    reasonCodes: Array.isArray(o.reasonCodes)
      ? o.reasonCodes.map(String).filter(Boolean)
      : [],
    growth: asRecord(o.growth),
    trend: asRecord(o.trend),
    margin: asRecord(o.margin),
    decline: asRecord(o.decline),
    multiMetric: asRecord(o.multiMetric),
  };
}

function parseDerived(raw: unknown): AnalysisIntentDerivedCandidate | null {
  if (raw == null) return null;
  const o = asRecord(raw);
  if (!o) return null;
  const ops = asRecord(o.operands);
  return {
    id: typeof o.id === "string" ? o.id : null,
    computable: typeof o.computable === "boolean" ? o.computable : undefined,
    operands: ops ?? undefined,
    formulaDescription:
      typeof o.formulaDescription === "string" ? o.formulaDescription : null,
    unavailableReason:
      typeof o.unavailableReason === "string" ? o.unavailableReason : null,
  };
}

/** Null-safe parse of `analysis.intent` from `/ask`. */
export function parseAnalysisIntent(raw: unknown): AnalysisIntentPayload | null {
  const o = asRecord(raw);
  if (!o) return null;
  const chart = asRecord(o.chart);
  const reqCols = asRecord(o.requestedMetricColumns);
  return {
    version: Number.isFinite(Number(o.version)) ? Number(o.version) : undefined,
    question: typeof o.question === "string" ? o.question : undefined,
    normalizedQuestion:
      typeof o.normalizedQuestion === "string" ? o.normalizedQuestion : undefined,
    primaryGoal: typeof o.primaryGoal === "string" ? o.primaryGoal : undefined,
    metric: parseMetric(o.metric),
    dimension: parseDimension(o.dimension),
    chart: chart
      ? {
          routingBucket:
            typeof chart.routingBucket === "string" ? chart.routingBucket : undefined,
          legacyRoutingBucket:
            typeof chart.legacyRoutingBucket === "string"
              ? chart.legacyRoutingBucket
              : undefined,
          recommendedInternalType:
            typeof chart.recommendedInternalType === "string"
              ? chart.recommendedInternalType
              : undefined,
        }
      : undefined,
    support: parseSupport(o.support),
    derivedMetricCandidate: parseDerived(o.derivedMetricCandidate),
    tags: Array.isArray(o.tags) ? o.tags.map(String) : undefined,
    flags: asRecord(o.flags) ?? undefined,
    requestedMetrics: Array.isArray(o.requestedMetrics)
      ? o.requestedMetrics.map(String)
      : undefined,
    requestedMetricColumns: reqCols
      ? Object.fromEntries(
          Object.entries(reqCols).map(([k, v]) => [
            k,
            typeof v === "string" ? v : v == null ? null : String(v),
          ])
        )
      : undefined,
  };
}

export function formatIntentMetricLabel(intent: AnalysisIntentPayload | null): string {
  const m = intent?.metric;
  if (!m) return "—";
  const label = m.displayLabel?.trim() || m.columnKey?.trim() || "—";
  const col = m.columnKey?.trim();
  if (col && label.toLowerCase() !== col.toLowerCase()) {
    return `${label} (${col})`;
  }
  return label;
}

export function formatIntentDimensionLabel(intent: AnalysisIntentPayload | null): string {
  const d = intent?.dimension;
  if (!d) return "—";
  const label = d.displayLabel?.trim() || d.columnKey?.trim() || "—";
  const col = d.columnKey?.trim();
  if (col && label.toLowerCase() !== col.toLowerCase()) {
    return `${label} (${col})`;
  }
  return label;
}

export function requestedMetricsList(intent: AnalysisIntentPayload | null): string[] {
  if (!intent) return [];
  const top = intent.requestedMetrics ?? [];
  if (top.length) return top;
  const fromMetric = intent.metric?.requestedMetrics ?? [];
  return fromMetric.length ? fromMetric : [];
}

/** Console log after each successful `/ask` (debug only). */
export function logAnalysisIntentToConsole(
  question: string,
  intent: AnalysisIntentPayload | null | undefined
): void {
  if (!SHOW_INTENT_DEBUG) return;
  const i = intent ?? null;
  const support = i?.support;
  const derived = i?.derivedMetricCandidate;
  console.info("[intent_engine][frontend]", {
    question,
    primaryGoal: i?.primaryGoal ?? null,
    metric: formatIntentMetricLabel(i),
    dimension: formatIntentDimensionLabel(i),
    requestedMetrics: requestedMetricsList(i),
    supportSupported: support?.supported ?? null,
    supportReasonCodes: support?.reasonCodes ?? [],
    derivedMetricCandidateId: derived?.id ?? null,
  });
}
