/**
 * Relationship / correlation scatter — executive insight cards from API metadata.
 */

export type RelationshipExecutiveCard = {
  key: string;
  title: string;
  value: string;
  hint?: string;
  dotClass: string;
};

export const NEAR_PERFECT_CORRELATION_THRESHOLD = 0.98;

export const NEAR_PERFECT_CORRELATION_CAUTION =
  "Near-perfect relationship detected. Verify these metrics are not mathematically derived or duplicated before treating this as an independent driver.";

export type RelationshipInsightsPayload = {
  pearson?: number | null;
  spearman?: number | null;
  nearPerfectCorrelation?: boolean;
  nearPerfectCorrelationCaution?: string | null;
  direction?: string | null;
  correlationClass?: string | null;
  correlationLabel?: string | null;
  correlationStrength?: string | null;
  qualitativeOnly?: boolean;
  summaryLine?: string | null;
  measureLabel?: string | null;
  sampleSize?: number | null;
  strongestOutliers?: Array<{
    x?: number | null;
    y?: number | null;
    xLabel?: string;
    yLabel?: string;
    note?: string;
  }>;
  marginByCategory?: {
    dimensionColumn?: string;
    highest?: { label?: string; marginPct?: number };
    lowest?: { label?: string; marginPct?: number };
  } | null;
};

export type RelationshipScatterRow = {
  x?: number;
  value: number;
};

/** Minimum joint pairs before treating Pearson r as statistically stable (matches backend). */
export const MIN_PEARSON_SAMPLE = 8;

export function pearsonCorrelationFromRows(
  rows: RelationshipScatterRow[]
): number | null {
  const paired = rows.filter(
    (r) =>
      typeof r.x === "number" &&
      Number.isFinite(r.x) &&
      Number.isFinite(r.value)
  );
  if (paired.length < 2) return null;
  const xs = paired.map((r) => r.x as number);
  const ys = paired.map((r) => r.value);
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i]! - mx;
    const vy = ys[i]! - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  if (den < 1e-12) return null;
  return num / den;
}

export function formatPearsonCoefficient(r: number): string {
  return (r > 0 ? "+" : "") + r.toFixed(2);
}

export function isNearPerfectCorrelation(value: number | null | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  return Math.abs(value) >= NEAR_PERFECT_CORRELATION_THRESHOLD;
}

export function resolveNearPerfectCorrelationCaution(
  ri: RelationshipInsightsPayload | null | undefined
): string | null {
  if (!ri) return null;
  if (ri.nearPerfectCorrelationCaution?.trim()) {
    return ri.nearPerfectCorrelationCaution.trim();
  }
  if (
    ri.nearPerfectCorrelation ||
    isNearPerfectCorrelation(ri.pearson) ||
    isNearPerfectCorrelation(ri.spearman)
  ) {
    return NEAR_PERFECT_CORRELATION_CAUTION;
  }
  return null;
}

export function smallSampleCorrelationConfidenceLine(n: number): string {
  const rows = Math.max(0, Math.round(n));
  return `Correlation computed on ${rows} paired row${rows === 1 ? "" : "s"}; directional due to small sample.`;
}

export function parseNumericCoefficient(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function resolveAuthoritativePearsonR(args: {
  insights: RelationshipInsightsPayload | null;
  scatterRows?: RelationshipScatterRow[];
  pointCount?: number;
}): {
  pearson: number | null;
  sampleSize: number;
  computed: boolean;
} {
  const ri = args.insights;
  let pearson: number | null = null;
  if (args.scatterRows?.length) {
    pearson = pearsonCorrelationFromRows(args.scatterRows);
  }
  if (pearson == null && ri?.pearson != null && Number.isFinite(ri.pearson)) {
    pearson = ri.pearson;
  }
  const pairedN =
    args.scatterRows?.filter(
      (r) =>
        typeof r.x === "number" &&
        Number.isFinite(r.x) &&
        Number.isFinite(r.value)
    ).length ?? 0;
  const sampleSize =
    ri?.sampleSize != null && Number.isFinite(ri.sampleSize)
      ? Math.round(ri.sampleSize)
      : pairedN > 0
        ? pairedN
        : Math.max(0, args.pointCount ?? 0);
  const computed = pearson != null && Number.isFinite(pearson);
  return { pearson, sampleSize, computed };
}

/** Normalize API + row-level scatter into one payload for cards, badges, and confidence. */
export function enrichRelationshipInsights(
  raw: unknown,
  scatterRows: RelationshipScatterRow[] = [],
  pointCount = 0
): RelationshipInsightsPayload | null {
  const base = parseRelationshipInsights(raw);
  if (!base && scatterRows.length < 2) return null;
  const shell: RelationshipInsightsPayload =
    base ?? {
      qualitativeOnly: true,
      strongestOutliers: [],
    };
  const resolved = resolveAuthoritativePearsonR({
    insights: shell,
    scatterRows,
    pointCount,
  });
  if (resolved.computed && resolved.pearson != null) {
    return {
      ...shell,
      pearson: Math.round(resolved.pearson * 100) / 100,
      sampleSize: resolved.sampleSize,
      qualitativeOnly: false,
    };
  }
  return {
    ...shell,
    sampleSize: resolved.sampleSize || shell.sampleSize,
  };
}

export function parseRelationshipInsights(
  raw: unknown
): RelationshipInsightsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const marginRaw = o.marginByCategory;
  let marginByCategory: RelationshipInsightsPayload["marginByCategory"] = null;
  if (marginRaw && typeof marginRaw === "object") {
    const m = marginRaw as Record<string, unknown>;
    const hi = m.highest as Record<string, unknown> | undefined;
    const lo = m.lowest as Record<string, unknown> | undefined;
    marginByCategory = {
      dimensionColumn:
        typeof m.dimensionColumn === "string" ? m.dimensionColumn : undefined,
      highest: hi
        ? {
            label: typeof hi.label === "string" ? hi.label : undefined,
            marginPct: Number.isFinite(Number(hi.marginPct))
              ? Number(hi.marginPct)
              : undefined,
          }
        : undefined,
      lowest: lo
        ? {
            label: typeof lo.label === "string" ? lo.label : undefined,
            marginPct: Number.isFinite(Number(lo.marginPct))
              ? Number(lo.marginPct)
              : undefined,
          }
        : undefined,
    };
  }
  const pearson = parseNumericCoefficient(o.pearson);
  const spearman = parseNumericCoefficient(o.spearman);
  const outliersRaw = o.strongestOutliers;
  const strongestOutliers: RelationshipInsightsPayload["strongestOutliers"] =
    Array.isArray(outliersRaw)
      ? outliersRaw
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const row = item as Record<string, unknown>;
            return {
              x: Number.isFinite(Number(row.x)) ? Number(row.x) : null,
              y: Number.isFinite(Number(row.y)) ? Number(row.y) : null,
              xLabel:
                typeof row.xLabel === "string" ? row.xLabel : undefined,
              yLabel:
                typeof row.yLabel === "string" ? row.yLabel : undefined,
              note: typeof row.note === "string" ? row.note : undefined,
            };
          })
      : [];

  const hasPearson = pearson != null;
  const qualitativeOnly = hasPearson
    ? false
    : Boolean(o.qualitativeOnly);

  const nearFlag = Boolean(o.nearPerfectCorrelation);
  const nearCaution =
    typeof o.nearPerfectCorrelationCaution === "string"
      ? o.nearPerfectCorrelationCaution.trim() || null
      : null;

  return {
    pearson: hasPearson ? pearson : null,
    spearman: spearman != null ? spearman : null,
    nearPerfectCorrelation:
      nearFlag ||
      isNearPerfectCorrelation(pearson) ||
      isNearPerfectCorrelation(spearman),
    nearPerfectCorrelationCaution: nearCaution,
    direction: typeof o.direction === "string" ? o.direction : null,
    correlationClass:
      typeof o.correlationClass === "string" ? o.correlationClass : null,
    correlationLabel:
      typeof o.correlationLabel === "string" ? o.correlationLabel : null,
    correlationStrength:
      typeof o.correlationStrength === "string" ? o.correlationStrength : null,
    qualitativeOnly,
    summaryLine: typeof o.summaryLine === "string" ? o.summaryLine : null,
    measureLabel:
      typeof o.measureLabel === "string" ? o.measureLabel.trim() : null,
    sampleSize: Number.isFinite(Number(o.sampleSize))
      ? Math.round(Number(o.sampleSize))
      : null,
    marginByCategory,
    strongestOutliers,
  };
}

export function correlationCoefficientComputed(
  ri: RelationshipInsightsPayload
): boolean {
  return (
    !ri.qualitativeOnly &&
    ri.pearson != null &&
    Number.isFinite(ri.pearson)
  );
}

function formatScatterMetric(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  if (Math.abs(n) < 1 && n !== 0) return n.toFixed(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function buildRelationshipExecutiveCards(
  ri: RelationshipInsightsPayload,
  xAxisLabel: string,
  yAxisLabel: string,
  pointCount: number,
  scatterRows: RelationshipScatterRow[] = []
): RelationshipExecutiveCard[] {
  const enriched =
    enrichRelationshipInsights(ri, scatterRows, pointCount) ?? ri;
  const resolved = resolveAuthoritativePearsonR({
    insights: enriched,
    scatterRows,
    pointCount,
  });
  const riUse: RelationshipInsightsPayload = {
    ...enriched,
    pearson: resolved.pearson,
    sampleSize: resolved.sampleSize,
    qualitativeOnly: resolved.computed ? false : enriched.qualitativeOnly,
  };

  const stripes = [
    "bg-violet-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-sky-500",
  ] as const;
  const cards: RelationshipExecutiveCard[] = [];
  let stripeIdx = 0;
  const nextDot = () => stripes[stripeIdx++ % stripes.length];

  const computed = correlationCoefficientComputed(riUse);

  if (computed && riUse.pearson != null) {
    const r = riUse.pearson;
    const strength =
      riUse.correlationStrength?.trim() &&
      riUse.correlationStrength.trim() !== "Unknown"
        ? riUse.correlationStrength.trim()
        : null;
    cards.push({
      key: "rel-pearson",
      title: "Correlation strength",
      value: formatPearsonCoefficient(r),
      hint: strength
        ? `${strength} · ${xAxisLabel} vs ${yAxisLabel}`
        : `${xAxisLabel} vs ${yAxisLabel}`,
      dotClass: nextDot(),
    });
  } else if (!computed) {
    cards.push({
      key: "rel-pearson-unavailable",
      title: "Correlation strength",
      value: "Unable to compute correlation",
      hint: "Fewer than two valid numeric pairs on both axes",
      dotClass: nextDot(),
    });
  } else if (
    riUse.correlationStrength?.trim() &&
    riUse.correlationStrength.trim() !== "Unknown"
  ) {
    cards.push({
      key: "rel-strength",
      title: "Correlation strength",
      value: riUse.correlationStrength.trim(),
      hint: riUse.correlationLabel?.trim() || "Qualitative read only",
      dotClass: nextDot(),
    });
  }

  const n = riUse.sampleSize ?? pointCount;
  cards.push({
    key: "rel-n",
    title: "Sample size",
    value: String(n),
    hint: computed
      ? "Rows with both metrics populated"
      : "Insufficient joint pairs for numeric correlation",
    dotClass: nextDot(),
  });

  const outlierCount = riUse.strongestOutliers?.length ?? 0;
  if (outlierCount > 0) {
    cards.push({
      key: "rel-outliers",
      title: "Outlier count",
      value: String(outlierCount),
      hint: "Largest joint z-score distance from the series center",
      dotClass: nextDot(),
    });
  }

  const paired = scatterRows.filter(
    (r) => typeof r.x === "number" && Number.isFinite(r.x) && Number.isFinite(r.value)
  );
  if (paired.length >= 1) {
    const hiY = paired.reduce((a, b) => (b.value > a.value ? b : a));
    cards.push({
      key: "rel-hi-y",
      title: `Highest ${yAxisLabel}`,
      value: formatScatterMetric(hiY.value),
      hint: `${yAxisLabel}=${formatScatterMetric(hiY.value)}, ${xAxisLabel}=${formatScatterMetric(hiY.x as number)}`,
      dotClass: nextDot(),
    });
  }
  if (paired.length >= 1) {
    const hiX = paired.reduce((a, b) => ((b.x as number) > (a.x as number) ? b : a));
    cards.push({
      key: "rel-hi-x",
      title: `Highest ${xAxisLabel}`,
      value: formatScatterMetric(hiX.x as number),
      hint: `${xAxisLabel}=${formatScatterMetric(hiX.x as number)}, ${yAxisLabel}=${formatScatterMetric(hiX.value)}`,
      dotClass: nextDot(),
    });
  }

  const nearCaution = resolveNearPerfectCorrelationCaution(riUse);
  if (nearCaution) {
    cards.push({
      key: "rel-near-perfect",
      title: "Correlation caution",
      value: "Near-perfect",
      hint: nearCaution,
      dotClass: nextDot(),
    });
  }

  if (!computed) {
    return cards.slice(0, 4);
  }

  return cards
    .filter((c) => !/profit\s+margin/i.test(c.title))
    .slice(0, nearCaution ? 6 : 5);
}
