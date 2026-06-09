"use client";

import { useMemo } from "react";
import { buildDatasetInsightsSummary } from "@/lib/data-preview-phase-b";
import {
  type ColumnMappingPick,
  type DataPreviewProfile,
  type PreviewRow,
} from "@/lib/data-preview-schema";
import {
  dpDatasetInsightsSummaryCard,
  dpDatasetSummaryKpiChip,
  dpDatasetSummaryKpiGrid,
  dpDatasetSummaryKpiLabel,
  dpDatasetSummaryKpiValue,
} from "@/lib/data-preview-ui";

type Props = {
  rows: number;
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  mapping: ColumnMappingPick;
};

export function DataPreviewDatasetInsightsSummary({
  rows,
  columns,
  profile,
  preview,
  mapping,
}: Props) {
  const summary = useMemo(
    () =>
      buildDatasetInsightsSummary({
        columns,
        profile,
        preview,
        totalRows: rows,
        mapping,
      }),
    [rows, columns, profile, preview, mapping]
  );

  if (summary.kpis.length === 0) return null;

  return (
    <section className={dpDatasetInsightsSummaryCard} aria-label="Dataset summary">
      <h3 className="text-sm font-semibold text-foreground">Dataset summary</h3>
      <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
        Structure and business profile from column types and upload profile.
      </p>
      <div className={dpDatasetSummaryKpiGrid}>
        {summary.kpis.map((kpi) => (
          <div key={kpi.label} className={dpDatasetSummaryKpiChip}>
            <p className={dpDatasetSummaryKpiValue}>{kpi.value}</p>
            <p className={dpDatasetSummaryKpiLabel}>{kpi.label}</p>
          </div>
        ))}
      </div>
      {summary.notes.length > 0 ? (
        <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
          {summary.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
