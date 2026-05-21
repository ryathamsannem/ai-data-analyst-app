"use client";

import { memo } from "react";
import {
  ovCard,
  ovDataLabel,
  ovDataValue,
  ovMuted,
} from "@/lib/overview-ui";
import {
  dpDatasetContextFileCell,
  dpDatasetContextStrip,
} from "@/lib/data-preview-ui";

function splitFileName(name: string): { base: string; ext: string } {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return { base: trimmed, ext: "" };
  }
  return { base: trimmed.slice(0, dot), ext: trimmed.slice(dot) };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact dataset summary — same inner layout as Overview dataset card (no Replace file). */
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
  const { base: fileBase, ext: fileExt } =
    fullName !== "—" ? splitFileName(fullName) : { base: "—", ext: "" };
  const sheet =
    sheetLabel?.trim() ||
    (fileName?.toLowerCase().endsWith(".csv") ? "CSV" : "—");

  return (
    <section
      className={`${ovCard} ${dpDatasetContextStrip}`}
      aria-label="Loaded dataset"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 lg:gap-x-8">
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Dataset ready
          </span>
        </div>
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className={dpDatasetContextFileCell}>
            <dt className={ovMuted}>File</dt>
            <dd
              className="flex min-w-0 items-baseline gap-x-2.5 font-medium text-foreground sm:gap-x-3"
              title={fullName !== "—" ? fullName : undefined}
            >
              <span className="inline-flex min-w-0 flex-1 overflow-hidden items-baseline">
                <span className="min-w-0 truncate">{fileBase}</span>
                {fileExt ? (
                  <span className="shrink-0 whitespace-nowrap">{fileExt}</span>
                ) : null}
              </span>
              {fileSizeBytes != null && fullName !== "—" ? (
                <span
                  className={`shrink-0 whitespace-nowrap ps-0.5 font-normal tabular-nums ${ovMuted}`}
                >
                  · {formatBytes(fileSizeBytes)}
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
            <dd className={`truncate ${ovDataValue}`} title={sheet}>
              {sheet}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
});
