import { describe, expect, it } from "vitest";
import {
  buildNumberedExecutiveBrief,
  buildNumberedExecutiveBriefFromRanked,
  buildRankingExecutiveBrief,
  isExecutiveSummaryLayoutMode,
  isExecutiveTakeawaysQuestion,
  isGeographicRankingQuestion,
} from "@/lib/executive-insights-brief";

describe("buildRankingExecutiveBrief", () => {
  const cityRows = [
    { label: "Mumbai", value: 260000, formatted: "260,000" },
    { label: "Delhi", value: 248000, formatted: "248,000" },
    { label: "Bengaluru", value: 210000, formatted: "210,000" },
    { label: "Hyderabad", value: 182000, formatted: "182,000" },
    { label: "Chennai", value: 156000, formatted: "156,000" },
    { label: "Pune", value: 132000, formatted: "132,000" },
    { label: "Kolkata", value: 116000, formatted: "116,000" },
    { label: "Jaipur", value: 90000, formatted: "90,000" },
  ];

  it("detects executive summary layout questions", () => {
    expect(isExecutiveTakeawaysQuestion("Summarize business performance")).toBe(true);
    expect(isExecutiveTakeawaysQuestion("Give executive summary")).toBe(true);
    expect(isExecutiveTakeawaysQuestion("Business overview")).toBe(true);
    expect(isExecutiveSummaryLayoutMode("Summarize business performance")).toBe(true);
  });

  it("detects Top Performing City as geographic ranking", () => {
    expect(isGeographicRankingQuestion("Top Performing City")).toBe(true);
    expect(
      isGeographicRankingQuestion("Which region generates the highest revenue?")
    ).toBe(true);
  });

  it("includes percent sign in share concentration brief", () => {
    const brief = buildNumberedExecutiveBrief({
      question: "Summarize business performance",
      categoryAxis: "Region",
      valueAxis: "Revenue",
      rows: [
        { label: "West", value: 420_000, formatted: "420,000" },
        { label: "East", value: 280_000, formatted: "280,000" },
        { label: "North", value: 190_000, formatted: "190,000" },
      ],
    });
    expect(brief).toMatch(/\d+% of total revenue/i);
    expect(brief).not.toMatch(/contributes \d+ of total/i);
  });

  it("builds numbered brief from ranked API lines", () => {
    const brief = buildNumberedExecutiveBriefFromRanked({
      question: "Summarize business performance",
      lines: [
        "West contributes 42% of total revenue and dominates performance.",
        "West leads East by 35% on revenue across regions in this sample.",
        "In this sample, revenue trends up from the earliest to latest period (12% change, directional).",
      ],
    });
    expect(brief).toContain("TOP 3 BUSINESS INSIGHTS");
    expect(brief).toMatch(/^1\./m);
    expect(brief).toMatch(/42% of total revenue/i);
  });

  it("uses aggregated revenue totals not mislabeled points", () => {
    const brief = buildRankingExecutiveBrief({
      categoryAxis: "City",
      valueAxis: "Revenue",
      rows: cityRows,
    });
    expect(brief).toBeTruthy();
    expect(brief).toContain("718");
    expect(brief).toContain("1,394");
    expect(brief).not.toMatch(/revenue points/i);
    expect(brief).not.toContain("58,000");
  });
});
