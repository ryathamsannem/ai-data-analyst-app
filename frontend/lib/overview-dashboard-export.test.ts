import { describe, expect, it } from "vitest";
import {
  detectOverviewExportBarOrientation,
  horizontalBarValueDomain,
  roundExecutiveAxisMaximum,
  resolveOverviewEffectivePresentationKind,
  validateOverviewDashboardExportParity,
} from "./overview-dashboard-export";

describe("resolveOverviewEffectivePresentationKind", () => {
  it("maps layout flip only when explicitly requested (legacy helper)", () => {
    expect(
      resolveOverviewEffectivePresentationKind("bar", true)
    ).toBe("bar_horizontal");
    expect(
      resolveOverviewEffectivePresentationKind("bar", false)
    ).toBe("bar");
  });

  it("keeps explicit chart kinds unchanged", () => {
    expect(
      resolveOverviewEffectivePresentationKind("area", false)
    ).toBe("area");
    expect(
      resolveOverviewEffectivePresentationKind("donut", false)
    ).toBe("donut");
    expect(
      resolveOverviewEffectivePresentationKind("scatter", false)
    ).toBe("scatter");
    expect(
      resolveOverviewEffectivePresentationKind("bar_horizontal", true)
    ).toBe("bar_horizontal");
  });
});

describe("detectOverviewExportBarOrientation", () => {
  it("reads horizontal bars from vertical grid layer", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="recharts-cartesian-grid-vertical"><line /></div>
    `;
    expect(detectOverviewExportBarOrientation(root)).toBe("horizontal");
  });

  it("reads vertical bars from horizontal grid layer", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="recharts-cartesian-grid-horizontal"><line /></div>
    `;
    expect(detectOverviewExportBarOrientation(root)).toBe("vertical");
  });
});

describe("horizontalBarValueDomain", () => {
  it("uses zero baseline for low-spread count breakdowns (bar_horizontal policy)", () => {
    const small = horizontalBarValueDomain([{ value: 23 }, { value: 17 }]);
    expect(small[0]).toBe(0);
    expect(small[1]).toBeGreaterThanOrEqual(23 / 0.85);
    const domain = horizontalBarValueDomain(
      [{ value: 122 }, { value: 108 }],
      undefined,
      {
        chartTitle: "Delivery Days by Payment Method",
        metricLabel: "Delivery Days",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(122 / 0.85);
  });

  it("keeps zero baseline when values start well below the maximum", () => {
    const domain = horizontalBarValueDomain(
      [{ value: 120_000 }, { value: 240_000 }, { value: 310_000 }],
      undefined,
      {
        chartTitle: "Revenue by Region",
        metricLabel: "Revenue",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(310_000 / 0.85);
  });

  it("PNG/export H-Bar loan balance uses the same ~85% utilization cap", () => {
    const maxRaw = 183_916_971;
    const domain = horizontalBarValueDomain(
      [
        { name: "Mortgage", value: maxRaw },
        { name: "Credit Card", value: 132_661_579 },
      ],
      undefined,
      {
        chartTitle: "Loan Balance by Product Type",
        metricLabel: "Loan Balance",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(maxRaw / 0.85);
    expect(maxRaw / domain[1]).toBeLessThanOrEqual(0.851);
  });

  it("uses tight PNG domain for low-variance satisfaction scores", () => {
    const domain = horizontalBarValueDomain(
      [
        { value: 4.05 },
        { value: 4.05 },
        { value: 4.07 },
        { value: 4.08 },
        { value: 4.08 },
      ],
      undefined,
      {
        chartTitle: "Satisfaction Score by Campaign",
        metricLabel: "Satisfaction Score",
      }
    );
    expect(domain[0]).toBeGreaterThanOrEqual(4.04);
    expect(domain[1]).toBeLessThanOrEqual(4.09);
    expect(domain[1]).not.toBe(5);
  });

  it("handles empty or non-positive max", () => {
    expect(horizontalBarValueDomain([])).toEqual([0, 1]);
    expect(horizontalBarValueDomain([{ value: 0 }])).toEqual([0, 1]);
  });

  it("PNG/export H-Bar profit domain starts at 0", () => {
    const domain = horizontalBarValueDomain(
      [
        { value: 205_126 },
        { value: 210_000 },
        { value: 215_087 },
      ],
      undefined,
      {
        chartTitle: "Profit by Department",
        metricLabel: "Profit",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(215_087);
  });

  it("PNG/export H-Bar utilization domain starts at 0", () => {
    const domain = horizontalBarValueDomain(
      [
        { value: 0.357 },
        { value: 0.390 },
        { value: 0.415 },
        { value: 0.440 },
      ],
      undefined,
      {
        chartTitle: "Credit Utilization by Product Type",
        metricLabel: "Utilization Rate",
      }
    );
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(0.44);
  });
});

describe("roundExecutiveAxisMaximum", () => {
  it("rounds padded decimals to clean tick boundaries", () => {
    expect(roundExecutiveAxisMaximum(24.38)).toBe(25);
    expect(roundExecutiveAxisMaximum(129.32)).toBe(130);
    expect(roundExecutiveAxisMaximum(393_470.9)).toBe(400_000);
  });
});

describe("validateOverviewDashboardExportParity", () => {
  it("passes when export kind matches canonical vertical bar", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <header class="overview-png-export-header"><h3>Revenue by Region</h3></header>
      <div class="recharts-cartesian-grid-horizontal"><line /></div>
      <g class="recharts-bar-rectangle"><path fill="#6366f1" /></g>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar",
      renderBarAsHorizontal: false,
      exportKind: "bar",
      exportRoot: root,
      chartTitle: "Revenue by Region",
    });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(true);
  });

  it("passes when export kind and orientation match explicit h-bar", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <header class="overview-png-export-header"><h3>Orders by City</h3></header>
      <div class="recharts-cartesian-grid-vertical"><line /></div>
      <g class="recharts-bar-rectangle"><path fill="#6366f1" /></g>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar_horizontal",
      renderBarAsHorizontal: true,
      exportKind: "bar_horizontal",
      exportRoot: root,
      chartTitle: "Orders by City",
    });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(true);
  });

  it("fails when export uses vertical bars but dashboard is horizontal", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="recharts-cartesian-grid-horizontal"><line /></div>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar_horizontal",
      renderBarAsHorizontal: true,
      exportKind: "bar_horizontal",
      exportRoot: root,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(false);
  });
});
