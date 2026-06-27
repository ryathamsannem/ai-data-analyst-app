/**
 * Structured reasoning blocks from backend analysis payloads (Phase A).
 */

export type ReasoningBlockType =
  | "contribution"
  | "leader_laggard_gap"
  | "trend_movement"
  | "evidence";

export type ReasoningConfidence = "high" | "medium" | "low";

export type ReasoningBlock = {
  type: ReasoningBlockType;
  claim: string;
  metric: string | null;
  dimension: string | null;
  entity: string | null;
  value: number | null;
  comparisonValue: number | null;
  sharePct: number | null;
  gapRatio: number | null;
  cohortN: number | null;
  confidence: ReasoningConfidence;
  reason: string;
};

export function parseReasoningBlocks(raw: unknown): ReasoningBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ReasoningBlock[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const claim = typeof o.claim === "string" ? o.claim.trim() : "";
    if (!claim) continue;
    const confRaw = typeof o.confidence === "string" ? o.confidence.trim().toLowerCase() : "medium";
    const confidence: ReasoningConfidence =
      confRaw === "high" || confRaw === "low" ? confRaw : "medium";
    const typeRaw = typeof o.type === "string" ? o.type.trim() : "evidence";
    const type = (
      [
        "contribution",
        "leader_laggard_gap",
        "trend_movement",
        "evidence",
      ] as const
    ).includes(typeRaw as ReasoningBlockType)
      ? (typeRaw as ReasoningBlockType)
      : "evidence";
    out.push({
      type,
      claim,
      metric: typeof o.metric === "string" ? o.metric.trim() || null : null,
      dimension: typeof o.dimension === "string" ? o.dimension.trim() || null : null,
      entity: typeof o.entity === "string" ? o.entity.trim() || null : null,
      value: Number.isFinite(Number(o.value)) ? Number(o.value) : null,
      comparisonValue: Number.isFinite(Number(o.comparisonValue))
        ? Number(o.comparisonValue)
        : null,
      sharePct: Number.isFinite(Number(o.sharePct)) ? Number(o.sharePct) : null,
      gapRatio: Number.isFinite(Number(o.gapRatio)) ? Number(o.gapRatio) : null,
      cohortN: Number.isFinite(Number(o.cohortN)) ? Number(o.cohortN) : null,
      confidence,
      reason: typeof o.reason === "string" ? o.reason.trim() : "",
    });
  }
  return out;
}
