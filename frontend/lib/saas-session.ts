import { normalizePlanTier, type PlanTier } from "@/lib/plan-limits";

const SESSION_KEY = "ai-analyst-session-id";
const PLAN_KEY = "ai-analyst-plan-tier";
export const PLAN_TIER_CHANGED_EVENT = "ai-analyst-plan-tier-changed";
export const USAGE_REFRESH_EVENT = "ai-analyst-usage-refresh";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "anonymous";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing?.trim()) return existing.trim();
  const next = randomId();
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

export function getPlanTier(): PlanTier {
  if (typeof window === "undefined") return "free";
  return normalizePlanTier(window.localStorage.getItem(PLAN_KEY));
}

export function setPlanTier(tier: PlanTier): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAN_KEY, tier);
  window.dispatchEvent(
    new CustomEvent(PLAN_TIER_CHANGED_EVENT, { detail: tier })
  );
}

export function notifyUsageRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(USAGE_REFRESH_EVENT));
}

export function saasRequestHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  return {
    "X-Session-Id": getOrCreateSessionId(),
    "X-Plan-Tier": getPlanTier(),
    ...extra,
  };
}
