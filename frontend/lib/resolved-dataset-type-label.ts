import { datasetKindLabel } from "@/app/pdf-report";

/** Single Overview-facing dataset type label from API fields. */
export function resolveOverviewDatasetTypeLabel(args: {
  datasetKind?: string | null;
  typeLabel?: string | null;
  mappingDomain?: string | null;
}): string {
  const explicit = String(args.typeLabel ?? "").trim();
  if (explicit) return explicit;

  const domainKind = String(args.datasetKind ?? "").trim().toLowerCase();
  if (domainKind && domainKind !== "generic") {
    return datasetKindLabel(args.datasetKind!);
  }

  const mappingDomain = String(args.mappingDomain ?? "").trim();
  if (mappingDomain) {
    return mappingDomain
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  return datasetKindLabel("generic");
}
