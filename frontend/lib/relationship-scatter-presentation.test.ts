import { describe, expect, it } from "vitest";
import type { ChartRow } from "@/app/chart-types";
import { computeFinalChartPresentation } from "@/lib/final-chart-presentation";
import {
  freezeVisualizationContract,
  inferVisualizationMode,
  isTrendMode,
  narrativeCopyForContract,
} from "@/lib/selected-visualization";
import {
  buildRelationshipScatterAiContext,
  isRelationshipScatterPresentation,
  labelsLookTemporalForPresentation,
} from "@/lib/relationship-scatter-presentation";

function scatterRows(n = 8): ChartRow[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Point ${i + 1}`,
    value: 100_000 + i * 10_000,
    x: 20 + i * 0.02,
  }));
}

describe("relationship scatter presentation", () => {
  it("synthetic point labels are not treated as temporal", () => {
    const labels = scatterRows().map((r) => String(r.name));
    expect(labelsLookTemporalForPresentation(labels)).toBe(false);
  });

  it("api scatter routes to scatter kind even with Point N labels", () => {
    const kind = computeFinalChartPresentation({
      apiChartType: "scatter",
      title: "What is the correlation between growth rate and revenue?",
      rows: scatterRows(),
    });
    expect(kind).toBe("scatter");
  });

  it("freeze contract uses relationship mode not weekly trend", () => {
    const contract = freezeVisualizationContract({
      id: "t1",
      source: "ai",
      title: "What is the relationship between profit and sales?",
      apiChartType: "scatter",
      chartKindPinned: "scatter",
      labels: scatterRows().map((r) => r.name),
      values: scatterRows().map((r) => r.value),
      rows: scatterRows(),
      scatterXLabel: "Profit",
      scatterYLabel: "Sales",
      aggregationKey: "relationship",
    });
    expect(contract.chartType).toBe("scatter");
    expect(contract.mode).toBe("relationship");
    expect(isTrendMode(contract)).toBe(false);
    expect(contract.timeBucketLabel).toBe("");
    expect(contract.aggregationLabel).toBe("Relationship");
  });

  it("relationship narrative mentions scatter and observations not weekly buckets", () => {
    const contract = freezeVisualizationContract({
      id: "t2",
      source: "ai",
      title: "Is customer count correlated with revenue?",
      apiChartType: "scatter",
      chartKindPinned: "scatter",
      labels: scatterRows().map((r) => r.name),
      values: scatterRows().map((r) => r.value),
      rows: scatterRows(),
      scatterXLabel: "Customers",
      scatterYLabel: "Revenue",
    });
    const copy = narrativeCopyForContract(contract);
    expect(copy.toLowerCase()).toContain("scatter plot");
    expect(copy.toLowerCase()).toContain("customers");
    expect(copy.toLowerCase()).toContain("revenue");
    expect(copy.toLowerCase()).toContain("observation");
    expect(copy.toLowerCase()).not.toContain("weekly time buckets");
  });

  it("correlation scatter never resolves to line chart kind", () => {
    const kind = computeFinalChartPresentation({
      apiChartType: "scatter",
      title: "Is customer count correlated with revenue?",
      rows: scatterRows(),
    });
    expect(kind).toBe("scatter");
    expect(kind).not.toBe("line");
  });

  it("correlation intent never infers trend mode from scatter chart type", () => {
    expect(
      inferVisualizationMode({
        title: "correlation between metrics",
        chartType: "scatter",
        isTimeSeries: false,
        labels: scatterRows().map((r) => r.name),
      })
    ).toBe("relationship");
  });

  it("detects relationship scatter from api chart type", () => {
    expect(
      isRelationshipScatterPresentation({
        apiChartType: "scatter",
        rows: scatterRows(),
      })
    ).toBe(true);
  });

  it("buildRelationshipScatterAiContext uses axis labels dynamically", () => {
    const t = buildRelationshipScatterAiContext({
      xLabel: "growth_rate",
      yLabel: "revenue",
      observationCount: 8,
    });
    expect(t).toMatch(/scatter plot compares/i);
    expect(t).toMatch(/growth rate/i);
    expect(t).toMatch(/revenue/i);
    expect(t).toMatch(/8 observations/);
  });
});
