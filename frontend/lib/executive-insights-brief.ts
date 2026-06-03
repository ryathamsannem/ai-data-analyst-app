/**
 * Executive Insights narrative — numbered takeaways for summary-style questions.
 */

export function isExecutiveTakeawaysQuestion(question: string): boolean {
  const q = question.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return false;
  return (
    /\b(top\s*\d*\s*)?(business\s+)?insights?\b/.test(q) ||
    /\bkey\s+takeaways?\b/.test(q) ||
    /\bexecutive\s+summary\b/.test(q) ||
    /\bmain\s+findings?\b/.test(q) ||
    /\b(primary|core)\s+findings?\b/.test(q)
  );
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

function humanizeMetricPhrase(valueAxis: string): string {
  const t = valueAxis.replace(/\s+/g, " ").trim();
  if (!t) return "value";
  const lower = t.toLowerCase();
  if (/^total\s+/.test(lower)) return lower;
  if (/\b(revenue|sales|spend|orders|units)\b/i.test(t)) return `total ${lower}`;
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

  bullets.push(
    `${topLabel} generates the highest ${met} at ${topVal}.`
  );

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
