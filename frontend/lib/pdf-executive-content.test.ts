import { describe, expect, it } from "vitest";
import {
  buildLensExecutiveSections,
  buildPdfChartIntelBlocks,
  buildPdfExecutiveContentPlan,
  extractBusinessEntityFromLensBody,
  inferLeaderLaggerFromFacts,
  looksLikeMetricToken,
  pdfExecutiveHierarchyHeadings,
  pdfTextsAreSimilar,
  polishLensSectionCopy,
  resolvePdfExecutiveLens,
  rewriteObservationAsAction,
  rewriteOpportunityLensNarrative,
} from "@/lib/pdf-executive-content";

describe("pdfTextsAreSimilar", () => {
  it("detects near-duplicate narratives", () => {
    const a = "Mumbai leads revenue at 2.7M across the cohort.";
    const b = "Mumbai leads revenue at 2.7M across this cohort.";
    expect(pdfTextsAreSimilar(a, b)).toBe(true);
  });
});

describe("buildPdfExecutiveContentPlan", () => {
  it("suppresses highlighted signals when they duplicate the main takeaway", () => {
    const takeaway =
      "Mumbai leads revenue at 2.7M, ahead of other cities in this view.";
    const plan = buildPdfExecutiveContentPlan({
      execSummaryLines: [`Main takeaway: ${takeaway}`],
      insightSummary: takeaway,
      chartHighlightsNarrative: takeaway,
      insightSections: {
        summary: takeaway,
        statistical: "City spread is concentrated in the top two markets.",
        recommendations: "Prioritize retention in the leading city cohort.",
      },
    });
    expect(plan.suppressHighlightedSignals).toBe(true);
    expect(plan.highlightedSignals).toHaveLength(0);
    expect(plan.hierarchy.executiveSummary).toBeNull();
    expect(plan.hierarchy.businessInterpretation).toContain("City spread");
    expect(plan.hierarchy.strategicRecommendation).toContain("Prioritize");
  });

  it("carries confidence rationale when available", () => {
    const plan = buildPdfExecutiveContentPlan({
      insightConfidenceLevel: "High",
      insightConfidenceRationale:
        "Metric and dimension align with the question; cohort size is adequate.",
    });
    expect(plan.confidenceRationale).toContain("cohort size");
  });

  it("builds chart intel blocks from shared chart intel slice", () => {
    const plan = buildPdfExecutiveContentPlan({
      chartIntel: {
        recommendedLabel: "Horizontal bar chart",
        whyThisChart: "Grouped comparison across categories.",
        recommendationBlurb: "Readable when labels are long.",
      },
    });
    expect(plan.chartIntelBlocks?.whySelected).toContain("Grouped comparison");
    expect(plan.chartIntelBlocks?.suitability).toContain("Readable");
  });

  it("maps risk lens sections by signal role, not index order", () => {
    const plan = buildPdfExecutiveContentPlan({
      routingPlan: { intent: "executive", executiveLens: "risk" },
      vizExecutiveFacts: [
        {
          title: "Revenue Concentration",
          value: "42%",
          hint: "Mumbai contributes 42% of revenue and dominates performance.",
          kind: "concentration",
        },
        {
          title: "Growth Risk",
          value: "Kolkata",
          hint: "Kolkata has the weakest growth rate among citys.",
          kind: "risk",
        },
        {
          title: "Margin Risk",
          value: "Delhi",
          hint: "Delhi shows the lowest profit-to-revenue ratio in this sample.",
          kind: "risk",
        },
      ],
      insightSections: {
        recommendations: "Rebalance exposure in underperforming regions.",
      },
    });
    expect(plan.lens).toBe("risk");
    expect(plan.useLensExecutivePanel).toBe(true);
    expect(plan.lensSections.map((s) => s.heading)).toEqual([
      "Risk Summary",
      "Risk Exposure",
      "Mitigation Recommendation",
    ]);
    expect(plan.lensSections[0]?.body).toMatch(/Kolkata|Delhi/);
    expect(plan.lensSections[0]?.body).not.toMatch(/dominates performance/i);
    expect(plan.lensSections[0]?.body).toContain("cities");
    expect(plan.lensSections[1]?.body).toContain("42%");
    expect(plan.lensSections[2]?.body).toMatch(
      /Diversify revenue sources beyond Mumbai|Monitor and mitigate downside in Kolkata|Review margin pressure/i
    );
    expect(plan.lensSections[2]?.body).not.toMatch(/^Review concentration exposure: 42%/i);
    expect(plan.lensSections[2]?.body).not.toMatch(/^42%/);
    expect(
      pdfTextsAreSimilar(
        plan.lensSections[0]?.body ?? "",
        plan.lensSections[1]?.body ?? ""
      )
    ).toBe(false);
    expect(plan.vizFacts).toHaveLength(0);
  });

  it("maps opportunity lens without dominance in upside slot", () => {
    const opp = buildPdfExecutiveContentPlan({
      routingPlan: { intent: "executive", executiveLens: "opportunity" },
      vizExecutiveFacts: [
        {
          title: "Opportunity Region",
          value: "East",
          hint: "East may represent an uplift opportunity based on revenue gap in this sample.",
          kind: "opportunity",
        },
        {
          title: "Revenue Concentration",
          value: "42%",
          hint: "West contributes 42% of revenue and dominates performance.",
          kind: "concentration",
        },
        {
          title: "Revenue Gap",
          value: "1.7M",
          hint: "West leads East by 1.7M (65% spread) on revenue.",
          kind: "gap",
        },
      ],
    });
    expect(opp.lensSections.map((s) => s.heading)).toEqual([
      "Opportunity Summary",
      "Upside Potential",
      "Recommended Action",
    ]);
    expect(opp.lensSections[0]?.body).toContain("East");
    const upside = opp.lensSections.find((s) => s.heading === "Upside Potential");
    expect(upside?.body).toMatch(/East trails peer/i);
    expect(upside?.body).toMatch(/upside potential/i);
    expect(upside?.body).not.toMatch(/West leads/i);
    expect(
      opp.lensSections.some((s) => s.body.match(/dominates performance/i))
    ).toBe(false);
    const action = opp.lensSections.find((s) => s.heading === "Recommended Action");
    expect(action?.body).toMatch(/Focus investment on East/i);
    expect(action?.body).not.toMatch(/West/i);
  });

  it("matches invest PDF scenario: leader West, lagger East in recommended action", () => {
    const facts = [
      {
        title: "Opportunity Summary",
        value: "1,742,000",
        hint: "East may represent an uplift opportunity based on revenue gap in this sample.",
        kind: "opportunity",
      },
      {
        title: "Upside Potential",
        value: "1.7M",
        hint: "West leads East by 1.7M (65% spread) on revenue.",
        kind: "gap",
      },
      {
        title: "Revenue Concentration",
        value: "42%",
        hint: "West contributes 42% of revenue and dominates performance.",
        kind: "concentration",
      },
    ];
    const { leader, lagger } = inferLeaderLaggerFromFacts(facts);
    expect(leader).toBe("West");
    expect(lagger).toBe("East");
    const sections = buildLensExecutiveSections("opportunity", facts, null);
    const upside = sections.find((s) => s.heading === "Upside Potential");
    expect(upside?.body).toMatch(
      /East trails peer regions by 1\.7M in revenue, suggesting significant upside potential/i
    );
    expect(upside?.body).not.toMatch(/West leads/i);
    const action = sections.find((s) => s.heading === "Recommended Action");
    expect(action?.body).toMatch(/Focus investment on East/i);
    expect(action?.body).not.toMatch(/under-indexed segments such as West/i);
  });

  it("prefers AI recommendations for strategy business recommendation", () => {
    const strat = buildPdfExecutiveContentPlan({
      routingPlan: { intent: "executive", executiveLens: "strategy" },
      vizExecutiveFacts: [
        {
          title: "Revenue Concentration",
          value: "42%",
          hint: "Mumbai accounts for 42% of total revenue — concentration risk.",
          kind: "concentration",
        },
        {
          title: "Revenue Gap",
          value: "1.7M",
          hint: "Mumbai contributes 42% of revenue and dominates performance.",
          kind: "concentration",
        },
      ],
      insightSections: {
        recommendations:
          "Diversify revenue sources and strengthen retention in secondary cities.",
      },
    });
    expect(strat.lensSections.map((s) => s.heading)).toEqual([
      "Strategic Observation",
      "Business Recommendation",
    ]);
    expect(strat.lensSections[0]?.body).toContain("42%");
    expect(strat.lensSections[1]?.body).toContain("Diversify revenue");
    expect(strat.lensSections[1]?.body).not.toMatch(/dominates performance/i);
  });

  it("uses unique hierarchy headings for AI insight rendering", () => {
    const labels = pdfExecutiveHierarchyHeadings();
    expect(labels.summary).toBe("Executive summary");
    expect(labels.interpretation).toBe("Business interpretation");
    expect(labels.recommendation).toBe("Strategic recommendation");
  });
});

describe("buildLensExecutiveSections", () => {
  it("fills mitigation from strategic recommendation when third fact missing", () => {
    const sections = buildLensExecutiveSections(
      "risk",
      [
        {
          title: "Growth Risk",
          value: "North",
          hint: "North trails peers on growth.",
          kind: "risk",
        },
        {
          title: "Revenue Concentration",
          value: "40%",
          hint: "West accounts for 40% of total revenue.",
          kind: "concentration",
        },
      ],
      "Monitor weekly and cap downside in weak segments."
    );
    expect(sections).toHaveLength(3);
    expect(sections[2]?.heading).toBe("Mitigation Recommendation");
    expect(sections[2]?.body).toContain("Monitor weekly");
  });
});

describe("rewriteOpportunityLensNarrative", () => {
  it("reframes leader-gap copy for upside potential", () => {
    const out = rewriteOpportunityLensNarrative(
      "1.7M — West leads East by 1.7M (65% spread) on revenue.",
      { leader: "West", lagger: "East" },
      "Upside Potential"
    );
    expect(out).toBe(
      "East trails peer regions by 1.7M in revenue, suggesting significant upside potential if performance improves."
    );
    expect(out).not.toMatch(/West leads/i);
  });
});

describe("rewriteObservationAsAction", () => {
  it("generates executive mitigation without leading metrics for concentration risk", () => {
    const out = rewriteObservationAsAction(
      "42% — In this sample, Mumbai accounts for 42% of total revenue — concentration risk if performance depends on one city.",
      "risk",
      "Mitigation Recommendation",
      { leader: "Mumbai", lagger: "Kolkata" }
    );
    expect(out).toMatch(/Diversify revenue sources beyond Mumbai/i);
    expect(out).not.toMatch(/^Review concentration exposure/i);
    expect(out).not.toMatch(/^42%/);
  });

  it("targets lagging entity for opportunity recommended action", () => {
    const out = rewriteObservationAsAction(
      "42% — West contributes 42% of revenue and dominates performance.",
      "opportunity",
      "Recommended Action",
      { leader: "West", lagger: "East" }
    );
    expect(out).toMatch(/Focus investment on East/i);
    expect(out).not.toMatch(/West/i);
    expect(out).not.toMatch(/42%/);
  });
});

describe("looksLikeMetricToken", () => {
  it("flags percentages and numeric amounts", () => {
    expect(looksLikeMetricToken("42%")).toBe(true);
    expect(looksLikeMetricToken("1.7M")).toBe(true);
    expect(looksLikeMetricToken("Mumbai")).toBe(false);
    expect(looksLikeMetricToken("East")).toBe(false);
  });
});

describe("extractBusinessEntityFromLensBody", () => {
  it("extracts segment names from opportunity narratives", () => {
    expect(
      extractBusinessEntityFromLensBody(
        "East — East may represent an uplift opportunity based on revenue gap in this sample."
      )
    ).toBe("East");
    expect(
      extractBusinessEntityFromLensBody(
        "1.7M — West leads East by 1.7M (65% spread) on revenue."
      )
    ).toBe("East");
  });
});

describe("polishLensSectionCopy", () => {
  it("fixes citys typo", () => {
    expect(polishLensSectionCopy("weakest growth among citys")).toContain(
      "cities"
    );
  });
});

describe("buildPdfChartIntelBlocks", () => {
  it("returns null when chart intel is empty", () => {
    expect(buildPdfChartIntelBlocks(null)).toBeNull();
    expect(buildPdfChartIntelBlocks({})).toBeNull();
  });
});
