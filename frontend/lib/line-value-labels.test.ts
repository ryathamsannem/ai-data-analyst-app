import { describe, expect, it } from "vitest";
import {
  buildLineValueLabelIndexSet,
  canSafelyLabelAllAreaPoints,
  canSafelyLabelAllLinePoints,
  formatAreaValueLabel,
  formatLineValueLabel,
  resolveAreaPointLabelPlacement,
  resolveLinePointLabelPlacement,
  resolveLinePointLabelY,
  selectAreaValueLabelIndices,
  selectLineKeyPointIndices,
  selectLineValueLabelIndices,
  shouldShowAreaPointLabels,
  shouldShowLinePointLabels,
} from "@/lib/line-value-labels";

function rows(values: number[]) {
  return values.map((value) => ({ value }));
}

const spendCtx = {
  metricLabel: "Spend Amount",
  chartTitle: "Monthly Spend Amount Trend",
  presentationKind: "line" as const,
};

const areaCtx = {
  metricLabel: "Revenue",
  chartTitle: "Monthly Revenue Trend",
  presentationKind: "area" as const,
};

describe("selectAreaValueLabelIndices", () => {
  const loanBalanceCtx = {
    metricLabel: "Loan Balance",
    chartTitle: "Monthly Loan Balance Trend",
    presentationKind: "area" as const,
  };

  it("returns all finite points for sparse area charts (2–6 points) when safe", () => {
    const sparse = rows([1_020_000, 1_030_000, 1_040_000, 1_050_000, 1_060_000, 1_070_000]);
    expect(
      selectAreaValueLabelIndices(sparse, {
        plotWidthPx: 360,
        formatLabel: (v) => formatAreaValueLabel(v, areaCtx),
      })
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("returns all labels for 7–8 point area charts when spacing is clean", () => {
    const weekly = rows(
      Array.from({ length: 8 }, (_, i) => 2_500_000 + i * 120_000)
    );
    expect(
      selectAreaValueLabelIndices(weekly, {
        plotWidthPx: 860,
        surface: "export",
        formatLabel: (v) => formatAreaValueLabel(v, areaCtx),
      }).length
    ).toBe(8);
  });

  it("returns key labels only for 9–12 point area charts", () => {
    const monthly = rows(
      Array.from({ length: 10 }, (_, i) => 2_500_000 + i * 160_000)
    );
    expect(
      selectAreaValueLabelIndices(monthly, {
        plotWidthPx: 860,
        surface: "export",
        formatLabel: (v) => formatAreaValueLabel(v, areaCtx),
      })
    ).toEqual(selectLineKeyPointIndices(monthly));
    expect(
      selectAreaValueLabelIndices(monthly, {
        plotWidthPx: 860,
        surface: "export",
        formatLabel: (v) => formatAreaValueLabel(v, areaCtx),
      }).length
    ).toBeLessThan(monthly.length);
  });

  it("returns key labels only for Monthly Loan Balance-like 12-point area charts", () => {
    const loanBalance = rows(
      Array.from({ length: 12 }, (_, i) => 8_500_000 - i * 220_000)
    );
    const labeled = selectAreaValueLabelIndices(loanBalance, {
      plotWidthPx: 860,
      surface: "export",
      formatLabel: (v) => formatAreaValueLabel(v, loanBalanceCtx),
    });
    expect(labeled).toEqual(selectLineKeyPointIndices(loanBalance));
    expect(labeled.length).toBeLessThanOrEqual(4);
    expect(labeled.length).toBeLessThan(loanBalance.length);
  });

  it("falls back to key labels for crowded 7–8 point area charts", () => {
    const crowded = rows(Array.from({ length: 8 }, () => 12_345_678));
    expect(
      selectAreaValueLabelIndices(crowded, {
        plotWidthPx: 180,
        formatLabel: (v) => formatAreaValueLabel(v, areaCtx),
      })
    ).toEqual(selectLineKeyPointIndices(crowded));
  });

  it("returns key labels only for dense area charts (13+ points)", () => {
    const dense = rows(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(selectAreaValueLabelIndices(dense)).toEqual([0, 14]);
    expect(selectAreaValueLabelIndices(dense).length).toBeLessThan(dense.length);
  });

  it("does not label every point above 24 points on live area charts", () => {
    const veryDense = rows(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(selectAreaValueLabelIndices(veryDense, { surface: "live" })).toEqual([]);
    expect(selectAreaValueLabelIndices(veryDense, { surface: "export" })).toEqual([
      0, 29,
    ]);
  });
});

describe("canSafelyLabelAllAreaPoints", () => {
  it("never labels more permissively than line spacing checks", () => {
    const monthly = rows(
      Array.from({ length: 12 }, (_, i) => 4_400_000 - i * 150_000)
    );
    for (const plotWidthPx of [280, 320, 360, 400, 860]) {
      const options = {
        plotWidthPx,
        formatLabel: (v: number) => formatAreaValueLabel(v, areaCtx),
      };
      const lineOk = canSafelyLabelAllLinePoints(monthly, options);
      const areaOk = canSafelyLabelAllAreaPoints(monthly, options);
      if (!lineOk) expect(areaOk).toBe(false);
      if (areaOk) expect(lineOk).toBe(true);
    }
  });

  it("allows all labels on wide export plots", () => {
    const monthly = rows(
      Array.from({ length: 12 }, (_, i) => 4_400_000 - i * 150_000)
    );
    const options = {
      plotWidthPx: 860,
      surface: "export" as const,
      formatLabel: (v: number) => formatAreaValueLabel(v, areaCtx),
    };
    expect(canSafelyLabelAllAreaPoints(monthly, options)).toBe(true);
  });
});

describe("resolveAreaPointLabelPlacement", () => {
  const viewBox = { y: 20, height: 200 };

  it("keeps middle-band area labels above the stroke edge", () => {
    expect(
      resolveAreaPointLabelPlacement({
        index: 2,
        y: 120,
        value: 90,
        values: [80, 85, 90, 88],
        viewBox,
      })
    ).toBe("above");
  });

  it("still flips to below near the plot top edge", () => {
    expect(
      resolveAreaPointLabelPlacement({
        index: 1,
        y: 30,
        value: 100,
        values: [90, 100, 80],
        viewBox,
      })
    ).toBe("below");
  });
});

describe("formatAreaValueLabel", () => {
  it("formats compact large numbers like line labels", () => {
    expect(formatAreaValueLabel(4_400_000, areaCtx)).toBe("4.4M");
    expect(formatAreaValueLabel(18_200, areaCtx)).toBe("18.2K");
  });

  it("formats percent/rate values as percentages", () => {
    const rateCtx = {
      metricLabel: "Conversion Rate",
      chartTitle: "Conversion Rate Trend",
      presentationKind: "area" as const,
    };
    expect(formatAreaValueLabel(3.2, rateCtx)).toBe("3.2%");
  });
});

describe("selectLineValueLabelIndices", () => {
  it("returns all finite points for sparse charts (2–6 points)", () => {
    const sparse = rows([1_020_000, 1_030_000, 1_040_000, 1_050_000]);
    expect(selectLineValueLabelIndices(sparse)).toEqual([0, 1, 2, 3]);
  });

  it("returns all finite points for 7–12 point charts when spacing is safe", () => {
    const weeklyRecords = rows([145, 142, 140, 141, 140, 143, 144]);
    expect(selectLineValueLabelIndices(weeklyRecords, { plotWidthPx: 360 })).toEqual(
      [0, 1, 2, 3, 4, 5, 6]
    );

    const enrollment = rows(
      Array.from({ length: 10 }, (_, i) => 12_300 + i * 780)
    );
    expect(
      selectLineValueLabelIndices(enrollment, {
        plotWidthPx: 360,
        formatLabel: (v) => formatLineValueLabel(v, spendCtx),
      }).length
    ).toBe(10);

    const monthlySpend = rows(
      Array.from({ length: 12 }, (_, i) => 2_500_000 + i * 160_000)
    );
    expect(
      selectLineValueLabelIndices(monthlySpend, {
        plotWidthPx: 860,
        surface: "export",
        formatLabel: (v) => formatLineValueLabel(v, spendCtx),
      }).length
    ).toBe(12);
  });

  it("keeps all labels for line 9–12 point charts while area uses key labels only", () => {
    const monthly = rows(
      Array.from({ length: 10 }, (_, i) => 12_300 + i * 780)
    );
    const options = {
      plotWidthPx: 860,
      surface: "export" as const,
      formatLabel: (v: number) => formatLineValueLabel(v, spendCtx),
    };
    expect(selectLineValueLabelIndices(monthly, options).length).toBe(10);
    expect(selectAreaValueLabelIndices(monthly, options).length).toBeLessThan(10);
    expect(selectAreaValueLabelIndices(monthly, options)).toEqual(
      selectLineKeyPointIndices(monthly)
    );
  });

  it("falls back to key labels for 7–12 point charts when labels would collide", () => {
    const crowded = rows(Array.from({ length: 10 }, () => 12_345_678));
    const labels = selectLineValueLabelIndices(crowded, {
      plotWidthPx: 180,
      formatLabel: (v) => formatLineValueLabel(v, spendCtx),
    });
    expect(labels.length).toBeLessThan(10);
    expect(labels).toEqual(selectLineKeyPointIndices(crowded));
  });

  it("returns key labels only for 13–24 point charts", () => {
    const dense = rows(Array.from({ length: 18 }, (_, i) => i + 1));
    const labeled = selectLineValueLabelIndices(dense, { surface: "live" });
    expect(labeled.length).toBeLessThan(dense.length);
    expect(labeled).toEqual(selectLineKeyPointIndices(dense));
  });

  it("dedupes when the same point is both highest and latest", () => {
    const medium = rows([10, 20, 5, 30, 15, 25, 40]);
    expect(selectLineValueLabelIndices(medium, { plotWidthPx: 360 })).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(selectLineKeyPointIndices(medium)).toEqual([0, 2, 6]);
  });

  it("does not label every point above 24 points on live charts", () => {
    const dense = rows(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(selectLineValueLabelIndices(dense, { surface: "live" })).toEqual([]);
    expect(selectLineValueLabelIndices(dense, { surface: "export" })).toEqual([
      0, 29,
    ]);
  });

  it("hides labels when export chart is extremely dense", () => {
    const veryDense = rows(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(selectLineValueLabelIndices(veryDense, { surface: "export" })).toEqual(
      []
    );
  });
});

describe("canSafelyLabelAllLinePoints", () => {
  it("allows all labels on wide export plots", () => {
    const monthly = rows(Array.from({ length: 12 }, (_, i) => 4_400_000 - i * 150_000));
    expect(
      canSafelyLabelAllLinePoints(monthly, {
        plotWidthPx: 860,
        surface: "export",
        formatLabel: (v) => formatLineValueLabel(v, spendCtx),
      })
    ).toBe(true);
  });

  it("rejects all labels when horizontal slots are too narrow", () => {
    const monthly = rows(Array.from({ length: 12 }, (_, i) => 4_400_000 - i * 150_000));
    expect(
      canSafelyLabelAllLinePoints(monthly, {
        plotWidthPx: 120,
        formatLabel: (v) => formatLineValueLabel(v, spendCtx),
      })
    ).toBe(false);
  });
});

describe("resolveLinePointLabelPlacement", () => {
  const viewBox = { y: 20, height: 200 };

  it("places labels below points near the plot top", () => {
    expect(
      resolveLinePointLabelPlacement({
        index: 1,
        y: 30,
        value: 100,
        values: [90, 100, 80],
        viewBox,
      })
    ).toBe("below");
  });

  it("places labels above points near the plot bottom", () => {
    expect(
      resolveLinePointLabelPlacement({
        index: 1,
        y: 210,
        value: 10,
        values: [40, 10, 35],
        viewBox,
      })
    ).toBe("above");
  });

  it("uses peak/trough slope in the middle band", () => {
    expect(
      resolveLinePointLabelPlacement({
        index: 2,
        y: 120,
        value: 100,
        values: [80, 90, 100, 85, 88],
        viewBox,
      })
    ).toBe("below");

    expect(
      resolveLinePointLabelPlacement({
        index: 3,
        y: 140,
        value: 85,
        values: [80, 90, 100, 85, 88],
        viewBox,
      })
    ).toBe("above");
  });

  it("alternates middle points when slope is ambiguous", () => {
    expect(
      resolveLinePointLabelPlacement({
        index: 2,
        y: 120,
        value: 90,
        values: [88, 89, 90, 91],
        viewBox,
      })
    ).toBe("above");
    expect(
      resolveLinePointLabelPlacement({
        index: 3,
        y: 130,
        value: 91,
        values: [88, 89, 90, 91],
        viewBox,
      })
    ).toBe("below");
  });
});

describe("resolveLinePointLabelY", () => {
  it("offsets above and below without rotation", () => {
    expect(resolveLinePointLabelY(100, "above", 8)).toBe(92);
    expect(resolveLinePointLabelY(100, "below", 8)).toBe(108);
  });
});

describe("shouldShowLinePointLabels", () => {
  it("is false for fewer than two finite points", () => {
    expect(shouldShowLinePointLabels(rows([1_020_000]))).toBe(false);
    expect(shouldShowLinePointLabels(rows([NaN, NaN]))).toBe(false);
  });

  it("is true for safe sparse charts", () => {
    expect(shouldShowLinePointLabels(rows([1, 2, 3, 4]))).toBe(true);
  });
});

describe("buildLineValueLabelIndexSet", () => {
  it("returns a set of selected indices", () => {
    const set = buildLineValueLabelIndexSet(rows([1, 2, 3, 4]));
    expect(set).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe("formatLineValueLabel", () => {
  const unitsCtx = {
    metricLabel: "Units Produced",
    chartTitle: "Weekly Units Produced Trend",
    presentationKind: "line" as const,
  };

  it("formats compact large numbers like line axis ticks", () => {
    expect(formatLineValueLabel(1_020_000, unitsCtx)).toBe("1.02M");
    expect(formatLineValueLabel(1_050_000, unitsCtx)).toBe("1.05M");
  });

  it("formats currency values with $ when metric implies currency", () => {
    const revenueCtx = {
      metricLabel: "Revenue",
      chartTitle: "Monthly Revenue Trend",
      presentationKind: "line" as const,
    };
    expect(formatLineValueLabel(1_250_000, revenueCtx)).toBe("1.25M");
    expect(formatLineValueLabel(850, revenueCtx)).toContain("850");
  });

  it("formats percent/rate values as percentages", () => {
    const rateCtx = {
      metricLabel: "Defect Rate",
      chartTitle: "Defect Rate Trend",
      presentationKind: "line" as const,
    };
    expect(formatLineValueLabel(2.4, rateCtx)).toBe("2.4%");
  });

  it("coerces fraction-scale percent rows for line point labels", () => {
    const rows = [{ name: "Jan", value: 0.0054 }];
    const rateCtx = {
      metricLabel: "Defect Rate",
      chartTitle: "Defect Rate Trend",
      presentationKind: "line" as const,
      chartRows: rows,
    };
    expect(formatLineValueLabel(0.0054, rateCtx)).toBe("0.54%");
  });
});
