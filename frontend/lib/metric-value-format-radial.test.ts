import { describe, expect, it } from "vitest";
import {
  appendMetricUnitSuffix,
  inferMetricUnitSuffix,
  metricLabelImpliesPercent,
  resolveMetricValueFormat,
} from "@/lib/metric-value-format";

describe("metricLabelImpliesPercent", () => {
  it("does not treat composition Share titles as rate metrics", () => {
    expect(
      metricLabelImpliesPercent("Severity Downtime Minutes Share")
    ).toBe(false);
    expect(metricLabelImpliesPercent("Product Category Sales Amount Share")).toBe(
      false
    );
  });

  it("still detects explicit rate metrics", () => {
    expect(metricLabelImpliesPercent("Defect Rate")).toBe(true);
    expect(metricLabelImpliesPercent("Utilization Percent")).toBe(true);
  });
});

describe("inferMetricUnitSuffix", () => {
  it("infers minutes from downtime labels", () => {
    expect(
      inferMetricUnitSuffix("Severity Downtime Minutes Share", null)
    ).toBe(" min");
  });
});

describe("resolveMetricValueFormat for composition donuts", () => {
  it("uses number format for downtime minutes share slices", () => {
    expect(
      resolveMetricValueFormat({
        metricLabel: "Severity Downtime Minutes Share",
        chartTitle: "Severity Downtime Minutes Share",
        presentationKind: "donut",
        chartRows: [
          { name: "A", value: 2367 },
          { name: "B", value: 3224 },
        ],
      })
    ).toBe("number");
  });
});

describe("appendMetricUnitSuffix", () => {
  it("appends minute suffix without duplicating", () => {
    expect(
      appendMetricUnitSuffix("2,367", "Downtime Minutes", null)
    ).toBe("2,367 min");
    expect(appendMetricUnitSuffix("2,367 min", "Downtime Minutes", null)).toBe(
      "2,367 min"
    );
  });
});
