import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import {
  computeAutoDashboardChartPresentation,
  computeFinalChartPresentation,
  rankIntentFromText,
  resolveBarFamilyKind,
} from "@/lib/final-chart-presentation";
import { resolveSnapshotPresentationKind } from "@/lib/normalize-visualization-contract";

const regionRows: ChartRow[] = [
  { name: "North", value: 120 },
  { name: "South", value: 95 },
  { name: "East", value: 88 },
  { name: "West", value: 72 },
];

const cityRows: ChartRow[] = [
  { name: "NYC", value: 120 },
  { name: "LA", value: 95 },
  { name: "Chicago", value: 88 },
  { name: "Houston", value: 72 },
  { name: "Phoenix", value: 61 },
  { name: "Philly", value: 55 },
  { name: "San Antonio", value: 48 },
];

describe("resolveBarFamilyKind", () => {
  it("returns vertical bar for simple comparison with ≤6 short categories", () => {
    expect(
      resolveBarFamilyKind({
        rows: regionRows,
        title: "Revenue by region",
        question: "Compare revenue across regions",
      })
    ).toBe("bar");
  });

  it("returns horizontal bar when category count exceeds six", () => {
    expect(
      resolveBarFamilyKind({
        rows: cityRows,
        title: "Orders by city",
      })
    ).toBe("bar_horizontal");
  });

  it("returns horizontal bar for ranking intent", () => {
    expect(
      resolveBarFamilyKind({
        rows: regionRows,
        title: "Top 3 regions by revenue",
      })
    ).toBe("bar_horizontal");
    expect(rankIntentFromText("Top 3 regions by revenue")).toBe(true);
  });

  it("does not treat compare phrasing alone as ranking intent", () => {
    expect(
      rankIntentFromText("Compare revenue across regions", "Compare revenue across regions")
    ).toBe(false);
  });

  it("returns horizontal bar for long category labels", () => {
    const rows: ChartRow[] = [
      { name: "North America Enterprise Division", value: 10 },
      { name: "South", value: 8 },
    ];
    expect(
      resolveBarFamilyKind({
        rows,
        title: "Revenue by region",
      })
    ).toBe("bar_horizontal");
  });
});

describe("computeFinalChartPresentation", () => {
  it("re-evaluates API horizontalBar to vertical bar for compact comparisons", () => {
    expect(
      computeFinalChartPresentation({
        apiChartType: "horizontalBar",
        title: "Revenue by region",
        question: "Compare revenue across regions",
        rows: regionRows,
      })
    ).toBe("bar");
  });

  it("keeps horizontal bar when more than six categories", () => {
    expect(
      computeFinalChartPresentation({
        apiChartType: "horizontalBar",
        title: "Orders by city",
        rows: cityRows,
      })
    ).toBe("bar_horizontal");
  });
});

describe("computeAutoDashboardChartPresentation", () => {
  it("matches canonical policy for generic dashboard horizontalBar API type", () => {
    expect(
      computeAutoDashboardChartPresentation({
        apiChartType: "horizontalBar",
        title: "Average revenue by region",
        rows: regionRows,
      })
    ).toBe("bar");
  });

  it("uses horizontal bar when more than six categories", () => {
    expect(
      computeAutoDashboardChartPresentation({
        apiChartType: "bar",
        title: "Orders by city",
        rows: cityRows,
      })
    ).toBe("bar_horizontal");
  });
});

describe("resolveSnapshotPresentationKind", () => {
  it("honours pinned chart kind from frozen contract", () => {
    expect(
      resolveSnapshotPresentationKind({
        title: "Orders by City",
        rows: cityRows,
        apiChartType: "horizontalBar",
        pinnedChartKind: "bar_horizontal",
        source: "auto_dashboard",
        contract: {
          id: "x",
          source: "auto_dashboard",
          title: "Orders by City",
          displayTitle: "Orders by City",
          chartType: "bar_horizontal",
          rendererType: "bar_horizontal",
          mode: "comparison",
          labels: cityRows.map((r) => r.name),
          series: cityRows.map((r) => r.value),
          categoryKey: "city",
          metricKey: "orders",
          aggregation: "sum",
          dimension: "City",
          timeKey: null,
          timeBucketLabel: "",
          metricLabel: "Orders",
          aggregationLabel: "Total",
          isTimeSeries: false,
          semanticContext: null,
          aiContext: null,
          generatedAt: 0,
        },
      })
    ).toBe("bar_horizontal");
  });

  it("re-evaluates unpinned horizontalBar API to vertical bar for compact rows", () => {
    expect(
      resolveSnapshotPresentationKind({
        title: "Revenue by region",
        rows: regionRows,
        apiChartType: "horizontalBar",
        source: "auto_dashboard",
      })
    ).toBe("bar");
  });
});
