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
      expect(bullets.length).toBeLessThanOrEqual(5);
      for (const line of bullets) {
        expect(line.trim().length).toBeGreaterThan(10);
        expect(/\bn\/a\b/i.test(line)).toBe(false);
      }
      const frame = bullets[0] ?? "";
      expect(frame.toLowerCase()).toContain("snapshot");
    }
  );

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
});
