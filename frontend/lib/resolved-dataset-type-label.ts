import { datasetKindLabel } from "@/app/pdf-report";

/** Known mapping slugs → executive-facing labels (when dataset_kind is generic). */
const MAPPING_DOMAIN_LABELS: Record<string, string> = {
  real_estate: "Real Estate / Property",
};

function isLowSignalTypeLabel(label: string): boolean {
  const n = label.trim().toLowerCase();
  if (!n) return true;
  if (n === "generic" || n === "general business" || n === "general") return true;
  return n === datasetKindLabel("generic").toLowerCase();
}

function resolveMappingDomainLabel(domain: string): string {
  const key = domain.trim().toLowerCase();
  if (MAPPING_DOMAIN_LABELS[key]) return MAPPING_DOMAIN_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Single Overview-facing dataset type label from API fields. */
export function resolveOverviewDatasetTypeLabel(args: {
  datasetKind?: string | null;
  typeLabel?: string | null;
  mappingDomain?: string | null;
}): string {
  const explicit = String(args.typeLabel ?? "").trim();
  if (explicit && !isLowSignalTypeLabel(explicit)) return explicit;

  const domainKind = String(args.datasetKind ?? "").trim().toLowerCase();
  if (domainKind && domainKind !== "generic") {
    return datasetKindLabel(args.datasetKind!);
  }

  const mappingDomain = String(args.mappingDomain ?? "").trim();
  if (mappingDomain) {
    return resolveMappingDomainLabel(mappingDomain);
  }

  if (explicit) return explicit;
  return datasetKindLabel("generic");
}
