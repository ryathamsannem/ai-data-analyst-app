import { describe, expect, it } from "vitest";
import { pdfChartScatterUsesContentTightComposite } from "@/lib/chart-platform/chart-capture-controller";

describe("pdfChartScatterUsesContentTightComposite", () => {
  it("enables content-tight composite only for pdfChart scatter", () => {
    expect(pdfChartScatterUsesContentTightComposite("pdfChart", "scatter")).toBe(
      true
    );
    expect(pdfChartScatterUsesContentTightComposite("pdfChart", "line")).toBe(
      false
    );
    expect(pdfChartScatterUsesContentTightComposite("pdfChart", "area")).toBe(
      false
    );
    expect(
      pdfChartScatterUsesContentTightComposite("pdfChart", "bar_horizontal")
    ).toBe(false);
    expect(pdfChartScatterUsesContentTightComposite("pdfChart", "donut")).toBe(
      false
    );
    expect(pdfChartScatterUsesContentTightComposite("chartsPng", "scatter")).toBe(
      false
    );
    expect(
      pdfChartScatterUsesContentTightComposite("overviewPng", "scatter")
    ).toBe(false);
  });
});
