import { describe, expect, it } from "vitest";
import {
  insightAnswerSummaryForDisplay,
  parseAnswerIntoSections,
  resolveParsedAnswerSummary,
} from "@/lib/build-executive-pdf-input";
import {
  fixMalformedNarrativeHedging,
  polishInsightNarrativeText,
} from "@/lib/narrative-number-format";

describe("fixMalformedNarrativeHedging", () => {
  it("removes could may from supporting detail prose", () => {
    const raw =
      "The strong performance of North could may be consistent with regional concentration.";
    const out = fixMalformedNarrativeHedging(raw);
    expect(out.toLowerCase()).not.toContain("could may");
    expect(out.toLowerCase()).toContain("may be consistent with");
  });

  it("fixes could be may in polished supporting detail", () => {
    const out = polishInsightNarrativeText(
      "The ranking could be may be consistent with concentration."
    );
    expect(out.toLowerCase()).not.toContain("could be may");
    expect(out.toLowerCase()).not.toContain("could may");
    expect(out.toLowerCase()).toContain("may be consistent with");
  });
});

describe("parseAnswerIntoSections", () => {
  it("splits inline section labels instead of one merged summary", () => {
    const raw =
      "Based on the previous result, Key findings North leads with 35%. What this may indicate This may show concentration. Suggested next steps Compare by category.";
    const parsed = parseAnswerIntoSections(raw);
    expect(parsed.summary.toLowerCase()).toContain("based on the previous");
    expect(parsed.statistical?.toLowerCase()).toContain("north leads");
    expect(parsed.hypotheses?.toLowerCase()).toContain("concentration");
    expect(parsed.recommendations?.toLowerCase()).toContain("compare");
    expect(parsed.summary.toLowerCase()).not.toContain("what this may indicate");
  });

  it("parses plain label lines into supporting sections", () => {
    const raw = [
      "North leads this cohort.",
      "",
      "Key findings:",
      "North contributes 35% of sales.",
      "",
      "What this may indicate:",
      "This may show regional concentration.",
    ].join("\n");
    const parsed = parseAnswerIntoSections(raw);
    expect(parsed.statistical).toContain("35%");
    expect(parsed.hypotheses?.toLowerCase()).toContain("concentration");
  });

  it("fills main summary from Key findings when preamble is empty", () => {
    const raw = [
      "Key findings:",
      "Corporate has the highest loan balance at 19,482,785,754, representing 74% of total loan balance across 10,000 customers.",
      "",
      "What this may indicate:",
      "Concentration may reflect segment mix.",
      "",
      "Suggested next steps:",
      "Compare Corporate by product type.",
    ].join("\n");
    const parsed = parseAnswerIntoSections(raw);
    expect(parsed.summary.toLowerCase()).toContain("corporate");
    expect(parsed.summary.toLowerCase()).toContain("74%");
    expect(insightAnswerSummaryForDisplay(parsed).toLowerCase()).not.toContain(
      "summary unavailable"
    );
  });
});

describe("fixMalformedNarrativeHedging auxiliary collisions", () => {
  it("fixes is may reflect", () => {
    const out = fixMalformedNarrativeHedging(
      "Concentration is may reflect segment mix in this cohort."
    );
    expect(out.toLowerCase()).not.toContain("is may reflect");
    expect(out.toLowerCase()).toContain("may reflect");
  });

  it("fixes is may indicate and is could suggest", () => {
    expect(
      fixMalformedNarrativeHedging("The gap is may indicate volatility.").toLowerCase()
    ).toContain("may indicate");
    expect(
      fixMalformedNarrativeHedging("The gap is could suggest risk.").toLowerCase()
    ).toContain("could suggest");
  });
});
