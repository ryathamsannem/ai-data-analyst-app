import { describe, it, expect } from "vitest";
import { resolveTrendValueAxisProps } from "@/lib/overview-premium-axis-domain";

/** Showcase monthly revenue trend (Overview line card fixture). */
const showcaseLineValues = [
  239648.92, 208407.57, 179032.25, 92362.98, 208623.03, 127239.73, 143461.94,
  116641.5, 117558.5, 139889.15, 158815.99, 188664.95, 109286.03, 95516.81,
];

function yDataOccupancy(
  values: readonly number[],
  surface: "overview" | "session" | "default",
  kind: "line" | "area"
) {
  const props = resolveTrendValueAxisProps({ chartKind: kind, values, surface });
  expect(props).not.toBeNull();
  const [lo, hi] = props!.domain;
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  return (dataMax - dataMin) / (hi - lo);
}

describe("Line/Area export domain parity", () => {
  it("Overview live and Overview PNG share the same overview surface domain", () => {
    const lineLive = resolveTrendValueAxisProps({
      chartKind: "line",
      values: showcaseLineValues,
      surface: "overview",
    });
    const linePng = resolveTrendValueAxisProps({
      chartKind: "line",
      values: showcaseLineValues,
      surface: "overview",
    });
    expect(linePng!.domain).toEqual(lineLive!.domain);
    expect(linePng!.ticks).toEqual(lineLive!.ticks);
  });

  it("Charts live (session) vs Charts PNG (default) drift on showcase line data", () => {
    const session = resolveTrendValueAxisProps({
      chartKind: "line",
      values: showcaseLineValues,
      surface: "session",
    });
    const legacyDefault = resolveTrendValueAxisProps({
      chartKind: "line",
      values: showcaseLineValues,
      surface: "default",
    });
    const sessionOcc = yDataOccupancy(showcaseLineValues, "session", "line");
    const defaultOcc = yDataOccupancy(showcaseLineValues, "default", "line");
    expect(sessionOcc).toBeGreaterThan(defaultOcc);
    expect(session!.domain).not.toEqual(legacyDefault!.domain);
    expect(sessionOcc).toBeGreaterThan(0.7);
    expect(defaultOcc).toBeLessThan(0.62);
  });

  it("AI Insights live and PDF capture share session surface domain", () => {
    const live = resolveTrendValueAxisProps({
      chartKind: "area",
      values: showcaseLineValues,
      surface: "session",
    });
    const pdf = resolveTrendValueAxisProps({
      chartKind: "area",
      values: showcaseLineValues,
      surface: "session",
    });
    expect(pdf!.domain).toEqual(live!.domain);
  });
});
