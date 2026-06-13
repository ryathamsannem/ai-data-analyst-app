/**
 * Single canonical display title for a chart across Overview, Charts, AI, and PDF.
 */

import type { ChartRow } from "@/app/chart-types";
import {
  humanizeColumnName,
  polishMetricDisplay,
  stripIntentNoiseFromMetricLabel,
} from "@/lib/analytics-metadata";
import { resolveTrendBucketLabel } from "@/lib/chart-semantic-metadata";
import { sanitizeExecutiveMeasureLabel } from "@/lib/insight-card-titles";
import {
  formatAggregationLabel,
  normalizeAggregationKey,
} from "@/lib/semantic-metric-engine";
import {
  freezeVisualizationContract,
  isTrendMode,
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

const CANONICAL_TIME_TOKENS = new Set([
  "monthly",
  "weekly",
  "daily",
  "quarterly",
  "yearly",
  "hourly",
  "period",
  "minute",
]);
const CANONICAL_SUFFIX_TOKENS = new Set(["trend"]);
const CANONICAL_AGG_TOKENS = new Set(["total", "average", "avg", "mean"]);
const TITLE_PARTICLES = new Set(["by", "vs", "and", "or", "of", "per"]);
const EXECUTIVE_TREND_TITLE_RE =
  /^(monthly|weekly|daily|quarterly|yearly|hourly)\s+.+\btrend\s*$/i;

/** Strip duplicated semantic tokens (Monthly Monthly, Trend Trend, by X by X). */
export function normalizeCanonicalChartTitle(title: string): string {
  const s = String(title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";

  const words = s.split(" ");
  const out: string[] = [];
  const seenTime = { v: false };
  const seenTrend = { v: false };
  const seenAgg = new Set<string>();

  for (const w of words) {
    const wl = w.toLowerCase();
    if (CANONICAL_TIME_TOKENS.has(wl)) {
      if (seenTime.v) continue;
      seenTime.v = true;
    } else if (CANONICAL_SUFFIX_TOKENS.has(wl)) {
      if (seenTrend.v) continue;
      seenTrend.v = true;
    } else if (CANONICAL_AGG_TOKENS.has(wl)) {
      if (seenAgg.has(wl)) continue;
      seenAgg.add(wl);
    } else if (out.length > 0 && out[out.length - 1]!.toLowerCase() === wl) {
      continue;
    }
    out.push(w);
  }

  let joined = out.join(" ");
  const byMatch = joined.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    const left = byMatch[1]!.trim();
    let right = byMatch[2]!.trim();
    const rightParts = right.split(/\s+by\s+/i).map((p) => p.trim());
    if (rightParts.length >= 2) {
      const base = rightParts[0]!;
      if (rightParts.every((p) => p.toLowerCase() === base.toLowerCase())) {
        right = base;
      }
    }
    joined = right.toLowerCase() === left.toLowerCase() ? left : `${left} by ${right}`;
  }

  return formatExecutiveChartTitle(joined);
}

function titleCaseWords(phrase: string): string {
  return phrase
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Executive trend title — grain prefix always follows detected bucket, not stale copy. */
export function buildTrendDisplayTitle(
  metricLabel: string,
  timeBucketLabel: string
): string {
  const raw = metricLabel.trim();
  const stem =
    metricStemFromRawTitle(raw) ||
    raw
      .replace(/^total\s+/i, "")
      .replace(/^(monthly|weekly|daily|quarterly|yearly|hourly)\s+/i, "")
      .replace(/\s+trend\s*$/i, "")
      .trim() ||
    raw;
  const metric = titleCaseWords(polishMetricDisplay(stem));
  const bucket = timeBucketLabel.trim();
  let built: string;
  if (/\bmonth/i.test(bucket)) built = `Monthly ${metric} Trend`;
  else if (/\bweek/i.test(bucket)) built = `Weekly ${metric} Trend`;
  else if (/\bday/i.test(bucket)) built = `Daily ${metric} Trend`;
  else if (/\bquarter/i.test(bucket)) built = `Quarterly ${metric} Trend`;
  else if (/\byear/i.test(bucket)) built = `Yearly ${metric} Trend`;
  else if (/\bhour/i.test(bucket)) built = `Hourly ${metric} Trend`;
  else built = `${metric} Trend`;
  return normalizeCanonicalChartTitle(built);
}

function formatExecutiveChartTitle(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words
    .map((w) => {
      const wl = w.toLowerCase();
      if (TITLE_PARTICLES.has(wl)) return wl;
      if (w.length <= 1) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function titleHasDuplicateSemanticTokens(title: string): boolean {
  const t = title.toLowerCase();
  if (/\b(monthly|weekly|daily|quarterly|yearly|trend|total|average)\s+\1\b/.test(t)) {
    return true;
  }
  if (/\bby\s+(.+?)\s+by\s+\1\b/i.test(title)) return true;
  const words = t.split(/\s+/);
  return words.some((w, i) => i > 0 && w === words[i - 1]);
}

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
  return formatExecutiveChartTitle(
    `${capitalizePhraseStart(polishMetricDisplay(metric))} by ${polishMetricDisplay(dimension)}`
  );
}

/**
 * Generic cleanup for auto-dashboard titles (no dataset-specific strings).
 * Examples: "Total Top region by revenue" → "Revenue by region";
 * "Category distribution · department" → "Department distribution".
 */
export function polishAutoDashboardChartTitle(raw: string): string {
  const t = raw.trim();
  if (!t) return "Chart";

  if (EXECUTIVE_TREND_TITLE_RE.test(t)) {
    return normalizeCanonicalChartTitle(t);
  }

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
    return normalizeCanonicalChartTitle(`${grainCap} ${metricCap} Trend`);
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

  return normalizeCanonicalChartTitle(
    capitalizePhraseStart(polishMetricDisplay(t))
  );
}

/** Canonical title — prefers frozen contract, else derives from chart spec. */
export function getCanonicalChartTitle(spec: CanonicalChartSpec): string {
  const rows = rowsFromSpec(spec);
  const labels = spec.labels ?? rows.map((r) => String(r.name ?? ""));

  if (isTrendMode(spec.contract)) {
    const c = spec.contract!;
    const bucket = resolveTrendBucketLabel({
      title: spec.rawTitle?.trim() || c.title,
      timeSeriesAnalysis: null,
      labels,
    });
    const metric =
      c.metricLabel?.trim() ||
      metricStemFromRawTitle(spec.rawTitle ?? c.title ?? "") ||
      spec.rawTitle?.trim() ||
      "Value";
    return buildTrendDisplayTitle(metric, bucket);
  }

  const frozen = spec.contract?.displayTitle?.trim() || spec.contract?.title?.trim();
  if (frozen) {
    return normalizeCanonicalChartTitle(polishAutoDashboardChartTitle(frozen));
  }

  const raw = spec.rawTitle?.trim();
  if (!raw) return "Chart";

  if (EXECUTIVE_TREND_TITLE_RE.test(raw) || /\s+vs\s+/i.test(raw)) {
    const bucket = resolveTrendBucketLabel({ title: raw, labels });
    return buildTrendDisplayTitle(raw, bucket);
  }

  if (!rows.length) {
    return normalizeCanonicalChartTitle(polishAutoDashboardChartTitle(polishMetricDisplay(raw)));
  }

  const ephemeral = freezeVisualizationContract({
    id: "__canonical__",
    source: "overview",
    title: raw,
    apiChartType: spec.chartType ?? "bar",
    labels,
    values: rows.map((r) => r.value),
    rows,
    aggregationKey: spec.aggregationKey ?? "sum",
  });
  return normalizeCanonicalChartTitle(
    polishAutoDashboardChartTitle(ephemeral.displayTitle)
  );
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
    .replace(/\s+trend\s*$/i, "")
    .replace(/\s+over\s+time\s*$/i, "")
    .replace(/^(monthly|weekly|daily|quarterly|yearly|hourly)\s+/i, "")
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

/** Measure phrase for tooltips/semantics — never the full chart display title. */
export function canonicalMetricLabelFromChartTitle(
  chartTitle: string,
  opts?: { metricColumn?: string | null }
): string {
  const raw = String(chartTitle ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Value";

  if (/^[\w_]+$/.test(raw) && raw.includes("_")) {
    let colLabel = polishMetricDisplay(humanizeColumnName(raw));
    colLabel = colLabel.replace(/\s+(Pct|Percent|Percentage)\b/gi, "").trim();
    colLabel = colLabel.replace(/\s+%\s*$/g, "").trim();
    return formatExecutiveChartTitle(colLabel || polishMetricDisplay(humanizeColumnName(raw)));
  }

  const vsMatch = raw.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch) {
    return formatExecutiveChartTitle(polishMetricDisplay(vsMatch[2]!.trim()));
  }

  let stem = metricStemFromRawTitle(raw);
  if (!stem || stem.toLowerCase() === "value") {
    stem =
      polishMetricDisplay(stripIntentNoiseFromMetricLabel(raw)) ||
      polishMetricDisplay(humanizeColumnName(raw));
  }

  if ((!stem || stem.toLowerCase() === "value") && opts?.metricColumn?.trim()) {
    stem = polishMetricDisplay(humanizeColumnName(opts.metricColumn));
  }

  let label = sanitizeExecutiveMeasureLabel(stem);
  if (!label) {
    label = formatExecutiveChartTitle(stem);
  }
  label = label.replace(/\s+by\s+.+$/i, "").trim();
  label = label.replace(/^(?:total|avg|average|sum)\s+/i, "").trim();
  label = label.replace(/\s+(Pct|Percent|Percentage)\b/gi, "").trim();
  label = label.replace(/\s+%\s*$/g, "").trim();
  if (!label) return "Value";
  return formatExecutiveChartTitle(label);
}

export function trendGrainFromTitle(title: string): string {
  const paren = title.match(/\(([^)]+)\)\s*$/);
  if (paren) return paren[1].trim().toLowerCase();
  if (/\bweekly\b/i.test(title)) return "weekly";
  if (/\bmonthly\b/i.test(title)) return "monthly";
  if (/\bdaily\b/i.test(title)) return "daily";
  return "weekly";
}
