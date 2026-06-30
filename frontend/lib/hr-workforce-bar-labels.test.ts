import { describe, expect, it } from "vitest";
import {
  shouldShowHBarValueLabels,
  shouldShowOverviewBarValueLabels,
} from "@/lib/overview-dashboard-export";
import { formatOverviewBarValueAxisTick } from "@/lib/overview-premium-axis-domain";
import { formatOverviewBarTopValueLabel } from "@/lib/overview-dashboard-export";

/** hr_workforce_1k.csv aggregates (sum salary / bonus, mean performance_rating). */
const salaryByDepartmentRows = [
  { name: "Engineering", value: 16_494_589.38 },
  { name: "Sales", value: 13_479_144.06 },
  { name: "Marketing", value: 13_282_519.05 },
  { name: "Finance", value: 11_696_395.54 },
  { name: "HR", value: 11_452_139.23 },
  { name: "Operations", value: 11_068_643.83 },
  { name: "Support", value: 9_756_326.72 },
];
const salaryCtx = {
  metricLabel: "Salary",
  chartTitle: "Salary by Department",
  presentationKind: "bar_horizontal" as const,
};

const bonusByStatusRows = [
  { name: "Active", value: 5_463_723.57 },
  { name: "Terminated", value: 1_993_808.96 },
  { name: "On Leave", value: 1_719_734.37 },
];
const bonusCtx = {
  metricLabel: "Bonus",
  chartTitle: "Bonus by Employee Status",
  presentationKind: "bar" as const,
};

const perfByDepartmentRows = [
  { name: "Marketing", value: 3.532667 },
  { name: "Finance", value: 3.531126 },
  { name: "Support", value: 3.516 },
  { name: "Operations", value: 3.500709 },
  { name: "HR", value: 3.492517 },
  { name: "Engineering", value: 3.481944 },
  { name: "Sales", value: 3.407746 },
];
const perfCtx = {
  metricLabel: "Performance Rating",
  chartTitle: "Performance Rating by Department",
  presentationKind: "bar_horizontal" as const,
};

describe("HR workforce bar label eligibility", () => {
  it("enables Salary by Department H-Bar labels with compact axis formatter", () => {
    const tickFmt = (v: number) =>
      formatOverviewBarValueAxisTick(v, salaryByDepartmentRows, salaryCtx);
    expect(
      shouldShowHBarValueLabels(salaryByDepartmentRows, tickFmt, {
        metricCtx: salaryCtx,
      })
    ).toBe(true);
    const labels = salaryByDepartmentRows.map((r) => tickFmt(r.value));
    expect(Math.max(...labels.map((s) => s.length))).toBeLessThanOrEqual(7);
  });

  it("enables Bonus by Employee Status V-Bar labels despite skewed totals", () => {
    const topFmt = (v: number) =>
      formatOverviewBarTopValueLabel(v, bonusByStatusRows, bonusCtx);
    expect(
      shouldShowOverviewBarValueLabels(bonusByStatusRows, topFmt, {
        metricCtx: bonusCtx,
      })
    ).toBe(true);
  });

  it("keeps Performance Rating by Department H-Bar labels enabled", () => {
    const tickFmt = (v: number) =>
      formatOverviewBarValueAxisTick(v, perfByDepartmentRows, perfCtx);
    expect(
      shouldShowHBarValueLabels(perfByDepartmentRows, tickFmt, {
        metricCtx: perfCtx,
      })
    ).toBe(true);
  });

  it("still hides crowded V-Bar charts with too many categories", () => {
    const fmt = (v: number) => String(v);
    expect(
      shouldShowOverviewBarValueLabels(
        Array.from({ length: 9 }, (_, i) => ({ value: 4.05 + i * 0.01 })),
        fmt
      )
    ).toBe(false);
  });

  it("still hides labels when formatter produces very long currency strings", () => {
    const currency = (v: number) =>
      v.toLocaleString(undefined, { style: "currency", currency: "USD" });
    expect(
      shouldShowOverviewBarValueLabels(
        [
          { value: 183_916_971 },
          { value: 150_000_000 },
          { value: 132_661_579 },
        ],
        currency
      )
    ).toBe(false);
    expect(
      shouldShowHBarValueLabels(
        [
          { value: 183_916_971 },
          { value: 150_000_000 },
          { value: 132_661_579 },
        ],
        currency
      )
    ).toBe(false);
  });
});
