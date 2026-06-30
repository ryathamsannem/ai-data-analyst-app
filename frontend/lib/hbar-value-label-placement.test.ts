import { describe, expect, it } from "vitest";
import {
  resolveHBarLabelPlacementFromLayout,
  estimateHBarLabelTextWidthPx,
} from "@/lib/hbar-value-label-placement";

describe("resolveHBarLabelPlacementFromLayout", () => {
  const fontSize = 13;

  it("uses insideRight when the bar is wide enough for the label", () => {
    const text = "1.87M";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: labelW + 20,
        barStartPx: 120,
        plotValueEndPx: 400,
        labelText: text,
        fontSizePx: fontSize,
      })
    ).toBe("insideRight");
  });

  it("uses outsideRight for Revenue by Product short bars when right space exists", () => {
    const text = "127.4K";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: 18,
        barStartPx: 110,
        plotValueEndPx: 400,
        labelText: text,
        fontSizePx: fontSize,
      })
    ).toBe("outsideRight");
  });

  it("hides labels when neither inside nor outside space is safe", () => {
    const text = "127.4K";
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: 12,
        barStartPx: 350,
        plotValueEndPx: 380,
        labelText: text,
        fontSizePx: fontSize,
      })
    ).toBe("hidden");
  });
});
