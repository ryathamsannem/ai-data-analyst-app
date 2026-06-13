import { describe, expect, it } from "vitest";
import {
  detectOverviewExportBarOrientation,
  horizontalBarValueDomain,
  roundExecutiveAxisMaximum,
  resolveOverviewEffectivePresentationKind,
  validateOverviewDashboardExportParity,
} from "./overview-dashboard-export";

describe("resolveOverviewEffectivePresentationKind", () => {
  it("preserves horizontal orientation when dashboard renders h-bar fallback", () => {
    expect(
      resolveOverviewEffectivePresentationKind("bar", true)
    ).toBe("bar_horizontal");
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
  it("uses smart tight domains for low-spread breakdowns", () => {
    expect(horizontalBarValueDomain([{ value: 23 }, { value: 17 }])).toEqual([
      16,
      25,
    ]);
    expect(
      horizontalBarValueDomain([{ value: 122 }, { value: 108 }], undefined, {
        chartTitle: "Delivery Days by Payment Method",
        metricLabel: "Delivery Days",
      })
    ).toEqual([100, 130]);
  });

  it("keeps zero baseline when values start well below the maximum", () => {
    expect(
      horizontalBarValueDomain(
        [{ value: 120_000 }, { value: 240_000 }, { value: 310_000 }],
        undefined,
        {
          chartTitle: "Revenue by Region",
          metricLabel: "Revenue",
        }
      )
    ).toEqual([0, 330_000]);
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
});

describe("roundExecutiveAxisMaximum", () => {
  it("rounds padded decimals to clean tick boundaries", () => {
    expect(roundExecutiveAxisMaximum(24.38)).toBe(25);
    expect(roundExecutiveAxisMaximum(129.32)).toBe(130);
    expect(roundExecutiveAxisMaximum(393_470.9)).toBe(400_000);
  });
});

describe("validateOverviewDashboardExportParity", () => {
  it("passes when export kind and orientation match dashboard fallback", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML = `
      <header class="overview-png-export-header"><h3>Delivery Days by Payment Method</h3></header>
      <div class="recharts-cartesian-grid-vertical"><line /></div>
      <g class="recharts-bar-rectangle"><path fill="#6366f1" /></g>
    `;
    const result = validateOverviewDashboardExportParity({
      displayKind: "bar",
      renderBarAsHorizontal: true,
      exportKind: "bar_horizontal",
      exportRoot: root,
      chartTitle: "Delivery Days by Payment Method",
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
      displayKind: "bar",
      renderBarAsHorizontal: true,
      exportKind: "bar_horizontal",
      exportRoot: root,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.id === "orientation")?.ok).toBe(false);
  });
});
