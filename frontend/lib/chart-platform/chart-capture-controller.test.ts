import { describe, expect, it } from "vitest";
import {
  pdfChartScatterUsesContentTightComposite,
  pdfChartUsesContentTightComposite,
} from "@/lib/chart-platform/chart-capture-controller";

describe("pdfChartUsesContentTightComposite", () => {
  it("enables content-tight composite for pdfChart scatter, vertical bar, and histogram", () => {
    expect(pdfChartUsesContentTightComposite("pdfChart", "scatter")).toBe(true);
    expect(pdfChartUsesContentTightComposite("pdfChart", "bar")).toBe(true);
    expect(pdfChartUsesContentTightComposite("pdfChart", "histogram")).toBe(
      true
    );
    expect(pdfChartUsesContentTightComposite("pdfChart", "line")).toBe(false);
    expect(pdfChartUsesContentTightComposite("pdfChart", "area")).toBe(false);
    expect(pdfChartUsesContentTightComposite("pdfChart", "bar_horizontal")).toBe(
      false
    );
    expect(pdfChartUsesContentTightComposite("pdfChart", "donut")).toBe(false);
    expect(pdfChartUsesContentTightComposite("chartsPng", "bar")).toBe(false);
    expect(pdfChartUsesContentTightComposite("overviewPng", "bar")).toBe(false);
  });

  it("keeps scatter alias aligned with combined helper", () => {
    expect(pdfChartScatterUsesContentTightComposite("pdfChart", "scatter")).toBe(
      pdfChartUsesContentTightComposite("pdfChart", "scatter")
    );
  });
});
