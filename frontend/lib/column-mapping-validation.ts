/** Client-side validation for column mapping modal before save. */

import type { ConfidenceLevel } from "@/lib/insight-confidence";

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

export type MappingRoleConfidenceMeta = {
  selected?: string | null;
  confidence?: string | null;
};

export type MappingMetadataConfidenceInput = {
  roles?: Record<string, MappingRoleConfidenceMeta | undefined> | null;
} | null;

const CORE_MAPPING_ROLES = ["sales", "product", "date", "profit"] as const;
const OPTIONAL_MAPPING_ROLES = ["region", "customer"] as const;

function normalizeMappingConfidenceLevel(
  raw: string | null | undefined
): ConfidenceLevel | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low") return "low";
  return null;
}

/** Aligns with backend `_aggregate_mapping_confidence_from_meta`. */
export function aggregateMappingConfidenceFromMetadata(
  meta: MappingMetadataConfidenceInput,
  apiAggregate?: string | null
): ConfidenceLevel {
  const fromApi = normalizeMappingConfidenceLevel(apiAggregate);
  if (fromApi) return fromApi;

  const roles = meta?.roles;
  if (!roles || typeof roles !== "object") return "low";

  let worst: ConfidenceLevel = "high";
  for (const key of CORE_MAPPING_ROLES) {
    const conf =
      normalizeMappingConfidenceLevel(roles[key]?.confidence) ?? "low";
    if (conf === "low") return "low";
    if (conf === "medium") worst = "medium";
  }
  for (const key of OPTIONAL_MAPPING_ROLES) {
    const role = roles[key];
    if (!role?.selected?.trim()) continue;
    const conf =
      normalizeMappingConfidenceLevel(role.confidence) ?? "low";
    if (conf === "low") return "low";
    if (conf === "medium") worst = "medium";
  }
  return worst;
}

export function mappingConfidenceDisplayLabel(
  level: ConfidenceLevel
): "High" | "Medium" | "Low" {
  return level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
}

/** True when mapping modal low-confidence warning should show. */
export function shouldShowMappingLowConfidenceWarning(
  meta: MappingMetadataConfidenceInput,
  mappingConfirmedByUser: boolean,
  apiAggregate?: string | null
): boolean {
  if (mappingConfirmedByUser) return false;
  return aggregateMappingConfidenceFromMetadata(meta, apiAggregate) === "low";
}
