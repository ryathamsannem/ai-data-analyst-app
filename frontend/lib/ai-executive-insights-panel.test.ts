import { describe, expect, it } from "vitest";
import { resolveExecutiveInsightsPanelView } from "@/app/components/ai-executive-insights-panel";

const sampleCards = [
  {
    key: "pie-max-label",
    title: "Largest segment",
    value: "Electronics",
    hint: "$420,000",
    dotClass: "bg-emerald-500",
  },
  {
    key: "pie-min-label",
    title: "Smallest segment",
    value: "Accessories",
    hint: "$48,000",
    dotClass: "bg-sky-500",
  },
];

describe("resolveExecutiveInsightsPanelView", () => {
  it("hides executive signal cards when AI Read already shows them", () => {
    const view = resolveExecutiveInsightsPanelView({
      cards: sampleCards,
      narrativeBrief: "Electronics leads revenue share in this cohort.",
      suppressSignalCards: true,
    });
    expect(view.showSignalCards).toBe(false);
    expect(view.showBrief).toBe(true);
    expect(view.showPanel).toBe(true);
  });

  it("keeps AI context visible when signal cards are suppressed", () => {
    const view = resolveExecutiveInsightsPanelView({
      cards: sampleCards,
      narrativeBrief: "Executive takeaway for the active chart.",
      suppressSignalCards: true,
    });
    expect(view.showBrief).toBe(true);
    expect(view.showPanel).toBe(true);
  });

  it("allows full summary expansion without re-showing signal cards", () => {
    const numberedBrief =
      "TOP 3 BUSINESS INSIGHTS\n\n1. West contributes 42% of total revenue.\n\n2. East trails by 18%.\n\n3. South remains smallest.";
    const view = resolveExecutiveInsightsPanelView({
      cards: sampleCards,
      narrativeBrief: numberedBrief,
      suppressSignalCards: true,
    });
    expect(view.showSignalCards).toBe(false);
    expect(view.showBrief).toBe(true);
  });

  it("shows executive cards when AI Read signals are unavailable", () => {
    const view = resolveExecutiveInsightsPanelView({
      cards: sampleCards,
      narrativeBrief: "Regional spread is material.",
      suppressSignalCards: false,
    });
    expect(view.showSignalCards).toBe(true);
    expect(view.showBrief).toBe(true);
    expect(view.showPanel).toBe(true);
  });

  it("shows executive cards as fallback when there is no AI context brief", () => {
    const view = resolveExecutiveInsightsPanelView({
      cards: sampleCards,
      narrativeBrief: "",
      suppressSignalCards: false,
    });
    expect(view.showSignalCards).toBe(true);
    expect(view.showBrief).toBe(false);
    expect(view.showPanel).toBe(true);
  });
});
