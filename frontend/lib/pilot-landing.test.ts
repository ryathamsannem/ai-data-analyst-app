import { describe, expect, it } from "vitest";
import {
  PILOT_HEADER_NAV,
  PILOT_LANDING_HERO,
  PILOT_VALUE_CHIPS,
  buildPilotPricingTiers,
} from "@/lib/pilot-landing";

describe("pilot landing content", () => {
  it("exposes hero title and subtitle", () => {
    expect(PILOT_LANDING_HERO.title).toContain("AI Data Analyst");
    expect(PILOT_LANDING_HERO.subtitle).toMatch(/CSV|Excel|JSON|Parquet/i);
  });

  it("renders navigation link labels", () => {
    expect(PILOT_HEADER_NAV.map((link) => link.label)).toEqual([
      "Home",
      "Pricing",
      "Privacy",
      "Security",
      "Contact",
    ]);
  });

  it("includes value chips for pilot capabilities", () => {
    expect(PILOT_VALUE_CHIPS.map((chip) => chip.label)).toEqual([
      "AI Insights",
      "Executive Analysis",
      "Smart Visualizations",
      "Follow-up Questions",
      "Executive Reports",
    ]);
  });

  it("shows free and paid pricing limits", () => {
    const tiers = buildPilotPricingTiers();
    expect(tiers).toHaveLength(2);
    expect(tiers[0].name).toMatch(/Free/i);
    expect(tiers[0].features.join(" ")).toMatch(/100 KB|10 AI questions/);
    expect(tiers[1].name).toMatch(/Paid/i);
    expect(tiers[1].features.join(" ")).toMatch(/25 MB|300 AI questions/);
    expect(tiers[1].features.join(" ")).toMatch(/Unlimited PDF/);
  });
});
