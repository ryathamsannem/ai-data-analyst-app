import { describe, expect, it } from "vitest";
import {
  buildOverviewDashboardContextChips,
  overviewDashboardChipsDuplicateKpiCards,
} from "@/lib/overview-dashboard-context-chips";

describe("buildOverviewDashboardContextChips", () => {
  it("uses type_label when provided for banking datasets", () => {
    const chips = buildOverviewDashboardContextChips({
      datasetKind: "banking",
      typeLabel: "Banking / Financial Services",
      mappingDomain: null,
      dashboardFilters: [],
      filterBreadcrumb: "",
      chartCount: 6,
    });
    expect(chips[0]?.value).toBe("Banking / Financial Services");
  });

  it("returns context chips instead of KPI card titles", () => {
    const chips = buildOverviewDashboardContextChips({
      datasetKind: "retail",
      mappingDomain: null,
      dashboardFilters: [{ column: "region", value: "North" }],
      filterBreadcrumb: "",
      chartCount: 6,
    });
    expect(chips.map((chip) => chip.title)).toEqual(["Dataset", "Filters", "Charts"]);
    expect(chips[0]?.value).toMatch(/retail/i);
    expect(chips[1]?.value).toBe("1 active");
    expect(chips[2]?.value).toBe("6");
  });

  it("does not duplicate KPI card titles", () => {
    const kpiTitles = [
      "Total Sales",
      "Total Profit",
      "Average Sales per Record",
      "Top Product Category by Sales amount",
      "Top Region by Sales amount",
    ];
    const chips = buildOverviewDashboardContextChips({
      datasetKind: "retail",
      mappingDomain: "retail",
      dashboardFilters: [],
      filterBreadcrumb: "",
      chartCount: 5,
    });
    expect(overviewDashboardChipsDuplicateKpiCards(chips, kpiTitles)).toBe(false);
  });
});
