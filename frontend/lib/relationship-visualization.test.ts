import { describe, expect, it } from "vitest";
import {
  buildRelationshipCorrelationSnapshot,
} from "@/lib/relationship-correlation";
import {
  buildRelationshipExecutiveCards,
  formatPearsonCoefficient,
  parseRelationshipInsights,
  pearsonCorrelationFromRows,
} from "@/lib/relationship-visualization";
import { calculateInsightConfidence } from "@/lib/insight-confidence";

describe("buildRelationshipExecutiveCards", () => {
  it("shows correlation cards without profit margin for growth vs revenue", () => {
    const ri = parseRelationshipInsights({
      pearson: 0.61,
      spearman: 0.58,
      correlationStrength: "Moderate",
      correlationLabel: "Moderate Positive",
      direction: "positive",
      qualitativeOnly: false,
      sampleSize: 8,
      strongestOutliers: [{ x: 0.28, y: 260000 }],
      marginByCategory: {
        highest: { label: "South", marginPct: 12 },
        lowest: { label: "East", marginPct: 4 },
      },
    });
    expect(ri).not.toBeNull();
    const cards = buildRelationshipExecutiveCards(
      ri!,
      "Growth rate",
      "Revenue",
      8,
      [
        { x: 0.16, value: 90000 },
        { x: 0.28, value: 260000 },
      ]
    );
    const titles = cards.map((c) => c.title);
    expect(titles.some((t) => /correlation strength/i.test(t))).toBe(true);
    expect(titles.some((t) => /sample size/i.test(t))).toBe(true);
    expect(titles.some((t) => /outlier/i.test(t))).toBe(true);
    expect(titles.some((t) => /highest revenue/i.test(t))).toBe(true);
    expect(titles.some((t) => /highest growth rate/i.test(t))).toBe(true);
    expect(titles.some((t) => /profit margin/i.test(t))).toBe(false);
  });

  it("parseRelationshipInsights leaves pearson null when API sends null", () => {
    const ri = parseRelationshipInsights({ pearson: null, sampleSize: 8 });
    expect(ri?.pearson).toBeNull();
  });

  it("forces qualitativeOnly false when pearson is present", () => {
    const ri = parseRelationshipInsights({
      pearson: 0.42,
      qualitativeOnly: true,
    });
    expect(ri?.qualitativeOnly).toBe(false);
  });

  it("geographic profit vs revenue executive card matches API pearson +0.98", () => {
    const rows = [
      { x: 24500, value: 182000 },
      { x: 30200, value: 210000 },
      { x: 40100, value: 260000 },
      { x: 19800, value: 132000 },
      { x: 32200, value: 248000 },
      { x: 10500, value: 90000 },
      { x: 16800, value: 116000 },
      { x: 21400, value: 156000 },
    ];
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: rows,
      apiPearson: 0.98,
    });
    const ri = parseRelationshipInsights({
      pearson: snap.pearsonRounded,
      qualitativeOnly: false,
      sampleSize: 8,
    });
    const cards = buildRelationshipExecutiveCards(
      ri!,
      "Profit",
      "Total Revenue",
      8,
      rows
    );
    const corr = cards.find((c) => c.key === "rel-pearson");
    expect(corr?.value).toBe("+0.98");
    expect(corr?.value).not.toBe("0.00");
  });

  it("customer vs revenue uses pearson +1.00 when API provides it", () => {
    const rows = [
      { x: 140, value: 90000 },
      { x: 410, value: 260000 },
    ];
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: rows,
      apiPearson: 1.0,
    });
    const ri = parseRelationshipInsights({
      pearson: snap.pearsonRounded,
      qualitativeOnly: false,
      sampleSize: 8,
    });
    const cards = buildRelationshipExecutiveCards(
      ri!,
      "Customers",
      "Revenue",
      8,
      rows
    );
    expect(cards.find((c) => c.key === "rel-pearson")?.value).toBe("+1.00");
  });

  it("fills pearson from scatter rows when API omits coefficient", () => {
    const rows = [
      { x: 0.16, value: 90000 },
      { x: 0.28, value: 260000 },
      { x: 0.23, value: 182000 },
      { x: 0.26, value: 210000 },
    ];
    const fromRows = pearsonCorrelationFromRows(rows);
    expect(fromRows).not.toBeNull();
    const snap = buildRelationshipCorrelationSnapshot({
      chartRows: rows,
      apiPearson: null,
    });
    const ri = parseRelationshipInsights({
      pearson: snap.pearsonRounded,
      qualitativeOnly: !snap.computed,
      sampleSize: 8,
    });
    expect(ri?.pearson).not.toBe(0);
    expect(ri?.qualitativeOnly).toBe(false);
    if (fromRows != null) {
      expect(formatPearsonCoefficient(ri!.pearson!)).toBe(
        formatPearsonCoefficient(fromRows)
      );
    }
  });

  it("confidence uses small-sample line when pearson exists on 8 rows", () => {
    const conf = calculateInsightConfidence({
      relationshipScatter: true,
      relationshipSampleSize: 8,
      relationshipPearson: 0.98,
      correlationQualitativeOnly: false,
      insightConfidenceScore: 49,
      insightConfidenceLevel: "low",
      insightConfidenceReasons: [
        "Correlation could not be computed numerically",
        "8 filtered row(s)",
      ],
      analysisRowCount: 8,
      chartSeriesPointCount: 8,
    });
    expect(conf.rationale).toMatch(/Correlation computed on 8 paired rows/i);
    expect(conf.reasons.join(" ")).not.toMatch(/could not be computed numerically/i);
  });
});
