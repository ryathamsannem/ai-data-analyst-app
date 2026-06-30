import { describe, expect, it } from "vitest";
import {
  CHART_AXIS_CSS,
  CHART_BAR_INLAY_LABEL_CSS,
  CHART_BAR_VALUE_LABEL_CSS,
} from "@/lib/chart-axis-theme";

describe("chart bar label tokens", () => {
  it("uses axis label token for V-Bar top labels (stronger than tick)", () => {
    expect(CHART_BAR_VALUE_LABEL_CSS).toBe(CHART_AXIS_CSS.label);
    expect(CHART_BAR_VALUE_LABEL_CSS).not.toBe(CHART_AXIS_CSS.tick);
  });

  it("uses high-contrast fill for in-bar H-Bar labels", () => {
    expect(CHART_BAR_INLAY_LABEL_CSS).toBe("#f8fafc");
  });
});
