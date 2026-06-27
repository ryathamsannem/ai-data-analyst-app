import { describe, expect, it } from "vitest";
import { resolveOverviewDatasetTypeLabel } from "@/lib/resolved-dataset-type-label";
import { buildOverviewDashboardContextChips } from "@/lib/overview-dashboard-context-chips";

describe("resolveOverviewDatasetTypeLabel", () => {
  it("prefers explicit type_label over dataset_kind slug", () => {
    expect(
      resolveOverviewDatasetTypeLabel({
        datasetKind: "sales",
        typeLabel: "Banking / Financial Services",
      })
    ).toBe("Banking / Financial Services");
  });

  it("maps banking dataset_kind to banking label", () => {
    expect(
      resolveOverviewDatasetTypeLabel({
        datasetKind: "banking",
      })
    ).toBe("Banking / Financial Services");
  });
});

describe("buildOverviewDashboardContextChips dataset label", () => {
  it("matches Data setup when type_label is provided", () => {
    const chips = buildOverviewDashboardContextChips({
      datasetKind: "sales",
      typeLabel: "Banking / Financial Services",
      mappingDomain: null,
      dashboardFilters: [],
      filterBreadcrumb: "",
      chartCount: 6,
    });
    const dataSetupLabel = resolveOverviewDatasetTypeLabel({
      datasetKind: "sales",
      typeLabel: "Banking / Financial Services",
    });
    expect(chips[0]?.value).toBe(dataSetupLabel);
    expect(chips[0]?.value).toBe("Banking / Financial Services");
    expect(chips[0]?.value).not.toMatch(/sales \/ commercial/i);
  });
});
