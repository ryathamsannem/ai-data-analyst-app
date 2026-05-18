/**
 * Domain-agnostic analytics copy: metric phrases, axes, KPI/tooltip titles, subtitles.
 * Inputs are column identifiers, aggregation keys, and optional engine-provided display strings.
 */

export type AggregationKey =
  | "mean"
  | "sum"
  | "count"
  | "min"
  | "max"
  | "median"
  | string;

export interface MetricLabelContext {
  aggregationKey?: string | null;
  aggregationLabel?: string | null;
  metricColumn?: string | null;
  /** When set (e.g. from API provenance), this wins over synthetic labels. */
  metricColumnDisplay?: string | null;
}

export interface ChartSubtitleContext {
  rowsAnalyzed?: number | null;
  chartPoints?: number | null;
  extraNote?: string | null;
}

function normalizeAggKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Strip ranking/statistical noise sometimes baked into API display names. */
export function stripIntentNoiseFromMetricLabel(label: string): string {
  let t = label.trim();
  t = t.replace(
    /^(lowest|minimum|least|bottom|smallest|highest|maximum|top|largest|greatest|average|mean|median|total|sum)\s+/i,
    ""
  );
  return t.replace(/\s+/g, " ").trim();
}

function canonicalKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/%/g, " percent")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

/** Title-case a column token; treat percent-like names as “X %”. */
export function humanizeColumnName(raw: string): string {
  const s = raw.trim();
  if (!s) return "Value";
  let t = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const pct =
    /\b(percent|pct|percentage)\b/i.test(t) ||
    /%$/i.test(s) ||
    /percent$/i.test(s) ||
    canonicalKey(s).endsWith("_percent");
  t = t.replace(/\b(percent|pct|percentage)\b/gi, "").trim();
  const words = t
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const base = words || "Value";
  return pct ? `${base} %` : base;
}

export function stripIdStem(columnName: string): string {
  let c = columnName.trim().toLowerCase().replace(/\s+/g, "_");
  for (const suf of ["_ids", "_id", "_key", "_number", "_no", "_code"]) {
    if (c.endsWith(suf) && c.length > suf.length + 1) {
      c = c.slice(0, -suf.length);
      break;
    }
  }
  return c.replace(/_/g, " ").trim();
}

function titleCaseWords(phrase: string): string {
  const s = phrase.replace(/_/g, " ").trim();
  if (!s) return "";
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((p) =>
      p.toLowerCase() === "id" || p.toLowerCase() === "n/a"
        ? ""
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    )
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function polishCountStylePhrase(label: string): string {
  const s = label.replace(/\s+/g, " ").trim();
  if (!s) return label;
  const low = s.toLowerCase();
  const countPref = low.match(/^count\s+(.+)$/i);
  const countSuf = low.match(/^(.+)\s+count$/i);
  const rest = (countPref?.[1] || countSuf?.[1] || "").trim();
  if (rest) {
    const stripped = rest
      .replace(/\b(id|ids|key)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    if (stripped) return `${stripped} count`;
  }
  return s;
}

export function polishMetricDisplay(label: string): string {
  return polishCountStylePhrase(label);
}

/**
 * Primary SME metric phrase: aggregation semantics + column humanization.
 * Mirrors backend `build_metric_label`.
 */
export function buildMetricLabel(ctx: MetricLabelContext): string {
  const display = ctx.metricColumnDisplay?.trim();
  if (display) {
    return polishMetricDisplay(display);
  }

  const ak = normalizeAggKey(ctx.aggregationKey);
  const al = (ctx.aggregationLabel ?? "").trim().toLowerCase();
  const valueCol = ctx.metricColumn ?? "";
  const rawPretty = humanizeColumnName(stripIntentNoiseFromMetricLabel(valueCol));

  if (ak === "count" || al === "count") {
    const stem =
      stripIdStem(valueCol) || valueCol.toLowerCase().replace(/\s+/g, " ");
    const ent = titleCaseWords(stem);
    if (!ent) return "Count";
    if (ent.toLowerCase().endsWith(" count")) return ent;
    return `${ent} count`;
  }

  if (
    ak === "mean" ||
    al === "average" ||
    al === "mean" ||
    al === "avg" ||
    al.includes("average")
  ) {
    if (["average", "mean", "avg", "value"].includes(rawPretty.toLowerCase()))
      return "Average";
    return `Average ${rawPretty}`;
  }

  if (ak === "sum" || al === "total" || al === "sum") {
    if (["total", "sum", "value"].includes(rawPretty.toLowerCase())) return "Total";
    return `Total ${rawPretty}`;
  }

  if (ak === "min" || al.startsWith("min"))
    return rawPretty ? `Minimum ${rawPretty}` : "Minimum";

  if (ak === "max" || al.startsWith("max"))
    return rawPretty ? `Maximum ${rawPretty}` : "Maximum";

  const lab = (ctx.aggregationLabel ?? "").trim();
  if (lab && valueCol) return `${lab} ${rawPretty}`.trim();
  return rawPretty || lab || "Value";
}

export function buildAxisLabel(ctx: MetricLabelContext): string {
  return buildMetricLabel(ctx);
}

export function buildKpiTitle(ctx: MetricLabelContext): string {
  return buildMetricLabel(ctx);
}

/** Remap legacy sales-oriented KPI titles when domain is operational. */
export function remapLegacyKpiTitle(
  title: string,
  domain: string,
  opts?: {
    metricColumn?: string | null;
    breakdownColumn?: string | null;
  }
): string {
  const raw = title.replace(/\s+/g, " ").trim();
  if (!raw) return raw;
  const tl = raw.toLowerCase();
  const metricCol = opts?.metricColumn?.trim() || null;
  const breakdownCol = opts?.breakdownColumn?.trim() || null;
  const dk = (domain || "").trim().toLowerCase();

  const dimensionPhrase = (col: string | null | undefined): string => {
    if (!col?.trim()) return "category";
    let p = humanizeColumnName(col).trim();
    p = p.replace(/\s+names?$/i, "").replace(/\s+ids?$/i, "").trim();
    return p.toLowerCase() || "category";
  };

  if (
    metricCol &&
    (tl === "total sales" || tl === "total revenue" || tl === "peak revenue")
  ) {
    const agg = tl.includes("peak") ? "max" : "sum";
    return buildKpiTitle({
      aggregationKey: agg,
      aggregationLabel: tl.includes("peak") ? "peak" : "total",
      metricColumn: metricCol,
    });
  }

  if (tl === "top product" || tl === "highest product") {
    if (breakdownCol) return `Top ${dimensionPhrase(breakdownCol)}`;
    if (dk === "operations" || dk === "manufacturing") {
      return "Top category";
    }
    return "Top category";
  }

  if (tl === "products" || tl === "product count" || tl.endsWith(" count")) {
    if (breakdownCol) return `${humanizeColumnName(breakdownCol)} count`;
    return "Categories tracked";
  }

  if (tl === "best region") {
    if (breakdownCol) return `Top ${dimensionPhrase(breakdownCol)}`;
    return "Top category";
  }

  if (dk === "operations" || dk === "manufacturing") {
    if (tl === "revenue gap" && metricCol) {
      return `${humanizeColumnName(metricCol)} gap`;
    }
  }

  return raw;
}

export function buildTooltipLabel(ctx: MetricLabelContext): string {
  return buildMetricLabel(ctx);
}

export function buildChartSubtitle(opts: ChartSubtitleContext): string {
  const parts: string[] = [];
  if (
    opts.rowsAnalyzed != null &&
    Number.isFinite(opts.rowsAnalyzed) &&
    opts.rowsAnalyzed >= 0
  ) {
    parts.push(`${opts.rowsAnalyzed.toLocaleString()} rows analyzed`);
  }
  if (
    opts.chartPoints != null &&
    Number.isFinite(opts.chartPoints) &&
    opts.chartPoints >= 0
  ) {
    parts.push(`${opts.chartPoints.toLocaleString()} chart points`);
  }
  if (opts.extraNote?.trim()) parts.push(opts.extraNote.trim());
  return parts.join(" · ");
}

/**
 * Axis label when only aggregation + raw column are known (no engine display string).
 */
export function buildAxisLabelFromAggColumn(
  aggregationKey: string | null | undefined,
  metricColumn: string
): string {
  return buildAxisLabel({
    aggregationKey,
    metricColumn,
    metricColumnDisplay: null,
  });
}

const AXIS_COMPACT_CHAR_TARGET = 26;

/** Title-case words for compact axis display; leaves symbols / numbers unchanged. */
function titleCaseCompactAxisLabel(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => {
      if (!w) return w;
      if (!/[a-zA-Z]/.test(w)) return w;
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Short metric phrase for chart axis text only (Y or X when space is tight).
 * Full `buildMetricLabel` / provenance display stays in titles, tooltips, badges, PDF.
 * Uses aggregation + column semantics only (no dataset-specific literals).
 */
export function buildCompactAxisValueLabel(ctx: MetricLabelContext): string {
  const display = ctx.metricColumnDisplay?.trim();
  const valueCol = (ctx.metricColumn ?? "").trim();
  const ak = normalizeAggKey(ctx.aggregationKey);
  const al = (ctx.aggregationLabel ?? "").trim().toLowerCase();

  if (!valueCol && display) {
    const p = polishMetricDisplay(stripIntentNoiseFromMetricLabel(display));
    if (p.length <= AXIS_COMPACT_CHAR_TARGET) return p;
    return humanizeColumnName(stripIntentNoiseFromMetricLabel(display));
  }

  const rawFromCol = humanizeColumnName(stripIntentNoiseFromMetricLabel(valueCol));
  const displayStem = display
    ? humanizeColumnName(
        stripIntentNoiseFromMetricLabel(stripIntentNoiseFromMetricLabel(display))
      )
    : "";
  const stem = (displayStem || rawFromCol || "Value").trim();

  if (ak === "count" || al === "count") {
    if (!valueCol && display) {
      return polishMetricDisplay(stripIntentNoiseFromMetricLabel(display));
    }
    const stemCol =
      stripIdStem(valueCol) || valueCol.toLowerCase().replace(/\s+/g, " ");
    const ent = titleCaseWords(stemCol);
    if (!ent) return "Count";
    if (ent.toLowerCase().endsWith(" count")) return ent;
    return `${ent} count`;
  }

  if (
    ak === "mean" ||
    al === "average" ||
    al === "mean" ||
    al === "avg" ||
    al.includes("average")
  ) {
    if (["average", "mean", "avg", "value"].includes(stem.toLowerCase()))
      return "Average";
    return `Average ${stem}`;
  }

  if (ak === "sum" || al === "total" || al === "sum") {
    if (["total", "sum", "value"].includes(stem.toLowerCase())) return "Total";
    return stem;
  }

  if (ak === "min" || al.startsWith("min") || ak === "max" || al.startsWith("max")) {
    return stem;
  }

  if (ak === "median" || al.includes("median")) {
    return `Median ${stem}`;
  }

  if (display) {
    const p = polishMetricDisplay(stripIntentNoiseFromMetricLabel(display));
    if (p.length <= AXIS_COMPACT_CHAR_TARGET) return p;
    return stem;
  }

  const lab = (ctx.aggregationLabel ?? "").trim();
  if (lab && valueCol) {
    const combo = `${lab} ${stem}`.trim();
    return combo.length <= AXIS_COMPACT_CHAR_TARGET ? combo : stem;
  }

  return stem;
}

/**
 * When only a natural-language phrase exists (no provenance), derive a shorter axis string.
 */
export function compactAxisLabelFromFullPhrase(phrase: string): string {
  let t = polishMetricDisplay(stripIntentNoiseFromMetricLabel(phrase));
  t = t
    .replace(/\bpercentage\b/gi, "%")
    .replace(/\bpercent\b/gi, "%")
    .replace(/\bpct\b/gi, "%")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= AXIS_COMPACT_CHAR_TARGET) return titleCaseCompactAxisLabel(t);
  const words = t.split(" ").filter(Boolean);
  let u = words.join(" ");
  let guard = 0;
  while (
    u.length > AXIS_COMPACT_CHAR_TARGET &&
    words.length > 2 &&
    /^(minimum|maximum|average|total|median|mean|sum)\b/i.test(words[0]!) &&
    guard < 6
  ) {
    words.shift();
    u = words.join(" ");
    guard++;
  }
  if (u.length <= AXIS_COMPACT_CHAR_TARGET) return titleCaseCompactAxisLabel(u);
  if (words.length <= 4) return titleCaseCompactAxisLabel(u);
  return titleCaseCompactAxisLabel(words.slice(-3).join(" "));
}
