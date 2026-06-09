"use client";

import { memo } from "react";
import { ovCard, ovMuted } from "@/lib/overview-ui";
import { dpDatasetContextStrip } from "@/lib/data-preview-ui";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact dataset banner — status, file metadata, rows, and columns. */
export const DataPreviewDatasetContext = memo(function DataPreviewDatasetContext({
  fileName,
  fileSizeBytes,
  sheetLabel,
  rows,
  columnCount,
}: {
  fileName: string | null | undefined;
  fileSizeBytes: number | null | undefined;
  sheetLabel: string | null;
  rows: number;
  columnCount: number;
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
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm leading-snug">
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            Dataset ready
          </span>
        </span>
        <span className="hidden text-[color:var(--text-subtle)] sm:inline" aria-hidden>
          ·
        </span>
        <span
          className="min-w-0 max-w-full truncate font-medium text-foreground"
          title={fullName !== "—" ? fullName : undefined}
        >
          {fullName}
        </span>
        {fileSizeBytes != null && fullName !== "—" ? (
          <>
            <span className="text-[color:var(--text-subtle)]" aria-hidden>
              ·
            </span>
            <span className="shrink-0 tabular-nums text-[color:var(--text-muted)]">
              {formatBytes(fileSizeBytes)}
            </span>
          </>
        ) : null}
        <span className="text-[color:var(--text-subtle)]" aria-hidden>
          ·
        </span>
        <span className="shrink-0 text-[color:var(--text-muted)]" title={sheet}>
          {sheet}
        </span>
        <span className="text-[color:var(--text-subtle)]" aria-hidden>
          ·
        </span>
        <span className="shrink-0 tabular-nums text-foreground">
          <span className={ovMuted}>Rows </span>
          {rows.toLocaleString()}
        </span>
        <span className="text-[color:var(--text-subtle)]" aria-hidden>
          ·
        </span>
        <span className="shrink-0 tabular-nums text-foreground">
          <span className={ovMuted}>Columns </span>
          {columnCount.toLocaleString()}
        </span>
      </div>
    </section>
  );
});

DataPreviewDatasetContext.displayName = "DataPreviewDatasetContext";
