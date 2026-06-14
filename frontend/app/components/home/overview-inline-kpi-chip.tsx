"use client";

import { memo, useMemo } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";
import { ovChip, ovChipText } from "@/lib/overview-ui";

/** Small inline KPI chip on Overview (auto-dashboard header row). */
export const OverviewInlineKpiChip = memo(function OverviewInlineKpiChip({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  useDevRenderCount("OverviewInlineKpiChip");
  const fullLabel = useMemo(() => `${title}: ${value}`, [title, value]);
  return (
    <span className={ovChip} title={fullLabel}>
      <span className={ovChipText}>
        <span className="text-[color:var(--text-subtle)]">{title}: </span>
        <span className="font-semibold text-foreground">{value}</span>
      </span>
    </span>
  );
});

OverviewInlineKpiChip.displayName = "OverviewInlineKpiChip";
