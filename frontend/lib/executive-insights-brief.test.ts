import { describe, expect, it } from "vitest";
import {
  buildRankingExecutiveBrief,
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

  it("detects Top Performing City as geographic ranking", () => {
    expect(isGeographicRankingQuestion("Top Performing City")).toBe(true);
    expect(
      isGeographicRankingQuestion("Which region generates the highest revenue?")
    ).toBe(true);
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
