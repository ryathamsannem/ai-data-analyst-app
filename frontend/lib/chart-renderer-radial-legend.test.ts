import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildRadialLegendPayload,
  formatRadialVisibleLegendLines,
  orderRadialShareDisplayRows,
} from "@/lib/radial-chart-format";
import { PIE_COLORS } from "@/lib/chart-palette";

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

  it("feeds sorted display rows to Pie data and disables default alphabetical Legend sort", () => {
    expect(chartRendererSrc).toContain("data={radialDisplayRows}");
    expect(chartRendererSrc).toMatch(
      /<Legend[\s\S]*?itemSorter=\{null\}/
    );
  });

  it("produces visible legend lines North → South → West → East", () => {
    const displayRows = orderRadialShareDisplayRows(regionProfitShareRows);
    const visible = formatRadialVisibleLegendLines(
      displayRows,
      regionProfitShareRows,
      regionProfitCtx
    );
    expect(visible).toEqual([
      "North · 27% · 57.9K",
      "South · 25% · 54K",
      "West · 25% · 52.9K",
      "East · 23% · 50.6K",
    ]);
  });

  it("matches legend payload order to slice display order", () => {
    const displayRows = orderRadialShareDisplayRows(regionProfitShareRows);
    const payload = buildRadialLegendPayload(
      displayRows,
      regionProfitShareRows,
      PIE_COLORS
    );
    expect(payload.map((item) => item.value)).toEqual(
      displayRows.map((row) => String(row.name))
    );
  });
});
