/**
 * Executive Insights narrative — numbered takeaways for summary-style questions.
 */

/** City / region / zone ranking questions (not generic "top insights" prompts). */
export function isGeographicRankingQuestion(question: string): boolean {
  const q = question.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return false;
  if (/\b(top|best|highest|lowest|leading|trailing)\s+performing\b/.test(q)) {
    return true;
  }
  if (/\bperforming\s+(city|cities|region|regions|zone|zones)\b/.test(q)) {
    return true;
  }
  if (
    /\b(which|what)\s+.*\b(region|regions|zone|zones|city|cities)\b.*\b(highest|lowest|top|best|most|least)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (
    /\b(highest|lowest|top|best|most|least)\b.*\b(revenue|sales|profit)\b.*\b(region|regions|zone|zones|city|cities)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (
    /\b(region|regions|zone|zones|city|cities)\b.*\b(generates?|generate)\b.*\b(highest|lowest|most|least)\b/.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

export function isExecutiveTakeawaysQuestion(question: string): boolean {
  const q = question.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return false;
  return (
    /\b(top\s*\d*\s*)?(business\s+)?insights?\b/.test(q) ||
    /\bkey\s+takeaways?\b/.test(q) ||
    /\bexecutive\s+summary\b/.test(q) ||
    /\bmain\s+findings?\b/.test(q) ||
    /\b(primary|core)\s+findings?\b/.test(q) ||
    /\b(summarize|summarise)\b.*\b(business\s+)?performance\b/.test(q) ||
    /\bbusiness\s+overview\b/.test(q) ||
    /\bwhat\s+is\s+the\s+business\s+overview\b/.test(q) ||
    /\bgive\s+(an?\s+)?executive\s+summary\b/.test(q) ||
    /\boverall\s+business\s+(performance|health)\b/.test(q)
  );
}

/** Summary-style questions: prioritize narrative/cards over chart-debug chrome. */
export function isExecutiveSummaryLayoutMode(question: string): boolean {
  return isExecutiveTakeawaysQuestion(question);
}

export function isNumberedExecutiveBrief(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /^TOP\s+\d+\s+BUSINESS\s+INSIGHTS/im.test(t) || /^\d+\.\s/m.test(t)
  );
}

export function executiveInsightCount(question: string): number {
  const m = question.match(/\btop\s+(\d+)\b/i);
  if (m) {
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(n)) return Math.min(6, Math.max(2, n));
  }
  return 3;
}

/** ((highest − lowest) / highest) × 100 */
export function gapPercentOfHigh(spread: number, high: number): number | null {
  if (!Number.isFinite(spread) || !Number.isFinite(high) || high <= 1e-9) {
    return null;
  }
  const pct = (spread / high) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function formatGapPercentSuffix(
  spread: number,
  high: number
): string | null {
  const pct = gapPercentOfHigh(spread, high);
  if (pct == null) return null;
  const pctStr = pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1);
  return ` (${pctStr}%)`;
}

function formatPctForNarrative(pct: number): string {
  return pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1);
}

/** Share/concentration/rate text — always includes a percent sign. */
export function formatSharePercentText(pct: number): string {
  return `${formatPctForNarrative(pct)}%`;
}

/** Fix share lines that omit % before "of total". */
export function ensureSharePercentInPhrase(text: string): string {
  return text.replace(
    /\bcontributes\s+(\d+(?:\.\d+)?)\s+of\s+(?!%)/gi,
    "contributes $1% of "
  );
}

function humanizeMetricPhrase(valueAxis: string): string {
  const t = valueAxis.replace(/\s+/g, " ").trim();
  if (!t) return "value";
  const lower = t.toLowerCase().replace(/\btotal\s+total\s+/g, "total ");
  if (/^total\s+/.test(lower)) return lower;
  if (/\b(revenue|sales|spend|orders|units)\b/i.test(t)) {
    const withTotal = `total ${lower}`;
    return withTotal.replace(/\btotal\s+total\s+/g, "total ");
  }
  return lower;
}

function humanizeDimensionPhrase(categoryAxis: string): string {
  const t = categoryAxis.replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t === "category") return "category";
  return t.replace(/\s+name$/, "").trim() || "category";
}

export type ExecutiveBriefRow = {
  label: string;
  value: number;
  formatted: string;
};

function formatAggregateAmount(total: number, template?: string): string {
  if (template?.trim()) {
    const digits = template.replace(/[^\d.,-]/g, "");
    if (digits) {
      const _hasDec = digits.includes(".");
      void _hasDec;
      const n = Number(digits.replace(/,/g, ""));
      if (Number.isFinite(n) && Math.abs(n - total) < Math.max(1, total * 0.02)) {
        return template.trim();
      }
    }
  }
  return Math.round(total).toLocaleString("en-US");
}

/**
 * Deterministic ranking narrative from aggregated chart values (city/region bars).
 */
export function buildRankingExecutiveBrief(args: {
  categoryAxis: string;
  valueAxis: string;
  rows: ExecutiveBriefRow[];
}): string | null {
  const rows = args.rows.filter((r) => Number.isFinite(r.value) && r.value >= 0);
  if (rows.length < 2) return null;

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, r) => a + r.value, 0);
  if (total <= 1e-9) return null;

  const top = sorted[0]!;
  const topThree = sorted.slice(0, Math.min(3, sorted.length));
  const topThreeSum = topThree.reduce((a, r) => a + r.value, 0);
  const topThreeShare = (100 * topThreeSum) / total;
  const shareDisp = formatPctForNarrative(topThreeShare);

  const met = humanizeMetricPhrase(args.valueAxis);
  const dim = humanizeDimensionPhrase(args.categoryAxis);
  const dimPlural = dim.endsWith("s") ? dim : `${dim}s`;

  const sumDisp = formatAggregateAmount(topThreeSum, topThree[0]?.formatted);
  const totalDisp = formatAggregateAmount(total, top.formatted);
  const leaderVal = top.formatted.trim() || formatAggregateAmount(top.value);

  const lines = [
    `${top.label.trim() || "The leader"} generates the highest ${met} at ${leaderVal}.`,
    `The top ${topThree.length} ${dimPlural} account for roughly ${shareDisp}% of total ${met} (${sumDisp} of ${totalDisp}).`,
  ];

  if (sorted.length > 1) {
    const bottom = sorted[sorted.length - 1]!;
    const spread = top.value - bottom.value;
    const spreadDisp = formatAggregateAmount(spread);
    const pct = gapPercentOfHigh(spread, top.value);
    if (pct != null && pct >= 8) {
      lines.push(
        `${top.label.trim()} leads ${bottom.label.trim()} by ${spreadDisp} (${formatPctForNarrative(pct)}% gap) across ${dimPlural} in this cohort.`
      );
    }
  }

  return lines.join(" ");
}

/**
 * Deterministic numbered executive brief from chart series (matches KPI signals).
 */
export function buildNumberedExecutiveBrief(args: {
  question: string;
  categoryAxis: string;
  valueAxis: string;
  rows: ExecutiveBriefRow[];
}): string | null {
  const rows = args.rows.filter((r) => Number.isFinite(r.value));
  if (rows.length < 2) return null;

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;
  const spread = top.value - bottom.value;
  const pct = gapPercentOfHigh(spread, top.value);

  const n = executiveInsightCount(args.question);
  const met = humanizeMetricPhrase(args.valueAxis);
  const dim = humanizeDimensionPhrase(args.categoryAxis);
  const dimPlural = dim.endsWith("s") ? dim : `${dim}s`;

  const topLabel = top.label.trim() || "Top segment";
  const bottomLabel = bottom.label.trim() || "Bottom segment";
  const topVal = top.formatted.trim() || String(top.value);
  const bottomVal = bottom.formatted.trim() || String(bottom.value);

  const bullets: string[] = [];

  const total = sorted.reduce((a, r) => a + r.value, 0);
  const sharePct =
    total > 1e-9 ? (100 * top.value) / total : null;

  if (sharePct != null && sharePct >= 28) {
    const shareDisp = formatSharePercentText(sharePct);
    bullets.push(
      `${topLabel} contributes ${shareDisp} of ${met} and dominates performance.`
    );
  } else {
    bullets.push(
      `${topLabel} generates the highest ${met} at ${topVal}.`
    );
  }

  if (pct != null && sorted.length > 1) {
    const pctDisp = formatPctForNarrative(pct);
    if (pct < 12) {
      bullets.push(
        `${met.charAt(0).toUpperCase() + met.slice(1)} distribution is relatively balanced across ${dimPlural}, with only a ${pctDisp}% gap between highest and lowest performers.`
      );
      bullets.push(
        `No ${dim} dominates the market, suggesting diversified customer demand.`
      );
    } else {
      const spreadDisp =
        spread >= 1000
          ? Math.round(spread).toLocaleString("en-US")
          : Number(spread.toFixed(1)).toLocaleString("en-US");
      bullets.push(
        `${topLabel} leads ${bottomLabel} by ${spreadDisp} (${pctDisp}%), showing a clear spread across ${dimPlural}.`
      );
      bullets.push(
        `${bottomLabel} still contributes ${bottomVal}, so performance is not entirely concentrated in the leader.`
      );
    }
  } else {
    bullets.push(
      `${bottomLabel} is the lowest ${dim} in this view at ${bottomVal}.`
    );
    bullets.push(
      `Compare ${dimPlural} side-by-side to decide where to focus budget or inventory next.`
    );
  }

  const headline = `TOP ${n} BUSINESS INSIGHTS`;
  const numbered = bullets
    .slice(0, n)
    .map((body, i) => `${i + 1}. ${body}`)
    .join("\n\n");

  return `${headline}\n\n${numbered}`;
}

/** Numbered brief from API-ranked executive insights (multi-signal summary). */
export function buildNumberedExecutiveBriefFromRanked(args: {
  question: string;
  lines: string[];
}): string | null {
  const lines = args.lines
    .map((l) => ensureSharePercentInPhrase(l.trim()))
    .filter((l) => l.length >= 12);
  if (lines.length < 2) return null;

  const n = executiveInsightCount(args.question);
  const headline = `TOP ${n} BUSINESS INSIGHTS`;
  const numbered = lines
    .slice(0, n)
    .map((body, i) => `${i + 1}. ${body}`)
    .join("\n\n");

  return `${headline}\n\n${numbered}`;
}

/** Collapse numbered brief for the UI teaser (title + first two items). */
export function collapseNumberedExecutiveBrief(
  brief: string,
  maxItems = 2
): { display: string; canExpand: boolean } {
  const t = brief.trim();
  if (!t) return { display: "", canExpand: false };

  const blocks = t.split(/\n\n+/);
  const headline = blocks[0]?.trim() ?? "";
  const numbered = blocks.filter((b) => /^\d+\.\s/.test(b.trim()));

  if (numbered.length <= maxItems) {
    return { display: t, canExpand: false };
  }

  const clipped = [headline, ...numbered.slice(0, maxItems)].filter(Boolean).join("\n\n");
  return { display: `${clipped}\n\n…`, canExpand: true };
}
