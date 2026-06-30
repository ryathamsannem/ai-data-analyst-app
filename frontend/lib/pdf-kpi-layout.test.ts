import { describe, expect, it } from "vitest";
import {
  pdfKpiCardsForDashboardSection,
  PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT,
  shouldRenderPdfKpiDashboardSection,
} from "@/lib/pdf-kpi-layout";

const alignedFocusKpis = () => [
  { title: "Records analyzed", value: "1,000", subtitle: "Filtered view for this answer" },
  { title: "Metric analyzed", value: "spend amount", subtitle: "Total" },
  { title: "Breakdown dimension", value: "product type" },
  {
    title: "Visualized categories",
    value: "5",
    subtitle: "Aligned with AI appendix and chart",
  },
];

describe("pdfKpiCardsForDashboardSection", () => {
  it("excludes KPI cards already shown in the executive snapshot", () => {
    const dashboard = pdfKpiCardsForDashboardSection(alignedFocusKpis());
    expect(dashboard).toHaveLength(1);
    expect(dashboard[0]?.title).toBe("Visualized categories");
    expect(dashboard.map((c) => c.title)).not.toContain("Records analyzed");
    expect(dashboard.map((c) => c.title)).not.toContain("Metric analyzed");
    expect(dashboard.map((c) => c.title)).not.toContain("Breakdown dimension");
  });

  it("returns empty when all cards duplicate the snapshot strip", () => {
    const snapshotOnly = alignedFocusKpis().slice(0, PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT);
    expect(pdfKpiCardsForDashboardSection(snapshotOnly)).toEqual([]);
  });

  it("keeps cards beyond the executive snapshot strip", () => {
    const cards = [
      { title: "Total Rows", value: "100" },
      { title: "Total Sales", value: "1.2M" },
      { title: "Top Product", value: "Widget A", subtitle: "42,000" },
      { title: "Unique regions", value: "8" },
      { title: "Active stores", value: "42" },
    ];
    const dashboard = pdfKpiCardsForDashboardSection(cards);
    expect(dashboard.map((c) => c.title)).toEqual([
      "Unique regions",
      "Active stores",
    ]);
  });

  it("dedupes by title and value against the snapshot prefix", () => {
    const cards = [
      { title: "Records analyzed", value: "500" },
      { title: "Unique metric", value: "12%" },
      { title: "Metric analyzed", value: "revenue" },
    ];
    const dashboard = pdfKpiCardsForDashboardSection(cards, 2);
    expect(dashboard.map((c) => c.title)).toEqual(["Metric analyzed"]);
  });
});

describe("shouldRenderPdfKpiDashboardSection", () => {
  it("skips dashboard when all cards are snapshot duplicates", () => {
    const snapshotOnly = alignedFocusKpis().slice(0, PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT);
    expect(shouldRenderPdfKpiDashboardSection(snapshotOnly)).toBe(false);
  });

  it("skips dashboard when only one non-snapshot card remains", () => {
    expect(shouldRenderPdfKpiDashboardSection(alignedFocusKpis())).toBe(false);
  });

  it("renders dashboard when two or more non-snapshot cards remain", () => {
    const cards = [
      ...alignedFocusKpis().slice(0, PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT),
      { title: "Visualized categories", value: "5" },
      { title: "Top segment", value: "Credit Card" },
    ];
    expect(shouldRenderPdfKpiDashboardSection(cards)).toBe(true);
    expect(pdfKpiCardsForDashboardSection(cards)).toHaveLength(2);
  });
});
