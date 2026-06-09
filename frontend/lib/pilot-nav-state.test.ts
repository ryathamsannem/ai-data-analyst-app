import { describe, expect, it } from "vitest";
import {
  pilotInfoModalTitle,
  resolvePilotNavActive,
  shouldShowHeaderSearch,
} from "@/lib/pilot-nav-state";
import { buildPilotPricingTiers, PILOT_PAYMENT_NOTE } from "@/lib/pilot-landing";

describe("pilot nav state", () => {
  it("highlights Home on Overview when no modal is open", () => {
    expect(
      resolvePilotNavActive({
        activeTab: "overview",
        pilotInfoModal: null,
        pilotNavHighlight: "home",
      })
    ).toBe("home");
  });

  it("keeps Home active on Overview after dataset is loaded", () => {
    expect(
      resolvePilotNavActive({
        activeTab: "overview",
        pilotInfoModal: null,
        pilotNavHighlight: "home",
      })
    ).toBe("home");
  });

  it("highlights Pricing only when pricing modal is open", () => {
    expect(
      resolvePilotNavActive({
        activeTab: "overview",
        pilotInfoModal: "pricing",
        pilotNavHighlight: "home",
      })
    ).toBe("pricing");
  });

  it("highlights scrolled section target when modal is closed", () => {
    expect(
      resolvePilotNavActive({
        activeTab: "overview",
        pilotInfoModal: null,
        pilotNavHighlight: "privacy",
      })
    ).toBe("privacy");
  });

  it("clears header nav active state outside Overview", () => {
    expect(
      resolvePilotNavActive({
        activeTab: "insights",
        pilotInfoModal: null,
        pilotNavHighlight: "home",
      })
    ).toBeNull();
  });

  it("hides header search before and after dataset load in V1", () => {
    expect(shouldShowHeaderSearch(false)).toBe(false);
    expect(shouldShowHeaderSearch(true)).toBe(false);
  });

  it("exposes modal titles for pilot info sections", () => {
    expect(pilotInfoModalTitle("pricing")).toBe("Pricing");
    expect(pilotInfoModalTitle("contact")).toBe("Contact");
  });
});

describe("pilot info modal content", () => {
  it("shows pricing tiers and payment note for modal rendering", () => {
    const tiers = buildPilotPricingTiers();
    expect(tiers).toHaveLength(2);
    expect(tiers[0].features.join(" ")).toMatch(/100 KB/);
    expect(tiers[1].features.join(" ")).toMatch(/Unlimited PDF/);
    expect(PILOT_PAYMENT_NOTE).toMatch(/not enabled/i);
  });
});
