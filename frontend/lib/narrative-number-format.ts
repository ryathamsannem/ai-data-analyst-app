/**
 * Narrative polish: thousands separators + consistent efficiency (ROAS) wording.
 */

function formatIntegerToken(raw: string): string {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function shouldSkipYearToken(
  digits: string,
  offset: number,
  full: string
): boolean {
  if (digits.length !== 4) return false;
  const n = Number(digits);
  if (n < 1900 || n > 2100) return false;
  const before = full[offset - 1] ?? "";
  const after = full[offset + digits.length] ?? "";
  return before === "-" || after === "-";
}

/**
 * Format bare integers in narrative text (skips values that already contain commas).
 */
export function formatNarrativeNumbers(text: string): string {
  if (!text?.trim()) return text;

  let out = text.replace(
    /\*\*(\d[\d,]*)\*\*/g,
    (_m, inner: string) => {
      const bare = inner.replace(/,/g, "");
      if (!/^\d{4,}$/.test(bare)) return `**${inner}**`;
      return `**${formatIntegerToken(bare)}**`;
    }
  );

  out = out.replace(
    /(?<![\d,])(\d{4,})(?!\d)/g,
    (match, _g1, offset, full) => {
      if (shouldSkipYearToken(match, offset, full)) return match;
      return formatIntegerToken(match);
    }
  );

  return out;
}

/** Align efficiency language on ROAS (revenue ÷ ad spend) for dual-metric ecommerce reads. */
export function polishNarrativeEfficiencyTerms(text: string): string {
  if (!text?.trim()) return text;
  return text
    .replace(/\bspend-to-revenue ratio\b/gi, "ROAS")
    .replace(/\brevenue-to-spend ratio\b/gi, "ROAS")
    .replace(/\bspend-to-revenue\b/gi, "ROAS")
    .replace(/\brevenue-to-spend\b/gi, "ROAS")
    .replace(/\bmore efficient on spending\b/gi, "strongest ROAS")
    .replace(/\bmost efficient on spending\b/gi, "highest ROAS")
    .replace(/\breturn relative to (?:its |their )?spend\b/gi, "ROAS")
    .replace(/\bstrong return relative to (?:its |their )?spend\b/gi, "strong ROAS")
    .replace(/\brevenue per dollar spent\b/gi, "ROAS")
    .replace(/\bcompare revenue per dollar spent\b/gi, "compare ROAS")
    .replace(/\bbest efficiency\b/gi, "highest ROAS")
    .replace(/\bspends most efficiently\b/gi, "has the highest ROAS");
}

export type DualMetricRoasLead = {
  campaign: string;
  roas: string;
};

export function augmentDualMetricRoasLead(
  text: string,
  lead: DualMetricRoasLead | null
): string {
  if (!lead?.campaign?.trim() || !lead.roas?.trim()) return text;
  const t = text.trim();
  if (!t) return t;
  const name = lead.campaign.trim();
  const ratio = lead.roas.trim();
  const lower = t.toLowerCase();
  const nameHit = lower.includes(name.toLowerCase());
  const roasHit = /\broas\b/i.test(t);
  const bestRoasLead = `Best ROAS: ${name} (${ratio}).`;
  if (nameHit && roasHit) return t;
  if (nameHit && !roasHit) {
    return `${bestRoasLead} ${t}`;
  }
  return `${bestRoasLead} ${t}`;
}

function dedupeNarrativeArtifacts(text: string): string {
  let out = text.replace(/\btotal\s+total\b/gi, "total");
  out = out.replace(
    /\b(Key findings|What this may indicate|Suggested next steps|Statistical observations|How this was calculated)\b(\s*:\s*)\1\b/gi,
    "$1$2"
  );
  return out.replace(/(\b[\w\s,'"%-]{20,140}[.!?])\s+\1/g, "$1");
}

/** Collapse double-modal hedging (e.g. could may → may). */
export function fixMalformedNarrativeHedging(text: string): string {
  if (!text?.trim()) return text;
  let out = text;
  const auxHedgeFixes: [RegExp, string][] = [
    [/\b(is|are|was|were)\s+may\s+reflect\b/gi, "may reflect"],
    [/\b(is|are|was|were)\s+may\s+indicate\b/gi, "may indicate"],
    [/\b(is|are|was|were)\s+may\s+be\s+associated\b/gi, "may be associated"],
    [/\b(is|are|was|were)\s+may\s+be\b/gi, "may be"],
    [/\b(is|are|was|were)\s+could\s+suggest\b/gi, "could suggest"],
    [/\b(is|are|was|were)\s+could\s+be\b/gi, "could be"],
    [
      /\b(is|are|was|were)\s+potentially\s+associated\b/gi,
      "may be associated with",
    ],
  ];
  for (const [re, repl] of auxHedgeFixes) {
    out = out.replace(re, repl);
  }
  out = out.replace(/\bcould\s+be\s+may\s+be\b/gi, "may be");
  out = out.replace(/\bcould\s+be\s+may\b/gi, "may be");
  out = out.replace(
    /\b(?:could\s+may|may\s+could|could\s+could|may\s+may)\b/gi,
    "may"
  );
  out = out.replace(/\bmay\s+be\s+could\b/gi, "may be");
  out = out.replace(/\bmay\s+be\s+be\b/gi, "may be");
  return out;
}

/** Full narrative polish pipeline for AI insight prose. */
export function polishInsightNarrativeText(
  text: string,
  opts?: { dualMetricRoasLead?: DualMetricRoasLead | null }
): string {
  if (!text?.trim()) return text;
  let out = dedupeNarrativeArtifacts(text);
  out = formatNarrativeNumbers(out);
  out = polishNarrativeEfficiencyTerms(out);
  if (opts?.dualMetricRoasLead) {
    out = augmentDualMetricRoasLead(out, opts.dualMetricRoasLead);
  }
  return fixMalformedNarrativeHedging(out);
}
