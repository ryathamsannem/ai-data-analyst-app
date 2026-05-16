/**
 * Single canonical display title for a chart across Overview, Charts, AI, and PDF.
 */

import type { ChartRow } from "@/app/chart-types";
import { polishMetricDisplay } from "@/lib/analytics-metadata";
import {
  formatAggregationLabel,
  normalizeAggregationKey,
} from "@/lib/semantic-metric-engine";
import {
  freezeVisualizationContract,
  type VisualizationContract,
} from "@/lib/selected-visualization";

export type CanonicalChartSpec = {
  rawTitle: string;
  chartType?: string;
  aggregationKey?: string;
  labels?: string[];
  values?: number[];
  contract?: VisualizationContract | null;
};

function rowsFromSpec(spec: CanonicalChartSpec): ChartRow[] {
  const labels = spec.labels ?? [];
  const values = spec.values ?? [];
  const cap = Math.min(labels.length, values.length);
  const rows: ChartRow[] = [];
  for (let i = 0; i < cap; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    rows.push({ name: labels[i] || "—", value: v });
  }
  return rows;
}

/** Canonical title — prefers frozen contract, else derives from chart spec. */
export function getCanonicalChartTitle(spec: CanonicalChartSpec): string {
  const frozen = spec.contract?.displayTitle?.trim() || spec.contract?.title?.trim();
  if (frozen) return frozen;

  const raw = spec.rawTitle?.trim();
  if (!raw) return "Chart";

  const rows = rowsFromSpec(spec);
  if (!rows.length) {
    return polishMetricDisplay(raw);
  }

  const ephemeral = freezeVisualizationContract({
    id: "__canonical__",
    source: "overview",
    title: raw,
    apiChartType: spec.chartType ?? "bar",
    labels: rows.map((r) => String(r.name ?? "")),
    values: rows.map((r) => r.value),
    rows,
    aggregationKey: spec.aggregationKey ?? "sum",
  });
  return ephemeral.displayTitle;
}

export function aggregationPrefixLabel(aggregationKey: string): string {
  const k = normalizeAggregationKey(aggregationKey, "sum");
  if (k === "mean") return "Average";
  if (k === "count") return "Count of";
  if (k === "max") return "Maximum";
  if (k === "min") return "Minimum";
  return formatAggregationLabel(k);
}

export function metricStemFromRawTitle(title: string): string {
  const stem = title
    .replace(/\s+trend\s*\([^)]*\)\s*$/i, "")
    .replace(/\s+over\s+time\s*$/i, "")
    .trim();
  const byIdx = stem.toLowerCase().indexOf(" by ");
  const left = byIdx > 0 ? stem.slice(0, byIdx).trim() : stem;
  return polishMetricDisplay(
    left.replace(
      /^(total|sum|average|mean|maximum|max|minimum|min|count of)\s+/i,
      ""
    )
  );
}

export function trendGrainFromTitle(title: string): string {
  const paren = title.match(/\(([^)]+)\)\s*$/);
  if (paren) return paren[1].trim().toLowerCase();
  if (/\bweekly\b/i.test(title)) return "weekly";
  if (/\bmonthly\b/i.test(title)) return "monthly";
  if (/\bdaily\b/i.test(title)) return "daily";
  return "weekly";
}
