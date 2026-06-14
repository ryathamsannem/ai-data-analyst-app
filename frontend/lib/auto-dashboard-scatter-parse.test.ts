import { describe, expect, it } from "vitest";

/** Mirror of parseAutoDashboardMiniCharts scatter contract (page.tsx). */
function parseScatterChart(raw: Record<string, unknown>) {
  const chartType = String(raw.chartType ?? "bar");
  const labelsRaw = Array.isArray(raw.labels) ? raw.labels : [];
  const valsRaw = Array.isArray(raw.values) ? raw.values : [];
  const scatterXRaw = Array.isArray(raw.scatterX) ? raw.scatterX : [];
  const ctNorm = chartType.toLowerCase().replace(/\s+/g, "");
  const pairs: { x?: number; value: number }[] = [];
  const n = Math.min(labelsRaw.length, valsRaw.length);
  for (let i = 0; i < n; i++) {
    const num = Number(valsRaw[i]);
    if (!Number.isFinite(num)) continue;
    const pair: { x?: number; value: number } = { value: num };
    if (ctNorm === "scatter" && i < scatterXRaw.length) {
      const xn = Number(scatterXRaw[i]);
      if (Number.isFinite(xn)) pair.x = xn;
    }
    pairs.push(pair);
  }
  if (ctNorm === "scatter" && !pairs.some((p) => Number.isFinite(p.x))) {
    return null;
  }
  return pairs;
}

describe("auto dashboard scatter payload", () => {
  it("requires scatterX for scatter charts", () => {
    const withoutX = parseScatterChart({
      chartType: "scatter",
      labels: ["1", "2"],
      values: [10, 20],
    });
    expect(withoutX).toBeNull();

    const withX = parseScatterChart({
      chartType: "scatter",
      labels: ["a", "b"],
      values: [10, 20],
      scatterX: [100, 200],
    });
    expect(withX).toHaveLength(2);
    expect(withX?.[0].x).toBe(100);
  });
});
