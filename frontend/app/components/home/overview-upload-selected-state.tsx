"use client";

import { memo } from "react";

type DatasetFileKind = "parquet" | "json" | "excel" | "csv" | "generic";

function detectDatasetFileKind(fileName: string): DatasetFileKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".parquet")) return "parquet";
  if (lower.endsWith(".json") || lower.endsWith(".jsonl")) return "json";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".csv")) return "csv";
  return "generic";
}

function datasetFileTypeLabel(fileName: string): string {
  const kind = detectDatasetFileKind(fileName);
  const labels: Record<DatasetFileKind, string> = {
    parquet: "Parquet",
    json: fileName.toLowerCase().endsWith(".jsonl") ? "JSONL" : "JSON",
    excel: "Excel",
    csv: "CSV",
    generic: "Dataset",
  };
  return labels[kind];
}

function DatasetFileTypeIcon({ kind }: { kind: DatasetFileKind }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (kind === "parquet") {
    return (
      <svg {...common} aria-hidden>
        <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z" />
        <path d="M12 12 21 7.5M12 12v9M12 12 3 7.5" />
      </svg>
    );
  }

  if (kind === "json") {
    return (
      <svg {...common} aria-hidden>
        <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
        <path d="M14 3v6h6" />
        <path d="M10 13h4M10 17h4" />
      </svg>
    );
  }

  if (kind === "excel" || kind === "csv") {
    return (
      <svg {...common} aria-hidden>
        <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
        <path d="M14 3v6h6" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <ellipse cx="12" cy="5" rx="7" ry="2.5" />
      <path d="M5 5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5" />
      <path d="M5 11v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
    </svg>
  );
}

/** Compact premium dataset confirmation inside the Overview upload dropzone. */
export const OverviewUploadSelectedState = memo(function OverviewUploadSelectedState({
  fileName,
  fileSizeLabel,
  uploading = false,
}: {
  fileName: string;
  fileSizeLabel: string;
  uploading?: boolean;
}) {
  const kind = detectDatasetFileKind(fileName);
  const typeLabel = datasetFileTypeLabel(fileName);

  return (
    <div className="overview-upload-selected" role="status" aria-live="polite">
      <div className="overview-upload-selected__row">
        <div className="overview-upload-selected__icon" aria-hidden>
          <DatasetFileTypeIcon kind={kind} />
        </div>
        <div className="overview-upload-selected__body">
          <p className="overview-upload-selected__name" title={fileName}>
            {fileName}
          </p>
          <div className="overview-upload-selected__meta-row">
            <p className="overview-upload-selected__meta">
              <span>{fileSizeLabel}</span>
              <span className="overview-upload-selected__meta-sep" aria-hidden>
                •
              </span>
              <span>{typeLabel}</span>
            </p>
            <span className="overview-upload-selected__chip">
              {uploading ? "Uploading…" : "Processing next"}
            </span>
          </div>
        </div>
      </div>
      <p className="overview-upload-selected__hint">
        {uploading ? "Keep this tab open while we process your file" : "Choose another file"}
      </p>
    </div>
  );
});

OverviewUploadSelectedState.displayName = "OverviewUploadSelectedState";
