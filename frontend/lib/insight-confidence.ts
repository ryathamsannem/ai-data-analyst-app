/**
 * Unified insight confidence: mapping + provenance + sample size.
 * Calibrated for enterprise analytics: explicit mapping and structured intent
 * can justify High; inferred or thin evidence stays Medium/Low.
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export type UnifiedConfidenceSignals = {
  mappingConfidence?: "High" | "Medium" | "Low" | string | null;
  mappingConfirmedByUser?: boolean;
  provenanceConfidence?: string | null;
  insightConfidenceLevel?: string | null;
  insightConfidenceScore?: number | null;
  insightConfidenceRationale?: string | null;
  analysisRowCount?: number | null;
  chartSeriesPointCount?: number | null;
  alignmentRepaired?: boolean;
  partialVisualizationWarning?: string | null;
  intentStructured?: boolean;
  hasMetricColumn?: boolean;
  hasCategoryColumn?: boolean;
  aggregationKey?: string | null;
};

export type UnifiedConfidenceResult = {
  level: ConfidenceLevel;
  score: number;
  rationale: string;
  mappingLevel: ConfidenceLevel;
};

function normLevel(raw: string | null | undefined): ConfidenceLevel {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function scoreFromLevel(level: ConfidenceLevel): number {
  if (level === "high") return 82;
  if (level === "medium") return 58;
  return 32;
}

export function computeUnifiedInsightConfidence(
  signals: UnifiedConfidenceSignals
): UnifiedConfidenceResult {
  const rows = Math.max(0, Number(signals.analysisRowCount ?? 0));
  const pts = Math.max(0, Number(signals.chartSeriesPointCount ?? 0));
  const mappingLevel = signals.mappingConfirmedByUser
    ? "high"
    : normLevel(signals.mappingConfidence ?? "low");

  let level: ConfidenceLevel = normLevel(signals.insightConfidenceLevel);
  let score =
    Number.isFinite(Number(signals.insightConfidenceScore)) &&
    signals.insightConfidenceScore != null
      ? Math.min(100, Math.max(0, Math.round(Number(signals.insightConfidenceScore))))
      : scoreFromLevel(level);

  const structured =
    Boolean(signals.intentStructured) &&
    Boolean(signals.hasMetricColumn) &&
    Boolean(signals.hasCategoryColumn);
  const hasAgg = Boolean((signals.aggregationKey ?? "").trim());
  const prov = normLevel(signals.provenanceConfidence);
  const semanticGap = !structured || !hasAgg;
  const inferenceRisk =
    Boolean(signals.partialVisualizationWarning) ||
    Boolean(signals.alignmentRepaired);
  const mappingWeak =
    mappingLevel === "low" && !signals.mappingConfirmedByUser;

  if (rows <= 0) {
    level = "low";
    score = Math.min(score, 14);
  } else if (rows < 30 || pts < 2) {
    level = "low";
    score = Math.min(score, 44);
  }

  if (inferenceRisk) {
    if (level === "high") level = "medium";
    score = Math.min(score, 70);
  }

  if (semanticGap && rows >= 20) {
    if (level === "high") level = "medium";
    score = Math.min(score, 62);
  }

  if (mappingWeak) {
    if (level === "high") level = "medium";
    score = Math.min(score, 64);
  }

  const strongEvidence =
    rows >= 100 &&
    pts >= 2 &&
    structured &&
    hasAgg &&
    prov !== "low" &&
    !inferenceRisk;

  const eligibleHigh =
    strongEvidence && (mappingLevel === "high" || signals.mappingConfirmedByUser);

  if (eligibleHigh) {
    level = "high";
    score = Math.max(score, 82);
    score = Math.min(score, 93);
  } else if (
    mappingLevel === "medium" &&
    structured &&
    hasAgg &&
    rows >= 40 &&
    pts >= 2
  ) {
    if (level === "low") level = "medium";
    score = Math.max(score, 52);
    score = Math.min(score, 79);
    if (level === "high") level = "medium";
  } else if (!structured && rows >= 30) {
    level = "low";
    score = Math.min(score, 52);
  }

  let rationale =
    signals.insightConfidenceRationale?.trim() ||
    "Confidence blends cohort size, column mapping clarity, and whether metric and aggregation were resolved deterministically.";

  if (eligibleHigh) {
    rationale =
      "Strong read: columns are mapped with a clear metric and aggregation, cohort size is healthy, and the chart reflects structured intent without repair warnings.";
  } else if (mappingLevel === "medium" && structured) {
    rationale =
      "Moderate read: core metric and breakdown were inferred sensibly — treat rankings as directional until you confirm field mapping.";
  } else if (mappingWeak && rows >= 30) {
    rationale =
      "Mapping still looks inferred — validate the metric and grouping columns before acting on small gaps between categories.";
  } else if (rows < 100 || pts < 3) {
    rationale =
      "Thin evidence in view — use these figures as directional signals and widen filters or refresh data before firm conclusions.";
  } else if (inferenceRisk) {
    rationale =
      "Partial alignment or visualization caveats applied — interpret peaks and rankings cautiously and reconcile with the raw cohort.";
  }

  return {
    level,
    score,
    rationale,
    mappingLevel,
  };
}

export function confidenceBadgeLabel(level: ConfidenceLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
