import type { ChartKind, ChartRow } from "@/app/chart-types";

export type ChartReasonMetadata = {
  groupCount?: number;
  avgLabelLength?: number;
  maxLabelLength?: number;
  temporalCategories?: boolean;
  stackedOrMultiSeries?: boolean;
  histogramStyle?: boolean;
  routingExplanation?: string | null;
  detectedIntent?: string | null;
  /** Short routing blurb from smart chart intel when aligned. */
  recommendationHint?: string | null;
};

export type GenerateChartReasonParams = {
  chartType: ChartKind;
  measure: string;
  category: string;
  question: string;
  metadata?: ChartReasonMetadata;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function shortenLabel(s: string, max = 32): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function firstSentence(text: string, maxLen = 148): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 18) return null;
  const cut = t.match(/^[^.!?]+[.!?]?/);
  let s = (cut ? cut[0] : t).trim();
  if (!s) return null;
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1).trim()}…`;
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  return s;
}

function labelLooksTemporal(name: string): boolean {
  const s = String(name ?? "").trim();
  if (!s) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s))
    return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  return !Number.isNaN(Date.parse(s));
}

function rowsLookTemporal(rows: ChartRow[]): boolean {
  if (rows.length < 2) return false;
  return rows.every((r) => labelLooksTemporal(String(r.name ?? "")));
}

function classifyQuestion(q: string): {
  trend: boolean;
  distribution: boolean;
  share: boolean;
  correlate: boolean;
  rank: boolean;
  outlier: boolean;
} {
  const t = norm(q);
  return {
    trend: /\b(trend|over\s*time|time\s*series|monthly|yearly|quarter|since|historical|evolution|trajectory|by\s+month|by\s+year)\b/i.test(
      t
    ),
    distribution: /\b(distribution|histogram|frequency|spread\s+of|density|how\s+values\s+are\s+spread)\b/i.test(
      t
    ),
    share: /\b(share|proportion|percentage|percent|part\s+of|mix|split|breakdown\s+by\s+share)\b/i.test(
      t
    ),
    correlate: /\b(correlation|correlate|scatter|versus|vs\.?|relationship|pearson|regression)\b/i.test(
      t
    ),
    rank: /\b(rank|ranking|top\s*\d|bottom|sorted|ordered|highest|lowest|leading|trailing)\b/i.test(
      t
    ),
    outlier: /\b(outliers?|anomal(?:y|ies)|extreme\s+values?)\b/i.test(t),
  };
}

function labelStats(rows: ChartRow[] | undefined, groupCount: number): {
  avg: number;
  max: number;
  n: number;
} {
  const n = rows?.length ?? groupCount;
  if (!rows?.length) return { avg: 0, max: 0, n };
  let sum = 0;
  let max = 0;
  for (const r of rows) {
    const L = String(r.name ?? "").length;
    sum += L;
    if (L > max) max = L;
  }
  return { avg: sum / rows.length, max, n: rows.length };
}

function intentTokenHint(intent: string | null | undefined): string | null {
  const i = norm(intent ?? "").replace(/-/g, "_");
  if (!i || i === "—") return null;
  if (i.includes("trend") || i.includes("time")) return "trend";
  if (i.includes("distribution") || i.includes("histogram")) return "distribution";
  if (i.includes("share") || i.includes("proportion") || i.includes("mix")) return "share";
  if (i.includes("rank") || i.includes("top")) return "rank";
  if (i.includes("correlat") || i.includes("scatter")) return "correlate";
  if (i.includes("outlier")) return "outlier";
  if (i.includes("compare")) return "compare";
  return null;
}

function reasonForKind(
  kind: ChartKind,
  met: string,
  dim: string,
  q: ReturnType<typeof classifyQuestion>,
  meta: ChartReasonMetadata,
  n: number,
  avgLen: number,
  maxLen: number
): string | null {
  const temporal = Boolean(meta.temporalCategories);
  const histStyle = Boolean(meta.histogramStyle);

  if (meta.stackedOrMultiSeries && (kind === "bar" || kind === "bar_horizontal")) {
    return `Stacked bars show how ${met} splits within each ${dim} group — useful for mix and part-to-whole reads.`;
  }

  if (kind === "histogram") {
    if (q.outlier) {
      return `Histogram bins ${met} values so extreme records stand out in the distribution tails.`;
    }
    return `Histogram chosen to reveal how ${met} spreads across value ranges and where outliers may sit.`;
  }

  if (kind === "bar_horizontal") {
    if (q.rank || maxLen > 22 || n > 8) {
      return `Horizontal layout improves readability for longer ${dim} labels and ranking comparisons of ${met}.`;
    }
    if (avgLen > 14) {
      return `Horizontal bars keep long ${dim} names legible while you compare ${met} rankings.`;
    }
    return `Horizontal bars rank ${dim} by ${met} for quick ordered comparison.`;
  }

  if (kind === "line") {
    if (q.trend || temporal) {
      return `Line chart helps visualize how ${met} trends across ordered ${dim} periods.`;
    }
    return `Line chart connects ${dim} points to show directional movement in ${met}.`;
  }

  if (kind === "area") {
    return `Area chart emphasizes trend and cumulative movement of ${met} across ${dim}.`;
  }

  if (kind === "pie") {
    return `Pie chart highlights proportional share of ${met} across a small set of ${dim}.`;
  }

  if (kind === "donut") {
    if (q.share) {
      return `Donut view highlights proportional contribution of ${met} across ${dim}.`;
    }
    return `Donut chart focuses on part-to-whole share of ${met} by ${dim}.`;
  }

  if (kind === "scatter") {
    return `Scatter plot relates two numeric signals to surface correlation patterns in ${met} vs ${dim}.`;
  }

  if (kind === "bar") {
    if (histStyle || q.distribution) {
      return `Vertical bars show how ${met} spreads across ${dim} buckets — a grouped distribution view.`;
    }
    if (q.outlier) {
      return `Vertical bars compare ${met} by ${dim} so standout categories are easy to spot.`;
    }
    if (n <= 6 && !temporal) {
      return `Vertical bars compare ${met} side-by-side across ${dim} for straightforward group contrast.`;
    }
    return `Vertical bars give a direct side-by-side comparison of ${met} across ${dim}.`;
  }

  return null;
}

/**
 * One-sentence “why this chart?” copy for the Charts tab strip.
 * Returns null when no meaningful explanation can be formed.
 */
export function generateChartReason(
  params: GenerateChartReasonParams,
  rows?: ChartRow[]
): string | null {
  const kind = params.chartType;
  if (!kind) return null;

  const meta = params.metadata ?? {};
  const stats = labelStats(rows, meta.groupCount ?? 0);
  const n = meta.groupCount ?? stats.n;
  if (n === 0 && !rows?.length) return null;

  const met = shortenLabel(params.measure) || "this measure";
  const dim = shortenLabel(params.category) || "categories";
  const q0 = classifyQuestion(params.question);
  const intent = intentTokenHint(meta.detectedIntent);
  const q = {
    ...q0,
    trend: q0.trend || intent === "trend",
    distribution: q0.distribution || intent === "distribution",
    share: q0.share || intent === "share",
    rank: q0.rank || intent === "rank",
    correlate: q0.correlate || intent === "correlate",
    outlier: q0.outlier || intent === "outlier",
  };

  const routing = meta.routingExplanation?.trim();
  if (routing) {
    const fromRouting = firstSentence(routing);
    if (fromRouting && fromRouting.length >= 24) return fromRouting;
  }

  const hint = meta.recommendationHint?.trim();
  if (hint) {
    const fromHint = firstSentence(hint);
    if (fromHint && fromHint.length >= 24 && fromHint.length <= 160) {
      return fromHint;
    }
  }

  const avgLen = meta.avgLabelLength ?? stats.avg;
  const maxLen = meta.maxLabelLength ?? stats.max;
  const temporal =
    meta.temporalCategories ?? (rows?.length ? rowsLookTemporal(rows) : false);

  const built = reasonForKind(
    kind,
    met,
    dim,
    q,
    { ...meta, temporalCategories: temporal },
    n,
    avgLen,
    maxLen
  );
  if (!built) return null;

  if (!params.question.trim() && n < 2 && !routing && !hint) {
    return null;
  }

  return built;
}
