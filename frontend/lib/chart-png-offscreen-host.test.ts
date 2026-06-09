import { describe, expect, it } from "vitest";
import { presentationCaptureRootStyle } from "@/lib/chart-png-export-layout";

describe("chart PNG offscreen host", () => {
  it("keeps export roots off-screen without affecting visible layout", () => {
    const style = presentationCaptureRootStyle({ width: 1200, height: 600 });
    expect(style.position).toBe("fixed");
    expect(style.left).toBe("-12000px");
    expect(style.zIndex).toBe(-1);
    expect(style.pointerEvents).toBe("none");
  });
});
