import { resolveOverviewDatasetTypeLabel } from "@/lib/resolved-dataset-type-label";

export type OverviewDashboardContextChip = {
  title: string;
  value: string;
};

/** Context-only chips for Auto Dashboard Charts — not KPI card duplicates. */
export function buildOverviewDashboardContextChips(args: {
  datasetKind: string;
  typeLabel?: string | null;
  mappingDomain?: string | null;
  dashboardFilters: readonly unknown[];
  filterBreadcrumb: string;
  chartCount: number;
}): OverviewDashboardContextChip[] {
  const chips: OverviewDashboardContextChip[] = [];
  const datasetTypeLabel = resolveOverviewDatasetTypeLabel({
    datasetKind: args.datasetKind,
    typeLabel: args.typeLabel,
    mappingDomain: args.mappingDomain,
  });
  chips.push({ title: "Dataset", value: datasetTypeLabel });

  const activeFilterCount =
    args.dashboardFilters.length + (args.filterBreadcrumb.trim().length > 0 ? 1 : 0);
  chips.push({
    title: "Filters",
    value: activeFilterCount > 0 ? `${activeFilterCount} active` : "None",
  });

  if (args.chartCount > 0) {
    chips.push({ title: "Charts", value: String(args.chartCount) });
  }
  return chips;
}

/** True when chip row repeats KPI card titles instead of context metadata. */
export function overviewDashboardChipsDuplicateKpiCards(
  chips: readonly OverviewDashboardContextChip[],
  kpiTitles: readonly string[]
): boolean {
  const chipTitles = new Set(chips.map((chip) => chip.title.trim().toLowerCase()));
  const normalizedKpiTitles = kpiTitles.map((title) => title.trim().toLowerCase());
  if (normalizedKpiTitles.length === 0) return false;
  const overlap = normalizedKpiTitles.filter((title) => chipTitles.has(title));
  return overlap.length >= Math.min(3, normalizedKpiTitles.length);
}
