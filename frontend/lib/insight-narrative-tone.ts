/**
 * Align confidence badges, executive copy, and AI answer tone when evidence is thin.
 */

import type { ConfidenceLevel } from "@/lib/insight-confidence";

export type NarrativeTone = "cautious" | "balanced" | "confident";

export type NarrativeToneInputs = {
  analysisRowCount?: number | null;
  chartSeriesPointCount?: number | null;
  mappingConfidence?: ConfidenceLevel | string | null;
  mappingConfirmedByUser?: boolean;
  unifiedConfidenceLevel?: ConfidenceLevel | string | null;
};

function normLevel(raw: string | null | undefined): ConfidenceLevel {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

export function resolveNarrativeTone(inputs: NarrativeToneInputs): NarrativeTone {
  const rows = Math.max(0, Number(inputs.analysisRowCount ?? 0));
  const pts = Math.max(0, Number(inputs.chartSeriesPointCount ?? 0));
  const mapping = inputs.mappingConfirmedByUser
    ? "high"
    : normLevel(inputs.mappingConfidence);
  const unified = normLevel(inputs.unifiedConfidenceLevel);

  const thinRows = rows > 0 && rows < 100;
  const fewCategories = pts > 0 && pts <= 5;
  const sparseCategories = pts > 5 && pts <= 8;
  const mappingWeak = mapping === "low";
  const unifiedLow = unified === "low";

  if (thinRows || mappingWeak || fewCategories || unifiedLow) {
    return "cautious";
  }
  if (rows < 500 || mapping === "medium" || sparseCategories || unified === "medium") {
    return "balanced";
  }
  return "confident";
}

export function isCautiousNarrativeTone(tone: NarrativeTone): boolean {
  return tone === "cautious";
}

export function narrativeToneDisclaimer(
  tone: NarrativeTone,
  inputs: NarrativeToneInputs
): string | null {
  const rows = Math.max(0, Number(inputs.analysisRowCount ?? 0));
  const pts = Math.max(0, Number(inputs.chartSeriesPointCount ?? 0));
  const parts: string[] = [];

  if (tone === "cautious") {
    if (rows > 0 && rows < 100) {
      parts.push(
        `This view is based on ${rows.toLocaleString()} filtered row(s) — treat takeaways as directional, not definitive.`
      );
    }
    if (!inputs.mappingConfirmedByUser && normLevel(inputs.mappingConfidence) === "low") {
      parts.push(
        "Column mapping is still inferred — confirm metric and breakdown fields before acting on rankings."
      );
    }
    if (pts > 0 && pts <= 5) {
      parts.push(
        `Only ${pts} comparison group(s) appear in the chart — avoid over-interpreting small gaps.`
      );
    }
    if (!parts.length) {
      parts.push(
        "Evidence is limited — use cautious language and validate with a wider filter or more data."
      );
    }
    return parts.join(" ");
  }

  if (tone === "balanced" && rows > 0 && rows < 500) {
    return "Moderate sample size — qualify strong claims and confirm field mapping when stakes are high.";
  }

  return null;
}

const DEFINITIVE_PATTERNS: [RegExp, string][] = [
  [/\bclearly indicates\b/gi, "may suggest"],
  [/\bclearly shows\b/gi, "appears to show"],
  [/\bproves that\b/gi, "is consistent with"],
  [/\bproves\b/gi, "may support"],
  [/\bdefinitively\b/gi, "tentatively"],
  [/\bobviously\b/gi, "possibly"],
  [/\bwithout doubt\b/gi, "with some uncertainty"],
  [/\bmust be\b/gi, "could be"],
  [/\balways\b/gi, "often"],
  [/\bthe main driver is\b/gi, "a plausible driver may be"],
  [/\bis the best\b/gi, "may rank highest in this cohort"],
  [/\bis the top\b/gi, "ranks highest in this filtered view"],
  [/\bdrives the highest\b/gi, "shows the highest"],
  [/\bdominates\b/gi, "leads in this sample"],
  [/\bconfirms that\b/gi, "is consistent with"],
];

export function softenAssertiveProse(
  text: string,
  tone: NarrativeTone
): string {
  if (!text.trim() || tone === "confident") return text;
  let t = text;
  for (const [re, repl] of DEFINITIVE_PATTERNS) {
    t = t.replace(re, repl);
  }
  if (tone === "cautious" && !/\b(may|might|could|suggest|directional|tentative|limited sample)\b/i.test(t)) {
    const trimmed = t.trim();
    if (trimmed.length > 0 && trimmed.length < 480) {
      return `${trimmed.replace(/\.$/, "")} (directional read — limited evidence in this cohort).`;
    }
  }
  return t;
}

export function softenExecutiveTakeaway(
  takeaway: string,
  tone: NarrativeTone
): string {
  const t = takeaway.trim();
  if (!t) return t;
  const softened = softenAssertiveProse(t, tone);
  if (tone !== "cautious") return softened;
  if (/^directional read\b/i.test(softened)) return softened;
  if (/\b(may|might|could|suggest|directional|tentative)\b/i.test(softened)) {
    return softened;
  }
  return `Directional read: ${softened}`;
}

/** Worst-case mapping confidence from API role metadata. */
export function mappingConfidenceFromRoleMetadata(
  roles: Record<string, { confidence?: string } | undefined> | null | undefined
): ConfidenceLevel {
  if (!roles || typeof roles !== "object") return "low";
  const keys = ["sales", "product", "date", "region", "customer"] as const;
  let worst: ConfidenceLevel = "high";
  for (const k of keys) {
    const c = normLevel(roles[k]?.confidence);
    if (c === "low") return "low";
    if (c === "medium") worst = "medium";
  }
  return worst;
}
