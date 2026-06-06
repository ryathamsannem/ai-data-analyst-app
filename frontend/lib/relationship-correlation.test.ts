import { describe, expect, it } from "vitest";
import {
  buildRelationshipCorrelationSnapshot,
  parseNumericCoefficient,
} from "@/lib/relationship-correlation";
import {
  parseRelationshipInsights,
  pearsonCorrelationFromRows,
} from "@/lib/relationship-visualization";

/** Geographic fixture — customers vs revenue (8 cities). */
const CUSTOMERS_REVENUE_ROWS = [
  { x: 310, value: 182000 },
  { x: 350, value: 210000 },
  { x: 410, value: 260000 },
  { x: 205, value: 132000 },
  { x: 390, value: 248000 },
  { x: 140, value: 90000 },
  { x: 190, value: 116000 },
  { x: 250, value: 156000 },
];

const PROFIT_REVENUE_ROWS = [
  { x: 24500, value: 182000 },
  { x: 30200, value: 210000 },
  { x: 40100, value: 260000 },
  { x: 19800, value: 132000 },
  { x: 32200, value: 248000 },
  { x: 10500, value: 90000 },
  { x: 16800, value: 116000 },
  { x: 21400, value: 156000 },
];

const GROWTH_REVENUE_ROWS = [
  { x: 0.23, value: 182000 },
  { x: 0.26, value: 210000 },
  { x: 0.28, value: 260000 },
  { x: 0.21, value: 132000 },
  { x: 0.24, value: 248000 },
  { x: 0.16, value: 90000 },
  { x: 0.18, value: 116000 },
  { x: 0.2, value: 156000 },
];

describe("parseNumericCoefficient", () => {
  it("does not coerce null to zero", () => {
    expect(parseNumericCoefficient(null)).toBeNull();
    expect(parseNumericCoefficient(undefined)).toBeNull();
  });
});

describe("parseRelationshipInsights", () => {
  it("does not treat null pearson as 0.00", () => {
    const ri = parseRelationshipInsights({
      pearson: null,
      qualitativeOnly: true,
      sampleSize: 8,
    });
    expect(ri?.pearson).toBeNull();
    expect(ri?.qualitativeOnly).toBe(true);
  });
});

describe("buildRelationshipCorrelationSnapshot", () => {
  it("customers vs revenue ~ +1.00 from chart rows", () => {
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: CUSTOMERS_REVENUE_ROWS,
      apiPearson: null,
    });
    expect(snap.rowCount).toBe(8);
    expect(snap.pearsonRounded).toBe(1);
    expect(snap.display).toBe("+1.00");
    expect(snap.badgeLabel).toBe("Correlation +1.00");
    expect(snap.source).toBe("chart_rows");
  });

  it("profit vs revenue ~ +0.98 from chart rows", () => {
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: PROFIT_REVENUE_ROWS,
      apiPearson: null,
    });
    expect(snap.pearsonRounded).toBe(0.98);
    expect(snap.display).toBe("+0.98");
    expect(snap.badgeLabel).not.toMatch(/0\.00/);
  });

  it("growth rate vs revenue positive from chart rows", () => {
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: GROWTH_REVENUE_ROWS,
      apiPearson: null,
    });
    expect(snap.pearsonRounded).not.toBeNull();
    expect((snap.pearsonRounded ?? 0) > 0.5).toBe(true);
    expect(snap.display).not.toBe("0.00");
  });

  it("prefers chart rows over API pearson 0 when null was coerced", () => {
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: CUSTOMERS_REVENUE_ROWS,
      apiPearson: 0,
    });
    expect(snap.pearsonRounded).toBe(1);
    expect(snap.source).toBe("chart_rows");
  });

  it("returns unable label when fewer than two valid pairs", () => {
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: [{ x: 1, value: 100 }],
      apiPearson: null,
    });
    expect(snap.computed).toBe(false);
    expect(snap.display).toBe("Unable to compute correlation");
    expect(snap.badgeLabel).toBeNull();
  });
});

describe("regression — null API must not block row computation", () => {
  it("row pearson matches snapshot when API pearson is null", () => {
    const fromRows = pearsonCorrelationFromRows(CUSTOMERS_REVENUE_ROWS);
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: CUSTOMERS_REVENUE_ROWS,
      apiPearson: null,
    });
    expect(fromRows).not.toBeNull();
    expect(snap.pearson).toBeCloseTo(fromRows!, 4);
  });
});
