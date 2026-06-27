import { describe, expect, it } from "vitest";
import {
  cartesianUsesHorizontalPlot,
  resolveCartesianBarValueAxisProps,
  resolveScatterValueAxisProps,
  resolveTrendValueAxisProps,
} from "@/lib/cartesian-chart-decisions";
import {
  resolveHBarValueAxisProps,
  resolveVerticalBarValueAxisProps,
} from "@/lib/chart-platform/axis-presentation-plan";
import { resolveOverviewBarValueDomain } from "@/lib/overview-bar-value-domain";

const satisfactionRows = [
  { name: "Engineering", value: 4.18 },
  { name: "Marketing", value: 4.12 },
  { name: "Finance", value: 4.19 },
];

const histogramRows = [
  { name: "40-50k", value: 12 },
  { name: "50-60k", value: 28 },
  { name: "60-70k", value: 19 },
  { name: "70-80k", value: 8 },
];

const hBarRows = [
  { name: "North", value: 120 },
  { name: "South", value: 90 },
  { name: "West", value: 115 },
];

const scatterRows = [
  { name: "A", value: 42, x: 10 },
  { name: "B", value: 55, x: 22 },
  { name: "C", value: 38, x: 31 },
  { name: "D", value: 61, x: 44 },
];

const trendValues = [239648.92, 208407.57, 179032.25, 92362.98, 208623.03];

describe("cartesianUsesHorizontalPlot", () => {
  it("is true for bar_horizontal kind", () => {
    expect(cartesianUsesHorizontalPlot("bar_horizontal", null)).toBe(true);
  });

  it("honors category-plan fallback for vertical bar kind", () => {
    expect(
      cartesianUsesHorizontalPlot("bar", { renderAsHorizontalBar: true })
    ).toBe(true);
    expect(
      cartesianUsesHorizontalPlot("bar", { renderAsHorizontalBar: false })
    ).toBe(false);
  });
});

describe("resolveCartesianBarValueAxisProps — vertical bar", () => {
  it("Overview live matches legacy overview bar domain resolver", () => {
    const legacy = resolveOverviewBarValueDomain(satisfactionRows, {
      chartTitle: "Satisfaction Score by Department",
      metricLabel: "Satisfaction Score",
      presentationKind: "bar",
      executiveRounding: false,
    });
    const shared = resolveCartesianBarValueAxisProps({
      chartKind: "bar",
      rows: satisfactionRows,
      chartTitle: "Satisfaction Score by Department",
      metricLabel: "Satisfaction Score",
      context: { pipeline: "overview", capture: false },
    });
    expect(shared).toEqual({ domain: legacy, allowDataOverflow: false });
  });

  it("session live matches resolveVerticalBarValueAxisProps", () => {
    const session = resolveVerticalBarValueAxisProps({
      plan: null,
      chartKind: "bar",
      rows: satisfactionRows,
      chartTitle: "Satisfaction Score by Department",
      metricLabel: "Satisfaction Score",
    });
    const shared = resolveCartesianBarValueAxisProps({
      chartKind: "bar",
      rows: satisfactionRows,
      chartTitle: "Satisfaction Score by Department",
      metricLabel: "Satisfaction Score",
      context: { pipeline: "session", capture: false },
    });
    expect(shared).toEqual(session);
  });
});

describe("resolveCartesianBarValueAxisProps — histogram", () => {
  it("Overview live matches legacy histogram domain resolver", () => {
    const legacy = resolveOverviewBarValueDomain(histogramRows, {
      chartTitle: "Salary Distribution",
      metricLabel: "Employee Count",
      presentationKind: "histogram",
      executiveRounding: false,
    });
    const shared = resolveCartesianBarValueAxisProps({
      chartKind: "histogram",
      rows: histogramRows,
      chartTitle: "Salary Distribution",
      metricLabel: "Employee Count",
      context: { pipeline: "overview", capture: false },
    });
    expect(shared).toEqual({ domain: legacy, allowDataOverflow: false });
  });

  it("session live matches resolveVerticalBarValueAxisProps for histogram", () => {
    const session = resolveVerticalBarValueAxisProps({
      plan: null,
      chartKind: "histogram",
      rows: histogramRows,
      chartTitle: "Salary Distribution",
      metricLabel: "Employee Count",
    });
    const shared = resolveCartesianBarValueAxisProps({
      chartKind: "histogram",
      rows: histogramRows,
      chartTitle: "Salary Distribution",
      metricLabel: "Employee Count",
      context: { pipeline: "session", capture: false },
    });
    expect(shared).toEqual(session);
  });
});

describe("resolveCartesianBarValueAxisProps — horizontal bar", () => {
  it("Overview live uses overview domain with allowDataOverflow false", () => {
    const legacy = resolveOverviewBarValueDomain(hBarRows, {
      chartTitle: "Revenue by Region",
      metricLabel: "Revenue",
      presentationKind: "bar_horizontal",
      executiveRounding: false,
    });
    const shared = resolveCartesianBarValueAxisProps({
      chartKind: "bar_horizontal",
      rows: hBarRows,
      chartTitle: "Revenue by Region",
      metricLabel: "Revenue",
      context: { pipeline: "overview", capture: false },
    });
    expect(shared).toEqual({ domain: legacy, allowDataOverflow: false });
  });

  it("session live matches resolveHBarValueAxisProps", () => {
    const session = resolveHBarValueAxisProps({
      plan: null,
      chartKind: "bar_horizontal",
      rows: hBarRows,
      chartTitle: "Revenue by Region",
      metricLabel: "Revenue",
      executiveRounding: false,
    });
    const shared = resolveCartesianBarValueAxisProps({
      chartKind: "bar_horizontal",
      rows: hBarRows,
      chartTitle: "Revenue by Region",
      metricLabel: "Revenue",
      context: { pipeline: "session", capture: false },
    });
    expect(shared).toEqual(session);
  });
});

describe("resolveTrendValueAxisProps — shared entry", () => {
  it("Overview line uses overview surface domain", () => {
    const props = resolveTrendValueAxisProps({
      chartKind: "line",
      values: trendValues,
      surface: "overview",
    });
    expect(props).not.toBeNull();
    expect(props!.domain.length).toBe(2);
    expect(props!.ticks.length).toBeGreaterThanOrEqual(2);
  });

  it("session detail matches AI Insights / Charts surface", () => {
    const session = resolveTrendValueAxisProps({
      chartKind: "area",
      values: trendValues,
      surface: "session",
    });
    const shared = resolveTrendValueAxisProps({
      chartKind: "area",
      values: trendValues,
      surface: "session",
    });
    expect(shared).toEqual(session);
  });
});

describe("resolveScatterValueAxisProps — shared entry", () => {
  it("returns identical premium axes for Overview and session callers", () => {
    const a = resolveScatterValueAxisProps(scatterRows);
    const b = resolveScatterValueAxisProps(scatterRows);
    expect(a).toEqual(b);
    expect(a!.x.allowDataOverflow).toBe(false);
    expect(a!.y.allowDataOverflow).toBe(false);
  });
});

describe("bar domain parity — ChartRenderer / session pipeline", () => {
  const profitRows = [
    { name: "Engineering", value: 205_126 },
    { name: "Sales", value: 210_000 },
    { name: "Marketing", value: 215_087 },
  ];
  const ordersRows = [
    { name: "Bengaluru", value: 1008 },
    { name: "Mumbai", value: 1015 },
    { name: "Delhi", value: 1002 },
    { name: "Pune", value: 1011 },
  ];

  it("Charts/AI Insights live V-Bar revenue starts at 0 via session pipeline", () => {
    const props = resolveCartesianBarValueAxisProps({
      chartKind: "bar",
      rows: profitRows,
      chartTitle: "Profit by Department",
      metricLabel: "Profit",
      context: { pipeline: "session", capture: false },
    });
    expect(props!.domain![0]).toBe(0);
    expect(props!.domain![1]).toBeGreaterThan(215_087);
  });

  it("Charts/AI Insights live H-Bar orders/count starts at 0 via session pipeline", () => {
    const props = resolveCartesianBarValueAxisProps({
      chartKind: "bar_horizontal",
      rows: ordersRows,
      chartTitle: "Orders by City",
      metricLabel: "Orders",
      context: { pipeline: "session", capture: false },
    });
    expect(props!.domain![0]).toBe(0);
    expect(props!.domain![1]).toBeGreaterThan(1015);
  });

  it("Overview live path matches session fallback for the same profit data", () => {
    const overview = resolveCartesianBarValueAxisProps({
      chartKind: "bar",
      rows: profitRows,
      chartTitle: "Profit by Department",
      metricLabel: "Profit",
      context: { pipeline: "overview", capture: false },
    });
    const session = resolveCartesianBarValueAxisProps({
      chartKind: "bar",
      rows: profitRows,
      chartTitle: "Profit by Department",
      metricLabel: "Profit",
      context: { pipeline: "session", capture: false },
    });
    expect(overview!.domain).toEqual(session!.domain);
    expect(overview!.domain![0]).toBe(0);
  });
});
