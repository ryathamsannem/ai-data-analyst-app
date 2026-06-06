import { apiUrl } from "@/lib/api-base";
import type { PlanLimits, PlanTier } from "@/lib/plan-limits";
import { saasRequestHeaders } from "@/lib/saas-session";

export type UsageSnapshot = {
  ai_questions_used: number;
  ai_questions_remaining: number;
  pdf_exports_used: number;
  pdf_exports_remaining: number | null;
  limits: PlanLimits;
};

export type PlanUsageResponse = {
  tier: PlanTier;
  limits: PlanLimits;
  usage: UsageSnapshot;
};

export async function fetchPlan(): Promise<PlanUsageResponse> {
  const response = await fetch(apiUrl("/plan"), {
    headers: saasRequestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Unable to load plan (${response.status})`);
  }
  return (await response.json()) as PlanUsageResponse;
}

export async function fetchPlanUsage(): Promise<PlanUsageResponse> {
  const response = await fetch(apiUrl("/usage"), {
    headers: saasRequestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Unable to load usage (${response.status})`);
  }
  return (await response.json()) as PlanUsageResponse;
}

export async function reservePdfExport(): Promise<PlanUsageResponse> {
  const response = await fetch(apiUrl("/usage/pdf-export"), {
    method: "POST",
    headers: saasRequestHeaders({ "Content-Type": "application/json" }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    const err = new Error("PDF export limit reached") as Error & {
      detail?: unknown;
      status?: number;
    };
    err.detail = body?.detail;
    err.status = response.status;
    throw err;
  }
  return (await response.json()) as PlanUsageResponse;
}

export async function refundPdfExport(): Promise<PlanUsageResponse> {
  const response = await fetch(apiUrl("/usage/pdf-export/refund"), {
    method: "POST",
    headers: saasRequestHeaders({ "Content-Type": "application/json" }),
  });
  if (!response.ok) {
    throw new Error(`Unable to refund PDF export quota (${response.status})`);
  }
  return (await response.json()) as PlanUsageResponse;
}
