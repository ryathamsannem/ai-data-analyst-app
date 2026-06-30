import { describe, expect, it } from "vitest";
import {
  VBAR_TOP_LABEL_HEADROOM_PX,
  verticalCartesianOuterMargins,
} from "@/lib/chart-layout-config";

describe("verticalCartesianOuterMargins session detail", () => {
  it("uses outer left pad for detail V-Bar — not duplicated Y-axis width", () => {
    const margins = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 94, marginRight: 24 },
      36,
      { insightUi: true, yAxisWidth: 72, pointCount: 5 }
    );
    expect(margins.left).toBeLessThanOrEqual(10);
    expect(margins.right).toBeGreaterThanOrEqual(18);
  });

  it("legacy full layout still caps side margin from vmBalanced", () => {
    const margins = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 94, marginRight: 24 },
      36,
      { insightUi: false }
    );
    expect(margins.left).toBe(36);
  });

  it("raises top margin to label headroom when session V-Bar top labels are shown", () => {
    const without = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 94, marginRight: 24 },
      36,
      { insightUi: true, yAxisWidth: 72, pointCount: 3 }
    );
    const withLabels = verticalCartesianOuterMargins(
      "bar",
      { marginLeft: 94, marginRight: 24 },
      36,
      {
        insightUi: true,
        yAxisWidth: 72,
        pointCount: 3,
        vBarTopLabels: true,
      }
    );
    expect(without.top).toBe(5);
    expect(withLabels.top).toBe(VBAR_TOP_LABEL_HEADROOM_PX);
  });

  it("does not raise top margin for histogram when vBarTopLabels is set", () => {
    const margins = verticalCartesianOuterMargins(
      "histogram",
      { marginLeft: 94, marginRight: 24 },
      36,
      {
        insightUi: true,
        yAxisWidth: 72,
        pointCount: 3,
        vBarTopLabels: true,
      }
    );
    expect(margins.top).toBe(5);
  });
});
