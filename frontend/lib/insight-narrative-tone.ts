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
  /** Time-series trend charts — avoid category ranking / breakdown copy. */
  isTrendChart?: boolean;
  /** Growth question without multi-period evidence. */
  isUnsupportedGrowth?: boolean;
  /** Forecast asked but cohort has no date/time column — projection disclaimer. */
  forecastGuardrails?: {
    canForecast?: boolean;
    outputLabel?: string;
    directionalProjectionLabel?: string | null;
    forecastConfidenceLevel?: string;
    reliabilityMessage?: string | null;
    disclaimer?: string | null;
    lacksTimeSeries?: boolean;
  } | null;
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
        inputs.isUnsupportedGrowth || inputs.isTrendChart
          ? "Column mapping is still inferred — confirm the date and metric columns before acting on short-term trend changes."
          : "Column mapping is still inferred — confirm metric and breakdown fields before acting on rankings."
      );
    }
    if (pts > 0 && pts <= 5) {
      parts.push(
        inputs.isTrendChart
          ? `Only ${pts} time step(s) in this series — avoid over-interpreting short-term swings.`
          : `Only ${pts} comparison group(s) appear in the chart — avoid over-interpreting small gaps.`
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

  const fg = inputs.forecastGuardrails;
  if (fg && (fg.canForecast === false || fg.lacksTimeSeries)) {
    const label = fg.outputLabel?.trim() || "Scenario estimate";
    const dir = fg.directionalProjectionLabel?.trim();
    const conf = fg.forecastConfidenceLevel?.trim() || "Low";
    const rel =
      fg.reliabilityMessage?.trim() ||
      "Reliable forecasting cannot be performed because historical time-series data is unavailable.";
    const parts = [`${label}`, dir ? `(${dir})` : null, `Forecast Confidence: ${conf}.`, rel];
    if (fg.disclaimer?.trim()) {
      parts.push(fg.disclaimer.trim());
    }
    return parts.filter(Boolean).join(" ");
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
  [/\bmust be\b(?!\s+may\b)/gi, "could be"],
  [/\balways\b/gi, "often"],
  [/\bthe main driver is\b/gi, "the strongest observed relationship may be"],
  [/\bdominant driver\b/gi, "strongest observed relationship"],
  [/\bprimary driver\b/gi, "strongest available predictor"],
  [/\bdrives revenue\b/gi, "is associated with revenue"],
  [/\bdrives the highest\b/gi, "shows the highest"],
  [/\bdrives the most\b/gi, "shows the strongest association with"],
  [/\b(is|are)\s+the\s+driver\b/gi, "may be associated"],
  [/\bis the best\b/gi, "may rank highest in this cohort"],
  [/\bis the top\b/gi, "ranks highest in this filtered view"],
  [/\bdominates\b/gi, "leads in this sample"],
  [/\bconfirms that\b/gi, "is consistent with"],
];

const SPECULATIVE_DRIVER_RE =
  /\b(higher|lower|larger|smaller|stronger|weaker)\s+(customer\s+density|order\s+volumes?|product[- ]?category\s+mix|pricing(?:\s+pressure)?)\b/i;

const DRIVER_DISCLAIMER =
  "Potential drivers could include customer density, order volume, pricing, or product mix. Additional analysis is required.";

/** Soften operational driver claims that are not computed in this cohort. */
export function softenSpeculativeOperationalDrivers(text: string): string {
  const raw = text.trim();
  if (!raw || !SPECULATIVE_DRIVER_RE.test(raw)) return text;
  if (/\bpotential drivers could include\b/i.test(raw)) return text;

  let t = raw
    .replace(
      /\b(?:due to|because of|driven by|reflects?|indicates?)\s+(?:higher|larger|stronger)\s+customer\s+density\b/gi,
      "may be consistent with factors such as customer density"
    )
    .replace(/\bhigher customer density\b/gi, "customer density")
    .replace(/\blarger order volumes?\b/gi, "order volume")
    .replace(/\bstronger product[- ]category mix\b/gi, "product mix")
    .replace(/\bbetter pricing\b/gi, "pricing");

  if (!/\b(may|might|could|potential|not measured|additional analysis)\b/i.test(t)) {
    t = `${t.replace(/\.$/, "")}. ${DRIVER_DISCLAIMER}`;
  }
  return t;
}

export function softenAssertiveProse(
  text: string,
  tone: NarrativeTone
): string {
  if (!text.trim() || tone === "confident") return text;
  let t = softenSpeculativeOperationalDrivers(text);
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
