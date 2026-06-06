/**
 * Single authoritative Pearson r for relationship scatter — same (x, y) as the chart.
 */

import {
  formatPearsonCoefficient,
  pearsonCorrelationFromRows,
  type RelationshipScatterRow,
} from "@/lib/relationship-visualization";

export type RelationshipCorrelationSource = "chart_rows" | "api" | "none";

export type RelationshipCorrelationSnapshot = {
  xValues: number[];
  yValues: number[];
  rowCount: number;
  pearson: number | null;
  pearsonRounded: number | null;
  display: string;
  badgeLabel: string | null;
  computed: boolean;
  source: RelationshipCorrelationSource;
};

export const CORRELATION_UNAVAILABLE_LABEL = "Unable to compute correlation";

/** Avoid Number(null) === 0 — only accept real numeric coefficients. */
export function parseNumericCoefficient(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function chartRowsToScatterPairs(
  rows: Array<{ x?: number; value: number }>
): RelationshipScatterRow[] {
  return rows.map((r) => ({
    x:
      typeof r.x === "number" && Number.isFinite(r.x) ? r.x : undefined,
    value: r.value,
  }));
}

/**
 * Pearson r from the same paired arrays the scatter plot uses.
 * Chart rows win over API metadata when both are present.
 */
export function buildRelationshipCorrelationSnapshot(args: {
  chartRows: RelationshipScatterRow[];
  apiPearson?: unknown;
  logContext?: string;
}): RelationshipCorrelationSnapshot {
  const paired = args.chartRows.filter(
    (r) =>
      typeof r.x === "number" &&
      Number.isFinite(r.x) &&
      Number.isFinite(r.value)
  );
  const xValues = paired.map((r) => r.x as number);
  const yValues = paired.map((r) => r.value);
  const rowCount = paired.length;

  const fromRows = pearsonCorrelationFromRows(args.chartRows);
  const fromApi = parseNumericCoefficient(args.apiPearson);

  let pearson: number | null = null;
  let source: RelationshipCorrelationSource = "none";

  if (fromRows != null) {
    pearson = fromRows;
    source = "chart_rows";
  } else if (fromApi != null) {
    pearson = fromApi;
    source = "api";
  }

  const pearsonRounded =
    pearson != null ? Math.round(pearson * 100) / 100 : null;
  const computed = pearsonRounded != null;
  const display = computed
    ? formatPearsonCoefficient(pearsonRounded)
    : CORRELATION_UNAVAILABLE_LABEL;
  const badgeLabel = computed ? `Correlation ${display}` : null;

  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_AI_INSIGHTS_DEBUG === "true" &&
    args.logContext
  ) {
    console.info("[relationship-correlation]", {
      question: args.logContext,
      xValues,
      yValues,
      rowCount,
      computedCorrelation: pearson,
      pearsonRounded,
      source,
      apiPearson: fromApi,
      fromRows,
    });
  }

  return {
    xValues,
    yValues,
    rowCount,
    pearson,
    pearsonRounded,
    display,
    badgeLabel,
    computed,
    source,
  };
}

