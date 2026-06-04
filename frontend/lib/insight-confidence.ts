/**
 * Dynamic insight confidence — component model aligned with backend scoring.
 */

import {
  MIN_PEARSON_SAMPLE,
  smallSampleCorrelationConfidenceLine,
} from "@/lib/relationship-visualization";

export type ConfidenceLevel = "high" | "medium" | "low";

export type UnifiedConfidenceSignals = {
  mappingConfidence?: "High" | "Medium" | "Low" | string | null;
  mappingConfirmedByUser?: boolean;
  provenanceConfidence?: string | null;
  insightConfidenceLevel?: string | null;
  insightConfidenceScore?: number | null;
  insightConfidenceRationale?: string | null;
  insightConfidenceReasons?: string[] | null;
  analysisRowCount?: number | null;
  chartSeriesPointCount?: number | null;
  alignmentRepaired?: boolean;
  partialVisualizationWarning?: string | null;
  intentStructured?: boolean;
  hasMetricColumn?: boolean;
  hasCategoryColumn?: boolean;
  aggregationKey?: string | null;
  isTrendChart?: boolean;
  growthRequestUnsatisfied?: boolean;
  trendRequestUnsatisfied?: boolean;
  declineRequestUnsatisfied?: boolean;
  multiMetricRequestUnsatisfied?: boolean;
  relationshipScatter?: boolean;
  relationshipSampleSize?: number | null;
  relationshipPearson?: number | null;
  correlationQualitativeOnly?: boolean;
  forecastProjectionLow?: boolean;
  forecastCanForecast?: boolean | null;
  analysisKind?: string | null;
  chartTypeInternal?: string | null;
  dimensionRedirectHandled?: boolean;
  requestedDimensionMissing?: boolean;
};

export type InsightConfidenceResult = {
  score: number;
  band: ConfidenceLevel;
  reasons: string[];
  level: ConfidenceLevel;
  rationale: string;
  mappingLevel: ConfidenceLevel;
};

export type UnifiedConfidenceResult = InsightConfidenceResult;

const BAND_HIGH = 70;
const BAND_MEDIUM = 42;

function filterContradictoryCorrelationReasons(reasons: string[]): string[] {
  return reasons.filter(
    (r) =>
      !/could not be computed numerically|not computed numerically/i.test(
        String(r)
      )
  );
}

function normLevel(raw: string | null | undefined): ConfidenceLevel {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function bandFromScore(score: number): ConfidenceLevel {
  if (score >= BAND_HIGH) return "high";
  if (score >= BAND_MEDIUM) return "medium";
  return "low";
}

function rowPoints(n: number): { pts: number; reason?: string } {
  if (n <= 0) return { pts: 0, reason: "No filtered rows in cohort" };
  const pts = Math.min(30, 6.5 * Math.log10(Math.max(1, n)));
  return { pts, reason: `${n.toLocaleString()} filtered row(s)` };
}

function groupPoints(cp: number, n: number): { pts: number; reason?: string } {
  if (cp <= 0) return { pts: -12, reason: "Chart has no comparison groups" };
  if (cp === 1) return { pts: -9, reason: "Only one chart group" };
  const rpg = n / cp;
  if (rpg < 3) return { pts: -15, reason: `Sparse groups (~${rpg.toFixed(1)} rows per group)` };
  if (cp > 45) return { pts: -7, reason: `High group count (${cp})` };
  if (cp >= 3 && cp <= 24 && rpg >= 12) {
    return { pts: 14, reason: `Balanced breakdown (${cp} groups, ~${Math.round(rpg)} rows each)` };
  }
  if (rpg >= 8) return { pts: 9, reason: `${cp} groups (~${Math.round(rpg)} rows each)` };
  return { pts: 3, reason: `${cp} chart group(s)` };
}

function normalizeConfidenceChartType(ct: string): string {
  const c = ct.trim().toLowerCase().replace(/-/g, "_");
  if (c === "horizontalbar" || c === "horizontal_bar") return "bar_horizontal";
  if (c === "verticalbar") return "bar";
  return c || "bar";
}

function mappingPoints(map: ConfidenceLevel): { pts: number; reason?: string } {
  if (map === "high") return { pts: 14, reason: "Column mapping is high confidence" };
  if (map === "medium") return { pts: 8, reason: "Column mapping is medium confidence" };
  if (map === "low") return { pts: -6, reason: "Column mapping is low confidence" };
  return { pts: 0 };
}

/** Client-side component model (mirrors backend when API score absent). */
export function calculateInsightConfidence(
  signals: UnifiedConfidenceSignals
): InsightConfidenceResult {
  const rows = Math.max(0, Number(signals.analysisRowCount ?? 0));
  const pts = Math.max(0, Number(signals.chartSeriesPointCount ?? 0));
  const mappingLevel: ConfidenceLevel = signals.mappingConfirmedByUser
    ? "high"
    : normLevel(signals.mappingConfidence ?? "low");

  const reasons: string[] = [];
  let score = 0;

  const add = (block: { pts: number; reason?: string }) => {
    score += block.pts;
    if (block.reason) reasons.push(block.reason);
  };

  add(rowPoints(rows));
  add(groupPoints(pts, rows));
  add(mappingPoints(mappingLevel));

  const structured =
    Boolean(signals.intentStructured) &&
    Boolean(signals.hasMetricColumn) &&
    Boolean(signals.hasCategoryColumn);
  if (structured) {
    score += 11;
    reasons.push("Metric, breakdown, and aggregation resolved structurally");
  } else if (rows >= 20) {
    score -= 8;
    reasons.push("Metric or breakdown not fully structured");
  }

  if (signals.mappingConfirmedByUser) {
    score += 6;
    reasons.push("User confirmed column mapping");
  }

  const kind = (signals.analysisKind ?? "").trim().toLowerCase();
  const ct = normalizeConfidenceChartType(signals.chartTypeInternal ?? "");
  const dimensionRedirect = Boolean(signals.dimensionRedirectHandled);

  if (
    dimensionRedirect &&
    signals.trendRequestUnsatisfied &&
    (kind === "ranking" || kind === "aggregation" || kind === "compare")
  ) {
    score -= 6;
    reasons.push(
      "Time bucket from the question is unavailable; ranking uses the next valid breakdown"
    );
  } else if (signals.trendRequestUnsatisfied) {
    score -= 32;
    reasons.push("Trend question without time-series support");
  }
  if (signals.growthRequestUnsatisfied) {
    score -= 32;
    reasons.push("Growth question without multi-period evidence");
  }
  if (signals.declineRequestUnsatisfied) {
    score -= 32;
    reasons.push("Decline question without multi-period evidence");
  }
  if (signals.multiMetricRequestUnsatisfied) {
    score -= 34;
    reasons.push("Multi-metric compare blocked");
  }
  if (signals.forecastProjectionLow) {
    score -= 24;
    reasons.push("Forecast invalid — scenario/projection only");
  } else if (signals.forecastCanForecast === true) {
    score += 6;
    reasons.push("Time series supports forecasting");
  }

  if (signals.relationshipScatter) {
    const rs = Math.max(0, Number(signals.relationshipSampleSize ?? 0));
    const hasPearson =
      signals.relationshipPearson != null &&
      Number.isFinite(Number(signals.relationshipPearson));
    const qualFail =
      (Boolean(signals.correlationQualitativeOnly) && !hasPearson) || rs < 2;
    if (qualFail) {
      score -= 22;
      reasons.push("Correlation could not be computed numerically");
    } else if (hasPearson && rs > 0 && rs <= MIN_PEARSON_SAMPLE) {
      score -= 12;
      reasons.push(smallSampleCorrelationConfidenceLine(rs));
    } else if (rs <= MIN_PEARSON_SAMPLE) {
      score -= 12;
      reasons.push(`Correlation from only ${rs} joint pair(s)`);
    } else if (rs < 30) {
      score += 4;
      reasons.push(`Moderate scatter sample (${rs} pairs)`);
    } else {
      score += 12;
      reasons.push(`Strong scatter sample (${rs} pairs)`);
    }
  }

  if (kind === "relationship_scatter" && ct === "scatter") {
    score += 8;
    reasons.push("Scatter matches relationship intent");
  } else if (kind === "trend" && (ct === "line" || ct === "area") && !signals.trendRequestUnsatisfied) {
    score += 10;
    reasons.push("Time-series chart matches trend intent");
  } else if (
    (kind === "aggregation" || kind === "ranking" || kind === "compare") &&
    (ct === "bar" || ct === "bar_horizontal" || ct === "histogram")
  ) {
    score += 6;
    reasons.push("Categorical chart fits aggregation intent");
  }

  if (dimensionRedirect) {
    score += 18;
    reasons.push(
      "Requested breakdown is unavailable in the dataset; closest valid ranking is shown with explanation"
    );
    if (signals.requestedDimensionMissing) score += 4;
    if (signals.partialVisualizationWarning) {
      score -= 4;
      reasons.push(
        "Closest alternative breakdown shown (requested dimension unavailable)"
      );
    }
    if (signals.alignmentRepaired) {
      score -= 3;
      reasons.push("Chart adjusted to match available columns");
    }
  } else {
    if (signals.alignmentRepaired) {
      score -= 10;
      reasons.push("Chart/text alignment was repaired");
    }
    if (signals.partialVisualizationWarning) {
      score -= 12;
      reasons.push("Partial visualization warning");
    }
  }

  const apiScore = Number(signals.insightConfidenceScore);
  if (Number.isFinite(apiScore) && signals.insightConfidenceScore != null) {
    score = Math.min(100, Math.max(0, Math.round(apiScore)));
    const apiReasons = signals.insightConfidenceReasons;
    if (Array.isArray(apiReasons) && apiReasons.length > 0) {
      reasons.length = 0;
      let merged = apiReasons.filter((r) => typeof r === "string" && r.trim());
      const relRs = Math.max(0, Number(signals.relationshipSampleSize ?? 0));
      const hasPearson =
        signals.relationshipPearson != null &&
        Number.isFinite(Number(signals.relationshipPearson));
      if (signals.relationshipScatter && hasPearson && relRs >= 2) {
        merged = filterContradictoryCorrelationReasons(merged);
        if (
          relRs < MIN_PEARSON_SAMPLE &&
          !merged.some((r) => /Correlation computed on \d+ paired row/i.test(r))
        ) {
          merged.unshift(smallSampleCorrelationConfidenceLine(relRs));
        }
      }
      reasons.push(...merged);
    }
  } else {
    score = Math.min(100, Math.max(0, Math.round(score)));
  }

  const band = bandFromScore(score);
  const level = normLevel(signals.insightConfidenceLevel) || band;
  const resolvedBand =
    Number.isFinite(apiScore) && signals.insightConfidenceLevel
      ? level
      : band;

  let rationale =
    signals.insightConfidenceRationale?.trim() ||
    (reasons[0]
      ? reasons.length > 1
        ? `${reasons[0]} (${reasons.length} factors).`
        : reasons[0]
      : "Confidence derived from cohort and chart evidence.");

  const relRs = Math.max(0, Number(signals.relationshipSampleSize ?? 0));
  const hasPearson =
    signals.relationshipPearson != null &&
    Number.isFinite(Number(signals.relationshipPearson));
  if (
    signals.relationshipScatter &&
    hasPearson &&
    relRs >= 2 &&
    relRs <= MIN_PEARSON_SAMPLE
  ) {
    rationale = smallSampleCorrelationConfidenceLine(relRs);
  } else if (
    signals.relationshipScatter &&
    hasPearson &&
    /could not be computed numerically|not computed numerically/i.test(rationale)
  ) {
    const cleaned = filterContradictoryCorrelationReasons(reasons);
    rationale = cleaned[0] || rationale;
  }

  return {
    score,
    band: resolvedBand,
    reasons,
    level: resolvedBand,
    rationale,
    mappingLevel,
  };
}

/** @deprecated Use calculateInsightConfidence — kept for existing imports. */
export function computeUnifiedInsightConfidence(
  signals: UnifiedConfidenceSignals
): UnifiedConfidenceResult {
  return calculateInsightConfidence(signals);
}

export function confidenceBadgeLabel(level: ConfidenceLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
