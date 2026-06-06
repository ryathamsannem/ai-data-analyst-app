import { formatBytes, type PlanLimits, type PlanTier } from "@/lib/plan-limits";
import type { UsageSnapshot } from "@/lib/usage-api";

export type UsageQuotaRow = {
  label: string;
  value: string;
  hint?: string;
  progress?: number | null;
};

export function formatQuotaUsedRemaining(
  used: number,
  remaining: number | null,
  unlimitedLabel = "Unlimited"
): string {
  if (remaining === null) {
    return `${used.toLocaleString()} used · ${unlimitedLabel}`;
  }
  return `${used.toLocaleString()} used · ${remaining.toLocaleString()} remaining`;
}

export function formatAiPeriodLabel(period: "day" | "month"): string {
  return period === "day" ? "today" : "this month";
}

export function quotaProgress(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function buildUsageQuotaRows(
  tier: PlanTier,
  limits: PlanLimits,
  usage: UsageSnapshot
): UsageQuotaRow[] {
  const aiPeriod = formatAiPeriodLabel(limits.ai_questions_period);
  const pdfPeriod =
    limits.pdf_exports_period === "day" ? "today" : "this month";

  const pdfValue =
    tier === "paid"
      ? formatQuotaUsedRemaining(usage.pdf_exports_used, null)
      : formatQuotaUsedRemaining(
          usage.pdf_exports_used,
          usage.pdf_exports_remaining
        );

  return [
    {
      label: "Current plan",
      value: tier === "paid" ? "Paid" : "Free / Trial",
    },
    {
      label: "File size limit",
      value: formatBytes(limits.max_file_bytes),
    },
    {
      label: "AI questions",
      value: formatQuotaUsedRemaining(
        usage.ai_questions_used,
        usage.ai_questions_remaining
      ),
      hint: aiPeriod,
      progress: quotaProgress(
        usage.ai_questions_used,
        limits.ai_questions_limit
      ),
    },
    {
      label: "PDF exports",
      value: pdfValue,
      hint: tier === "paid" ? "unlimited" : pdfPeriod,
      progress:
        tier === "paid"
          ? null
          : quotaProgress(
              usage.pdf_exports_used,
              limits.pdf_exports_limit
            ),
    },
    {
      label: "Preview row limit",
      value: `Up to ${limits.max_preview_rows.toLocaleString()} rows`,
    },
  ];
}
