/**
 * Classify suggested follow-up chips: scoped drill-down vs new root analysis.
 */

import type {
  AskAiContinuationOpts,
  ParentAnalysisContext,
} from "@/lib/ai-conversation-context";

function normToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** True drill-down / explain / audit chips — keep thread focus. */
export function isScopedFollowUpChip(chip: string): boolean {
  const s = chip.trim();
  if (!s) return false;

  if (/^\s*(why|explain)\b/i.test(s)) return true;
  if (/\bwhy\s+is\b/i.test(s) && /\b(highest|lowest|top|leading|largest|best|worst|most)\b/i.test(s)) {
    return true;
  }
  if (/\bwhat\s+explains\b/i.test(s)) return true;
  if (/\bcontributing\s+factors?\b/i.test(s)) return true;
  if (/\b(drivers?|driving\s+factors?)\b/i.test(s)) return true;
  if (/\b(drill|breakdown|break\s+down)\b/i.test(s) && !/\bcompare\b/i.test(s)) {
    return true;
  }
  if (/\btop\s+\d{1,2}\b/i.test(s)) return true;
  if (/\btop\s+(?:three|four|five|six|seven|eight|nine|ten)\b/i.test(s)) {
    return true;
  }
  if (/\bbottom\s+\d{1,2}\b/i.test(s)) return true;
  if (/\bbottom\s+(?:three|four|five|ten)\b/i.test(s)) return true;
  if (
    /\bwhich\s+.+\s+(?:is|are)\s+(?:the\s+)?(?:highest|lowest|top|bottom|largest|smallest)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/\bsort\s+(?:ascending|descending|asc|desc)\b/i.test(s)) return true;
  if (/\b(?:show\s+as|convert\s+to|as\s+a\s+(?:pie|line|bar|donut|area))\b/i.test(s)) {
    return true;
  }
  if (
    /\b(?:what\s+evidence\s+supports|which\s+columns?\s+(?:were\s+)?used|show\s+the\s+calculations?\s+behind|methodology|confidence)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/\bwhat\s+caution\s+applies\b/i.test(s)) return true;
  if (/\bwhat\s+else\s+should\s+we\b/i.test(s)) return true;
  if (/\bnext\s+steps?\b/i.test(s)) return true;
  if (/\bonly\b/i.test(s) && /\b(?:show|filter)\b/i.test(s)) return true;

  return false;
}

/** New analytical question — fresh metric / intent resolution. */
export function isNewRootAnalyticalChip(chip: string): boolean {
  const s = chip.trim().toLowerCase();
  if (!s) return false;

  if (/\bcompare\b/.test(s)) return true;
  if (/\b(correlat|correlation|relationship)\b/.test(s)) return true;
  if (/\bversus\b|\bvs\.?\b/.test(s)) return true;
  if (/\b(trend|over time|growth rate|seasonal|forecast)\b/.test(s)) return true;
  if (/\b(distribution|histogram|spread|frequency)\b/.test(s)) return true;
  if (/\b(revenue|profit|cost|margin)\b.+\b(and|with|vs)\b/.test(s)) return true;

  return false;
}

function tokenizeMetricPhrase(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/\b(total|average|avg|mean|sum|count|maximum|max|minimum|min)\b/g, " ")
    .split(/\s+/)
    .map((t) => normToken(t))
    .filter((t) => t.length > 2);
}

function extractCompareMetricPhrases(chip: string): string[] {
  const m = chip.match(
    /\bcompare\s+(.+?)\s+(?:and|with|vs\.?)\s+(.+?)(?:\s+across|\s+by|\?|$)/i
  );
  if (!m) return [];
  return [m[1]!.trim(), m[2]!.trim()];
}

/** Chip introduces metrics or dimensions outside the prior analysis scope. */
export function chipIntroducesNewAnalysisScope(
  chip: string,
  parent: ParentAnalysisContext | null
): boolean {
  if (!parent) return false;

  const compareParts = extractCompareMetricPhrases(chip);
  if (compareParts.length >= 2) return true;

  const parentMetricTokens = new Set<string>();
  for (const raw of [
    parent.metricColumn,
    parent.metricColumnDisplay,
    parent.chartTitle,
  ]) {
    if (!raw?.trim()) continue;
    for (const t of tokenizeMetricPhrase(raw)) parentMetricTokens.add(t);
  }

  if (parentMetricTokens.size > 0) {
    const chipMetrics = tokenizeMetricPhrase(chip);
    const novel = chipMetrics.filter((t) => !parentMetricTokens.has(t));
    if (novel.length >= 2) return true;
    if (
      novel.length === 1 &&
      chipMetrics.length >= 2 &&
      parentMetricTokens.size === 1
    ) {
      return true;
    }
  }

  const dimFromChip =
    chip.match(/\bacross\s+([a-z0-9\s_-]+)/i)?.[1]?.trim() ||
    chip.match(/\bby\s+([a-z0-9\s_-]+)/i)?.[1]?.trim() ||
    "";
  const parentDim = (
    parent.categoryColumnDisplay ||
    parent.categoryColumn ||
    ""
  ).trim();
  if (dimFromChip && parentDim) {
    const c = normToken(dimFromChip);
    const p = normToken(parentDim);
    if (c && p && c !== p && !p.includes(c) && !c.includes(p)) return true;
  }

  const priorIntent = (parent.routingIntent || parent.intentBucket || "")
    .trim()
    .toLowerCase();
  const s = chip.trim().toLowerCase();
  if (priorIntent === "trend" && /\bcompare\b/.test(s)) return true;
  if (priorIntent === "compare" && /\b(trend|over time|growth rate)\b/.test(s)) {
    return true;
  }
  if (priorIntent === "ranking" && /\b(correlat|relationship|compare)\b/.test(s)) {
    return true;
  }

  return false;
}

export function shouldStartFreshRootFromSuggestedChip(
  chip: string,
  parent: ParentAnalysisContext | null
): boolean {
  if (!parent?.priorQuestion?.trim()) {
    if (isScopedFollowUpChip(chip)) return false;
    return isNewRootAnalyticalChip(chip) || true;
  }
  if (isScopedFollowUpChip(chip)) return false;
  if (isNewRootAnalyticalChip(chip)) return true;
  if (chipIntroducesNewAnalysisScope(chip, parent)) return true;
  return true;
}

export function resolveSuggestedChipAskOpts(
  chip: string,
  parent: ParentAnalysisContext | null
): AskAiContinuationOpts {
  if (shouldStartFreshRootFromSuggestedChip(chip, parent)) {
    return { mode: "fresh_root_from_suggestion" };
  }
  return { mode: "scoped_follow_up", fromFollowUpChip: true };
}
