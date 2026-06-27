import { describe, expect, it } from "vitest";
import {
  OVERVIEW_MINI_RADIAL_SIZE_SCALE,
  scaleOverviewMiniRadialRadii,
  tightenOverviewMiniRadialMargins,
} from "@/lib/overview-mini-radial-polish";

describe("overview mini radial polish", () => {
  it("scales radii ~24% without changing cy before polish applies session cy", () => {
    const scaled = scaleOverviewMiniRadialRadii({
      innerRadius: 52,
      outerRadius: 84,
      cy: "50%",
    });
    expect(scaled.cy).toBe("50%");
    expect(scaled.innerRadius).toBe(Math.round(52 * OVERVIEW_MINI_RADIAL_SIZE_SCALE));
    expect(scaled.outerRadius).toBe(Math.round(84 * OVERVIEW_MINI_RADIAL_SIZE_SCALE));
  });

  it("tightens top and bottom margins for legend proximity", () => {
    const tightened = tightenOverviewMiniRadialMargins({
      top: 7,
      left: 10,
      right: 12,
      bottom: 24,
    });
    expect(tightened.bottom).toBe(14);
    expect(tightened.top).toBe(5);
  });
});
