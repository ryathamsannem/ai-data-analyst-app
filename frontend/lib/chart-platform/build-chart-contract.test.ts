import { describe, expect, it } from "vitest";
import { buildChartPresentationContract, withChartPresentationMetadata } from "./build-chart-contract";

describe("buildChartPresentationContract", () => {
  it("freezes chart kind, story, rows, and metadata without owning export layout", () => {
    const contract = buildChartPresentationContract({
      chartId: "chart-1",
      source: "auto_dashboard",
      apiChartType: "horizontalBar",
      resolvedKind: "bar_horizontal",
      title: "Revenue by Region",
      subtitle: "Auto dashboard",
      rows: [
        { name: "North", value: 120 },
        { name: "South", value: 90 },
      ],
      metricLabel: "Revenue",
      categoryLabel: "Region",
      badgeCompact: "H-Bar · 2 groups",
    });

    expect(contract.version).toBe(1);
    expect(contract.kind.resolvedKind).toBe("bar_horizontal");
    expect(contract.kind.rendererFamily).toBe("horizontal_bar");
    expect(contract.kind.orientation).toBe("horizontal");
    expect(contract.story.type).toBe("comparison");
    expect(contract.data.hasFiniteValues).toBe(true);
    expect(contract.metadata.chips.map((chip) => chip.id)).toEqual([
      "view",
      "measure",
      "axis",
      "badge",
    ]);
    expect(contract.legacy.rendererStillSurfaceOwned).toBe(true);
    expect(contract.legacy.exportStillSurfaceOwned).toBe(true);
  });

  it("supports scatter axis metadata", () => {
    const contract = buildChartPresentationContract({
      chartId: "chart-2",
      source: "ai_insights",
      apiChartType: "scatter",
      resolvedKind: "scatter",
      title: "Revenue vs Profit",
      rows: [
        { name: "A", x: 10, value: 4 },
        { name: "B", x: 20, value: 9 },
      ],
      metricLabel: "Profit",
      semanticHeader: {
        mode: "scatter",
        xLabel: "Revenue",
        yLabel: "Profit",
      },
    });

    expect(contract.story.type).toBe("relationship");
    expect(contract.semantics.xAxis?.label).toBe("Revenue");
    expect(contract.semantics.yAxis?.label).toBe("Profit");
    expect(contract.metadata.chips.map((chip) => chip.id)).toEqual([
      "view",
      "measure",
      "x",
      "y",
      "badge",
    ]);
  });
});

describe("withChartPresentationMetadata", () => {
  it("updates chip metadata while preserving chart identity and kind", () => {
    const base = buildChartPresentationContract({
      chartId: "chart-3",
      source: "charts",
      apiChartType: "line",
      resolvedKind: "line",
      title: "Orders Trend",
      rows: [{ name: "Jan", value: 10 }],
    });

    const next = withChartPresentationMetadata(base, {
      metricLabel: "Orders",
      semanticHeader: {
        mode: "mono",
        roleLabel: "Time",
        detailLabel: "Month",
      },
      badgeCompact: "Line · 1 group",
      leadInsight: "Peak: Jan",
    });

    expect(next.identity.chartId).toBe(base.identity.chartId);
    expect(next.kind.resolvedKind).toBe("line");
    expect(next.metadata.chips.at(-1)?.value).toBe("Peak: Jan");
  });
});
