/**
 * Rule-based recommended next actions from backend analysis payloads (Phase C).
 */

export type RecommendedActionType =
  | "drilldown"
  | "validation"
  | "risk_check"
  | "trend_check"
  | "comparison";

export type RecommendedActionPriority = "high" | "medium" | "low";

export type RecommendedAction = {
  type: RecommendedActionType;
  title: string;
  description: string;
  question: string | null;
  priority: RecommendedActionPriority;
  reason: string;
  basedOn: string[];
};

const ACTION_TYPES: RecommendedActionType[] = [
  "drilldown",
  "validation",
  "risk_check",
  "trend_check",
  "comparison",
];

const PRIORITIES: RecommendedActionPriority[] = ["high", "medium", "low"];

export function parseRecommendedActions(raw: unknown): RecommendedAction[] {
  if (!Array.isArray(raw)) return [];
  const out: RecommendedAction[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const description =
      typeof o.description === "string" ? o.description.trim() : "";
    if (!title || !description) continue;

    const typeRaw = typeof o.type === "string" ? o.type.trim() : "drilldown";
    const type = ACTION_TYPES.includes(typeRaw as RecommendedActionType)
      ? (typeRaw as RecommendedActionType)
      : "drilldown";

    const priRaw =
      typeof o.priority === "string" ? o.priority.trim().toLowerCase() : "medium";
    const priority = PRIORITIES.includes(priRaw as RecommendedActionPriority)
      ? (priRaw as RecommendedActionPriority)
      : "medium";

    const question =
      typeof o.question === "string" && o.question.trim()
        ? o.question.trim()
        : null;

    const reason = typeof o.reason === "string" ? o.reason.trim() : "";
    const basedOn = Array.isArray(o.basedOn)
      ? o.basedOn
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      : [];

    out.push({
      type,
      title,
      description,
      question,
      priority,
      reason,
      basedOn,
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function visibleRecommendedActions(
  actions: RecommendedAction[]
): RecommendedAction[] {
  return actions.slice(0, 3);
}
