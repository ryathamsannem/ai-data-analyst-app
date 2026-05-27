/** Display label for missing-like preview cell values. */
export const DATA_PREVIEW_MISSING_LABEL = "NULL";

export type PreviewCellValue = string | number | null | undefined;

/** True for null, undefined, "", whitespace-only strings, and NaN. */
export function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number" && Number.isNaN(value)) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

/** Lowercase token for search matching — missing values map to "null". */
export function previewCellSearchToken(value: unknown): string {
  if (isMissingValue(value)) return "null";
  return String(value).toLowerCase();
}
