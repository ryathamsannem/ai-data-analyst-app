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

function capitalizePhraseStart(phrase: string): string {
  const s = phrase.trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMetricByDimensionTitle(metric: string, dimension: string): string {
  return `${capitalizePhraseStart(polishMetricDisplay(metric))} by ${polishMetricDisplay(dimension)}`;
}

/**
 * Generic cleanup for auto-dashboard titles (no dataset-specific strings).
 * Examples: "Total Top region by revenue" → "Revenue by region";
 * "Category distribution · department" → "Department distribution".
 */
export function polishAutoDashboardChartTitle(raw: string): string {
  const t = raw.trim();
  if (!t) return "Chart";

  const categoryDist = t.match(
    /^category\s+distribution\s*[·•\-|]\s*(.+)$/i
  );
  if (categoryDist) {
    return `${capitalizePhraseStart(polishMetricDisplay(categoryDist[1].trim()))} distribution`;
  }

  const topBy = t.match(/^total\s+top\s+(.+?)\s+by\s+(.+)$/i);
  if (topBy) {
    return formatMetricByDimensionTitle(topBy[2].trim(), topBy[1].trim());
  }

  const rankingTopBy = t.match(/^top\s+(.+?)\s+by\s+(.+)$/i);
  if (rankingTopBy) {
    return formatMetricByDimensionTitle(
      rankingTopBy[2].trim(),
      rankingTopBy[1].trim()
    );
  }

  const trendParen = t.match(/^(.+?)\s+trend\s*\(([^)]+)\)\s*$/i);
  if (trendParen) {
    const grain = trendParen[2].trim();
    const metric = trendParen[1]
      .trim()
      .replace(/^(monthly|weekly|daily|quarterly|yearly|hourly)\s+/i, "")
      .replace(/^total\s+/i, "");
    const grainCap =
      grain.charAt(0).toUpperCase() + grain.slice(1).toLowerCase();
    const metricCap = capitalizePhraseStart(polishMetricDisplay(metric));
    return `${grainCap} ${metricCap} Trend`;
  }

  const byIdx = t.toLowerCase().indexOf(" by ");
  if (byIdx > 0) {
    const left = t
      .slice(0, byIdx)
      .trim()
      .replace(/^(total|sum|average|mean|maximum|max|minimum|min|count of)\s+/i, "");
    const right = t.slice(byIdx + 4).trim();
    if (left && right) {
      return formatMetricByDimensionTitle(left, right);
    }
  }

  return capitalizePhraseStart(polishMetricDisplay(t));
}

/** Canonical title — prefers frozen contract, else derives from chart spec. */
export function getCanonicalChartTitle(spec: CanonicalChartSpec): string {
  const frozen = spec.contract?.displayTitle?.trim() || spec.contract?.title?.trim();
  if (frozen) return polishAutoDashboardChartTitle(frozen);

  const raw = spec.rawTitle?.trim();
  if (!raw) return "Chart";

  const rows = rowsFromSpec(spec);
  if (!rows.length) {
    return polishAutoDashboardChartTitle(polishMetricDisplay(raw));
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
  return polishAutoDashboardChartTitle(ephemeral.displayTitle);
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
