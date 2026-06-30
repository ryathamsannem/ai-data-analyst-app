import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildRadialLegendPayload,
  formatRadialVisibleLegendLines,
  orderRadialShareDisplayRows,
} from "@/lib/radial-chart-format";

const chartRendererSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/components/home/chart-renderer.tsx"),
  "utf8"
);

describe("ChartRenderer radial legend display order", () => {
  const regionProfitShareRows = [
    { name: "East", value: 50_600 },
    { name: "North", value: 57_900 },
    { name: "South", value: 54_000 },
    { name: "West", value: 52_900 },
  ];
  const regionProfitCtx = {
    metricLabel: "Profit",
    chartTitle: "Region Profit Share",
    presentationKind: "donut" as const,
    chartRows: regionProfitShareRows,
  };

  it("feeds sorted display rows to Pie and explicit radial legend content", () => {
    expect(chartRendererSrc).toContain("data={radialDisplayRows}");
    expect(chartRendererSrc).toContain("radialLegendPayload.map");
    expect(chartRendererSrc).toContain("data-radial-legend-export");
    expect(chartRendererSrc).toContain("truncateRadialLegendLine");
  });

  it("produces visible legend lines North → South → West → East", () => {
    const displayRows = orderRadialShareDisplayRows(regionProfitShareRows);
    const visible = formatRadialVisibleLegendLines(
      displayRows,
      regionProfitShareRows,
      regionProfitCtx
    );
    expect(visible.map((line) => line.split(" · ")[0])).toEqual([
      "North",
      "South",
      "West",
      "East",
    ]);
    expect(visible[0]).toMatch(/26\.9%/);
    expect(visible[2]).toMatch(/24\.6%/);
  });

  it("matches legend payload order to slice display order", () => {
    const displayRows = orderRadialShareDisplayRows(regionProfitShareRows);
    const payload = buildRadialLegendPayload(displayRows, regionProfitShareRows);
    expect(payload.map((item) => item.value)).toEqual(
      displayRows.map((row) => String(row.name))
    );
  });
});
