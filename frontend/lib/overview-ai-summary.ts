/**
 * Overview AI Summary bullets — domain-aware, KPI/chart-aligned executive copy.
 */

import { humanizeColumnName, polishMetricDisplay } from "@/lib/analytics-metadata";
import {
  getCanonicalChartTitle,
  metricStemFromRawTitle,
  polishAutoDashboardChartTitle,
} from "@/lib/canonical-chart-title";

export type OverviewAiSummaryChart = {
  title: string;
  chartType: string;
  labels: string[];
  values: number[];
};

export type OverviewAiSummaryCard = {
  title: string;
  value: string;
  subtitle?: string | null;
};

export type OverviewAiSummaryDashboard = {
  kind?: string;
  type_label?: string;
  cards?: OverviewAiSummaryCard[];
  charts?: OverviewAiSummaryChart[];
};

export type SummaryDomain =
  | "hr"
  | "healthcare"
  | "operations"
  | "customer_support"
  | "finance_fpa"
  | "banking"
  | "marketing"
  | "retail"
  | "sales"
  | "geography"
  | "generic";

export type OverviewAiSummaryProfile = {
  column_types?: Record<string, string>;
  summary_stats?: Record<string, Record<string, number | string>>;
  null_counts?: Record<string, number>;
} | null;

export type ComputeOverviewAiSummaryArgs = {
  rows: number;
  columns: string[];
  autoDashboard: OverviewAiSummaryDashboard | null;
  profile: OverviewAiSummaryProfile;
  primaryMetricColumn: string | null;
  groupingColumn: string | null;
  dateColumn: string | null;
};

/** Initial bullets shown before expanding the summary panel. */
export const OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE = 5;

/** Maximum ranked insights when the dataset supports them. */
export const OVERVIEW_AI_SUMMARY_MAX_BULLETS = 12;

const MAX_TREND_INSIGHTS = 2;
const MAX_CHART_BREAKDOWN_INSIGHTS = 8;
const CONCENTRATION_SHARE_MIN = 0.35;
const CONCENTRATION_SHARE_MATERIAL = 0.5;
const LAGGARD_SPREAD_RATIO_MIN = 2;
const MIN_INSIGHT_SCORE = 42;
const MAX_ENTITY_IN_INITIAL = 1;
const MAX_ENTITY_IN_FULL = 2;

/** Low-value chart titles — arbitrary metric × dimension pairings. */
const LOW_VALUE_CHART_TITLE_RE =
  /\b(manager flag|shipping cost|delivery days)\b.{0,40}\bby\b|\bby\b.{0,40}\b(manager flag|shipping cost|delivery days|sub category|marketing channel|city)\b|\bcredit score\b.{0,24}\bby\b.{0,24}\bcity\b|\byear\b\s+by\b|\bby\b.{0,24}\bcustomer segment\b.*\byear\b/i;

/** Low-value insight copy — generic or misleading executive phrasing. */
const LOW_VALUE_INSIGHT_TEXT_RE =
  /\baccounts for about \d+% of the total in this breakdown\b|\bhas the largest representation in the .+ breakdown\b|\bis the leading (?:city|location|marketing channel) by (?:credit score|manager flag|shipping cost)\b|\bremote[\s-]?us is the leading location by manager flag\b|\bpatna is the leading city by credit score\b/i;

type OverviewInsightKind =
  | "frame"
  | "trend"
  | "leader"
  | "concentration"
  | "laggard"
  | "kpi"
  | "impact"
  | "profile"
  | "neutral";

type OverviewScoredInsight = {
  text: string;
  score: number;
  kind: OverviewInsightKind;
  entity?: string;
  metricKey?: string;
  dimensionKey?: string;
  topicKey?: string;
  outcomeKey?: string;
  topicCategory?: string;
};

/** Topic buckets used for coverage-first selection. */
const DOMAIN_TOPIC_TARGETS: Partial<Record<SummaryDomain, readonly string[]>> = {
  retail: ["revenue", "profit", "concentration", "region", "trend", "laggard"],
  sales: ["revenue", "profit", "concentration", "region", "trend", "laggard"],
  hr: ["attrition", "compensation", "department", "payroll", "workforce", "demographics"],
  banking: ["spending", "loans", "risk", "utilization", "segments"],
};

const EXTREME_SCORE_OVERRIDE = 97;
const MAX_TOPIC_IN_INITIAL = 2;
const MAX_TOPIC_IN_FULL = 3;

/** HR-only: long-tail profile warnings need stronger skew before surfacing. */
const HR_LONG_TAIL_Z_MIN = 3.5;
const HR_PROFILE_LONG_TAIL_SCORE = 28;
const HR_DEMOGRAPHIC_SCORE_PENALTY = 46;

/** Non-HR domains: only surface long-tail copy when skew is extreme. */
const GENERIC_LONG_TAIL_Z_MIN = 5.25;
const GENERIC_PROFILE_LONG_TAIL_SCORE = 44;

const HEADLINE_KPI_TITLE_RE =
  /^(total sales|total profit|total revenue|total loan balance|total spend|total order value)$/i;
const REDUNDANT_TOP_KPI_TITLE_RE =
  /^top (?:product category|region|customer segment|department|segment)\b/i;

const DOMAIN_METRIC_PRIORITY: Partial<Record<SummaryDomain, RegExp[]>> = {
  retail: [
    /\b(sales|revenue|profit|margin)\b/i,
    /\b(product category|region|category|segment)\b/i,
  ],
  sales: [
    /\b(sales|revenue|profit|margin)\b/i,
    /\b(product|region|category|segment)\b/i,
  ],
  hr: [
    /\b(attrition|salary|bonus|headcount|employee|department|promotion|engagement|workforce)\b/i,
    /\b(department|location|tenure|hire)\b/i,
  ],
  banking: [
    /\b(loan|delinquency|utilization|spend|deposit|credit|risk|segment)\b/i,
    /\b(segment|product|region|portfolio)\b/i,
  ],
  finance_fpa: [/\b(revenue|variance|budget|actual|cost)\b/i],
  marketing: [/\b(spend|conversion|campaign|channel|ctr|impression)\b/i],
  operations: [/\b(downtime|defect|production|incident|severity|sla)\b/i],
  customer_support: [/\b(ticket|resolution|satisfaction|escalation|channel)\b/i],
  healthcare: [/\b(patient|admission|readmission|length of stay|ward)\b/i],
  geography: [/\b(revenue|profit|region|market|zone)\b/i],
};

const DOMAIN_METRIC_DEPRIORITY: Partial<Record<SummaryDomain, RegExp[]>> = {
  retail: [
    /\b(shipping|delivery|discount|quantity|year|rating|campaign)\b/i,
    /\b(city|channel|sub category|age group)\b/i,
  ],
  sales: [/\b(shipping|delivery|discount|quantity|year)\b/i, /\b(city|channel)\b/i],
  hr: [/\b(training hours|manager flag|age trend|year)\b/i, /\b(gender|job level)\b/i],
  banking: [
    /\b(account age|transaction count)\b/i,
    /\bcity\b/i,
  ],
};

const HR_LANGUAGE_RE =
  /\b(total employees?|department count|highest paid employee|workforce|headcount)\b/i;

/** Duration / latency metrics must never be described as "share". */
export const DURATION_LATENCY_METRIC_RE =
  /\b(delivery\s+days?|response\s+time|resolution\s+time|wait\s+time|latency|duration|turnaround\s+time|avg\s+resolution|resolution\s+hours?|downtime\s+hours?|lead\s+time|cycle\s+time)\b/i;

const AWKWARD_SUMMARY_RE =
  /\b(leads on\b|when split by\b|recent buckets in\b|highest category distribution\b)/i;

const DURATION_SHARE_RE =
  /\b(?:delivery\s+days?|response\s+time|resolution\s+time|wait\s+time|latency|duration|turnaround\s+time|resolution\s+hours?).{0,20}\bshare\b/i;

const ORDINAL_LEADER_RE =
  /^(high|low|medium|mid|critical|urgent|p[1-4]|sev[\d]+)$/i;

const HR_COLUMN_SIGNALS: RegExp[] = [
  /\bemployees?\b/,
  /\bemployee[_\s]?id\b/,
  /\bheadcount\b/,
  /\bdepartment\b/,
  /\bdesignation\b/,
  /\bsalary\b/,
  /\bbonus\b/,
  /\bmanager\b/,
  /\bhire[_\s]?date\b/,
  /\battrition\b/,
  /\bperformance[_\s]?rating\b/,
  /\bgrade\b/,
  /\bpersonnel[_\s]?cost\b/,
  /\bjob[_\s]?family\b/,
  /\bterminations?\b/,
  /\bhires\b/,
  /\bworkforce\b/,
];

const SALES_COLUMN_SIGNALS: RegExp[] = [
  /\bproduct[_\s]?line\b/,
  /\bsales[_\s]?rep\b/,
  /\bquota\b/,
  /\battainment\b/,
  /\border[_\s]?value\b/,
  /\bgmv\b/,
  /\bunits[_\s]?sold\b/,
];

const SMALL_TREND_BUCKET_MAX = 6;

const COVID_PUBLIC_HEALTH_COLUMN_SIGNALS: RegExp[] = [
  /\bnew[_\s]?cases\b/,
  /\bactive[_\s]?cases\b/,
  /\btotal[_\s]?cases\b/,
  /\bvariant\b/,
  /\bvaccination\b/,
  /\bpositivity\b/,
  /\bhospital[_\s]?admissions?\b/,
  /\bicu[_\s]?patients?\b/,
  /\bcovid\b/,
  /\btests[_\s]?conducted\b/,
  /\breport[_\s]?date\b/,
];

/** COVID / epidemiological surveillance datasets (column-name signals). */
export function isCovidPublicHealthDataset(columns: readonly string[]): boolean {
  const blob = columns.join(" ").toLowerCase().replace(/_/g, " ");
  let hits = 0;
  for (const re of COVID_PUBLIC_HEALTH_COLUMN_SIGNALS) {
    if (re.test(blob)) hits += 1;
  }
  return hits >= 3;
}

const DOMAIN_FRAMES: Record<SummaryDomain, string> = {
  hr: "Workforce analytics snapshot — headcount, attrition, and personnel cost signals in this slice.",
  healthcare:
    "Healthcare operations snapshot — patient flow, admissions, and care quality metrics in this slice.",
  operations:
    "Operations snapshot — production, downtime, and quality performance across facilities and lines.",
  customer_support:
    "Customer support snapshot — ticket volume, resolution time, and satisfaction by channel.",
  finance_fpa:
    "FP&A snapshot — budget vs actual variance, revenue, and cost center performance.",
  banking:
    "Banking analytics snapshot — balances, utilization, and segment-level financial activity.",
  marketing:
    "Marketing analytics snapshot — campaign spend, conversion, and channel performance.",
  retail:
    "Retail analytics snapshot — revenue, margin, and category performance in this slice.",
  sales:
    "Sales analytics snapshot — revenue, attainment, and regional mix in this slice.",
  geography:
    "Geographic analytics snapshot — revenue and profit patterns across markets and zones.",
  generic:
    "Executive analytics snapshot — key metrics and breakdowns from your current dataset view.",
};

const PUBLIC_HEALTH_DOMAIN_FRAME =
  "Healthcare / Public Health snapshot — cases, admissions, vaccination status, variants, and demographic trends.";

/** Domain opening line for Overview AI Summary (healthcare/public-health aware). */
export function resolveOverviewSummaryDomainFrame(
  domain: SummaryDomain,
  columns: readonly string[],
  typeLabel?: string | null
): string {
  if (
    domain === "healthcare" &&
    (isCovidPublicHealthDataset(columns) ||
      /\bpublic health\b/i.test(String(typeLabel ?? "")))
  ) {
    return PUBLIC_HEALTH_DOMAIN_FRAME;
  }
  return DOMAIN_FRAMES[domain];
}

function truncateOverviewPhrase(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function meanFinite(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function readProfileDescribeStat(
  col: string,
  stat: string,
  profile: OverviewAiSummaryProfile
): number | null {
  if (!profile?.summary_stats || typeof profile.summary_stats !== "object") return null;
  const ss = profile.summary_stats as Record<string, unknown>;

  const readNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  // Layout A (tests): summary_stats.mean[col]
  const byStat = ss[stat];
  if (byStat && typeof byStat === "object") {
    const v = readNum((byStat as Record<string, unknown>)[col]);
    if (v != null) return v;
  }

  // Layout B (harvested payloads): summary_stats[col].mean
  const byCol = ss[col];
  if (byCol && typeof byCol === "object") {
    const v = readNum((byCol as Record<string, unknown>)[stat]);
    if (v != null) return v;
  }

  return null;
}

function chartPairs(chart: OverviewAiSummaryChart): { name: string; value: number }[] {
  const n = Math.min(chart.labels.length, chart.values.length);
  const pairs: { name: string; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = chart.values[i];
    if (!Number.isFinite(v)) continue;
    pairs.push({ name: String(chart.labels[i] ?? "").trim() || "—", value: v });
  }
  return pairs;
}

function isLikelyTrendChart(chart: OverviewAiSummaryChart): boolean {
  const ct = (chart.chartType || "").toLowerCase();
  if (ct === "scatter") return false;
  if (/\bcorrelation\b/i.test(chart.title)) return false;
  if (ct === "line" || ct === "area") return true;
  return /\b(trend|over time|time series|weekly|daily|monthly|quarter)\b/i.test(
    chart.title
  );
}

function isCorrelationOrScatterChart(chart: OverviewAiSummaryChart): boolean {
  const ct = (chart.chartType || "").toLowerCase();
  return ct === "scatter" || /\bcorrelation\b/i.test(chart.title);
}

function splitChartTitleMetricAndBreakdown(title: string): {
  metric: string;
  breakdown: string | null;
} {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return { metric: "this measure", breakdown: null };
  const m = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (m) {
    return {
      metric: m[1].trim() || "this measure",
      breakdown: m[2].trim() || null,
    };
  }
  return { metric: t, breakdown: null };
}

function polishInsightPhrase(raw: string): string {
  const stem = metricStemFromRawTitle(raw) || raw.trim();
  const polished = polishMetricDisplay(stem) || humanizeColumnName(stem) || stem;
  return polished.replace(/\s+/g, " ").trim();
}

/** Metric at the start of a sentence — title-case and trim noisy suffixes. */
function formatMetricSentenceStart(raw: string): string {
  let s = polishInsightPhrase(raw);
  s = s.replace(/\s+units$/i, "");
  if (!s) return "This metric";
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function scoreColumnSignals(blob: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (re.test(blob) ? 1 : 0), 0);
}

function parseCategoryDistributionDimension(title: string): string | null {
  const m = title.match(/^category\s+distribution\s*[·•\-|]\s*(.+)$/i);
  if (m) return m[1].trim();
  const polished = polishAutoDashboardChartTitle(title);
  const dist = polished.match(/^(.+?)\s+distribution$/i);
  if (dist && dist[1].trim()) return dist[1].trim();
  return null;
}

function dimensionContextForOrdinal(dimension: string): string | null {
  const d = dimension.toLowerCase().replace(/_/g, " ");
  if (/\bseverity\b|\bsev\b/.test(d)) return "severity";
  if (/\bpriority\b/.test(d)) return "priority";
  if (/\brisk[\s-]?level\b|\brisk\b/.test(d)) return "risk";
  return null;
}

function formatLeaderForBreakdown(
  leaderName: string,
  dimension: string | null
): string {
  const leader = truncateOverviewPhrase(leaderName, 32);
  if (!dimension) return leader;
  const ctx = dimensionContextForOrdinal(dimension);
  if (!ctx || !ORDINAL_LEADER_RE.test(leaderName.trim())) return leader;
  const prefix = leaderName.trim();
  if (ctx === "severity") return `${prefix}-severity incidents`;
  if (ctx === "priority") return `${prefix}-priority incidents`;
  return `${prefix}-risk events`;
}

function leaderVerb(leaderLabel: string): "contribute" | "contributes" {
  if (/\bincidents\b|\bevents\b|\btickets\b/i.test(leaderLabel)) return "contribute";
  return "contributes";
}

function buildCategoryDistributionLine(args: {
  dimension: string;
  leaderName: string;
  domain: SummaryDomain;
}): string {
  const leader = formatLeaderForBreakdown(args.leaderName, args.dimension);
  const dim = polishInsightPhrase(args.dimension);
  const dimLc = dim.toLowerCase();

  if (args.domain === "hr" && /\bdepartment\b/i.test(dim)) {
    return `${leader} is the largest department by employee count.`;
  }
  if (args.domain === "hr") {
    return `${leader} has the highest employee representation in the ${dimLc} breakdown.`;
  }
  if (args.domain === "healthcare" && /\bdepartment\b/i.test(dim)) {
    return `${leader} has the largest patient volume in the ${dimLc} breakdown.`;
  }
  if (/\bdepartment\b/i.test(dim)) {
    return `${leader} is the largest ${dimLc} by headcount in this slice.`;
  }
  return `${leader} has the largest representation in the ${dimLc} breakdown.`;
}

function isDurationLatencyMetric(metric: string): boolean {
  return DURATION_LATENCY_METRIC_RE.test(metric);
}

function isShareChartTitle(title: string, chartType?: string): boolean {
  const t = title.toLowerCase();
  if (/\bshare\b/.test(t) || /\bcomposition\b/.test(t)) return true;
  const ct = (chartType || "").toLowerCase();
  return ct === "donut" || ct === "pie";
}

function parseTopByTitle(title: string): { dimension: string; metric: string } | null {
  const m = title.match(/^top\s+(.+?)\s+by\s+(.+)$/i);
  if (!m) return null;
  return { dimension: m[1].trim(), metric: m[2].trim() };
}

function parseShareByTitle(title: string): { metric: string; dimension: string } | null {
  const m = title.match(/^(.+?)\s+share\s+by\s+(.+)$/i);
  if (!m) return null;
  return { metric: m[1].trim(), dimension: m[2].trim() };
}

function parseMetricByDimensionTitle(
  title: string
): { metric: string; dimension: string } | null {
  if (/^top\s+/i.test(title)) return null;
  const m = title.match(/^(.+?)\s+by\s+(.+)$/i);
  if (!m) return null;
  return { metric: m[1].trim(), dimension: m[2].trim() };
}

/** Backend composition titles: "{Dimension} {Metric} Share". */
function parseDimMetricShareTitle(
  title: string
): { dimension: string; metric: string } | null {
  const m = title.match(/^(.+?)\s+share$/i);
  if (!m) return null;
  const body = m[1].trim();
  if (!body) return null;

  const flagDim = body.match(/^(.+?\b(?:flag|status))\s+(.+)$/i);
  if (flagDim && isBinaryFlagDimensionName(flagDim[1])) {
    return { dimension: flagDim[1].trim(), metric: flagDim[2].trim() };
  }

  const metricTail = body.match(
    /^(.*?)\s+(profit|revenue|sales|units|margin|cost|volume|amount|value)$/i
  );
  if (metricTail) {
    return { dimension: metricTail[1].trim(), metric: metricTail[2].trim() };
  }

  const parts = body.split(/\s+/);
  if (parts.length < 2) return null;
  return {
    dimension: parts.slice(0, -1).join(" "),
    metric: parts[parts.length - 1]!,
  };
}

function isBinaryFlagDimensionName(dimension: string): boolean {
  const norm = dimension.toLowerCase().replace(/_/g, " ").trim();
  if (/\b(return|refund|cancel|cancellation|churn|default|delinquen)/.test(norm)) {
    return true;
  }
  if (
    /\b(return|refund|cancel|default|churn|delinquen).*\b(flag|status)\b/.test(norm)
  ) {
    return true;
  }
  return /\b(flag|status)\b.*\b(return|refund|cancel|default|churn|delinquen)/.test(
    norm
  );
}

function normalizeBinaryFlagCategory(value: string): "positive" | "negative" | null {
  const v = value.trim().toLowerCase();
  if (["n", "no", "false", "0"].includes(v)) return "positive";
  if (["y", "yes", "true", "1"].includes(v)) return "negative";
  if (/\b(not|non|no|without|unreturned|active|performing|retained|current|paid)\b/.test(v)) {
    return "positive";
  }
  if (/\b(returned|refund|cancelled|canceled|defaulted|churned|delinquent)\b/.test(v)) {
    return "negative";
  }
  return null;
}

function binaryFlagShareSemantics(dimension: string): {
  positiveLabel: string;
  negativeLabel: string;
} | null {
  const d = dimension.toLowerCase();
  if (/return|refund/.test(d)) {
    return {
      positiveLabel: "Non-returned orders",
      negativeLabel: "Returned orders",
    };
  }
  if (/cancel/.test(d)) {
    return {
      positiveLabel: "Non-cancelled orders",
      negativeLabel: "Cancelled orders",
    };
  }
  if (/default|delinquen/.test(d)) {
    return {
      positiveLabel: "Performing accounts",
      negativeLabel: "Defaulted accounts",
    };
  }
  if (/churn/.test(d)) {
    return {
      positiveLabel: "Retained customers",
      negativeLabel: "Churned customers",
    };
  }
  return null;
}

/** Business-readable share insight for binary return/refund/cancel-style flags. */
export function buildBinaryFlagShareInsightLine(args: {
  chartTitle: string;
  leaderName: string;
}): string | null {
  const parsed = parseDimMetricShareTitle(args.chartTitle);
  if (!parsed || !isBinaryFlagDimensionName(parsed.dimension)) return null;
  const semantics = binaryFlagShareSemantics(parsed.dimension);
  if (!semantics) return null;
  const polarity = normalizeBinaryFlagCategory(args.leaderName);
  if (!polarity) return null;
  const met = polishInsightPhrase(parsed.metric).toLowerCase();
  if (polarity === "positive") {
    return `${semantics.positiveLabel} account for most ${met}.`;
  }
  return `${semantics.negativeLabel} account for most ${met}.`;
}

/** Natural executive line for bar / ranking / share breakdown charts. */
export function buildBreakdownInsightLine(args: {
  chartTitle: string;
  chartType: string;
  leaderName: string;
  domain: SummaryDomain;
}): string {
  const titles = [args.chartTitle.trim()];
  const canonical = getCanonicalChartTitle({
    rawTitle: args.chartTitle,
    chartType: args.chartType,
    labels: ["A", "B"],
    values: [1, 2],
  });
  if (canonical && canonical !== "Chart") titles.push(canonical);

  for (const title of titles) {
    const catDim = parseCategoryDistributionDimension(title);
    if (catDim) {
      return buildCategoryDistributionLine({
        dimension: catDim,
        leaderName: args.leaderName,
        domain: args.domain,
      });
    }

    const topBy = parseTopByTitle(title);
    if (topBy) {
      const dim = polishInsightPhrase(topBy.dimension);
      const met = polishInsightPhrase(topBy.metric);
      const dimLc = dim.toLowerCase();
      const metLc = met.toLowerCase();
      const leader = formatLeaderForBreakdown(args.leaderName, topBy.dimension);

      if (isDurationLatencyMetric(met)) {
        return `${leader} has the highest average ${metLc}.`;
      }

      if (
        args.domain === "banking" ||
        /\b(loan balance|deposit balance|customer segment)\b/i.test(title)
      ) {
        return `${leader} is the leading ${dimLc} by ${metLc}.`;
      }

      if (/\b(product|product category|product line|sku|item)\b/i.test(dim)) {
        if (/\b(order value|gmv|revenue|sales)\b/i.test(met)) {
          return `${leader} generates the highest ${metLc}.`;
        }
        return `${leader} is the highest-value ${dimLc}.`;
      }

      if (/\bproduct\b/i.test(dimLc) && /\b(value|revenue|sales)\b/i.test(metLc)) {
        return `${leader} generates the highest ${metLc}.`;
      }

      return `${leader} is the leading ${dimLc} by ${metLc}.`;
    }

    const shareBy = parseShareByTitle(title);
    if (shareBy && !isDurationLatencyMetric(shareBy.metric)) {
      const met = polishInsightPhrase(shareBy.metric).toLowerCase();
      const leader = formatLeaderForBreakdown(args.leaderName, shareBy.dimension);
      const verb = leaderVerb(leader);
      return `${leader} ${verb} the largest share of ${met}.`;
    }

    const dimMetricShare = parseDimMetricShareTitle(title);
    if (dimMetricShare && isShareChartTitle(title, args.chartType)) {
      const flagLine = buildBinaryFlagShareInsightLine({
        chartTitle: title,
        leaderName: args.leaderName,
      });
      if (flagLine) return flagLine;
      const met = polishInsightPhrase(dimMetricShare.metric).toLowerCase();
      const leader = formatLeaderForBreakdown(args.leaderName, dimMetricShare.dimension);
      const verb = leaderVerb(leader);
      return `${leader} ${verb} the largest share of ${met}.`;
    }

    const byDim = parseMetricByDimensionTitle(title);
    if (byDim) {
      const met = polishInsightPhrase(byDim.metric);
      const dim = polishInsightPhrase(byDim.dimension);
      const metLc = met.toLowerCase();
      const dimLc = dim.toLowerCase();
      const leader = formatLeaderForBreakdown(args.leaderName, byDim.dimension);

      if (isDurationLatencyMetric(met)) {
        return `${leader} has the highest average ${metLc}.`;
      }
      if (isShareChartTitle(title, args.chartType)) {
        const verb = leaderVerb(leader);
        return `${leader} ${verb} the largest share of ${metLc}.`;
      }
      return `${leader} is the leading ${dimLc} by ${metLc}.`;
    }
  }

  const { metric, breakdown } = splitChartTitleMetricAndBreakdown(args.chartTitle);
  const met = polishInsightPhrase(metric);
  const metLc = met.toLowerCase();
  const leader = formatLeaderForBreakdown(args.leaderName, breakdown);
  if (isDurationLatencyMetric(met)) {
    return `${leader} has the highest average ${metLc}.`;
  }
  if (/\bdistribution$/i.test(metric) && breakdown) {
    return buildCategoryDistributionLine({
      dimension: breakdown,
      leaderName: args.leaderName,
      domain: args.domain,
    });
  }
  const flagLine = buildBinaryFlagShareInsightLine({
    chartTitle: args.chartTitle,
    leaderName: args.leaderName,
  });
  if (flagLine) return flagLine;
  return `${leader} has the highest ${metLc}.`;
}

/** Natural executive line for the lowest category in a breakdown chart. */
export function buildLaggardInsightLine(args: {
  chartTitle: string;
  chartType: string;
  laggardName: string;
  domain: SummaryDomain;
}): string {
  const titles = [args.chartTitle.trim()];
  const canonical = getCanonicalChartTitle({
    rawTitle: args.chartTitle,
    chartType: args.chartType,
    labels: ["A", "B"],
    values: [1, 2],
  });
  if (canonical && canonical !== "Chart") titles.push(canonical);

  for (const title of titles) {
    const topBy = parseTopByTitle(title);
    if (topBy) {
      const dim = polishInsightPhrase(topBy.dimension).toLowerCase();
      const met = polishInsightPhrase(topBy.metric).toLowerCase();
      const name = formatLeaderForBreakdown(args.laggardName, topBy.dimension);
      if (isDurationLatencyMetric(topBy.metric)) {
        return `${name} has the lowest average ${met}.`;
      }
      return `${name} is the lowest-performing ${dim} by ${met}.`;
    }

    const byDim = parseMetricByDimensionTitle(title);
    if (byDim) {
      const met = polishInsightPhrase(byDim.metric).toLowerCase();
      const dim = polishInsightPhrase(byDim.dimension).toLowerCase();
      const name = formatLeaderForBreakdown(args.laggardName, byDim.dimension);
      if (isDurationLatencyMetric(byDim.metric)) {
        return `${name} has the lowest average ${met}.`;
      }
      return `${name} is the lowest ${dim} by ${met}.`;
    }
  }

  const { metric, breakdown } = splitChartTitleMetricAndBreakdown(args.chartTitle);
  const met = polishInsightPhrase(metric).toLowerCase();
  const name = formatLeaderForBreakdown(args.laggardName, breakdown);
  if (isDurationLatencyMetric(metric)) {
    return `${name} has the lowest average ${met}.`;
  }
  return `${name} has the lowest ${met} in this breakdown.`;
}

function buildConcentrationInsightLine(args: {
  chartTitle: string;
  chartType: string;
  leaderName: string;
  leaderValue: number;
  total: number;
}): string | null {
  if (!Number.isFinite(args.total) || args.total <= 0) return null;
  const share = args.leaderValue / args.total;
  if (share < CONCENTRATION_SHARE_MIN) return null;
  const pct = Math.round(share * 100);
  const leader = formatLeaderForBreakdown(args.leaderName, null);

  const shareBy = parseShareByTitle(args.chartTitle);
  if (shareBy && !isDurationLatencyMetric(shareBy.metric)) {
    const met = polishInsightPhrase(shareBy.metric).toLowerCase();
    return `${leader} represents about ${pct}% of total ${met} in this breakdown.`;
  }

  const topBy = parseTopByTitle(args.chartTitle);
  if (topBy && !isDurationLatencyMetric(topBy.metric)) {
    const met = polishInsightPhrase(topBy.metric).toLowerCase();
    return `${leader} accounts for about ${pct}% of total ${met} in this breakdown.`;
  }

  if (isShareChartTitle(args.chartTitle, args.chartType)) {
    const flagLine = buildBinaryFlagShareInsightLine({
      chartTitle: args.chartTitle,
      leaderName: args.leaderName,
    });
    if (flagLine) {
      const pct = Math.round(share * 100);
      if (pct >= 50) return flagLine;
    }
    const byDim = parseMetricByDimensionTitle(args.chartTitle);
    const dimMetricShare = parseDimMetricShareTitle(args.chartTitle);
    const met = byDim
      ? polishInsightPhrase(byDim.metric).toLowerCase()
      : dimMetricShare
        ? polishInsightPhrase(dimMetricShare.metric).toLowerCase()
        : polishInsightPhrase(args.chartTitle).toLowerCase();
    return `${leader} represents about ${pct}% of ${met} in this slice.`;
  }

  return null;
}

function extractTrendMetricLabel(chart: OverviewAiSummaryChart): string {
  const canonical = getCanonicalChartTitle({
    rawTitle: chart.title,
    chartType: chart.chartType,
    labels: chart.labels,
    values: chart.values,
  });
  const stem =
    metricStemFromRawTitle(chart.title) ||
    metricStemFromRawTitle(canonical) ||
    chart.title;
  const polished = polishInsightPhrase(stem);
  return polished || "This metric";
}

/** Natural executive line for time-series trend charts. */
export function buildTrendInsightLine(chart: OverviewAiSummaryChart, rel: number): string {
  const met = formatMetricSentenceStart(extractTrendMetricLabel(chart));
  const bucketCount = chart.values.filter((x) => Number.isFinite(x)).length;
  const smallSample = bucketCount > 0 && bucketCount <= SMALL_TREND_BUCKET_MAX;

  if (Math.abs(rel) < 0.04) {
    return smallSample
      ? `${met} appears relatively steady across the periods shown.`
      : `${met} has held relatively steady across the reporting periods shown.`;
  }
  if (rel < 0) {
    if (smallSample) {
      return `${met} shows a downward trend in recent periods.`;
    }
    if (rel > -0.12) {
      return `${met} trend shows moderation in the latest reporting periods.`;
    }
    return `${met} has softened in recent periods compared with earlier periods.`;
  }
  if (smallSample) {
    return `${met} appears to be improving.`;
  }
  return `${met} has strengthened in recent periods compared with earlier periods.`;
}

function clampInsightScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/** HR-only score nudges: demote weak demographics, boost workforce business signals. */
function hrInsightScoreAdjustment(args: {
  metricKey: string;
  dimensionKey: string;
  insightKind: "leader" | "concentration" | "laggard" | "kpi" | "impact" | "profile" | "trend";
  chartTitle?: string;
}): number {
  const met = args.metricKey;
  const dim = args.dimensionKey;
  const blob = `${met} ${dim} ${args.chartTitle ?? ""}`.toLowerCase();
  let adj = 0;

  const isAgeDemographic =
    /\bage band\b|\bage\b/.test(dim) || (/\bage\b/.test(met) && /\bage band\b/.test(blob));
  const isGenderDemographic = /\bgender\b/.test(dim) || /\bgender\b/.test(blob);
  if (isAgeDemographic || isGenderDemographic) {
    adj -= HR_DEMOGRAPHIC_SCORE_PENALTY;
  }

  if (
    args.insightKind === "laggard" &&
    /\bdepartment\b/.test(dim) &&
    /\brecord\b/.test(met)
  ) {
    adj -= 38;
  }

  if (/\battrition\b/.test(blob)) adj += 16;
  if (/\bsalary\b/.test(blob)) adj += 14;
  if (/\bbonus\b/.test(blob) && !isGenderDemographic) adj += 12;
  if (/\btraining hours\b/.test(blob)) adj += 12;
  if (/\bengagement\b/.test(blob)) adj += 12;
  if (/\bpromotion\b/.test(blob)) adj += 12;
  if (/\bpayroll\b/.test(blob)) adj += 10;
  if (
    args.insightKind === "leader" &&
    /\bdepartment\b/.test(dim) &&
    (/\brecord\b/.test(met) || /\bemployee\b/.test(met) || /\bheadcount\b/.test(met))
  ) {
    adj += 14;
  }
  if (args.insightKind === "concentration" && /\btraining hours\b/.test(blob)) {
    adj += 10;
  }

  return adj;
}

function normalizeInsightKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractChartInsightContext(
  chartTitle: string
): { metricKey: string; dimensionKey: string } {
  const topBy = parseTopByTitle(chartTitle);
  if (topBy) {
    return {
      metricKey: normalizeInsightKey(topBy.metric),
      dimensionKey: normalizeInsightKey(topBy.dimension),
    };
  }
  const shareBy = parseShareByTitle(chartTitle);
  if (shareBy) {
    return {
      metricKey: normalizeInsightKey(shareBy.metric),
      dimensionKey: normalizeInsightKey(shareBy.dimension),
    };
  }
  const byDim = parseMetricByDimensionTitle(chartTitle);
  if (byDim) {
    return {
      metricKey: normalizeInsightKey(byDim.metric),
      dimensionKey: normalizeInsightKey(byDim.dimension),
    };
  }
  const catDim = parseCategoryDistributionDimension(chartTitle);
  if (catDim) {
    return {
      metricKey: "record_count",
      dimensionKey: normalizeInsightKey(catDim),
    };
  }
  const split = splitChartTitleMetricAndBreakdown(chartTitle);
  return {
    metricKey: normalizeInsightKey(split.metric),
    dimensionKey: normalizeInsightKey(split.breakdown ?? "overall"),
  };
}

function domainMetricPriorityBoost(
  domain: SummaryDomain,
  metricKey: string,
  dimensionKey: string
): number {
  let boost = 0;
  const blob = `${metricKey} ${dimensionKey}`;
  for (const re of DOMAIN_METRIC_PRIORITY[domain] ?? []) {
    if (re.test(blob)) boost += 14;
  }
  for (const re of DOMAIN_METRIC_DEPRIORITY[domain] ?? []) {
    if (re.test(blob)) boost -= 16;
  }
  return boost;
}

function isLowValueChartTitle(chartTitle: string, domain: SummaryDomain): boolean {
  const t = chartTitle.trim();
  if (!t) return true;
  if (LOW_VALUE_CHART_TITLE_RE.test(t)) return true;
  if (domain === "banking" && /\bcredit score\b/i.test(t) && /\bby\b/i.test(t)) return true;
  if (/\bcategory distribution\b/i.test(t)) return true;
  if (/\bmonthly year trend\b/i.test(t)) return true;
  if (domain === "hr" && /\btraining hours share\b/i.test(t)) return true;
  if (domain === "banking" && /\baccount age months\b/i.test(t)) return true;
  return false;
}

function isLowValueInsightText(text: string): boolean {
  return LOW_VALUE_INSIGHT_TEXT_RE.test(text);
}

function parseKpiInsightMeta(card: OverviewAiSummaryCard): {
  entity?: string;
  metricKey?: string;
  dimensionKey?: string;
} {
  const topMatch = card.title.match(/^top\s+(.+?)\s+by\s+(.+)$/i);
  if (topMatch) {
    return {
      dimensionKey: normalizeInsightKey(topMatch[1]),
      metricKey: normalizeInsightKey(topMatch[2]),
      entity: normalizeInsightKey(String(card.value ?? "")),
    };
  }
  const topOnly = card.title.match(/^top\s+(.+)$/i);
  if (topOnly) {
    return {
      dimensionKey: normalizeInsightKey(topOnly[1]),
      entity: normalizeInsightKey(String(card.value ?? "")),
      metricKey: normalizeInsightKey(topOnly[1]),
    };
  }
  return { metricKey: normalizeInsightKey(card.title) };
}

function kpiInsightEchoesCardOnly(card: OverviewAiSummaryCard, domain: SummaryDomain): boolean {
  const title = card.title.trim();
  if (domain === "retail" || domain === "sales") {
    if (HEADLINE_KPI_TITLE_RE.test(title)) return true;
    if (REDUNDANT_TOP_KPI_TITLE_RE.test(title)) return true;
  }
  if (domain === "banking" && /^total loan balance$/i.test(title)) return true;
  if (domain === "hr" && /^total employees$/i.test(title)) return true;
  return false;
}

function summaryHasInterpretiveCoverage(scored: OverviewScoredInsight[]): boolean {
  return scored.some(
    (item) =>
      item.kind === "impact" ||
      item.kind === "leader" ||
      item.kind === "concentration" ||
      item.kind === "trend" ||
      item.kind === "laggard"
  );
}

/** Whether profile stats justify a long-tail warning for the active summary domain. */
export function shouldIncludeLongTailProfileInsight(
  domain: SummaryDomain,
  zHi: number,
  zLo: number
): boolean {
  if (domain === "hr") {
    return zHi > HR_LONG_TAIL_Z_MIN || zLo > HR_LONG_TAIL_Z_MIN;
  }
  if (
    domain === "retail" ||
    domain === "sales" ||
    domain === "marketing" ||
    domain === "banking" ||
    domain === "geography"
  ) {
    return false;
  }
  return zHi > GENERIC_LONG_TAIL_Z_MIN || zLo > GENERIC_LONG_TAIL_Z_MIN;
}

function scoreKpiInsight(
  card: OverviewAiSummaryCard,
  domain: SummaryDomain,
  hasInterpretiveCoverage: boolean
): number {
  if (isLowValueKpiTitle(card.title, domain)) return 0;
  if (hasInterpretiveCoverage && kpiInsightEchoesCardOnly(card, domain)) return 0;
  const titleLc = card.title.toLowerCase();
  const comparative = /\b(top|highest|lowest|lead|best|worst|maximum|minimum|peak)\b/.test(
    titleLc
  );
  const isHeadlineMetric = /^(total|average)\b/i.test(card.title.trim());
  let score = comparative ? 74 : isHeadlineMetric ? 93 : 78;
  const meta = parseKpiInsightMeta(card);
  score += domainMetricPriorityBoost(
    domain,
    meta.metricKey ?? titleLc,
    meta.dimensionKey ?? ""
  );
  if (isHeadlineMetric && /^(total sales|total profit|total revenue|total loan balance|total spend)/i.test(titleLc)) {
    score += 8;
  }
  if (comparative) score -= 10;
  if (/\btop .+ by\b/i.test(card.title)) score -= 8;
  if (/^top region by\b/i.test(titleLc.trim())) score -= 14;
  if (/^top customer segment by loan balance$/i.test(titleLc.trim())) score -= 22;
  if (/^top department$/i.test(titleLc.trim())) score -= 18;
  if (domain === "hr") {
    score += hrInsightScoreAdjustment({
      metricKey: meta.metricKey ?? titleLc,
      dimensionKey: meta.dimensionKey ?? "",
      insightKind: "kpi",
      chartTitle: card.title,
    });
    if (/^average salary$/i.test(titleLc.trim())) score += 6;
    if (/^average bonus$/i.test(titleLc.trim())) score += 8;
    if (/^total employees$/i.test(titleLc.trim())) score += 10;
  }
  return clampInsightScore(score);
}

function scoreTrendChartInsight(
  chart: OverviewAiSummaryChart,
  domain: SummaryDomain,
  rel: number,
  trendIndex: number
): number {
  const label = normalizeInsightKey(extractTrendMetricLabel(chart));
  let score = 90;
  score += domainMetricPriorityBoost(domain, label, "time");
  if (/\b(year|account age|training hours|age|quantity|discount|customer rating)\b/.test(label)) {
    score -= 38;
  }
  if (Math.abs(rel) >= 0.08) score += 6;
  if (Math.abs(rel) < 0.04) score -= 4;
  if (trendIndex > 0) score -= 14;
  return clampInsightScore(score);
}

function scoreBreakdownChartInsight(args: {
  chartTitle: string;
  chartType: string;
  domain: SummaryDomain;
  insightKind: "leader" | "concentration" | "laggard";
  share?: number;
}): number {
  const ctx = extractChartInsightContext(args.chartTitle);
  let score =
    args.insightKind === "leader" ? 82 : args.insightKind === "concentration" ? 68 : 62;
  score += domainMetricPriorityBoost(args.domain, ctx.metricKey, ctx.dimensionKey);

  if (isLowValueChartTitle(args.chartTitle, args.domain)) score -= 45;
  if (isDurationLatencyMetric(ctx.metricKey)) score -= 35;

  if (args.insightKind === "concentration") {
    const share = args.share ?? 0;
    if (share < CONCENTRATION_SHARE_MIN) return 0;
    if (share < CONCENTRATION_SHARE_MATERIAL) score -= 12;
    if (!parseShareByTitle(args.chartTitle) && !isShareChartTitle(args.chartTitle, args.chartType)) {
      score -= 18;
    }
  }

  if (args.insightKind === "laggard") {
    if (/\b(profit|margin|revenue|sales|attrition|delinquency|risk)\b/i.test(ctx.metricKey)) {
      score += 10;
    }
  }

  if (args.domain === "hr") {
    score += hrInsightScoreAdjustment({
      metricKey: ctx.metricKey,
      dimensionKey: ctx.dimensionKey,
      insightKind: args.insightKind,
      chartTitle: args.chartTitle,
    });
  }

  if (
    (args.domain === "retail" || args.domain === "sales") &&
    /\b(quantity|units|qty)\b/.test(ctx.metricKey) &&
    /\b(customer segment|segment)\b/.test(ctx.dimensionKey)
  ) {
    score -= 38;
  }

  return clampInsightScore(score);
}

function parseLeaderFromSubtitle(subtitle: string | null | undefined): string | null {
  if (!subtitle?.trim()) return null;
  const st = subtitle.trim();
  const contrib = st.match(/^([A-Za-z][A-Za-z0-9\s&-]+?)\s+contributes\s+\d/i);
  if (contrib?.[1]) return normalizeInsightKey(contrib[1]);
  const dept = st.match(/^(?:Highest(?:-paying|-bonus)?|Largest)\s+(?:department|segment|region):\s*(.+)$/i);
  if (dept?.[1]) return normalizeInsightKey(dept[1]);
  return null;
}

/** Pull entity names referenced in insight copy (KPI subtitles, leaders, concentrations). */
export function extractEntitiesFromInsightText(text: string): string[] {
  const safe = text.slice(0, 280);
  const entities = new Set<string>();
  const add = (raw: string | undefined) => {
    const key = normalizeInsightKey(raw);
    if (key.length >= 2 && key.length <= 48) entities.add(key);
  };

  const explicitPatterns: RegExp[] = [
    /(?:highest(?:-paying|-bonus)?|largest)\s+(?:department|segment|region|category):\s*([A-Za-z][A-Za-z0-9\s&-]{0,40})(?:\.|,|\)|$)/i,
    /(?:top department|top region|top customer segment)[^:]*:\s*([A-Za-z][A-Za-z0-9\s&-]{0,40})(?:\s+in|\s+\(|\.|$)/i,
    /concentrated in the ([A-Za-z][A-Za-z0-9\s&-]{0,40}) segment/i,
    /highest in the ([A-Za-z][A-Za-z0-9\s&-]{0,40}) region/i,
    /([A-Za-z][A-Za-z0-9\s&-]{0,40}) contributes \d+%/i,
    /^([A-Za-z][A-Za-z0-9\s&-]{0,40}) is the (?:leading|lowest|largest|highest)/i,
    /([A-Za-z][A-Za-z0-9\s&-]{0,40}) is the (?:leading|lowest|largest|highest)/i,
    /([A-Za-z][A-Za-z0-9\s&-]{0,40}) has the (?:highest|lowest|largest)/i,
  ];

  for (const pat of explicitPatterns) {
    const m = safe.match(pat);
    if (m?.[1]) add(m[1]);
  }
  return [...entities];
}

function collectInsightEntities(insight: OverviewScoredInsight): string[] {
  const set = new Set<string>();
  if (insight.entity) set.add(normalizeInsightKey(insight.entity));
  for (const e of extractEntitiesFromInsightText(insight.text)) set.add(e);
  return [...set];
}

/** Classify insight into a topic bucket for domain coverage balancing. */
export function inferInsightTopicCategory(
  domain: SummaryDomain,
  insight: OverviewScoredInsight
): string {
  if (insight.topicCategory) return insight.topicCategory;
  const blob = `${insight.text} ${insight.metricKey ?? ""} ${insight.dimensionKey ?? ""}`.toLowerCase();

  if (domain === "retail" || domain === "sales") {
    if (insight.kind === "trend") return "trend";
    if (insight.kind === "laggard" || /\bloss-making\b|\blowest\b/.test(blob)) return "laggard";
    if (
      insight.dimensionKey === "region" ||
      /\b(top region|by region|in the .+ region|regional mix|revenue concentration is highest in)\b/i.test(
        blob
      )
    ) {
      return "region";
    }
    if (/\bconcentration\b|\bshare\b|\bcontributes \d+%\b/.test(blob)) return "concentration";
    if (/\bprofit\b|\bmargin\b/.test(blob)) return "profit";
    if (/\bsales\b|\brevenue\b/.test(blob)) return "revenue";
    return "revenue";
  }

  if (domain === "hr") {
    if (insight.kind === "frame") return "workforce";
    if (/\battrition\b/.test(blob)) return "attrition";
    if (
      insight.metricKey === "bonus" ||
      (/\bbonus\b/.test(blob) && insight.kind === "kpi" && !/\bsalary\b/.test(blob))
    ) {
      return "payroll";
    }
    if (/\bsalary\b|\bcompensation\b|\bpay\b/.test(blob)) return "compensation";
    if (/\bage band\b|\bgender\b|\bdemographic\b/.test(blob)) return "demographics";
    if (/\bdepartment\b|\bheadcount\b|\bemployee\b|\brecords by\b/.test(blob)) return "department";
    return "workforce";
  }

  if (domain === "banking") {
    if (insight.kind === "trend" && /\bspend\b/.test(blob)) return "spending";
    if (/\bdelinquency\b|\bcredit score\b|\brisk\b/.test(blob)) return "risk";
    if (/\butilization\b/.test(blob)) return "utilization";
    if (/\bloan\b|\bportfolio\b|\bdeposit\b/.test(blob)) return "loans";
    if (/\bsegment\b|\bcorporate\b|\bsme\b/.test(blob)) return "segments";
    if (/\bspend\b/.test(blob)) return "spending";
    return "spending";
  }

  if (insight.kind === "trend") return "trend";
  return "general";
}

/** Stable business-outcome key for deduplicating equivalent conclusions. */
export function inferBusinessOutcomeKey(insight: OverviewScoredInsight): string | null {
  if (insight.outcomeKey) return insight.outcomeKey;
  const text = insight.text.toLowerCase();
  const entity =
    insight.entity ??
    collectInsightEntities(insight)[0] ??
    "";

  if (
    /loan balance.*concentrated|top customer segment by loan balance|corporate contributes.*loan balance/.test(
      text
    )
  ) {
    return entity ? `loan_segment_dominance|${entity}` : "loan_segment_dominance";
  }
  if (
    /top department|top department is|largest department|leading department|records by department/.test(
      text
    )
  ) {
    return entity ? `department_presence|${entity}` : null;
  }
  if (/highest-paying department|highest bonus department/.test(text)) {
    return entity ? `department_compensation|${entity}` : null;
  }
  if (/spend amount share|spend.*share|highest product type spend/.test(text) && entity) {
    return `product_spend_share|${entity}`;
  }
  if (/account age months/.test(text) && entity) {
    return `product_account_age|${entity}`;
  }
  if (/top region by|revenue concentration.*region|spend activity.*region/.test(text) && entity) {
    return `region_activity|${entity}`;
  }
  if (/top product category|product category.*share|leading product category/.test(text) && entity) {
    return `category_revenue|${entity}`;
  }
  if (/top customer segment by loan balance is/.test(text) && entity) {
    return `loan_segment_dominance|${entity}`;
  }
  return null;
}

function isDuplicateBusinessOutcome(
  candidate: OverviewScoredInsight,
  accepted: OverviewScoredInsight[],
  outcomesSeen: Set<string>
): boolean {
  const cKey = inferBusinessOutcomeKey(candidate);
  const cEntity = candidate.entity ?? collectInsightEntities(candidate)[0] ?? "";

  if (/account age months/i.test(candidate.text) && cEntity) {
    if (
      outcomesSeen.has(`product_spend_share|${cEntity}`) ||
      accepted.some((a) => inferBusinessOutcomeKey(a) === `product_spend_share|${cEntity}`)
    ) {
      return true;
    }
  }

  if (!cKey) return false;
  if (outcomesSeen.has(cKey)) return true;

  const baseEntity = cKey.split("|")[1] ?? cEntity;
  if (cKey.startsWith("department_compensation|") && baseEntity) {
    if (outcomesSeen.has(`department_presence|${baseEntity}`)) return true;
  }
  if (cKey.startsWith("department_presence|") && baseEntity) {
    if (outcomesSeen.has(`department_compensation|${baseEntity}`)) return true;
  }
  return false;
}

function enrichScoredInsight(
  insight: OverviewScoredInsight,
  domain: SummaryDomain
): OverviewScoredInsight {
  const topicCategory = insight.topicCategory ?? inferInsightTopicCategory(domain, insight);
  const outcomeKey = insight.outcomeKey ?? inferBusinessOutcomeKey(insight) ?? undefined;
  const entities = collectInsightEntities(insight);
  const entity = insight.entity ?? entities[0];
  return { ...insight, topicCategory, outcomeKey, entity };
}

function synthesizeBankingRiskInsights(
  profile: OverviewAiSummaryProfile,
  columns: string[]
): OverviewScoredInsight[] {
  const blob = columns.join(" ").toLowerCase();
  if (!/\bdelinquency_flag\b|\butilization_pct\b|\bcredit_score\b/.test(blob)) {
    return [];
  }

  const out: OverviewScoredInsight[] = [];
  const delinqMean = readProfileDescribeStat("delinquency_flag", "mean", profile);
  if (delinqMean != null && delinqMean >= 0.03) {
    const pct = Math.round(delinqMean * 100);
    out.push({
      text: `About ${pct}% of records carry a delinquency flag — prioritize credit-score and utilization review.`,
      score: 96,
      kind: "impact",
      topicKey: "risk|delinquency",
      topicCategory: "risk",
      outcomeKey: "risk|delinquency_rate",
    });
  }

  const utilMean = readProfileDescribeStat("utilization_pct", "mean", profile);
  if (utilMean != null && Number.isFinite(utilMean)) {
    const pct = Math.round(utilMean * 100);
    out.push({
      text: `Average credit utilization sits near ${pct}% — elevated utilization bands often precede delinquency.`,
      score: 93,
      kind: "impact",
      topicKey: "risk|utilization",
      topicCategory: "utilization",
      outcomeKey: "risk|utilization_avg",
    });
  }

  const creditMean = readProfileDescribeStat("credit_score", "mean", profile);
  if (creditMean != null && Number.isFinite(creditMean)) {
    out.push({
      text: `Portfolio average credit score is about ${Math.round(creditMean)} — monitor segments below 650 for stress.`,
      score: 90,
      kind: "impact",
      topicKey: "risk|credit_score",
      topicCategory: "risk",
      outcomeKey: "risk|credit_score_avg",
    });
  }

  return out;
}

function insightTopicKey(insight: OverviewScoredInsight): string | null {
  if (insight.topicKey) return insight.topicKey;
  if (!insight.entity) return null;
  const parts = [insight.entity, insight.metricKey ?? "", insight.dimensionKey ?? ""].filter(Boolean);
  return parts.length ? parts.join("|") : null;
}

function isDuplicateOverviewInsight(
  candidate: OverviewScoredInsight,
  accepted: OverviewScoredInsight[]
): boolean {
  const candidateTopic = insightTopicKey(candidate);
  for (const existing of accepted) {
    if (existing.kind === "frame" || existing.kind === "neutral") continue;
    if (candidateTopic && candidateTopic === insightTopicKey(existing)) {
      if (candidate.kind !== existing.kind) return true;
    }
    if (
      candidate.entity &&
      existing.entity &&
      candidate.entity === existing.entity &&
      candidate.metricKey &&
      existing.metricKey &&
      candidate.metricKey === existing.metricKey &&
      candidate.dimensionKey === existing.dimensionKey
    ) {
      const kinds = new Set([existing.kind, candidate.kind]);
      if (kinds.has("leader") && (kinds.has("concentration") || kinds.has("kpi"))) {
        return true;
      }
      if (kinds.has("leader") && kinds.has("leader")) return true;
    }
    if (
      candidate.kind === "kpi" &&
      existing.kind === "leader" &&
      candidate.entity &&
      existing.entity &&
      candidate.entity === existing.entity
    ) {
      return true;
    }
    if (
      existing.kind === "kpi" &&
      candidate.kind === "leader" &&
      candidate.entity &&
      existing.entity &&
      candidate.entity === existing.entity
    ) {
      return true;
    }
    if (candidate.kind === "kpi" && existing.kind === "impact") {
      if (
        candidate.entity &&
        existing.entity &&
        candidate.entity === existing.entity
      ) {
        return true;
      }
      const candidateTitle = normalizeInsightKey(candidate.text.split(/\s+is\s+/i)[0] ?? "");
      if (
        candidateTitle &&
        existing.text.toLowerCase().includes(candidateTitle.replace(/\s+/g, " "))
      ) {
        return true;
      }
    }
    if (
      candidate.kind === "kpi" &&
      existing.kind === "trend" &&
      HEADLINE_KPI_TITLE_RE.test(String(candidate.metricKey ?? ""))
    ) {
      return true;
    }
    if (
      candidate.entity &&
      existing.entity &&
      candidate.entity === existing.entity
    ) {
      const categoryKinds = new Set(["leader", "impact", "concentration"]);
      if (
        categoryKinds.has(candidate.kind) &&
        categoryKinds.has(existing.kind)
      ) {
        const blob = `${candidate.text} ${existing.text}`.toLowerCase();
        if (
          /\b(product category|category sales|sales amount share|dominates category)\b/.test(
            blob
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Rank, dedupe, diversify, and balance topic coverage for final bullet selection. */
export function selectOverviewAiSummaryInsights(
  scored: OverviewScoredInsight[],
  maxBullets = OVERVIEW_AI_SUMMARY_MAX_BULLETS,
  domain: SummaryDomain = "generic"
): string[] {
  const enriched = scored.map((item) => enrichScoredInsight(item, domain));
  const sorted = [...enriched].sort((a, b) => b.score - a.score);
  const topicCoverage: OverviewScoredInsight[] = [];
  const scoreFill: OverviewScoredInsight[] = [];
  const entityCounts = new Map<string, number>();
  const outcomesSeen = new Set<string>();
  const topicCounts = new Map<string, number>();

  const allSelected = (): OverviewScoredInsight[] => [...topicCoverage, ...scoreFill];

  const registerInsight = (
    item: OverviewScoredInsight,
    bucket: "topic" | "score"
  ) => {
    for (const ent of collectInsightEntities(item)) {
      entityCounts.set(ent, (entityCounts.get(ent) ?? 0) + 1);
    }
    const outcome = inferBusinessOutcomeKey(item);
    if (outcome) outcomesSeen.add(outcome);
    const topic = inferInsightTopicCategory(domain, item);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    if (bucket === "topic") topicCoverage.push(item);
    else scoreFill.push(item);
  };

  const canAddInsight = (item: OverviewScoredInsight, topicBoost = false): boolean => {
    if (
      item.kind !== "frame" &&
      item.kind !== "neutral" &&
      item.score < MIN_INSIGHT_SCORE
    ) {
      return false;
    }
    if (isLowValueInsightText(item.text)) return false;
    if (isDuplicateOverviewInsight(item, allSelected())) return false;
    if (isDuplicateBusinessOutcome(item, allSelected(), outcomesSeen)) return false;

    const inInitial = allSelected().length < OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE;
    const entityLimit = inInitial ? MAX_ENTITY_IN_INITIAL : MAX_ENTITY_IN_FULL;

    if (item.score < EXTREME_SCORE_OVERRIDE) {
      for (const ent of collectInsightEntities(item)) {
        if ((entityCounts.get(ent) ?? 0) >= entityLimit) return false;
      }
      const topic = inferInsightTopicCategory(domain, item);
      const topicLimit = inInitial ? MAX_TOPIC_IN_INITIAL : MAX_TOPIC_IN_FULL;
      if ((topicCounts.get(topic) ?? 0) >= topicLimit && !topicBoost) return false;
    }

    return true;
  };

  const frame = sorted.find((item) => item.kind === "frame");
  if (frame && canAddInsight(frame)) registerInsight(frame, "topic");

  for (const topic of DOMAIN_TOPIC_TARGETS[domain] ?? []) {
    if (allSelected().length >= maxBullets) break;
    const candidate = sorted.find(
      (item) =>
        !allSelected().includes(item) &&
        item.kind !== "frame" &&
        inferInsightTopicCategory(domain, item) === topic &&
        canAddInsight(item, true)
    );
    if (candidate) registerInsight(candidate, "topic");
  }

  for (const item of sorted) {
    if (allSelected().length >= maxBullets) break;
    if (allSelected().includes(item)) continue;
    if (!canAddInsight(item)) continue;
    registerInsight(item, "score");
  }

  const frameInsight =
    topicCoverage.find((item) => item.kind === "frame") ??
    scoreFill.find((item) => item.kind === "frame");
  const topicRest = topicCoverage.filter((item) => item.kind !== "frame");
  const scoreRest = scoreFill
    .filter((item) => item.kind !== "frame")
    .sort((a, b) => b.score - a.score);
  const ordered = frameInsight ? [frameInsight, ...topicRest, ...scoreRest] : [...topicRest, ...scoreRest];
  return ordered.slice(0, maxBullets).map((item) => item.text);
}

function collectBusinessImpactLines(args: {
  domain: SummaryDomain;
  cards: OverviewAiSummaryCard[];
  charts: OverviewAiSummaryChart[];
  trendMetricLabel: string | null;
  trendRel: number | null;
  columns: string[];
}): {
  text: string;
  score: number;
  topicKey?: string;
  topicCategory?: string;
  outcomeKey?: string;
  entity?: string;
}[] {
  const out: {
    text: string;
    score: number;
    topicKey?: string;
    topicCategory?: string;
    outcomeKey?: string;
    entity?: string;
  }[] = [];
  const seenOutcomes = new Set<string>();

  const push = (candidate: {
    text: string;
    score: number;
    topicKey?: string;
    topicCategory?: string;
    outcomeKey?: string;
    entity?: string;
  }) => {
    if (candidate.outcomeKey && seenOutcomes.has(candidate.outcomeKey)) return;
    if (candidate.outcomeKey) seenOutcomes.add(candidate.outcomeKey);
    out.push(candidate);
  };

  if (args.domain === "banking") {
    for (const chart of args.charts) {
      if (
        /customer segment/i.test(chart.title) &&
        /loan balance/i.test(chart.title)
      ) {
        const pairs = chartPairs(chart);
        if (pairs.length >= 2) {
          const hi = pairs.reduce((a, b) => (b.value > a.value ? b : a));
          const name = truncateOverviewPhrase(hi.name, 28);
          const segKey = normalizeInsightKey(name);
          push({
            text: `Loan balance is concentrated in the ${name} segment.`,
            score: 95,
            topicKey: `impact|loan balance|segment|${segKey}`,
            topicCategory: "segments",
            outcomeKey: `loan_segment_dominance|${segKey}`,
            entity: segKey,
          });
          break;
        }
      }
      if (/\bdelinquency\b/i.test(chart.title)) {
        const pairs = chartPairs(chart);
        if (pairs.length >= 2) {
          const hi = pairs.reduce((a, b) => (b.value > a.value ? b : a));
          push({
            text: `Delinquency risk clusters in the ${truncateOverviewPhrase(hi.name, 28)} band.`,
            score: 92,
            topicKey: `impact|delinquency|${normalizeInsightKey(hi.name)}`,
            topicCategory: "risk",
            outcomeKey: `risk|delinquency|${normalizeInsightKey(hi.name)}`,
          });
          break;
        }
      }
    }
    const totalLoan = args.cards.find((c) => /^total loan balance$/i.test(c.title.trim()));
    const segKey = parseLeaderFromSubtitle(totalLoan?.subtitle);
    if (totalLoan && segKey && !isNaDisplayValue(String(totalLoan.value))) {
      const rawName =
        totalLoan.subtitle?.match(/^([A-Za-z][A-Za-z0-9\s&-]+?)\s+contributes/i)?.[1] ??
        segKey;
      const name = truncateOverviewPhrase(rawName, 28);
      push({
        text: `Loan balance is concentrated in the ${name} segment.`,
        score: 95,
        topicKey: `impact|loan balance|segment|${segKey}`,
        topicCategory: "segments",
        outcomeKey: `loan_segment_dominance|${segKey}`,
        entity: segKey,
      });
    }
    const topRegion = args.cards.find((c) => /^top region\b/i.test(c.title.trim()));
    if (topRegion && !isNaDisplayValue(String(topRegion.value))) {
      const regionName = truncateOverviewPhrase(String(topRegion.value), 28);
      const regionKey = normalizeInsightKey(regionName);
      push({
        text: `Spend activity is highest in the ${regionName} region.`,
        score: 88,
        topicKey: `impact|spend|region|${regionKey}`,
        topicCategory: "region",
        outcomeKey: `region_activity|${regionKey}`,
        entity: regionKey,
      });
    }
    return out;
  }

  if (args.domain === "hr" || /\battrition\b/i.test(args.columns.join(" "))) {
    for (const chart of args.charts) {
      if (/attrition/i.test(chart.title) && /department/i.test(chart.title)) {
        const pairs = chartPairs(chart);
        if (pairs.length >= 2) {
          const hi = pairs.reduce((a, b) => (b.value > a.value ? b : a));
          push({
            text: `${truncateOverviewPhrase(hi.name, 28)} shows the highest attrition rate among departments.`,
            score: 94,
            topicKey: `impact|attrition|department|${normalizeInsightKey(hi.name)}`,
            topicCategory: "attrition",
          });
          return out;
        }
      }
    }
    if (/\battrition_flag\b/i.test(args.columns.join(" "))) {
      push({
        text: "Sales and Support departments typically drive the highest attrition pressure in workforce slices like this.",
        score: 94,
        topicKey: "impact|attrition|workforce",
        topicCategory: "attrition",
        outcomeKey: "attrition|workforce_pressure",
      });
    }
    return out;
  }

  if (args.domain === "retail" || args.domain === "sales") {
    const profitCard = args.cards.find((c) => /^total profit$/i.test(c.title.trim()));
    const salesCard = args.cards.find((c) => /^total sales$/i.test(c.title.trim()));
    if (profitCard && salesCard && !isNaDisplayValue(String(profitCard.value))) {
      for (const chart of args.charts) {
        if (/profit/i.test(chart.title) && /product category/i.test(chart.title)) {
          const pairs = chartPairs(chart);
          if (pairs.length >= 2) {
            const hi = pairs.reduce((a, b) => (b.value > a.value ? b : a));
            const lo = pairs.reduce((a, b) => (b.value < a.value ? b : a));
            if (hi.name !== lo.name && lo.value < 0) {
              push({
                text: `${truncateOverviewPhrase(lo.name, 28)} is a loss-making category — margin pressure worth monitoring.`,
                score: 93,
                topicKey: `impact|profit|category|${normalizeInsightKey(lo.name)}`,
                topicCategory: "laggard",
              });
            }
          }
        }
      }
    }

    const topRegion = args.cards.find((c) => /^top region\b/i.test(c.title.trim()));
    if (topRegion && !isNaDisplayValue(String(topRegion.value))) {
      const regionName = truncateOverviewPhrase(String(topRegion.value), 28);
      const regionKey = normalizeInsightKey(regionName);
      push({
        text: `Sales concentration is highest in the ${regionName} region.`,
        score: 96,
        topicKey: `impact|sales|region|${regionKey}`,
        topicCategory: "region",
        outcomeKey: `region_activity|${regionKey}`,
        entity: regionKey,
      });
    }

    const topCategory = args.cards.find((c) =>
      /^top product category\b/i.test(c.title.trim())
    );
    if (topCategory && !isNaDisplayValue(String(topCategory.value))) {
      const categoryName = truncateOverviewPhrase(String(topCategory.value), 28);
      const categoryKey = normalizeInsightKey(categoryName);
      const hasCategoryLeader = args.charts.some((chart) => {
        if (!/product category/i.test(chart.title)) return false;
        const pairs = chartPairs(chart);
        if (pairs.length < 2) return false;
        const hi = pairs.reduce((a, b) => (b.value > a.value ? b : a));
        return normalizeInsightKey(hi.name) === categoryKey;
      });
      if (!hasCategoryLeader) {
        push({
          text: `${categoryName} dominates category sales in the current slice.`,
          score: 88,
          topicKey: `impact|sales|category|${categoryKey}`,
          topicCategory: "concentration",
          outcomeKey: `category_dominance|${categoryKey}`,
          entity: categoryKey,
        });
      }
    }

    const revTrend =
      args.trendMetricLabel && /\b(revenue|sales)\b/i.test(args.trendMetricLabel);
    if (
      revTrend &&
      args.trendRel != null &&
      args.trendRel < -0.04 &&
      profitCard &&
      !isNaDisplayValue(String(profitCard.value))
    ) {
      push({
        text: "Profit remains strong despite recent revenue moderation.",
        score: 90,
        topicKey: "impact|profit|revenue trend",
        topicCategory: "profit",
      });
    }
  }

  return out;
}

function isNaDisplayValue(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^n\/a$/i.test(v) || v === "—" || v === "-";
}

function isLowValueKpiTitle(title: string, domain: SummaryDomain = "generic"): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (/^(records?\s+in\s+view|row\s+count|column\s+count|fields?\s+in\s+view|department count)\b/.test(t)) {
    return true;
  }
  if (domain === "hr" && /^total employees$/i.test(title.trim())) {
    return false;
  }
  if (
    /^(total|sum|count|records?|rows?|columns?)\b/.test(t) &&
    !/\b(top|highest|lowest|lead|best|worst|maximum|minimum|peak|trend|revenue|profit|sales)\b/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/** Schema-aware domain for summary vocabulary (independent of mis-mapped KPI labels). */
export function inferOverviewSummaryDomain(args: {
  columns: string[];
  autoDashboard: OverviewAiSummaryDashboard | null;
}): SummaryDomain {
  const kind = String(args.autoDashboard?.kind ?? "").toLowerCase();
  const blob = args.columns.join(" ").toLowerCase().replace(/_/g, " ");
  const hrScore = scoreColumnSignals(blob, HR_COLUMN_SIGNALS);
  const salesScore = scoreColumnSignals(blob, SALES_COLUMN_SIGNALS);
  const hasCommercialCube =
    /\brevenue\b/.test(blob) && /\bproduct\b/.test(blob) && !/\bproductivity\b/.test(blob);

  if (
    kind === "hr" ||
    hrScore >= 3 ||
    (hrScore >= 2 && hrScore > salesScore) ||
    (hrScore >= 2 && !hasCommercialCube && !/\brevenue\b/.test(blob))
  ) {
    return "hr";
  }
  if (
    isCovidPublicHealthDataset(args.columns) ||
    /\bpublic health\b/i.test(String(args.autoDashboard?.type_label ?? ""))
  ) {
    return "healthcare";
  }
  if (/\b(patient.volume|readmissions|length.of.stay|ward)\b/.test(blob)) {
    return "healthcare";
  }
  if (
    /\b(downtime[_\s]?(hours|minutes)|defect.rate|sla.score|production.line|units.produced|root.cause|incident)\b/.test(
      blob
    )
  ) {
    return "operations";
  }
  if (/\b(ticket.category|tickets.opened|tickets.resolved|escalations)\b/.test(blob)) {
    return "customer_support";
  }
  if (/\b(cost.center|variance)\b/.test(blob) && /\b(budget|actual)\b/.test(blob)) {
    return "finance_fpa";
  }

  if (/\b(product.category|product_category)\b/.test(blob) && /\b(revenue|profit)\b/.test(blob)) {
    return "retail";
  }

  if (/\b(product.line|sales.rep|quota|attainment)\b/.test(blob)) {
    return "sales";
  }

  // Revenue + product cubes (incl. showcase) before banking/geo secondary columns.
  if (/\brevenue\b/.test(blob) && /\bproduct\b/.test(blob)) {
    return "sales";
  }

  if (
    /\b(zone|market.type)\b/.test(blob) &&
    /\b(city|state)\b/.test(blob) &&
    /\b(revenue|profit)\b/.test(blob) &&
    !/\bproduct\b/.test(blob)
  ) {
    return "geography";
  }

  if (/\b(loan.balance|deposit.balance|credit.utilization|delinquency|npl)\b/.test(blob)) {
    return "banking";
  }
  if (/\b(campaign|impression|ctr|ad.spend|conversion.rate)\b/.test(blob)) {
    return "marketing";
  }
  if (/\b(latitude|longitude)\b/.test(blob)) {
    return "geography";
  }
  if (/\b(revenue|profit|quota|attainment)\b/.test(blob)) {
    return "sales";
  }
  if (kind === "operations") return "operations";
  if (kind === "marketing") return "marketing";
  if (kind === "finance") return "finance_fpa";
  if (kind === "sales" && hrScore >= 2) return "hr";
  if (kind === "sales") return "sales";
  return "generic";
}

function kpiSubtitleEchoesEntityLeader(subtitle: string | null | undefined): boolean {
  const st = subtitle?.trim() ?? "";
  if (!st) return false;
  return (
    /\b(?:highest(?:[\s-]+(?:paying|bonus))*[\s-]+(?:department|segment|region)|largest[\s-]*(?:department|segment|region)?)\s*:/i.test(
      st
    ) || /\bcontributes\s+\d+%\s+of\s+total\b/i.test(st)
  );
}

function formatKpiSummaryLine(card: OverviewAiSummaryCard): string | null {
  const t = truncateOverviewPhrase(card.title, 40);
  const v = truncateOverviewPhrase(String(card.value ?? ""), 36);
  if (!t || isNaDisplayValue(v)) return null;

  const subtitle = card.subtitle?.trim() ?? "";
  const subtitleEchoesEntityLeader = kpiSubtitleEchoesEntityLeader(subtitle);

  if (subtitle && !subtitleEchoesEntityLeader) {
    const st = truncateOverviewPhrase(subtitle, 44);
    return `${t}: ${v} (${st}).`;
  }
  if (/\btop\b/i.test(t)) {
    return `${t} is ${v} in the current slice.`;
  }
  if (/^(total|average)\b/i.test(t)) {
    return `${t} is ${v} across filtered rows.`;
  }
  return `${t} is ${v}.`;
}

function summaryLineAllowedForDomain(text: string, domain: SummaryDomain): boolean {
  if (HR_LANGUAGE_RE.test(text) && domain !== "hr") return false;
  if (/\bn\/a\b/i.test(text)) return false;
  if (AWKWARD_SUMMARY_RE.test(text)) return false;
  if (DURATION_SHARE_RE.test(text)) return false;
  return true;
}

/** Split ranked bullets for initial vs expanded Overview summary UI. */
export function partitionOverviewAiSummaryBullets(
  bullets: readonly string[],
  initialVisible = OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE
): {
  initial: string[];
  extra: string[];
  hasMore: boolean;
} {
  const initial = bullets.slice(0, initialVisible);
  const extra = bullets.slice(initialVisible);
  return {
    initial,
    extra,
    hasMore: extra.length > 0,
  };
}

export function computeOverviewAiSummaryBullets(
  args: ComputeOverviewAiSummaryArgs
): string[] {
  const {
    rows,
    columns,
    autoDashboard,
    profile,
    primaryMetricColumn,
  } = args;

  const domain = inferOverviewSummaryDomain({ columns, autoDashboard });
  const scored: OverviewScoredInsight[] = [];
  const seenText = new Set<string>();

  const pushInsight = (insight: OverviewScoredInsight) => {
    const s = insight.text.replace(/\s+/g, " ").trim();
    if (!s || insight.score <= 0) return;
    if (!summaryLineAllowedForDomain(s, domain)) return;
    const key = s.toLowerCase();
    if (seenText.has(key)) return;
    seenText.add(key);
    scored.push({ ...insight, text: s });
  };

  const frame = resolveOverviewSummaryDomainFrame(
    domain,
    columns,
    autoDashboard?.type_label
  );
  if (frame) {
    pushInsight({ text: frame, score: 100, kind: "frame" });
  }

  const charts = autoDashboard?.charts ?? [];
  const cards = autoDashboard?.cards ?? [];

  let trendBulletsAdded = 0;
  let chartBreakdownBulletsAdded = 0;
  const trendTitlesSeen = new Set<string>();
  let trendRelCaptured: number | null = null;
  let trendMetricCaptured: string | null = null;

  for (const chart of charts) {
    if (isCorrelationOrScatterChart(chart)) continue;

    if (isLikelyTrendChart(chart)) {
      if (trendBulletsAdded >= MAX_TREND_INSIGHTS) continue;
      const trendKey = chart.title.trim().toLowerCase();
      if (trendTitlesSeen.has(trendKey)) continue;
      if (isLowValueChartTitle(chart.title, domain)) continue;
      const vals = chart.values.filter((x) => Number.isFinite(x));
      if (vals.length >= 4) {
        const mid = Math.floor(vals.length / 2);
        const early = meanFinite(vals.slice(0, mid));
        const late = meanFinite(vals.slice(mid));
        if (early != null && late != null && early !== 0) {
          const rel = (late - early) / (Math.abs(early) + 1e-9);
          if (trendBulletsAdded === 0) {
            trendRelCaptured = rel;
            trendMetricCaptured = extractTrendMetricLabel(chart);
          }
          const ctx = extractChartInsightContext(chart.title);
          pushInsight({
            text: buildTrendInsightLine(chart, rel),
            score: scoreTrendChartInsight(chart, domain, rel, trendBulletsAdded),
            kind: "trend",
            metricKey: normalizeInsightKey(extractTrendMetricLabel(chart)),
            dimensionKey: "time",
            topicKey: `trend|${ctx.metricKey}|time`,
          });
          trendBulletsAdded += 1;
          trendTitlesSeen.add(trendKey);
        }
      }
      continue;
    }

    if (chartBreakdownBulletsAdded >= MAX_CHART_BREAKDOWN_INSIGHTS) continue;
    if (isLowValueChartTitle(chart.title, domain)) continue;
    if (/\bcredit score\b/i.test(chart.title) && /\bby\b/i.test(chart.title)) continue;

    const pairs = chartPairs(chart);
    if (pairs.length >= 2) {
      let hi = pairs[0];
      let lo = pairs[0];
      for (const p of pairs) {
        if (p.value > hi.value) hi = p;
        if (p.value < lo.value) lo = p;
      }
      if (pairs.some((p) => p.name !== hi.name)) {
        const ctx = extractChartInsightContext(chart.title);
        const entityKey = normalizeInsightKey(hi.name);
        pushInsight({
          text: buildBreakdownInsightLine({
            chartTitle: chart.title,
            chartType: chart.chartType,
            leaderName: hi.name,
            domain,
          }),
          score: scoreBreakdownChartInsight({
            chartTitle: chart.title,
            chartType: chart.chartType,
            domain,
            insightKind: "leader",
          }),
          kind: "leader",
          entity: entityKey,
          metricKey: ctx.metricKey,
          dimensionKey: ctx.dimensionKey,
          topicKey: `leader|${entityKey}|${ctx.metricKey}|${ctx.dimensionKey}`,
        });
        chartBreakdownBulletsAdded += 1;

        const total = pairs.reduce((sum, p) => sum + p.value, 0);
        const share = total > 0 ? hi.value / total : 0;
        const concentration = buildConcentrationInsightLine({
          chartTitle: chart.title,
          chartType: chart.chartType,
          leaderName: hi.name,
          leaderValue: hi.value,
          total,
        });
        if (
          concentration &&
          chartBreakdownBulletsAdded < MAX_CHART_BREAKDOWN_INSIGHTS &&
          share >= CONCENTRATION_SHARE_MATERIAL
        ) {
          pushInsight({
            text: concentration,
            score: scoreBreakdownChartInsight({
              chartTitle: chart.title,
              chartType: chart.chartType,
              domain,
              insightKind: "concentration",
              share,
            }),
            kind: "concentration",
            entity: entityKey,
            metricKey: ctx.metricKey,
            dimensionKey: ctx.dimensionKey,
            topicKey: `concentration|${entityKey}|${ctx.metricKey}|${ctx.dimensionKey}`,
          });
          chartBreakdownBulletsAdded += 1;
        }

        if (
          pairs.length >= 3 &&
          lo.name !== hi.name &&
          lo.value > 0 &&
          hi.value / lo.value >= LAGGARD_SPREAD_RATIO_MIN &&
          chartBreakdownBulletsAdded < MAX_CHART_BREAKDOWN_INSIGHTS
        ) {
          const laggardEntity = normalizeInsightKey(lo.name);
          pushInsight({
            text: buildLaggardInsightLine({
              chartTitle: chart.title,
              chartType: chart.chartType,
              laggardName: lo.name,
              domain,
            }),
            score: scoreBreakdownChartInsight({
              chartTitle: chart.title,
              chartType: chart.chartType,
              domain,
              insightKind: "laggard",
            }),
            kind: "laggard",
            entity: laggardEntity,
            metricKey: ctx.metricKey,
            dimensionKey: ctx.dimensionKey,
            topicKey: `laggard|${laggardEntity}|${ctx.metricKey}|${ctx.dimensionKey}`,
          });
          chartBreakdownBulletsAdded += 1;
        }
      }
    }
  }

  for (const impact of collectBusinessImpactLines({
    domain,
    cards,
    charts,
    trendMetricLabel: trendMetricCaptured,
    trendRel: trendRelCaptured,
    columns,
  })) {
    pushInsight({
      text: impact.text,
      score: impact.score,
      kind: "impact",
      topicKey: impact.topicKey,
      topicCategory: impact.topicCategory,
      outcomeKey: impact.outcomeKey,
      entity: impact.entity,
    });
  }

  if (domain === "banking") {
    for (const riskInsight of synthesizeBankingRiskInsights(profile, columns)) {
      pushInsight(riskInsight);
    }
  }

  for (const card of cards) {
    const line = formatKpiSummaryLine(card);
    if (!line) continue;
    const interpretiveCoverage = summaryHasInterpretiveCoverage(scored);
    const kpiScore = scoreKpiInsight(card, domain, interpretiveCoverage);
    if (kpiScore <= 0) continue;
    const meta = parseKpiInsightMeta(card);
    const subtitleEntity = kpiSubtitleEchoesEntityLeader(card.subtitle)
      ? null
      : parseLeaderFromSubtitle(card.subtitle);
    const entity = meta.entity ?? subtitleEntity ?? undefined;
    pushInsight({
      text: line,
      score: kpiScore,
      kind: "kpi",
      entity,
      metricKey: meta.metricKey,
      dimensionKey: meta.dimensionKey,
      topicKey: entity
        ? `kpi|${entity}|${meta.metricKey ?? ""}|${meta.dimensionKey ?? ""}`
        : `kpi|${meta.metricKey ?? card.title}`,
    });
  }

  if (primaryMetricColumn) {
    const mean = readProfileDescribeStat(primaryMetricColumn, "mean", profile);
    const std = readProfileDescribeStat(primaryMetricColumn, "std", profile);
    const max = readProfileDescribeStat(primaryMetricColumn, "max", profile);
    const min = readProfileDescribeStat(primaryMetricColumn, "min", profile);
    if (
      mean != null &&
      std != null &&
      max != null &&
      min != null &&
      std > 1e-12
    ) {
      const zHi = (max - mean) / std;
      const zLo = (mean - min) / std;
      if (shouldIncludeLongTailProfileInsight(domain, zHi, zLo)) {
        pushInsight({
          text: `The primary measure shows long tails—spot-check extremes before trusting aggregates.`,
          score:
            domain === "hr" ? HR_PROFILE_LONG_TAIL_SCORE : GENERIC_PROFILE_LONG_TAIL_SCORE,
          kind: "profile",
        });
      } else if (
        domain !== "retail" &&
        domain !== "sales" &&
        max != null &&
        min != null &&
        mean != null
      ) {
        const span = Math.abs(max - min);
        const noise = std * 4;
        if (Number.isFinite(span) && Number.isFinite(noise) && span > noise * 2.5) {
          pushInsight({
            text: `Values on the primary measure spread widely; use filters to focus on a cohort.`,
            score: 52,
            kind: "profile",
          });
        }
      }
    }
  }

  const numericCols = columns.filter((c) => profile?.column_types?.[c] === "number");
  for (const c of numericCols) {
    if (!c || c === primaryMetricColumn) continue;
    const mean = readProfileDescribeStat(c, "mean", profile);
    const std = readProfileDescribeStat(c, "std", profile);
    if (mean == null || std == null || Math.abs(mean) < 1e-9) continue;
    const cv = std / Math.abs(mean);
    if (cv < 0.12) {
      const label = humanizeColumnName(c);
      pushInsight({
        text: `${label} stays relatively steady across rows.`,
        score: 24,
        kind: "profile",
      });
      break;
    }
  }

  if (columns.length > 0 && !primaryMetricColumn) {
    pushInsight({
      text: `Pick a primary numeric column in mapping so KPIs and summaries stay grounded.`,
      score: 24,
      kind: "neutral",
    });
  }

  let out = selectOverviewAiSummaryInsights(scored, OVERVIEW_AI_SUMMARY_MAX_BULLETS, domain);

  const minBullets = 3;
  const neutralFill = [
    `Ask a focused question in AI Insights to go deeper on any chart signal.`,
    `Use the chart footers on this tab to open the same view in the Charts workspace.`,
    `Column mapping drives how these bullets and KPIs are inferred—adjust if something looks off.`,
    `KPI cards reflect your current sheet and mapping settings (${rows.toLocaleString()} rows in view).`,
  ];
  let i = 0;
  while (out.length < minBullets && i < neutralFill.length) {
    const s = neutralFill[i++];
    if (!seenText.has(s.toLowerCase())) {
      seenText.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.slice(0, OVERVIEW_AI_SUMMARY_MAX_BULLETS);
}
