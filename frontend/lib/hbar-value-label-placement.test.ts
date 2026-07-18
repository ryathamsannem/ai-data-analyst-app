import { describe, expect, it } from "vitest";
import {
  resolveHBarLabelPlacementFromLayout,
  estimateHBarLabelTextWidthPx,
  computeHBarOutsideLabelReservePx,
  computeHBarSignedOutsideLabelReservesPx,
  resolveHBarLabelPlacementMode,
  resolveOverviewInlineHBarPlacementMode,
} from "@/lib/hbar-value-label-placement";

describe("resolveHBarLabelPlacementMode", () => {
  it("maps compact session charts to conservative overview-live placement", () => {
    expect(resolveHBarLabelPlacementMode({})).toBe("overview-live");
  });

  it("maps detail surfaces to detail-live placement", () => {
    expect(resolveHBarLabelPlacementMode({ detailLayout: true })).toBe(
      "detail-live"
    );
  });

  it("maps png capture to export placement", () => {
    expect(
      resolveHBarLabelPlacementMode({ pngCapture: true, detailLayout: true })
    ).toBe("export");
  });
});

describe("resolveOverviewInlineHBarPlacementMode", () => {
  it("uses detail-live for Overview auto-dashboard live H-Bar", () => {
    expect(resolveOverviewInlineHBarPlacementMode(false)).toBe("detail-live");
  });

  it("uses export for Overview PNG capture", () => {
    expect(resolveOverviewInlineHBarPlacementMode(true)).toBe("export");
  });
});

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

  it("overview-live: hides tiny bar when plot end equals bar end (no reserve)", () => {
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: 18,
        barStartPx: 110,
        plotValueEndPx: 128,
        labelText: "127.4K",
        fontSizePx: fontSize,
        mode: "overview-live",
      })
    ).toBe("hidden");
  });

  it("detail-live: allows outsideRight for same tiny bar when reserve exists", () => {
    const text = "127.4K";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: 18,
        barStartPx: 110,
        plotValueEndPx: 128,
        labelText: text,
        fontSizePx: fontSize,
        mode: "detail-live",
        outsideLabelReservePx: labelW + 8,
      })
    ).toBe("outsideRight");
  });

  it("export mode: allows outsideRight for same tiny bar when export reserve exists", () => {
    const text = "127.4K";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: 18,
        barStartPx: 110,
        plotValueEndPx: 128,
        labelText: text,
        fontSizePx: fontSize,
        mode: "export",
        outsideLabelReservePx: labelW + 8,
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

  it("uses insideLeft for wide negative bars", () => {
    const text = "-12.4K";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: labelW + 20,
        barStartPx: 120,
        plotValueEndPx: 400,
        plotValueStartPx: 40,
        barValue: -12400,
        labelText: text,
        fontSizePx: fontSize,
      })
    ).toBe("insideLeft");
  });

  it("uses outsideLeft for short negative bars when left reserve exists", () => {
    const text = "-127.4K";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: 18,
        barStartPx: 210,
        plotValueEndPx: 228,
        plotValueStartPx: 120,
        barValue: -127400,
        labelText: text,
        fontSizePx: fontSize,
        mode: "detail-live",
        outsideLabelReserveLeftPx: labelW + 8,
      })
    ).toBe("outsideLeft");
  });

  it("normalizes negative Recharts width for negative bars", () => {
    const text = "-5.0K";
    const labelW = estimateHBarLabelTextWidthPx(text, fontSize);
    expect(
      resolveHBarLabelPlacementFromLayout({
        barWidthPx: -(labelW + 12),
        barStartPx: 220,
        plotValueEndPx: 220,
        plotValueStartPx: 80,
        barValue: -5000,
        labelText: text,
        fontSizePx: fontSize,
      })
    ).toBe("insideLeft");
  });
});

describe("computeHBarSignedOutsideLabelReservesPx", () => {
  it("reserves left margin for negative values and right for positive", () => {
    const reserves = computeHBarSignedOutsideLabelReservesPx(
      [-100_000, 50_000],
      (v) => `${Math.abs(v / 1000).toFixed(0)}K`,
      13
    );
    expect(reserves.left).toBeGreaterThan(0);
    expect(reserves.right).toBeGreaterThan(0);
  });

  it("reserves only left margin for all-negative charts", () => {
    const reserves = computeHBarSignedOutsideLabelReservesPx(
      [-100_000, -20_000],
      (v) => `${Math.abs(v / 1000).toFixed(0)}K`,
      13
    );
    expect(reserves.left).toBeGreaterThan(0);
    expect(reserves.right).toBe(0);
  });
});

describe("computeHBarOutsideLabelReservePx", () => {
  it("reserves width for the widest compact formatted value", () => {
    const reserve = computeHBarOutsideLabelReservePx(
      [1_870_000, 127_400],
      (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(1)}K`),
      13
    );
    expect(reserve).toBeGreaterThanOrEqual(50);
  });
});
