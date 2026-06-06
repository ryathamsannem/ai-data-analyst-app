/**
 * Centralized metric value formatting — raw/export vs axis/UI display.
 * Appendix and audit tables must use {@link formatRawMetricValue}, not axis ticks.
 */

import type { ChartKind, ChartRow } from "@/app/chart-types";
import { shareCompositionAllowed } from "@/lib/final-chart-presentation";

export type MetricValueFormatKind =
  | "number"
  | "currency"
  | "percent"
  | "duration"
  | "compact";

export type MetricFormatContext = {
  presentationKind?: ChartKind;
  /** API hints: `pct_1`, `money_0`, `int_0`, `ratio_1`, … */
  roundingHint?: string | null;
  /** Metric column key or display label */
  metricLabel?: string | null;
  /** Chart recommendation metric type when available (`numeric`, `currency`, …). */
  metricType?: string | null;
  /** Explicit format from metadata when available */
  valueFormat?: MetricValueFormatKind | null;
  /** Pie/donut share-of-total questions (not min/max ranking). */
  shareComposition?: boolean;
  chartTitle?: string | null;
  question?: string | null;
};

const PERCENT_METRIC_RE =
  /(?:^|[_\s])(?:pct|percent|percentage|attendance_rate|utilization|share|ratio)(?:$|[_\s])|(?:pct|percent|percentage)$/i;

const DURATION_METRIC_RE =
  /\b(duration|elapsed|latency|runtime|uptime|downtime|cycle_?time|lead_?time|wait_?time)\b|(?:^|_)(?:hours?|mins?|minutes?|seconds?|secs?|ms)(?:$|_)/i;

const OPERATIONAL_METRIC_RE =
  /\b(downtime|production\s+loss|incident|outage|failure|defect|occurrence|work\s+order|ticket)\b|(?:^|[_\s])(?:count|units?|qty|quantity|records?)(?:$|[_\s])/i;

const CURRENCY_LABEL_RE =
  /\b(revenue|salary|wages?|pay(?:roll)?|sales|price|pricing|fee|budget|spend|payment|income|profit|invoice|loan|premium|deposit|cash|capital|compensation|earning|bonus)\b/i;

/** Numeric magnitude used for sorting and comparisons — never axis-formatted strings. */
export function readChartRowRawValue(row: ChartRow): number {
  const raw = row.rawValue;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const v = Number(row.value);
  return Number.isFinite(v) ? v : NaN;
}

/** Optional normalized magnitude (e.g. 0–1 fraction stored separately from raw). */
export function readChartRowNormalizedValue(row: ChartRow): number | undefined {
  const nv = row.normalizedValue;
  if (typeof nv === "number" && Number.isFinite(nv)) return nv;
  return undefined;
}

export function metricLabelImpliesPercent(metricLabel: string | null | undefined): boolean {
  const t = (metricLabel ?? "").trim();
  if (!t) return false;
  const n = t.toLowerCase().replace(/\s+/g, "_");
  if (/\bprofit\s+margin\b/i.test(t) || /\bmargin\s*%/.test(t)) return true;
  return PERCENT_METRIC_RE.test(n) || /\bpercent\b/i.test(t);
}

/** Downtime, counts, units, incidents — never currency even when API sends `money_0`. */
export function metricLabelImpliesOperationalMetric(
  metricLabel: string | null | undefined
): boolean {
  const t = (metricLabel ?? "").trim();
  if (!t) return false;
  if (metricLabelImpliesPercent(t)) return false;
  if (OPERATIONAL_METRIC_RE.test(t)) return true;
  if (/\b(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/i.test(t)) return true;
  if (/\b(loss\s+units?|production\s+loss|downtime)\b/i.test(t)) return true;
  if (
    /\b(count|counts|incidents?|cases?|events?|records?|occurrences?|number\s+of)\b/i.test(
      t
    ) &&
    !CURRENCY_LABEL_RE.test(t)
  ) {
    return true;
  }
  return false;
}

export function metricLabelImpliesCurrency(
  metricLabel: string | null | undefined
): boolean {
  const t = (metricLabel ?? "").trim();
  if (!t) return false;
  if (metricLabelImpliesPercent(t)) return false;
  if (metricLabelImpliesOperationalMetric(t)) return false;
  if (CURRENCY_LABEL_RE.test(t)) return true;
  if (
    /\b(cost|amount)\b/i.test(t) &&
    !/\b(loss|unit|count|minute|record|incident|downtime)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export function resolveMetricValueFormat(ctx: MetricFormatContext): MetricValueFormatKind {
  if (ctx.valueFormat) return ctx.valueFormat;

  const label = (ctx.metricLabel ?? "").trim();
  const hint = (ctx.roundingHint ?? "").trim();
  const metricType = (ctx.metricType ?? "").trim().toLowerCase();

  if (hint === "pct_1") return "percent";
  if (metricLabelImpliesPercent(label)) return "percent";

  if (metricLabelImpliesOperationalMetric(label)) return "number";

  if (metricType === "currency" || metricType === "money") {
    return metricLabelImpliesCurrency(label) ? "currency" : "number";
  }
  if (
    metricType &&
    metricType !== "currency" &&
    metricType !== "money" &&
    (metricType === "numeric" ||
      metricType === "number" ||
      metricType === "count" ||
      metricType === "integer" ||
      metricType === "ratio" ||
      metricType === "percent" ||
      metricType === "percentage")
  ) {
    if (metricType === "percent" || metricType === "percentage") return "percent";
    if (metricType === "ratio" && metricLabelImpliesPercent(label)) return "percent";
    return "number";
  }

  if (hint === "money_0") {
    return metricLabelImpliesCurrency(label) ? "currency" : "number";
  }

  if (hint === "int_0") return "number";

  if (
    DURATION_METRIC_RE.test(label) &&
    !/\b(minutes?|mins?|hours?|hrs?)\b/i.test(label)
  ) {
    return "duration";
  }

  if (metricLabelImpliesCurrency(label)) return "currency";

  const kind = ctx.presentationKind ?? "";
  const share =
    ctx.shareComposition ??
    shareCompositionAllowed(ctx.chartTitle ?? "", ctx.question ?? undefined);
  if ((kind === "pie" || kind === "donut") && share) return "percent";

  return "number";
}

export function metricFormatUsesPercent(ctx: MetricFormatContext): boolean {
  return resolveMetricValueFormat(ctx) === "percent";
}

/**
 * When the stored metric is percent-based, map fractions (0–1) to display percent points.
 * Values already on a 0–100 scale are left unchanged.
 */
export function coercePercentDisplayNumber(
  raw: number,
  normalizedValue?: number
): number {
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue)) {
    return normalizedValue;
  }
  if (!Number.isFinite(raw)) return raw;
  if (raw > 1 && raw <= 100) return raw;
  if (raw >= 0 && raw <= 1) return raw * 100;
  return raw;
}

export function formatMetricNumber(
  value: number,
  format: MetricValueFormatKind,
  options?: { compactThreshold?: number }
): string {
  if (!Number.isFinite(value)) return String(value);

  switch (format) {
    case "percent": {
      const abs = Math.abs(value);
      const decimals =
        abs >= 100 || (abs >= 10 && Math.abs(value - Math.round(value)) < 0.05)
          ? 0
          : abs >= 1
            ? 1
            : 2;
      const rounded = Number(value.toFixed(decimals));
      return `${rounded.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0,
      })}%`;
    }
    case "currency": {
      const abs = Math.abs(value);
      const maxFrac = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
      return value.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: maxFrac,
        minimumFractionDigits: 0,
      });
    }
    case "duration": {
      const abs = Math.abs(value);
      if (abs >= 86_400) {
        const d = value / 86_400;
        return `${d.toLocaleString(undefined, { maximumFractionDigits: 1 })} d`;
      }
      if (abs >= 3600) {
        const h = value / 3600;
        return `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
      }
      if (abs >= 60) {
        const m = value / 60;
        return `${m.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
      }
      if (abs >= 1) {
        return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
      }
      if (abs >= 0.001) {
        return `${(value * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} ms`;
      }
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    case "compact": {
      const threshold = options?.compactThreshold ?? 10_000;
      if (Math.abs(value) >= threshold) {
        return value.toLocaleString(undefined, {
          notation: "compact",
          maximumFractionDigits: 1,
        });
      }
      return formatMetricNumber(value, "number");
    }
    case "number":
    default: {
      const abs = Math.abs(value);
      const asInt = Math.round(value);
      if (abs >= 1000 && Math.abs(value - asInt) < 1e-5) {
        return asInt.toLocaleString();
      }
      if (abs >= 100) {
        return value.toLocaleString(undefined, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 0,
        });
      }
      if (abs >= 1) {
        return value.toLocaleString(undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        });
      }
      return value.toLocaleString(undefined, {
        maximumFractionDigits: 4,
        minimumFractionDigits: 0,
      });
    }
  }
}

/** Technical appendix / audit tables — raw analytical values only. */
export function formatRawMetricValue(
  row: ChartRow,
  ctx: MetricFormatContext
): string {
  const raw = readChartRowRawValue(row);
  if (!Number.isFinite(raw)) return "—";
  const format = resolveMetricValueFormat(ctx);
  if (format === "percent") {
    const n = coercePercentDisplayNumber(raw, readChartRowNormalizedValue(row));
    return formatMetricNumber(n, "percent");
  }
  return formatMetricNumber(raw, format);
}

/**
 * Executive PDF bullets and ranked signals — may use preformatted % only when metric is percent-based.
 */
export function formatExecutiveMetricValue(
  row: ChartRow,
  ctx: MetricFormatContext
): string {
  const format = resolveMetricValueFormat(ctx);
  const raw = readChartRowRawValue(row);
  if (!Number.isFinite(raw)) {
    const dv = row.displayValue?.trim();
    return dv || "—";
  }
  const dv = row.displayValue?.trim();
  if (format === "percent") {
    if (dv?.includes("%")) return dv;
    const n = coercePercentDisplayNumber(raw, readChartRowNormalizedValue(row));
    return formatMetricNumber(n, "percent");
  }
  if (format !== "currency" && dv && /[$€£¥]/.test(dv)) {
    return formatMetricNumber(raw, format);
  }
  return formatMetricNumber(raw, format);
}
