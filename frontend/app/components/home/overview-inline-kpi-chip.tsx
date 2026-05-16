"use client";

import { memo } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";

/** Small inline KPI chip on Overview (auto-dashboard header row). */
export const OverviewInlineKpiChip = memo(function OverviewInlineKpiChip({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  useDevRenderCount("OverviewInlineKpiChip");
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-1.5 text-[11px] text-slate-700 shadow-[0_1px_2px_rgb(15_23_42/0.05)]">
      <span className="text-slate-500">{title}: </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
});

OverviewInlineKpiChip.displayName = "OverviewInlineKpiChip";
