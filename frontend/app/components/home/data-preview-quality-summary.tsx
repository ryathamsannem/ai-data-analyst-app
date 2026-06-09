"use client";

import { useMemo } from "react";
import {
  buildDataPreviewQualitySummary,
  type ColumnMappingPick,
  type DataPreviewProfile,
  type PreviewRow,
} from "@/lib/data-preview-schema";
import {
  dpQualityCard,
  dpQualityLabelGood,
  dpQualityLabelPoor,
  dpQualityLabelReview,
  dpQualitySummary,
  resolveDuplicateRowsLabel,
} from "@/lib/data-preview-ui";

type Props = {
  rows: number;
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  mapping: ColumnMappingPick;
};

function qualityLabelClass(label: "Good" | "Needs Review" | "Poor"): string {
  if (label === "Good") return dpQualityLabelGood;
  if (label === "Poor") return dpQualityLabelPoor;
  return dpQualityLabelReview;
}

export function DataPreviewQualitySummary({
  rows,
  columns,
  profile,
  preview,
}: Props) {
  const summary = useMemo(
    () =>
      buildDataPreviewQualitySummary({
        rows,
        columns,
        profile,
        preview,
      }),
    [rows, columns, profile, preview]
  );

  const duplicateRowsLabel = useMemo(
    () => resolveDuplicateRowsLabel(preview.length, rows),
    [preview.length, rows]
  );

  return (
    <div className={dpQualitySummary} aria-label="Dataset quality summary">
      <div className={dpQualityCard}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-subtle)]">
          Missing values
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
          {summary.missingPercent != null
            ? `${summary.missingPercent.toFixed(1)}%`
            : "—"}
        </p>
      </div>
      <div className={dpQualityCard} aria-label={duplicateRowsLabel}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-subtle)]">
          {duplicateRowsLabel}
        </p>
        <p
          className="mt-0.5 text-lg font-semibold tabular-nums text-foreground"
          title={summary.duplicateNote ?? undefined}
        >
          {summary.duplicateRowCount != null
            ? summary.duplicateRowCount.toLocaleString()
            : "Not calculated"}
        </p>
        {summary.duplicateNote ? (
          <p className="mt-0.5 text-[10px] leading-snug text-[color:var(--text-subtle)]">
            {summary.duplicateNote}
          </p>
        ) : null}
      </div>
      <div className={dpQualityCard}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-subtle)]">
          Data quality
        </p>
        <p className="mt-1.5">
          <span className={qualityLabelClass(summary.qualityLabel)}>
            {summary.qualityLabel}
          </span>
        </p>
      </div>
    </div>
  );
}
