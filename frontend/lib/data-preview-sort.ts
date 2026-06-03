import { isMissingValue } from "@/lib/data-preview-missing";

type PreviewRow = Record<string, string | number | null>;

export type DataPreviewSortDirection = "asc" | "desc";

/** Active sort — `null` direction means no sort (use original row order). */
export type DataPreviewSortState = {
  column: string;
  direction: DataPreviewSortDirection;
} | null;

export type DataPreviewColumnType =
  | "number"
  | "date"
  | "text"
  | "category"
  | undefined;

/** First click asc → desc → clear. */
export function cycleDataPreviewSort(
  current: DataPreviewSortState,
  column: string
): DataPreviewSortState {
  if (current?.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}

function parseNumericSortValue(v: string | number | null | undefined): number | null {
  if (isMissingValue(v)) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDateSortValue(v: string | number | null | undefined): number | null {
  if (isMissingValue(v)) return null;
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? null : ms;
}

function comparePreviewCellValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  type: DataPreviewColumnType
): number {
  const aEmpty = isMissingValue(a);
  const bEmpty = isMissingValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (type === "number") {
    const na = parseNumericSortValue(a);
    const nb = parseNumericSortValue(b);
    if (na !== null && nb !== null) return na - nb;
  }

  if (type === "date") {
    const da = parseDateSortValue(a);
    const db = parseDateSortValue(b);
    if (da !== null && db !== null) return da - db;
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Returns a new array — does not mutate `rows`.
 * When `sort` is null, preserves the input order (original preview order).
 */
export function sortDataPreviewRows(
  rows: PreviewRow[],
  sort: DataPreviewSortState,
  columnTypes: Record<string, "number" | "date" | "text" | "category"> | undefined
): PreviewRow[] {
  if (!sort) return rows;
  const { column, direction } = sort;
  const type = columnTypes?.[column];
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (left, right) =>
      factor * comparePreviewCellValues(left[column], right[column], type)
  );
}
