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
const LAGGARD_SPREAD_RATIO_MIN = 2;

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
  const block = profile.summary_stats[stat];
  if (!block || typeof block !== "object") return null;
  const v = block[col];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
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
    const byDim = parseMetricByDimensionTitle(args.chartTitle);
    const met = byDim
      ? polishInsightPhrase(byDim.metric).toLowerCase()
      : polishInsightPhrase(args.chartTitle).toLowerCase();
    return `${leader} represents about ${pct}% of ${met} in this slice.`;
  }

  return `${leader} accounts for about ${pct}% of the total in this breakdown.`;
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

function tryBusinessImpactLine(args: {
  domain: SummaryDomain;
  cards: OverviewAiSummaryCard[];
  charts: OverviewAiSummaryChart[];
  trendMetricLabel: string | null;
  trendRel: number | null;
}): string | null {
  if (args.domain === "banking") {
    for (const chart of args.charts) {
      if (
        /customer segment/i.test(chart.title) &&
        /loan balance/i.test(chart.title)
      ) {
        const pairs = chartPairs(chart);
        if (pairs.length >= 2) {
          const hi = pairs.reduce((a, b) => (b.value > a.value ? b : a));
          return `Loan balance is concentrated in the ${truncateOverviewPhrase(hi.name, 28)} segment.`;
        }
      }
    }
  }

  const profitCard = args.cards.find((c) => /^total profit$/i.test(c.title.trim()));
  const revTrend =
    args.trendMetricLabel && /\brevenue\b/i.test(args.trendMetricLabel);
  if (
    revTrend &&
    args.trendRel != null &&
    args.trendRel < -0.04 &&
    profitCard &&
    !isNaDisplayValue(String(profitCard.value))
  ) {
    return "Profit remains strong despite recent revenue moderation.";
  }

  const topRegion = args.cards.find((c) => /^top region$/i.test(c.title.trim()));
  if (topRegion && !isNaDisplayValue(String(topRegion.value))) {
    const regionName = truncateOverviewPhrase(String(topRegion.value), 28);
    if (args.domain === "banking") {
      return `Spend activity is highest in the ${regionName} region.`;
    }
    return `Revenue concentration is highest in the ${regionName} region.`;
  }

  return null;
}

function isNaDisplayValue(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^n\/a$/i.test(v) || v === "—" || v === "-";
}

function isLowValueKpiTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (/^(records?\s+in\s+view|row\s+count|column\s+count|fields?\s+in\s+view)\b/.test(t)) {
    return true;
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

function formatKpiSummaryLine(card: OverviewAiSummaryCard): string | null {
  const t = truncateOverviewPhrase(card.title, 40);
  const v = truncateOverviewPhrase(String(card.value ?? ""), 36);
  if (!t || isNaDisplayValue(v)) return null;
  if (card.subtitle?.trim()) {
    const st = truncateOverviewPhrase(card.subtitle, 44);
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
  const scored: { text: string; score: number }[] = [];
  const seen = new Set<string>();

  const pushScored = (raw: string, score: number) => {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s || score <= 0) return;
    if (!summaryLineAllowedForDomain(s, domain)) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    scored.push({ text: s, score });
  };

  const frame = DOMAIN_FRAMES[domain];
  if (frame) pushScored(frame, 100);

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
          pushScored(buildTrendInsightLine(chart, rel), 96);
          trendBulletsAdded += 1;
          trendTitlesSeen.add(trendKey);
        }
      }
      continue;
    }

    if (chartBreakdownBulletsAdded >= MAX_CHART_BREAKDOWN_INSIGHTS) continue;

    const pairs = chartPairs(chart);
    if (pairs.length >= 2) {
      let hi = pairs[0];
      let lo = pairs[0];
      for (const p of pairs) {
        if (p.value > hi.value) hi = p;
        if (p.value < lo.value) lo = p;
      }
      if (pairs.some((p) => p.name !== hi.name)) {
        pushScored(
          buildBreakdownInsightLine({
            chartTitle: chart.title,
            chartType: chart.chartType,
            leaderName: hi.name,
            domain,
          }),
          92
        );
        chartBreakdownBulletsAdded += 1;

        const total = pairs.reduce((sum, p) => sum + p.value, 0);
        const concentration = buildConcentrationInsightLine({
          chartTitle: chart.title,
          chartType: chart.chartType,
          leaderName: hi.name,
          leaderValue: hi.value,
          total,
        });
        if (concentration && chartBreakdownBulletsAdded < MAX_CHART_BREAKDOWN_INSIGHTS) {
          pushScored(concentration, 86);
          chartBreakdownBulletsAdded += 1;
        }

        if (
          pairs.length >= 3 &&
          lo.name !== hi.name &&
          lo.value > 0 &&
          hi.value / lo.value >= LAGGARD_SPREAD_RATIO_MIN &&
          chartBreakdownBulletsAdded < MAX_CHART_BREAKDOWN_INSIGHTS
        ) {
          pushScored(
            buildLaggardInsightLine({
              chartTitle: chart.title,
              chartType: chart.chartType,
              laggardName: lo.name,
              domain,
            }),
            84
          );
          chartBreakdownBulletsAdded += 1;
        }
      }
    }
  }

  const impact = tryBusinessImpactLine({
    domain,
    cards,
    charts,
    trendMetricLabel: trendMetricCaptured,
    trendRel: trendRelCaptured,
  });
  if (impact) pushScored(impact, 89);

  for (const card of cards) {
    const line = formatKpiSummaryLine(card);
    if (!line) continue;
    if (isLowValueKpiTitle(card.title)) continue;
    const titleLc = card.title.toLowerCase();
    const comparative = /\b(top|highest|lowest|lead|best|worst|maximum|minimum|peak)\b/.test(
      titleLc
    );
    const isHeadlineMetric = /^(total|average)\b/i.test(card.title.trim());
    pushScored(line, comparative ? 88 : isHeadlineMetric ? 94 : 80);
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
      if (zHi > 2.75 || zLo > 2.75) {
        pushScored(
          `The primary measure shows long tails—spot-check extremes before trusting aggregates.`,
          72
        );
      } else if (max != null && min != null && mean != null) {
        const span = Math.abs(max - min);
        const noise = std * 4;
        if (Number.isFinite(span) && Number.isFinite(noise) && span > noise * 2.5) {
          pushScored(
            `Values on the primary measure spread widely; use filters to focus on a cohort.`,
            68
          );
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
      pushScored(`${label} stays relatively steady across rows.`, 28);
      break;
    }
  }

  if (columns.length > 0 && !primaryMetricColumn) {
    pushScored(
      `Pick a primary numeric column in mapping so KPIs and summaries stay grounded.`,
      24
    );
  }

  scored.sort((a, b) => b.score - a.score);
  const out = scored
    .slice(0, OVERVIEW_AI_SUMMARY_MAX_BULLETS)
    .map((item) => item.text);
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
    if (!seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.slice(0, OVERVIEW_AI_SUMMARY_MAX_BULLETS);
}
