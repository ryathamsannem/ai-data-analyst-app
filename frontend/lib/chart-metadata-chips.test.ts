import { describe, expect, it } from "vitest";
import {
  buildChartMetadataChipSpecs,
  chipSpecsToExportChips,
  presentationKindUiLabel,
} from "@/lib/chart-metadata-chips";

describe("buildChartMetadataChipSpecs", () => {
  it("builds View · Measure · Category · badge for cartesian charts", () => {
    const specs = buildChartMetadataChipSpecs({
      renderedKind: "bar_horizontal",
      metricLabel: "Revenue",
      semanticHeader: {
        mode: "mono",
        roleLabel: "Category",
        detailLabel: "Department",
      },
      badgeCompact: "H-Bar · 120 rows · 6 groups",
    });
    expect(specs.map((s) => s.id)).toEqual([
      "view",
      "measure",
      "axis",
      "badge",
    ]);
    expect(specs[0]?.value).toBe("Horizontal");
    expect(specs[1]?.value).toBe("Revenue");
  });

  it("builds X · Y chips for scatter", () => {
    const specs = buildChartMetadataChipSpecs({
      renderedKind: "scatter",
      metricLabel: "Profit",
      semanticHeader: {
        mode: "scatter",
        xLabel: "Revenue",
        yLabel: "Profit",
      },
      badgeCompact: "Scatter · 80 rows · 80 groups",
    });
    expect(specs.map((s) => s.id)).toEqual([
      "view",
      "measure",
      "x",
      "y",
      "badge",
    ]);
    expect(presentationKindUiLabel("scatter")).toBe("Scatter");
  });
});

describe("chipSpecsToExportChips", () => {
  it("maps labeled and mono chips for PNG composite", () => {
    const exportChips = chipSpecsToExportChips(
      buildChartMetadataChipSpecs({
        renderedKind: "line",
        metricLabel: "Orders",
        semanticHeader: {
          mode: "mono",
          roleLabel: "Time",
          detailLabel: "Order date (Weekly)",
        },
        badgeCompact: "Line · 52 groups",
        leadInsight: "Peak: Week 12",
      })
    );
    expect(exportChips[0]).toEqual({ label: "View", value: "Line" });
    expect(exportChips.at(-2)).toEqual({
      label: "",
      value: "Line · 52 groups",
      mono: true,
    });
    expect(exportChips.at(-1)).toEqual({
      label: "",
      value: "Peak: Week 12",
      mono: true,
    });
  });
});
