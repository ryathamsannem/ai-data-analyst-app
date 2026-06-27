/** Client-side validation for column mapping modal before save. */

export type ColumnMappingRole =
  | "product"
  | "sales"
  | "region"
  | "customer"
  | "profit"
  | "date";

const ROLE_LABELS: Record<ColumnMappingRole, string> = {
  product: "Grouping dimension",
  sales: "Primary metric",
  region: "Region",
  customer: "Customer",
  profit: "Secondary metric",
  date: "Date",
};

export function validateColumnMappingSelections(
  availableColumns: readonly string[],
  selections: Partial<Record<ColumnMappingRole, string>>
): { ok: true } | { ok: false; message: string } {
  const columnSet = new Set(availableColumns);
  for (const role of Object.keys(selections) as ColumnMappingRole[]) {
    const trimmed = String(selections[role] ?? "").trim();
    if (!trimmed) continue;
    if (!columnSet.has(trimmed)) {
      return {
        ok: false,
        message: `${ROLE_LABELS[role]} "${trimmed}" is not in the uploaded dataset.`,
      };
    }
  }
  return { ok: true };
}
