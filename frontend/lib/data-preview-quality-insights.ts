import { humanizeColumnName } from "@/lib/analytics-metadata";
import {
  classifyColumnTypeBadge,
  isLikelyIdentifierColumn,
  previewColumnUniqueCount,
  type DataPreviewProfile,
  type PreviewRow,
} from "@/lib/data-preview-schema";

export type DataPreviewInsightSeverity = "info" | "warning" | "attention";

export type DataPreviewQualityInsight = {
  message: string;
  severity: DataPreviewInsightSeverity;
};

function parsePreviewCellToTimestamp(
  v: string | number | null | undefined
): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (v > 1e12 && v < 1e15) return v;
    if (v > 1e9 && v <= 1e12) return v * 1000;
    const d = new Date(v);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const s = String(v).trim();
  if (!s) return null;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  const t2 = new Date(s).getTime();
  return Number.isNaN(t2) ? null : t2;
}

export function buildDataPreviewQualityInsights(args: {
  columns: string[];
  profile: DataPreviewProfile | null;
  preview: PreviewRow[];
  totalRows: number;
}): DataPreviewQualityInsight[] {
  const { columns, profile, preview, totalRows } = args;
  if (!profile || columns.length === 0 || totalRows <= 0) return [];

  const notes: DataPreviewQualityInsight[] = [];
  const seen = new Set<string>();

  const push = (message: string, severity: DataPreviewInsightSeverity) => {
    const t = message.replace(/\s+/g, " ").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    notes.push({ message: t, severity });
  };

  for (const col of columns) {
    const nullRaw = profile.null_counts?.[col];
    const nullCount =
      typeof nullRaw === "number" && Number.isFinite(nullRaw) ? nullRaw : 0;
    if (nullCount > 0) {
      const nullPct = (nullCount / totalRows) * 100;
      push(
        `${humanizeColumnName(col)} has missing values`,
        nullPct > 5 ? "attention" : "warning"
      );
    }
  }

  let addedHighUniq = false;
  for (const col of columns) {
    const type = profile.column_types?.[col];
    const badge = classifyColumnTypeBadge(col, type);
    const nonNull = preview.filter(
      (row) => row[col] != null && row[col] !== ""
    ).length;
    const distinct = previewColumnUniqueCount(preview, col);
    const uniqRatio = nonNull > 0 ? distinct / nonNull : 0;
    const possibleKey = isLikelyIdentifierColumn({
      column: col,
      type,
      preview,
      badge,
    });
    if (possibleKey) {
      push(`${humanizeColumnName(col)} looks like an identifier`, "info");
    }
    const highCard =
      !possibleKey &&
      type !== "date" &&
      nonNull >= 8 &&
      uniqRatio >= 0.92 &&
      (type === "category" || type === "text");
    if (highCard && !addedHighUniq) {
      push(`${humanizeColumnName(col)} has mostly unique values`, "info");
      addedHighUniq = true;
    }
  }

  for (const col of columns) {
    if (profile.column_types?.[col] !== "date") continue;
    let minMs: number | null = null;
    let maxMs: number | null = null;
    for (const row of preview) {
      const t = parsePreviewCellToTimestamp(row[col]);
      if (t == null) continue;
      if (minMs == null || t < minMs) minMs = t;
      if (maxMs == null || t > maxMs) maxMs = t;
    }
    if (minMs == null || maxMs == null) continue;
    const y0 = new Date(minMs).getFullYear();
    const y1 = new Date(maxMs).getFullYear();
    if (y1 - y0 >= 1) {
      push(`${humanizeColumnName(col)} spans multiple years`, "info");
    }
  }

  return notes.slice(0, 5);
}
