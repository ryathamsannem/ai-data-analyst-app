"use client";

import { memo, useMemo } from "react";
import { buildUsageQuotaRows } from "@/lib/usage-display";
import type { PlanUsageResponse } from "@/lib/usage-api";

type UsageDashboardProps = {
  data: PlanUsageResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
  className?: string;
};

export const UsageDashboard = memo(function UsageDashboard({
  data,
  loading = false,
  error = null,
  compact = false,
  className = "",
}: UsageDashboardProps) {
  const rows = useMemo(() => {
    if (!data) return [];
    return buildUsageQuotaRows(data.tier, data.limits, data.usage);
  }, [data]);

  const rowGap = compact ? "gap-2" : "gap-2.5";
  const labelClass = compact
    ? "text-[11px] font-medium text-[color:var(--text-subtle)]"
    : "text-xs font-medium text-[color:var(--text-subtle)]";
  const valueClass = compact
    ? "text-xs font-semibold text-foreground"
    : "text-sm font-semibold text-foreground";

  if (loading && !data) {
    return (
      <div className={`text-xs text-[color:var(--text-muted)] ${className}`}>
        Loading usage…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`text-xs text-red-600 dark:text-red-400 ${className}`}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`text-xs text-[color:var(--text-muted)] ${className}`}>
        Usage unavailable.
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${rowGap} ${className}`}>
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className={labelClass}>{row.label}</span>
            <span className={`${valueClass} text-right`}>{row.value}</span>
          </div>
          {row.hint ? (
            <p className="mt-0.5 text-[10px] text-[color:var(--text-subtle)]">
              Resets {row.hint}
            </p>
          ) : null}
          {row.progress != null ? (
            <div
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-[color:var(--surface-inset)]"
              role="progressbar"
              aria-valuenow={row.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.label} usage`}
            >
              <div
                className={
                  row.progress >= 100
                    ? "h-full rounded-full bg-amber-500"
                    : "h-full rounded-full bg-indigo-500/80"
                }
                style={{ width: `${row.progress}%` }}
              />
            </div>
          ) : null}
        </div>
      ))}
      {loading ? (
        <p className="text-[10px] text-[color:var(--text-subtle)]">Refreshing…</p>
      ) : null}
    </div>
  );
});

UsageDashboard.displayName = "UsageDashboard";
