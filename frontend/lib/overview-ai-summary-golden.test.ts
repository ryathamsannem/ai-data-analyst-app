import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeOverviewAiSummaryBullets,
  OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE,
  partitionOverviewAiSummaryBullets,
  type ComputeOverviewAiSummaryArgs,
} from "@/lib/overview-ai-summary";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "overview-summary-golden.json"
);

type GoldenPayload = {
  domain: string;
  file: string;
  rows: number;
  columns: string[];
  auto_dashboard: ComputeOverviewAiSummaryArgs["autoDashboard"];
  primaryMetricColumn: string | null;
  groupingColumn: string | null;
  dateColumn: string | null;
  profile: ComputeOverviewAiSummaryArgs["profile"];
};

const GOLDEN_PAYLOADS = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8")
) as GoldenPayload[];

function bulletsFor(payload: GoldenPayload): string[] {
  return computeOverviewAiSummaryBullets({
    rows: payload.rows,
    columns: payload.columns,
    autoDashboard: payload.auto_dashboard,
    profile: payload.profile,
    primaryMetricColumn: payload.primaryMetricColumn,
    groupingColumn: payload.groupingColumn,
    dateColumn: payload.dateColumn,
  });
}

const LOW_VALUE_PATTERNS = [
  /\bleading city by credit score\b/i,
  /\bleading location by manager flag\b/i,
  /\bleading marketing channel by shipping cost\b/i,
  /\baccounts for about \d+% of the total in this breakdown\b/i,
  /\bhas the largest representation in the .+ breakdown\b/i,
];

describe("golden dataset AI summary quality", () => {
  it.each(GOLDEN_PAYLOADS.map((p) => [p.domain, p] as const))(
    "%s avoids low-value chart-driven bullets in top insights",
    (_domain, payload) => {
      const bullets = bulletsFor(payload);
      const top = partitionOverviewAiSummaryBullets(bullets).initial;
      for (const pattern of LOW_VALUE_PATTERNS) {
        expect(top.some((b) => pattern.test(b))).toBe(false);
      }
    }
  );

  it("retail golden prioritizes revenue, profit, category, and region in top 5", () => {
    const retail = GOLDEN_PAYLOADS.find((p) => p.domain === "retail_gold_10000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(retail)).initial;
    const blob = top.join(" ").toLowerCase();
    expect(blob).toMatch(/sales|revenue|profit/);
    expect(blob).toMatch(/electronics|product category|category/);
    expect(blob).toMatch(/north|region|concentration/);
    expect(blob).not.toMatch(/shipping cost by marketing channel/);
    expect(blob).not.toMatch(/delivery days by sub category/);
  });

  it("hr golden prioritizes workforce, salary, attrition, and department over manager flag noise", () => {
    const hr = GOLDEN_PAYLOADS.find((p) => p.domain === "hr_gold_5000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(hr)).initial;
    const blob = top.join(" ").toLowerCase();
    expect(blob).toMatch(/workforce|salary|department|attrition|headcount/);
    expect(top.some((b) => /\battrition\b/i.test(b))).toBe(true);
    expect(top.some((b) => /\bmanager flag\b/i.test(b))).toBe(false);
    expect(top.some((b) => /\bremote[\s-]?us\b/i.test(b) && /\bmanager\b/i.test(b))).toBe(
      false
    );
  });

  it("banking golden prioritizes loan, spend, segment, and region over city credit score", () => {
    const banking = GOLDEN_PAYLOADS.find((p) => p.domain === "banking_gold_10000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(banking)).initial;
    const blob = top.join(" ").toLowerCase();
    expect(blob).toMatch(/loan|spend|segment|balance/);
    expect(top.some((b) => /\bdelinquency risk clusters\b/i.test(b))).toBe(false);
    expect(top.some((b) => /\bpatna\b/i.test(b) && /\bcredit score\b/i.test(b))).toBe(
      false
    );
    expect(top.some((b) => /\baccount age months trend\b/i.test(b))).toBe(false);
  });

  it("golden retail dedupes KPI top-category echo from chart leader", () => {
    const retail = GOLDEN_PAYLOADS.find((p) => p.domain === "retail_gold_10000")!;
    const bullets = bulletsFor(retail);
    const electronicsLeader = bullets.filter(
      (b) => /electronics/i.test(b) && /(top|leading|share|category|sales|profit)/i.test(b)
    );
    expect(electronicsLeader.length).toBeLessThanOrEqual(2);
  });

  it("each golden dataset surfaces more than initial visible when data is rich", () => {
    for (const payload of GOLDEN_PAYLOADS) {
      const bullets = bulletsFor(payload);
      expect(bullets.length).toBeGreaterThan(OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE);
    }
  });

  it("hr golden limits Engineering to at most one mention in top 5", () => {
    const hr = GOLDEN_PAYLOADS.find((p) => p.domain === "hr_gold_5000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(hr)).initial;
    expect(top.filter((b) => /\bengineering\b/i.test(b)).length).toBeLessThanOrEqual(1);
  });

  it("banking golden includes risk or utilization insight in top 5", () => {
    const banking = GOLDEN_PAYLOADS.find((p) => p.domain === "banking_gold_10000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(banking)).initial;
    expect(
      top.some((b) =>
        /\bdelinquency\b|\butilization\b|\bcredit score\b|\brisk\b/i.test(b)
      )
    ).toBe(true);
  });

  it("banking golden dedupes Corporate loan segment conclusions", () => {
    const banking = GOLDEN_PAYLOADS.find((p) => p.domain === "banking_gold_10000")!;
    const bullets = bulletsFor(banking);
    const corporateLoan = bullets.filter(
      (b) => /corporate/i.test(b) && /loan balance|loan segment|segment by loan/i.test(b)
    );
    expect(corporateLoan.length).toBeLessThanOrEqual(1);
  });

  it("banking golden demotes account age product rankings", () => {
    const banking = GOLDEN_PAYLOADS.find((p) => p.domain === "banking_gold_10000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(banking)).initial;
    expect(top.some((b) => /account age months/i.test(b))).toBe(false);
  });

  it("retail golden top 5 locks business-first ordering", () => {
    const retail = GOLDEN_PAYLOADS.find((p) => p.domain === "retail_gold_10000")!;
    const top = partitionOverviewAiSummaryBullets(bulletsFor(retail)).initial;
    expect(top[0]).toMatch(/retail analytics snapshot/i);
    expect(top.some((b) => /total sales|total profit|revenue concentration|north/i.test(b))).toBe(
      true
    );
    expect(top.some((b) => /electronics/i.test(b))).toBe(true);
  });
});
