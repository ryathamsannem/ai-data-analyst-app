"use client";

import { memo } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";
import { ovChip } from "@/lib/overview-ui";

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
    <span className={ovChip}>
      <span className="text-[color:var(--text-subtle)]">{title}: </span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
});

OverviewInlineKpiChip.displayName = "OverviewInlineKpiChip";
