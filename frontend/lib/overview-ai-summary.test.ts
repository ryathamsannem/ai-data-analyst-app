import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildBreakdownInsightLine,
  buildTrendInsightLine,
  computeOverviewAiSummaryBullets,
  DURATION_LATENCY_METRIC_RE,
  inferOverviewSummaryDomain,
  OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE,
  OVERVIEW_AI_SUMMARY_MAX_BULLETS,
  partitionOverviewAiSummaryBullets,
  selectOverviewAiSummaryInsights,
  type ComputeOverviewAiSummaryArgs,
} from "@/lib/overview-ai-summary";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "overview-summary-domains.json"
);

type DomainPayload = {
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

const DOMAIN_PAYLOADS = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8")
) as DomainPayload[];

const EXPECTED_SUMMARY_DOMAIN: Record<string, string> = {
  banking_financial_services: "banking",
  customer_support: "customer_support",
  dashboard_showcase_dataset: "sales",
  employee_test: "hr",
  finance_fpa: "finance_fpa",
  geography: "geography",
  healthcare: "healthcare",
  hr: "hr",
  marketing: "marketing",
  monthly_sales: "sales",
  operations: "operations",
  operations_incidents_chart_test: "operations",
  retail: "retail",
  retail_orders_chart_test: "retail",
  sales: "sales",
  "screenshot-fixture": "retail",
};

function bulletsFor(payload: DomainPayload): string[] {
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

describe("inferOverviewSummaryDomain", () => {
  it.each(DOMAIN_PAYLOADS.map((p) => [p.domain, p] as const))(
    "detects %s domain from schema",
    (domain, payload) => {
      const inferred = inferOverviewSummaryDomain({
        columns: payload.columns,
        autoDashboard: payload.auto_dashboard,
      });
      expect(inferred).toBe(EXPECTED_SUMMARY_DOMAIN[domain]);
    }
  );
});

describe("computeOverviewAiSummaryBullets per domain fixture", () => {
  it.each(DOMAIN_PAYLOADS.map((p) => [p.domain, p] as const))(
    "%s produces SaaS-level bullets without N/A",
    (domain, payload) => {
      const bullets = bulletsFor(payload);
      expect(bullets.length).toBeGreaterThanOrEqual(3);
      expect(bullets.length).toBeLessThanOrEqual(OVERVIEW_AI_SUMMARY_MAX_BULLETS);
      for (const line of bullets) {
        expect(line.trim().length).toBeGreaterThan(10);
        expect(/\bn\/a\b/i.test(line)).toBe(false);
      }
      const frame = bullets[0] ?? "";
      expect(frame.toLowerCase()).toContain("snapshot");
    }
  );

  it("rich retail fixture produces more than initial visible insights", () => {
    const retail = DOMAIN_PAYLOADS.find((p) => p.domain === "retail")!;
    const bullets = bulletsFor(retail);
    expect(bullets.length).toBeGreaterThan(OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE);
    const { initial, extra, hasMore } = partitionOverviewAiSummaryBullets(bullets);
    expect(initial).toHaveLength(OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE);
    expect(extra.length).toBeGreaterThan(0);
    expect(hasMore).toBe(true);
  });

  it("sparse monthly_sales fixture keeps meaningful insights without filler noise", () => {
    const payload = DOMAIN_PAYLOADS.find((p) => p.domain === "monthly_sales")!;
    const bullets = bulletsFor(payload);
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(bullets.some((b) => /sales/i.test(b) && /trend|improving|steady/i.test(b))).toBe(
      true
    );
    expect(bullets.some((b) => /ask a focused question in ai insights/i.test(b))).toBe(
      false
    );
  });

  it("minimal dashboard yields at most initial visible insights without show-more", () => {
    const bullets = computeOverviewAiSummaryBullets({
      rows: 5,
      columns: ["month", "sales"],
      autoDashboard: {
        kind: "sales",
        type_label: "Sales",
        cards: [{ title: "Total Revenue", value: "500", subtitle: null }],
        charts: [],
      },
      profile: {
        column_types: { sales: "number", month: "category" },
        summary_stats: { mean: { sales: 100 }, std: { sales: 10 }, max: { sales: 120 }, min: { sales: 80 } },
      },
      primaryMetricColumn: "sales",
      groupingColumn: null,
      dateColumn: "month",
    });
    expect(bullets.length).toBeLessThanOrEqual(OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE);
    expect(partitionOverviewAiSummaryBullets(bullets).hasMore).toBe(false);
  });

  it("showcase dataset can surface 8–12 ranked insights when charts and KPIs are rich", () => {
    const showcase = DOMAIN_PAYLOADS.find((p) => p.domain === "dashboard_showcase_dataset")!;
    const bullets = bulletsFor(showcase);
    expect(bullets.length).toBeGreaterThanOrEqual(8);
    expect(bullets.length).toBeLessThanOrEqual(OVERVIEW_AI_SUMMARY_MAX_BULLETS);
    expect(partitionOverviewAiSummaryBullets(bullets).extra.length).toBeGreaterThanOrEqual(3);
  });

  it("skips correlation scatter charts for misleading breakdown bullets", () => {
    const bullets = computeOverviewAiSummaryBullets({
      rows: 120,
      columns: ["revenue", "profit", "region"],
      autoDashboard: {
        kind: "sales",
        cards: [{ title: "Total Revenue", value: "1,000,000", subtitle: null }],
        charts: [
          {
            title: "revenue vs profit (correlation)",
            chartType: "scatter",
            labels: ["100 / 20", "200 / 40"],
            values: [0.9, 0.85],
          },
          {
            title: "Top region by revenue",
            chartType: "bar",
            labels: ["North", "South"],
            values: [500, 300],
          },
        ],
      },
      profile: {
        column_types: { revenue: "number", profit: "number", region: "category" },
      },
      primaryMetricColumn: "revenue",
      groupingColumn: "region",
      dateColumn: null,
    });
    expect(bullets.some((b) => /\b100\s*\/\s*20\b/.test(b))).toBe(false);
    expect(bullets.some((b) => /north/i.test(b) && /leading|highest/i.test(b))).toBe(
      true
    );
  });

  it("partitionOverviewAiSummaryBullets keeps ranking order", () => {
    const sample = ["a", "b", "c", "d", "e", "f", "g"];
    const { initial, extra } = partitionOverviewAiSummaryBullets(sample, 5);
    expect(initial).toEqual(["a", "b", "c", "d", "e"]);
    expect(extra).toEqual(["f", "g"]);
  });

  it("hr fixture uses workforce language, not employee-count HR KPI echo", () => {
    const hr = DOMAIN_PAYLOADS.find((p) => p.domain === "hr")!;
    const bullets = bulletsFor(hr);
    expect(bullets.some((b) => /workforce|headcount|personnel/i.test(b))).toBe(
      true
    );
    expect(bullets.some((b) => /total employees/i.test(b))).toBe(false);
  });

  it("revenue fixtures never use HR employee language", () => {
    const revenueDomains = [
      "sales",
      "retail",
      "dashboard_showcase_dataset",
      "screenshot-fixture",
      "marketing",
      "geography",
    ];
    for (const key of revenueDomains) {
      const payload = DOMAIN_PAYLOADS.find((p) => p.domain === key);
      expect(payload, `missing fixture ${key}`).toBeTruthy();
      const bullets = bulletsFor(payload!);
      expect(
        bullets.some((b) =>
          /\b(total employees?|department count|highest paid employee)\b/i.test(b)
        )
      ).toBe(false);
    }
  });

  it("skips N/A KPI cards when valid metrics exist on other cards", () => {
    const bullets = computeOverviewAiSummaryBullets({
      rows: 100,
      columns: ["revenue", "region", "product"],
      autoDashboard: {
        kind: "sales",
        type_label: "Sales",
        cards: [
          { title: "Total Revenue", value: "1,234,567", subtitle: null },
          { title: "Average Revenue", value: "N/A", subtitle: null },
          { title: "Top Region", value: "North", subtitle: "Revenue 500,000" },
        ],
        charts: [],
      },
      profile: {
        column_types: { revenue: "number", region: "category", product: "category" },
        summary_stats: {
          mean: { revenue: 5000 },
          std: { revenue: 1200 },
          max: { revenue: 12000 },
          min: { revenue: 800 },
        },
      },
      primaryMetricColumn: "revenue",
      groupingColumn: "product",
      dateColumn: null,
    });
    expect(bullets.some((b) => /\bn\/a\b/i.test(b))).toBe(false);
    expect(bullets.some((b) => /total revenue/i.test(b))).toBe(true);
    expect(bullets.some((b) => /average revenue/i.test(b))).toBe(false);
  });

  it("aligns KPI bullets with populated card values", () => {
    const showcase = DOMAIN_PAYLOADS.find(
      (p) => p.domain === "dashboard_showcase_dataset"
    )!;
    const bullets = bulletsFor(showcase);
    const cards = showcase.auto_dashboard?.cards ?? [];
    const revenueCard = cards.find((c) => c.title === "Total Revenue");
    expect(revenueCard?.value).toBeTruthy();
    expect(revenueCard?.value).not.toBe("N/A");
    expect(
      bullets.some(
        (b) =>
          b.includes(String(revenueCard?.value)) ||
          /total revenue/i.test(b)
      )
    ).toBe(true);
  });

  it("showcase summary stays grounded in revenue and profit KPIs", () => {
    const showcase = DOMAIN_PAYLOADS.find(
      (p) => p.domain === "dashboard_showcase_dataset"
    )!;
    const bullets = bulletsFor(showcase).join(" ").toLowerCase();
    expect(bullets).toMatch(/total revenue/);
    expect(bullets).toMatch(/average revenue/);
    expect(bullets).toMatch(/total profit/);
  });

  it.each(DOMAIN_PAYLOADS.map((p) => [p.domain, p] as const))(
    "%s avoids awkward summary wording patterns",
    (_domain, payload) => {
      const bullets = bulletsFor(payload);
      const blob = bullets.join(" ");
      expect(blob).not.toMatch(/\bleads on\b/i);
      expect(blob).not.toMatch(/\bwhen split by\b/i);
      expect(blob).not.toMatch(/\brecent buckets in\b/i);
      expect(blob).not.toMatch(/\bhighest category distribution\b/i);
      expect(blob).not.toMatch(
        /\b(?:delivery days|response time|resolution time|wait time|latency|duration|turnaround time|resolution hours).{0,24}\bshare\b/i
      );
    }
  );

  it("employee_test uses workforce framing despite sales auto-dashboard kind", () => {
    const payload = DOMAIN_PAYLOADS.find((p) => p.domain === "employee_test")!;
    expect(payload.auto_dashboard?.kind).toBe("sales");
    const bullets = bulletsFor(payload);
    expect(bullets[0]).toMatch(/workforce|HR analytics|employee/i);
    expect(bullets[0]).not.toMatch(/sales analytics snapshot/i);
  });

  it("hr category distribution chart uses department headcount wording", () => {
    const hr = DOMAIN_PAYLOADS.find((p) => p.domain === "hr")!;
    const deptChart = hr.auto_dashboard?.charts?.find((c) =>
      /category distribution.*department/i.test(c.title)
    );
    expect(deptChart).toBeTruthy();
    const leader = deptChart!.labels[
      deptChart!.values.indexOf(Math.max(...deptChart!.values))
    ];
    expect(
      buildBreakdownInsightLine({
        chartTitle: deptChart!.title,
        chartType: deptChart!.chartType,
        leaderName: String(leader),
        domain: "hr",
      })
    ).toMatch(/largest department by employee count|highest employee representation/i);
  });

  it("monthly_sales small trend uses softer language", () => {
    const payload = DOMAIN_PAYLOADS.find((p) => p.domain === "monthly_sales")!;
    expect(payload.rows).toBeLessThanOrEqual(6);
    const bullets = bulletsFor(payload);
    const trendLine = bullets.find((b) => /sales/i.test(b) && /trend|improving|steady/i.test(b));
    expect(trendLine).toBeTruthy();
    expect(trendLine).toMatch(/appears to be improving|shows an upward trend|appears relatively steady/i);
    expect(trendLine).not.toMatch(/\bhas strengthened\b/i);
    expect(trendLine?.startsWith("Sales")).toBe(true);
  });
});

describe("executive wording helpers", () => {
  it("formats banking segment ranking naturally", () => {
    expect(
      buildBreakdownInsightLine({
        chartTitle: "Top customer segment by loan balance",
        chartType: "horizontalBar",
        leaderName: "SME",
        domain: "banking",
      })
    ).toBe("SME is the leading customer segment by loan balance.");
  });

  it("formats ecommerce / product order value naturally", () => {
    expect(
      buildBreakdownInsightLine({
        chartTitle: "Top product by order value",
        chartType: "horizontalBar",
        leaderName: "Laptop",
        domain: "retail",
      })
    ).toBe("Laptop generates the highest order value.");
  });

  it("formats share composition without awkward split phrasing", () => {
    expect(
      buildBreakdownInsightLine({
        chartTitle: "revenue share by region",
        chartType: "donut",
        leaderName: "East",
        domain: "sales",
      })
    ).toBe("East contributes the largest share of revenue.");
  });

  it("guards duration metrics from share phrasing", () => {
    expect(DURATION_LATENCY_METRIC_RE.test("delivery days")).toBe(true);
    expect(
      buildBreakdownInsightLine({
        chartTitle: "Top city by delivery days",
        chartType: "bar",
        leaderName: "Maharashtra",
        domain: "retail",
      })
    ).toBe("Maharashtra has the highest average delivery days.");
  });

  it("uses natural trend moderation wording on larger samples", () => {
    const line = buildTrendInsightLine(
      {
        title: "revenue trend (monthly)",
        chartType: "line",
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
        values: [100, 105, 102, 98, 96, 94, 93, 92],
      },
      -0.08
    );
    expect(line).toMatch(/moderation|softened/i);
    expect(line.startsWith("Revenue")).toBe(true);
    expect(line).not.toMatch(/recent buckets/i);
  });

  it("rewrites category distribution department charts for HR", () => {
    expect(
      buildBreakdownInsightLine({
        chartTitle: "Category distribution · department",
        chartType: "donut",
        leaderName: "IT",
        domain: "hr",
      })
    ).toBe("IT is the largest department by employee count.");
  });

  it("adds severity context for ordinal share leaders", () => {
    expect(
      buildBreakdownInsightLine({
        chartTitle: "downtime minutes share by severity",
        chartType: "donut",
        leaderName: "High",
        domain: "operations",
      })
    ).toBe("High-severity incidents contribute the largest share of downtime minutes.");
  });

  it("adds priority context for ordinal share leaders", () => {
    expect(
      buildBreakdownInsightLine({
        chartTitle: "downtime minutes share by priority",
        chartType: "donut",
        leaderName: "High",
        domain: "operations",
      })
    ).toBe("High-priority incidents contribute the largest share of downtime minutes.");
  });

  it("capitalizes metric names at sentence start in trends", () => {
    expect(
      buildTrendInsightLine(
        {
          title: "bonus trend (monthly)",
          chartType: "line",
          labels: ["Jan", "Feb", "Mar", "Apr", "May"],
          values: [10, 12, 11, 13, 14],
        },
        0.15
      )
    ).toBe("Bonus appears to be improving.");
  });

  it("uses softer upward trend copy for small bucket counts", () => {
    expect(
      buildTrendInsightLine(
        {
          title: "sales trend (monthly)",
          chartType: "line",
          labels: ["Jan", "Feb", "Mar", "Apr", "May"],
          values: [100, 105, 110, 115, 120],
        },
        0.12
      )
    ).toBe("Sales appears to be improving.");
  });

  it("synthesizes grounded business-impact line for banking", () => {
    const banking = DOMAIN_PAYLOADS.find(
      (p) => p.domain === "banking_financial_services"
    )!;
    const bullets = bulletsFor(banking);
    expect(
      bullets.some((b) => /loan balance is concentrated in the/i.test(b))
    ).toBe(true);
  });

  it("selectOverviewAiSummaryInsights dedupes leader and concentration on same finding", () => {
    const out = selectOverviewAiSummaryInsights(
      [
      {
        text: "Electronics is the leading product category by sales amount.",
        score: 90,
        kind: "leader",
        entity: "electronics",
        metricKey: "sales amount",
        dimensionKey: "product category",
        topicKey: "leader|electronics|sales amount|product category",
      },
      {
        text: "Electronics accounts for about 54% of total sales amount in this breakdown.",
        score: 80,
        kind: "concentration",
        entity: "electronics",
        metricKey: "sales amount",
        dimensionKey: "product category",
        topicKey: "concentration|electronics|sales amount|product category",
      },
      {
        text: "Total Sales is 7,849,721 across filtered rows.",
        score: 95,
        kind: "kpi",
        metricKey: "total sales",
      },
    ],
      OVERVIEW_AI_SUMMARY_MAX_BULLETS,
      "retail"
    );
    expect(out).toHaveLength(2);
    expect(out.some((b) => /total sales/i.test(b))).toBe(true);
    expect(out.some((b) => /54%/i.test(b))).toBe(false);
  });

  it("selectOverviewAiSummaryInsights limits repeated entity coverage in top slots", () => {
    const out = selectOverviewAiSummaryInsights(
      [
      { text: "Frame", score: 100, kind: "frame" },
      {
        text: "Engineering has the highest salary.",
        score: 92,
        kind: "leader",
        entity: "engineering",
        metricKey: "salary",
        dimensionKey: "department",
      },
      {
        text: "Engineering has the most training hours.",
        score: 88,
        kind: "leader",
        entity: "engineering",
        metricKey: "training hours",
        dimensionKey: "department",
      },
      {
        text: "Sales shows the highest attrition rate among departments.",
        score: 94,
        kind: "impact",
        entity: "sales",
        metricKey: "attrition",
        dimensionKey: "department",
      },
    ],
      OVERVIEW_AI_SUMMARY_MAX_BULLETS,
      "hr"
    );
    expect(out.filter((b) => /engineering/i.test(b))).toHaveLength(1);
    expect(out.some((b) => /attrition/i.test(b))).toBe(true);
  });

  it("selectOverviewAiSummaryInsights dedupes equivalent loan segment outcomes", () => {
    const out = selectOverviewAiSummaryInsights(
      [
        { text: "Banking analytics snapshot.", score: 100, kind: "frame" },
        {
          text: "Loan balance is concentrated in the Corporate segment.",
          score: 95,
          kind: "impact",
          entity: "corporate",
          outcomeKey: "loan_segment_dominance|corporate",
          topicCategory: "segments",
        },
        {
          text: "Top Customer Segment by Loan balance is Corporate in the current slice.",
          score: 70,
          kind: "kpi",
          entity: "corporate",
        },
        {
          text: "About 9% of records carry a delinquency flag — prioritize credit-score and utilization review.",
          score: 96,
          kind: "impact",
          topicCategory: "risk",
        },
      ],
      OVERVIEW_AI_SUMMARY_MAX_BULLETS,
      "banking"
    );
    expect(out.filter((b) => /corporate/i.test(b) && /loan balance/i.test(b))).toHaveLength(1);
    expect(out.some((b) => /delinquency flag/i.test(b))).toBe(true);
  });

  it("selectOverviewAiSummaryInsights keeps region coverage in top 5 for retail topic targets", () => {
    const out = selectOverviewAiSummaryInsights(
      [
        { text: "Retail analytics snapshot.", score: 100, kind: "frame" },
        { text: "Total Sales is 100 across filtered rows.", score: 101, kind: "kpi", metricKey: "sales" },
        { text: "Total Profit is 10 across filtered rows.", score: 101, kind: "kpi", metricKey: "profit" },
        {
          text: "Electronics has the highest product category sales amount share.",
          score: 110,
          kind: "leader",
          entity: "electronics",
          topicCategory: "concentration",
        },
        {
          text: "Revenue concentration is highest in the North region.",
          score: 96,
          kind: "impact",
          topicCategory: "region",
          entity: "north",
          outcomeKey: "region_activity|north",
        },
        { text: "Sales trend shows moderation.", score: 90, kind: "trend", topicCategory: "trend" },
      ],
      OVERVIEW_AI_SUMMARY_MAX_BULLETS,
      "retail"
    );
    const top = out.slice(0, OVERVIEW_AI_SUMMARY_INITIAL_VISIBLE);
    expect(top.some((b) => /north region|revenue concentration is highest in the north/i.test(b))).toBe(
      true
    );
  });

  it("selectOverviewAiSummaryInsights demotes HR demographic chart insights below business floor", () => {
    const out = selectOverviewAiSummaryInsights(
      [
        { text: "Workforce analytics snapshot.", score: 100, kind: "frame" },
        {
          text: "Sales and Support departments typically drive the highest attrition pressure in workforce slices like this.",
          score: 94,
          kind: "impact",
          topicCategory: "attrition",
        },
        {
          text: "Average Salary is 90,000 across filtered rows.",
          score: 101,
          kind: "kpi",
          metricKey: "salary",
          topicCategory: "compensation",
        },
        {
          text: "35-44 is the leading age band by age.",
          score: 35,
          kind: "leader",
          entity: "35 44",
          metricKey: "age",
          dimensionKey: "age band",
          topicCategory: "demographics",
        },
        {
          text: "Male is the leading gender by bonus.",
          score: 32,
          kind: "leader",
          entity: "male",
          metricKey: "bonus",
          dimensionKey: "gender",
          topicCategory: "demographics",
        },
      ],
      OVERVIEW_AI_SUMMARY_MAX_BULLETS,
      "hr"
    );
    expect(out.some((b) => /\bage band\b/i.test(b))).toBe(false);
    expect(out.some((b) => /\bgender\b/i.test(b))).toBe(false);
    expect(out.some((b) => /\battrition\b/i.test(b))).toBe(true);
  });
});
