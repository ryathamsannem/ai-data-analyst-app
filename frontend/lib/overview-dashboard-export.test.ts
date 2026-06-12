import { describe, expect, it } from "vitest";
import { resolveOverviewEffectivePresentationKind } from "./overview-dashboard-export";

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
