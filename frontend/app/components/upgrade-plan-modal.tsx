"use client";

import { UsageDashboard } from "@/app/components/usage-dashboard";
import {
  getPlanLimits,
  upgradeHeadlineForLimit,
  type LimitKind,
  type PlanTier,
} from "@/lib/plan-limits";
import { BRANDING } from "@/lib/branding-config";
import type { PlanUsageResponse } from "@/lib/usage-api";

type UpgradePlanModalProps = {
  open: boolean;
  limit: LimitKind | null;
  tier: PlanTier;
  message?: string;
  planUsage: PlanUsageResponse | null;
  usageLoading?: boolean;
  onClose: () => void;
  onSwitchToPaid: () => void;
};

export function UpgradePlanModal({
  open,
  limit,
  tier,
  message,
  planUsage,
  usageLoading = false,
  onClose,
  onSwitchToPaid,
}: UpgradePlanModalProps) {
  if (!open) return null;

  const paid = getPlanLimits("paid");
  const headline = limit ? upgradeHeadlineForLimit(limit) : "Upgrade to Paid";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-plan-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] shadow-[0_24px_64px_-24px_rgba(15,23,42,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--border-default)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                {tier === "free" ? "Free plan" : "Usage limit"}
              </p>
              <h2
                id="upgrade-plan-title"
                className="mt-1 text-xl font-semibold text-foreground"
              >
                {headline}
              </h2>
            </div>
            <button
              type="button"
              className="text-2xl leading-none text-[color:var(--text-subtle)] transition hover:text-foreground"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm leading-relaxed text-[color:var(--text-muted)]">
          {message ? <p className="text-[color:var(--foreground)]">{message}</p> : null}

          <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-subtle)]">
              Your usage
            </p>
            <UsageDashboard
              data={planUsage}
              loading={usageLoading}
              compact
            />
          </div>

          <p>
            Payment is not wired yet — use the plan menu in the {BRANDING.appName}{" "}
            header to preview Paid access during development.
          </p>
          <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-subtle)]">
              Paid includes
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Uploads up to 25 MB</li>
              <li>Up to {paid.max_dataset_rows?.toLocaleString()} rows</li>
              <li>{paid.ai_questions_limit} AI questions per month</li>
              <li>Unlimited PDF exports</li>
              <li>Full dataset analysis</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--border-default)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[color:var(--border-default)] px-4 py-2 text-sm font-medium text-[color:var(--text-muted)] transition hover:text-foreground"
          >
            Not now
          </button>
          {tier === "free" ? (
            <button
              type="button"
              onClick={onSwitchToPaid}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Switch to Paid (preview)
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
