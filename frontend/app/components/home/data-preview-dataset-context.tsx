"use client";

import { memo } from "react";
import { ovCard, ovDataLabel, ovDataValue, ovMuted } from "@/lib/overview-ui";
import { dpDatasetContextFileCell, dpDatasetContextStrip } from "@/lib/data-preview-ui";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Full-width dataset summary — aligned with Overview dataset-ready card. */
export const DataPreviewDatasetContext = memo(function DataPreviewDatasetContext({
  fileName,
  fileSizeBytes,
  rows,
  columnCount,
  sheetLabel,
}: {
  fileName: string | null | undefined;
  fileSizeBytes: number | null | undefined;
  rows: number;
  columnCount: number;
  sheetLabel: string | null;
}) {
  const fullName = fileName?.trim() || "—";
  const sheet =
    sheetLabel?.trim() ||
    (fileName?.toLowerCase().endsWith(".csv") ? "CSV" : "—");
  return (
    <section
      className={`${ovCard} ${dpDatasetContextStrip}`}
      aria-label="Loaded dataset"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Dataset ready
          </span>
        </div>
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-6">
          <div className={dpDatasetContextFileCell}>
            <dt className={ovMuted}>File</dt>
            <dd
              className="min-w-0 font-medium text-foreground"
              title={fullName !== "—" ? fullName : undefined}
            >
              <span className="block min-w-0 break-words leading-snug [overflow-wrap:anywhere]">
                {fullName}
              </span>
              {fileSizeBytes != null && fullName !== "—" ? (
                <span className={`mt-0.5 block text-xs font-normal ${ovMuted}`}>
                  {formatBytes(fileSizeBytes)}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className={ovDataLabel}>Rows</dt>
            <dd className={ovDataValue}>{rows.toLocaleString()}</dd>
          </div>
          <div>
            <dt className={ovDataLabel}>Columns</dt>
            <dd className={ovDataValue}>{columnCount.toLocaleString()}</dd>
          </div>
          <div className="min-w-0">
            <dt className={ovDataLabel}>Sheet</dt>
            <dd className={`min-w-0 ${ovDataValue}`} title={sheet}>
              {sheet}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
});

DataPreviewDatasetContext.displayName = "DataPreviewDatasetContext";
