import { describe, expect, it } from "vitest";
import {
  autoDashboardChartRowsEqual,
  buildRowsFromAutoDashboardMini,
  buildStubVizFromAutoDashboardMini,
  resolveScatterAxisLabels,
} from "@/lib/auto-dashboard-session-sync";

describe("buildRowsFromAutoDashboardMini", () => {
  it("preserves scatter x/y coordinates for session sync", () => {
    const mini = {
      title: "Revenue vs Profit",
      chartType: "scatter",
      labels: ["Point 1", "Point 2", "Point 3"],
      values: [120, 80, 200],
      scatterXValues: [1000, 1500, 900],
      scatterXFormatted: ["1,000", "1,500", "900"],
      xMetricLabel: "Revenue",
      yMetricLabel: "Profit",
      xColumn: "revenue",
      yColumn: "profit",
    };
    const rows = buildRowsFromAutoDashboardMini(mini, "scatter");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ x: 1000, value: 120, displayX: "1,000" });
    expect(rows[1]).toMatchObject({ x: 1500, value: 80 });
    expect(rows[2]).toMatchObject({ x: 900, value: 200 });
  });

  it("builds bar rows without scatter x", () => {
    const mini = {
      title: "Orders by City",
      chartType: "bar",
      labels: ["NYC", "LA"],
      values: [42, 38],
      metricColumn: "orders",
    };
    const rows = buildRowsFromAutoDashboardMini(mini, "bar");
    expect(rows).toHaveLength(2);
    expect(rows[0].x).toBeUndefined();
    expect(rows[0].value).toBe(42);
  });

  it("drops scatter rows without finite x", () => {
    const mini = {
      title: "Revenue vs Profit",
      chartType: "scatter",
      labels: ["A", "B"],
      values: [1, 2],
      scatterXValues: [Number.NaN, 5],
    };
    const rows = buildRowsFromAutoDashboardMini(mini, "scatter");
    expect(rows).toHaveLength(1);
    expect(rows[0].x).toBe(5);
  });
});

describe("buildStubVizFromAutoDashboardMini", () => {
  it("carries scatter axis labels into visualization stub", () => {
    const mini = {
      title: "Revenue vs Profit",
      chartType: "scatter",
      labels: ["P1"],
      values: [10],
      scatterXValues: [100],
      xMetricLabel: "Revenue",
      yMetricLabel: "Profit",
      xColumn: "revenue",
      yColumn: "profit",
    };
    const rows = buildRowsFromAutoDashboardMini(mini, "scatter");
    const viz = buildStubVizFromAutoDashboardMini(mini, "scatter", rows);
    expect(viz.scatterXLabel).toBe("Revenue");
    expect(viz.scatterYLabel).toBe("Profit");
    expect(viz.scatterX).toEqual([100]);
    expect(viz.chartType).toBe("scatter");
    const prov = viz.provenance as {
      numericColumn?: string | null;
      categoryColumn?: string | null;
    };
    expect(prov.numericColumn).toBe("profit");
    expect(prov.categoryColumn).toBe("revenue");
  });
});

describe("resolveScatterAxisLabels", () => {
  it("prefers explicit metric labels over generic fallbacks", () => {
    const labels = resolveScatterAxisLabels({
      title: "Revenue vs Profit",
      chartType: "scatter",
      labels: [],
      values: [],
      xMetricLabel: "Revenue",
      yMetricLabel: "Profit",
    });
    expect(labels.scatterXLabel).toBe("Revenue");
    expect(labels.scatterYLabel).toBe("Profit");
  });
});

describe("autoDashboardChartRowsEqual", () => {
  it("compares scatter x when deduping session snapshots", () => {
    const a = [{ name: "P1", value: 1, x: 10 }];
    const b = [{ name: "P1", value: 1, x: 11 }];
    expect(autoDashboardChartRowsEqual(a, b)).toBe(false);
    expect(autoDashboardChartRowsEqual(a, [{ name: "P1", value: 1, x: 10 }])).toBe(
      true
    );
  });
});
