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

  it("prefers mapping domain over generic type_label for real estate", () => {
    expect(
      resolveOverviewDatasetTypeLabel({
        datasetKind: "generic",
        typeLabel: "Generic",
        mappingDomain: "real_estate",
      })
    ).toBe("Real Estate / Property");
    expect(
      resolveOverviewDatasetTypeLabel({
        datasetKind: "generic",
        typeLabel: "Generic",
        mappingDomain: "real_estate",
      })
    ).not.toBe("General business");
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
